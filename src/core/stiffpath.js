// Verloop langs een pad van balken in de modus Stijfheid (zonder DOM): verplaatsing, draaiing, moment en spanning als
// functie van de afgelegde weg s [mm]. Een pad is een rij Volledige balken (EA + EI) en Axiale staven.
// Eenheden in het resultaat: mm, rad, N·m, MPa; de interface kiest de weergave-eenheid.
import { N } from "./elements.js";
import { NSEG } from "./stiffness.js";

// grootheden die je kunt uitzetten; fam = eenheidsfamilie van de formatter (src/ui/format.js)
export const PATH_Q = [
  { k: "ux", q: "uₓ", name: "verplaatsing uₓ", fam: "len", get: p => p.ux },
  { k: "uy", q: "u_y", name: "verplaatsing u_y", fam: "len", get: p => p.uy },
  { k: "u", q: "|u|", name: "verplaatsing |u|", fam: "len", get: p => Math.hypot(p.ux, p.uy) },
  { k: "th", q: "φ", name: "draaiing φ", fam: "angle", get: p => p.th },
  { k: "M", q: "M", name: "buigend moment M", fam: "moment", get: p => p.M },
  { k: "sig", q: "σ", name: "spanning σ", fam: "stress", get: p => p.sig },
];

export const eligibleBars = res => (res && res.ok ? res.members.filter(r => r.kind === "beam" || r.kind === "axial") : []);

/** Alle balken in één looprichting: begin bij een vrij uiteinde en volg de balken; bij een splitsing of losse delen volgt een sprong. */
export function chainAll(res) {
  const bars = eligibleBars(res), used = new Set(), out = [], deg = new Map();
  bars.forEach(r => { deg.set(r.a, (deg.get(r.a) || 0) + 1); deg.set(r.b, (deg.get(r.b) || 0) + 1); });
  const start = () => {
    for (const r of bars) if (!used.has(r)) { if (deg.get(r.a) === 1) return r.a; if (deg.get(r.b) === 1) return r.b; }
    for (const r of bars) if (!used.has(r)) return r.a;
    return null;
  };
  let cur = null;
  while (used.size < bars.length) {
    if (cur === null) cur = start();
    const nx = bars.find(r => !used.has(r) && (r.a === cur || r.b === cur));
    if (!nx) { cur = null; continue; }
    used.add(nx); out.push(nx.e.id); cur = nx.a === cur ? nx.b : nx.a;
  }
  return out;
}

/** Rij balken met richting. gap = niet aansluitend op de vorige: de lijn wordt daar onderbroken. */
export function orderPath(res, ids) {
  const byId = new Map(eligibleBars(res).map(r => [r.e.id, r])), seen = new Set(), recs = [];
  (ids || []).forEach(id => { const r = byId.get(id); if (r && !seen.has(id)) { seen.add(id); recs.push(r); } });
  const items = [];
  recs.forEach((rec, i) => {
    let rev = false, gap = false;
    if (i > 0) {
      const prev = items[i - 1], end = prev.rev ? prev.rec.a : prev.rec.b;
      if (rec.a === end) rev = false; else if (rec.b === end) rev = true; else gap = true;
    } else if (recs.length > 1) {
      const nx = recs[1];
      if (rec.b === nx.a || rec.b === nx.b) rev = false; else if (rec.a === nx.a || rec.a === nx.b) rev = true;
    }
    items.push({ rec, rev, gap });
  });
  return items;
}

// één punt op een balk: verplaatsing (globaal), draaiing, moment, spanning
function beamSamples(res, rec) {
  const m = rec.m, u = res.u, L = m.L, c = m.c, s = m.s, ue = m.dofs.map(k => u[k]);
  const u1 = c * ue[0] + s * ue[1], v1 = -s * ue[0] + c * ue[1], t1 = ue[2];
  const u2 = c * ue[3] + s * ue[4], v2 = -s * ue[3] + c * ue[4], t2 = ue[5];
  const qy = m.q ? m.q.y : 0, EI = m.EI, out = [];
  for (let k = 0; k <= NSEG; k++) {
    const xi = k / NSEG, x = xi * L;
    const N1 = 1 - 3 * xi * xi + 2 * xi ** 3, N2 = L * (xi - 2 * xi * xi + xi ** 3), N3 = 3 * xi * xi - 2 * xi ** 3, N4 = L * (-xi * xi + xi ** 3);
    const d1 = (-6 * xi + 6 * xi * xi) / L, d2 = 1 - 4 * xi + 3 * xi * xi, d3 = (6 * xi - 6 * xi * xi) / L, d4 = -2 * xi + 3 * xi * xi;
    let v = N1 * v1 + N2 * t1 + N3 * v2 + N4 * t2, th = d1 * v1 + d2 * t1 + d3 * v2 + d4 * t2;
    if (qy) { v += qy * x * x * (L - x) * (L - x) / (24 * EI); th += qy * x * (L - x) * (L - 2 * x) / (12 * EI); }
    const a = u1 + (u2 - u1) * xi;
    out.push({ x, ux: c * a - s * v, uy: s * a + c * v, th, M: rec.M[k] / 1000, sig: rec.sig[k] });
  }
  return out;
}
function axialSamples(res, rec) {
  const ia = res.sys.nIdx.get(rec.a), ib = res.sys.nIdx.get(rec.b), u = res.u, sg = rec.sigMax;
  return [{ x: 0, ux: u[3 * ia], uy: u[3 * ia + 1], th: NaN, M: NaN, sig: sg }, { x: rec.L, ux: u[3 * ib], uy: u[3 * ib + 1], th: NaN, M: NaN, sig: sg }];
}

/** Verloop langs het pad: pts = [{s, ux, uy, th, M, sig, brk}], bars = [{rec, name, s0, s1}], len = totale lengte. */
export function pathProfile(res, ids) {
  const items = orderPath(res, ids), pts = [], bars = [];
  let s0 = 0;
  items.forEach(it => {
    const rec = it.rec, L = rec.L, sm = rec.kind === "beam" ? beamSamples(res, rec) : axialSamples(res, rec);
    const seq = it.rev ? sm.slice().reverse() : sm;
    // het moment wordt ten opzichte van de looprichting gegeven: een balk die achterstevoren doorlopen wordt, wisselt van teken
    seq.forEach((q, k) => pts.push({ s: s0 + (it.rev ? L - q.x : q.x), ux: q.ux, uy: q.uy, th: q.th, M: it.rev ? -q.M : q.M, sig: q.sig, brk: k === 0 && it.gap }));
    const na = N(rec.a), nb = N(rec.b);
    const nm = (na ? na.name : "?") + (nb ? nb.name : "?"), nr = (nb ? nb.name : "?") + (na ? na.name : "?");
    bars.push({ rec, name: it.rev ? nr : nm, s0, s1: s0 + L, gap: it.gap, id: rec.e.id });
    s0 += L;
  });
  return { pts, bars, len: s0, items };
}
