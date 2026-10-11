// Transportbalk, afspelen en framewisseling.
import { actuators, asyncMode, drivers, E, N, omega } from "../core/elements.js";
import { bounds, mobility } from "../core/kinematics.js";
import { model, sim, ui } from "../core/state.js";
import { draw } from "./draw.js";
import { fmtHz, fmtTime } from "./format.js";
import { syncInspector } from "./inspector.js";
import { syncSeriesValues } from "./picker.js";
import { drawPlot } from "./plot.js";
import { cancelJob, solveNow } from "./solver.js";
import { flash } from "./tools.js";

// k mag een gebroken beeldnummer zijn: de standen worden dan lineair
// tussen twee opgeslagen beelden geïnterpoleerd, zodat afspelen vloeiend blijft.
export function applyFrame(k) {
  if (!sim.sweep) return;
  if (sim.sweep.frf) { ui.frame = Math.max(0, Math.min(360, Math.round(k))); return; }
  const kk = Math.max(0, Math.min(360, k));
  const i = Math.round(kk);
  ui.frame = i;                       // de klok loopt door, ook over een blokkade heen
  if (!sim.sweep.ok[i]) return;
  const i0 = Math.floor(kk), i1 = Math.min(360, i0 + 1), f = kk - i0;
  const mix = f > 1e-9 && sim.sweep.ok[i0] && sim.sweep.ok[i1];
  for (const n of model.nodes) {
    const P = sim.sweep.pos[n.id];
    if (!P) continue;
    const p = mix ? P[i0] : P[i];
    if (!p) continue;
    if (mix) { n.x = p.x + (P[i1].x - p.x) * f; n.y = p.y + (P[i1].y - p.y) * f; }
    else { n.x = p.x; n.y = p.y; }
  }
  const t = mix ? sim.sweep.t[i0] + (sim.sweep.t[i1] - sim.sweep.t[i0]) * f : sim.sweep.t[i];
  for (const d of drivers())
    d.theta = ((((d.theta0 || 0) + omega(d) * t * 180 / Math.PI) % 360) + 360) % 360;
}
const fmtNow = i => sim.sweep.frf ? (ui.playing ? odsLabel() : fmtHz(sim.sweep.f[i])) : fmtTime(sim.sweep.t[i]);

/* ---- het model is alleen op t = 0 te bewerken ---- */
// FRF: stilstaand beeld is de getekende stand; alleen tijdens de animatie is het vergrendeld
export function atT0() { return !sim.sweep || (!ui.playing && (sim.sweep.frf || ui.frame === 0)); }
export function toT0() {
  if (ui.playing) togglePlay();
  if (sim.sweep && ui.frame !== 0) goto(0);
  syncLock();
}
export function lockNudge() {
  flash(sim.sweep && sim.sweep.frf ? "Pauzeer de trillingsanimatie om te bewerken."
    : "Bewerken kan alleen op t = 0. Klik op \u23EE om terug te gaan.");
  const b = document.getElementById("lockBar");
  b.classList.remove("pulse"); void b.offsetWidth; b.classList.add("pulse");
}
let lockedShown = null;
function syncLock() {
  const locked = !atT0();
  if (locked === lockedShown) return;
  lockedShown = locked;
  const bar = document.getElementById("lockBar"), frf = !!(sim.sweep && sim.sweep.frf);
  bar.querySelector("span").textContent = frf ? "Trillingsanimatie \u2014 pauzeer om te bewerken"
    : "Alleen bekijken \u2014 bewerken kan op t = 0";
  document.getElementById("lockBtn").textContent = frf ? "\u23F8 Pauzeren" : "\u23EE Naar t = 0";
  bar.hidden = !locked;
  document.getElementById("rewBtn").classList.toggle("hot", locked);
  syncInspector();
}

/* ============================================================
   Playback
   ============================================================ */
const playBtn = document.getElementById("playBtn");
const playIco = document.getElementById("playIco");
const scrub = document.getElementById("scrub");
const angOut = document.getElementById("angOut");
const speedSel = document.getElementById("speedSel");

// De afspeelkop loopt als gebroken getal door. Vroeger werd hij elk beeld
// afgerond, waardoor hij bij lage snelheid of een lange simulatie op 0 bleef staan.
let playPos = 0;
export function togglePlay() {
  if (!sim.sweep && !ui.playing) return;
  ui.playing = !ui.playing;
  playIco.setAttribute("d", ui.playing ? "M3 1.5h3.4v11H3zM7.6 1.5H11v11H7.6z" : "M3 1.5l9 5.5-9 5.5z");
  playBtn.title = ui.playing ? "Pauzeren (spatie)" : "Afspelen (spatie)";
  if (ui.playing) {
    if (sim.sweep.frf) { odsKeep = model.nodes.map(n => [n, n.x, n.y]); odsPh = 0; }
    if (sim.sweep.dyn && ui.frame >= 360) ui.frame = 0;      // aan het eind: opnieuw vanaf het begin
    playPos = ui.frame; ui.lastT = performance.now(); ui.raf = requestAnimationFrame(tick);
  } else {
    cancelAnimationFrame(ui.raf);
    if (odsKeep) { odsKeep.forEach(([n, x, y]) => { n.x = x; n.y = y; }); odsKeep = null; }
    if (sim.sweep) goto(ui.frame);                          // op een echt beeld stilstaan
  }
  syncLock();
}

// FRF-animatie: het mechanisme trilt rond het evenwicht met de vorm bij de
// gekozen frequentie, vergroot tot een goed zichtbare uitslag
let odsKeep = null, odsPh = 0;
// De uitslag is voor alle frequenties op dezelfde schaal: groot bij resonantie,
// klein ernaast. De grootste uitslag over het hele bereik wordt 7% van het model.
function odsScale(S) {
  if (S.odsSc !== undefined) return S.odsSc;
  let mx = 0;
  for (const X of S.X) if (X) for (let j = 0; j < X.re.length; j++) mx = Math.max(mx, Math.hypot(X.re[j], X.im[j]));
  const bb = bounds(), size = bb ? Math.hypot(bb.b.x - bb.a.x, bb.b.y - bb.a.y) : 100;
  return (S.odsSc = mx > 0 ? 0.07 * size / mx : 0);
}
const ODS_MAX = 5;          // Hz: sneller trillen kan een scherm niet netjes laten zien
function odsRate() {
  const f = sim.sweep.f[ui.frame], want = f * parseFloat(speedSel.value);
  return { fa: Math.min(want, ODS_MAX), slowed: want > ODS_MAX, factor: Math.min(want, ODS_MAX) / f };
}
function odsLabel() {
  const r = odsRate(), f = sim.sweep.f[ui.frame];
  if (!ui.playing) return fmtHz(f);
  const k = r.factor;
  return fmtHz(f) + " \u00b7 " + (k >= 0.995 ? "echte tijd" : k >= 0.1 ? (+k.toFixed(2)) + "\u00d7" : "1/" + Math.round(1 / k) + "\u00d7");
}
function applyOds() {
  const S = sim.sweep, X = S.X[ui.frame];
  if (!X) return;
  const sc = odsScale(S), c = Math.cos(odsPh), sn = Math.sin(odsPh);
  for (const n of model.nodes) {
    if (!S.fi.has(n.id)) continue;
    const j = S.fi.get(n.id);
    n.x = S.q0[2 * j] + sc * (X.re[2 * j] * c - X.im[2 * j] * sn);
    n.y = S.q0[2 * j + 1] + sc * (X.re[2 * j + 1] * c - X.im[2 * j + 1] * sn);
  }
}

function tick(t) {
  if (!ui.playing || !sim.sweep) return;
  if (sim.sweep.frf) {
    const dt = Math.min(0.05, (t - ui.lastT) / 1000);
    ui.lastT = t;
    odsPh += 2 * Math.PI * odsRate().fa * dt;           // echte frequentie × snelheid, zo nodig vertraagd
    const lab = odsLabel();
    if (angOut.textContent !== lab) angOut.textContent = lab;
    applyOds(); draw();
    ui.raf = requestAnimationFrame(tick);
    return;
  }
  const fps = (360 / sim.sweep.dur) * parseFloat(speedSel.value);   // beelden per seconde
  const dt = Math.min(0.05, (t - ui.lastT) / 1000);
  ui.lastT = t;
  playPos += fps * dt;
  if (playPos >= 360) {
    if (sim.sweep.dyn) { playPos = 360; goto(360); togglePlay(); return; }   // niet periodiek: stoppen
    playPos %= 360;
  }
  goto(playPos);
  ui.raf = requestAnimationFrame(tick);
}

export function goto(deg) {
  if (!sim.sweep) return;
  applyFrame(deg);
  scrub.value = Math.round(ui.frame);
  angOut.textContent = fmtNow(Math.round(ui.frame));
  const f1 = document.getElementById("ethNow");
  if (f1) { const d = E(f1.dataset.e); if (d) f1.textContent = Math.round(d.theta) + "°"; }
  ui.hoverI = null;
  syncSeriesValues();
  drawPlot();
  draw();
}

export function syncTransport() {
  const on = !!sim.sweep, busy = !!sim.job;
  playBtn.disabled = !on;
  scrub.disabled = !on;
  document.getElementById("rewBtn").disabled = !on;
  const sb = document.getElementById("solveBtn");
  sb.hidden = busy || !(ui.dynStale || (asyncMode() && !on && model.nodes.length));
  rewBtnEl.hidden = on && sim.sweep.frf;                      // in FRF bestaat geen t = 0
  scrub.setAttribute("aria-label", on && sim.sweep.frf ? "Frequentie" : "Positie in de cyclus");
  document.getElementById("stopBtn").hidden = !busy;
  document.getElementById("tprog").hidden = !busy;
  if (!on && ui.playing) togglePlay();
  const msg = document.getElementById("tmsg");
  scrub.hidden = !on; angOut.hidden = !on; speedSel.hidden = !on;
  msg.hidden = on;
  if (on) angOut.textContent = fmtNow(Math.round(ui.frame));
  else if (busy) showProgress(sim.job.p);
  else msg.textContent = sweepReason();
  syncLock();
}

const rewBtnEl = document.getElementById("rewBtn");
export function showProgress(p) {
  const msg = document.getElementById("tmsg"), bar = document.getElementById("tprog");
  if (!p) { msg.textContent = "Rekenen…"; bar.removeAttribute("value"); return; }
  if (p.phase === "frfeq") { msg.textContent = "Evenwicht zoeken… stap " + (p.it + 1); bar.value = Math.min(0.5, p.it / 20); return; }
  if (p.phase === "frf") { msg.textContent = "Frequenties doorrekenen… " + Math.round(p.f / 3.6) + " %"; bar.value = 0.5 + 0.5 * p.f / 360; return; }
  if (p.phase === "equil") {
    msg.textContent = "Evenwicht zoeken… t = " + p.t.toFixed(2) + " s";
    bar.value = model.durMode === "equil" ? 0.5 * p.t / p.maxT : p.t / p.maxT;
  } else {
    msg.textContent = "Rekenen… " + Math.round(p.f / 3.6) + " %";
    bar.value = model.durMode === "equil" ? 0.5 + 0.5 * p.f / 360 : p.f / 360;
  }
}

function sweepReason() {
  const m = mobility();
  if (!model.nodes.length) return "Leeg canvas — plaats punten en verbind ze.";
  if (ui.dynStale) return "Model gewijzigd — druk op Bereken (F5) als je klaar bent.";
  if (model.mode === "frf") return sim.frfMsg || "FRF: kies een ingang in Instellingen en druk op Bereken.";
  if (model.mode === "dyn") {
    if (m.dof < 0) return "Overbepaald met " + (-m.dof) + " — haal een schakel of oplegging weg.";
    return "Integratie liep vast — probeer een kleinere tijdstap.";
  }
  if (!drivers().length && !actuators().length)
    return "Kinematisch: nog geen aandrijving. Maak een kruk (D) of zet een actuator (A) tussen twee punten.";
  if (drivers().some(d => !N(d.a) || N(d.a).support !== "pin")) return "De kruk heeft geen vast scharnier.";
  if (m.dofDriven > 0) return "Nog " + m.dofDriven + " vrijheidsgraad" + (m.dofDriven === 1 ? "" : "en") +
    " over — voeg een schakel, oplegging of tweede kruk toe.";
  if (m.dofDriven < 0) return "Overbepaald met " + (-m.dofDriven) + " — te veel schakels of opleggingen.";
  return "In geen enkele stand samen te stellen — controleer de lengtes.";
}

export function initPlayback() {

  document.getElementById("rewBtn").addEventListener("click", toT0);
  document.getElementById("lockBtn").addEventListener("click", toT0);
  document.getElementById("solveBtn").addEventListener("click", solveNow);
  document.getElementById("stopBtn").addEventListener("click", () => { cancelJob(); ui.dynStale = true; syncTransport(); });
  playBtn.addEventListener("click", togglePlay);

  scrub.addEventListener("input", () => {
    // FRF: van frequentie wisselen terwijl de trilling doorloopt
    if (ui.playing && sim.sweep && sim.sweep.frf) { goto(parseFloat(scrub.value)); angOut.textContent = odsLabel(); return; }
    if (ui.playing) togglePlay();
    goto(parseFloat(scrub.value));
    syncLock();
  });
}
