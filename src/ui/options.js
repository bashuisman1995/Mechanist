// Opties en modusschakelaars.
import { asyncMode } from "../core/elements.js";
import { model, ui } from "../core/state.js";
import { draw } from "./draw.js";
import { syncDynInputs } from "./inspector.js";
import { save } from "./persist.js";
import { renderSeries } from "./picker.js";
import { toT0 } from "./playback.js";
import { drawPlot, xSel } from "./plot.js";
import { changed } from "./solver.js";

// De knoppen Kinematisch / Dynamisch / Evenwicht. "Evenwicht" is dynamisch
// rekenen waarbij de duur volgt uit het moment dat alles stil ligt.
export function setModeUI(m) {
  model.mode = m;
  syncModeSeg();
}
function syncModeSeg() {
  const v = model.mode === "frf" ? "frf" : model.mode !== "dyn" ? "kin" : model.durMode === "equil" ? "equil" : "dyn";
  document.querySelectorAll("#modeSeg button").forEach(x =>
    x.setAttribute("aria-pressed", String(x.dataset.v === v)));
  document.getElementById("dynSect").hidden = !asyncMode();
  document.querySelectorAll("#dynSect .dynonly").forEach(el => { el.hidden = model.mode === "frf"; });
  document.getElementById("frfSect").hidden = model.mode !== "frf";
  document.querySelector(".drawer-head label[for=xSel]").hidden = model.mode === "frf";
  xSel.hidden = model.mode === "frf";
  syncDynInputs();
}
function setMode(v) {
  toT0();
  if (v === "kin") model.mode = "kin";
  else if (v === "frf") model.mode = "frf";
  else { model.mode = "dyn"; model.durMode = v === "equil" ? "equil" : "fixed"; }
  syncModeSeg();
  ui.frame = 0; changed();
}
const bindOpt = (id, key, min, fn) => {
  const el = document.getElementById(id);
  el.addEventListener("change", () => {
    const v = parseFloat(el.value);
    if (isFinite(v) && v >= min) { toT0(); model[key] = fn ? fn(v) : v; ui.frame = 0; changed(); }
    else el.value = model[key];
  });
};

export function initOptions() {

  /* ============================================================
     Grid controls / theme
     ============================================================ */
  document.getElementById("dragSeg").addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    model.rigidDrag = b.dataset.v === "rigid";
    document.querySelectorAll("#dragSeg button").forEach(x =>
      x.setAttribute("aria-pressed", String((x.dataset.v === "rigid") === model.rigidDrag)));
    save();
  });
  document.getElementById("snapChk").addEventListener("change", e => { model.snap = e.target.checked; save(); });
  document.getElementById("gravChk").addEventListener("change", e => { toT0(); model.gravity = e.target.checked; changed(); });
  document.getElementById("fChk").addEventListener("change", e => { model.showForces = e.target.checked; draw(); save(); });

  document.getElementById("modeSeg").addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    setMode(b.dataset.v);
  });
  document.getElementById("autoChk").addEventListener("change", e => {
    toT0(); model.autoSolve = e.target.checked; changed();
  });
  document.getElementById("durMode").addEventListener("change", e => {
    toT0(); model.durMode = e.target.value;
    syncModeSeg();
    ui.frame = 0; changed();
  });
  document.getElementById("jdChk").addEventListener("change", e => {
    toT0(); model.jointDamp = e.target.checked; syncDynInputs(); changed();
  });
  bindOpt("cvInp", "cVisc", 0);
  bindOpt("frfMinInp", "frfMin", 0);
  bindOpt("fvsInp", "fricVs", 0.001);
  bindOpt("fveInp", "fricVe", 0.001);
  bindOpt("frfMaxInp", "frfMax", 0);
  document.getElementById("frfIn").addEventListener("change", e => { toT0(); model.frfIn = e.target.value; changed(); });
  bindOpt("cjInp", "cJoint", 0);
  bindOpt("durInp", "simDur", 0.05);
  bindOpt("maxInp", "maxT", 0.2);
  bindOpt("dtInp", "dtStep", 0.001);
  bindOpt("mInp", "defMass", 0.001);
  document.getElementById("gridInp").addEventListener("input", e => {
    const v = parseFloat(e.target.value);
    if (isFinite(v) && v > 0) { model.grid = v; draw(); save(); }
  });

  document.getElementById("themeBtn").addEventListener("click", () => {
    const r = document.documentElement;
    const cur = r.getAttribute("data-theme");
    const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = cur ? (cur === "dark" ? "light" : "dark") : (sysDark ? "light" : "dark");
    r.setAttribute("data-theme", next);
    ui.colorsDirty = true;
    draw(); renderSeries(); drawPlot();
  });
}
