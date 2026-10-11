// Bestanden, dialogen en slepen-en-neerzetten.
import { asyncMode, N } from "../core/elements.js";
import { relax } from "../core/kinematics.js";
import { model, sim, ui } from "../core/state.js";
import { anchorHere, reharvest, round2 } from "./edit.js";
import { b64, doc, loadDoc, redo, save, undo } from "./persist.js";
import { atT0, lockNudge, togglePlay } from "./playback.js";
import { cancelJob, changed, solveNow } from "./solver.js";
import { flash, toast } from "./tools.js";
import { fit } from "./view.js";

export function markClean() { ui.unsaved = false; }
export function setName(nm) {
  model.name = (nm || "").trim() || "Naamloos";
  document.getElementById("docName").textContent = model.name;
  document.title = model.name + " \u2014 Mechanismeschets";
}
// Vraag bij niet-opgeslagen werk wat er moet gebeuren; daarna pas verder.
// (Een eigen venster: window.confirm wordt in ingesloten pagina's soms geblokkeerd.)
const askModal = document.getElementById("askModal");
let askThen = null;
export function whenDiscarded(then) {
  if (!ui.unsaved) { then(); return; }
  askThen = then; askModal.hidden = false;
  document.getElementById("askSave").focus();
}
let afterSave = null;

const fileNameOf = nm => (String(nm || "").replace(/[\\/:*?"<>|]+/g, "").trim() || "mechanisme") + ".mech.json";
// Binnen de claude.ai-viewer mag een pagina zelf niets downloaden; daar loopt
// opslaan via de downloads-functie van de viewer (die vraagt eerst toestemming).
// Op een gewone website bestaat die niet en is het een normale download.
let dlCap = null;
function downloadModel(nm) {
  const data = { app: "mechanismeschets", versie: 1, naam: nm, opgeslagen: new Date().toISOString(), model: doc() };
  const text = JSON.stringify(data, null, 1), fname = fileNameOf(nm);
  const done = () => { markClean(); toast("Opgeslagen als " + fname + " (in je map Downloads)."); };
  if (dlCap) {
    dlCap.save({ filename: fname, data: text }).then(done, err => {
      if (err && err.code === "declined") toast("Niet opgeslagen.");
      else flash("Opslaan lukt hier niet" + (err && err.message ? ": " + err.message : "") + ".");
    });
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" })), a = document.createElement("a");
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  done();
}
const saveModal = document.getElementById("saveModal"), saveName = document.getElementById("saveName");
export function openSave() {
  saveName.value = model.name === "Naamloos" ? "" : model.name;
  saveModal.hidden = false; saveName.focus(); saveName.select();
}
function doSave() {
  const nm = saveName.value.trim() || "mechanisme";
  saveModal.hidden = true;
  setName(nm); save();
  downloadModel(nm);
  if (afterSave) { const f = afterSave; afterSave = null; f(); }
}

const fileInp = document.getElementById("fileInp");
// het bestandsvenster moet direct uit de klik komen, anders blokkeert de browser het;
// daarom hier geen vraag vooraf, maar pas bij het inlezen
export function openFile() { fileInp.value = ""; fileInp.click(); }
function readModelFile(f) {
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const d = JSON.parse(String(rd.result));
      const m = d && d.model ? d.model : d;                  // ook een los gekopieerd model mag
      if (!m || !Array.isArray(m.nodes)) throw new Error("dit is geen mechanismebestand");
      if (ui.playing) togglePlay();
      cancelJob(); sim.solved = null;
      loadDoc(m);
      setName(d.naam || m.name || f.name.replace(/(\.mech)?\.json$/i, ""));
      fit(); changed(); markClean();
      toast("Geopend: " + model.name);
    } catch (err) { flash("Kon " + f.name + " niet openen: " + err.message); }
  };
  rd.onerror = () => flash("Kon " + f.name + " niet lezen.");
  rd.readAsText(f);
}

const modal = document.getElementById("modal"), modalTa = document.getElementById("modalTa");
export function openPaste() { modalTa.value = ""; modal.hidden = false; modalTa.focus(); }

export function initFiles() {
  document.getElementById("askSave").addEventListener("click", () => {
    askModal.hidden = true; afterSave = askThen; askThen = null; openSave();
  });
  document.getElementById("askDrop").addEventListener("click", () => {
    askModal.hidden = true; const f = askThen; askThen = null; ui.unsaved = false; if (f) f();
  });
  document.getElementById("askCancel").addEventListener("click", () => { askModal.hidden = true; askThen = null; });
  // waarschuw voor het sluiten van het tabblad met werk dat nergens is opgeslagen
  window.addEventListener("beforeunload", ev => { if (ui.unsaved) { ev.preventDefault(); ev.returnValue = ""; } });
  if (window.claude && typeof window.claude.use === "function")
    window.claude.use("downloads").then(d => { dlCap = d; }, () => {});
  document.getElementById("saveOk").addEventListener("click", doSave);
  document.getElementById("saveCancel").addEventListener("click", () => { saveModal.hidden = true; afterSave = null; });
  saveName.addEventListener("keydown", ev => {
    if (ev.key === "Enter") { ev.preventDefault(); doSave(); }
    if (ev.key === "Escape") saveModal.hidden = true;
  });
  saveModal.addEventListener("click", ev => { if (ev.target === saveModal) saveModal.hidden = true; });
  fileInp.addEventListener("change", () => { const f = fileInp.files && fileInp.files[0]; if (f) whenDiscarded(() => readModelFile(f)); });
  // een bestand op het venster laten vallen opent het
  window.addEventListener("dragover", ev => {
    if (ev.dataTransfer && [].indexOf.call(ev.dataTransfer.types || [], "Files") >= 0) {
      ev.preventDefault(); document.body.classList.add("dropping");
    }
  });
  window.addEventListener("dragleave", ev => { if (!ev.relatedTarget) document.body.classList.remove("dropping"); });
  window.addEventListener("drop", ev => {
    document.body.classList.remove("dropping");
    const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (!f) return;
    ev.preventDefault();
    whenDiscarded(() => readModelFile(f));
  });
  document.getElementById("modalCancel").addEventListener("click", () => { modal.hidden = true; });
  modal.addEventListener("click", ev => { if (ev.target === modal) modal.hidden = true; });
  document.getElementById("modalOk").addEventListener("click", () => {
    const t = modalTa.value.trim();
    try {
      const d = t.charAt(0) === "{" ? JSON.parse(t) : b64.dec(t.replace(/^.*#m=/, ""));
      loadDoc(d && d.model ? d.model : d);
      setName((d && (d.naam || d.name)) || "Geplakt model");
      modal.hidden = true; fit(); changed();
      toast("Model geladen.");
    } catch (err) { flash("Kon dit niet lezen: " + err.message); }
  });

  // arrow keys nudge the selected point by one grid step
  document.addEventListener("keydown", ev => {
    if (ev.key === "F5" && asyncMode()) { ev.preventDefault(); solveNow(); return; }
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName)) return;
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && ev.key.toLowerCase() === "z") {
      ev.preventDefault(); ev.shiftKey ? redo() : undo(); return;
    }
    if (mod && ev.key.toLowerCase() === "y") { ev.preventDefault(); redo(); return; }
    if (mod && ev.key.toLowerCase() === "s") { ev.preventDefault(); openSave(); return; }
    if (mod && ev.key.toLowerCase() === "o") { ev.preventDefault(); openFile(); return; }
    if (!ui.sel || ui.sel.kind !== "node") return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[ev.key];
    if (!d) return;
    ev.preventDefault();
    if (!atT0()) { lockNudge(); return; }
    cancelJob();
    const n = N(ui.sel.id), st = (model.grid || 1) * (ev.shiftKey ? 5 : 1);
    n.x = round2(n.x + d[0] * st); n.y = round2(n.y + d[1] * st);
    anchorHere(n);
    if (model.rigidDrag) relax(new Set([n.id])); else reharvest(n.id);
    changed();
  });
}
