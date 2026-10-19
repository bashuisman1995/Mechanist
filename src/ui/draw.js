// Tekenen van het mechanisme op het canvas.
import { frame as contactFrame, liveContact } from "../core/contact.js";
import { dTOf, isAxial, isBeam, isThermal, matOf } from "../core/axial.js";
import { dist, drivers, gapPen, isBar, N } from "../core/elements.js";
import { flexLivePhi, flexStress } from "../core/flexure.js";
import { encBars, loadcellDt, SENSORS, sensorLive } from "../core/sensors.js";
import { model, sim, ui, view } from "../core/state.js";
import { fmt, fmtForce, fmtMoment, fmtStiff } from "./format.js";
import { drawJoints, drawStiff } from "./stiffdraw.js";
import { ctx, toScr, toWld } from "./view.js";

/* ============================================================
   Drawing — engineering symbols
   ============================================================ */
function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
// kleuren alleen opnieuw uitlezen als het thema verandert, niet bij elk beeld
export function readColors() {
  if (!ui.colorsDirty) return;
  ui.colorsDirty = false; ui.colorGen++;
  ui.C = {
    ink: css("--ink"), ink2: css("--ink-2"), ink3: css("--ink-3"),
    line: css("--line"), grid: css("--grid"), gridM: css("--grid-major"),
    accent: css("--accent"), driver: css("--driver"), driverSoft: css("--driver-soft"), spring: css("--spring"),
    force: css("--force"), panel: css("--panel"), ground: css("--ground"),
    hatch: css("--hatch"), bad: css("--bad")
  };
}

// FRF: de meetfrequentie-vorm wordt alleen tijdens het tekenen aangebracht (ui.drawPre/drawPost)
export function draw() {
  if (ui.drawPre) ui.drawPre();
  try { drawNow(); } finally { if (ui.drawPost) ui.drawPost(); }
}
function drawNow() {
  if (!ui.W) return;
  readColors();
  ctx.clearRect(0, 0, ui.W, ui.H);
  ctx.fillStyle = ui.C.ground; ctx.fillRect(0, 0, ui.W, ui.H);
  drawGrid();
  drawTraces();

  // Stijfheid: de getekende (onbelaste) stand wordt vervaagd, de vervormde vorm komt erbovenop
  const fade = model.mode === "stiff" && sim.stiff && sim.stiff.ok;
  if (fade) ctx.globalAlpha = .4;
  // order: force elements behind bars, joints on top
  for (const e of model.elems) if (e.type === "spring") drawSpring(e);
  for (const e of model.elems) if (e.type === "damper") drawDamper(e);
  for (const e of model.elems) if (e.type === "gap") drawGap(e);
  for (const e of model.elems) if (e.type === "contact") drawContact(e);
  for (const e of model.elems) if (e.type === "link" && !e.driver) drawLink(e);
  for (const e of model.elems) if (e.type === "link" && e.driver) drawLink(e);
  for (const e of model.elems) if (e.type === "actuator") drawActuator(e);
  for (const e of model.elems) if (e.type === "flexure") drawFlexure(e);
  for (const e of model.elems) if (SENSORS[e.type]) drawSensor(e);
  if (fade) ctx.globalAlpha = 1;
  for (const n of model.nodes) drawSupport(n);
  for (const e of model.elems) if (e.type === "force") drawForce(e);
  for (const n of model.nodes) drawNode(n);
  drawJoints();
  if (model.mode === "stiff") drawStiff(label);
  for (const n of model.nodes) drawNodeLabel(n);
  if (model.showForces) drawLiveForces();

  if (ui.pending) drawRubber();
  flushLabels();
}

/* ---- labels ----
   Eerst verzamelen, dan tekenen op volgorde van belang (0 = puntnaam,
   1 = krachten en momenten, 2 = maten en veerwaarden, 3 = bijzaken).
   Een label dat een eerder label raakt valt weg, en hoe verder je
   uitzoomt hoe minder soorten er getekend worden. */
let LBL = [];
function labelDetail() {
  // typische schermlengte van een schakel; zonder schakels de zoomfactor
  const L = [];
  for (const e of model.elems) {
    if (e.type !== "link" && e.type !== "spring" && e.type !== "damper" && e.type !== "flexure") continue;
    const A = N(e.a), B = N(e.b);
    if (A && B) L.push(dist(A, B) * view.s);
  }
  if (!L.length) return view.s < 0.3 ? 0 : 3;
  L.sort((a, b) => a - b);
  const m = L[L.length >> 1];
  return m < 22 ? -1 : m < 45 ? 0 : m < 80 ? 1 : 3;
}
// zolang de metingenkeuze open is, blijven de puntnamen altijd leesbaar
const pickOpen = () => !document.getElementById("pick").hidden;
function flushLabels() {
  const maxPri = labelDetail();
  const placed = [];
  ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
  ctx.textBaseline = "middle";
  const list = LBL.map((l, i) => Object.assign(l, { i })).sort((a, b) => a.pri - b.pri || a.i - b.i);
  LBL = [];
  for (const l of list) {
    if (l.pri > maxPri && !(l.pri === 0 && pickOpen())) continue;
    const w = ctx.measureText(l.text).width;
    const r = { x0: l.left ? l.x - 2 : l.x - w / 2 - 3, y0: l.y - 7 };
    r.x1 = r.x0 + w + 6; r.y1 = r.y0 + 14;
    if (placed.some(q => r.x0 < q.x1 + 2 && r.x1 > q.x0 - 2 && r.y0 < q.y1 + 1 && r.y1 > q.y0 - 1)) continue;
    placed.push(r);
    ctx.textAlign = l.left ? "left" : "center";
    ctx.fillStyle = ui.C.ground;
    ctx.globalAlpha = .85;
    ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, 14);
    ctx.globalAlpha = 1;
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, l.x, l.y);
  }
}

function drawGrid() {
  const g = model.grid || 10;
  let step = g * view.s;
  let mult = 1;
  while (step < 9) { mult *= 5; step = g * mult * view.s; }
  const tl = toWld({ x: 0, y: 0 }), br = toWld({ x: ui.W, y: ui.H });
  const gx = g * mult;
  const x0 = Math.floor(tl.x / gx) * gx, x1 = Math.ceil(br.x / gx) * gx;
  const y0 = Math.floor(br.y / gx) * gx, y1 = Math.ceil(tl.y / gx) * gx;

  // alle lijnen in twee paden (dun en dik) in plaats van honderden losse streken
  ctx.lineWidth = 1;
  const minor = new Path2D(), majorP = new Path2D();
  for (let x = x0; x <= x1 + 1e-6; x += gx) {
    const s = toScr({ x, y: 0 }), X = Math.round(s.x) + .5;
    const p = Math.abs(x / (gx * 5) - Math.round(x / (gx * 5))) < 1e-6 ? majorP : minor;
    p.moveTo(X, 0); p.lineTo(X, ui.H);
  }
  for (let y = y0; y <= y1 + 1e-6; y += gx) {
    const s = toScr({ x: 0, y }), Y = Math.round(s.y) + .5;
    const p = Math.abs(y / (gx * 5) - Math.round(y / (gx * 5))) < 1e-6 ? majorP : minor;
    p.moveTo(0, Y); p.lineTo(ui.W, Y);
  }
  ctx.strokeStyle = ui.C.grid; ctx.stroke(minor);
  ctx.strokeStyle = ui.C.gridM; ctx.stroke(majorP);
  // origin cross
  const o = toScr({ x: 0, y: 0 });
  ctx.strokeStyle = ui.C.line; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(o.x - 9, o.y); ctx.lineTo(o.x + 9, o.y);
  ctx.moveTo(o.x, o.y - 9); ctx.lineTo(o.x, o.y + 9);
  ctx.stroke();
}

function drawTraces() {
  if (!sim.sweep) return;
  for (const n of model.nodes) {
    if (!n.trace) continue;
    const path = sim.sweep.pos[n.id];
    if (!path) continue;
    ctx.strokeStyle = ui.C.spring; ctx.lineWidth = 1.6;
    ctx.setLineDash([]); ctx.beginPath();
    let pen = false;
    for (let i = 0; i <= 360; i++) {
      if (!sim.sweep.ok[i]) { pen = false; continue; }
      const s = toScr(path[i]);
      if (!pen) { ctx.moveTo(s.x, s.y); pen = true; } else ctx.lineTo(s.x, s.y);
    }
    ctx.stroke();
  }
}

// Reaction vectors, bar forces and crank torques at the frame on screen.
function drawLiveForces() {
  if (!sim.sweep || !sim.sweep.stat) return;
  const i = Math.max(0, Math.min(360, Math.round(ui.frame)));
  if (!sim.sweep.ok[i]) return;
  const Rs = sim.sweep.Rmax || 1;

  for (const n of model.nodes) {
    const R = sim.sweep.R[n.id] ? sim.sweep.R[n.id][i] : null;
    if (!R) continue;
    const mag = Math.hypot(R.x, R.y);
    if (mag < Rs * 0.004) continue;
    const s = toScr(n);
    const len = 22 + 46 * (mag / Rs);
    const ux = R.x / mag, uy = -R.y / mag;
    const tip = { x: s.x + ux * len, y: s.y + uy * len };
    ctx.strokeStyle = ui.C.accent; ctx.lineWidth = 2.6; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    const px = -uy, py = ux;
    ctx.fillStyle = ui.C.accent;
    ctx.beginPath();
    ctx.moveTo(tip.x + ux * 3, tip.y + uy * 3);
    ctx.lineTo(tip.x - ux * 9 + px * 4.8, tip.y - uy * 9 + py * 4.8);
    ctx.lineTo(tip.x - ux * 9 - px * 4.8, tip.y - uy * 9 - py * 4.8);
    ctx.closePath(); ctx.fill();
    label(tip.x + ux * 14, tip.y + uy * 14, fmtForce(mag), ui.C.accent, false, 1);
  }

  for (const e of model.elems) {
    if ((!isBar(e) && !isAxial(e)) || e.type === "loadcell") continue;
    const v = sim.sweep.N[e.id] ? sim.sweep.N[e.id][i] : isAxial(e) && sim.sweep.EF && sim.sweep.EF[e.id] ? sim.sweep.EF[e.id][i] : NaN;
    if (!isFinite(v) || Math.abs(v) < 1e-6) continue;        // geen "+0 N"
    const A = toScr(N(e.a)), B = toScr(N(e.b));
    label((A.x + B.x) / 2, (A.y + B.y) / 2 + (matTagOn(e) ? 24 : 13),
      (v >= 0 ? "+" : "") + fmtForce(v), v >= 0 ? ui.C.spring : ui.C.force, false, 1);
  }

  for (const d of drivers()) {
    const T = sim.sweep.T[d.id] ? sim.sweep.T[d.id][i] : NaN;
    if (!isFinite(T)) continue;
    const p = toScr(N(d.a));
    label(p.x, p.y - 34, "T = " + fmtMoment(T), ui.C.driver, false, 1);
  }
}

function isSel(id) { return ui.sel && ui.sel.id === id; }
function isHov(id) { return ui.hover === id; }

// materiaal zichtbaar op de staaf: korte naam en tint (alleen als het ertoe doet: ΔT ≠ 0 of Stijfheid, en er is een afwijkend materiaal)
const MAT_TAG = { staal: "St", rvs: "RVS", alu: "Al", titaan: "Ti", cube: "CuBe", fbrons: "CuSn", invar: "Inv", alumina: "Al\u2082O\u2083", wc: "WC", zerodur: "Zer" };
const MAT_TINT = { alu: "#3b82c4", rvs: "#7a8a96", titaan: "#8a63c7", cube: "#c4762e", fbrons: "#b8862e", invar: "#2e9d6a", alumina: "#c4547a", wc: "#555e8a", zerodur: "#2e9da0" };
function matTagOn(e) {
  if (!isThermal(e) || e.driver) return false;
  if (model.mode !== "stiff" && !model.elems.some(x => isThermal(x) && dTOf(x) !== 0)) return false;
  return model.elems.some(x => isThermal(x) && (x.mat || "staal") !== "staal");
}
function drawLink(e) {
  const A = toScr(N(e.a)), B = toScr(N(e.b));
  const col = e.driver ? ui.C.driver : ui.C.ink;
  ctx.lineCap = "round";
  if (isSel(e.id) || isHov(e.id)) {
    ctx.strokeStyle = ui.C.accent; ctx.lineWidth = isSel(e.id) ? 11 : 9;
    ctx.globalAlpha = isSel(e.id) ? .28 : .15;
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  const ax = isAxial(e), bm = isBeam(e);
  ctx.strokeStyle = col; ctx.lineWidth = ax ? 3.4 : bm ? 4.2 : 5;          // axiale staven en balken zijn iets dunner
  ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
  ctx.strokeStyle = ui.C.ground; ctx.lineWidth = ax ? 1.1 : 1.4;
  ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();

  const tag = matTagOn(e);
  if (tag && MAT_TINT[e.mat]) {
    ctx.strokeStyle = MAT_TINT[e.mat]; ctx.lineWidth = ax ? 1.8 : 2.4;
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
  }
  if (tag) label((A.x + B.x) / 2, (A.y + B.y) / 2 + 12, MAT_TAG[matOf(e).id] || matOf(e).id, MAT_TINT[e.mat] || ui.C.ink2, false, 2);
  if (e.driver) drawCrankArrow(A, B);
  if (bm) label((A.x + B.x) / 2, (A.y + B.y) / 2 + 26, "EA\u00b7EI", ui.C.spring, false, 2);
  if (ax) {                                                       // klein "EA"-label; oranje als de tijdstap te groot is voor de stijfheid
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, bad = model.mode === "dyn" && (model.dtStep || 0.2) / 1000 > loadcellDt(e, model.defMass);
    label(mx, my + 26, "EA" + (bad ? " \u26a0 dt" : ""), bad ? ui.C.driver : ui.C.spring, false, 2);
  }

  // the length label steps aside for the force overlay
  if (!(model.showForces && sim.sweep && sim.sweep.stat)) {
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    label(mx, my - 12, fmt(e.len) + " mm", e.driver ? ui.C.driver : ui.C.ink3);
  }
}

// flexure: dun golvend blad (bladveer), gekruiste bladen (kruisveerscharnier) of een inkeping, met een draaiveer-boogje bij a;
// oranje zodra de spanning boven de toelaatbare ligt
function drawFlexure(e) {
  if (!N(e.a) || !N(e.b)) return;
  const A = toScr(N(e.a)), B = toScr(N(e.b));
  const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, px = -uy, py = ux;
  const st = flexStress(e, flexLivePhi(e, sim.sweep, Math.round(ui.frame))), warn = st.ratio > 1;
  const col = warn ? ui.C.driver : ui.C.ink2;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (isSel(e.id) || isHov(e.id)) {
    ctx.strokeStyle = ui.C.accent; ctx.lineWidth = 11; ctx.globalAlpha = isSel(e.id) ? .28 : .15;
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = col; ctx.lineWidth = warn ? 2.2 : 1.7;
  const at = (t, s) => [A.x + ux * L * t + px * s, A.y + uy * L * t + py * s];
  ctx.beginPath();
  if (e.kind === "cross") {                        // twee bladen die elkaar in het midden kruisen
    const w = Math.min(7, L * .14), a = at(.2, 0), b = at(.8, 0);
    ctx.moveTo(A.x, A.y); ctx.lineTo(a[0], a[1]);
    ctx.moveTo(...at(.2, w)); ctx.lineTo(...at(.8, -w)); ctx.moveTo(...at(.2, -w)); ctx.lineTo(...at(.8, w));
    ctx.moveTo(b[0], b[1]); ctx.lineTo(B.x, B.y);
  } else if (e.kind === "notch") {                 // stang met aan weerszijden een halfronde inkeping
    const r = Math.min(5, L * .12), w = 5.5, m1 = at(.5 - r / L, w), m2 = at(.5 + r / L, w);
    ctx.moveTo(...at(0, w)); ctx.lineTo(...m1);
    ctx.moveTo(...m2); ctx.lineTo(...at(1, w));
    ctx.moveTo(...at(0, -w)); ctx.lineTo(...at(.5 - r / L, -w)); ctx.moveTo(...at(.5 + r / L, -w)); ctx.lineTo(...at(1, -w));
    ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
    ctx.stroke(); ctx.beginPath();
    const c1 = at(.5, w), c2 = at(.5, -w), ang = Math.atan2(py, px);
    ctx.arc(c1[0], c1[1], r, ang + Math.PI, ang + 2 * Math.PI);      // inkeping naar het midden toe
    ctx.moveTo(c2[0] + Math.cos(ang) * r, c2[1] + Math.sin(ang) * r); ctx.arc(c2[0], c2[1], r, ang, ang + Math.PI);
  } else {                                         // golvend blad
    const n = Math.max(2, Math.round(L / 16)), amp = 3.4, N2 = n * 12;
    for (let k = 0; k <= N2; k++) {
      const t = k / N2, s = Math.sin(t * n * 2 * Math.PI) * amp * Math.min(1, t * 6, (1 - t) * 6), p = at(t, s);
      if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
    }
  }
  ctx.stroke();
  // draaiveer-boogje bij a
  ctx.lineWidth = 1.4; ctx.beginPath();
  const th = Math.atan2(dy, dx);
  ctx.arc(A.x, A.y, 11, th - 1.1, th + 1.1); ctx.stroke();
  label((A.x + B.x) / 2 + px * 14, (A.y + B.y) / 2 + py * 14,
    (e.kind === "cross" ? "kruisveer" : e.kind === "notch" ? "inkeping" : "bladveer") + (warn ? " \u03c3 " + fmt(st.sigma) + " MPa" : ""), col, false, 2);
}

/* ---- sensoren: compacte symbolen met een label dat live meeloopt ---- */
const GL = 34;                                        // lengte van de verbinding naar de grond bij een verplaatsingssensor (px)
const nf = v => fmt(v);
// segment (of cirkel) op het scherm waarop je een sensor aanwijst
export function sensorSeg(e) {
  const A = N(e.type === "encoder" || e.type === "accel" ? e.node : e.a); if (!A) return null;
  const s = toScr(A), t = (e.ang || 0) * Math.PI / 180, ux = Math.cos(t), uy = -Math.sin(t);
  if (e.type === "encoder") return { a: s, r: 15 };
  if (e.type === "accel") return { a: s, b: { x: s.x + ux * 28, y: s.y + uy * 28 } };
  if (e.b && N(e.b)) return { a: s, b: toScr(N(e.b)) };
  return { a: s, b: { x: s.x - ux * GL, y: s.y - uy * GL } };
}
function drawSensor(e) {
  const g = sensorSeg(e); if (!g) return;
  const live = sensorLive(e), hl = isSel(e.id) || isHov(e.id), nm = e.name || SENSORS[e.type].pre;
  let col = ui.C.ink2, txt = nm, sub = "", bad = false;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const halo = (w, f) => {
    if (!hl) return;
    ctx.strokeStyle = ui.C.accent; ctx.lineWidth = w; ctx.globalAlpha = isSel(e.id) ? .25 : .13; f(); ctx.globalAlpha = 1;
  };
  if (e.type === "encoder") {
    const bb = encBars(e), r = g.r;
    halo(10, () => { ctx.beginPath(); ctx.arc(g.a.x, g.a.y, r, 0, 6.2832); ctx.stroke(); });
    ctx.fillStyle = ui.C.panel; ctx.globalAlpha = .6; ctx.beginPath(); ctx.arc(g.a.x, g.a.y, r, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(g.a.x, g.a.y, r, 0, 6.2832); ctx.stroke();
    ctx.lineWidth = 1.1; ctx.beginPath();
    for (let k = 0; k < 12; k++) {
      const a = k * Math.PI / 6, c = Math.cos(a), s = Math.sin(a), r0 = r - (k % 3 ? 3 : 5);
      ctx.moveTo(g.a.x + c * r0, g.a.y + s * r0); ctx.lineTo(g.a.x + c * r, g.a.y + s * r);
    }
    ctx.stroke();
    if (bb) {                                          // wijzer langs de eerste schakel
      const o = N(bb.b1.a === e.node ? bb.b1.b : bb.b1.a), p = toScr(o), L = Math.hypot(p.x - g.a.x, p.y - g.a.y) || 1;
      ctx.lineWidth = 2; ctx.strokeStyle = ui.C.driver; ctx.beginPath(); ctx.moveTo(g.a.x, g.a.y);
      ctx.lineTo(g.a.x + (p.x - g.a.x) / L * (r - 2), g.a.y + (p.y - g.a.y) / L * (r - 2)); ctx.stroke();
    } else col = ui.C.ink3;
    if (live) { txt += " " + nf(live.th) + "\u00b0"; sub = "\u00b5rad " + nf(live.thu) + " \u00b7 geteld " + nf(live.thq) + "\u00b0"; }
    label(g.a.x, g.a.y + r + 13, txt, col, false, 0);
    if (sub) label(g.a.x, g.a.y + r + 27, sub, ui.C.ink3, false, 2);
    return;
  }
  const dx = g.b.x - g.a.x, dy = g.b.y - g.a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, px = -uy, py = ux;
  const at = (t, s) => [g.a.x + ux * t + px * s, g.a.y + uy * t + py * s];
  halo(e.type === "accel" ? 22 : 14, () => { ctx.beginPath(); ctx.moveTo(g.a.x, g.a.y); ctx.lineTo(g.b.x, g.b.y); ctx.stroke(); });
  ctx.strokeStyle = col; ctx.fillStyle = ui.C.panel; ctx.lineWidth = 1.8;
  if (e.type === "loadcell") {
    // twee voelers en een lichaam met een kruisje van rekstrookjes
    const bl = Math.min(L * .5, 30), w = 7.5, t0 = (L - bl) / 2;
    ctx.beginPath(); ctx.moveTo(g.a.x, g.a.y); ctx.lineTo(...at(t0, 0)); ctx.moveTo(...at(t0 + bl, 0)); ctx.lineTo(g.b.x, g.b.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(...at(t0, w)); ctx.lineTo(...at(t0 + bl, w)); ctx.lineTo(...at(t0 + bl, -w)); ctx.lineTo(...at(t0, -w)); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1.2; ctx.beginPath();
    ctx.moveTo(...at(t0 + bl * .25, w * .6)); ctx.lineTo(...at(t0 + bl * .5, -w * .6)); ctx.lineTo(...at(t0 + bl * .75, w * .6)); ctx.stroke();
    if (live) { txt += " " + nf(live.F) + " N"; sub = "\u03b4 " + nf(live.d) + " \u00b5m"; }
    const m = at(L / 2, 0);
    label(m[0] + px * 19, m[1] + py * 19, txt, col, false, 0);
    if (sub) label(m[0] + px * 33, m[1] + py * 33, sub, ui.C.ink3, false, 2);
    return;
  }
  if (e.type === "dsens") {
    const between = e.b && N(e.b), m = L / 2;
    ctx.setLineDash(between ? [4, 3] : []); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(g.a.x, g.a.y); ctx.lineTo(...at(m - 3, 0)); ctx.moveTo(...at(m + 3, 0)); ctx.lineTo(g.b.x, g.b.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.lineWidth = 2.2; ctx.beginPath();                                   // condensatorplaten
    ctx.moveTo(...at(m - 3, 8)); ctx.lineTo(...at(m - 3, -8)); ctx.moveTo(...at(m + 3, 8)); ctx.lineTo(...at(m + 3, -8)); ctx.stroke();
    if (!between) {                                                          // arcering van de grond
      ctx.lineWidth = 1.4; ctx.beginPath();
      ctx.moveTo(...at(L, 8)); ctx.lineTo(...at(L, -8));
      for (let k = -2; k <= 2; k++) { const q = at(L, k * 4); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0] + ux * 5 + px * 3, q[1] + uy * 5 + py * 3); }
      ctx.stroke();
    }
    const t = (e.ang || 0) * Math.PI / 180, ax = Math.cos(t), ay = -Math.sin(t), tip = [g.a.x + ax * 15, g.a.y + ay * 15];
    ctx.lineWidth = 1.5; ctx.strokeStyle = ui.C.driver; ctx.beginPath();                       // meetrichting
    ctx.moveTo(g.a.x + ax * 5, g.a.y + ay * 5); ctx.lineTo(tip[0], tip[1]);
    ctx.moveTo(tip[0] - ax * 5 - ay * 3, tip[1] - ay * 5 + ax * 3); ctx.lineTo(tip[0], tip[1]); ctx.lineTo(tip[0] - ax * 5 + ay * 3, tip[1] - ay * 5 - ax * 3); ctx.stroke();
    if (live) { txt += live.oor ? " buiten bereik" : " " + nf(live.x) + " \u00b5m"; bad = live.oor; sub = "\u00b1" + nf(e.range) + " \u00b5m \u00b7 res " + nf(e.res) + " \u00b5m"; }
    const q = at(m, 0);
    label(q[0] + px * 17, q[1] + py * 17, txt, bad ? ui.C.bad : col, false, 0);
    if (sub) label(q[0] + px * 31, q[1] + py * 31, sub, ui.C.ink3, false, 2);
    return;
  }
  // versnellingsopnemer: lichaampje op een steeltje, pijl in meetrichting
  const w = 8, h = 6;
  ctx.beginPath(); ctx.moveTo(g.a.x, g.a.y); ctx.lineTo(...at(12, 0)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(...at(12, w)); ctx.lineTo(...at(12 + 2 * h, w)); ctx.lineTo(...at(12 + 2 * h, -w)); ctx.lineTo(...at(12, -w)); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = ui.C.driver; ctx.lineWidth = 1.6; ctx.beginPath();
  ctx.moveTo(...at(12 + 3, 0)); ctx.lineTo(...at(12 + 2 * h + 8, 0));
  ctx.moveTo(...at(12 + 2 * h + 3, 3.5)); ctx.lineTo(...at(12 + 2 * h + 8, 0)); ctx.lineTo(...at(12 + 2 * h + 3, -3.5)); ctx.stroke();
  if (live) { txt += " " + nf(live.a) + " m/s\u00b2"; sub = nf(live.g) + " g \u00b7 +" + nf((e.m >= 0 ? e.m : 0.01) * 1000) + " g massa"; }
  const q = at(12 + h, 0);
  label(q[0] + px * 22, q[1] + py * 22, txt, col, false, 0);
  if (sub) label(q[0] + px * 36, q[1] + py * 36, sub, ui.C.ink3, false, 2);
}

// cilinder aan kant a, zuigerstang naar b; de cilinder is zo lang als de kortste slag toelaat
function drawActuator(e) {
  const A = toScr(N(e.a)), B = toScr(N(e.b));
  const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, px = -uy, py = ux;
  const cyl = Math.min(L - 6, Math.max(14, 0.55 * Math.min(e.min, e.max) * view.s));
  const hl = isSel(e.id) || isHov(e.id);
  ctx.lineCap = "round";
  if (hl) {
    ctx.strokeStyle = ui.C.accent; ctx.lineWidth = 16; ctx.globalAlpha = isSel(e.id) ? .25 : .13;
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); ctx.globalAlpha = 1;
  }
  // stang
  ctx.strokeStyle = ui.C.driver; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(A.x + ux * cyl, A.y + uy * cyl); ctx.lineTo(B.x, B.y); ctx.stroke();
  // cilinder
  const w = 6.5, c1 = { x: A.x + ux * cyl, y: A.y + uy * cyl };
  ctx.fillStyle = ui.C.driverSoft; ctx.strokeStyle = ui.C.driver; ctx.lineWidth = 1.8; ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(A.x + ux * 4 + px * w, A.y + uy * 4 + py * w);
  ctx.lineTo(c1.x + px * w, c1.y + py * w);
  ctx.lineTo(c1.x - px * w, c1.y - py * w);
  ctx.lineTo(A.x + ux * 4 - px * w, A.y + uy * 4 - py * w);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // zuiger
  ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(c1.x - ux * 3 + px * (w - 1.5), c1.y - uy * 3 + py * (w - 1.5));
  ctx.lineTo(c1.x - ux * 3 - px * (w - 1.5), c1.y - uy * 3 - py * (w - 1.5)); ctx.stroke();
  label((A.x + B.x) / 2 + px * 17, (A.y + B.y) / 2 + py * 17,
    fmt(Math.min(e.min, e.max)) + "\u2013" + fmt(Math.max(e.min, e.max)) + " mm \u00b7 " + fmt(e.freq) + " Hz", ui.C.driver, false, 2);
}

function drawCrankArrow(pivot, tip) {
  const r = 26;
  const a0 = Math.atan2(tip.y - pivot.y, tip.x - pivot.x);
  ctx.strokeStyle = ui.C.driver; ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, r, a0 - 1.15, a0 - 0.12);
  ctx.stroke();
  const ae = a0 - 0.12;
  const px = pivot.x + Math.cos(ae) * r, py = pivot.y + Math.sin(ae) * r;
  const tx = Math.cos(ae + Math.PI / 2), ty = Math.sin(ae + Math.PI / 2);
  ctx.fillStyle = ui.C.driver;
  ctx.beginPath();
  ctx.moveTo(px + tx * 6.5, py + ty * 6.5);
  ctx.lineTo(px - tx * 2.5 + Math.cos(ae) * 2, py - ty * 2.5 + Math.sin(ae) * 2);
  ctx.lineTo(px - tx * 2.5 - Math.cos(ae) * 5, py - ty * 2.5 - Math.sin(ae) * 5);
  ctx.closePath(); ctx.fill();
  label(pivot.x + Math.cos(a0 - .65) * (r + 13), pivot.y + Math.sin(a0 - .65) * (r + 13), "ω", ui.C.driver, true, 3);
}

function drawSpring(e) {
  const A = toScr(N(e.a)), B = toScr(N(e.b));
  const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, px = -uy, py = ux;
  const lead = Math.min(16, L * 0.22);
  const coilL = Math.max(0, L - 2 * lead);
  const nC = Math.max(4, Math.min(10, Math.round(coilL / 30))), amp = 8;
  const hl = (isSel(e.id) || isHov(e.id));
  if (hl) {
    ctx.strokeStyle = ui.C.accent; ctx.lineWidth = 8; ctx.globalAlpha = isSel(e.id) ? .25 : .13;
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = ui.C.spring; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(A.x, A.y);
  ctx.lineTo(A.x + ux * lead, A.y + uy * lead);
  for (let i = 0; i < nC; i++) {
    const t = (i + 0.5) / nC, sg = (i % 2 === 0) ? 1 : -1;
    ctx.lineTo(A.x + ux * (lead + coilL * t) + px * amp * sg,
               A.y + uy * (lead + coilL * t) + py * amp * sg);
  }
  ctx.lineTo(A.x + ux * (lead + coilL), A.y + uy * (lead + coilL));
  ctx.lineTo(B.x, B.y);
  ctx.stroke();
  label((A.x + B.x) / 2, (A.y + B.y) / 2 + 20, "k = " + fmtStiff(e.k), ui.C.spring);
}

function drawDamper(e) {
  const A = toScr(N(e.a)), B = toScr(N(e.b));
  const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, px = -uy, py = ux;
  const hl = (isSel(e.id) || isHov(e.id));
  if (hl) {
    ctx.strokeStyle = ui.C.accent; ctx.lineWidth = 8; ctx.globalAlpha = isSel(e.id) ? .25 : .13;
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); ctx.globalAlpha = 1;
  }
  const cW = Math.min(26, L * 0.4), h = 8;
  const c0 = { x: A.x + ux * (L / 2 - cW / 2), y: A.y + uy * (L / 2 - cW / 2) };
  const c1 = { x: A.x + ux * (L / 2 + cW / 2), y: A.y + uy * (L / 2 + cW / 2) };
  ctx.strokeStyle = ui.C.ink2; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
  // rods
  ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(c0.x, c0.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(B.x, B.y); ctx.lineTo(c1.x, c1.y); ctx.stroke();
  // cylinder: open on the B side
  ctx.beginPath();
  ctx.moveTo(c1.x + px * h, c1.y + py * h);
  ctx.lineTo(c0.x + px * h, c0.y + py * h);
  ctx.lineTo(c0.x - px * h, c0.y - py * h);
  ctx.lineTo(c1.x - px * h, c1.y - py * h);
  ctx.stroke();
  // piston plate
  const pp = { x: A.x + ux * (L / 2 + cW * 0.18), y: A.y + uy * (L / 2 + cW * 0.18) };
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(pp.x + px * (h - 1.4), pp.y + py * (h - 1.4));
  ctx.lineTo(pp.x - px * (h - 1.4), pp.y - py * (h - 1.4));
  ctx.stroke();
  label((A.x + B.x) / 2, (A.y + B.y) / 2 + 22, "c = " + fmt(e.c) + " Ns/mm", ui.C.ink3);
}

// huls aan kant a met twee aanslagen; de stang van b schuift er vrij tussen
function drawGap(e) {
  const A = toScr(N(e.a)), B = toScr(N(e.b));
  const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, px = -uy, py = ux;
  const lo = Math.min(e.min, e.max), hi = Math.max(e.min, e.max);
  const sleeve = Math.min(L - 4, Math.max(18, 0.45 * lo * view.s + (hi - lo) * view.s));
  const stopHi = sleeve, stopLo = Math.max(4, sleeve - (hi - lo) * view.s);
  // kop van de stang: waar b zit ten opzichte van het vrije bereik
  const Lw = L / view.s, head = Math.max(2, Math.min(sleeve + 4, stopHi - (hi - Lw) * view.s));
  const hl = isSel(e.id) || isHov(e.id), col = pen(e) ? ui.C.force : ui.C.ink2;
  function pen(e) { return gapPen(e, Lw) !== 0; }
  if (hl) {
    ctx.strokeStyle = ui.C.accent; ctx.lineWidth = 16; ctx.globalAlpha = isSel(e.id) ? .25 : .13;
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); ctx.globalAlpha = 1;
  }
  const w = 6, at = d => ({ x: A.x + ux * d, y: A.y + uy * d });
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = col; ctx.lineWidth = 1.7;
  const s0 = at(2), s1 = at(sleeve);
  ctx.beginPath();
  ctx.moveTo(s1.x + px * w, s1.y + py * w); ctx.lineTo(s0.x + px * w, s0.y + py * w);
  ctx.lineTo(s0.x - px * w, s0.y - py * w); ctx.lineTo(s1.x - px * w, s1.y - py * w);
  ctx.stroke();
  // aanslagen
  ctx.lineWidth = 1.2; ctx.setLineDash([2, 2]);
  for (const d of [stopLo, stopHi]) { const p = at(d); ctx.beginPath(); ctx.moveTo(p.x + px * w, p.y + py * w); ctx.lineTo(p.x - px * w, p.y - py * w); ctx.stroke(); }
  ctx.setLineDash([]);
  // stang met kop
  const h = at(head);
  ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(B.x, B.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(h.x + px * (w - 1.8), h.y + py * (w - 1.8)); ctx.lineTo(h.x - px * (w - 1.8), h.y - py * (w - 1.8)); ctx.stroke();
  label((A.x + B.x) / 2 + px * 17, (A.y + B.y) / 2 + py * 17,
    "speling " + fmt(lo) + "\u2013" + fmt(hi) + " mm", col, false, 2);
}

// bal op een vlak: het vlak met arcering aan de vaste kant, de bal rond het punt; rood bij slip
function drawContact(e) {
  const n = N(e.node); if (!n) return;
  const f = contactFrame(e, n), s = toScr(n), foot = toScr({ x: f.fx, y: f.fy });
  const ux = f.tx, uy = -f.ty, nx = f.nx, ny = -f.ny;        // schermrichtingen: langs het vlak, naar de bal
  const st = liveContact(e), slip = !!(st && st.slip), open = !!(st && st.open) || f.delta <= 0;
  const hl = isSel(e.id) || isHov(e.id), col = slip ? ui.C.force : open ? ui.C.ink3 : ui.C.ink2, half = 26;
  ctx.lineCap = "round";
  if (hl) {
    ctx.strokeStyle = ui.C.accent; ctx.lineWidth = 14; ctx.globalAlpha = isSel(e.id) ? .25 : .13;
    ctx.beginPath(); ctx.moveTo(foot.x - ux * half, foot.y - uy * half); ctx.lineTo(foot.x + ux * half, foot.y + uy * half); ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = col; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(foot.x - ux * half, foot.y - uy * half); ctx.lineTo(foot.x + ux * half, foot.y + uy * half); ctx.stroke();
  ctx.lineWidth = 1.1;
  for (let i = -3; i <= 3; i++) {
    const bx = foot.x + ux * i * 7, by = foot.y + uy * i * 7;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - nx * 6 - ux * 3, by - ny * 6 - uy * 3); ctx.stroke();
  }
  const r = Math.max(4, (e.R || 5) * view.s);
  ctx.fillStyle = slip ? ui.C.force : ui.C.panel; ctx.globalAlpha = slip ? .35 : 1;
  ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = col; ctx.lineWidth = 1.7;
  ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, 6.2832); ctx.stroke();
  label(foot.x - nx * 16 + ux * (half + 4), foot.y - ny * 16 + uy * (half + 4),
    "contact" + (st && !st.open ? " " + fmtForce(st.Fn) + (slip ? " slip" : " plakt") : ""), col, false, 2);
}

function drawForce(e) {
  const n = N(e.node); if (!n) return;
  const s = toScr(n);
  const th = e.ang * Math.PI / 180;
  const ux = Math.cos(th), uy = -Math.sin(th);
  const len = 56;
  const tip = { x: s.x + ux * len, y: s.y + uy * len };
  const tail = { x: s.x + ux * 9, y: s.y + uy * 9 };
  const hl = (isSel(e.id) || isHov(e.id));
  ctx.strokeStyle = ui.C.force; ctx.lineWidth = hl ? 3.4 : 2.4; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(tail.x, tail.y); ctx.stroke();
  // arrowhead points AT the node (load applied to the point)
  const pxv = -uy, pyv = ux;
  ctx.fillStyle = ui.C.force;
  ctx.beginPath();
  ctx.moveTo(tail.x - ux * 1, tail.y - uy * 1);
  ctx.lineTo(tail.x + ux * 11 + pxv * 4.6, tail.y + uy * 11 + pyv * 4.6);
  ctx.lineTo(tail.x + ux * 11 - pxv * 4.6, tail.y + uy * 11 - pyv * 4.6);
  ctx.closePath(); ctx.fill();
  label(tip.x + ux * 12, tip.y + uy * 12, fmtForce(e.mag), ui.C.force, false, 1);
}

function drawSupport(n) {
  const s = toScr(n);
  // een inklemming heeft geen scharnierdriehoek maar een wand (zie stiffdraw.js)
  if (n.support === "pin" && !(n.clamp && model.elems.some(e => isBeam(e) && (e.a === n.id || e.b === n.id)))) {
    const w = 11, h = 15;
    ctx.strokeStyle = ui.C.ink; ctx.lineWidth = 1.8; ctx.lineJoin = "round";
    ctx.fillStyle = ui.C.ground;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - w, s.y + h); ctx.lineTo(s.x + w, s.y + h);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    hatchLine(s.x - w - 3, s.y + h, s.x + w + 3, s.y + h);
  } else if (n.support === "slider") {
    const th = n.dir * Math.PI / 180;
    const ux = Math.cos(th), uy = -Math.sin(th);
    const px = -uy, py = ux;
    const R = 46, h = 9;
    // rail
    ctx.strokeStyle = ui.C.ink2; ctx.lineWidth = 1.6;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(s.x - ux * R + px * h, s.y - uy * R + py * h);
    ctx.lineTo(s.x + ux * R + px * h, s.y + uy * R + py * h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.x - ux * R - px * h, s.y - uy * R - py * h);
    ctx.lineTo(s.x + ux * R - px * h, s.y + uy * R - py * h);
    ctx.stroke();
    // hatching outside both rails
    hatchAlong(s, ux, uy, px, py, R, h + 0.5, 1);
    hatchAlong(s, ux, uy, px, py, R, -h - 0.5, -1);
    // block
    const bw = 15, bh = 8;
    ctx.fillStyle = ui.C.ground; ctx.strokeStyle = ui.C.ink; ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(s.x - ux * bw + px * bh, s.y - uy * bw + py * bh);
    ctx.lineTo(s.x + ux * bw + px * bh, s.y + uy * bw + py * bh);
    ctx.lineTo(s.x + ux * bw - px * bh, s.y + uy * bw - py * bh);
    ctx.lineTo(s.x - ux * bw - px * bh, s.y - uy * bw - py * bh);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  if (n.m > 0) {
    ctx.fillStyle = ui.C.ink2;
    ctx.beginPath(); ctx.arc(s.x, s.y, 8.5, 0, Math.PI * 2); ctx.fill();
  }
}

function hatchAlong(s, ux, uy, px, py, R, off, side) {
  ctx.strokeStyle = ui.C.hatch; ctx.lineWidth = 1;
  for (let t = -R; t <= R; t += 9) {
    const bx = s.x + ux * t + px * off, by = s.y + uy * t + py * off;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + (ux * -5 + px * side * 6), by + (uy * -5 + py * side * 6));
    ctx.stroke();
  }
}

function hatchLine(x0, y, x1, yy) {
  ctx.strokeStyle = ui.C.hatch; ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  for (let x = x0 + 2; x < x1; x += 6) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 6); ctx.stroke();
  }
}

function drawNode(n) {
  const s = toScr(n);
  const selected = isSel(n.id), hovd = isHov(n.id), pend = ui.pending === n.id;
  if (selected || hovd || pend) {
    ctx.fillStyle = ui.C.accent; ctx.globalAlpha = selected || pend ? .25 : .13;
    ctx.beginPath(); ctx.arc(s.x, s.y, 13, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = ui.C.panel;
  ctx.strokeStyle = selected || pend ? ui.C.accent : ui.C.ink;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(s.x, s.y, 5.2, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
}

function drawNodeLabel(n) {
  const s = toScr(n);
  label(s.x + 11, s.y - 11, n.name + (n.m > 0 ? "  " + fmt(n.m) + " kg" : ""), ui.C.ink2, true, 0);
}

// pri: 0 = puntnaam, 1 = kracht/moment, 2 = maat/veerwaarde, 3 = bijzaak
const ZERO_LBL = /^[+\u2212-]?0(?:[.,]0*)?\s*(?:N|mm|\u00b5m|N\u00b7mm|N\/mm|N\/\u00b5m|Nm|kg|rad|\u00b0)?$/;
function label(x, y, text, color, left, pri) {
  if (ZERO_LBL.test(String(text).trim())) return;           // nulwaarden niet op het canvas
  LBL.push({ x, y, text, color, left: !!left, pri: pri === undefined ? 2 : pri });
}

function drawRubber() {
  const n = N(ui.pending); if (!n) return;
  const s = toScr(n);
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = ui.C.accent; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(s.x, s.y, 16, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
}
