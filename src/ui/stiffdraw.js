// Tekenen in de modus Stijfheid: vervormde vorm, spanningskleur, reacties, verbindingssymbolen.
import { N } from "../core/elements.js";
import { effectiveScale, jointFor, memberCurve, modeScale, modelKey, NSEG } from "../core/stiffness.js";
import { isBeam } from "../core/axial.js";
import { orderPath } from "../core/stiffpath.js";
import { model, sim, ui } from "../core/state.js";
import { REL_FE, fmtAngle, fmtForce, fmtHz, fmtLen, fmtMoment } from "./format.js";
import { pathIds } from "./stiffpath.js";
import { ctx, toScr } from "./view.js";

// kleurverloop voor σ/σ_toel: blauw (0) – groen – geel – rood (≥ 1)
const STOPS = [[0, [58, 110, 190]], [0.12, [38, 168, 160]], [0.32, [128, 198, 66]], [0.62, [240, 190, 40]], [1, [214, 56, 47]]];
export function stressColor(r) {
  const t = Math.max(0, Math.min(1, isFinite(r) ? r : 0));
  for (let i = 1; i < STOPS.length; i++) if (t <= STOPS[i][0]) {
    const a = STOPS[i - 1], b = STOPS[i], f = (t - a[0]) / (b[0] - a[0]);
    return "rgb(" + a[1].map((v, k) => Math.round(v + (b[1][k] - v) * f)).join(",") + ")";
  }
  return "rgb(214,56,47)";
}

// de verplaatsingsvector en vergroting die nu getoond worden
export function stiffShown(res) {
  const m = ui.stiffMode >= 0 && res.modes ? res.modes[ui.stiffMode] : null;
  return { u: m ? m.shape : res.u, mode: m, scale: (m ? modeScale() : effectiveScale(res)) * (ui.playing ? ui.stiffAmp : 1) };
}

export function drawStiff(label) {
  const res = sim.stiff;
  if (!res || res.empty || res.key !== modelKey()) return;
  if (!res.ok) { drawMechanism(res, label); return; }
  const sh = stiffShown(res), u = sh.u, sys = res.sys;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const line = (pts, col, w, dash) => {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.setLineDash(dash || []);
    ctx.beginPath();
    pts.forEach((p, i) => { const s = toScr(p); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
    ctx.stroke(); ctx.setLineDash([]);
  };
  if (ui.stiffView === "pad") {                   // het gekozen pad (verloop in de lade): halo, begin en eind
    const items = orderPath(res, pathIds());
    items.forEach((it, i) => {
      const pts = memberCurve(sys, it.rec, u, sh.scale, it.rec.kind === "beam" ? NSEG : 1, !sh.mode);
      ctx.globalAlpha = .32; line(pts, ui.C.driver, 13); ctx.globalAlpha = 1;
      const first = i === 0, last = i === items.length - 1;
      if (first || last) {
        const q = toScr(pts[(first ? it.rev : !it.rev) ? pts.length - 1 : 0]);
        ctx.fillStyle = ui.C.driver; ctx.beginPath(); ctx.arc(q.x, q.y, 5, 0, 6.2832); ctx.fill();
        label(q.x + 9, q.y - 12, first ? "s = 0" : "eind", ui.C.driver, true, 0);
      }
    });
  }
  for (const rec of res.members) {
    if (rec.kind === "contact") continue;
    const sel = ui.sel && ui.sel.id === rec.e.id;
    if (rec.kind === "beam") {
      const pts = memberCurve(sys, rec, u, sh.scale, NSEG, !sh.mode);
      if (sel) { ctx.globalAlpha = .28; line(pts, ui.C.accent, 11); ctx.globalAlpha = 1; }
      for (let k = 0; k < NSEG; k++) {
        const r = sh.mode ? 0.25 : (rec.sig[k] + rec.sig[k + 1]) / 2 / rec.allow;
        const a = toScr(pts[k]), b = toScr(pts[k + 1]);
        ctx.strokeStyle = sh.mode ? ui.C.accent : stressColor(r); ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    } else if (rec.kind === "rigid" || rec.kind === "flex") {
      line(memberCurve(sys, rec, u, sh.scale, 8, false), rec.kind === "flex" ? ui.C.ink2 : ui.C.ink3, rec.kind === "flex" ? 3 : 4);
    } else if (rec.kind === "axial") {
      const pts = memberCurve(sys, rec, u, sh.scale, 1);
      line(pts, sh.mode ? ui.C.accent : stressColor(rec.ratio), 3.4);
    } else {
      line(memberCurve(sys, rec, u, sh.scale, 1), ui.C.spring, 2, [5, 3]);
    }
  }
  // punten op hun vervormde plaats
  for (const n of model.nodes) {
    const d = res.nodes.get(n.id); if (!d) continue;
    const i = sys.nIdx.get(n.id), p = toScr({ x: n.x + sh.scale * u[3 * i], y: n.y + sh.scale * u[3 * i + 1] });
    ctx.fillStyle = ui.C.panel; ctx.strokeStyle = ui.C.driver; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(p.x, p.y, 3.6, 0, 6.2832); ctx.fill(); ctx.stroke();
  }
  if (!sh.mode) {
    // verplaatsing per punt (µm), alleen waar het zin heeft
    for (const n of model.nodes) {
      const d = res.nodes.get(n.id); if (!d) continue;
      const mag = Math.hypot(d.ux, d.uy) * 1000;
      if (!(mag > 1e-6) || mag < res.maxDisp * 1000 * 0.2) continue;
      const i = sys.nIdx.get(n.id), p = toScr({ x: n.x + sh.scale * u[3 * i], y: n.y + sh.scale * u[3 * i + 1] });
      label(p.x + 10, p.y + 16, fmtLen(mag / 1000), ui.C.driver, true, 1);
    }
    // reacties op de opleggingen
    if (model.showForces) drawReactions(res, label);
    legend(res);
  } else {
    const m = sh.mode;
    ctx.fillStyle = ui.C.ink2; ctx.font = '500 12px "IBM Plex Sans", system-ui, sans-serif'; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("Mode " + (ui.stiffMode + 1) + " · " + fmtHz(m.f), 14, 12);
  }
}

function drawReactions(res, label) {
  let mx = 0;
  for (const r of res.reactions) mx = Math.max(mx, Math.hypot(r.Rx, r.Ry));
  if (!(mx > 1e-9)) return;
  for (const r of res.reactions) {
    const mag = Math.hypot(r.Rx, r.Ry);
    if (mag < mx * 0.004) continue;
    const n = N(r.id), s = toScr(n), len = 24 + 40 * mag / mx, ux = r.Rx / mag, uy = -r.Ry / mag;
    const tip = { x: s.x + ux * len, y: s.y + uy * len };
    ctx.strokeStyle = ui.C.accent; ctx.lineWidth = 2.2; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(s.x + ux * 8, s.y + uy * 8); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    ctx.fillStyle = ui.C.accent; const px = -uy, py = ux;
    ctx.beginPath(); ctx.moveTo(tip.x + ux * 3, tip.y + uy * 3); ctx.lineTo(tip.x - ux * 8 + px * 4.4, tip.y - uy * 8 + py * 4.4); ctx.lineTo(tip.x - ux * 8 - px * 4.4, tip.y - uy * 8 - py * 4.4); ctx.closePath(); ctx.fill();
    label(tip.x + ux * 14, tip.y + uy * 14, fmtForce(mag, 3, mx * REL_FE / 1e-9) + (r.clamp && Math.abs(r.Mz / 1000) > 1e-9 * mx ? " · " + fmtMoment(r.Mz / 1000) : ""), ui.C.accent, false, 1);
  }
}

function legend(res) {
  const w = 120, x = 14, y = 12;
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  STOPS.forEach(st => g.addColorStop(st[0], "rgb(" + st[1].join(",") + ")"));
  ctx.fillStyle = g; ctx.fillRect(x, y + 14, w, 8);
  ctx.strokeStyle = ui.C.line; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + 14.5, w - 1, 7);
  ctx.fillStyle = ui.C.ink2; ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace'; ctx.textBaseline = "top";
  ctx.textAlign = "left"; ctx.fillText("0", x, y + 25);
  ctx.textAlign = "right"; ctx.fillText("σ toel.", x + w, y + 25);
  ctx.textAlign = "left"; ctx.fillText("σ / σ_toel", x, y);
}

function drawMechanism(res, label) {
  if (!res.mech) return;
  const seen = new Set();
  for (const it of res.mech.items) {
    if (seen.has(it.node)) continue; seen.add(it.node);
    const n = N(it.node); if (!n) continue;
    const s = toScr(n);
    ctx.strokeStyle = ui.C.bad; ctx.lineWidth = 2.4; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.arc(s.x, s.y, 15, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
    label(s.x, s.y - 26, it.kind === "rot" ? "draait vrij" : "beweegt vrij", ui.C.bad, false, 0);
  }
}

/* ---------- verbindingssymbolen: ■ star, ○ scharnier (de gewone punt), spiraal torsieveer, wand bij een inklemming ---------- */
export function drawJoints() {
  if (!model.elems.some(e => isBeam(e) && N(e.a) && N(e.b))) return;
  ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.setLineDash([]);
  for (const n of model.nodes) {
    const bs = model.elems.filter(e => isBeam(e) && (e.a === n.id || e.b === n.id) && N(e.a) && N(e.b));
    const sup = n.support === "pin" || n.support === "slider";
    if (!bs.length && !(sup && n.clamp)) continue;
    const j = jointFor(n), s = toScr(n);
    if (sup && n.clamp && bs.length) {                       // inklemming: wand dwars op de eerste balk, arcering aan de kant van de grond
      const e = bs[0], o = N(e.a === n.id ? e.b : e.a), so = toScr(o);
      let ux = so.x - s.x, uy = so.y - s.y; const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
      const px = -uy, py = ux, h = 15;
      ctx.strokeStyle = ui.C.ink; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(s.x + px * h, s.y + py * h); ctx.lineTo(s.x - px * h, s.y - py * h); ctx.stroke();
      ctx.strokeStyle = ui.C.hatch; ctx.lineWidth = 1.1;
      for (let t = -h; t <= h; t += 6) { ctx.beginPath(); ctx.moveTo(s.x + px * t - ux * 1.5, s.y + py * t - uy * 1.5); ctx.lineTo(s.x + px * t - ux * 8, s.y + py * t - uy * 8 + 3); ctx.stroke(); }
    }
    if (j.type === "star" && bs.length && !(sup && n.clamp)) {
      ctx.fillStyle = ui.C.ink; ctx.strokeStyle = ui.C.ground; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.rect(s.x - 4.6, s.y - 4.6, 9.2, 9.2); ctx.fill(); ctx.stroke();
    } else if (j.type === "spring") {
      ctx.strokeStyle = ui.C.spring; ctx.lineWidth = 1.7; ctx.beginPath();
      for (let a = 0; a <= 4.4 * Math.PI; a += 0.25) {
        const r = 4 + a * 1.35, x = s.x + Math.cos(a) * r, y = s.y - Math.sin(a) * r;
        if (a) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  }
}
