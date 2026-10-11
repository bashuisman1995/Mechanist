// Tekenen van het mechanisme op het canvas.
import { dist, drivers, gapPen, isBar, N } from "../core/elements.js";
import { model, sim, ui, view } from "../core/state.js";
import { fmt } from "./format.js";
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

export function draw() {
  if (!ui.W) return;
  readColors();
  ctx.clearRect(0, 0, ui.W, ui.H);
  ctx.fillStyle = ui.C.ground; ctx.fillRect(0, 0, ui.W, ui.H);
  drawGrid();
  drawTraces();

  // order: force elements behind bars, joints on top
  for (const e of model.elems) if (e.type === "spring") drawSpring(e);
  for (const e of model.elems) if (e.type === "damper") drawDamper(e);
  for (const e of model.elems) if (e.type === "gap") drawGap(e);
  for (const e of model.elems) if (e.type === "link" && !e.driver) drawLink(e);
  for (const e of model.elems) if (e.type === "link" && e.driver) drawLink(e);
  for (const e of model.elems) if (e.type === "actuator") drawActuator(e);
  for (const n of model.nodes) drawSupport(n);
  for (const e of model.elems) if (e.type === "force") drawForce(e);
  for (const n of model.nodes) drawNode(n);
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
    if (e.type !== "link" && e.type !== "spring" && e.type !== "damper") continue;
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
    label(tip.x + ux * 14, tip.y + uy * 14, fmt(mag) + " N", ui.C.accent, false, 1);
  }

  for (const e of model.elems) {
    if (!isBar(e)) continue;
    const v = sim.sweep.N[e.id] ? sim.sweep.N[e.id][i] : NaN;
    if (!isFinite(v)) continue;
    const A = toScr(N(e.a)), B = toScr(N(e.b));
    label((A.x + B.x) / 2, (A.y + B.y) / 2 + 13,
      (v >= 0 ? "+" : "") + fmt(v) + " N", v >= 0 ? ui.C.spring : ui.C.force, false, 1);
  }

  for (const d of drivers()) {
    const T = sim.sweep.T[d.id] ? sim.sweep.T[d.id][i] : NaN;
    if (!isFinite(T)) continue;
    const p = toScr(N(d.a));
    label(p.x, p.y - 34, "T = " + T.toFixed(3) + " N·m", ui.C.driver, false, 1);
  }
}

function isSel(id) { return ui.sel && ui.sel.id === id; }
function isHov(id) { return ui.hover === id; }

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
  ctx.strokeStyle = col; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
  ctx.strokeStyle = ui.C.ground; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();

  if (e.driver) drawCrankArrow(A, B);

  // the length label steps aside for the force overlay
  if (!(model.showForces && sim.sweep && sim.sweep.stat)) {
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    label(mx, my - 12, fmt(e.len) + " mm", e.driver ? ui.C.driver : ui.C.ink3);
  }
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
  label((A.x + B.x) / 2, (A.y + B.y) / 2 + 20, "k = " + fmt(e.k) + " N/mm", ui.C.spring);
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
  label(tip.x + ux * 12, tip.y + uy * 12, fmt(e.mag) + " N", ui.C.force, false, 1);
}

function drawSupport(n) {
  const s = toScr(n);
  if (n.support === "pin") {
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
function label(x, y, text, color, left, pri) {
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
