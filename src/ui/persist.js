// Opslaan, laden, ongedaan maken en delen.
import { model, sim, ui } from "../core/state.js";
import { markClean, setName, whenDiscarded } from "./files.js";
import { syncDynInputs } from "./inspector.js";
import { setModeUI } from "./options.js";
import { togglePlay } from "./playback.js";
import { cancelJob, changed } from "./solver.js";
import { flash, toast } from "./tools.js";
import { fit } from "./view.js";

/* ============================================================
   Persistence (per-viewer convenience only)
   ============================================================ */
export const KEY = "mechschets.r1";
export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      nodes: model.nodes, elems: model.elems, snap: model.snap, grid: model.grid,
      rigidDrag: model.rigidDrag, series: model.series, gravity: model.gravity, showForces: model.showForces, mode: model.mode,
      simDur: model.simDur, dtStep: model.dtStep, defMass: model.defMass,
      xAxis: model.xAxis, railSlim: model.railSlim, drawerOpen: model.drawerOpen,
      drawerH: model.drawerH, drawerAuto: model.drawerAuto, tab: model.tab, autoSolve: model.autoSolve,
      durMode: model.durMode, cVisc: model.cVisc, maxT: model.maxT,
      jointDamp: model.jointDamp, cJoint: model.cJoint,
      frfIn: model.frfIn, frfMin: model.frfMin, frfMax: model.frfMax, name: model.name,
      fricVs: model.fricVs, fricVe: model.fricVe, dT: model.dT, thermNode: model.thermNode,
      edited: ui.userEdited, uid: sim.uid, nameCounter: ui.nameCounter
    }));
  } catch (_) {}
}
function load(key) {
  try {
    const raw = localStorage.getItem(key || KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.nodes) || !d.nodes.length) return false;
    model.nodes = d.nodes; model.elems = d.elems || [];
    model.snap = d.snap !== false; model.grid = d.grid || 10;
    model.rigidDrag = !!d.rigidDrag;
    model.series = Array.isArray(d.series) ? d.series.filter(s => s && (s.key || s.expr)) : [];
    model.name = d.name || "Vorige sessie";
    model.gravity = !!d.gravity;
    model.showForces = d.showForces !== false;
    document.getElementById("gravChk").checked = model.gravity;
    document.getElementById("fChk").checked = model.showForces;
    model.simDur = d.simDur || 2; model.dtStep = d.dtStep || 0.2; model.defMass = d.defMass || 0.1;
    document.getElementById("durInp").value = model.simDur;
    document.getElementById("dtInp").value = model.dtStep;
    document.getElementById("mInp").value = model.defMass;
    model.xAxis = d.xAxis || "time";
    model.railSlim = !!d.railSlim;
    model.drawerOpen = d.drawerOpen !== false;
    model.drawerH = d.drawerH || 232;
    model.drawerAuto = d.drawerAuto !== false;
    model.tab = d.tab || "props";
    model.autoSolve = !!d.autoSolve;
    model.durMode = d.durMode || "fixed";
    model.cVisc = d.cVisc || 0;
    model.maxT = d.maxT || 30;
    model.jointDamp = !!d.jointDamp;
    model.cJoint = d.cJoint !== undefined ? d.cJoint : 0.05;
    model.frfIn = d.frfIn || ""; model.frfMin = d.frfMin || 0; model.frfMax = d.frfMax || 0;
    model.fricVs = d.fricVs || 5; model.fricVe = d.fricVe || 2;
    model.dT = d.dT || 0; model.thermNode = d.thermNode || "";
    setModeUI(d.mode === "dyn" || d.mode === "frf" || d.mode === "stiff" ? d.mode : "kin");
    model.stiffNode = d.stiffNode || ""; model.stiffAng = d.stiffAng !== undefined ? d.stiffAng : 90; model.stiffScale = d.stiffScale || 0;
    model.stiffPath = Array.isArray(d.stiffPath) ? d.stiffPath : []; model.stiffQ = Array.isArray(d.stiffQ) && d.stiffQ.length ? d.stiffQ : ["ux", "uy"];
    for (const e of model.elems) if (e.driver && e.theta0 === undefined) e.theta0 = e.theta || 0;
    sim.uid = d.uid || 1; ui.nameCounter = d.nameCounter || 0;
    for (const n of model.nodes) { if (n.ax === undefined) { n.ax = n.x; n.ay = n.y; } }
    document.getElementById("snapChk").checked = model.snap;
    document.getElementById("gridInp").value = model.grid;
    document.querySelectorAll("#dragSeg button").forEach(x =>
      x.setAttribute("aria-pressed", String((x.dataset.v === "rigid") === model.rigidDrag)));
    return true;
  } catch (_) { return false; }
}

/* ============================================================
   Geschiedenis, opslaan en delen
   ============================================================ */
const DOC_KEYS = ["nodes", "elems", "series", "mode", "gravity", "showForces",
                  "simDur", "dtStep", "defMass", "xAxis", "grid", "snap", "rigidDrag",
                  "autoSolve", "durMode", "cVisc", "maxT", "jointDamp", "cJoint", "frfIn", "frfMin", "frfMax", "name", "fricVs", "fricVe", "dT", "thermNode", "stiffNode", "stiffAng", "stiffScale", "stiffPath", "stiffQ"];
export function doc() {
  const o = {};
  for (const k of DOC_KEYS) o[k] = model[k];
  return o;
}
export function loadDoc(d) {
  if (!d || !Array.isArray(d.nodes)) throw new Error("geen geldig model");
  for (const k of DOC_KEYS) if (d[k] !== undefined) model[k] = d[k];
  if (!Array.isArray(d.stiffPath)) model.stiffPath = [];
  if (!Array.isArray(d.stiffQ) || !d.stiffQ.length) model.stiffQ = ["ux", "uy"];
  for (const n of model.nodes) if (n.ax === undefined) { n.ax = n.x; n.ay = n.y; }
  for (const e of model.elems) if (e.driver && e.theta0 === undefined) e.theta0 = e.theta || 0;
  model.series = (model.series || []).filter(x => x && (x.key || x.expr));
  for (const e of model.elems) {
    if (e.type !== "link" || !e.driver) continue;
    const A = model.nodes.find(n => n.id === e.a), B = model.nodes.find(n => n.id === e.b);
    if (A && B && A.support !== "pin" && B.support === "pin") { const t = e.a; e.a = e.b; e.b = t; }
  }
  sim.uid = 1; ui.nameCounter = 0;
  for (const n of model.nodes) { const m = /^n(\d+)$/.exec(n.id); if (m) sim.uid = Math.max(sim.uid, +m[1] + 1); }
  for (const e of model.elems) { const m = /^e(\d+)$/.exec(e.id); if (m) sim.uid = Math.max(sim.uid, +m[1] + 1); }
  ui.nameCounter = model.nodes.length;
  ui.sel = null; ui.pending = null; ui.frame = 0;
  setModeUI(model.mode === "dyn" || model.mode === "frf" || model.mode === "stiff" ? model.mode : "kin");
  document.getElementById("snapChk").checked = model.snap !== false;
  document.getElementById("gridInp").value = model.grid;
  document.getElementById("gravChk").checked = !!model.gravity;
  document.getElementById("fChk").checked = model.showForces !== false;
  document.getElementById("durInp").value = model.simDur;
  document.getElementById("dtInp").value = model.dtStep;
  document.getElementById("mInp").value = model.defMass;
  syncDynInputs();
  document.querySelectorAll("#dragSeg button").forEach(x =>
    x.setAttribute("aria-pressed", String((x.dataset.v === "rigid") === !!model.rigidDrag)));
}

let undoStack = [], redoStack = [], restoring = false;
export function pushHistory() {
  if (restoring) return;
  const snap = JSON.stringify(doc());
  if (snap === ui.lastSnap) return;
  if (ui.lastSnap !== null) { ui.unsaved = true; ui.userEdited = true; }
  if (ui.lastSnap !== null) {
    undoStack.push(ui.lastSnap);
    if (undoStack.length > 80) undoStack.shift();
    redoStack.length = 0;
  }
  ui.lastSnap = snap;
  syncHistoryBtns();
}
export function syncHistoryBtns() {
  document.getElementById("undoBtn").disabled = !undoStack.length;
  document.getElementById("redoBtn").disabled = !redoStack.length;
}
function restore(snap) {
  if (ui.playing) togglePlay();
  cancelJob();
  restoring = true;
  try { loadDoc(JSON.parse(snap)); ui.lastSnap = snap; changed(); }
  catch (_) { flash("Kon die stap niet herstellen."); }
  restoring = false;
  syncHistoryBtns();
}
export function undo() {
  if (!undoStack.length) return;
  redoStack.push(ui.lastSnap);
  restore(undoStack.pop());
}
export function redo() {
  if (!redoStack.length) return;
  undoStack.push(ui.lastSnap);
  restore(redoStack.pop());
}

export const b64 = {
  enc: o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))),
  dec: t => JSON.parse(decodeURIComponent(escape(atob(t))))
};

export function copyModel() {
  navigator.clipboard.writeText(JSON.stringify(doc(), null, 1)).then(
    () => toast("Model naar klembord gekopieerd."), () => flash("Kopiëren geweigerd."));
}
export function copyLink() {
  let url;
  try {
    url = location.origin + location.pathname + location.search + "#m=" + b64.enc(doc());
    location.hash = "m=" + b64.enc(doc());
  } catch (_) { flash("Model te groot voor een link."); return; }
  navigator.clipboard.writeText(url).then(
    () => toast("Deelbare link naar klembord (" + url.length + " tekens)."),
    () => toast("Link staat in de adresbalk."));
}

// de vorige sessie blijft bewaard, maar de app begint altijd schoon
export const PREV = KEY + ".vorige";
export function hasPrevSession() { try { return !!localStorage.getItem(PREV); } catch (_) { return false; } }
export function restoreSession() { whenDiscarded(doRestore); }
function doRestore() {
  if (ui.playing) togglePlay();
  cancelJob(); sim.solved = null;
  if (load(PREV)) { fit(); setName(model.name); changed(); markClean(); toast("Vorige sessie hersteld."); }
  else flash("Er is geen vorige sessie gevonden.");
}

export function initPersist() {
  document.getElementById("undoBtn").addEventListener("click", undo);
  document.getElementById("redoBtn").addEventListener("click", redo);
}
