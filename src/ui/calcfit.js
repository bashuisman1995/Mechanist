// Gedeelde hulp voor de calculator-tekeningen (alleen UI, alleen attributen):
// 1. stableScale: een stabiele tekenschaal (px per eenheid) die gelijk blijft zolang het onderdeel comfortabel past (45-85 % van de ruimte)
//    en daarbuiten met een afgeronde overgang van ~150 ms (rAF) naar een nieuwe passende schaal gaat; direct bij prefers-reduced-motion.
// 2. placeLabels: een plaatsingsronde voor tekstlabels: binnen het kader houden, niet over elkaar laten vallen (verschuiven) en zo nodig een leidlijn trekken.
export const FRAME = { w: 320, h: 245 };
const BAND = [0.45, 0.85], IDEAL = 0.65, EASE_MS = 150;
let redraw = null;
export function setRedraw(fn) { redraw = fn; }
function still() {
  try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (_) { return false; }
}
const ease = x => x * x * (3 - 2 * x);

/** R: tekenstaat van de figuur; key: naam van de schaal; ext: afmeting van het onderdeel (in eenheden, > 0); room: beschikbare ruimte in px.
 *  Geeft de huidige schaal in px per eenheid. */
export function stableScale(R, key, ext, room) {
  const S = (R.fit || (R.fit = {}))[key] || (R.fit[key] = { s: 0, from: 0, to: 0, t0: 0, ext: 0 });
  if (!(ext > 0) || !isFinite(ext)) return S.s || 1;
  const now = performance.now(), goal = IDEAL * room / ext;
  const frac = ext * (S.to || S.s) / room;
  if (!S.s) { S.s = S.to = goal; return S.s; }
  if (frac < BAND[0] || frac > BAND[1]) {
    if (Math.abs(goal - S.to) > 1e-9 * goal) {
      S.from = S.s; S.to = goal; S.t0 = now;
      if (still()) { S.s = goal; S.t0 = 0; }
    }
  }
  if (S.t0) {
    const x = Math.min(1, (now - S.t0) / EASE_MS);
    S.s = S.from + (S.to - S.from) * ease(x);
    if (x >= 1) { S.s = S.to; S.t0 = 0; }
    else if (redraw && !S.raf) { S.raf = requestAnimationFrame(() => { S.raf = 0; if (redraw) redraw(); }); }
  }
  return S.s;
}

// ---------- labels ----------
const PAD = 3, MARG = 3;
function boxOf(e, svg) {
  const b = e.getBoundingClientRect(), R = svg.getBoundingClientRect();
  const k = Math.min(R.width / FRAME.w, R.height / FRAME.h) || 1, ox = R.left + (R.width - FRAME.w * k) / 2, oy = R.top + (R.height - FRAME.h * k) / 2;
  const o = { x0: (b.left - ox) / k, y0: (b.top - oy) / k, x1: (b.right - ox) / k, y1: (b.bottom - oy) / k, k };
  const an = e.getAttribute("text-anchor");
  o.ax = an === "end" ? o.x1 : an === "middle" ? (o.x0 + o.x1) / 2 : o.x0; o.ay = (o.y0 + o.y1) / 2;
  return o;
}
const ovl = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > -PAD && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > -PAD;
const area = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const shift = (b, dx, dy) => ({ x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy });
function outside(b) { return Math.max(0, MARG - b.x0) + Math.max(0, b.x1 - (FRAME.w - MARG)) + Math.max(0, MARG - b.y0) + Math.max(0, b.y1 - (FRAME.h - MARG)); }
const STEPS = [5, 9, 14, 20, 28, 38, 50];
const DIRS = [[0, -1], [0, 1], [1, 0], [-1, 0], [1, -1], [-1, -1], [1, 1], [-1, 1]];

/** Plaatst alle zichtbare tekstlabels van svg. fixed = labels die niet verschuiven (voetregels). Leidlijnen komen in een eigen groep. */
export function placeLabels(svg, fixed) {
  let lg = svg.__leaders;
  if (!lg) { lg = svg.__leaders = document.createElementNS("http://www.w3.org/2000/svg", "g"); lg.setAttribute("class", "s-leaders"); }
  if (lg.parentNode !== svg || lg !== svg.lastChild) svg.appendChild(lg);
  const texts = [];
  svg.querySelectorAll("text").forEach(e => {
    if (!e.textContent.trim()) return;
    for (let n = e; n && n !== svg; n = n.parentNode) if (n.nodeType === 1 && n.style && n.style.display === "none") return;
    texts.push(e);
  });
  // terug naar het ontwerp van de tekenfunctie: is x/y sinds mijn laatste verschuiving niet door de tekenfunctie gezet, dan blijft het ontwerp gelden
  texts.forEach(e => {
    const x = e.getAttribute("x"), y = e.getAttribute("y");
    if (e.__px !== undefined && x === e.__px && y === e.__py) { e.__ox = e.__ox; }
    else { e.__ox = +x || 0; e.__oy = +y || 0; }
    if (e.__px !== undefined) { e.setAttribute("x", e.__ox); e.setAttribute("y", e.__oy); }
    e.__px = undefined;
  });
  const kf = (svg.__fit && svg.__fit.__k) || 1;
  const isFixed = e => (fixed && fixed.indexOf(e) >= 0) || (e.parentNode !== svg && e.parentNode !== svg.__fit);
  const placed = [], leads = [], obst = [];
  // vlakken waar een label liever niet overheen valt (zachte hindernis)
  svg.querySelectorAll(".s-ball, .s-fix, .s-sec, .s-slot, .s-bar0, .s-bar1, .s-bar2").forEach(e => {
    for (let n = e; n && n !== svg; n = n.parentNode) if (n.nodeType === 1 && n.style && n.style.display === "none") return;
    const q = boxOf(e, svg);
    if (isFinite(q.x0) && q.x1 - q.x0 > 6 && q.y1 - q.y0 > 6) obst.push(q);
  });
  const order = texts.filter(isFixed).concat(texts.filter(e => !isFixed(e)));
  order.forEach(e => {
    const b0 = boxOf(e, svg), k = b0.k;
    if (!isFinite(b0.x0)) return;
    const inside = obst.map(o => b0.x0 >= o.x0 - 1 && b0.x1 <= o.x1 + 1 && b0.y0 >= o.y0 - 1 && b0.y1 <= o.y1 + 1);   // label hoort in dit vlak: niet verschuiven
    let best = null, bestCost = Infinity;
    const cands = [[0, 0]];
    if (!isFixed(e)) STEPS.forEach(s => DIRS.forEach(d => cands.push([d[0] * s, d[1] * s * (d[0] && d[1] ? 0.7 : 1)])));
    for (let i = 0; i < cands.length; i++) {
      const dx = cands[i][0], dy = cands[i][1], b = shift(b0, dx, dy);
      let cost = outside(b) * 50 + Math.hypot(dx, dy) * 0.02;
      for (let j = 0; j < placed.length; j++) if (ovl(b, placed[j])) cost += 100 + area(b, placed[j]);
      for (let j = 0; j < obst.length; j++) { if (inside[j]) continue; const ar = area(b, obst[j]); if (ar > 0) cost += 2 + ar * 0.04; }
      if (cost < bestCost) { bestCost = cost; best = [dx, dy]; }
      if (cost < 1) break;
    }
    const dx = best[0], dy = best[1];
    if (dx || dy) {
      const inFit = e.parentNode === svg.__fit ? 1 / kf : 1;
      e.setAttribute("x", +((e.__ox) + dx * inFit).toFixed(1)); e.setAttribute("y", +((e.__oy) + dy * inFit).toFixed(1));
      e.__px = e.getAttribute("x"); e.__py = e.getAttribute("y");
      if (Math.hypot(dx, dy) > 12) leads.push({ x: b0.ax, y: b0.ay, b: shift(b0, dx, dy), dx, dy });
    }
    placed.push(shift(b0, dx, dy));
  });
  while (lg.childNodes.length < leads.length) { const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("class", "s-dim s-thin s-lead"); lg.appendChild(p); }
  for (let i = 0; i < lg.childNodes.length; i++) {
    const p = lg.childNodes[i], l = leads[i];
    if (!l) { p.style.display = "none"; continue; }
    p.style.display = "";
    // van het oorspronkelijke ankerpunt naar de dichtstbijzijnde rand van het verplaatste label
    const cx = Math.min(Math.max(l.x, l.b.x0), l.b.x1), cy = Math.min(Math.max(l.y, l.b.y0), l.b.y1);
    p.setAttribute("d", "M" + (+l.x.toFixed(1)) + " " + (+l.y.toFixed(1)) + "L" + (+cx.toFixed(1)) + " " + (+cy.toFixed(1)));
  }
}

// ---------- passend maken ----------
/** Zet alle tekenelementen (behalve defs en de voetregels) in een groep die zo nodig verkleind wordt, zodat de tekening nooit meer dan ~88 % van het kader vult. */
export function wrapFit(svg, keep) {
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("class", "s-fit");
  const kids = Array.prototype.slice.call(svg.childNodes).filter(n => n.nodeName !== "defs" && (!keep || keep.indexOf(n) < 0));
  const first = kids[0];
  if (first) svg.insertBefore(g, first); else svg.appendChild(g);
  kids.forEach(n => g.appendChild(n));
  svg.__fit = g; g.__k = 1;
  return g;
}
export function fitInk(svg, maxW, maxH) {
  const g = svg.__fit;
  if (!g) return;
  g.removeAttribute("transform"); g.__k = 1;
  let b;
  try { b = g.getBBox(); } catch (_) { return; }
  if (!b.width || !b.height) return;
  const k = Math.floor(Math.min(1, maxW / b.width, maxH / b.height) * 50) / 50;
  if (k < 1) {
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    g.setAttribute("transform", "translate(" + +cx.toFixed(1) + " " + +cy.toFixed(1) + ") scale(" + k + ") translate(" + +(-cx).toFixed(1) + " " + +(-cy).toFixed(1) + ")");
    g.__k = k;
  }
}
