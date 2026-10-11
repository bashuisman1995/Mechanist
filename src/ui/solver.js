// Rekenopdrachten (sweep, dynamica, FRF) starten en afronden.
import { computeDyn } from "../core/dynamics.js";
import { asyncMode } from "../core/elements.js";
import { computeFrf } from "../core/frf.js";
import { computeSweep, mobility } from "../core/kinematics.js";
import { model, sim, ui } from "../core/state.js";
import { draw } from "./draw.js";
import { syncDof, syncDynInputs, syncInspector } from "./inspector.js";
import { narrow, setTab } from "./layout.js";
import { pushHistory, save } from "./persist.js";
import { renderSeries } from "./picker.js";
import { applyFrame, showProgress, syncTransport, togglePlay, toT0 } from "./playback.js";
import { drawPlot } from "./plot.js";
import { fit } from "./view.js";

// alles wat de dynamische uitkomst bepaalt — niet de weergave (namen, sporen)
function physSig() {
  return JSON.stringify([
    model.nodes.map(n => [n.id, n.x, n.y, n.support, n.dir, n.m, n.ax, n.ay, n.mus, n.muk, n.rj]),
    model.elems, model.gravity, model.simDur, model.dtStep, model.defMass,
    model.durMode, model.cVisc, model.maxT, model.jointDamp, model.cJoint,
    model.mode, model.frfIn, model.frfMin, model.frfMax, model.fricVs, model.fricVe
  ], (k, v) => k === "theta" ? undefined : v);
}

function refreshAfterSolve() {
  ui.pdata = null; ui.hoverI = null;
  syncTransport();
  if (sim.sweep) applyFrame(ui.frame);
  renderSeries(); drawPlot(); syncDof(); syncInspector(); draw();
}

export function rebuild(force) {
  if (asyncMode()) {
    if (ui.playing) togglePlay();
    ui.frame = model.mode === "frf" ? ui.frame : 0; ui.pdata = null; ui.hoverI = null;
    const sig = physSig();
    if (!force && sim.solved && sim.solved.sigs.indexOf(sig) >= 0) {        // niets wezenlijks veranderd
      cancelJob(); sim.sweep = sim.solved.sweep; ui.dynStale = false;
      refreshAfterSolve(); return;
    }
    cancelJob();
    sim.sweep = null;
    if (model.mode === "dyn" && mobility().dof < 0) { ui.dynStale = false; sim.solveOK = true; }
    else if (force || model.autoSolve) { ui.dynStale = false; startDyn(); }
    else ui.dynStale = true;
    syncTransport(); renderSeries(); drawPlot();
    return;
  }
  cancelJob();
  ui.dynStale = false;
  computeSweep();
  refreshAfterSolve();
}

function startDyn() {
  const gen = model.mode === "frf" ? computeFrf() : computeDyn();
  sim.job = { gen, p: null, to: 0, sig: physSig() };
  const step = () => {
    if (!sim.job || sim.job.gen !== gen) return;
    // de rekenstap verschuift punten tijdelijk; tussen de stukjes door staat
    // het model weer precies zoals je het getekend hebt
    const keep = model.nodes.map(n => [n, n.x, n.y]);
    const t0 = performance.now();
    let r;
    try {
      do { r = gen.next(); } while (!r.done && performance.now() - t0 < 30);
    } catch (err) { console.error(err); r = { done: true, value: null }; }
    keep.forEach(([n, x, y]) => { n.x = x; n.y = y; });
    sim.simT = 0; sim.lenOv = null;
    if (!r.done) { sim.job.p = r.value; showProgress(r.value); sim.job.to = setTimeout(step, 0); return; }
    const done = sim.job; sim.job = null;
    sim.sweep = r.value || null;
    ui.frame = sim.sweep && sim.sweep.frf ? Math.min(360, ui.frame) : 0;
    if (sim.sweep && !sim.sweep.frf) applyFrame(0);
    // de getekende stand én de (geprojecteerde) stand op t = 0 horen bij deze oplossing
    sim.solved = sim.sweep ? { sigs: [done.sig, physSig()], sweep: sim.sweep } : null;
    refreshAfterSolve();
    if (ui.fitAfterSolve) { ui.fitAfterSolve = false; setTimeout(fit, 150); }
  };
  syncTransport();
  sim.job.to = setTimeout(step, 0);
}

export function cancelJob() {
  if (!sim.job) return;
  clearTimeout(sim.job.to);
  try { sim.job.gen.return(); } catch (_) {}
  sim.job = null;
}

export function solveNow() {
  if (!asyncMode()) return;
  toT0();
  rebuild(true);
}

export function changed() {
  if (ui.playing) togglePlay();
  if (!asyncMode()) ui.frame = 0;
  if (ui.sel && narrow && narrow.matches && model.tab === "meas") setTab("props");
  if (model.mode === "frf") syncDynInputs();
  rebuild(); syncDof(); syncInspector(); draw(); pushHistory(); save();
}
// alleen weergave veranderd (bijv. een spoor aan of uit): niet herberekenen
export function touched() { draw(); pushHistory(); save(); }
