// Eén getalnotatie voor alles wat de gebruiker ziet, volgens de gekozen taal: decimaalpunt (Engels) of decimale komma
// (Nederlands), in beide talen een dunne spatie als duizendtalscheiding, standaard drie geldige cijfers en nooit
// machtsnotatie (1e-4): in plaats daarvan wisselt de eenheid (N/mm ↔ N/µm, µm ↔ mm ↔ nm, µrad ↔ mrad).
// Waarden die ten opzichte van de probleemschaal verwaarloosbaar zijn (< 1e-9 × schaal) worden als 0 getoond.
// Alleen voor weergave; CSV houdt de punt.
import { isNl } from "./i18n.js";
export const NNBSP = " ";            // dunne, niet-brekende spatie
export const MINUS = "−";
export const REL_ZERO = 1e-9;             // relatieve ondergrens t.o.v. de probleemschaal
const SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
const sup = n => String(n).replace(/./g, c => SUP[c] || c);
// decimaalteken van de gekozen taal; decimal(x) zet een getal (of tekst met een punt) om
export const decSep = () => isNl() ? "," : ".";
export const decimal = x => String(x).replace(".", decSep());
const group = ip => ip.length > 3 ? ip.replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP) : ip;

// Kern: getal als tekst. d = geldige cijfers, keep = nullen achter de komma houden (50,0), scale = probleemschaal.
export function numStr(v, d, keep, scale) {
  if (v === undefined || v === null || (typeof v === "number" && isNaN(v))) return "–";
  v = +v;
  if (!isFinite(v)) return v > 0 ? "∞" : MINUS + "∞";
  d = d || 3;
  const a = Math.abs(v);
  if (a === 0 || a < 1e-12 || (scale > 0 && a < REL_ZERO * scale)) return "0";
  const neg = v < 0;
  if (a >= 1e15) {                                   // buiten elk leesbaar bereik: 1,23×10¹⁸ zonder 'e'
    const ex = Math.floor(Math.log10(a)), m = a / Math.pow(10, ex);
    return (neg ? MINUS : "") + decimal(+m.toPrecision(d)) + "×10" + sup(ex);
  }
  const dec = Math.max(0, Math.min(12, d - 1 - Math.floor(Math.log10(a))));
  let s = a.toFixed(dec);
  if (dec > 0 && !keep) s = s.replace(/0+$/, "").replace(/\.$/, "");
  const p = s.split("."), body = p.length > 1 ? group(p[0]) + decSep() + p[1] : group(p[0]);
  return (neg && /[1-9]/.test(s) ? MINUS : "") + body;
}
export const sg = (v, d, scale) => numStr(v, d, false, scale);

// getal voor labels op het canvas: vanaf 1 vaste decimalen volgens drie geldige cijfers (50,0 · 2,00 · 123), eronder 0,125
export function fmt(v, scale) { return numStr(v, 3, Math.abs(v) >= 1, scale); }

/* ---------- eenheden met voorvoegsel ---------- */
// elke familie: [eenheid, factor t.o.v. de basis], oplopend; basis = index base
const FAM = {
  len:    { base: 2, u: [["nm", 1e-6], ["µm", 1e-3], ["mm", 1], ["m", 1e3]] },
  force:  { base: 2, u: [["µN", 1e-6], ["mN", 1e-3], ["N", 1], ["kN", 1e3]] },
  stiff:  { base: 1, u: [["N/m", 1e-3], ["N/mm", 1], ["N/µm", 1e3]] },
  stress: { base: 1, u: [["kPa", 1e-3], ["MPa", 1], ["GPa", 1e3]] },
  angle:  { base: 2, u: [["µrad", 1e-6], ["mrad", 1e-3], ["rad", 1]] },
  moment: { base: 1, u: [["mN·m", 1e-3], ["N·m", 1], ["kN·m", 1e3]] },
  freq:   { base: 1, u: [["mHz", 1e-3], ["Hz", 1], ["kHz", 1e3]] },
  time:   { base: 1, u: [["µs", 1e-6], ["ms", 1e-3], ["s", 1]] }
};
FAM.time.base = 2;
// kies de eenheid waarbij de mantisse in [1, 1000) valt; rond de basiseenheid tot 0,1 omlaag
export function unitFor(fam, maxAbs) {
  const F = FAM[fam], a = Math.abs(maxAbs);
  let i = F.base;
  if (a > 0 && isFinite(a)) {
    while (i + 1 < F.u.length && a / F.u[i + 1][1] >= 1) i++;
    while (i > 0 && a / F.u[i][1] < (i === F.base ? 0.1 : 1)) i--;
  }
  return { u: F.u[i][0], f: F.u[i][1] };
}
// waarde (in de basiseenheid van de familie) met eenheid, bijv. fmtQ(0.00012, "stiff") -> "0.12 N/m" (Engels) of "0,12 N/m" (Nederlands)
export function fmtQ(v, fam, d, scale) {
  if (v === undefined || v === null || (typeof v === "number" && isNaN(v))) return "–";
  if (!isFinite(v)) return numStr(v);
  const a = Math.abs(v);
  if (a === 0 || a < 1e-15 || (scale > 0 && a < REL_ZERO * scale)) return "0 " + FAM[fam].u[FAM[fam].base][0];
  const U = unitFor(fam, v);
  return numStr(v / U.f, d || 3, false) + " " + U.u;
}
// tabelkolom: één eenheid voor alle waarden (kop past zich aan), nul onder de relatieve drempel
// rel = relatieve ruisvloer: standaard 1e-9; rekenresultaten met een penalty-methode (modus Stijfheid, 10^5 x stijf) hebben
// door afrondingsruis zo'n 1e-6 relatief, dus daar zijn reacties onder 1e-5 x de grootste waarde 0 (zie REL_FE).
export function colUnit(values, fam, rel) {
  let mx = 0;
  values.forEach(v => { if (isFinite(v) && Math.abs(v) > mx) mx = Math.abs(v); });
  const U = unitFor(fam, mx), k = (rel || REL_ZERO) / REL_ZERO;
  return { u: U.u, f: U.f, scale: mx, s: v => numStr(v / U.f, 3, false, mx / U.f * k) };
}
export const REL_FE = 1e-5;
export const fmtLen = (mm, d, scale) => fmtQ(mm, "len", d, scale);
export const fmtForce = (N, d, scale) => fmtQ(N, "force", d, scale);
export const fmtStiff = (k, d) => fmtQ(k, "stiff", d);
export const fmtStress = (s, d) => fmtQ(s, "stress", d);
export const fmtAngle = (r, d) => fmtQ(r, "angle", d);
export const fmtMoment = (m, d) => fmtQ(m, "moment", d);

export const fmtHz = f => f === undefined || f === null || isNaN(f) ? "–" : fmtQ(f, "freq");
export function fmtTime(s) { return s === undefined || s === null ? "–" : fmtQ(s, "time"); }

// probleemschaal van een rij waarden: grootste absolute waarde
export const scaleOf = vals => vals.reduce((m, v) => isFinite(v) && Math.abs(v) > m ? Math.abs(v) : m, 0);
// getal voor een as met stapgrootte: genoeg decimalen om de stap te tonen, nooit machtsnotatie
export function tickStr(v, step) {
  if (!(step > 0) || Math.abs(v) >= 1e15) return numStr(v, 3, false);
  if (Math.abs(v) < step * 1e-6) return "0";
  const dec = Math.max(0, Math.min(9, Math.ceil(-Math.log10(step) - 1e-9)));
  const a = Math.abs(v).toFixed(dec), p = a.split("."), body = p.length > 1 ? group(p[0]) + decSep() + p[1] : group(p[0]);
  return (v < 0 ? MINUS : "") + body;
}
// logaritmische as: 10^r als 10⁻³, daarbinnen leesbaar als getal
export function powTick(r) {
  r = Math.round(r);
  if (r >= -2 && r <= 3) return numStr(Math.pow(10, r), 3, false);
  return "10" + sup(r);
}
