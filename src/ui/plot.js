// Grafiek en gegevens voor de meetreeksen.
import { channels, chLab, chU, chVal } from "../core/channels.js";
import { drivers, E, N, omega } from "../core/elements.js";
import { alias, compile, exprUnit, normAl } from "../core/formula.js";
import { frfVal } from "../core/frf.js";
import { model, sim, ui } from "../core/state.js";
import { readColors } from "./draw.js";
import { drawer, narrow } from "./layout.js";
import { save } from "./persist.js";
import { syncSeriesValues } from "./picker.js";
import { goto, togglePlay } from "./playback.js";
import { serieColor } from "./theme.js";
import { flash } from "./tools.js";

/* ============================================================
   Metingen & grafiek
   Eén deelgrafiek per eenheid (nooit twee y-assen op elkaar),
   gedeelde x-as, crosshair met waarden, en min/max/RMS per meting.
   ============================================================ */
export const plotCv = document.getElementById("plot");
const plotCtx = plotCv.getContext("2d");
let pctx = plotCtx;          // wijst tijdens het opbouwen van de grafiek naar een buffer
export const seriesBox = document.getElementById("series");
export const xSel = document.getElementById("xSel");
export function refreshChannels() {
  sim.CH = channels().filter(c => model.mode !== "frf" || c.frf);     // FRF: alleen lineaire grootheden
  sim.CHM = new Map(sim.CH.map(c => [c.key, c]));
  sim.ALIAS = new Map(); sim.ALIASN = new Map();
  for (const c of sim.CH) if (c.al && !sim.ALIAS.has(c.al)) sim.ALIAS.set(c.al, c);
  for (const c of sim.CH) if (c.al && !sim.ALIASN.has(normAl(c.al))) sim.ALIASN.set(normAl(c.al), c);
  const opts = [{ v: "time", lab: "tijd (s)" }];
  for (const d of drivers())
    opts.push({ v: "ang|" + d.id, lab: "krukhoek " + (N(d.a) ? N(d.a).name : "") + (N(d.b) ? N(d.b).name : "") + " (°)" });
  for (const c of sim.CH) if (!c.hide) opts.push({ v: "ch|" + c.key, lab: c.lab + " (" + c.u + ")" });
  if (!opts.some(o => o.v === model.xAxis)) model.xAxis = "time";
  xSel.innerHTML = opts.map(o =>
    '<option value="' + o.v + '"' + (o.v === model.xAxis ? " selected" : "") + ">" + o.lab + "</option>").join("");
}

function xValue(i) {
  const m = model.xAxis || "time";
  if (m === "time") return sim.sweep.t[i];
  if (m.slice(0, 4) === "ang|") {
    const d = E(m.slice(4));
    if (!d) return sim.sweep.t[i];
    return ((((d.theta0 || 0) + omega(d) * sim.sweep.t[i] * 180 / Math.PI) % 360) + 360) % 360;
  }
  return chVal(sim.sweep, m.slice(3), i);
}
let xUnit = "s";
function fmtX(v) {
  if ((model.xAxis || "time") !== "time") return fmtTick(v);
  return xUnit === "ms" ? (v * 1000).toFixed(0) : v.toFixed(2);
}
export const serieLab = sr => sr.expr ? sr.expr : chLab(sr.key);

export function buildPdata() {
  ui.pdata = null;
  if (!sim.sweep || !model.series.length) return;
  if (sim.sweep.frf) return buildFrfData();
  const xs = new Float64Array(361);
  for (let i = 0; i <= 360; i++) xs[i] = sim.sweep.ok[i] ? xValue(i) : NaN;
  const ss = model.series.map((sr, si) => {
    const a = new Float64Array(361);
    let u = "", err = "", get = null;
    if (sr.expr) {
      try {
        const c = compile(sr.expr);
        u = exprUnit(c.used, sr.expr);
        get = i => c.f(nm => nm === "t" ? sim.sweep.t[i] : chVal(sim.sweep, alias(nm).key, i));
      } catch (e) { err = e.message; }
    } else { u = chU(sr.key); get = i => chVal(sim.sweep, sr.key, i); }
    let mn = Infinity, mx = -Infinity, sq = 0, n = 0;
    for (let i = 0; i <= 360; i++) {
      let v = NaN;
      if (get && sim.sweep.ok[i]) { try { v = get(i); } catch (_) { v = NaN; } }
      a[i] = v;
      if (isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; sq += v * v; n++; }
    }
    return { key: sr.key, expr: sr.expr, si, a, ok: n > 0, err,
             u: u || (sr.expr ? "\u0192" : ""),
             mn: n ? mn : NaN, mx: n ? mx : NaN, rms: n ? Math.sqrt(sq / n) : NaN };
  });
  ui.pdata = { xs, ss };
  pdataGen++;
}

// FRF: amplitude (als log10) en fase per meting; de fase wordt ontvouwen
function buildFrfData() {
  const xs = new Float64Array(361);
  for (let i = 0; i <= 360; i++) xs[i] = Math.log10(sim.sweep.f[i]);
  const ss = model.series.map((sr, si) => {
    const a = new Float64Array(361).fill(NaN), ph = new Float64Array(361).fill(NaN);
    let err = "";
    if (sr.expr) err = "formules werken niet in FRF";
    else if (!sim.CHM.get(sr.key)) err = "niet in FRF";
    let mn = Infinity, mx = -Infinity, pmn = Infinity, pmx = -Infinity, n = 0, peak = -Infinity, pk = 0, prev = null;
    if (!err) for (let i = 0; i <= 360; i++) {
      const z = sim.sweep.ok[i] ? frfVal(sim.sweep, sr.key, i) : null;
      if (!z) { prev = null; continue; }
      const m = Math.hypot(z[0], z[1]);
      if (!(m > 1e-300)) { prev = null; continue; }
      let p = Math.atan2(z[1], z[0]) * 180 / Math.PI;
      if (prev !== null) { while (p - prev > 180) p -= 360; while (p - prev < -180) p += 360; }
      prev = p;
      a[i] = Math.log10(m); ph[i] = p; n++;
      if (a[i] < mn) mn = a[i]; if (a[i] > mx) mx = a[i];
      if (p < pmn) pmn = p; if (p > pmx) pmx = p;
      if (m > peak) { peak = m; pk = i; }
    }
    return { key: sr.key, si, a, ph, ok: n > 0, err, log: true,
             u: (chU(sr.key) || "?") + "/" + sim.sweep.inUnit, mn, mx, pmn, pmx, peak, pk };
  });
  ui.pdata = { xs, ss, frf: true };
  pdataGen++;
}
// exponentiële notatie waar dat leesbaar is
function fmtPow(v) {
  const x = Math.pow(10, v);
  if (Math.abs(v - Math.round(v)) < 1e-9) {
    const r = Math.round(v);
    return r >= -2 && r <= 3 ? String(+x.toFixed(Math.max(0, -r))) : "1e" + r;
  }
  return x >= 1e4 || x < 1e-2 ? x.toExponential(1) : String(+x.toPrecision(2));
}

// Eén deelgrafiek per eenheid. Elke deelgrafiek heeft een kopregel met de
// eenheid en de namen van de metingen, zodat niets over de assen heen valt.
const PAD = { L: 46, R: 12, T: 20, B: 22 };
function xRange() {
  let lo = Infinity, hi = -Infinity;
  if (ui.pdata) for (const v of ui.pdata.xs) if (isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!(hi > lo)) { lo = 0; hi = 1; }
  return [lo, hi];
}
function measurePlot() {
  const wrap = plotCv.parentElement, cs = getComputedStyle(wrap);
  ui.plotBox = {
    w: wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
    h: wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
  };
}

export function drawPlot() {
  readColors();
  if (!ui.pdata) buildPdata();
  const live = ui.pdata ? ui.pdata.ss.filter(s => s.ok) : [];
  const units = [];
  for (const s of live) if (units.indexOf(s.u) < 0) units.push(s.u);
  // deelgrafieken: één per eenheid; bij een FRF komt daar één fasegrafiek bij
  const groups = units.map(u => ({ u, log: !!(ui.pdata && ui.pdata.frf), set: live.filter(s => s.u === u) }));
  if (ui.pdata && ui.pdata.frf && live.length)
    groups.push({ u: "fase, °", phase: true, set: live.map(s => ({ si: s.si, a: s.ph, mn: s.pmn, mx: s.pmx })) });
  const nF = Math.max(1, groups.length);

  // de lade groeit mee met het aantal deelgrafieken, tot de helft van het scherm;
  // wie de lade zelf versleept houdt zijn eigen hoogte
  if (model.drawerAuto !== false && !narrow.matches && !drawer.classList.contains("closed")) {
    const want = Math.round(Math.max(210, Math.min(window.innerHeight * 0.5, 64 + nF * 92 + PAD.B)));
    const cur = parseFloat(drawer.style.getPropertyValue("--drawerH")) || 0;
    if (Math.abs(cur - want) > 2) { drawer.style.setProperty("--drawerH", want + "px"); return; }
  }

  // de maten van het paneel komen uit de cache: opvragen na een DOM-wijziging
  // dwingt de browser elk beeld de hele indeling opnieuw te berekenen
  if (!ui.plotBox) measurePlot();
  const innerW = ui.plotBox.w, innerH = ui.plotBox.h;
  // eerlijk verdelen; pas als het echt niet past groeit het canvas en scrolt de houder
  const hF = Math.max(64, (innerH - PAD.B) / nF);
  const h = Math.max(80, Math.floor(hF * nF + PAD.B));
  const w = Math.max(1, Math.floor(innerW));
  const bw = Math.round(w * ui.DPR), bh = Math.round(h * ui.DPR);
  if (plotCv.width !== bw || plotCv.height !== bh) {       // niet elk beeld een nieuw canvas
    plotCv.style.height = h + "px"; plotCv.style.width = w + "px";
    plotCv.width = bw; plotCv.height = bh;
  }
  // Alles behalve de meetlijn en de bolletjes verandert niet tijdens het
  // afspelen: dat deel wordt één keer in een buffer getekend en daarna gekopieerd.
  const idx = Math.max(0, Math.min(360, ui.hoverI !== null ? ui.hoverI : Math.round(ui.frame)));
  const key = [pdataGen, ui.colorGen, bw, bh, live.length, sim.sweep && sim.sweep.frf].join();
  if (live.length && w >= 90 && plotCache && plotCache.key === key) { drawPlotDyn(plotCache, idx); return; }
  plotCache = null;
  pctx.setTransform(ui.DPR, 0, 0, ui.DPR, 0, 0);
  pctx.clearRect(0, 0, w, h);
  pctx.font = '400 10px "IBM Plex Mono", ui-monospace, monospace';
  pctx.fillStyle = ui.C.ink3;
  if (!live.length || w < 90) {
    pctx.textAlign = "center"; pctx.textBaseline = "middle";
    pctx.font = '400 12px "IBM Plex Sans", ui-sans-serif, sans-serif';
    pctx.fillText(sim.job ? "rekenen…" : !sim.sweep ? (ui.dynStale ? "druk op Bereken om de grafieken te vullen" : "geen oplossing")
      : "nog geen metingen \u2014 klik op Metingen\u2026", w / 2, Math.min(h, innerH) / 2);
    return;
  }

  // bereik en maatstreepjes per deelgrafiek, dan de linkermarge op de breedste waarde
  const subs = groups.map(gr => {
    const u = gr.u, set = gr.set;
    let lo = Infinity, hi = -Infinity;
    for (const s of set) { if (s.mn < lo) lo = s.mn; if (s.mx > hi) hi = s.mx; }
    const mid = (lo + hi) / 2;
    if (!(hi - lo > Math.max(1e-12, Math.abs(mid) * 1e-6))) {
      const e = Math.max(Math.abs(mid) * 0.05, 1e-9);   // constant: toon hem vlak
      lo = mid - e; hi = mid + e;
    }
    const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
    let tk = niceTicks(lo, hi, hF > 110 ? 4 : 3).filter(v => v >= lo && v <= hi);
    if (gr.phase) { const st = hi - lo > 400 ? 180 : 90; tk = []; for (let v = Math.ceil(lo / st) * st; v <= hi; v += st) tk.push(v); }
    if (gr.log) {                                   // decaden, met één tussenwaarde als het er te weinig zijn
      const dec = []; for (let v = Math.ceil(lo); v <= Math.floor(hi); v++) dec.push(v);
      if (dec.length >= 2) tk = dec.length > 5 ? dec.filter((v, i) => i % 2 === 0) : dec;
    }
    const tstep = tk.length > 1 ? tk[1] - tk[0] : (hi - lo) / 3;
    return { u, set, lo, hi, tk, log: gr.log, labs: tk.map(v => gr.log ? fmtPow(v) : fmtTick(v, tstep)) };
  });
  let tw = 0;
  for (const sb of subs) for (const t of sb.labs) tw = Math.max(tw, pctx.measureText(t).width);
  PAD.L = Math.max(34, Math.ceil(tw) + 12);

  const pw = w - PAD.L - PAD.R;
  const [xlo, xhi] = xRange();
  const X = v => PAD.L + ((v - xlo) / (xhi - xlo)) * pw;
  const buf = document.createElement("canvas");
  buf.width = bw; buf.height = bh;
  pctx = buf.getContext("2d");
  pctx.setTransform(ui.DPR, 0, 0, ui.DPR, 0, 0);
  pctx.font = '400 10px "IBM Plex Mono", ui-monospace, monospace';
  const geom = [];
  try {

  subs.forEach((sb, f) => {
    const top = f * hF, pt = top + PAD.T, ph = hF - PAD.T - 8;
    const Y = v => pt + ph - ((v - sb.lo) / (sb.hi - sb.lo)) * ph;
    geom.push({ Y, set: sb.set });

    // kopregel: eenheid, dan de metingen in hun kleur
    pctx.textBaseline = "middle"; pctx.textAlign = "left";
    let hx = PAD.L;
    pctx.font = '600 10px "IBM Plex Mono", ui-monospace, monospace';
    pctx.fillStyle = ui.C.ink2; pctx.fillText("[" + (sb.u || "\u2013") + "]", hx, top + 9);
    hx += pctx.measureText("[" + (sb.u || "\u2013") + "]").width + 10;
    pctx.font = '400 10.5px "IBM Plex Sans", ui-sans-serif, sans-serif';
    for (const s of sb.set) {
      const nm = serieLab(model.series[s.si]);
      const nw = pctx.measureText(nm).width;
      if (hx + 14 + nw > w - PAD.R) { pctx.fillStyle = ui.C.ink3; pctx.fillText("\u2026", hx, top + 9); break; }
      pctx.fillStyle = serieColor(s.si); pctx.fillRect(hx, top + 8, 9, 2.5);
      pctx.fillStyle = ui.C.ink2; pctx.fillText(nm, hx + 13, top + 9);
      hx += 13 + nw + 12;
    }

    // raster en y-as
    pctx.font = '400 10px "IBM Plex Mono", ui-monospace, monospace';
    pctx.strokeStyle = ui.C.line; pctx.lineWidth = 1;
    pctx.textAlign = "right"; pctx.textBaseline = "middle";
    sb.tk.forEach((tv, k) => {
      const y = Math.round(Y(tv)) + .5;
      pctx.beginPath(); pctx.moveTo(PAD.L, y); pctx.lineTo(PAD.L + pw, y); pctx.stroke();
      pctx.fillStyle = ui.C.ink3; pctx.fillText(sb.labs[k], PAD.L - 6, y);
    });
    if (sb.lo < 0 && sb.hi > 0) {
      pctx.strokeStyle = ui.C.ink3; pctx.lineWidth = 1;
      const y = Math.round(Y(0)) + .5;
      pctx.beginPath(); pctx.moveTo(PAD.L, y); pctx.lineTo(PAD.L + pw, y); pctx.stroke();
    }
    pctx.strokeStyle = ui.C.line; pctx.lineWidth = 1;
    pctx.strokeRect(PAD.L + .5, Math.round(pt) + .5, Math.round(pw) - 1, Math.round(ph));

    pctx.save();
    pctx.beginPath(); pctx.rect(PAD.L, pt - 2, pw, ph + 4); pctx.clip();
    if (ui.pdata.frf) {
      pctx.strokeStyle = ui.C.line; pctx.lineWidth = 1;
      for (const v of frfTicks(xlo, xhi)) {
        const x = Math.round(X(v)) + .5;
        pctx.beginPath(); pctx.moveTo(x, pt); pctx.lineTo(x, pt + ph); pctx.stroke();
      }
      pctx.strokeStyle = ui.C.driver; pctx.setLineDash([4, 3]);
      for (const m of sim.sweep.modes || []) {
        if (!(m.f > 0)) continue;
        const x = Math.round(X(Math.log10(m.f))) + .5;
        pctx.beginPath(); pctx.moveTo(x, pt); pctx.lineTo(x, pt + ph); pctx.stroke();
      }
      pctx.setLineDash([]);
    }
    for (const s of sb.set) {
      const col = serieColor(s.si);
      pctx.strokeStyle = col; pctx.lineWidth = 2;
      pctx.lineJoin = "round"; pctx.lineCap = "round";
      pctx.beginPath();
      let pen = false, px = 0;
      for (let i = 0; i <= 360; i++) {
        const xv = ui.pdata.xs[i], yv = s.a[i];
        if (!isFinite(xv) || !isFinite(yv)) { pen = false; continue; }
        const x = X(xv), y = Y(yv);
        if (pen && Math.abs(x - px) > pw * 0.5) pen = false;   // hoekas springt bij 360°
        if (!pen) { pctx.moveTo(x, y); pen = true; } else pctx.lineTo(x, y);
        px = x;
      }
      pctx.stroke();
    }
    pctx.restore();
  });

  // x-as: één eenheid, en nooit twee getallen over elkaar
  xUnit = (model.xAxis || "time") === "time" && xhi < 1 ? "ms" : "s";
  pctx.font = '400 10px "IBM Plex Mono", ui-monospace, monospace';
  pctx.textBaseline = "top"; pctx.fillStyle = ui.C.ink3;
  const axU = ui.pdata.frf ? "Hz" : (model.xAxis || "time") === "time" ? xUnit
    : (model.xAxis.slice(0, 4) === "ang|" ? "°" : chU(model.xAxis.slice(3)));
  const ty = nF * hF + 5;
  pctx.textAlign = "right";
  const uw = pctx.measureText(axU).width;
  pctx.fillText(axU, w - PAD.R, ty);
  pctx.textAlign = "center";
  let lastR = -1e9;
  const nx = pw > 420 ? 6 : 4;
  const xt = ui.pdata.frf ? frfTicks(xlo, xhi) : Array.from({ length: nx + 1 }, (_, k) => xlo + (xhi - xlo) * k / nx);
  for (const v of xt) {
    const t = ui.pdata.frf ? fmtPow(v) : fmtX(v), tw2 = pctx.measureText(t).width;
    const x = Math.max(PAD.L + tw2 / 2, Math.min(w - PAD.R - uw - 8 - tw2 / 2, X(v)));
    if (x - tw2 / 2 < lastR + 8) continue;
    pctx.fillText(t, x, ty);
    lastR = x + tw2 / 2;
  }
  } finally { pctx = plotCtx; }
  plotCache = { key, buf, X, geom, bottom: nF * hF };
  drawPlotDyn(plotCache, idx);
}

// per beeld: de bewaarde grafiek kopiëren, dan meetlijn en bolletjes erop
let plotCache = null, pdataGen = 0;
function drawPlotDyn(c, idx) {
  const g = plotCtx;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, plotCv.width, plotCv.height);
  g.drawImage(c.buf, 0, 0);
  g.setTransform(ui.DPR, 0, 0, ui.DPR, 0, 0);
  const mt = ui.pdata.frf && ui.hoverI === null ? ui.meet : null;   // FRF: exacte meetfrequentie
  const xv = mt ? Math.log10(mt.f) : ui.pdata.xs[idx];
  if (!isFinite(xv)) return;
  const x = c.X(xv);
  g.strokeStyle = ui.hoverI !== null ? ui.C.accent : ui.C.driver;
  g.lineWidth = mt ? 1.8 : 1.2;
  const cx = Math.round(x) + .5;
  g.beginPath(); g.moveTo(cx, PAD.T - 4); g.lineTo(cx, c.bottom); g.stroke();
  for (const gm of c.geom) for (const s of gm.set) {
    const yv = mt && mt.a[s.si] !== undefined ? mt.a[s.si] : s.a[idx];
    if (!isFinite(yv)) continue;
    g.fillStyle = serieColor(s.si);
    g.beginPath(); g.arc(x, gm.Y(yv), 3.4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = ui.C.panel; g.lineWidth = 1.5; g.stroke();
  }
}

// frequentie-as: 1-2-5 per decade, of alleen de decaden als het er veel zijn
function frfTicks(lo, hi) {
  const out = [], ms = hi - lo > 3.2 ? [1] : [1, 2, 5];
  for (let d = Math.floor(lo); d <= Math.ceil(hi); d++)
    for (const m of ms) { const v = d + Math.log10(m); if (v >= lo - 1e-9 && v <= hi + 1e-9) out.push(v); }
  return out;
}

function nearestSample(clientX) {
  if (!ui.pdata) return null;
  const r = plotCv.getBoundingClientRect();
  const px = clientX - r.left;
  const pw = r.width - PAD.L - PAD.R;
  const [xlo, xhi] = xRange();
  let best = null, bd = Infinity;
  for (let i = 0; i <= 360; i++) {
    const v = ui.pdata.xs[i];
    if (!isFinite(v)) continue;
    const d = Math.abs(PAD.L + ((v - xlo) / (xhi - xlo)) * pw - px);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

function niceTicks(lo, hi, n) {
  const raw = (hi - lo) / n;
  if (!(raw > 0)) return [lo];
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = ([1, 2, 2.5, 5, 10].find(m => m * mag >= raw) || 10) * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
  return out;
}
function fmtTick(v, step) {
  const a = Math.abs(v);
  if (step > 0) {
    if (a >= 1e5) return v.toExponential(1);
    if (step < 1e-4) return Math.abs(v) < step / 2 ? "0" : v.toExponential(1);   // heel kleine schaal
    const d = Math.max(0, Math.min(6, Math.ceil(-Math.log10(step)) + 1));
    return v.toFixed(d);
  }
  if (a >= 1e5 || (a > 0 && a < 1e-2)) return v.toExponential(0);
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

export function initPlot() {
  xSel.addEventListener("change", () => {
    model.xAxis = xSel.value; ui.pdata = null; drawPlot(); save();
  });
  plotCv.addEventListener("pointermove", ev => {
    const i = nearestSample(ev.clientX);
    if (i !== null && i !== ui.hoverI) { ui.hoverI = i; syncSeriesValues(); drawPlot(); }
  });
  plotCv.addEventListener("pointerleave", () => {
    if (ui.hoverI !== null) { ui.hoverI = null; syncSeriesValues(); drawPlot(); }
  });
  plotCv.addEventListener("click", ev => {
    const i = nearestSample(ev.clientX);
    if (i === null) return;
    if (ui.playing) togglePlay();
    ui.hoverI = null; goto(i);
  });

  document.getElementById("csvBtn").addEventListener("click", () => {
    if (!sim.sweep || !model.series.length) { flash("Nog geen metingen om te exporteren."); return; }
    if (!ui.pdata) buildPdata();
    const frf = !!ui.pdata.frf;
    const xname = frf ? "frequentie (Hz)" : (xSel.options[xSel.selectedIndex] || {}).text || "x";
    const head = [xname].concat(...ui.pdata.ss.map(d => frf
      ? ["|" + serieLab(model.series[d.si]) + "| [" + d.u + "]", "fase " + serieLab(model.series[d.si]) + " [°]"]
      : [serieLab(model.series[d.si]) + " [" + d.u + "]"])).map(h => '"' + h.replace(/"/g, "'") + '"');
    const lines = [head.join(",")];
    for (let i = 0; i <= 360; i++) {
      if (!sim.sweep.ok[i]) continue;
      const r = [frf ? sim.sweep.f[i].toPrecision(6) : ui.pdata.xs[i].toFixed(6)];
      for (const d of ui.pdata.ss) {
        if (frf) { r.push(isFinite(d.a[i]) ? Math.pow(10, d.a[i]).toPrecision(6) : ""); r.push(isFinite(d.ph[i]) ? d.ph[i].toFixed(2) : ""); }
        else r.push(isFinite(d.a[i]) ? d.a[i].toFixed(6) : "");
      }
      lines.push(r.join(","));
    }
    const txt = lines.join("\n");
    navigator.clipboard.writeText(txt).then(
      () => { document.getElementById("hint").innerHTML = "<b>CSV naar klembord</b> — " + (lines.length - 1) + " regels."; },
      () => flash("Kopiëren geweigerd door de browser.")
    );
  });
}
