// Canvas, weergave (pannen/zoomen) en passend maken.
import { bounds } from "../core/kinematics.js";
import { model, ui, view } from "../core/state.js";
import { draw } from "./draw.js";
import { drawPlot } from "./plot.js";

export const cv = document.getElementById("cv");
export const ctx = cv.getContext("2d");

export const toScr = p => ({ x: p.x * view.s + view.ox, y: -p.y * view.s + view.oy });
export const toWld = p => ({ x: (p.x - view.ox) / view.s, y: -(p.y - view.oy) / view.s });

export function resize() {
  ui.DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  const r = cv.getBoundingClientRect();
  const W0 = ui.W, H0 = ui.H;
  ui.W = Math.max(1, Math.round(r.width));
  ui.H = Math.max(1, Math.round(r.height));
  // bij groter of kleiner worden blijft het midden van het beeld op zijn plaats
  if (W0 > 1 && H0 > 1) { view.ox += (ui.W - W0) / 2; view.oy += (ui.H - H0) / 2; }
  cv.width = Math.round(ui.W * ui.DPR);
  cv.height = Math.round(ui.H * ui.DPR);
  ctx.setTransform(ui.DPR, 0, 0, ui.DPR, 0, 0);
  draw();
  if (typeof drawPlot === "function") drawPlot();
}

export function fit() {
  const bb = bounds();
  if (!bb) { view.s = 2.2; view.ox = ui.W / 2; view.oy = ui.H / 2; draw(); return; }
  const w = Math.max(bb.b.x - bb.a.x, 40), h = Math.max(bb.b.y - bb.a.y, 40);
  // het canvas is al het zichtbare deel: de transportbalk, de lade en de uitleg liggen er niet overheen.
  // Alleen ruimte voor de zoomknoppen (rechts) en de tijdelijke hint (boven).
  const padL = 56, padR = 100, padTop = 52, padBot = 36;
  view.s = Math.min((ui.W - padL - padR) / w, (ui.H - padTop - padBot) / h);
  view.s = Math.max(0.15, Math.min(view.s, 14));
  const cx = (bb.a.x + bb.b.x) / 2, cy = (bb.a.y + bb.b.y) / 2;
  view.ox = padL + (ui.W - padL - padR) / 2 - cx * view.s;
  view.oy = padTop + (ui.H - padTop - padBot) / 2 + cy * view.s;
  draw();
}

// Maak het mechanisme passend binnen een deel van het canvas (schermcoördinaten),
// maar alleen als het daar nu niet al in past. Geeft terug of het beeld verschoof.
export function fitInto(l, t, r, b) {
  const bb = bounds();
  if (!bb || r - l < 60 || b - t < 60) return false;
  const pad = 36;
  const A = toScr({ x: bb.a.x, y: bb.b.y }), B = toScr({ x: bb.b.x, y: bb.a.y });
  if (A.x >= l + pad / 2 && B.x <= r - pad / 2 && A.y >= t + pad / 2 && B.y <= b - pad / 2) return false;
  const w = Math.max(bb.b.x - bb.a.x, 40), h = Math.max(bb.b.y - bb.a.y, 40);
  view.s = Math.max(0.15, Math.min(view.s, (r - l - 2 * pad) / w, (b - t - 2 * pad) / h));
  const cx = (bb.a.x + bb.b.x) / 2, cy = (bb.a.y + bb.b.y) / 2;
  view.ox = (l + r) / 2 - cx * view.s;
  view.oy = (t + b) / 2 + cy * view.s;
  draw();
  return true;
}

export function zoomAt(sx, sy, f) {
  const before = toWld({ x: sx, y: sy });
  view.s = Math.max(0.15, Math.min(view.s * f, 14));
  const after = toWld({ x: sx, y: sy });
  view.ox += (after.x - before.x) * view.s;
  view.oy -= (after.y - before.y) * view.s;
  draw();
}

export function initView() {

  document.getElementById("zin").onclick = () => zoomAt(ui.W / 2, ui.H / 2, 1.25);
  document.getElementById("zout").onclick = () => zoomAt(ui.W / 2, ui.H / 2, 1 / 1.25);
  document.getElementById("fitBtn").onclick = fit;
}
