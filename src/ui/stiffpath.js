// Stijfheid: verloop van verplaatsing, draaiing, moment en spanning langs een pad van balken (in de lade onder het canvas).
import { N } from "../core/elements.js";
import { model, sim, ui } from "../core/state.js";
import { PATH_Q, chainAll, eligibleBars, pathProfile } from "../core/stiffpath.js";
import { draw, readColors } from "./draw.js";
import { tickStr, unitFor, sg } from "./format.js";
import { save } from "./persist.js";
import { plotCv } from "./plot.js";
import { SERIES_LIGHT, serieColor } from "./theme.js";
import { flash } from "./tools.js";
import { t } from "./i18n.js";

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
export const DEFAULT_Q = ["ux", "uy"];
let hoverS = null, geom = null, lastSel = null;
const PADR = 12, HEAD = 20, AXISH = 36;

/* ---------- toestand ---------- */
export function pathIds() {
  const ok = new Set(eligibleBars(sim.stiff).map(r => r.e.id));
  return (model.stiffPath || []).filter(id => ok.has(id));
}
export function pathQs() {
  const q = (model.stiffQ || DEFAULT_Q).filter(k => PATH_Q.some(x => x.k === k));
  return PATH_Q.filter(x => q.indexOf(x.k) >= 0);
}
function setPath(ids) { model.stiffPath = ids; hoverS = null; refresh(); save(); }
export function addToPath(id) {
  if (!eligibleBars(sim.stiff).some(r => r.e.id === id)) return;
  const ids = pathIds();
  if (ids.indexOf(id) >= 0) return;
  setPath(ids.concat([id]));
}
// de selectie van een balk in de tekening zet hem (achteraan) in het pad, zolang het verloop zichtbaar is
export function pathSelect() {
  if (model.mode !== "stiff" || ui.stiffView !== "pad") { lastSel = null; return; }
  const id = ui.sel && ui.sel.kind === "elem" ? ui.sel.id : null;
  if (id === lastSel) return;
  lastSel = id;
  if (id) addToPath(id);
}

/* ---------- tekenen ---------- */
const PAL_LIGHT = { ink: "#1d2420", ink2: "#4a544e", ink3: "#7a847d", line: "#dde2de", panel: "#ffffff" };
function niceTicks(lo, hi, n) {
  const raw = (hi - lo) / n;
  if (!(raw > 0)) return { t: [lo], step: 1 };
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = ([1, 2, 2.5, 5, 10].find(m => m * mag >= raw) || 10) * mag, t = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) t.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return { t, step };
}
const interp = (pts, vals, s) => {
  let best = NaN;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (b.brk) continue;
    if (s >= a.s - 1e-9 && s <= b.s + 1e-9) {
      const va = vals[i - 1], vb = vals[i], t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
      best = isFinite(va) && isFinite(vb) ? va + (vb - va) * t : NaN;
      if (isFinite(best)) return best;
    }
  }
  return best;
};

/** Tekent het verloop op g (w × h CSS-pixels). Geeft de maten terug voor de aanwijzer. */
export function paintPath(g, w, h, d, pal, col, hov) {
  g.clearRect(0, 0, w, h);
  const msg = t => {
    g.fillStyle = pal.ink3; g.textAlign = "center"; g.textBaseline = "middle"; g.font = '400 12px "IBM Plex Sans", ui-sans-serif, sans-serif';
    const words = t.split(" "), lines = [""];
    words.forEach(x => { const cur = lines[lines.length - 1]; if (g.measureText(cur + " " + x).width > w - 24 && cur) lines.push(x); else lines[lines.length - 1] = (cur ? cur + " " : "") + x; });
    lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * 17));
    return null;
  };
  if (d.msg) return msg(d.msg);
  const prof = d.prof, pts = prof.pts;
  const series = d.qs.map((q, i) => ({ q, i, v: pts.map(p => q.get(p)) })).filter(sr => sr.v.some(isFinite));
  if (!series.length) return msg(t("sp.noval"));
  const fams = []; series.forEach(sr => { if (fams.indexOf(sr.q.fam) < 0) fams.push(sr.q.fam); });
  const subs = fams.map(fam => {
    const set = series.filter(sr => sr.q.fam === fam);
    let mx = 0; set.forEach(sr => sr.v.forEach(v => { if (isFinite(v) && Math.abs(v) > mx) mx = Math.abs(v); }));
    const U = unitFor(fam, mx);
    let lo = 0, hi = 0; set.forEach(sr => sr.v.forEach(v => { if (isFinite(v)) { lo = Math.min(lo, v / U.f); hi = Math.max(hi, v / U.f); } }));
    if (!(hi - lo > 1e-12)) { lo = -1; hi = 1; }
    const pad = (hi - lo) * 0.08; if (lo < 0) lo -= pad; if (hi > 0) hi += pad;
    return { fam, set, U, lo, hi };
  });
  const hF = Math.max(60, (h - AXISH) / subs.length), top0 = 0;
  g.font = '400 10px "IBM Plex Mono", ui-monospace, monospace';
  subs.forEach(sb => { const nt = niceTicks(sb.lo, sb.hi, hF > 110 ? 4 : 3); sb.tk = nt.t.filter(v => v >= sb.lo - 1e-9 && v <= sb.hi + 1e-9); sb.step = nt.step; sb.labs = sb.tk.map(v => tickStr(v, nt.step)); });
  let tw = 0; subs.forEach(sb => sb.labs.forEach(t => { tw = Math.max(tw, g.measureText(t).width); }));
  const PADL = Math.max(34, Math.ceil(tw) + 12), pw = Math.max(10, w - PADL - PADR), len = Math.max(prof.len, 1e-9);
  const X = s => PADL + (s / len) * pw;
  const mono = '400 10px "IBM Plex Mono", ui-monospace, monospace', sans = '400 10.5px "IBM Plex Sans", ui-sans-serif, sans-serif';
  subs.forEach((sb, f) => {
    const top = top0 + f * hF, pt = top + HEAD, ph = hF - HEAD - 8, Y = v => pt + ph - ((v - sb.lo) / (sb.hi - sb.lo)) * ph;
    sb.Y = Y;
    // kop: eenheid, dan de grootheden in hun kleur (met de waarde bij de aanwijzer)
    g.textBaseline = "middle"; g.textAlign = "left";
    let hx = PADL;
    g.font = '600 10px "IBM Plex Mono", ui-monospace, monospace'; g.fillStyle = pal.ink2;
    g.fillText("[" + sb.U.u + "]", hx, top + 9); hx += g.measureText("[" + sb.U.u + "]").width + 10;
    g.font = sans;
    sb.set.forEach(sr => {
      let nm = sr.q.name;
      if (hov !== null) { const v = interp(pts, sr.v, hov); nm = sr.q.q + " = " + (isFinite(v) ? tickStr(v / sb.U.f, Math.max(Math.abs(v / sb.U.f) * 1e-3, 1e-9)) : "–"); }
      const nw = g.measureText(nm).width;
      if (hx + 14 + nw > w - PADR - 60) { g.fillStyle = pal.ink3; g.fillText("…", hx, top + 9); return; }
      g.fillStyle = col(sr.i); g.fillRect(hx, top + 8, 9, 2.5);
      g.fillStyle = pal.ink2; g.fillText(nm, hx + 13, top + 9); hx += 13 + nw + 12;
    });
    // raster
    g.font = mono; g.strokeStyle = pal.line; g.lineWidth = 1; g.textAlign = "right";
    const drawn = [];
    sb.tk.forEach((tv, k) => {
      const y = Math.round(Y(tv)) + .5;
      g.beginPath(); g.moveTo(PADL, y); g.lineTo(PADL + pw, y); g.stroke();
      if (drawn.some(q => Math.abs(q - y) < 14)) return;
      drawn.push(y); g.fillStyle = pal.ink3; g.fillText(sb.labs[k], PADL - 6, y);
    });
    if (sb.lo < 0 && sb.hi > 0) { g.strokeStyle = pal.ink3; const y = Math.round(Y(0)) + .5; g.beginPath(); g.moveTo(PADL, y); g.lineTo(PADL + pw, y); g.stroke(); }
    g.strokeStyle = pal.line; g.strokeRect(PADL + .5, Math.round(pt) + .5, Math.round(pw) - 1, Math.round(ph));
    // grenzen tussen balken
    g.save(); g.beginPath(); g.rect(PADL, pt - 2, pw, ph + 4); g.clip();
    g.strokeStyle = pal.ink3; g.setLineDash([2, 3]);
    prof.bars.forEach(b => { if (b.s0 > 0) { const x = Math.round(X(b.s0)) + .5; g.beginPath(); g.moveTo(x, pt); g.lineTo(x, pt + ph); g.stroke(); } });
    g.setLineDash([]);
    sb.set.forEach(sr => {
      g.strokeStyle = col(sr.i); g.lineWidth = 2; g.lineJoin = "round"; g.lineCap = "round"; g.beginPath();
      let pen = false;
      pts.forEach((p, i) => {
        const v = sr.v[i];
        if (!isFinite(v)) { pen = false; return; }
        const x = X(p.s), y = Y(v / sb.U.f);
        if (!pen || p.brk) { g.moveTo(x, y); pen = true; } else g.lineTo(x, y);
      });
      g.stroke();
      // knooppunten: waar een balk begint of eindigt
      g.fillStyle = col(sr.i);
      prof.bars.forEach(b => [b.s0, b.s1].forEach(s => { const v = interp(pts, sr.v, s); if (isFinite(v)) { g.beginPath(); g.arc(X(s), Y(v / sb.U.f), 2.4, 0, 6.2832); g.fill(); } }));
    });
    g.restore();
  });
  // x-as: weg langs het pad, en de namen van de balken
  const ty = subs.length * hF + 5;
  g.font = mono; g.textBaseline = "top"; g.fillStyle = pal.ink3;
  const nx = pw > 420 ? 6 : 4, xt = niceTicks(0, len, nx);
  g.textAlign = "right"; const uw = g.measureText("s [mm]").width; g.fillText("s [mm]", w - PADR, ty);
  g.textAlign = "center";
  let lastR = -1e9;
  xt.t.forEach(v => {
    const t = tickStr(v, xt.step), tw2 = g.measureText(t).width, x = Math.max(PADL + tw2 / 2, Math.min(w - PADR - uw - 8 - tw2 / 2, X(v)));
    if (x - tw2 / 2 < lastR + 8) return;
    g.fillText(t, x, ty); lastR = x + tw2 / 2;
  });
  g.font = sans; g.fillStyle = pal.ink2;
  prof.bars.forEach(b => { const t = b.name, tw2 = g.measureText(t).width; if (tw2 < (X(b.s1) - X(b.s0)) - 6) g.fillText(t, (X(b.s0) + X(b.s1)) / 2, ty + 16); });
  // aanwijzer
  if (hov !== null && hov >= 0 && hov <= len) {
    const x = Math.round(X(hov)) + .5;
    g.strokeStyle = pal.ink2; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, HEAD - 4); g.lineTo(x, subs.length * hF); g.stroke();
    subs.forEach(sb => sb.set.forEach(sr => {
      const v = interp(pts, sr.v, hov); if (!isFinite(v)) return;
      g.fillStyle = col(sr.i); g.beginPath(); g.arc(X(hov), sb.Y(v / sb.U.f), 3.4, 0, 6.2832); g.fill();
      g.strokeStyle = pal.panel; g.lineWidth = 1.5; g.stroke();
    }));
    g.font = '600 10px "IBM Plex Mono", ui-monospace, monospace'; g.fillStyle = pal.ink; g.textAlign = "right"; g.textBaseline = "middle";
    g.fillText("s = " + tickStr(hov, Math.max(len / 400, 1e-6)) + " mm", w - PADR, 9);
  }
  return { X, PADL, pw, len };
}

function stateMessage() {
  const R = sim.stiff;
  if (!R) return t("sf.nosol");
  if (R.empty) return t("sp.m.empty");
  if (!R.ok) return t("sp.m.mech");
  if (!eligibleBars(R).length) return t("sp.m.nobars");
  if (!pathIds().length) return t("sp.m.pick");
  return "";
}
function pathData() {
  const msg = stateMessage();
  if (msg) return { msg };
  return { prof: pathProfile(sim.stiff, pathIds()), qs: pathQs() };
}

export function drawPathPlot() {
  const wrap = plotCv.parentElement, cs = getComputedStyle(wrap);
  const w = Math.floor(wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
  const h = Math.floor(wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom));
  if (!(w > 40 && h > 40)) return;
  readColors();
  const bw = Math.round(w * ui.DPR), bh = Math.round(h * ui.DPR);
  if (plotCv.width !== bw || plotCv.height !== bh) { plotCv.style.width = w + "px"; plotCv.style.height = h + "px"; plotCv.width = bw; plotCv.height = bh; }
  const g = plotCv.getContext("2d");
  g.setTransform(ui.DPR, 0, 0, ui.DPR, 0, 0);
  const pal = { ink: ui.C.ink, ink2: ui.C.ink2, ink3: ui.C.ink3, line: ui.C.line, panel: ui.C.panel };
  geom = paintPath(g, w, h, pathData(), pal, serieColor, hoverS);
}

/** Het verloop als afbeelding (lichte kleuren) voor het rekenblad. */
export function pathPlotImage(w) {
  const d = pathData();
  if (d.msg) return "";
  const nf = new Set(d.qs.map(q => q.fam)).size, h = 56 + 110 * nf;
  const cv = document.createElement("canvas"), dpr = 2;
  cv.width = w * dpr; cv.height = h * dpr;
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
  paintPath(g, w, h, d, PAL_LIGHT, i => SERIES_LIGHT[i % 6], null);
  try { return cv.toDataURL("image/png"); } catch (_) { return ""; }
}
export function pathSummaryHtml() {
  const d = pathData();
  if (d.msg) return "";
  return t("sp.summary", { p: d.prof.bars.map(b => esc(b.name)).join(" → "), len: sg(d.prof.len, 4) });
}

/* ---------- bediening in de rechterkolom van de lade ---------- */
export function renderPathCtl() {
  const el = document.getElementById("pathCtl"); if (!el) return;
  const on = model.mode === "stiff" && ui.stiffView === "pad" && sim.stiff && sim.stiff.ok;
  el.hidden = !on;
  if (!on) return;
  const bars = eligibleBars(sim.stiff), ids = pathIds(), qs = pathQs().map(q => q.k);
  const nm = r => (N(r.a) ? N(r.a).name : "?") + (N(r.b) ? N(r.b).name : "?");
  let h = '<h3>' + t("sp.path") + ' <span class="pc-sub">' + t("sp.pathsub") + '</span></h3><div class="pc-chips" id="pcBars">' +
    bars.map(r => { const k = ids.indexOf(r.e.id); return '<button type="button" class="chip" data-id="' + r.e.id + '" aria-pressed="' + (k >= 0) + '" title="' + t(r.kind === "beam" ? "sp.beam" : "sp.axial") + ' ' + nm(r) + '">' + esc(nm(r)) + (k >= 0 ? "<sup>" + (k + 1) + "</sup>" : "") + "</button>"; }).join("") + "</div>" +
    '<div class="pc-acts"><button type="button" class="btn" data-a="all">' + t("sp.all") + '</button><button type="button" class="btn" data-a="rev" title="' + t("sp.rev.tip") + '">' + t("sp.rev") + '</button><button type="button" class="btn ghost" data-a="clear">' + t("sp.clear") + '</button><button type="button" class="btn ghost" data-a="csv" title="' + t("sp.csv.tip") + '">CSV</button></div>' +
    '<h3>' + t("sp.quantity") + '</h3><div class="pc-chips" id="pcQ">' + PATH_Q.map(q => '<button type="button" class="chip" data-q="' + q.k + '" aria-pressed="' + (qs.indexOf(q.k) >= 0) + '" title="' + q.name + '">' + q.q + "</button>").join("") + "</div>";
  const prof = ids.length ? pathProfile(sim.stiff, ids) : null;
  if (prof) {
    h += '<p class="pc-note">' + t("sp.len") + " <b>" + sg(prof.len, 4) + " mm</b>.</p>";
    const gaps = prof.bars.filter(b => b.gap);
    if (gaps.length) h += '<p class="pc-note warn">' + t("sp.gap", { b: gaps.map(b => esc(b.name)).join(", ") }) + "</p>";
  }
  if (el.__h !== h) { el.__h = h; el.innerHTML = h; }
}
function refresh() { renderPathCtl(); drawPathPlot(); draw(); }

function csvText() {
  const d = pathData(); if (d.msg) return "";
  const lines = ['"s [mm]"'];
  const head = ["s [mm]"].concat(d.qs.map(q => q.name + " [" + ({ len: "mm", angle: "rad", moment: "N·m", stress: "MPa" })[q.fam] + "]"));
  lines[0] = head.map(x => '"' + x + '"').join(",");
  d.prof.pts.forEach(p => lines.push([p.s.toFixed(6)].concat(d.qs.map(q => { const v = q.get(p); return isFinite(v) ? v.toPrecision(7) : ""; })).join(",")));
  return lines.join("\n");
}

export function initStiffPath() {
  const ctl = document.getElementById("pathCtl");
  ctl.addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    if (b.dataset.id) {
      const ids = pathIds(), k = ids.indexOf(b.dataset.id);
      if (k >= 0) ids.splice(k, 1); else ids.push(b.dataset.id);
      setPath(ids);
    } else if (b.dataset.q) {
      const cur = pathQs().map(q => q.k), k = cur.indexOf(b.dataset.q);
      if (k >= 0) { if (cur.length > 1) cur.splice(k, 1); } else cur.push(b.dataset.q);
      model.stiffQ = PATH_Q.map(q => q.k).filter(x => cur.indexOf(x) >= 0); refresh(); save();
    } else if (b.dataset.a === "all") setPath(chainAll(sim.stiff));
    else if (b.dataset.a === "clear") setPath([]);
    else if (b.dataset.a === "rev") {
      const prof = pathProfile(sim.stiff, pathIds());
      setPath(prof.items.slice().reverse().map(it => it.rec.e.id));
    } else if (b.dataset.a === "csv") {
      const txt = csvText();
      if (!txt) { flash(t("sp.nopath")); return; }
      navigator.clipboard.writeText(txt).then(() => flash(t("sp.csvok")), () => flash(t("plot.copydenied")));
    }
  });
  plotCv.addEventListener("pointermove", ev => {
    if (model.mode !== "stiff" || !geom) return;
    const r = plotCv.getBoundingClientRect(), x = ev.clientX - r.left;
    const s = (x - geom.PADL) / geom.pw * geom.len;
    hoverS = s >= 0 && s <= geom.len ? s : null; drawPathPlot();
  });
  plotCv.addEventListener("pointerleave", () => { if (hoverS !== null) { hoverS = null; if (model.mode === "stiff") drawPathPlot(); } });
}
