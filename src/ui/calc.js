// Werkplek "Calculators": flexure-rekenhulpen naast de schets. Alleen UI; de formules staan in src/calc/.
import { MATERIALS, materialSource, material } from "../calc/materials.js";
import { crossPivot, leafSpring, notchHinge, parallelLeaf, wireFlexure } from "../calc/flexures.js";
import { effModulus, effRadius, hertzSphere, kelvinCoupling, kinCoupling } from "../calc/contact.js";
import { dynAmp, fnForT, isolator, msd, overshoot, peakAmp, servo, settleInfo, settleTime, step as stepResp, transmissibility } from "../calc/dynamics.js";
import { athermal, dLength, lumped, thermalCentre } from "../calc/thermal.js";
import { numStr } from "./format.js";
import { t, onLang, parseNum, DICTS } from "./i18n.js";
import { NUM_ATTR } from "./numinput.js";
import { showReport } from "./report.js";
import { initCalcOpt, optCancel, optMount, optOpen, optSection } from "./calcopt.js";

const $ = id => document.getElementById(id);
const DEG = Math.PI / 180;

// ---------- opmaak ----------
// Komma als decimaalteken; duizendtallen (vanaf 4 cijfers) met een dunne spatie, nooit met een punt:
// "4.228" zou voor een decimaal doorgaan. Alles wat boven 1000 komt blijft dus ondubbelzinnig: "4 228".
let nonFin = 0;                          // aantal niet-eindige waarden dat tijdens deze berekening is opgemaakt
let lastRaw = NaN;                       // laatst opgemaakte getal: res() bewaart het als rekenwaarde voor Optimaliseer
function sig(x, n) {
  lastRaw = x;
  if (typeof x === "number" && !isFinite(x) && !isNaN(x)) { nonFin++; return x > 0 ? "∞" : "—"; }
  if (isNaN(x)) { nonFin++; return "—"; }
  return numStr(x, n);
}
const num = (x, n) => sig(x, n || 3);
function fr(a, b) { return '<span class="fr"><span>' + a + "</span><span>" + b + "</span></span>"; }
const sub = (s, t) => s + "<sub>" + t + "</sub>";
const sup = (s, t) => s + "<sup>" + t + "</sup>";

// ---------- literatuur ----------
const CALCS = [];

// ---------- invoervelden ----------
const f = (id, label, unit, def, min, range, grp) => ({ id, label, unit, def, min: min == null ? 0 : min, range, grp });
// bovengrens voor een veld: de waarde wordt voor de berekening begrensd en er verschijnt een korte oranje melding
const bound = (i, max, sym) => Object.assign(i, { max, sym });
const selIn = (id, label, def, options, grp) => ({ id, type: "select", label, def, options, grp });
// ---------- waarschuwingen (kort) ----------
function warn(r, sigmaToel, extra) {
  const w = [];
  if (r.sigma > sigmaToel) w.push(t("calc.warn.1") + num(r.sigma) + t("calc.warn.2") + num(sigmaToel) + " MPa.");
  if (r.margin < 2) w.push(t("calc.warn.3") + num(r.margin) + t("calc.warn.4"));
  return w.concat(extra || []);
}
// geldigheid van de kleine-doorbuiging-formules voor bladveren en draden
function geomWarn(p, kind) {
  const w = [];
  if (p.u / p.L > 0.1) w.push("u/L = " + num(p.u / p.L) + t("calc.geomwarn.1"));
  if (kind === "wire") {
    if (p.L / p.d < 20) w.push("L/d = " + num(p.L / p.d) + t("calc.geomwarn.3"));
    return w;
  }
  if (p.L / p.t < 20) w.push("L/t = " + num(p.L / p.t) + t("calc.geomwarn.4"));
  const bt = p.b / p.t;
  if (bt < 5) w.push("b/t = " + num(bt) + t("calc.geomwarn.5") + (p.plate ? t("calc.geomwarn.6") : t("calc.geomwarn.7")));
  else if (bt >= 10 && !p.plate) w.push("b/t = " + num(bt) + t("calc.geomwarn.8"));
  return w;
}
function massWarn(p, r) {
  return r.mLeaf > 0.05 * p.m ? [t("calc.masswarn.1") + num(100 * r.mLeaf / p.m) + t("calc.masswarn.2")] : [];
}
// raw = de rekenwaarde achter de tekst v. Alleen als de tekst er (op 0,6 % na) mee overeenkomt; anders NaN (dan is het geen enkel getal).
function rawOf(v) {
  const r = lastRaw; lastRaw = NaN;
  const t = String(v);
  if (/^∞/.test(t)) return Infinity;
  const q = parseNum(t);
  if (!isFinite(q) || !isFinite(r)) return NaN;
  return Math.abs(r - q) <= 0.006 * Math.abs(r) + 1e-12 ? r : NaN;
}
const res = (k, v, unit, bad) => ({ id: k, k: t(k), v, unit, bad, raw: rawOf(v) });   // k = woordenboeksleutel: id blijft gelijk bij een andere taal
const stressBad = (r, M) => r.sigma > M.sigma;
const nFac = (r, M) => (r.sigma > 0 ? M.sigma / r.sigma : Infinity);
const nRes = (r, M) => res("calc.nres.1", isFinite(nFac(r, M)) ? num(nFac(r, M)) : "∞", "", nFac(r, M) < 1);
const marginRes = r => res("calc.marginres.1", isFinite(r.margin) ? num(r.margin) : "∞ (F = 0)", "", r.margin < 2);
const driveTxt = d => (d === "soft" ? t("calc.drivetxt.1") : t("calc.drivetxt.2"));

// (nieuwe calculators: Contact, Dynamica, Thermisch)
// ===================== Contact, Dynamica, Thermisch =====================
const K = (k, u, v, sub, status) => ({ k, u, v, sub: sub || "", status: status || "" });
const statOf = (s, warnBelow) => (s < 1 ? "bad" : s < (warnBelow || 1.5) ? "warn" : "ok");
const tFmt = s => (!isFinite(s) ? ["—", "s"] : s < 1 ? [num(s * 1000), "ms"] : s < 120 ? [num(s), "s"] : s < 7200 ? [num(s / 60), "min"] : [num(s / 3600), t("calc.tfmt.1")]);
const tTxt = s => tFmt(s).join(" ");
const hzTxt = x => num(x) + " Hz";


function buildCalcs() {
  CALCS.length = 0;
const LIT = {
  soemersTh: t("calc.lit.1"),
  soemers: t("calc.lit.2"),
  roark: t("calc.lit.3"),
  gere: t("calc.lit.4"),
  tim: t("calc.lit.5"),
  smith: t("calc.lit.6"),
  henein: t("calc.lit.7"),
  pw: t("calc.lit.8"),
  lobontiu: t("calc.lit.9"),
  schot: t("calc.lit.10"),
  wittrick: t("calc.lit.11"),
  haringx: t("calc.lit.12"),
  denhartog: t("calc.lit.13"),
  awtar: t("calc.lit.14"),
  howell: t("calc.lit.15"),
  johnson: t("calc.lit.16"),
  slocum: t("calc.lit.17"),
  rao: t("calc.lit.18"),
  harris: t("calc.lit.19"),
  franklin: t("calc.lit.20"),
  munnig: t("calc.lit.21"),
  incropera: t("calc.lit.22"),
  slocum3: t("calc.lit.23"),
  invar: t("calc.lit.24"),
};
const SRC_S = LIT.soemers;
const SRC_H = LIT.smith + "; " + LIT.henein;
const matIn = (id, label, def) => ({ id, type: "mat", label, def, grp: "Materiaal" });
const IN_M = f("m", t("calc.in_m.1"), "kg", 0.1);
const IN_F = f("F", t("calc.in_f.1"), "N", 0);
const IN_PLATE = { id: "plate", type: "check", label: t("calc.in_plate.3"), def: false };
const IN_DRIVE = { id: "drive", type: "select", label: t("calc.in_drive.2"), def: "stiff",
  options: [["stiff", t("calc.in_drive.4")], ["soft", t("calc.in_drive.6")]] };
CALCS.push(...[
  {
    id: "leaf", group: "Flexures", name: t("calc.leaf.3"), short: t("calc.leaf.4"),
    inputs: [f("L", t("calc.leaf.5"), "mm", 20, 0.01), f("b", t("calc.leaf.6"), "mm", 10, 0.01), f("t", t("calc.leaf.7"), "mm", 0.2, 0.001), f("u", t("calc.leaf.8"), "mm", 0.5, 0), IN_F, IN_M, IN_DRIVE, IN_PLATE],
    run: (p, M) => {
      const r = leafSpring(Object.assign({}, p, M));
      return { r,
        out: [res("calc.leaf.9", num(r.cx), "N/mm"), res("calc.leaf.10", num(r.cx / 1000), "N/µm"),
          res("calc.leaf.11", num(r.cxF), "N/mm", r.cxF <= 0), res("calc.leaf.12", num(r.force), "N"),
          res("calc.leaf.13", num(r.cz0 / 1000), "kN/mm"), res("calc.leaf.14", num(r.cz / 1000), "kN/mm (" + driveTxt(p.drive) + ")"),
          res("calc.leaf.15", num(r.dz * 1000), "µm"), res("calc.leaf.16", num(r.uMax), "mm"),
          res("calc.leaf.17", num(r.sigma), "MPa", stressBad(r, M)), nRes(r, M), res("calc.leaf.18", num(r.Pcr), "N"),
          marginRes(r), res("calc.leaf.19", num(r.f), "Hz")],
        warn: warn(r, M.sigma, geomWarn(p, "leaf").concat(massWarn(p, r))) };
    },
    formulas: (p, M, r) => [
      [t("calc.leaf.20"), "I = " + fr("b·t³", "12"), "I = " + fr(num(p.b) + "·" + num(p.t) + "³", "12") + " = " + num(r.I) + " mm⁴", LIT.roark],
      [t("calc.leaf.21"), sub("c", "x") + " = " + fr("12·E·I", "L³") + " = " + fr("E·b·t³", "L³"), sub("c", "x") + " = " + fr("12·" + num(r.E) + "·" + num(r.I), num(p.L) + "³") + " = " + num(r.cx) + " N/mm", LIT.soemers + "; " + LIT.roark],
      [t("calc.leaf.22"), sub("c", "x") + "(F) = " + fr("12·E·I", "L³") + " − " + fr("6", "5") + "·" + fr("F", "L"), sub("c", "x") + "(F) = " + num(r.cx) + t("calc.leaf.23") + num(p.F) + "/" + num(p.L) + " = " + num(r.cxF) + " N/mm", LIT.tim + t("calc.leaf.24")],
      [t("calc.leaf.25"), sub("c", "z0") + " = " + fr("E·b·t", "L"), sub("c", "z0") + " = " + fr(num(r.E) + "·" + num(p.b) + "·" + num(p.t), num(p.L)) + " = " + num(r.cz0) + " N/mm", LIT.gere],
      [t("calc.leaf.26") + (p.drive === "soft" ? "" : t("calc.leaf.27")), fr("1", sub("c", "z")) + " = " + fr("L", "E·b·t") + " + " + fr("u²·L", "700·E·I"), sub("c", "z") + " = " + num(r.czStiff) + " N/mm (" + num(r.czStiff / r.cz0 * 100) + t("calc.leaf.28"), LIT.soemers + t("calc.leaf.29")],
      [t("calc.leaf.30") + (p.drive === "soft" ? t("calc.leaf.27") : ""), fr("1", sub("c", "z")) + " = " + fr("L", "E·b·t") + " + " + fr("u²·L", "700·E·I") + " + " + fr("3·u²·L", "25·E·I"), sub("c", "z") + " = " + num(r.czSoft) + " N/mm (" + num(r.czSoft / r.cz0 * 100) + t("calc.leaf.28"), LIT.soemers + t("calc.leaf.31")],
      [t("calc.leaf.32"), t("calc.leaf.33") + fr(t("calc.leaf.34"), t("calc.leaf.35")) + t("calc.leaf.36") + fr("u²·L", "700·E·I"), "u²·L/(700·E·I) = " + num(p.u ** 2 * p.L / (700 * r.E * r.I), 3) + " mm/N, " + num(p.u ** 2 * p.L / (700 * r.E * r.I) / (p.L / (r.E * p.b * p.t)) * 100) + t("calc.leaf.37"), LIT.soemers + t("calc.leaf.38")],
      [t("calc.leaf.39"), t("calc.leaf.40") + fr("u²", "L"), t("calc.leaf.41") + fr(num(p.u) + "²", num(p.L)) + " = " + num(r.dz * 1000) + " µm", LIT.awtar + t("calc.leaf.42")],
      [t("calc.leaf.43"), sub("u", "max") + " = " + fr(sub("σ", t("calc.leaf.44")) + "·L²", "3·E·t"), sub("u", "max") + " = " + fr(num(M.sigma) + "·" + num(p.L) + "²", "3·" + num(r.E) + "·" + num(p.t)) + " = " + num(r.uMax) + " mm", LIT.roark],
      [t("calc.leaf.45"), "σ = " + fr("3·E·t·u", "L²") + " + " + fr("F", "b·t"), "σ = " + num(r.sb) + " + " + num(r.sa) + " = " + num(r.sigma) + " MPa", LIT.roark],
      [t("calc.leaf.46"), "n = " + fr(sub("σ", t("calc.leaf.44")), "σ"), "n = " + fr(num(M.sigma), num(r.sigma)) + " = " + (isFinite(nFac(r, M)) ? num(nFac(r, M)) : "∞"), t("calc.leaf.47")],
      [t("calc.leaf.48"), sub("P", t("calc.leaf.49")) + " = " + fr("π²·E·I", "L²"), sub("P", t("calc.leaf.49")) + " = " + fr("π²·" + num(r.E) + "·" + num(r.I), num(p.L) + "²") + " = " + num(r.Pcr) + " N", LIT.tim],
      [t("calc.leaf.50"), "f = " + fr("1", "2π") + "·√" + fr(sub("c", "x") + "·1000", "m"), "f = " + num(r.f) + t("calc.leaf.51"), LIT.denhartog],
    ],
    assume: [t("calc.leaf.52"),
      t("calc.leaf.53"),
      t("calc.leaf.54"),
      t("calc.leaf.55"),
      t("calc.leaf.56"),
      t("calc.leaf.57")],
    source: SRC_S + ".",
  },
  {
    id: "par", group: "Flexures", name: t("calc.par.2"), short: t("calc.par.3"),
    inputs: [f("L", t("calc.par.4"), "mm", 20, 0.01), f("b", t("calc.leaf.6"), "mm", 10, 0.01), f("t", t("calc.leaf.7"), "mm", 0.2, 0.001), f("u", t("calc.leaf.8"), "mm", 0.5, 0), IN_F, IN_M, IN_DRIVE, IN_PLATE],
    run: (p, M) => {
      const r = parallelLeaf(Object.assign({}, p, M));
      return { r,
        out: [res("calc.par.5", num(r.cx), "N/mm"), res("calc.leaf.10", num(r.cx / 1000), "N/µm"),
          res("calc.leaf.11", num(r.cxF), "N/mm", r.cxF <= 0), res("calc.leaf.12", num(r.force), "N"),
          res("calc.leaf.13", num(r.cz0 / 1000), "kN/mm"), res("calc.leaf.14", num(r.cz / 1000), "kN/mm (" + driveTxt(p.drive) + ")"),
          res("calc.par.6", num(r.dz * 1000), "µm"), res("calc.leaf.16", num(r.uMax), "mm"),
          res("calc.par.7", num(r.sigma), "MPa", stressBad(r, M)), nRes(r, M), res("calc.par.8", num(r.Pcr), "N"),
          marginRes(r), res("calc.leaf.19", num(r.f), "Hz")],
        warn: warn(r, M.sigma, geomWarn(p, "par")) };
    },
    formulas: (p, M, r) => [
      [t("calc.par.9"), sub("c", "x") + " = 2·" + fr("12·E·I", "L³") + " = " + fr("2·E·b·t³", "L³"), sub("c", "x") + " = 2·" + fr("12·" + num(r.E) + "·" + num(r.I), num(p.L) + "³") + " = " + num(r.cx) + " N/mm", LIT.soemers + "; " + LIT.roark],
      [t("calc.par.10"), sub("c", "x") + "(F) = 2·" + fr("12·E·I", "L³") + " − " + fr("6", "5") + "·" + fr("F", "L"), sub("c", "x") + "(F) = " + num(r.cxF) + " N/mm", LIT.tim],
      [t("calc.par.11") + " – " + driveTxt(p.drive), fr("1", sub("c", "z")) + " = " + fr("L", "2·E·b·t") + " + " + fr("u²·L", "2·700·E·I") + (p.drive === "soft" ? " + " + fr("3·u²·L", "2·25·E·I") : ""), sub("c", "z") + " = " + num(r.cz) + t("calc.par.12") + num(r.czStiff) + t("calc.par.13") + num(r.czSoft) + ")", LIT.soemers],
      [t("calc.par.14"), t("calc.leaf.40") + fr("u²", "L"), "Δz = " + num(r.dz * 1000) + t("calc.par.15"), LIT.awtar + t("calc.leaf.42")],
      [t("calc.leaf.43"), sub("u", "max") + " = " + fr(sub("σ", t("calc.leaf.44")) + "·L²", "3·E·t"), sub("u", "max") + " = " + num(r.uMax) + " mm", LIT.roark],
      [t("calc.par.16"), "σ = " + fr("3·E·t·u", "L²") + " + " + fr("F", "2·b·t"), "σ = " + num(r.sb) + " + " + num(r.sa) + " = " + num(r.sigma) + " MPa", LIT.roark],
      [t("calc.leaf.46"), "n = " + fr(sub("σ", t("calc.leaf.44")), "σ"), "n = " + (isFinite(nFac(r, M)) ? num(nFac(r, M)) : "∞"), t("calc.par.17")],
      [t("calc.par.18"), sub("P", t("calc.leaf.49")) + " = 2·" + fr("π²·E·I", "L²"), sub("P", t("calc.leaf.49")) + " = " + num(r.Pcr) + " N", LIT.tim],
      [t("calc.leaf.50"), "f = " + fr("1", "2π") + "·√" + fr(sub("c", "x") + "·1000", "m"), "f = " + num(r.f) + " Hz", LIT.denhartog],
    ],
    assume: [t("calc.par.19"),
      t("calc.par.20"),
      t("calc.par.21"),
      t("calc.par.22")],
    source: SRC_S + ".",
  },
  {
    id: "cross", group: "Flexures", name: t("calc.cross.2"), short: t("calc.cross.3"),
    inputs: [f("L", t("calc.par.4"), "mm", 20, 0.01), f("b", t("calc.leaf.6"), "mm", 10, 0.01), f("t", t("calc.leaf.7"), "mm", 0.2, 0.001), f("phi", t("calc.cross.5"), "°", 5, 0), f("r", t("calc.cross.6"), "mm", 50, 0.01), IN_F, IN_M, IN_PLATE],
    run: (p, M) => {
      const q = Object.assign({}, p, M, { phi: p.phi * DEG });
      const r = crossPivot(q);
      const w = warn(r, M.sigma, []);
      if (p.L / p.t < 20) w.push("L/t = " + num(p.L / p.t) + t("calc.geomwarn.4"));
      if (p.F > 0) w.push(t("calc.cross.7"));
      return { r,
        out: [res("calc.cross.8", num(r.c), "N·mm/rad"), res("calc.cross.9", num(r.c / 1000), "N·m/rad"),
          res("calc.cross.10", num(r.moment), "N·mm"),
          res("calc.cross.11", num(r.phiMax / DEG), "°"), res("calc.cross.12", num(r.sigma), "MPa", stressBad(r, M)), nRes(r, M),
          res("calc.cross.13", t("calc.cross.14"), t("calc.cross.15")), res("calc.cross.16", t("calc.cross.17"), t("calc.cross.18")),
          res("calc.leaf.19", num(r.f), "Hz")],
        warn: w };
    },
    formulas: (p, M, r) => [
      [t("calc.cross.19"), sub("c", t("calc.cross.20")) + " = " + fr("E·I", "L"), "I = " + num(r.I) + " mm⁴", LIT.soemers + "; " + LIT.smith],
      [t("calc.cross.21"), sub("c", "φ") + " = 2·" + fr("E·I", "L") + " = " + fr("E·b·t³", "6·L"), sub("c", "φ") + " = 2·" + fr(num(r.E) + "·" + num(r.I), num(p.L)) + " = " + num(r.c) + " N·mm/rad = " + num(r.c / 1000) + " N·m/rad", LIT.soemers + "; " + LIT.henein],
      [t("calc.cross.22"), sub("φ", "max") + " = " + fr("2·" + sub("σ", t("calc.leaf.44")) + "·L", "E·t"), sub("φ", "max") + " = " + fr("2·" + num(M.sigma) + "·" + num(p.L), num(r.E) + "·" + num(p.t)) + " = " + num(r.phiMax) + " rad = " + num(r.phiMax / DEG) + "°", LIT.roark],
      [t("calc.cross.23"), "σ = " + fr("E·t·φ", "2·L") + " + " + fr("F", "2·b·t"), "σ = " + num(r.sb) + " + " + num(r.sa) + " = " + num(r.sigma) + " MPa", LIT.roark],
      [t("calc.leaf.46"), "n = " + fr(sub("σ", t("calc.leaf.44")), "σ"), "n = " + (isFinite(nFac(r, M)) ? num(nFac(r, M)) : "∞"), t("calc.par.17")],
      [t("calc.cross.24"), sub("c", "φ") + "(F) < " + sub("c", "φ"), t("calc.cross.25"), LIT.wittrick + "; " + LIT.haringx],
      [t("calc.cross.26"), "f = " + fr("1", "2π") + "·√" + fr(sub("c", "φ"), "m·r²"), "f = " + num(r.f) + t("calc.cross.27"), LIT.denhartog],
    ],
    assume: [t("calc.cross.28"),
      t("calc.cross.29"),
      t("calc.cross.30"),
      t("calc.cross.31")],
    source: SRC_S + "; " + SRC_H + "; " + LIT.wittrick + ".",
  },
  {
    id: "notch", group: "Flexures", name: t("calc.notch.2"), short: t("calc.notch.3"),
    inputs: [f("b", t("calc.leaf.6"), "mm", 10, 0.01), f("t", t("calc.notch.4"), "mm", 0.3, 0.001), f("R", t("calc.notch.5"), "mm", 3, 0.01), f("phi", t("calc.cross.5"), "°", 0.3, 0), f("Kt", t("calc.notch.7"), "–", 1.5, 1), f("r", t("calc.cross.6"), "mm", 50, 0.01), IN_M, IN_PLATE],
    run: (p, M) => {
      const r = notchHinge(Object.assign({}, p, M, { phi: p.phi * DEG }));
      const w = warn({ sigma: r.sigma, margin: Infinity }, M.sigma);
      if (r.ratio > 0.2) w.push("t/(2R) = " + num(r.ratio) + t("calc.notch.8"));
      return { r,
        out: [res("calc.cross.8", num(r.c), "N·mm/rad"), res("calc.cross.9", num(r.c / 1000), "N·m/rad"), res("calc.cross.10", num(r.moment), "N·mm"),
          res("calc.notch.9", num(r.sNom), "MPa"), res("calc.notch.10", num(r.sigma), "MPa", stressBad(r, M)), nRes(r, M),
          res("calc.cross.11", num(r.phiMax / DEG), "°"), res("calc.cross.11", num(r.phiMax * 1000), "mrad"),
          res("calc.leaf.19", num(r.f), "Hz")],
        warn: w };
    },
    formulas: (p, M, r) => [
      [t("calc.notch.11"), sub("c", "φ") + " ≈ " + fr("2·E·b·" + sup("t", "5/2"), "9π·√R"), sub("c", "φ") + " = " + fr("2·" + num(r.E) + "·" + num(p.b) + "·" + num(p.t) + "<sup>5/2</sup>", "9π·√" + num(p.R)) + " = " + num(r.c) + " N·mm/rad = " + num(r.c / 1000) + " N·m/rad", LIT.pw],
      [t("calc.notch.12"), sub("σ", t("calc.notch.13")) + " = " + fr("6·M", "b·t²") + " = " + fr("4", "3π") + "·E·√" + fr("t", "R") + "·φ", sub("σ", t("calc.notch.13")) + " = " + num(r.sNom) + " MPa", LIT.pw + "; " + LIT.smith],
      [t("calc.notch.14"), sub("σ", "max") + " = " + sub("K", "t") + "·" + sub("σ", t("calc.notch.13")), sub("σ", "max") + " = " + num(p.Kt) + "·" + num(r.sNom) + " = " + num(r.sigma) + " MPa", LIT.smith],
      [t("calc.leaf.46"), "n = " + fr(sub("σ", t("calc.leaf.44")), sub("σ", "max")), "n = " + (isFinite(nFac(r, M)) ? num(nFac(r, M)) : "∞"), t("calc.par.17")],
      [t("calc.cross.22"), sub("φ", "max") + " = " + fr(sub("σ", t("calc.leaf.44")), sub("K", "t") + "·" + fr("4", "3π") + "·E·√(t/R)"), sub("φ", "max") + " = " + num(r.phiMax * 1000) + " mrad = " + num(r.phiMax / DEG) + "°", LIT.pw],
      [t("calc.notch.15"), t("calc.notch.16"), "t/(2R) = " + num(r.ratio), LIT.schot + "; " + LIT.lobontiu],
      [t("calc.leaf.50"), "f = " + fr("1", "2π") + "·√" + fr(sub("c", "φ"), "m·r²"), "f = " + num(r.f) + " Hz", LIT.denhartog],
    ],
    assume: [t("calc.notch.17"),
      t("calc.notch.18"),
      t("calc.notch.19"),
      t("calc.cross.31")],
    source: SRC_H + "; " + LIT.pw + "; " + LIT.lobontiu + ".",
  },
  {
    id: "wire", group: "Flexures", name: t("calc.wire.1"), short: t("calc.wire.2"),
    inputs: [f("L", t("calc.leaf.5"), "mm", 50, 0.01), f("d", t("calc.wire.3"), "mm", 1, 0.001), f("u", t("calc.wire.4"), "mm", 0.5, 0), IN_F, IN_M,
      { id: "bc", type: "select", label: t("calc.wire.6"), def: "guided", options: [["guided", t("calc.wire.8")], ["free", t("calc.wire.10")]] }],
    run: (p, M) => {
      const r = wireFlexure(Object.assign({}, p, M));
      return { r,
        out: [res("calc.wire.11", num(r.cax / 1000), "kN/mm"), res("calc.wire.12", num(r.cb), "N/mm"), res("calc.wire.13", num(r.cb / 1000), "N/µm"),
          res("calc.leaf.12", num(r.force), "N"), res("calc.leaf.16", num(r.uMax), "mm"),
          res("calc.leaf.17", num(r.sigma), "MPa", stressBad(r, M)), nRes(r, M), res("calc.leaf.18", num(r.Pcr), "N"),
          marginRes(r), res("calc.wire.14", num(r.f), "Hz"), res("calc.wire.15", num(r.fax), "Hz")],
        warn: warn(r, M.sigma, geomWarn(p, "wire")) };
    },
    formulas: (p, M, r) => {
      const g = p.bc === "guided";
      return [
        [t("calc.wire.16"), "A = " + fr("π·d²", "4") + ", I = " + fr("π·d⁴", "64"), "A = " + num(r.A) + " mm², I = " + num(r.I) + " mm⁴", LIT.gere],
        [t("calc.leaf.25"), sub("c", "ax") + " = " + fr("E·A", "L"), sub("c", "ax") + " = " + fr(num(p.E) + "·" + num(r.A), num(p.L)) + " = " + num(r.cax) + " N/mm", LIT.gere],
        [t("calc.leaf.20"), sub("c", "b") + " = " + (g ? fr("12·E·I", "L³") : fr("3·E·I", "L³")), sub("c", "b") + " = " + num(r.cb) + " N/mm", LIT.roark],
        [t("calc.leaf.43"), sub("u", "max") + " = " + (g ? fr(sub("σ", t("calc.leaf.44")) + "·L²", "3·E·d") : fr("2·" + sub("σ", t("calc.leaf.44")) + "·L²", "3·E·d")), sub("u", "max") + " = " + num(r.uMax) + " mm", LIT.roark],
        [t("calc.cross.23"), "σ = " + (g ? fr("3·E·d·u", "L²") : fr("3·E·d·u", "2·L²")) + " + " + fr("F", "A"), "σ = " + num(r.sb) + " + " + num(r.sa) + " = " + num(r.sigma) + " MPa", LIT.roark],
        [t("calc.leaf.46"), "n = " + fr(sub("σ", t("calc.leaf.44")), "σ"), "n = " + (isFinite(nFac(r, M)) ? num(nFac(r, M)) : "∞"), t("calc.par.17")],
        [t("calc.par.18"), sub("P", t("calc.leaf.49")) + " = " + fr("π²·E·I", (g ? "" : "4·") + "L²"), sub("P", t("calc.leaf.49")) + " = " + num(r.Pcr) + " N", LIT.tim],
        [t("calc.wire.17"), "f = " + fr("1", "2π") + "·√" + fr("c·1000", "m"), t("calc.wire.18") + num(r.f) + t("calc.wire.19") + num(r.fax) + " Hz", LIT.denhartog],
      ];
    },
    assume: [t("calc.wire.20"),
      t("calc.wire.21"),
      t("calc.wire.22"),
      t("calc.wire.23")],
    source: SRC_S + "; " + SRC_H + ".",
  },
]);
// ---------- Contact ----------
const P0_LIM = {
  label: t("calc.p0_lim.1"), unit: "MPa",
  hint: t("calc.p0_lim.2"),
  auto: p => 1.6 * Math.min(material(p.mat1).sy, material(p.mat2).sy),
};
const GEOM_OPT = [["flat", t("calc.geom_opt.2")], ["convex", t("calc.geom_opt.4")], ["concave", t("calc.geom_opt.6")]];
const geomTxt = g => (GEOM_OPT.filter(o => o[0] === g)[0] || GEOM_OPT[0])[1];
const MAT_DEF = [matIn("mat1", t("calc.mat_def.2"), "staal"), matIn("mat2", t("calc.mat_def.5"), "staal")];

CALCS.push({
  id: "hertz", group: "Contact", name: t("calc.hertz.3"), short: t("calc.hertz.4"),
  inputs: [selIn("geom", "Geometrie", "flat", GEOM_OPT, "Geometrie"), f("R1", t("calc.hertz.7"), "mm", 5, 0.01, [0.5, 50, 1], "Geometrie"),
    f("R2", t("calc.hertz.8"), "mm", 10, 0.01, [0.5, 100, 1], "Geometrie"),
    f("F", t("calc.hertz.9"), "N", 10, 0.001, [0.1, 5000, 1], "Belasting"),
    selIn("n", t("calc.hertz.11"), "1", [["1", "1"], ["2", t("calc.hertz.12")], ["3", "3"], ["4", "4"], ["6", "6"]], "Belasting"),
    bound(f("theta", t("calc.hertz.14"), "°", 0, 0, [0, 75, 0], "Belasting"), 89, "θ")].concat(MAT_DEF),
  lim: P0_LIM,
  run: (p, M) => {
    const m1 = material(p.mat1), m2 = material(p.mat2), n = +p.n, th = p.theta * DEG;
    const Es = effModulus(m1.E, m1.nu, m2.E, m2.nu), Re = effRadius(p.geom, p.R1, p.R2);
    const Fn = p.F / (n * Math.cos(th)), h = hertzSphere({ F: Fn, R: Re, Es });
    const r = Object.assign({}, h, { Fn, Es, Re, n, th, kax: n * h.kn * Math.cos(th) ** 2, margin: M.sigma / h.p0, m1, m2 });
    const w = [];
    if (!(Re > 0)) w.push(t("calc.hertz.15"));
    if (r.margin < 1) w.push("p₀ = " + num(h.p0) + t("calc.hertz.16") + num(M.sigma) + t("calc.hertz.17"));
    else if (r.margin < 1.5) w.push(t("calc.hertz.18"));
    if (Re > 0 && h.a / Re > 0.1) w.push("a/R = " + num(h.a / Re) + t("calc.hertz.19"));
    if (p.theta > 60) w.push("θ = " + num(p.theta) + t("calc.hertz.20"));
    if (m1.id === "zerodur" || m2.id === "zerodur" || m1.id === "alumina" || m2.id === "alumina" || m1.id === "wc" || m2.id === "wc") w.push(t("calc.hertz.24"));
    return { r, warn: w,
      out: [res("calc.hertz.25", num(Fn), "N"), res("calc.hertz.26", num(Es / 1000), "GPa"), res("calc.hertz.27", num(Re), "mm"),
        res("calc.hertz.28", num(h.a * 1000), "µm"), res("calc.hertz.29", num(2 * h.a), "mm"), res("calc.hertz.30", num(h.delta * 1000), "µm"),
        res("calc.hertz.31", num(h.p0), "MPa", r.margin < 1), res("calc.hertz.32", num(h.pMean), "MPa"), res("calc.hertz.33", isFinite(r.margin) ? num(r.margin) : "∞", "", r.margin < 1),
        res("calc.hertz.34", num(h.kn / 1000), "N/µm"), res("calc.hertz.35", num(r.kax / 1000), "N/µm"),
        res("calc.hertz.36", num(h.zTau * 1000), "µm"), res("calc.hertz.37", num(h.tauMax), "MPa"), res("calc.hertz.38", num(h.vm), "MPa")] };
  },
  keys: (r, p, M) => [K(t("calc.hertz.31"), "MPa", num(r.p0), "a = " + num(r.a * 1000) + " µm"), K(t("calc.hertz.34"), "N/µm", num(r.kn / 1000), "δ = " + num(r.delta * 1000) + " µm"),
    K(t("calc.hertz.33"), "", isFinite(r.margin) ? "× " + num(r.margin) : "∞", t("calc.hertz.39") + num(M.sigma) + " MPa", r.margin > 0 ? statOf(r.margin) : "bad")],
  formulas: (p, M, r) => [
    [t("calc.hertz.40"), fr("1", "E*") + " = " + fr("1 − " + sub("ν", "1") + "²", sub("E", "1")) + " + " + fr("1 − " + sub("ν", "2") + "²", sub("E", "2")),
      fr("1", "E*") + " = " + fr("1 − " + num(r.m1.nu) + "²", num(r.m1.E)) + " + " + fr("1 − " + num(r.m2.nu) + "²", num(r.m2.E)) + " ⇒ E* = " + num(r.Es) + " MPa", LIT.johnson],
    [t("calc.hertz.41") + geomTxt(p.geom) + ")", p.geom === "convex" ? "R = " + fr(sub("R", "1") + "·" + sub("R", "2"), sub("R", "1") + " + " + sub("R", "2")) : p.geom === "concave" ? "R = " + fr(sub("R", "1") + "·" + sub("R", "2"), sub("R", "2") + " − " + sub("R", "1")) : "R = " + sub("R", "1") + t("calc.hertz.42"),
      "R = " + num(r.Re) + " mm", LIT.johnson],
    [t("calc.hertz.43"), sub("F", "n") + " = " + fr("F", "n·cos θ"), sub("F", "n") + " = " + fr(num(p.F), num(r.n) + "·cos " + num(p.theta) + "°") + " = " + num(r.Fn) + " N", t("calc.hertz.44")],
    [t("calc.hertz.45"), "a = " + "(" + fr("3·" + sub("F", "n") + "·R", "4·E*") + ")<sup>1/3</sup>", "a = (" + fr("3·" + num(r.Fn) + "·" + num(r.Re), "4·" + num(r.Es)) + ")<sup>1/3</sup> = " + num(r.a) + " mm = " + num(r.a * 1000) + " µm", LIT.johnson],
    [t("calc.hertz.46"), "δ = " + fr("a²", "R"), "δ = " + fr(num(r.a) + "²", num(r.Re)) + " = " + num(r.delta * 1000) + " µm", LIT.johnson],
    [t("calc.hertz.47"), sub("p", "0") + " = " + fr("3·" + sub("F", "n"), "2π·a²"), sub("p", "0") + " = " + fr("3·" + num(r.Fn), "2π·" + num(r.a) + "²") + " = " + num(r.p0) + t("calc.hertz.48") + num(r.pMean) + " MPa = ⅔·p₀)", LIT.johnson],
    [t("calc.hertz.49"), sub("k", "n") + " = " + fr("d" + sub("F", "n"), "dδ") + " = 2·E*·a = " + fr("3·" + sub("F", "n"), "2·δ") + ",  " + sub("k", "ax") + " = n·" + sub("k", "n") + "·cos²θ",
      sub("k", "n") + " = 2·" + num(r.Es) + "·" + num(r.a) + " = " + num(r.kn) + " N/mm = " + num(r.kn / 1000) + " N/µm;  " + sub("k", "ax") + " = " + num(r.kax / 1000) + " N/µm", LIT.johnson + t("calc.hertz.50")],
    [t("calc.hertz.51"), sub("τ", "max") + t("calc.hertz.52") + sub("p", "0") + t("calc.hertz.53") + sub("σ", t("calc.hertz.54")) + t("calc.hertz.55") + sub("p", "0"),
      sub("τ", "max") + t("calc.hertz.56") + num(r.p0) + " = " + num(r.tauMax) + t("calc.hertz.57") + num(r.zTau * 1000) + t("calc.hertz.58") + num(r.vm) + " MPa", LIT.johnson + t("calc.hertz.59")],
    [t("calc.hertz.60"), "n = " + fr(sub("p", t("calc.hertz.61")), sub("p", "0")), "n = " + fr(num(M.sigma), num(r.p0)) + " = " + num(r.margin), t("calc.hertz.62")],
  ],
  assume: [t("calc.hertz.63"),
    t("calc.hertz.64"),
    t("calc.hertz.65"),
    t("calc.hertz.66"),
    t("calc.hertz.67")],
  source: LIT.johnson + "; " + LIT.slocum + ".",
});

CALCS.push({
  id: "kc", group: "Contact", name: t("calc.kc.2"), short: t("calc.kc.3"),
  inputs: [selIn("variant", t("calc.kc.5"), "maxwell", [["maxwell", t("calc.kc.7")], ["kelvin", t("calc.kc.9")]], "Geometrie"),
    f("R", t("calc.kc.10"), "mm", 6, 0.01, [1, 25, 1], "Geometrie"), bound(f("gamma", t("calc.kc.12"), "°", 90, 10, [30, 150, 0], "Geometrie"), 179, "γ"),
    bound(f("gammaC", t("calc.kc.14"), "°", 90, 10, [30, 150, 0], "Geometrie"), 179, "γₖ"),
    f("F", t("calc.kc.15"), "N", 60, 0.001, [1, 5000, 1], "Belasting"), bound(f("mu", t("calc.kc.17"), "–", 0.15, 0, [0.02, 0.6, 0], "Belasting"), 2, "μ")].concat(MAT_DEF),
  lim: P0_LIM,
  run: (p, M) => {
    const m1 = material(p.mat1), m2 = material(p.mat2);
    if (p.variant === "kelvin") return runKelvin(p, M, m1, m2);
    const k = kinCoupling({ F: p.F, R: p.R, gamma: p.gamma, mu: p.mu, E1: m1.E, nu1: m1.nu, E2: m2.E, nu2: m2.nu });
    const r = Object.assign({}, k, { margin: M.sigma / k.p0, m1, m2 }), w = [];
    if (r.margin < 1) w.push("p₀ = " + num(k.p0) + t("calc.hertz.16") + num(M.sigma) + t("calc.kc.18"));
    else if (r.margin < 1.5) w.push(t("calc.kc.19"));
    if (p.gamma < 60) w.push("γ = " + num(p.gamma) + t("calc.kc.20") + num(r.N) + t("calc.kc.21"));
    if (k.a / p.R > 0.1) w.push("a/R = " + num(k.a / p.R) + t("calc.kc.22"));
    return { r, warn: w,
      out: [res("calc.kc.23", num(k.N), "N"), res("calc.hertz.28", num(k.a * 1000), "µm"), res("calc.kc.24", num(k.delta * 1000), "µm"),
        res("calc.hertz.31", num(k.p0), "MPa", r.margin < 1), res("calc.hertz.33", isFinite(r.margin) ? num(r.margin) : "∞", "", r.margin < 1),
        res("calc.kc.25", num(k.kn / 1000), "N/µm"), res("calc.kc.26", num(k.kAx / 1000), "N/µm"),
        res("calc.kc.27", num(k.kt / 1000), "N/µm"), res("calc.kc.28", num(k.QGroove), "N"),
        res("calc.kc.29", num(k.xStick * 1e6), "nm"), res("calc.kc.30", num(k.xSlip * 1e6), "nm")] };
  },
  keys: (r, p, M) => [K(t("calc.hertz.35"), "N/µm", num(r.kAx / 1000), r.kelvin ? t("calc.kc.31") + r.gov.label : t("calc.kc.32") + num(r.N) + t("calc.kc.33")),
    K(t("calc.kc.34"), "nm", num(r.xSlip * 1e6), t("calc.kc.35") + num(p.mu)),
    K(t("calc.hertz.33"), "", isFinite(r.margin) ? "× " + num(r.margin) : "∞", "p₀ = " + num(r.p0) + " MPa" + (r.kelvin ? " (" + r.gov.label + ")" : ""), statOf(r.margin))],
  formulas: (p, M, r) => p.variant === "kelvin" ? kelvinFormulas(p, M, r) : [
    [t("calc.kc.36"), "6·N·sin(γ/2) = F  ⇒  N = " + fr("F", "6·sin(γ/2)"), "N = " + fr(num(p.F), "6·sin(" + num(p.gamma / 2) + "°)") + " = " + num(r.N) + " N", LIT.slocum + t("calc.kc.37")],
    [t("calc.kc.38"), fr("1", "E*") + " = " + fr("1 − " + sub("ν", "1") + "²", sub("E", "1")) + " + " + fr("1 − " + sub("ν", "2") + "²", sub("E", "2")), "E* = " + num(r.Es) + " MPa", LIT.johnson],
    [t("calc.kc.39"), "a = (" + fr("3·N·R", "4·E*") + ")<sup>1/3</sup>,  δ = " + fr("a²", "R") + ",  " + sub("p", "0") + " = " + fr("3·N", "2π·a²"),
      "a = " + num(r.a * 1000) + " µm, δ = " + num(r.delta * 1000) + " µm, p₀ = " + num(r.p0) + " MPa", LIT.johnson],
    [t("calc.kc.40"), sub("k", "n") + " = 2·E*·a", sub("k", "n") + " = 2·" + num(r.Es) + "·" + num(r.a) + " = " + num(r.kn / 1000) + " N/µm", LIT.johnson],
    [t("calc.kc.41"), sub("k", "ax") + " = 6·" + sub("k", "n") + "·sin²(γ/2)", sub("k", "ax") + " = 6·" + num(r.kn / 1000) + "·" + num(r.s ** 2) + " = " + num(r.kAx / 1000) + " N/µm", t("calc.kc.42")],
    [t("calc.kc.43"), fr("1", "G*") + " = " + fr("2 − " + sub("ν", "1"), sub("G", "1")) + " + " + fr("2 − " + sub("ν", "2"), sub("G", "2")) + ",  G = " + fr("E", "2(1+ν)"), "G* = " + num(r.Gs) + " MPa", LIT.johnson + t("calc.kc.44")],
    [t("calc.kc.45"), sub("k", "t") + " = 8·G*·a", sub("k", "t") + " = 8·" + num(r.Gs) + "·" + num(r.a) + " = " + num(r.kt / 1000) + " N/µm", LIT.johnson + t("calc.kc.46")],
    [t("calc.kc.47"), sub("k", t("calc.kc.48")) + " = 2·" + sub("k", "t") + ",  " + sub("Q", "slip") + " = 2·μ·N", sub("k", t("calc.kc.48")) + " = " + num(r.kGroove / 1000) + " N/µm,  " + sub("Q", "slip") + " = " + num(r.QGroove) + " N", t("calc.kc.49")],
    [t("calc.kc.34"), sub("x", "stick") + " = " + fr("μ·N", sub("k", "t")) + t("calc.kc.50") + sub("x", "slip") + " = " + fr("3·μ·N", "16·G*·a") + t("calc.kc.51") + sub("x", "stick"),
      sub("x", "stick") + " = " + num(r.xStick * 1e6) + " nm,  " + sub("x", "slip") + " = " + num(r.xSlip * 1e6) + " nm", LIT.johnson + t("calc.kc.52")],
    [t("calc.hertz.60"), "n = " + fr(sub("p", t("calc.hertz.61")), sub("p", "0")), "n = " + fr(num(M.sigma), num(r.p0)) + " = " + num(r.margin), t("calc.kc.53")],
  ],
  assume: [t("calc.kc.54"),
    t("calc.kc.55"),
    t("calc.kc.56"),
    t("calc.kc.57"),
    t("calc.kc.58"),
    t("calc.kc.59"),
    t("calc.kc.60")],
  source: LIT.slocum + "; " + LIT.slocum3 + "; " + LIT.johnson + ".",
});

// Kelvin-variant van de kinematische koppeling: krachten uit de statica per contactsoort, Hertz per contact
function runKelvin(p, M, m1, m2) {
  const k = kelvinCoupling({ F: p.F, R: p.R, gamma: p.gamma, gammaC: p.gammaC, mu: p.mu, E1: m1.E, nu1: m1.nu, E2: m2.E, nu2: m2.nu });
  const [cone, groove, flat] = k.contacts;
  const r = Object.assign({}, k, { margin: M.sigma / k.p0, m1, m2, kelvin: true, cone, groove, flat }), w = [];
  if (r.margin < 1) w.push("p₀ = " + num(k.p0) + t("calc.runkelvin.1") + k.gov.label + t("calc.runkelvin.2") + num(M.sigma) + t("calc.kc.18"));
  else if (r.margin < 1.5) w.push(t("calc.runkelvin.3") + k.gov.label + t("calc.runkelvin.4"));
  if (p.gamma < 60) w.push("γ = " + num(p.gamma) + t("calc.runkelvin.5") + num(groove.N) + t("calc.runkelvin.6"));
  if (p.gammaC < 60) w.push("γₖ = " + num(p.gammaC) + t("calc.runkelvin.7"));
  if (k.a / p.R > 0.1) w.push("a/R = " + num(k.a / p.R) + t("calc.kc.22"));
  if (k.gov.id !== "flat") w.push(t("calc.runkelvin.8") + num(flat.N) + t("calc.runkelvin.9") + k.gov.label + t("calc.runkelvin.10"));
  const pr = c => num(c.p0);
  return { r, warn: w,
    out: [res("calc.runkelvin.11", num(cone.N), "N"), res("calc.runkelvin.12", num(groove.N), "N"), res("calc.runkelvin.13", num(flat.N), "N"),
      res("calc.runkelvin.14", k.gov.label, ""),
      res("calc.runkelvin.15", num(k.a * 1000), "µm"), res("calc.runkelvin.16", num(k.delta * 1000), "µm"),
      res("calc.runkelvin.17", num(k.p0), "MPa", r.margin < 1), res("calc.runkelvin.18", pr(cone) + " / " + pr(groove) + " / " + pr(flat), "MPa"),
      res("calc.hertz.33", isFinite(r.margin) ? num(r.margin) : "∞", "", r.margin < 1),
      res("calc.runkelvin.19", num(k.kn / 1000), "N/µm"), res("calc.kc.26", num(k.kAx / 1000), "N/µm"),
      res("calc.runkelvin.20", num(k.kt / 1000), "N/µm"), res("calc.kc.28", num(k.QGroove), "N"),
      res("calc.runkelvin.21", num(k.xStick * 1e6), "nm"), res("calc.kc.30", num(k.xSlip * 1e6), "nm")] };
}
function kelvinFormulas(p, M, r) {
  const g = r.groove, c = r.cone, v = r.flat;
  return [
    [t("calc.kelvinformulas.1"), "Σ" + sub("F", "z") + t("calc.kelvinformulas.2") + fr("F", "3"), "F/3 = " + num(p.F / 3) + t("calc.kelvinformulas.3"), LIT.slocum + t("calc.kelvinformulas.4")],
    [t("calc.kelvinformulas.5"), t("calc.kelvinformulas.6"), "Σ" + sub("F", "x,y") + t("calc.kelvinformulas.7") + sub("z", "") + t("calc.kelvinformulas.8"), t("calc.kelvinformulas.9")],
    [t("calc.kelvinformulas.10"), sub("N", t("calc.kelvinformulas.11")) + " = " + fr("F", "3"), sub("N", t("calc.kelvinformulas.11")) + " = " + num(v.N) + " N", LIT.slocum],
    [t("calc.kelvinformulas.12"), "2·" + sub("N", "g") + "·sin(γ/2) = " + fr("F", "3") + "  ⇒  " + sub("N", "g") + " = " + fr("F", "6·sin(γ/2)"), sub("N", "g") + " = " + fr(num(p.F), "6·sin(" + num(p.gamma / 2) + "°)") + " = " + num(g.N) + " N", LIT.slocum + "; " + LIT.slocum3],
    [t("calc.kelvinformulas.13"), "3·" + sub("N", "t") + "·sin(γₖ/2) = " + fr("F", "3") + "  ⇒  " + sub("N", "t") + " = " + fr("F", "9·sin(γₖ/2)"), sub("N", "t") + " = " + fr(num(p.F), "9·sin(" + num(p.gammaC / 2) + "°)") + " = " + num(c.N) + " N", LIT.slocum],
    [t("calc.kc.38"), fr("1", "E*") + " = " + fr("1 − " + sub("ν", "1") + "²", sub("E", "1")) + " + " + fr("1 − " + sub("ν", "2") + "²", sub("E", "2")), "E* = " + num(r.Es) + " MPa", LIT.johnson],
    [t("calc.kelvinformulas.14"), "a = (" + fr("3·N·R", "4·E*") + ")<sup>1/3</sup>,  " + sub("p", "0") + " = " + fr("3·N", "2π·a²"),
      t("calc.kelvinformulas.15") + num(c.a * 1000) + " µm, p₀ = " + num(c.p0) + t("calc.kelvinformulas.16") + num(g.a * 1000) + " µm, p₀ = " + num(g.p0) + t("calc.kelvinformulas.17") + num(v.a * 1000) + " µm, p₀ = " + num(v.p0) + " MPa", LIT.johnson],
    [t("calc.kelvinformulas.18"), t("calc.kelvinformulas.19"), t("calc.kelvinformulas.20") + r.gov.label + t("calc.kelvinformulas.21") + num(r.gov.N) + t("calc.kelvinformulas.22") + num(r.p0) + " MPa", LIT.johnson],
    [t("calc.kelvinformulas.23"), sub("k", "n") + " = 2·E*·a", t("calc.kelvinformulas.24") + num(c.kn / 1000) + t("calc.kelvinformulas.25") + num(g.kn / 1000) + t("calc.kelvinformulas.26") + num(v.kn / 1000) + " N/µm", LIT.johnson],
    [t("calc.kc.41"), sub("k", "ax") + " = 3·" + sub("k", "n,t") + "·sin²(γₖ/2) + 2·" + sub("k", "n,g") + "·sin²(γ/2) + " + sub("k", "n,v"),
      sub("k", "ax") + " = " + num(3 * c.kn * c.s ** 2 / 1000) + " + " + num(2 * g.kn * g.s ** 2 / 1000) + " + " + num(v.kn / 1000) + " = " + num(r.kAx / 1000) + " N/µm", t("calc.kelvinformulas.27")],
    [t("calc.kelvinformulas.28"), "1/G* = (2 − " + sub("ν", "1") + ")/" + sub("G", "1") + " + (2 − " + sub("ν", "2") + ")/" + sub("G", "2") + ",  " + sub("k", "t") + " = 8·G*·a", "G* = " + num(r.Gs) + t("calc.kelvinformulas.29") + num(r.kt / 1000) + " N/µm", LIT.johnson + t("calc.kc.44")],
    [t("calc.kelvinformulas.30"), sub("x", "stick") + " = " + fr("μ·N", sub("k", "t")) + ";  " + sub("x", "slip") + t("calc.kc.51") + sub("x", "stick"), sub("x", "stick") + " = " + num(r.xStick * 1e6) + " nm,  " + sub("x", "slip") + " = " + num(r.xSlip * 1e6) + " nm", LIT.johnson + t("calc.kelvinformulas.31")],
    [t("calc.hertz.60"), "n = " + fr(sub("p", t("calc.hertz.61")), sub("p", "0")), "n = " + fr(num(M.sigma), num(r.p0)) + " = " + num(r.margin), t("calc.kc.53")],
  ];
}

// ---------- Dynamica ----------
const DMODE = [["zeta", t("calc.dmode.2")], ["c", t("calc.dmode.3")], ["Q", t("calc.dmode.4")]];
const dTxt = m => (DMODE.filter(o => o[0] === m)[0] || DMODE[0])[1];

CALCS.push({
  id: "msd", group: "Dynamica", noMat: true, name: t("calc.msd.3"), short: t("calc.msd.4"),
  inputs: [f("m", t("calc.msd.5"), "kg", 2, 0.0001, [0.001, 1000, 1], "Belasting"), f("k", t("calc.msd.6"), "N/mm", 5, 0.0001, [0.001, 10000, 1], "Geometrie"),
    selIn("dmode", t("calc.msd.8"), "zeta", DMODE, "Geometrie"), f("dval", t("calc.msd.10"), "–", 5, 0.0001, [0.01, 10000, 1], "Geometrie"),
    f("fd", t("calc.msd.12"), "Hz", 5, 0.0001, [0.01, 10000, 1], "Belasting")],
  run: (p, M) => {
    const s = msd(p), r = Object.assign({}, s), w = [];
    r.r = p.fd / s.fn; r.dyn = dynAmp(r.r, s.zeta); r.T = transmissibility(r.r, s.zeta); r.peak = peakAmp(s.zeta);
    r.ov = overshoot(s.zeta); r.tsx = settleTime(s.zeta, s.wn); const si = settleInfo(s.zeta, s.wn); r.ts = si.t; r.tsMethod = si.method; r.cstat = 1 / s.ks;
    if (s.zeta >= 1) w.push("ζ = " + num(s.zeta) + t("calc.msd.13"));
    if (s.zeta < 0.01) w.push("ζ = " + num(s.zeta) + t("calc.msd.14") + tTxt(r.ts) + ").");
    if (Math.abs(r.r - 1) < 0.2) w.push(t("calc.msd.15") + num(r.dyn) + ".");
    return { r, warn: w,
      out: [res("calc.msd.16", num(s.fn), "Hz"), res("calc.msd.17", num(s.wn), "rad/s"), res("calc.msd.18", isFinite(s.fd) ? num(s.fd) : "—", "Hz"),
        res("calc.msd.19", num(s.zeta * 100), "%"), res("calc.msd.20", num(s.c), "N·s/m"), res("calc.msd.21", num(s.cc), "N·s/m"), res("calc.msd.22", num(s.Q), ""),
        res("calc.msd.23", num(1000 / p.k), "µm/N"),
        res("calc.msd.24", num(r.r), ""), res("calc.msd.25", num(r.dyn * 1000 / p.k), "µm/N"),
        res("calc.msd.26", num(r.dyn), "×"), res("calc.msd.27", num(r.T), ""),
        res("calc.msd.28", num(r.peak), "×"), res("calc.msd.29", num(r.ov * 100), "%"), res("calc.msd.30", tFmt(r.ts)[0], tFmt(r.ts)[1])] };
  },
  keys: r => [K(t("calc.msd.16"), "Hz", num(r.fn), "f_d = " + (isFinite(r.fd) ? num(r.fd) + " Hz" : "—")), K(t("calc.msd.31"), "%", num(r.zeta * 100), "Q = " + num(r.Q) + " · c = " + num(r.c) + " N·s/m"),
    K(t("calc.msd.30"), tFmt(r.ts)[1], tFmt(r.ts)[0], t("calc.msd.32") + num(r.ov * 100) + " % · " + (r.tsMethod === "approx" ? "4/(ζ·ω_n)" : t("calc.msd.34")))],
  formulas: (p, M, r) => [
    [t("calc.leaf.50"), sub("f", "n") + " = " + fr("1", "2π") + "·√" + fr("k", "m"), sub("f", "n") + " = " + fr("1", "2π") + "·√" + fr(num(p.k * 1000), num(p.m)) + " = " + num(r.fn) + t("calc.msd.35"), LIT.denhartog + "; " + LIT.rao],
    [t("calc.msd.36") + dTxt(p.dmode) + t("calc.msd.37"), "ζ = " + fr("c", "2·√(k·m)") + " = " + fr("1", "2Q"),
      t("calc.msd.38") + num(p.k * 1000) + "·" + num(p.m) + ") = " + num(r.cc) + " N·s/m;  ζ = " + num(r.zeta) + " (" + num(r.zeta * 100) + " %),  c = " + num(r.c) + " N·s/m,  Q = " + num(r.Q), LIT.denhartog],
    [t("calc.msd.39"), sub("f", "d") + " = " + sub("f", "n") + "·√(1 − ζ²)", sub("f", "d") + " = " + (isFinite(r.fd) ? num(r.fd) + " Hz" : "— (ζ ≥ 1)"), LIT.rao],
    [t("calc.msd.40"), "|" + fr("x", "F") + "| = " + fr("1", "k") + "·" + fr("1", "√((1 − r²)² + (2ζr)²)") + ",  r = " + fr("f", sub("f", "n")),
      "r = " + num(r.r) + ":  |x/F| = " + num(r.dyn) + "/" + num(p.k) + " N/mm = " + num(r.dyn * 1000 / p.k) + " µm/N  (× " + num(r.dyn) + t("calc.msd.41"), LIT.denhartog + "; " + LIT.rao],
    [t("calc.msd.42"), "T = " + fr("√(1 + (2ζr)²)", "√((1 − r²)² + (2ζr)²)"), "T(" + num(r.r) + ") = " + num(r.T), LIT.rao + "; " + LIT.denhartog],
    [t("calc.msd.43"), sub("A", "max") + " = " + fr("1", "2ζ·√(1 − ζ²)") + t("calc.msd.44"), sub("A", "max") + " = " + num(r.peak) + " ×", LIT.denhartog],
    [t("calc.msd.45"), t("calc.msd.46") + fr("ζ", "√(1 − ζ²)") + t("calc.msd.47"), t("calc.msd.48") + num(r.ov * 100) + " %", LIT.rao + "; " + LIT.franklin],
    [t("calc.msd.49"), "ζ < 1:  " + sub("t", "s") + " ≈ " + fr("4", "ζ·" + sub("ω", "n")) + t("calc.msd.50"),
      (r.tsMethod === "approx" ? t("calc.msd.51") + tTxt(r.ts) + t("calc.msd.52") + tTxt(r.tsx) : t("calc.msd.53") + tTxt(r.ts) + t("calc.msd.54")), LIT.franklin],
  ],
  assume: [t("calc.msd.55"),
    t("calc.msd.56"),
    t("calc.msd.57"),
    t("calc.msd.58")],
  source: LIT.denhartog + "; " + LIT.rao + "; " + LIT.franklin + ".",
});

CALCS.push({
  id: "iso", group: "Dynamica", noMat: true, name: t("calc.iso.1"), short: t("calc.iso.2"),
  inputs: [f("m", t("calc.iso.3"), "kg", 100, 0.001, [0.1, 10000, 1], "Belasting"), f("k", t("calc.iso.4"), "N/mm", 20, 0.0001, [0.01, 10000, 1], "Geometrie"),
    f("zeta", t("calc.msd.31"), "%", 5, 0.01, [0.1, 100, 1], "Geometrie"), f("fd", t("calc.iso.5"), "Hz", 20, 0.01, [0.1, 1000, 1], "Belasting"),
    f("xin", t("calc.iso.7"), "µm", 1, 0, [0.001, 1000, 1], "Belasting")],
  run: (p, M) => {
    const r = isolator({ m: p.m, k: p.k, zeta: p.zeta, f: p.fd }), w = [];
    r.xout = r.T * p.xin; r.fn20 = fnForT(p.fd, 0.1); r.fiso = Math.SQRT2 * r.fn;
    if (!r.isolating) w.push("f = " + num(p.fd) + t("calc.iso.8") + num(r.fiso) + t("calc.iso.9") + num(r.T) + t("calc.iso.10"));
    else if (r.r < 3) w.push("f/f_n = " + num(r.r) + t("calc.iso.11"));
    if (Math.abs(r.r - 1) < 0.3) w.push(t("calc.iso.12") + num(r.r) + ").");
    if (p.zeta > 20) w.push("ζ = " + num(p.zeta) + t("calc.iso.13"));
    return { r, warn: w,
      out: [res("calc.msd.16", num(r.fn), "Hz"), res("calc.iso.14", num(r.dSt), "mm"), res("calc.msd.24", num(r.r), ""),
        res("calc.msd.27", num(r.T), ""), res("calc.iso.15", num(r.dB), "dB", r.T > 1), res("calc.iso.16", num(r.xout * 1000), "nm"),
        res("calc.iso.17", num(r.Tmax), ""), res("calc.iso.18", num(r.fiso), "Hz"),
        res("calc.iso.19", num(r.fn20), "Hz"), res("calc.iso.20", num(r.fn20 / r.fn), "")] };
  },
  keys: r => [K(t("calc.msd.16"), "Hz", num(r.fn), "δ_st = " + num(r.dSt) + " mm"), K(t("calc.iso.21"), "", num(r.T), t("calc.iso.22") + num(r.xout * 1000) + " nm"),
    K(t("calc.iso.15"), "dB", num(r.dB), r.isolating ? "f/f_n = " + num(r.r) : t("calc.iso.23"), r.T > 1 ? "bad" : r.T > 0.3 ? "warn" : "ok")],
  formulas: (p, M, r) => [
    [t("calc.iso.24"), sub("f", "n") + " = " + fr("1", "2π") + "·√" + fr("k", "m") + " ≈ " + fr(t("calc.iso.25"), "√" + sub("δ", "st") + "[m]"), sub("f", "n") + " = " + fr("1", "2π") + "·√" + fr(num(p.k * 1000), num(p.m)) + " = " + num(r.fn) + " Hz", LIT.harris + "; " + LIT.denhartog],
    [t("calc.iso.26"), sub("δ", "st") + " = " + fr("m·g", "k"), sub("δ", "st") + " = " + fr(num(p.m) + t("calc.iso.27"), num(p.k * 1000)) + " = " + num(r.dSt) + " mm", t("calc.iso.28")],
    [t("calc.iso.29"), "T = " + fr("√(1 + (2ζr)²)", "√((1 − r²)² + (2ζr)²)") + ",  r = " + fr("f", sub("f", "n")), "r = " + num(r.r) + ":  T = " + num(r.T), LIT.harris + "; " + LIT.rao + "; " + LIT.denhartog],
    [t("calc.iso.30"), "L = −20·log" + sub("", "10") + "(T)", "L = −20·log(" + num(r.T) + ") = " + num(r.dB) + " dB", LIT.harris],
    [t("calc.iso.31"), t("calc.iso.32"), sub("f", "iso") + " = √2·" + num(r.fn) + " = " + num(r.fiso) + " Hz", LIT.denhartog],
    [t("calc.iso.33"), "T ≈ " + fr("1", "r² − 1") + t("calc.iso.34") + sub("f", "n") + " = " + fr("f", "√(1 + 1/T)"), sub("f", "n") + t("calc.iso.35") + fr(num(p.fd), "√(1 + 10)") + " = " + num(r.fn20) + " Hz", LIT.harris],
    [t("calc.iso.16"), sub("x", t("calc.iso.36")) + " = T·" + sub("x", t("calc.iso.37")), sub("x", t("calc.iso.36")) + " = " + num(r.T) + "·" + num(p.xin) + " µm = " + num(r.xout * 1000) + " nm", LIT.harris],
  ],
  assume: [t("calc.iso.38"),
    t("calc.iso.39"),
    t("calc.iso.40"),
    t("calc.iso.41")],
  source: LIT.harris + "; " + LIT.rao + "; " + LIT.denhartog + ".",
});

CALCS.push({
  id: "servo", group: "Dynamica", noMat: true, name: t("calc.servo.1"), short: t("calc.servo.2"),
  inputs: [f("fn", t("calc.servo.4"), "Hz", 300, 0.01, [10, 5000, 1], "Geometrie"), f("div", t("calc.servo.6"), "–", 3, 1, [1.5, 10, 0], "Geometrie"),
    f("m", t("calc.servo.7"), "kg", 2, 0.0001, [0.01, 1000, 1], "Belasting"), f("Fd", t("calc.servo.9"), "N", 1, 0, [0.01, 1000, 1], "Belasting"),
    f("xmax", t("calc.servo.11"), "µm", 1, 0.0001, [0.001, 1000, 1], "Belasting")],
  run: (p, M) => {
    const s = servo({ fn: p.fn, div: p.div, m: p.m, Fd: p.Fd, xMax: p.xmax / 1000 }), r = Object.assign({}, s, { xum: s.x * 1000, marg: p.xmax / (s.x * 1000) }), w = [];
    if (p.div < 3) w.push("f_n/f_bw = " + num(p.div) + t("calc.servo.12"));
    if (r.marg < 1) w.push(t("calc.servo.13") + num(r.xum) + t("calc.servo.14") + num(p.xmax) + t("calc.servo.15") + num(s.fbwReq) + t("calc.servo.16") + num(s.fnReq) + " Hz.");
    return { r, warn: w,
      out: [res("calc.servo.17", num(s.fbw), "Hz"), res("calc.servo.18", num(s.kServo / 1000), "N/µm"),
        res("calc.servo.19", num(r.xum), "µm", r.marg < 1), res("calc.servo.20", isFinite(r.marg) ? num(r.marg) : "∞", "", r.marg < 1),
        res("calc.servo.21", num(s.kReq / 1000), "N/µm"), res("calc.servo.22", num(s.fbwReq), "Hz"), res("calc.servo.23", num(s.fnReq), "Hz"),
        res("calc.servo.24", num(s.kStruct / 1000), "N/µm"), res("calc.servo.25", num(s.kStructReq / 1000), "N/µm"), res("calc.servo.26", tFmt(s.tRise)[0], tFmt(s.tRise)[1])] };
  },
  keys: (r, p) => [K(t("calc.servo.27"), "Hz", num(r.fbw), t("calc.servo.28") + num(p.div)), K(t("calc.servo.29"), "N/µm", num(r.kServo / 1000), t("calc.servo.30")),
    K(t("calc.servo.31"), "µm", num(r.xum), t("calc.servo.32") + num(p.xmax) + " µm", statOf(r.marg))],
  formulas: (p, M, r) => [
    [t("calc.servo.33"), sub("f", "bw") + " ≈ " + fr(sub("f", "n"), "3 … 5"), sub("f", "bw") + " = " + fr(num(p.fn), num(p.div)) + " = " + num(r.fbw) + " Hz", t("calc.servo.34") + LIT.munnig],
    [t("calc.servo.35"), sub("k", "servo") + " ≈ m·(2π·" + sub("f", "bw") + ")²", sub("k", "servo") + " = " + num(p.m) + "·(2π·" + num(r.fbw) + ")² = " + num(r.kServo / 1000) + " N/µm", t("calc.servo.36") + LIT.franklin + "; " + LIT.munnig],
    [t("calc.servo.37"), "x ≈ " + fr(sub("F", "d"), sub("k", "servo")), "x = " + fr(num(p.Fd), num(r.kServo)) + " = " + num(r.xum) + " µm", t("calc.servo.38")],
    [t("calc.servo.39"), sub("k", "req") + " = " + fr(sub("F", "d"), sub("x", "max")) + ",  " + sub("f", "bw,req") + " = " + fr("1", "2π") + "·√" + fr(sub("k", "req"), "m"),
      sub("k", "req") + " = " + num(r.kReq / 1000) + " N/µm,  " + sub("f", "bw,req") + " = " + num(r.fbwReq) + " Hz", t("calc.servo.40")],
    [t("calc.servo.41"), sub("f", "n,req") + t("calc.servo.42") + sub("f", "bw,req") + ",  " + sub("k", "str") + " = m·(2π·" + sub("f", "n,req") + ")²", sub("f", "n,req") + " = " + num(r.fnReq) + " Hz,  " + sub("k", "str") + " = " + num(r.kStructReq / 1000) + " N/µm", t("calc.servo.43")],
    [t("calc.servo.44"), sub("t", "r") + " ≈ " + fr(t("calc.servo.45"), sub("f", "bw")), sub("t", "r") + " = " + tTxt(r.tRise), LIT.franklin],
  ],
  assume: [t("calc.servo.46"),
    t("calc.servo.47"),
    t("calc.servo.48"),
    t("calc.servo.49")],
  source: LIT.munnig + "; " + LIT.franklin + t("calc.servo.50"),
});

// ---------- Thermisch ----------
CALCS.push({
  id: "exp", group: "Thermisch", name: t("calc.exp.2"), short: t("calc.exp.3"),
  inputs: [f("L1", t("calc.exp.4"), "mm", 100, 0.01, [1, 2000, 1], "Geometrie"), f("L2", t("calc.exp.5"), "mm", 205, 0.01, [1, 2000, 1], "Geometrie"),
    f("dT", t("calc.exp.7"), "K", 5, 0, [0.01, 100, 1], "Belasting"),
    matIn("mat1", t("calc.exp.8"), "alu"), matIn("mat2", t("calc.exp.10"), "staal")],
  run: (p, M) => {
    const m1 = material(p.mat1), m2 = material(p.mat2);
    const r = athermal({ a1: m1.alpha, L1: p.L1, a2: m2.alpha, L2: p.L2, dT: p.dT, E1: m1.E, E2: m2.E });
    r.m1 = m1; r.m2 = m2; r.dev = (p.L2 - r.L2ath) / r.L2ath; r.per1 = m1.alpha * p.L1 * 1e-3, r.per2 = m2.alpha * p.L2 * 1e-3;     // µm/K
    r.driftK = (r.per2 - r.per1) * 1000;                                     // nm/K, onafhankelijk van ΔT
    const w = [];
    if (m1.id === m2.id) w.push(t("calc.exp.11"));
    if (Math.abs(r.driftK) > 300 * Math.abs(r.per1)) w.push(t("calc.exp.12") + num(Math.abs(r.driftK) / Math.abs(r.per1) / 10) + t("calc.exp.13") + num(r.L2ath) + " mm).");
    if (r.s1 > m1.sigma || r.s2 > m2.sigma) w.push(t("calc.exp.14") + num(Math.max(r.s1, r.s2)) + t("calc.exp.15"));
    if (Math.abs(r.dev) > 1 && r.L2ath > 5000) w.push(t("calc.exp.16"));
    return { r, warn: w,
      out: [res("calc.exp.17", num(r.d1 * 1000), "µm"), res("calc.exp.18", num(r.d2 * 1000), "µm"),
        res("calc.exp.19", num(r.per1), "µm/K"), res("calc.exp.20", num(r.per2), "µm/K"),
        res("calc.exp.21", num(r.dP * 1000), "µm"), res("calc.exp.22", num(r.driftK), "nm/K"), res("calc.exp.23", num(r.dP * 1e6), "nm"),
        res("calc.exp.24", num(r.Lnet), "mm"), res("calc.exp.25", num(r.L2ath), "mm"), res("calc.exp.26", num(r.dev * 100), "%"),
        res("calc.exp.27", num(r.s1), "MPa", r.s1 > m1.sigma), res("calc.exp.28", num(r.s2), "MPa", r.s2 > m2.sigma)] };
  },
  keys: (r, p) => [K(t("calc.exp.29"), "µm", num(r.d1 * 1000), num(r.per1) + " µm/K"), K(t("calc.exp.30"), "µm", num(r.dP * 1000), num(r.driftK) + t("calc.exp.31") + num(r.dP * 1e6) + " nm",
    Math.abs(r.dP) < 0.05 * Math.abs(r.d1) ? "ok" : Math.abs(r.dP) < 0.3 * Math.abs(r.d1) ? "warn" : "bad"), K(t("calc.exp.32"), "mm", num(r.L2ath), t("calc.exp.33") + num(r.dev * 100) + t("calc.exp.34"))],
  formulas: (p, M, r) => [
    [t("calc.exp.35"), "ΔL = α·L·ΔT", "ΔL₁ = " + num(r.m1.alpha) + "·10⁻⁶·" + num(p.L1) + "·" + num(p.dT) + " = " + num(r.d1 * 1000) + " µm;  ΔL₂ = " + num(r.m2.alpha) + "·10⁻⁶·" + num(p.L2) + "·" + num(p.dT) + " = " + num(r.d2 * 1000) + " µm", LIT.invar + "; " + LIT.roark],
    [t("calc.exp.36"), "P = " + sub("L", "2") + " − " + sub("L", "1") + ",  ΔP = (" + sub("α", "2") + sub("L", "2") + " − " + sub("α", "1") + sub("L", "1") + ")·ΔT", "ΔP = (" + num(r.m2.alpha) + "·" + num(p.L2) + " − " + num(r.m1.alpha) + "·" + num(p.L1) + ")·10⁻⁶·" + num(p.dT) + " = " + num(r.dP * 1000) + " µm", LIT.invar],
    [t("calc.exp.37"), "ΔP = 0  ⇒  " + fr(sub("L", "1"), sub("L", "2")) + " = " + fr(sub("α", "2"), sub("α", "1")), sub("L", "2") + " = " + num(p.L1) + "·" + fr(num(r.m1.alpha), num(r.m2.alpha)) + " = " + num(r.L2ath) + t("calc.exp.38") + num(p.L2) + " mm: " + num(r.dev * 100) + t("calc.exp.39"), LIT.invar],
    [t("calc.exp.40"), "σ = E·α·ΔT", "σ₁ = " + num(r.m1.E) + "·" + num(r.m1.alpha) + "·10⁻⁶·" + num(p.dT) + " = " + num(r.s1) + " MPa;  σ₂ = " + num(r.s2) + " MPa", LIT.roark],
  ],
  assume: [t("calc.exp.41"),
    t("calc.exp.42"),
    t("calc.exp.43"),
    t("calc.exp.44")],
  source: LIT.invar + "; " + LIT.roark + ".",
});

CALCS.push({
  id: "tau", group: "Thermisch", name: t("calc.tau.2"), short: t("calc.tau.3"),
  inputs: [f("L", t("calc.leaf.5"), "mm", 100, 0.01, [5, 500, 1], "Geometrie"), f("B", t("calc.tau.4"), "mm", 50, 0.01, [5, 500, 1], "Geometrie"), f("H", t("calc.tau.5"), "mm", 20, 0.01, [2, 500, 1], "Geometrie"),
    f("h", t("calc.tau.6"), "W/(m²·K)", 10, 0.01, [1, 200, 1], "Belasting"), f("P", t("calc.tau.7"), "W", 0.5, 0, [0.01, 100, 1], "Belasting"),
    f("dTo", t("calc.tau.9"), "K", 1, 0, [0.01, 50, 1], "Belasting"), f("t", t("calc.tau.10"), "min", 30, 0, [0.1, 600, 1], "Belasting"),
    matIn("mat", "Materiaal", "alu")],
  run: (p, M) => {
    const m = material(p.mat), l = lumped({ L: p.L, B: p.B, H: p.H, rho: m.rho, c: m.c, h: p.h, k: m.k, P: p.P }), w = [];
    const r = Object.assign({}, l, { mat: m, t95: 3 * l.tau, t99: Math.log(100) * l.tau });
    r.dTend = p.dTo + l.dTss; r.frac = 1 - Math.exp(-p.t * 60 / l.tau); r.dTt = r.dTend * r.frac;
    r.Lmax = Math.max(p.L, p.B, p.H); r.dLend = dLength(m.alpha, r.Lmax, r.dTend); r.dLt = dLength(m.alpha, r.Lmax, r.dTt);
    if (l.Bi > 0.1) w.push(t("calc.tau.11") + num(l.Bi) + t("calc.tau.12"));
    if (p.h < 3 || p.h > 100) w.push("h = " + num(p.h) + t("calc.tau.13"));
    return { r, warn: w,
      out: [res("calc.msd.5", num(l.m), "kg"), res("calc.tau.14", num(l.C), "J/K"), res("calc.tau.15", num(l.A * 1e4), "cm²"), res("calc.tau.16", num(l.Lc * 1000), "mm"),
        res("calc.tau.17", tFmt(l.tau)[0], tFmt(l.tau)[1]), res("calc.tau.18", tFmt(r.t95)[0], tFmt(r.t95)[1]), res("calc.tau.19", tFmt(r.t99)[0], tFmt(r.t99)[1]),
        res("calc.tau.20", num(r.frac * 100), "%"), res("calc.tau.21", num(r.dTend), "K"), res("calc.tau.22", num(r.dTt), "K"),
        res("calc.tau.23", num(r.dLend * 1000), "µm"), res("calc.tau.24", num(r.dLt * 1000), "µm"),
        res("calc.tau.25", num(l.Bi), "", l.Bi > 0.1)] };
  },
  keys: r => [K(t("calc.tau.17"), tFmt(r.tau)[1], tFmt(r.tau)[0], t("calc.tau.26") + tTxt(r.t95)), K(t("calc.tau.27"), "K", num(r.dTend), t("calc.tau.28") + num(r.dLend * 1000) + " µm"),
    K(t("calc.tau.29"), "", num(r.Bi), r.Bi <= 0.1 ? t("calc.tau.30") : t("calc.tau.31"), r.Bi <= 0.1 ? "ok" : r.Bi <= 0.3 ? "warn" : "bad")],
  formulas: (p, M, r) => [
    [t("calc.tau.32"), "V = L·B·H,  A = 2(L·B + L·H + B·H),  m = ρ·V", "V = " + num(r.V * 1e6) + " cm³,  A = " + num(r.A * 1e4) + " cm²,  m = " + num(r.mat.rho) + "·" + num(r.V) + " = " + num(r.m) + " kg", t("calc.tau.33")],
    [t("calc.tau.34"), "C = m·c", "C = " + num(r.m) + "·" + num(r.mat.c) + " = " + num(r.C) + " J/K", LIT.incropera],
    [t("calc.tau.35"), "τ = " + fr("m·c", "h·A"), "τ = " + fr(num(r.C), num(p.h) + "·" + num(r.A)) + " = " + num(r.tau) + " s = " + tTxt(r.tau), LIT.incropera],
    [t("calc.tau.36"), "ΔT(t) = " + sub("ΔT", t("calc.tau.37")) + t("calc.tau.38"), "t = " + num(p.t) + " min: " + num(r.frac * 100) + t("calc.tau.39") + num(r.dTend) + " K = " + num(r.dTt) + " K", LIT.incropera],
    [t("calc.tau.40"), sub("ΔT", t("calc.tau.37")) + " = ΔT + " + fr("P", "h·A"), sub("ΔT", t("calc.tau.37")) + " = " + num(p.dTo) + " + " + fr(num(p.P), num(p.h) + "·" + num(r.A)) + " = " + num(r.dTend) + " K", LIT.incropera],
    [t("calc.tau.41"), "ΔL = α·L·ΔT", "ΔL = " + num(r.mat.alpha) + "·10⁻⁶·" + num(r.Lmax) + "·" + num(r.dTend) + " = " + num(r.dLend * 1000) + t("calc.tau.42") + num(r.dLt * 1000) + t("calc.tau.43"), LIT.invar],
    [t("calc.tau.44"), t("calc.tau.45") + fr("h·" + sub("L", "c"), "k") + t("calc.tau.46") + sub("L", "c") + " = " + fr("V", "A"), t("calc.tau.45") + fr(num(p.h) + "·" + num(r.Lc), num(r.mat.k)) + " = " + num(r.Bi), LIT.incropera],
  ],
  assume: [t("calc.tau.47"),
    t("calc.tau.48"),
    t("calc.tau.49"),
    t("calc.tau.50"),
    t("calc.tau.51")],
  source: LIT.incropera + "; " + LIT.invar + ".",
});


// Thermisch centrum: stijve plaat op drie steunen met elk een vrije richting (blad, sleuf), uitzetting van plaat t.o.v. basis
const TC_AN = [90, 210, 330], TC_TH = [90, 30, 150];
const tcIn = [];
for (let i = 1; i <= 3; i++) {
  tcIn.push(f("r" + i, t("calc.tcin.1") + i + t("calc.tcin.2"), "mm", 50, 0, [5, 200, 0], "Geometrie"),
    f("a" + i, t("calc.tcin.1") + i + t("calc.tcin.3"), "°", TC_AN[i - 1], 0, [0, 360, 0], "Geometrie"),
    f("t" + i, t("calc.tcin.1") + i + t("calc.tcin.4"), "°", TC_TH[i - 1], 0, [0, 180, 0], "Geometrie"));
}
CALCS.push({
  id: "tc", group: "Thermisch", name: t("calc.tc.2"), short: t("calc.tc.3"),
  inputs: tcIn.concat([f("dT", t("calc.exp.7"), "K", 5, 0, [0.1, 50, 1], "Belasting"),
    f("rp", t("calc.tc.5"), "mm", 60, 0, [0, 200, 0], "Belasting"), f("ap", t("calc.tc.7"), "°", 0, 0, [0, 360, 0], "Belasting"),
    matIn("matP", t("calc.tc.9"), "alu"), matIn("matB", t("calc.tc.11"), "staal")]),
  run: (p, M) => {
    const mp = material(p.matP), mb = material(p.matB), w = [];
    const sup = [1, 2, 3].map(i => ({ x: p["r" + i] * Math.cos(p["a" + i] * DEG), y: p["r" + i] * Math.sin(p["a" + i] * DEG), th: p["t" + i] }));
    const c = thermalCentre(sup), dal = mp.alpha - mb.alpha, delta = dal * 1e-6 * p.dT;                     // δ: relatieve rek van de plaat t.o.v. de basis
    const probe = { x: p.rp * Math.cos(p.ap * DEG), y: p.rp * Math.sin(p.ap * DEG) };
    const r = { c, sup, probe, dal, delta, mp, mb, ok: !c.singular };
    const NA = t("calc.tc.nvt");
    if (c.singular) {
      w.push(t("calc.tc.12"));
    } else {
      const d = c.disp(probe);
      r.d = { x: d.x * delta, y: d.y * delta }; r.mag = Math.hypot(r.d.x, r.d.y); r.rc = Math.hypot(probe.x - c.c.x, probe.y - c.c.y);
      r.cd = Math.hypot(c.c.x, c.c.y); r.rot = c.theta * delta; r.forc = delta * c.resid; r.dK = r.mag * 1e6 / (p.dT > 0 ? p.dT : 1);
      if (c.ill) w.push(t("calc.tc.13") + num(c.det) + t("calc.tc.14"));
      if (!c.concurrent) w.push(t("calc.tc.15") + num(c.resid) + t("calc.tc.16") + num(Math.abs(r.rot) * 1e6) + t("calc.tc.17") + num(r.forc * 1000) + t("calc.tc.18"));
      if (r.cd > 3 * Math.max(p.r1, p.r2, p.r3, 1)) w.push(t("calc.tc.19") + num(r.cd) + t("calc.tc.20"));
      if (Math.abs(dal) < 1e-9) w.push(t("calc.tc.21"));
    }
    return { r, warn: w,
      out: [res("calc.tc.22", num(dal), "µm/(m·K)"), res("calc.tc.23", num(delta * 1e6), "µm/m"),
        res("calc.tc.24", c.singular ? NA : num(c.c.x), c.singular ? "" : "mm"), res("calc.tc.25", c.singular ? NA : num(c.c.y), c.singular ? "" : "mm"),
        res("calc.tc.26", c.singular ? NA : num(r.cd), c.singular ? "" : "mm"),
        res("calc.tc.27", c.singular ? NA : num(r.rot * 1e6), c.singular ? "" : "µrad", !c.singular && !c.concurrent),
        res("calc.tc.28", c.singular ? NA : num(c.resid), c.singular ? "" : "mm", !c.singular && !c.concurrent),
        res("calc.tc.29", c.singular ? NA : num(r.forc * 1000), c.singular ? "" : "µm"),
        res("calc.tc.30", c.singular ? NA : num(r.d.x * 1000), c.singular ? "" : "µm"), res("calc.tc.31", c.singular ? NA : num(r.d.y * 1000), c.singular ? "" : "µm"),
        res("calc.tc.32", c.singular ? NA : num(r.mag * 1000), c.singular ? "" : "µm"), res("calc.tc.33", c.singular ? NA : num(r.rc), c.singular ? "" : "mm"),
        res("calc.tc.34", c.singular ? NA : num(r.mag * 1e6 / (p.dT > 0 ? p.dT : 1)), c.singular ? "" : "nm/K"),
        res("calc.tc.35", c.singular ? NA : num(c.slide[0] * delta * 1000), c.singular ? "" : "µm"),
        res("calc.tc.36", c.singular ? NA : num(c.slide[1] * delta * 1000), c.singular ? "" : "µm"),
        res("calc.tc.37", c.singular ? NA : num(c.slide[2] * delta * 1000), c.singular ? "" : "µm"),
        res("calc.tc.38", c.singular ? t("calc.tc.39") : c.concurrent ? t("calc.tc.40") : t("calc.tc.41"), "", c.singular)] };
  },
  keys: (r, p) => [
    r.ok ? K(t("calc.tc.42"), "µm", num(r.mag * 1000), t("calc.tc.43") + num(r.rc) + t("calc.tc.44") + num(r.delta * 1e6) + " µm/m", r.mag * 1000 > 1 ? "warn" : "ok") : K(t("calc.tc.42"), "", t("calc.tc.nvt"), t("calc.tc.45"), "bad"),
    r.ok ? K(t("calc.tc.2"), "mm", num(r.c.c.x) + " ; " + num(r.c.c.y), t("calc.tc.46") + num(r.cd) + " mm") : K(t("calc.tc.2"), "", t("calc.tc.nvt"), t("calc.tc.39"), "bad"),
    r.ok ? K(t("calc.tc.47"), "µrad", num(r.rot * 1e6), r.c.concurrent ? t("calc.tc.48") : t("calc.tc.49") + num(r.c.resid) + " mm", r.c.concurrent ? "ok" : "warn") : K(t("calc.tc.47"), "", t("calc.tc.nvt"), t("calc.tc.50"), "bad")],
  formulas: (p, M, r) => {
    const c = r.c;
    if (c.singular) return [[t("calc.tc.51"), t("calc.tc.52"), t("calc.tc.53") + num(c.det), LIT.soemersTh + "; " + LIT.slocum]];
    const row = (i) => { const q = c.lines[i]; return "[" + num(q.nx) + ", " + num(q.ny) + ", " + num((-q.nx * q.y + q.ny * q.x) / c.L) + "]"; };
    return [
      [t("calc.tc.54"), "δ = (" + sub("α", t("calc.tc.55")) + " − " + sub("α", t("calc.tc.56")) + ")·ΔT", "δ = (" + num(r.mp.alpha) + " − " + num(r.mb.alpha) + ")·10⁻⁶·" + num(p.dT) + " = " + num(r.delta * 1e6) + " µm/m", LIT.invar],
      [t("calc.tc.57"), t("calc.tc.58"), t("calc.tc.59"), LIT.soemersTh + "; " + LIT.slocum],
      [t("calc.tc.60"), sub("n", "i") + "·d(" + sub("x", "i") + ") = 0,  " + sub("n", "i") + " = (−sin θ<sub>i</sub>, cos θ<sub>i</sub>) ⊥ " + sub("e", "i"), t("calc.tc.61") + row(0) + ", " + row(1) + ", " + row(2) + t("calc.tc.62") + num(c.det), LIT.soemersTh],
      [t("calc.tc.63"), "A·w = −b,  w = (u′<sub>x</sub>, u′<sub>y</sub>, L·θ′)", "u′ = (" + num(c.u.x) + "; " + num(c.u.y) + ") mm,  θ′ = " + num(c.theta) + t("calc.tc.64"), t("calc.tc.65")],
      [t("calc.tc.66"), "d(c) = 0  ⇒  c = −(I + θ′J)<sup>−1</sup>·u′", "c = (" + num(c.c.x) + "; " + num(c.c.y) + ") mm", LIT.soemersTh + t("calc.tc.67")],
      [t("calc.tc.68"), t("calc.tc.69"), c.concurrent ? t("calc.tc.70") + num(c.resid) + " mm, θ = 0" : t("calc.tc.71") + num(c.resid) + " mm, θ = " + num(r.rot * 1e6) + " µrad", LIT.slocum],
      [t("calc.tc.42"), "d(P) = (δ·I + θ·J)·(P − c);  |d| = δ·√(1 + θ′²)·|P − c|", "|d| = " + num(r.delta * 1e6) + "·10⁻⁶·" + num(Math.hypot(1, c.theta)) + "·" + num(r.rc) + " = " + num(r.mag * 1000) + t("calc.tc.72"), LIT.soemersTh],
      [t("calc.tc.73"), sub("s", "i") + " = d(" + sub("x", "i") + ")·" + sub("e", "i"), "s = " + num(c.slide[0] * r.delta * 1000) + ", " + num(c.slide[1] * r.delta * 1000) + ", " + num(c.slide[2] * r.delta * 1000) + " µm", t("calc.tc.74")],
      [t("calc.tc.75"), t("calc.tc.76"), t("calc.tc.77") + (c.cLS ? num(c.cLS.x) + "; " + num(c.cLS.y) : "–") + t("calc.tc.78") + num(r.forc * 1000) + " µm", t("calc.tc.79")],
    ];
  },
  assume: [t("calc.tc.80"),
    t("calc.tc.81"),
    t("calc.tc.82"),
    t("calc.tc.83"),
    t("calc.tc.84"),
    t("calc.tc.85")],
  source: LIT.soemersTh + "; " + LIT.slocum + ".",
});
}
buildCalcs();


// ---------- parametrische tekeningen ----------
// De SVG wordt één keer opgebouwd; daarna worden alleen attributen en tekst bijgewerkt.
const NS = "http://www.w3.org/2000/svg";
const f1 = x => Math.round(x * 10) / 10;
const badAttr = v => (typeof v === "number" ? !isFinite(v) : typeof v === "string" && /NaN|Infinity/.test(v));
function set(e, a) { for (const k in a) if (!badAttr(a[k])) e.setAttribute(k, a[k]); return e; }   // geen NaN/Infinity in de SVG: oude (geldige) waarde blijft staan
function mk(tag, attrs, parent) { const e = document.createElementNS(NS, tag); set(e, attrs || {}); if (parent) parent.appendChild(e); return e; }
function txt(parent, cls, anchor) { return mk("text", { class: "s-txt " + (cls || ""), "text-anchor": anchor || "middle" }, parent); }
const SVG_DEFS = '<defs><marker id="calcArr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" class="s-arrf"/></marker>' +
  '<pattern id="calcHatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V7" class="s-hl"/></pattern></defs>';
function mkDim(parent, one) {
  const a = { class: "s-dim", "marker-end": "url(#calcArr)" };
  if (!one) a["marker-start"] = "url(#calcArr)";
  return { p: mk("path", a, parent), t: txt(parent, "s-val", "middle") };
}
function setDim(d, x1, y1, x2, y2, tx, ty, label, anchor) {
  set(d.p, { d: "M" + f1(x1) + " " + f1(y1) + "L" + f1(x2) + " " + f1(y2) });
  set(d.t, { x: f1(tx), y: f1(ty), "text-anchor": anchor || "middle" }); d.t.textContent = label;
}
const showEl = (e, on) => { e.style.display = on ? "" : "none"; };
function mkBlock(parent) { return { r: mk("rect", { class: "s-fix" }, parent), h: mk("rect", { fill: "url(#calcHatch)" }, parent) }; }
function setBlock(b, x, y, w, h, hatch, on) {
  set(b.r, { x: f1(x), y: f1(y), width: f1(w), height: h });
  set(b.h, { x: f1(x), y: f1(y + h), width: f1(w), height: 7 });
  showEl(b.r, on !== false); showEl(b.h, hatch && on !== false);
}
// groen -> oranje -> rood bij oplopende σ/σ_toel
function stressCol(x) {
  x = isFinite(x) ? Math.max(0, Math.min(1, x)) : 1;
  const h = x < 0.5 ? 135 - 95 * (x / 0.5) : 40 - 40 * ((x - 0.5) / 0.5);
  return "hsl(" + Math.round(h) + ",68%,44%)";
}
function mkFoot(svg, R) { R.note = txt(svg, "s-small", "start"); R.leg = txt(svg, "s-small s-bold", "start"); set(R.note, { x: 10, y: 226 }); set(R.leg, { x: 10, y: 239 }); }
function setFoot(R, r, M, facs) {
  const ratio = r.sigma / M.sigma, col = stressCol(ratio);
  R.leg.textContent = "σ = " + num(r.sigma) + " MPa · " + Math.round(ratio * 100) + t("calc.setfoot.1"); R.leg.style.fill = col;
  const parts = facs.filter(x => x[1] > 1.15).map(x => x[0] + " ×" + num(x[1], 2));
  R.note.textContent = parts.length ? t("calc.setfoot.2") + parts.join(", ") : "";
  return col;
}
// doorsnede b × t (of draad d) als inzet
function mkInset(svg, R, wire) {
  R.inH = txt(svg, "s-small", "middle"); R.inH.textContent = t("calc.mkinset.1"); set(R.inH, { x: 275, y: 118 });
  if (wire) R.inC = mk("circle", { class: "s-sec", cx: 275, cy: 138, r: 16 }, svg);
  else R.inR = mk("rect", { class: "s-sec", x: 247, y: 126, width: 56 }, svg);
  R.in1 = txt(svg, "s-val"); R.in2 = txt(svg, "s-val");
}
function setInset(R, p, wire) {
  if (wire) { set(R.in1, { x: 275, y: 170 }); R.in1.textContent = "d = " + num(p.d) + " mm"; R.in2.textContent = ""; return 1; }
  const real = p.t / p.b * 56, bh = Math.min(Math.max(real, 3), 28);
  set(R.inR, { height: f1(bh) });
  set(R.in1, { x: 275, y: f1(126 + bh + 14) }); R.in1.textContent = "b = " + num(p.b) + " mm";
  set(R.in2, { x: 275, y: f1(126 + bh + 27) }); R.in2.textContent = "t = " + num(p.t) + " mm";
  return bh / real;
}

function beamFig(kind) {
  const wire = kind === "wire", n = kind === "par" ? 2 : 1;
  return {
    build(svg) {
      const R = { leaf: [] };
      R.ghost = mk("path", { class: "s-ghost" }, svg); R.ext = mk("path", { class: "s-ghost" }, svg);
      for (let k = 0; k < n; k++) R.leaf.push(mk("path", { class: "s-leaf" }, svg));
      R.base = mkBlock(svg); R.table = mkBlock(svg);
      R.tip = mk("circle", { class: "s-fix", r: 4 }, svg);
      R.dL = mkDim(svg); R.dU = mkDim(svg);
      mkInset(svg, R, wire); mkFoot(svg, R);
      return R;
    },
    draw(R, p, r, M) {
      const guided = !wire || p.bc === "guided", Lp = 150, s = Lp / p.L, yb = 200, yt = yb - Lp;
      const th = wire ? p.d : p.t, tp = Math.max(th * s, wire ? 1.8 : 3), tFac = tp / (th * s);
      let up = p.u * s, uFac = 1;
      if (up > 0 && up < 8) { uFac = 8 / up; up = 8; }
      up = Math.min(up, 70);
      const xs = n === 1 ? [150] : [125, 185], hw = 45, x0 = xs[0] - hw, x1 = xs[n - 1] + hw;
      const col = stressCol(r.sigma / M.sigma);
      set(R.ghost, { d: xs.map(x => "M" + x + " " + yb + "V" + yt).join("") });
      xs.forEach((xi, k) => {
        set(R.leaf[k], { d: "M" + xi + " " + yb + "C" + xi + " " + f1(yb - Lp / 3) + " " + f1(xi + (guided ? up : up / 2)) + " " + f1(yb - 2 * Lp / 3) + " " + f1(xi + up) + " " + yt, "stroke-width": f1(tp) });
        R.leaf[k].style.stroke = col;
      });
      setBlock(R.base, x0, yb, x1 - x0, 12, true);
      setBlock(R.table, x0 + up, yt - 12, x1 - x0, 12, false, guided);
      showEl(R.tip, !guided); set(R.tip, { cx: f1(xs[0] + up), cy: yt, r: f1(Math.max(tp / 2 + 1.5, 3.5)) });
      setDim(R.dL, x0 - 14, yb, x0 - 14, yt, x0 - 20, (yb + yt) / 2 + 4, "L = " + num(p.L) + " mm", "end");
      const yu = yt - 26, on = p.u > 0;
      showEl(R.dU.p, on); showEl(R.dU.t, on); showEl(R.ext, on);
      setDim(R.dU, xs[0], yu, xs[0] + up, yu, xs[0] + up / 2 + (up < 30 ? 20 : 0), yu - 6, "u = " + num(p.u) + " mm", up < 30 ? "start" : "middle");
      set(R.ext, { d: "M" + xs[0] + " " + (yt - 14) + "V" + (yu - 4) + "M" + f1(xs[0] + up) + " " + (yt - 14) + "V" + (yu - 4) });
      const insF = setInset(R, p, wire);
      setFoot(R, r, M, [[wire ? t("calc.beamfig.5") : t("calc.beamfig.6"), tFac], [t("calc.beamfig.7"), uFac], [t("calc.mkinset.1"), insF]]);
    },
  };
}

function crossFig() {
  return {
    build(svg) {
      const R = {};
      R.gA = mk("path", { class: "s-ghost" }, svg);
      R.la = mk("path", { class: "s-leaf" }, svg); R.lb = mk("path", { class: "s-leaf" }, svg);
      R.base = mkBlock(svg);
      R.tg = mk("g", {}, svg); R.table = mk("rect", { class: "s-fix" }, R.tg);
      R.dot = mk("circle", { r: 3.5, class: "s-pivot" }, svg);
      R.arc = mk("path", { class: "s-dim", "marker-end": "url(#calcArr)" }, svg); R.phiT = txt(svg, "s-val", "start");
      R.lT = txt(svg, "s-val", "end");
      mkInset(svg, R, false); mkFoot(svg, R);
      return R;
    },
    draw(R, p, r, M) {
      const C = { x: 150, y: 120 }, Ls = 140, al = 35 * DEG, h = Ls / 2 * Math.sin(al), v = Ls / 2 * Math.cos(al);
      const s = Ls / p.L, tp = Math.max(p.t * s, 3), tFac = tp / (p.t * s);
      let pd = p.phi, pf = 1;
      if (pd > 0 && pd < 7) { pf = 7 / pd; pd = 7; }
      pd = Math.min(pd, 25);
      const a = pd * DEG, co = Math.cos(a), si = Math.sin(a);
      const rot = (x, y) => [C.x + (x - C.x) * co - (y - C.y) * si, C.y + (x - C.x) * si + (y - C.y) * co];
      const col = stressCol(r.sigma / M.sigma), sa = Math.sin(al), ca = Math.cos(al);
      const leaf = (el, bx, dx) => {
        const P0 = [bx, C.y + v], T = rot(bx + 2 * h * dx, C.y - v), dr = [dx * sa * co + ca * si, dx * sa * si - ca * co];
        set(el, { d: "M" + f1(P0[0]) + " " + f1(P0[1]) + "C" + f1(P0[0] + dx * sa * Ls / 3) + " " + f1(P0[1] - ca * Ls / 3) + " " + f1(T[0] - dr[0] * Ls / 3) + " " + f1(T[1] - dr[1] * Ls / 3) + " " + f1(T[0]) + " " + f1(T[1]), "stroke-width": f1(tp) });
        el.style.stroke = col;
      };
      leaf(R.la, C.x - h, 1); leaf(R.lb, C.x + h, -1);
      set(R.gA, { d: "M" + f1(C.x - h) + " " + f1(C.y + v) + "L" + f1(C.x + h) + " " + f1(C.y - v) + "M" + f1(C.x + h) + " " + f1(C.y + v) + "L" + f1(C.x - h) + " " + f1(C.y - v) });
      setBlock(R.base, C.x - 75, C.y + v, 150, 12, true);
      set(R.table, { x: C.x - 75, y: f1(C.y - v - 12), width: 150, height: 12 });
      set(R.tg, { transform: "rotate(" + f1(pd) + " " + C.x + " " + C.y + ")" });
      set(R.dot, { cx: C.x, cy: C.y });
      const ra = 100, t0 = -60 * DEG, t1 = t0 + a;
      set(R.arc, { d: "M" + f1(C.x + ra * Math.cos(t0)) + " " + f1(C.y + ra * Math.sin(t0)) + "A" + ra + " " + ra + " 0 0 1 " + f1(C.x + ra * Math.cos(t1)) + " " + f1(C.y + ra * Math.sin(t1)) });
      const tm = t0 + a / 2; set(R.phiT, { x: f1(C.x + (ra + 8) * Math.cos(tm)), y: f1(C.y + (ra + 8) * Math.sin(tm) + 4) });
      R.phiT.textContent = "φ = " + num(p.phi) + "°";
      set(R.lT, { x: f1(C.x - h - 12), y: f1(C.y + v - 6) }); R.lT.textContent = "L = " + num(p.L) + " mm";
      const insF = setInset(R, p, false);
      setFoot(R, r, M, [[t("calc.beamfig.6"), tFac], [t("calc.crossfig.3"), pf], [t("calc.mkinset.1"), insF]]);
    },
  };
}

function notchFig() {
  return {
    build(svg) {
      const R = {};
      R.ghost = mk("path", { class: "s-ghost" }, svg);
      R.left = mk("path", { class: "s-fix" }, svg); R.lh = mk("rect", { fill: "url(#calcHatch)" }, svg);
      R.rg = mk("g", {}, svg); R.right = mk("path", { class: "s-fix" }, R.rg);
      R.neck = mk("rect", { class: "s-neck" }, svg);
      R.dT = mkDim(svg, true); R.dR = mk("path", { class: "s-dim", "marker-end": "url(#calcArr)" }, svg); R.rT = txt(svg, "s-val");
      R.arc = mk("path", { class: "s-dim", "marker-end": "url(#calcArr)" }, svg); R.phiT = txt(svg, "s-val", "start");
      R.bT = txt(svg, "s-val"); mkFoot(svg, R);
      return R;
    },
    draw(R, p, r, M) {
      const cx = 150, cy = 112, s = 80 / (p.t + 2 * p.R);
      const Rp = p.R * s, tp = Math.max(p.t * s, 3), tFac = tp / (p.t * s), H = tp + 2 * Rp, Lb = 50;
      let pd = p.phi, pf = 1;
      if (pd > 0 && pd < 6) { pf = 6 / pd; pd = 6; }
      pd = Math.min(pd, 25);
      const yT = cy - H / 2, yB = cy + H / 2, xl = cx - Rp - Lb, xr = cx + Rp + Lb, g = f1(Rp) + " " + f1(Rp) + " 0 0 ";
      set(R.left, { d: "M" + f1(xl) + " " + f1(yT) + "H" + f1(cx - Rp) + "A" + g + "0 " + cx + " " + f1(cy - tp / 2) + "V" + f1(cy + tp / 2) + "A" + g + "0 " + f1(cx - Rp) + " " + f1(yB) + "H" + f1(xl) + "Z" });
      set(R.lh, { x: f1(xl - 7), y: f1(yT), width: 7, height: f1(H) });
      set(R.right, { d: "M" + f1(xr) + " " + f1(yT) + "H" + f1(cx + Rp) + "A" + g + "1 " + cx + " " + f1(cy - tp / 2) + "V" + f1(cy + tp / 2) + "A" + g + "1 " + f1(cx + Rp) + " " + f1(yB) + "H" + f1(xr) + "Z" });
      set(R.rg, { transform: "rotate(" + f1(pd) + " " + cx + " " + cy + ")" });
      set(R.ghost, { d: "M" + f1(cx + Rp) + " " + f1(yT) + "H" + f1(xr) + "V" + f1(yB) + "H" + f1(cx + Rp) });
      const col = stressCol(r.sigma / M.sigma);
      set(R.neck, { x: f1(cx - Rp * 0.45), y: f1(cy - tp / 2), width: f1(Rp * 0.9), height: f1(tp) }); R.neck.style.fill = col;
      // t: pijl vanuit de onderste inkeping naar de dunste doorsnede
      setDim(R.dT, cx, cy + tp / 2 + Math.min(Rp * 0.8, 26), cx, cy + tp / 2, cx, yB + 14, "t = " + num(p.t) + " mm", "middle");
      // R: straal in de bovenste inkeping
      set(R.dR, { d: "M" + cx + " " + f1(yT) + "L" + f1(cx + Rp * 0.707) + " " + f1(yT + Rp * 0.707) });
      set(R.rT, { x: cx, y: f1(yT - 8) }); R.rT.textContent = "R = " + num(p.R) + " mm";
      const ra = Rp + Lb + 12, t1 = pd * DEG;
      set(R.arc, { d: "M" + f1(cx + ra) + " " + cy + "A" + f1(ra) + " " + f1(ra) + " 0 0 1 " + f1(cx + ra * Math.cos(t1)) + " " + f1(cy + ra * Math.sin(t1)) });
      set(R.phiT, { x: f1(cx + ra + 8), y: f1(cy + ra * Math.sin(t1) / 2 + 4) }); R.phiT.textContent = "φ = " + num(p.phi) + "°";
      set(R.bT, { x: cx, y: 212 }); R.bT.textContent = "b = " + num(p.b) + t("calc.notchfig.2");
      setFoot(R, r, M, [[t("calc.notchfig.3"), tFac], [t("calc.crossfig.3"), pf]]);
    },
  };
}
const FIGS = { leaf: beamFig("leaf"), par: beamFig("par"), cross: crossFig(), notch: notchFig(), wire: beamFig("wire") };

// ---------- tekeningen voor de nieuwe calculators ----------
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lg = Math.log10;
const arrowPath = (x1, y1, x2, y2) => "M" + f1(x1) + " " + f1(y1) + "L" + f1(x2) + " " + f1(y2);
function mkArrow(parent) { return mk("path", { class: "s-dim s-force", "marker-end": "url(#calcArr)" }, parent); }
function footLines(svg, R, y) { R.note = txt(svg, "s-small", "start"); R.leg = txt(svg, "s-small s-bold", "start"); set(R.note, { x: 10, y: y }); set(R.leg, { x: 10, y: y + 13 }); }
// logaritmische as met vaste pool van streepjes en labels
function mkLogAxis(svg, n, vertical) {
  const A = { g: [], t: [] };
  for (let i = 0; i < n; i++) { A.g.push(mk("path", { class: "s-grid" }, svg)); A.t.push(txt(svg, "s-small", vertical ? "end" : "middle")); }
  return A;
}
function setLogAxis(A, lo, hi, pos, vertical, edge0, edge1, labY) {
  // lo..hi = decaden (gehele getallen), pos(dec) = pixelpositie; edge = begin/eind van de lijn loodrecht erop
  for (let i = 0; i < A.g.length; i++) {
    const d = lo + i, on = d <= hi;
    showEl(A.g[i], on); showEl(A.t[i], on);
    if (!on) continue;
    const x = pos(d);
    set(A.g[i], { d: vertical ? "M" + f1(edge0) + " " + f1(x) + "H" + f1(edge1) : "M" + f1(x) + " " + f1(edge0) + "V" + f1(edge1) });
    set(A.t[i], vertical ? { x: f1(edge0 - 3), y: f1(x + 3) } : { x: f1(x), y: f1(labY) });
    A.t[i].textContent = num(Math.pow(10, d));
  }
}

function hertzFig() {
  return {
    build(svg) {
      const R = {};
      R.g = mk("g", {}, svg);
      R.body = mk("rect", { class: "s-fix", x: -80, y: 150, width: 480, height: 200 }, R.g);
      R.b2 = mk("circle", { class: "s-fix" }, R.g);
      R.b1 = mk("circle", { class: "s-ball" }, R.g);
      R.press = mk("path", { class: "s-press" }, R.g);
      R.patch = mk("path", { class: "s-patch" }, R.g);
      R.nrm = mk("path", { class: "s-ghost" }, R.g);
      R.td = mk("circle", { class: "s-pivot", r: 3 }, R.g);
      R.fa = mkArrow(svg); R.fT = txt(svg, "s-val", "start");
      R.fn = mkArrow(R.g); R.fnT = txt(svg, "s-val", "start");
      R.zT = txt(svg, "s-small", "start"); R.rT = txt(svg, "s-small", "end"); R.rl = mk("path", { class: "s-dim s-thin" }, R.g);
      footLines(svg, R, 214);
      return R;
    },
    draw(R, p, r, M) {
      const C = { x: 160, y: 150 }, conc = p.geom === "concave", conv = p.geom === "convex", n = +p.n;
      const R1 = clamp(24 + 14 * lg(Math.max(p.R1, 0.5) / 0.5) / 2, 24, 52), s = R1 / p.R1;         // px per mm
      const ok = r.Re > 0 && isFinite(r.a);
      const ap0 = ok ? r.a * s : 1, ap = clamp(ap0, 11, 54), ex = ap / ap0;
      const th = clamp(p.theta, 0, 75), tr = th * DEG;
      set(R.g, { transform: "rotate(" + f1(th) + " " + C.x + " " + C.y + ")" });
      showEl(R.body, p.geom === "flat");
      const R2 = clamp(R1 * p.R2 / p.R1, conc ? R1 * 1.25 : 14, conc ? R1 * 3.2 : 90);
      showEl(R.b2, conv || conc);
      set(R.b2, conc ? { cx: C.x, cy: C.y - R2, r: f1(R2) } : { cx: C.x, cy: C.y + R2, r: f1(R2) });
      set(R.b1, { cx: C.x, cy: f1(C.y - R1), r: f1(R1) });
      const col = stressCol(ok ? 1 / r.margin : 0);
      const hp = 17;
      set(R.press, { d: "M" + f1(C.x - ap) + " " + C.y + "A" + f1(ap) + " " + hp + " 0 0 0 " + f1(C.x + ap) + " " + C.y + "Z" }); R.press.style.fill = col;
      set(R.patch, { d: "M" + f1(C.x - ap) + " " + C.y + "H" + f1(C.x + ap), "stroke-width": 3 });
      set(R.nrm, { d: "M" + C.x + " " + f1(C.y + 22) + "V" + f1(C.y - 2 * R1 - 6) });
      set(R.td, { cx: C.x, cy: f1(C.y + 0.48 * ap) });
      // belasting F langs de verticale as, door het middelpunt van de bol
      const xc = C.x + R1 * Math.sin(tr), yc = C.y - R1 * Math.cos(tr);
      set(R.fa, { d: arrowPath(xc, 12, xc, yc - R1 - 2) });
      set(R.fT, { x: f1(xc + 6), y: 24 }); R.fT.textContent = "F = " + num(p.F) + " N";
      const rt = (x, y) => [C.x + (x - C.x) * Math.cos(tr) - (y - C.y) * Math.sin(tr), C.y + (x - C.x) * Math.sin(tr) + (y - C.y) * Math.cos(tr)];
      showEl(R.fn, th > 0.5 || n > 1); showEl(R.fnT, th > 0.5 || n > 1);
      set(R.fn, { d: arrowPath(C.x, C.y - 2 * R1 - 22, C.x, C.y - 2 * R1 - 2) });
      const tp = rt(C.x, C.y - 2 * R1 - 24); set(R.fnT, { x: f1(tp[0] + 6), y: f1(tp[1] + 2) }); R.fnT.textContent = "F_n = " + num(r.Fn) + " N";
      const zp = rt(C.x + 6, C.y + 0.48 * ap + 12); set(R.zT, { x: f1(zp[0] + 4), y: f1(zp[1]) }); R.zT.textContent = t("calc.hertzfig.5");
      const rp = rt(C.x - R1 * 0.866, C.y - R1 - R1 * 0.5);
      set(R.rl, { d: "M" + C.x + " " + f1(C.y - R1) + "L" + f1(C.x - R1 * 0.866) + " " + f1(C.y - R1 - R1 * 0.5) });
      set(R.rT, { x: f1(rp[0] - 4), y: f1(rp[1] + 1) }); R.rT.textContent = "R₁ = " + num(p.R1) + " mm";
      R.note.textContent = ok ? "2a = " + num(2 * r.a * 1000) + " µm" + (ex > 1.15 ? t("calc.hertzfig.6") + num(ex, 2) + t("calc.hertzfig.7") : "") + " · δ = " + num(r.delta * 1000) + " µm" : "";
      R.leg.textContent = ok ? "p₀ = " + num(r.p0) + " MPa · " + Math.round(100 / r.margin) + t("calc.hertzfig.8") : t("calc.hertzfig.9"); R.leg.style.fill = col;
    },
  };
}

function kcFig() {
  return {
    build(svg) {
      const R = { gr: [], ba: [], ax: [] };
      R.tri = mk("path", { class: "s-ghost" }, svg);
      R.bt = [];
      for (let i = 0; i < 3; i++) { R.gr.push(mk("path", { class: "s-slot" }, svg)); R.ba.push(mk("circle", { class: "s-ball", r: 9 }, svg)); R.ax.push(mk("path", { class: "s-ghost" }, svg)); R.bt.push(txt(svg, "s-small s-bold", "middle")); }
      R.cen = mk("circle", { class: "s-fix", cx: 82, cy: 108, r: 7 }, svg); R.cenx = mk("path", { class: "s-dim", d: "M78.5 104.5L85.5 111.5M85.5 104.5L78.5 111.5" }, svg);
      R.tv = txt(svg, "s-small", "middle"); set(R.tv, { x: 82, y: 20 }); R.tv.textContent = t("calc.kcfig.2");
      R.fT = txt(svg, "s-val", "start"); set(R.fT, { x: 88, y: 121 });
      R.sv = txt(svg, "s-small", "middle"); set(R.sv, { x: 232, y: 20 }); R.sv.textContent = t("calc.kcfig.3");
      R.fl1 = mk("path", { class: "s-fix" }, svg); R.fl2 = mk("path", { class: "s-fix" }, svg);
      R.bl = mk("circle", { class: "s-ball" }, svg);
      R.c1 = mk("path", { class: "s-patch" }, svg); R.c2 = mk("path", { class: "s-patch" }, svg);
      R.n1 = mkArrow(svg); R.n2 = mkArrow(svg); R.fa = mkArrow(svg);
      R.nT = txt(svg, "s-val", "middle"); R.gT = txt(svg, "s-small", "middle"); R.arc = mk("path", { class: "s-dim s-thin" }, svg);
      footLines(svg, R, 226);
      return R;
    },
    draw(R, p, r, M) {
      const c0 = { x: 82, y: 108 }, rr = 52, ang = [-90, 30, 150];
      const pts = ang.map(a => [c0.x + rr * Math.cos(a * DEG), c0.y + rr * Math.sin(a * DEG)]);
      set(R.tri, { d: "M" + pts.map(q => f1(q[0]) + " " + f1(q[1])).join("L") + "Z" });
      const kel = !!r.kelvin, gi = kel ? ["cone", "groove", "flat"].indexOf(r.gov.id) : -1;
      ang.forEach((a, i) => {
        let ux = Math.cos(a * DEG), uy = Math.sin(a * DEG), q = pts[i], pa = "";
        if (kel && i === 1) { const dx = pts[0][0] - q[0], dy = pts[0][1] - q[1], dl = Math.hypot(dx, dy); ux = dx / dl; uy = dy / dl; }      // groefas wijst naar de tetraëder
        if (kel && i === 0) {                                                   // tetraëder: drie facetten rond de bol
          const tp = [0, 120, 240].map(t => [q[0] + 17 * Math.cos((t + 90) * DEG), q[1] + 17 * Math.sin((t + 90) * DEG)]);
          pa = "M" + tp.map(z => f1(z[0]) + " " + f1(z[1])).join("L") + "Z";
          set(R.gr[i], { d: pa, "stroke-width": 3, "stroke-linejoin": "round" });
        } else if (kel && i === 2) {                                            // plat vlak: vierkante pad
          set(R.gr[i], { d: "M" + f1(q[0] - 14) + " " + f1(q[1] - 14) + "h28v28h-28Z", "stroke-width": 3, "stroke-linejoin": "round" });
        } else set(R.gr[i], { d: "M" + f1(q[0] - ux * 22) + " " + f1(q[1] - uy * 22) + "L" + f1(q[0] + ux * 16) + " " + f1(q[1] + uy * 16), "stroke-width": 11 });
        set(R.ba[i], { cx: f1(q[0]), cy: f1(q[1]) });
        R.ba[i].style.stroke = kel && i === gi ? "var(--driver)" : ""; R.ba[i].style.strokeWidth = kel && i === gi ? "2.6" : "";
        showEl(R.ax[i], !(kel && i !== 1));
        set(R.ax[i], { d: "M" + f1(q[0] - ux * 22) + " " + f1(q[1] - uy * 22) + "L" + f1(q[0] + ux * 16) + " " + f1(q[1] + uy * 16) });
        const cn = kel ? [r.cone, r.groove, r.flat][i] : null;
        showEl(R.bt[i], kel);
        if (kel) { set(R.bt[i], i === 0 ? { x: f1(q[0] + 26), y: f1(q[1] + 4), "text-anchor": "start" } : { x: f1(q[0]), y: f1(q[1] + 36), "text-anchor": "middle" }); R.bt[i].textContent = cn.count + "×" + num(cn.N) + " N"; R.bt[i].style.fill = i === gi ? "var(--driver)" : ""; }
      });
      R.fT.textContent = "F";
      // doorsnede: V-groef met opening γ, bol met straal R (log-schaal)
      const g2 = p.gamma / 2 * DEG, sg = Math.sin(g2), cg = Math.cos(g2);
      const Rp = clamp(13 + 10 * lg(Math.max(p.R, 1)), 13, 26), ax = 232, ay = 188;
      const d = Rp / sg, bc = { x: ax, y: ay - d };
      const len = clamp(d + Rp * 1.6, 60, 150), ex = len * sg, ey = len * cg;
      set(R.fl1, { d: "M" + f1(ax - ex) + " " + f1(ay - ey) + "L" + ax + " " + ay + "L" + f1(ax + ex) + " " + f1(ay - ey) + "V" + f1(ay + 8) + "H" + f1(ax - ex) + "Z" });
      set(R.fl2, { d: "M" + f1(ax - ex) + " " + f1(ay - ey) + "L" + ax + " " + ay + "L" + f1(ax + ex) + " " + f1(ay - ey) });
      showEl(R.fl2, false);
      set(R.bl, { cx: f1(bc.x), cy: f1(bc.y), r: f1(Rp) });
      const nL = [cg, -sg], nR = [-cg, -sg];                                                  // naar de bol toe (links- en rechtsflank)
      const cpL = [bc.x - nL[0] * Rp, bc.y - nL[1] * Rp], cpR = [bc.x - nR[0] * Rp, bc.y - nR[1] * Rp];
      const gN = r.kelvin ? r.groove.N : r.N, gA = r.kelvin ? r.groove.a : r.a;
      const ap = clamp(gA * Rp / p.R, 2.5, 12), tl = [sg, cg];
      set(R.c1, { d: "M" + f1(cpL[0] - tl[0] * ap) + " " + f1(cpL[1] + tl[1] * ap) + "L" + f1(cpL[0] + tl[0] * ap) + " " + f1(cpL[1] - tl[1] * ap), "stroke-width": 3 });
      set(R.c2, { d: "M" + f1(cpR[0] + tl[0] * ap) + " " + f1(cpR[1] + tl[1] * ap) + "L" + f1(cpR[0] - tl[0] * ap) + " " + f1(cpR[1] - tl[1] * ap), "stroke-width": 3 });
      set(R.n1, { d: arrowPath(cpL[0] - nL[0] * 26, cpL[1] - nL[1] * 26, cpL[0] - nL[0] * 2, cpL[1] - nL[1] * 2) });
      set(R.n2, { d: arrowPath(cpR[0] - nR[0] * 26, cpR[1] - nR[1] * 26, cpR[0] - nR[0] * 2, cpR[1] - nR[1] * 2) });
      set(R.fa, { d: arrowPath(bc.x, 34, bc.x, bc.y - Rp - 2) });
      showEl(R.nT, false);
      set(R.gT, { x: ax, y: f1(ay + 18) }); R.gT.textContent = "γ = " + num(p.gamma) + "° · N = " + num(gN) + t("calc.kcfig.9");
      const ra = 22;
      set(R.arc, { d: "M" + f1(ax - ra * sg) + " " + f1(ay - ra * cg) + "A" + ra + " " + ra + " 0 0 0 " + f1(ax + ra * sg) + " " + f1(ay - ra * cg) });
      const col = stressCol(1 / r.margin);
      R.note.textContent = kel ? t("calc.kelvinformulas.20") + r.gov.label + " · 2a = " + num(2 * r.a * 1000) + " µm · p₀ = " + num(r.p0) + " MPa" : t("calc.kcfig.10") + num(2 * r.a * 1000) + " µm · k_t = " + num(r.kt / 1000) + " N/µm · p₀ = " + num(r.p0) + " MPa";
      R.leg.textContent = t("calc.kcfig.11") + num(r.xSlip * 1e6) + t("calc.kcfig.12") + num(r.kAx / 1000) + " N/µm"; R.leg.style.fill = col;
    },
  };
}

function msdFig() {
  return {
    build(svg) {
      const R = {};
      R.wall = mk("rect", { class: "s-fix", x: 14, y: 20, width: 8, height: 84 }, svg); R.wh = mk("rect", { fill: "url(#calcHatch)", x: 6, y: 20, width: 8, height: 84 }, svg);
      R.sp = mk("path", { class: "s-leaf s-spring" }, svg);
      R.rod1 = mk("path", { class: "s-leaf s-thin", d: "M22 88H64" }, svg); R.cyl = mk("rect", { class: "s-fix", x: 64, y: 79, width: 46, height: 18 }, svg);
      R.pst = mk("path", { class: "s-leaf s-thin", d: "M104 82V94M104 88H150" }, svg);
      R.mass = mk("rect", { class: "s-ball" }, svg); R.mT = txt(svg, "s-val", "middle");
      R.fa = mkArrow(svg); R.fT = txt(svg, "s-val", "start");
      R.kT = txt(svg, "s-small", "middle"); R.cT = txt(svg, "s-small", "start");
      R.cap = txt(svg, "s-small s-bold", "start"); set(R.cap, { x: 34, y: 124 }); R.cap.textContent = t("calc.msdfig.3");
      R.ax = mk("path", { class: "s-axis", d: "M34 131V205H306" }, svg);
      R.band = mk("rect", { class: "s-band" }, svg); R.one = mk("path", { class: "s-ghost" }, svg);
      R.cv = mk("path", { class: "s-curve" }, svg); R.ts = mk("path", { class: "s-ghost" }, svg); R.tsT = txt(svg, "s-small", "start");
      R.t0 = txt(svg, "s-small", "start"); set(R.t0, { x: 34, y: 217 }); R.t0.textContent = "0";
      R.t1 = txt(svg, "s-small", "end"); set(R.t1, { x: 306, y: 217 }); R.y1 = txt(svg, "s-small", "end"); set(R.y1, { x: 31, y: 0 });
      footLines(svg, R, 228);
      return R;
    },
    draw(R, p, r, M) {
      const mw = clamp(18 + 8.5 * (lg(p.m) + 3), 18, 66), mh = clamp(mw, 30, 66), mx = 150, my = 62 - mh / 2 + 22;
      set(R.mass, { x: mx, y: f1(my), width: f1(mw), height: f1(mh) });
      set(R.mT, { x: f1(mx + mw / 2), y: f1(my + mh / 2 + 3.5) }); R.mT.textContent = "m";
      const n = 8, x0 = 22, x1 = mx, ys = 44, amp = 9, seg = (x1 - x0 - 20) / n;
      let d = "M" + x0 + " " + ys + "H" + (x0 + 10);
      for (let i = 0; i < n; i++) d += "L" + f1(x0 + 10 + seg * (i + 0.5)) + " " + (ys + (i % 2 ? amp : -amp));
      d += "L" + f1(x1 - 10) + " " + ys + "H" + x1;
      set(R.sp, { d, "stroke-width": f1(0.9 + 2.4 * clamp((lg(p.k) + 3) / 7, 0, 1)) });
      set(R.kT, { x: 86, y: 28 }); R.kT.textContent = "k = " + num(p.k) + " N/mm";
      set(R.cT, { x: 28, y: 110 }); R.cT.textContent = "c = " + num(r.c) + " N·s/m (ζ = " + num(r.zeta * 100) + " %)";
      R.cyl.style.fillOpacity = f1(0.25 + 0.75 * clamp(r.zeta, 0, 1));
      set(R.fa, { d: arrowPath(mx + mw + 4, my + mh / 2, mx + mw + 44, my + mh / 2) }); set(R.fT, { x: f1(mx + mw + 22), y: f1(my + mh / 2 - 7), "text-anchor": "middle" }); R.fT.textContent = "F";
      // stapresponsie
      const zt = r.zeta, wn = r.wn, ts = r.ts;
      const tEnd = Math.max(ts * 1.3, 2 / r.fn), ymax = Math.max(1.3, 1 + r.ov + 0.12);
      const X0 = 34, X1 = 304, Y0 = 205, Y1 = 134, X = t => X0 + t / tEnd * (X1 - X0), Y = v => Y0 - v / ymax * (Y0 - Y1);
      let cd = "";
      for (let i = 0; i <= 160; i++) { const t = tEnd * i / 160; cd += (i ? "L" : "M") + f1(X(t)) + " " + f1(Y(stepResp(zt, wn, t))); }
      set(R.cv, { d: cd }); set(R.one, { d: "M" + X0 + " " + f1(Y(1)) + "H" + X1 });
      set(R.band, { x: X0, y: f1(Y(1.02)), width: X1 - X0, height: f1(Y(0.98) - Y(1.02)) });
      set(R.ts, { d: "M" + f1(X(ts)) + " " + Y1 + "V" + Y0 });
      set(R.tsT, { x: f1(Math.min(X(ts) + 4, 230)), y: 143 }); R.tsT.textContent = "t_s = " + tTxt(ts);
      R.t1.textContent = tTxt(tEnd); set(R.y1, { y: f1(Y(1) + 3) }); R.y1.textContent = "1";
      R.note.textContent = "f_n = " + num(r.fn) + t("calc.msdfig.7") + num(r.ov * 100) + " % · Q = " + num(r.Q);
      R.leg.textContent = t("calc.msdfig.8") + num(p.fd) + " Hz: T = " + num(r.T) + t("calc.msdfig.9") + num(r.dyn); R.leg.style.fill = "";
    },
  };
}

function isoFig() {
  const NV = 9, NH = 9;
  return {
    build(svg) {
      const R = {};
      R.zone = mk("rect", { class: "s-zone" }, svg);
      R.av = mkLogAxis(svg, NV, false); R.ah = mkLogAxis(svg, NH, true);
      R.fr = mk("path", { class: "s-axis", d: "M44 14V190H306" }, svg);
      R.one = mk("path", { class: "s-ghost" }, svg);
      R.cv = mk("path", { class: "s-curve" }, svg);
      R.fnL = mk("path", { class: "s-ghost" }, svg); R.fnT = txt(svg, "s-small", "middle");
      R.fL = mk("path", { class: "s-dim s-thin" }, svg); R.dot = mk("circle", { class: "s-pivot", r: 4 }, svg); R.dT = txt(svg, "s-val", "start");
      R.xl = txt(svg, "s-small", "end"); set(R.xl, { x: 306, y: 213 }); R.xl.textContent = t("calc.isofig.2");
      R.yl = txt(svg, "s-small", "start"); set(R.yl, { x: 6, y: 10 }); R.yl.textContent = "T";
      footLines(svg, R, 222);
      return R;
    },
    draw(R, p, r, M) {
      const z = r.z, fn = r.fn, X0 = 44, X1 = 306, Y0 = 190, Y1 = 14;
      let lx0 = Math.floor(lg(Math.min(fn, p.fd) / 4)), lx1 = Math.ceil(lg(Math.max(fn, p.fd) * 4));
      while (lx1 - lx0 < 2) lx1++;
      lx1 = Math.min(lx1, lx0 + NV - 1);
      const Tf = transmissibility(Math.pow(10, lx1) / fn, z), lyHi = Math.max(1, Math.ceil(lg(r.Tmax * 1.4)));
      let lyLo = Math.floor(lg(Math.max(Math.min(Tf, r.T) / 3, 1e-9)));
      lyLo = Math.max(lyLo, lyHi - (NH - 1)); if (lyHi - lyLo < 2) lyLo = lyHi - 2;
      const X = f => X0 + (lg(f) - lx0) / (lx1 - lx0) * (X1 - X0), Y = T => Y0 - (lg(T) - lyLo) / (lyHi - lyLo) * (Y0 - Y1);
      const cl = T => clamp(Y(T), Y1, Y0);
      setLogAxis(R.av, lx0, lx1, d => X0 + (d - lx0) / (lx1 - lx0) * (X1 - X0), false, Y1, Y0, 202);
      setLogAxis(R.ah, lyLo, lyHi, d => Y0 - (d - lyLo) / (lyHi - lyLo) * (Y0 - Y1), true, X0, X1);
      let d = "";
      for (let i = 0; i <= 200; i++) { const f = Math.pow(10, lx0 + (lx1 - lx0) * i / 200); d += (i ? "L" : "M") + f1(X(f)) + " " + f1(cl(transmissibility(f / fn, z))); }
      set(R.cv, { d });
      set(R.one, { d: "M" + X0 + " " + f1(Y(1)) + "H" + X1 });
      const xz = clamp(X(Math.SQRT2 * fn), X0, X1);
      set(R.zone, { x: X0, y: Y1, width: f1(xz - X0), height: f1(Y0 - Y1) });
      set(R.fnL, { d: "M" + f1(X(fn)) + " " + Y1 + "V" + Y0 }); set(R.fnT, { x: f1(clamp(X(fn), 70, 290)), y: Y1 - 2 }); R.fnT.textContent = "f_n = " + num(fn) + " Hz";
      const xf = X(p.fd), yf = cl(r.T);
      set(R.fL, { d: "M" + f1(xf) + " " + f1(yf) + "V" + Y0 }); set(R.dot, { cx: f1(xf), cy: f1(yf) });
      const low = yf < Y0 - 30;
      set(R.dT, { x: f1(low ? xf - 5 : xf - 7), y: f1(low ? yf + 17 : yf - 8), "text-anchor": "end" }); R.dT.textContent = "T = " + num(r.T) + " (" + num(r.dB) + " dB)";
      R.note.textContent = t("calc.isofig.3") + num(r.fiso) + t("calc.isofig.4");
      R.leg.textContent = "f = " + num(p.fd) + " Hz: T = " + num(r.T) + t("calc.isofig.5") + num(r.Tmax) + t("calc.isofig.6"); R.leg.style.fill = stressCol(clamp(r.T, 0, 1.2) / 1.2);
    },
  };
}

function servoFig() {
  return {
    build(svg) {
      const R = {};
      R.reg = mk("rect", { class: "s-zone s-zone-ok" }, svg);
      R.ax = mk("path", { class: "s-axis" }, svg); R.av = mkLogAxis(svg, 9, false);
      R.lb = mk("path", { class: "s-dim s-thin" }, svg); R.lbT = txt(svg, "s-small s-bold", "middle");
      R.lr = mk("path", { class: "s-ghost" }, svg); R.lrT = txt(svg, "s-small", "middle");
      R.ln = mk("path", { class: "s-redline" }, svg); R.lnT = txt(svg, "s-small s-bold", "middle");
      R.rat = mk("path", { class: "s-dim", "marker-end": "url(#calcArr)", "marker-start": "url(#calcArr)" }, svg); R.ratT = txt(svg, "s-val", "middle");
      R.regT = txt(svg, "s-small", "start");
      R.b1 = mk("rect", { class: "s-fix" }, svg); R.b2 = mk("rect", { class: "s-bar0" }, svg); R.b1T = txt(svg, "s-small", "start"); R.b2T = txt(svg, "s-small", "start");
      R.hd = txt(svg, "s-small s-bold", "start"); set(R.hd, { x: 10, y: 163 }); R.hd.textContent = t("calc.servofig.4");
      footLines(svg, R, 226);
      return R;
    },
    draw(R, p, r, M) {
      const X0 = 24, X1 = 300, ya = 124;
      const lo0 = Math.min(r.fbw, r.fbwReq, p.fn), hi0 = Math.max(r.fbw, r.fbwReq, p.fn);
      let lx0 = Math.floor(lg(lo0 / 2)), lx1 = Math.ceil(lg(hi0 * 2)); while (lx1 - lx0 < 2) lx1++; lx1 = Math.min(lx1, lx0 + 8);
      const X = f => X0 + (lg(f) - lx0) / (lx1 - lx0) * (X1 - X0), cx = x => clamp(x, 40, 284);
      set(R.ax, { d: "M" + X0 + " " + ya + "H" + X1 });
      setLogAxis(R.av, lx0, lx1, d => X0 + (d - lx0) / (lx1 - lx0) * (X1 - X0), false, ya - 3, ya + 3, ya + 14);
      set(R.reg, { x: X0, y: 66, width: f1(Math.max(X(r.fbw) - X0, 0)), height: ya - 66 });
      set(R.regT, { x: X0 + 3, y: 98 }); R.regT.textContent = t("calc.servofig.5");
      const xb = X(r.fbw), xn = X(p.fn), xr = X(r.fbwReq);
      set(R.lb, { d: "M" + f1(xb) + " 60V" + ya }); set(R.lbT, { x: f1(cx(xb)), y: 56 }); R.lbT.textContent = "f_bw = " + num(r.fbw) + " Hz";
      set(R.ln, { d: "M" + f1(xn) + " 28V" + ya }); set(R.lnT, { x: f1(cx(xn)), y: 24 }); R.lnT.textContent = "f_n = " + num(p.fn) + " Hz";
      set(R.lr, { d: "M" + f1(xr) + " 70V" + ya }); set(R.lrT, { x: f1(xr >= xb ? xr + 4 : xr - 4), y: 110, "text-anchor": xr >= xb ? "start" : "end" }); R.lrT.textContent = t("calc.servofig.6") + num(r.fbwReq) + " Hz";
      showEl(R.rat, xn - xb > 14); showEl(R.ratT, xn - xb > 14);
      set(R.rat, { d: arrowPath(xb + 2, 40, xn - 2, 40) }); set(R.ratT, { x: f1((xb + xn) / 2), y: 36 }); R.ratT.textContent = "× " + num(p.div);
      // fout-balken
      const mx = Math.max(r.xum, p.xmax) * 1.12, W = 250, x0 = 10, w1 = r.xum / mx * W, w2 = p.xmax / mx * W, col = stressCol(r.xum / p.xmax);
      set(R.b1, { x: x0, y: 172, width: f1(Math.max(w1, 1)), height: 16 }); R.b1.style.fill = col; R.b1.style.stroke = col;
      set(R.b2, { x: x0, y: 197, width: f1(Math.max(w2, 1)), height: 16 });
      set(R.b1T, { x: f1(Math.min(x0 + w1 + 5, 260)), y: 183 }); R.b1T.textContent = num(r.xum) + " µm (F_d/k_servo)";
      set(R.b2T, { x: f1(Math.min(x0 + w2 + 5, 260)), y: 208 }); R.b2T.textContent = num(p.xmax) + t("calc.servofig.7");
      R.note.textContent = "k_servo = m·(2π·f_bw)² = " + num(r.kServo / 1000) + t("calc.servofig.8") + tTxt(r.tRise);
      R.leg.textContent = r.marg >= 1 ? t("calc.servofig.9") + num(r.marg) : t("calc.servofig.10") + num(r.fbwReq) + " Hz, f_n " + num(r.fnReq) + " Hz"; R.leg.style.fill = col;
    },
  };
}

function expFig() {
  return {
    build(svg) {
      const R = {};
      R.wall = mk("rect", { class: "s-fix", width: 8, height: 100, y: 45 }, svg); R.wh = mk("rect", { fill: "url(#calcHatch)", width: 8, height: 100, y: 45 }, svg);
      R.b2 = mk("rect", { class: "s-bar2", height: 18 }, svg); R.b1 = mk("rect", { class: "s-bar1", height: 18 }, svg);
      R.g2 = mk("rect", { class: "s-ghostr", height: 18 }, svg); R.g1 = mk("rect", { class: "s-ghostr", height: 18 }, svg);
      R.jt = mk("path", { class: "s-leaf s-thin" }, svg);
      R.p0 = mk("path", { class: "s-pt s-pt0" }, svg); R.p1 = mk("path", { class: "s-pt" }, svg);
      R.dm = mkDim(svg); R.t2 = txt(svg, "s-small", "middle"); R.t1 = txt(svg, "s-small", "middle"); R.tA = txt(svg, "s-small", "middle"); R.tP = txt(svg, "s-small", "middle");
      R.tB = txt(svg, "s-small", "middle");
      R.cmp1 = mk("rect", { class: "s-bar1", height: 10, x: 80 }, svg); R.cmp2 = mk("rect", { class: "s-bar2", height: 10, x: 80 }, svg);
      R.c1T = txt(svg, "s-small", "start"); R.c2T = txt(svg, "s-small", "start"); R.ch = txt(svg, "s-small s-bold", "start"); set(R.ch, { x: 10, y: 165 }); R.ch.textContent = t("calc.expfig.6");
      footLines(svg, R, 226);
      return R;
    },
    draw(R, p, r, M) {
      const lneg = Math.max(0, p.L1 - p.L2), span = p.L2 + lneg, W = 230, s = W / span, xA = 32 + lneg * s, y2 = 50, y1 = 84;
      const xB = xA + p.L2 * s, xP = xA + (p.L2 - p.L1) * s;
      const dmax = Math.max(Math.abs(r.d1), Math.abs(r.d2), 1e-12), ex = Math.max(1, 14 / (dmax / span * W));      // tekening vergroot
      const e2 = r.d2 / span * W * ex, e1 = r.d1 / span * W * ex;
      set(R.wall, { x: f1(xA - 8) }); set(R.wh, { x: f1(xA - 16), width: 8 });
      set(R.g2, { x: f1(xA), y: y2, width: f1(xB - xA) }); set(R.g1, { x: f1(Math.min(xP, xB)), y: y1, width: f1(Math.abs(xB - xP)) });
      set(R.b2, { x: f1(xA), y: y2, width: f1(Math.max(xB + e2 - xA, 1)) });
      const xB2 = xB + e2, xP2 = xB2 - (xB - xP) - e1;
      set(R.b1, { x: f1(Math.min(xP2, xB2)), y: y1, width: f1(Math.max(Math.abs(xB2 - xP2), 1)) });
      set(R.jt, { d: "M" + f1(xB2) + " " + (y2 + 18) + "V" + y1 });
      set(R.p0, { d: "M" + f1(xP) + " " + (y1 + 18) + "l-5 10h10z" }); set(R.p1, { d: "M" + f1(xP2) + " " + (y1 + 18) + "l-5 10h10z" });
      setDim(R.dm, xP, y1 + 52, xP2, y1 + 52, (xP + xP2) / 2, y1 + 66, "ΔP = " + num(r.dP * 1000) + " µm", "middle");
      const dm = Math.abs(xP2 - xP) > 2; showEl(R.dm.p, dm);
      set(R.t2, { x: f1((xA + xB) / 2), y: y2 - 5 }); R.t2.textContent = t("calc.expfig.7") + num(p.L2) + " mm, α₂ = " + num(r.m2.alpha);
      set(R.t1, { x: f1(xB - 5), y: y1 - 5, "text-anchor": "end" }); R.t1.textContent = t("calc.expfig.8") + num(p.L1) + " mm, α₁ = " + num(r.m1.alpha);
      set(R.tA, { x: f1(xA), y: 30 }); R.tA.textContent = t("calc.expfig.9"); set(R.tP, { x: f1(xP), y: y1 + 40 }); R.tP.textContent = "P";
      set(R.tB, { x: f1(xB), y: y2 - 5 }); R.tB.textContent = "B";
      // vergelijking van de uitzetting van beide staven
      const mx = dmax, w = 170;
      set(R.cmp1, { y: 176, width: f1(Math.max(Math.abs(r.d1) / mx * w, 1)) }); set(R.cmp2, { y: 192, width: f1(Math.max(Math.abs(r.d2) / mx * w, 1)) });
      set(R.c1T, { x: 6, y: 185 }); R.c1T.textContent = "ΔL₁"; set(R.c2T, { x: 6, y: 201 }); R.c2T.textContent = "ΔL₂";
      R.note.textContent = (ex > 1.15 ? t("calc.expfig.10") + num(ex, 2) + t("calc.expfig.11") : "") + "ΔL₁ = " + num(r.d1 * 1000) + " µm, ΔL₂ = " + num(r.d2 * 1000) + " µm";
      R.leg.textContent = "ΔP = " + num(r.dP * 1000) + " µm (" + num(r.dP * 1e6 / Math.max(p.dT, 1e-9)) + " nm/K)"; R.leg.style.fill = "";
    },
  };
}

function tauFig() {
  return {
    build(svg) {
      const R = {};
      R.top = mk("path", { class: "s-blk" }, svg); R.side = mk("path", { class: "s-blk" }, svg); R.front = mk("path", { class: "s-blk" }, svg);
      R.dL = txt(svg, "s-small", "middle"); R.dH = txt(svg, "s-small", "end"); R.dB = txt(svg, "s-small", "middle");
      R.ah = []; for (let i = 0; i < 3; i++) R.ah.push(mkArrow(svg));
      R.hT = txt(svg, "s-small", "middle");
      R.cap = txt(svg, "s-small s-bold", "start"); set(R.cap, { x: 196, y: 24 }); R.cap.textContent = t("calc.taufig.2");
      R.ax = mk("path", { class: "s-axis", d: "M196 36V176H306" }, svg);
      R.cv = mk("path", { class: "s-curve" }, svg); R.l63 = mk("path", { class: "s-ghost" }, svg); R.t63 = txt(svg, "s-small", "start");
      R.dot = mk("circle", { class: "s-pivot", r: 4 }, svg); R.nowT = txt(svg, "s-small", "start"); R.xt = txt(svg, "s-small", "end"); set(R.xt, { x: 306, y: 189 });
      R.y1 = txt(svg, "s-small", "end"); set(R.y1, { x: 193, y: 51 }); R.y1.textContent = "1";
      footLines(svg, R, 205);
      return R;
    },
    draw(R, p, r, M) {
      const mx = Math.max(p.L, p.B, p.H), sc = 82 / mx, W = sc * p.L, Hh = sc * p.H, D = sc * p.B * 0.45;
      const x0 = 22, dx = D * 0.9, dy = -D * 0.6, yb = 120 + Hh / 2, yT = yb - Hh, xr = x0 + W;
      const fr0 = clamp(r.frac, 0, 1), mixc = (a, k) => "rgb(" + [59 + fr0 * 165, 111 - fr0 * 22, 208 - fr0 * 166].map(v => Math.round(clamp(v + a, 0, 255))).join(",") + ")";
      set(R.front, { d: "M" + f1(x0) + " " + f1(yT) + "H" + f1(xr) + "V" + f1(yb) + "H" + f1(x0) + "Z" }); R.front.style.fill = mixc(0);
      set(R.top, { d: "M" + f1(x0) + " " + f1(yT) + "l" + f1(dx) + " " + f1(dy) + "H" + f1(xr + dx) + "L" + f1(xr) + " " + f1(yT) + "Z" }); R.top.style.fill = mixc(30);
      set(R.side, { d: "M" + f1(xr) + " " + f1(yT) + "l" + f1(dx) + " " + f1(dy) + "V" + f1(yb + dy) + "L" + f1(xr) + " " + f1(yb) + "Z" }); R.side.style.fill = mixc(-35);
      set(R.dL, { x: f1(x0 + W / 2), y: f1(yb + 13) }); R.dL.textContent = "L = " + num(p.L) + " mm";
      set(R.dH, { x: f1(x0 - 4), y: f1((yT + yb) / 2 + 3) }); R.dH.textContent = "H = " + num(p.H);
      set(R.dB, { x: f1(x0 + W / 2 + dx / 2), y: f1(yT + dy - 5) }); R.dB.textContent = "B = " + num(p.B) + " mm";
      R.ah.forEach((a, i) => { const yy = yT + dy / 2 + (i + 0.5) * Hh / 3; set(a, { d: arrowPath(xr + dx + 30, yy, xr + dx + 6, yy) }); });
      set(R.hT, { x: f1(xr + dx + 22), y: f1(yb + 13) }); R.hT.textContent = "h";
      // genormeerde opwarmcurve 0..5τ
      const X0 = 196, X1 = 306, Y0 = 176, Y1 = 50, N = 5, X = u => X0 + u / N * (X1 - X0), Y = v => Y0 - v * (Y0 - Y1);
      let d = ""; for (let i = 0; i <= 100; i++) { const u = N * i / 100; d += (i ? "L" : "M") + f1(X(u)) + " " + f1(Y(1 - Math.exp(-u))); }
      set(R.cv, { d }); set(R.l63, { d: "M" + f1(X(1)) + " " + Y0 + "V" + f1(Y(0.632)) + "H" + X0 });
      set(R.t63, { x: f1(X(1) + 4), y: Y0 - 5 }); R.t63.textContent = t("calc.taufig.4") + tTxt(r.tau);
      const u = clamp(p.t * 60 / r.tau, 0, N), yu = Y(1 - Math.exp(-u));
      set(R.dot, { cx: f1(X(u)), cy: f1(yu) });
      set(R.nowT, { x: f1(u > 3 ? X(u) - 8 : X(u) + 8), y: f1(yu + 16), "text-anchor": u > 3 ? "end" : "start" }); R.nowT.textContent = "t = " + num(p.t) + " min: " + Math.round(r.frac * 100) + " %";
      R.xt.textContent = "5τ = " + tTxt(5 * r.tau);
      R.note.textContent = "m = " + num(r.m) + " kg · C = " + num(r.C) + " J/K · A = " + num(r.A * 1e4) + " cm²";
      R.leg.textContent = "ΔT(t) = " + num(r.dTt) + t("calc.taufig.5") + num(r.dTend) + t("calc.taufig.6") + num(r.Bi); R.leg.style.fill = r.Bi > 0.1 ? stressCol(0.9) : "";
    },
  };
}

function tcFig() {
  return {
    build(svg) {
      const R = { ln: [], sl: [], ar: [], nm: [] };
      const cp = mk("clipPath", { id: "tcClip" }, svg); mk("rect", { x: 4, y: 6, width: 312, height: 190 }, cp);
      R.plate = mk("circle", { class: "s-fix" }, svg);
      R.g = mk("g", { "clip-path": "url(#tcClip)" }, svg);
      for (let i = 0; i < 3; i++) R.ln.push(mk("path", { class: "s-ghost" }, R.g));
      R.mid = mk("path", { class: "s-dim s-thin" }, svg);
      R.pr = mk("path", { class: "s-ghost" }, svg);
      for (let i = 0; i < 3; i++) {
        R.sl.push(mk("rect", { class: "s-ball", width: 24, height: 9, rx: 2 }, svg));
        R.ar.push(mk("path", { class: "s-dim", "marker-end": "url(#calcArr)", "marker-start": "url(#calcArr)" }, svg));
        R.nm.push(txt(svg, "s-small s-bold", "middle"));
      }
      R.cr = mk("circle", { class: "s-dim", r: 8 }, svg); R.cd = mk("circle", { class: "s-pivot", r: 3.5 }, svg); R.cT = txt(svg, "s-val s-bold", "start");
      R.pd = mk("circle", { class: "s-pt", r: 4 }, svg); R.pT = txt(svg, "s-small", "start");
      R.da = mk("path", { class: "s-dim s-force", "marker-end": "url(#calcArr)" }, svg); R.dT = txt(svg, "s-small s-bold", "start");
      R.no = txt(svg, "s-val s-bold", "middle");
      footLines(svg, R, 214);
      return R;
    },
    draw(R, p, r, M) {
      const O = { x: 160, y: 98 }, c = r.c;
      const ext = Math.max(p.r1, p.r2, p.r3, p.rp, 1), sc = 78 / (ext * 1.2);
      const S = q => ({ x: O.x + sc * q.x, y: O.y - sc * q.y });
      const Rp = Math.max(p.r1, p.r2, p.r3) * 1.18 * sc;
      set(R.plate, { cx: O.x, cy: O.y, r: f1(Math.max(Rp, 10)) });
      set(R.mid, { d: "M" + (O.x - 4) + " " + O.y + "h8M" + O.x + " " + (O.y - 4) + "v8" });
      r.sup.forEach((q, i) => {
        const e = c.lines[i], s0 = S(q), ux = e.dx, uy = -e.dy, L = 190;
        set(R.ln[i], { d: "M" + f1(s0.x - ux * L) + " " + f1(s0.y - uy * L) + "L" + f1(s0.x + ux * L) + " " + f1(s0.y + uy * L) });
        set(R.sl[i], { x: f1(s0.x - 12), y: f1(s0.y - 4.5), transform: "rotate(" + f1(Math.atan2(uy, ux) / DEG) + " " + f1(s0.x) + " " + f1(s0.y) + ")" });
        set(R.ar[i], { d: "M" + f1(s0.x - ux * 20) + " " + f1(s0.y - uy * 20) + "L" + f1(s0.x + ux * 20) + " " + f1(s0.y + uy * 20) });
        const out = Math.hypot(q.x, q.y) > 1e-9 ? { x: q.x / Math.hypot(q.x, q.y), y: q.y / Math.hypot(q.x, q.y) } : { x: 0, y: 1 };
        set(R.nm[i], { x: f1(s0.x + out.x * 26), y: f1(s0.y - out.y * 26 + 3) }); R.nm[i].textContent = String(i + 1);
      });
      const pr = S(r.probe);
      set(R.pd, { cx: f1(pr.x), cy: f1(pr.y) });
      set(R.pT, { x: f1(pr.x + 7), y: f1(pr.y - 6) }); R.pT.textContent = t("calc.tcfig.5");
      showEl(R.cr, r.ok); showEl(R.cd, r.ok); showEl(R.cT, r.ok); showEl(R.pr, r.ok); showEl(R.da, r.ok); showEl(R.dT, r.ok); showEl(R.no, !r.ok);
      R.no.textContent = t("calc.tc.45"); set(R.no, { x: 160, y: 196 }); R.no.style.fill = stressCol(1.2);
      if (r.ok) {
        let cs = S(c.c), off = false;
        const cl = { x: clamp(cs.x, 14, 306), y: clamp(cs.y, 16, 190) };
        if (cl.x !== cs.x || cl.y !== cs.y) { off = true; cs = cl; }
        set(R.cr, { cx: f1(cs.x), cy: f1(cs.y) }); set(R.cd, { cx: f1(cs.x), cy: f1(cs.y) });
        set(R.cT, { x: f1(cs.x + 10), y: f1(cs.y + 14), "text-anchor": cs.x > 250 ? "end" : "start" }); R.cT.textContent = off ? t("calc.tcfig.6") : "C";
        if (cs.x > 250) set(R.cT, { x: f1(cs.x - 10) });
        set(R.pr, { d: "M" + f1(cs.x) + " " + f1(cs.y) + "L" + f1(pr.x) + " " + f1(pr.y) });
        // driftpijl (sterk vergroot): lengte vast 30 px
        const m = r.mag * 1000;
        if (m > 1e-9) {
          const k = 30 / m, ex = pr.x + r.d.x * 1000 * k, ey = pr.y - r.d.y * 1000 * k;
          set(R.da, { d: arrowPath(pr.x, pr.y, ex, ey) });
          set(R.dT, { x: f1(pr.x + 8), y: f1(pr.y + 16) }); R.dT.textContent = "Δ = " + num(m) + " µm";
        } else { showEl(R.da, false); set(R.dT, { x: f1(pr.x + 8), y: f1(pr.y + 16) }); R.dT.textContent = "Δ = 0"; showEl(R.dT, true); }
      }
      R.note.textContent = r.ok ? t("calc.tcfig.7") + num(c.c.x) + " ; " + num(c.c.y) + ") mm · θ = " + num(r.rot * 1e6) + t("calc.tcfig.8") : t("calc.tcfig.9");
      R.leg.textContent = r.ok ? (c.concurrent ? t("calc.tcfig.10") : t("calc.tcfig.11") + num(c.resid) + t("calc.tcfig.12")) : t("calc.tcfig.13");
      R.leg.style.fill = !r.ok ? stressCol(1.2) : c.concurrent ? "" : stressCol(0.9);
    },
  };
}
Object.assign(FIGS, { hertz: hertzFig(), kc: kcFig(), msd: msdFig(), iso: isoFig(), servo: servoFig(), exp: expFig(), tau: tauFig(), tc: tcFig() });


// ---------- sliders: [min, max, logaritmisch] ----------
const RANGE = {
  L: [5, 200, 1], b: [1, 100, 1], t: [0.02, 2, 1], u: [0.01, 10, 1], d: [0.05, 5, 1], R: [0.1, 30, 1],
  F: [0.01, 1000, 1], m: [0.001, 10, 1], r: [5, 500, 1], Kt: [1, 4, 0], phi: [0, 20, 0],
};
function rng(c, i) { if (i.range) return i.range; if (c.id === "notch" && i.id === "phi") return [0.01, 5, 1]; return RANGE[i.id]; }
const GROUP = { L: "Geometrie", b: "Geometrie", t: "Geometrie", d: "Geometrie", R: "Geometrie", Kt: "Geometrie", bc: "Geometrie", plate: "Materiaal" };
const grpOf = i => i.grp || GROUP[i.id] || "Belasting";
function toPos(c, i, v) {
  const g = rng(c, i);
  if (!g) return 0;
  if (g[2]) { if (!(v > 0)) return 0; return Math.round(Math.max(0, Math.min(1, Math.log(v / g[0]) / Math.log(g[1] / g[0]))) * 1000); }
  return Math.round(Math.max(0, Math.min(1, (v - g[0]) / (g[1] - g[0]))) * 1000);
}
function fromPos(c, i, pos) {
  const g = rng(c, i), s = pos / 1000;
  if (g[2]) return (s === 0 && i.min === 0) ? 0 : +(g[0] * Math.pow(g[1] / g[0], s)).toPrecision(3);
  return +(g[0] + s * (g[1] - g[0])).toPrecision(3);
}

// ---------- belangrijkste uitkomsten ----------
const KEYS = {
  leaf: r => [[t("calc.leaf.9"), "N/mm", num(r.cx)], [t("calc.ui.maxu"), "mm", num(r.uMax)]],
  cross: r => [[t("calc.cross.8"), "N·mm/rad", num(r.c)], [t("calc.ui.maxphi"), "°", num(r.phiMax / DEG)]],
  wire: r => [[t("calc.wire.12"), "N/mm", num(r.cb)], [t("calc.ui.maxu"), "mm", num(r.uMax)]],
};
KEYS.par = KEYS.leaf; KEYS.notch = KEYS.cross;
function safety(r, M) {
  const sS = r.sigma > 0 ? M.sigma / r.sigma : Infinity, sK = isFinite(r.margin) ? r.margin : Infinity, s = Math.min(sS, sK);
  return { s, status: s < 1 ? "bad" : s < 2 ? "warn" : "ok",
    sub: t("calc.ui.sigratio") + (isFinite(sS) ? num(sS) : "∞") + (isFinite(sK) ? t("calc.ui.bucklbl") + num(sK) : "") };
}

// ---------- toestand (in het geheugen, per calculator) ----------
const state = { cur: "leaf", mats: {}, sigmas: {}, vals: {}, open: { Geometrie: true, Materiaal: true, Belasting: true, Formules: false, Aannames: false }, raf: 0 };
const defaults = c => { const o = {}; c.inputs.forEach(i => { o[i.id] = i.def; }); return o; };
CALCS.forEach(c => { state.vals[c.id] = defaults(c); state.mats[c.id] = "staal"; state.sigmas[c.id] = null; });
const calcOf = id => CALCS.find(c => c.id === id) || CALCS[0];

function params(c) {
  const p = {}, v = state.vals[c.id];
  c.inputs.forEach(i => { p[i.id] = v[i.id]; });
  return p;
}
// begrens waarden met een bovengrens (max); geeft de meldingen terug
function clampP(c, p) {
  const notes = [];
  c.inputs.forEach(i => { if (i.max != null && isFinite(p[i.id]) && p[i.id] > i.max) { p[i.id] = i.max; notes.push(t("calc.ui.capped", { s: i.sym, v: num(i.max) + (i.unit && i.unit !== "–" ? " " + i.unit : "") })); } });
  return notes;
}
const OOR = () => t("calc.ui.oor");
const invalid = (c, p) => c.inputs.filter(i => typeof i.def === "number" &&
  !(isFinite(p[i.id]) && p[i.id] >= i.min && (i.min === 0 || p[i.id] > 0)));
function matParams(c, p, matId) {
  c = c || calcOf(state.cur);
  const sg = state.sigmas[c.id];
  if (c.lim) return { sigma: sg > 0 ? sg : c.lim.auto(p || state.vals[c.id]) };      // eigen materiaalkeuzes (invoer van type mat)
  const m = material(matId || state.mats[c.id]);
  return { E: m.E, nu: m.nu, sigma: sg > 0 ? sg : m.sigma, alpha: m.alpha, rho: m.rho };
}
const ownMat = c => !!c.noMat || c.inputs.some(i => i.type === "mat");
const matsOf = c => c.inputs.filter(i => i.type === "mat");
const fmtv = v => String(+Number(v).toPrecision(3));

// ---------- weergave ----------
let REF = null;   // verwijzingen naar de huidige DOM
function render() {
  state.raf = 0;
  if (!REF) return;
  const c = calcOf(state.cur), p = params(c), bad = invalid(c, p), cl = bad.length ? [] : clampP(c, p), M = matParams(c, p);
  const clH = cl.length ? '<div class="calc-warn calc-clamp" role="status">' + cl.map(t => "<div>" + t + "</div>").join("") + "</div>" : "";
  c.inputs.forEach(i => { const n = REF.fields[i.id]; if (n && n.getAttribute("inputmode") === "decimal") n.setAttribute("aria-invalid", String(bad.indexOf(i) >= 0)); });
  if (bad.length) {
    REF.warn.innerHTML = '<div class="calc-warn" role="alert">' + t("calc.ui.checkin", { list: bad.map(i => i.label).join(", ") }) + "</div>";
    REF.warnH = "";
    REF.root.classList.add("is-bad");
    REF.last = null;
    return;
  }
  REF.root.classList.remove("is-bad");
  nonFin = 0;
  const o = c.run(p, M), r = o.r, kl = keysOf(c, r, p, M), oor = nonFin > 0;     // niet-eindige uitkomst: "buiten bereik" in plaats van NaN
  REF.last = { c, p, M, o, r };
  const wh = clH + (oor ? '<div class="calc-warn" role="alert"><div>⚠ ' + t("calc.ui.oorwarn", { oor: OOR() }) + "</div></div>" : "") + (o.warn.length ? '<div class="calc-warn" role="alert">' + o.warn.map(w => "<div>⚠ " + w + "</div>").join("") + "</div>" : "");
  if (wh !== REF.warnH) { REF.warn.innerHTML = wh; REF.warnH = wh; }
  if (o.out.map(x => x.k).join("|") !== REF.cellSig) buildCells(o.out);
  o.out.forEach((x, k) => {
    const cell = REF.cells[k];
    if (!cell) return;
    const nf = oor && /^(—|∞)$/.test(String(x.v));
    cell.dd.firstChild.nodeValue = (nf ? OOR() : x.v) + (x.unit && !nf ? " " : "");
    cell.u.textContent = nf ? "" : (x.unit || "");
    cell.box.classList.toggle("bad", !!x.bad);
  });
  kl.forEach((k, n) => {
    const nf = oor && /^(—|∞)$/.test(String(k.v));
    const e = REF.keys[n]; e.v.firstChild.nodeValue = (nf ? OOR() : k.v) + (k.u && !nf ? " " : ""); e.u.textContent = nf ? "" : k.u;
    e.sub.textContent = k.sub || ""; e.box.setAttribute("data-status", k.status || "");
  });
  FIGS[c.id].draw(REF.fig, p, r, M);
  if (state.open.Formules) renderFormulas(c, p, M, r);
}
function renderFormulas(c, p, M, r) {
  REF.formulas.innerHTML = c.formulas(p, M, r).map(x => '<div class="fm"><div class="fm-h">' + x[0] + '</div><div class="fm-g">' + x[1] + '</div><div class="fm-n"><span class="fm-lab">' + t("calc.ui.withyours") + '</span> ' + x[2] + "</div>" +
    (x[3] ? '<div class="fm-s"><span class="fm-lab">' + t("calc.ui.source") + '</span> ' + x[3] + "</div>" : "") + "</div>").join("");
}
// drie kerngetallen: {k: naam, u: eenheid, v: tekst, sub, status}
function keysOf(c, r, p, M) {
  if (c.keys) return c.keys(r, p, M);
  const ks = KEYS[c.id](r), sf = safety(r, M);
  return [{ k: ks[0][0], u: ks[0][1], v: ks[0][2] }, { k: ks[1][0], u: ks[1][1], v: ks[1][2], sub: t("calc.ui.atallow", { v: num(M.sigma) }) },
    { k: t("calc.ui.safety"), u: "", v: isFinite(sf.s) ? "× " + num(sf.s) : "∞", sub: sf.sub, status: sf.status }];
}
const schedule = () => { if (!state.raf) state.raf = requestAnimationFrame(render); };

function inputHtml(c, i, v) {
  if (i.type === "check") return '<label class="chk"><input type="checkbox" data-in="' + i.id + '"' + (v[i.id] ? " checked" : "") + "> " + i.label + "</label>";
  if (i.type === "mat") return '<label class="fld"><span>' + i.label + '</span><select data-in="' + i.id + '">' + MATERIALS.map(m => '<option value="' + m.id + '"' + (v[i.id] === m.id ? " selected" : "") + ">" + m.naam + "</option>").join("") + "</select></label>";
  if (i.type === "select") return '<label class="fld"><span>' + i.label + '</span><select data-in="' + i.id + '">' + i.options.map(o => '<option value="' + o[0] + '"' + (v[i.id] === o[0] ? " selected" : "") + ">" + o[1] + "</option>").join("") + "</select></label>";
  return '<div class="fld"><div class="fld-row"><label for="in_' + i.id + '">' + i.label + '</label><span class="inp"><input id="in_' + i.id + '" ' + NUM_ATTR + ' step="any" data-in="' + i.id + '" value="' + v[i.id] + '"><b>' + i.unit + "</b></span></div>" +
    '<input type="range" class="sl" min="0" max="1000" step="1" data-sl="' + i.id + '" aria-label="' + i.label + '" value="' + toPos(c, i, v[i.id]) + '"></div>';
}
const secHtml = (name, body) => '<details class="calc-sec" data-sec="' + name + '"' + (state.open[name] ? " open" : "") + "><summary>" + t("calc.sec." + name) + '</summary><div class="calc-sec-b">' + body + "</div></details>";

// resultaatkaarten: opnieuw opgebouwd zodra de lijst koppen verandert (bijv. een andere variant); anders alleen tekst bijwerken
function buildCells(outList) {
  const out = $("calcOut"), cells = [];
  out.textContent = "";
  outList.forEach(x => {
    const box = document.createElement("div"), dt = document.createElement("dt"), dd = document.createElement("dd"), u = document.createElement("span");
    dt.textContent = x.k; dd.setAttribute("data-res", DICTS.nl[x.id] || x.k); u.className = "u"; dd.appendChild(document.createTextNode("")); dd.appendChild(u);
    box.appendChild(dt); box.appendChild(dd); out.appendChild(box); cells.push({ box, dd, u });
  });
  REF.cells = cells; REF.cellSig = outList.map(x => x.k).join("|");
}
function renderDetail() {
  optCtx.preview(null);
  optCancel();
  if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
  const c = calcOf(state.cur), v = state.vals[c.id], M0 = matParams(c, v), own = ownMat(c);
  const body = { Geometrie: "", Materiaal: "", Belasting: "" };
  if (!own) body.Materiaal += '<label class="fld"><span>' + t("calc.sec.Materiaal") + '</span><select id="calcMat">' + MATERIALS.map(m => '<option value="' + m.id + '"' + (m.id === state.mats[c.id] ? " selected" : "") + ">" + m.naam + "</option>").join("") + "</select></label>";
  else c.inputs.forEach(i => { if (i.type === "mat") body.Materiaal += inputHtml(c, i, v); });
  if (!own || c.lim) body.Materiaal += '<div class="fld"><div class="fld-row"><label for="calcSigma">' + (c.lim ? c.lim.label : t("calc.ui.allowable")) + '</label><span class="inp"><input id="calcSigma" ' + NUM_ATTR + ' step="any" min="0" value="' + fmtv(M0.sigma) + '"><b>' + (c.lim ? c.lim.unit : "MPa") + "</b></span></div>" +
    (c.lim ? '<div class="fld-hint">' + c.lim.hint + "</div>" : "") + "</div>";
  if (!own || matsOf(c).length) body.Materiaal += '<div class="mat-info" id="calcMatInfo"></div><div class="mat-src" id="calcMatSrc"></div>';
  c.inputs.forEach(i => { if (i.type !== "mat") body[grpOf(i)] += inputHtml(c, i, v); });
  let h = '<div class="calc-head"><div><h2>' + c.name + '</h2><p class="calc-sub">' + c.short + '</p></div><div class="calc-acts"><button type="button" class="calc-reset" id="calcOpt" title="' + t("calc.ui.opt.tip") + '">' + t("calc.ui.opt") + '</button><button type="button" class="calc-reset" id="calcCopy" title="' + t("calc.ui.copy.tip") + '">' + t("calc.ui.copy") + '</button><button type="button" class="calc-reset" id="calcPrint" title="' + t("calc.ui.print.tip") + '">' + t("calc.ui.print") + '</button><button type="button" class="calc-reset" id="calcLink" title="' + t("calc.ui.link.tip") + '">' + t("calc.ui.link") + '</button><button type="button" class="calc-reset" id="calcReset" title="' + t("calc.ui.reset.tip") + '">↺ ' + t("calc.ui.reset") + '</button></div></div><div class="calc-actmsg" id="calcActMsg" role="status" aria-live="polite"></div>';
  h += '<div class="calc-grid" id="calcGrid"><div class="calc-keys">' +
    [0, 1, 2].map(n => '<div class="calc-key" data-key="' + n + '"><span class="k"></span><b class="v">0<span class="u"></span></b><span class="s"></span></div>').join("") + "</div>";
  h += '<div class="calc-left"><figure class="calc-fig"><svg id="calcSvg" viewBox="0 0 320 245" role="img" aria-label="' + t("calc.ui.sketch") + '"></svg></figure><div id="calcWarn" class="calc-warnbox"></div><dl class="calc-res" id="calcOut"></dl></div>';
  h += '<div class="calc-right"><div class="calc-inputs">' + secHtml("Geometrie", body.Geometrie) + (body.Materiaal ? secHtml("Materiaal", body.Materiaal) : "") + secHtml("Belasting", body.Belasting) + "</div>";
  h += optSection(c);
  h += '<details class="calc-sec calc-card" data-sec="Formules"' + (state.open.Formules ? " open" : "") + '><summary>' + t("calc.sec.Formules") + '</summary><div class="calc-sec-b calc-formulas" id="calcFormulas"></div></details>';
  h += '<details class="calc-sec calc-card" data-sec="Aannames"' + (state.open.Aannames ? " open" : "") + '><summary>' + t("calc.ui.assume") + '</summary><div class="calc-sec-b"><ul class="calc-assume">' + c.assume.map(a => "<li>" + a + "</li>").join("") + '</ul><p class="calc-src"><span>' + t("calc.ui.srcl") + '</span> ' + c.source + "</p></div></details></div></div>";
  $("calcDetail").innerHTML = h;
  // resultaatkaarten (vaste opbouw per calculator; daarna alleen tekst bijwerken)
  const o0 = c.run(defaults(c), M0);
  const fields = {}, sliders = {};
  $("calcDetail").querySelectorAll("[data-in]").forEach(n => { fields[n.dataset.in] = n; });
  $("calcDetail").querySelectorAll("[data-sl]").forEach(n => { sliders[n.dataset.sl] = n; });
  const svg = $("calcSvg"); svg.innerHTML = SVG_DEFS;
  REF = {
    root: $("calcGrid"), warn: $("calcWarn"), warnH: "", cells: [], cellSig: "", fields, sliders, formulas: $("calcFormulas"),
    keys: [0, 1, 2].map(n => { const b = $("calcDetail").querySelector('[data-key="' + n + '"]'); return { box: b, v: b.querySelector(".v"), u: b.querySelector(".v .u"), sub: b.querySelector(".s") }; }),
    fig: FIGS[c.id].build(svg),
  };
  buildCells(o0.out);
  const kl = keysOf(c, o0.r, defaults(c), M0);
  REF.keys.forEach((k, n) => { k.box.querySelector(".k").textContent = kl[n].k; });
  updMatInfo();
  const os = $("calcOptSec"); if (os && state.open.Optimaliseer) os.open = true;
  optMount();
  render();
}
function updMatInfo() {
  const c = calcOf(state.cur);
  if (!$("calcMatInfo")) return;
  if (ownMat(c)) {
    const v = state.vals[c.id], ms = matsOf(c).map(i => ({ i, m: material(v[i.id]) }));
    $("calcMatInfo").innerHTML = ms.map(x => "<div><b>" + x.i.label + ":</b> E = " + num(x.m.E / 1000) + " GPa · ν = " + num(x.m.nu) + " · α = " + num(x.m.alpha) + " µm/(m·K) · ρ = " + num(x.m.rho) + " kg/m³ · c = " + num(x.m.c) + " J/(kg·K) · k = " + num(x.m.k) + " W/(m·K) · σ<sub>y</sub> = " + num(x.m.sy) + " MPa</div>").join("");
    $("calcMatSrc").textContent = t("calc.ui.matsrc") + ms.map(x => x.m.bron).filter((b, n, a) => a.indexOf(b) === n).join("; ") + ". " + materialSource();
    return;
  }
  const m = material(state.mats[state.cur]), M = matParams();
  $("calcMatInfo").textContent = "E = " + num(m.E / 1000) + " GPa · ν = " + num(m.nu) + " · α = " + num(m.alpha) + " µm/(m·K) · ρ = " + num(m.rho) + " kg/m³ · σ_allow = " + num(M.sigma) + t("calc.ui.allowinfo");
  $("calcMatSrc").textContent = t("calc.ui.matsrc") + m.bron + ". " + materialSource();
}

function renderList() {
  const groups = {};
  CALCS.forEach(c => { (groups[c.group] = groups[c.group] || []).push(c); });
  $("calcList").innerHTML = Object.keys(groups).map(g => '<div class="calc-group"><div class="calc-gh">' + t("calc.group." + g) + "</div>" +
    groups[g].map(c => '<button type="button" class="calc-item" data-c="' + c.id + '" aria-pressed="' + (c.id === state.cur) + '">' + c.name + "</button>").join("") + "</div>").join("");
}

export function setWork(w) {
  const calc = w === "calc";
  const app = document.querySelector(".app");
  app.classList.toggle("calc-on", calc);
  $("calcRoot").hidden = !calc;
  document.querySelectorAll("#workSeg [data-w]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.w === w)));
  if (!calc) window.dispatchEvent(new Event("resize"));
  else if (!REF) renderDetail();
}

// Optimaliseer: één evaluatie van een calculator met andere invoer en/of materiaal, zonder het scherm te raken
function evalCalc(c, vals, matOver) {
  const p = Object.assign({}, vals);
  if (matOver) for (const k in matOver) if (k !== "_") p[k] = matOver[k];
  if (invalid(c, p).length) return null;
  clampP(c, p);
  const M = matParams(c, p, matOver && matOver._);
  nonFin = 0;
  let o;
  try { o = c.run(p, M); } catch (_) { return null; }
  return { o, p, M };
}
const optCtx = {
  state, calcOf: () => calcOf(state.cur), rangeOf: (c, i) => rng(c, i) || [i.def > 0 ? i.def / 10 : 0, i.def > 0 ? i.def * 10 : 1, i.def > 0 ? 1 : 0],
  ownMat, matsOf, MATERIALS, grpOf, evalCalc, renderDetail: () => renderDetail(),
  toClipboard: t => toClipboard(t),
  // voorbeeld: toon tijdelijk andere waarden in tekening en uitkomsten (vals = {id: waarde} of null = terug naar de echte invoer)
  preview(vals, mats) {
    if (!vals) {
      if (!pv) return;
      state.vals[pv.id] = pv.vals; state.mats[pv.id] = pv.mat; pv = null;
      if (REF) { REF.root.classList.remove("is-prev"); render(); }
      return;
    }
    const c = calcOf(state.cur);
    if (!pv) pv = { id: c.id, vals: state.vals[c.id], mat: state.mats[c.id] };
    state.vals[c.id] = Object.assign({}, pv.vals, vals);
    if (mats && mats._) state.mats[c.id] = mats._;
    if (REF) { REF.root.classList.add("is-prev"); render(); }
  }
};
let pv = null;

export function initCalc() {
  initCalcOpt(optCtx);
  renderList();
  $("workSeg").addEventListener("click", e => {
    const b = e.target.closest("[data-w]");
    if (b) setWork(b.dataset.w);
  });
  $("calcList").addEventListener("click", e => {
    const b = e.target.closest("[data-c]");
    if (!b) return;
    state.cur = b.dataset.c;
    renderList(); renderDetail();
  });
  const det = $("calcDetail");
  det.addEventListener("input", e => {
    const t = e.target, c = calcOf(state.cur);
    if (t.id === "calcMat") {
      state.mats[c.id] = t.value; state.sigmas[c.id] = null;
      $("calcSigma").value = fmtv(material(t.value).sigma); $("calcSigma").removeAttribute("aria-invalid");
      updMatInfo(); render(); return;
    }
    if (t.id === "calcSigma") {
      const sg = parseNum(t.value);
      t.setAttribute("aria-invalid", String(!(sg > 0)));
      state.sigmas[c.id] = sg > 0 ? sg : null;
      updMatInfo(); render(); return;
    }
    if (t.dataset.sl) {                       // slider -> getalveld; tekenen via rAF
      const inp = c.inputs.find(i => i.id === t.dataset.sl), val = fromPos(c, inp, +t.value);
      state.vals[c.id][inp.id] = val; REF.fields[inp.id].value = fmtv(val);
      schedule(); return;
    }
    const id = t.dataset.in;
    if (!id) return;
    const inp = c.inputs.find(i => i.id === id);
    const val = inp.type === "check" ? t.checked : (inp.type === "select" || inp.type === "mat") ? t.value : parseNum(t.value);
    state.vals[c.id][id] = val;
    if (inp.type === "mat") {                 // nieuwe materialen: limiet weer automatisch
      state.sigmas[c.id] = null;
      if (c.lim) { $("calcSigma").value = fmtv(matParams(c, state.vals[c.id]).sigma); $("calcSigma").removeAttribute("aria-invalid"); }
      updMatInfo();
    }
    if (REF.sliders[id]) REF.sliders[id].value = toPos(c, inp, val);
    render();
  });
  det.addEventListener("click", e => {
    if (e.target.closest("#calcCopy")) { doCopy(); return; }
    if (e.target.closest("#calcPrint")) { doPrint(); return; }
    if (e.target.closest("#calcLink")) { doLink(); return; }
    if (!e.target.closest("#calcReset")) return;
    const c = calcOf(state.cur);
    state.vals[c.id] = defaults(c); state.mats[c.id] = "staal"; state.sigmas[c.id] = null;
    renderDetail();
  });
  det.addEventListener("toggle", e => {
    const s = e.target.dataset && e.target.dataset.sec;
    if (!s) return;
    state.open[s] = e.target.open;
    if (s === "Formules" && e.target.open) schedule();
  }, true);
  window.addEventListener("hashchange", () => {
    if (applyHash()) { renderList(); setWork("calc"); renderDetail(); }
  });
  if (applyHash()) { renderList(); setWork("calc"); renderDetail(); }
  onLang(() => {                                        // andere taal: calculators opnieuw opbouwen en tekenen
    buildCalcs(); renderList();
    if ($("calcRoot").hidden) REF = null; else renderDetail();
  });
}

// ---------- kopiëren en delen ----------
function msg(s) {
  const e = $("calcActMsg");
  if (!e) return;
  e.textContent = s;
  clearTimeout(msg.tm); msg.tm = setTimeout(() => { e.textContent = ""; }, 3500);
}
async function toClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (_) { /* terugval hieronder */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy"); ta.remove(); return ok;
  } catch (_) { return false; }
}
// HTML-opmaak van een formule naar platte tekst: breuken als (a)/(b), subscript als _x, superscript als ^x
function plain(h) {
  const d = document.createElement("div");
  d.innerHTML = h;
  Array.prototype.slice.call(d.querySelectorAll(".fr")).reverse().forEach(n => {
    n.replaceWith(document.createTextNode("(" + n.children[0].textContent + ")/(" + n.children[1].textContent + ")"));
  });
  d.querySelectorAll("sub").forEach(n => n.replaceWith(document.createTextNode("_" + n.textContent)));
  d.querySelectorAll("sup").forEach(n => n.replaceWith(document.createTextNode("^" + n.textContent)));
  return d.textContent.replace(/\s+/g, " ").trim();
}
function linkUrl() {
  const c = calcOf(state.cur), v = state.vals[c.id], q = ["calc=" + c.id];
  c.inputs.forEach(i => {
    const x = v[i.id];
    q.push(i.id + "=" + encodeURIComponent(i.type === "check" ? (x ? "1" : "0") : String(x)));
  });
  if (!ownMat(c)) q.push("mat=" + encodeURIComponent(state.mats[c.id]));
  if (state.sigmas[c.id] > 0 && (!c.noMat)) q.push("sig=" + state.sigmas[c.id]);
  return location.href.split("#")[0] + "#" + q.join("&");
}
function applyHash() {
  const h = location.hash || "";
  if (h.indexOf("#calc=") !== 0) return false;
  const q = {};
  try { h.slice(1).split("&").forEach(kv => { const k = kv.indexOf("="); if (k > 0) q[kv.slice(0, k)] = decodeURIComponent(kv.slice(k + 1)); }); } catch (_) { return false; }
  const c = CALCS.find(x => x.id === q.calc);
  if (!c) return false;
  const v = state.vals[c.id];
  c.inputs.forEach(i => {
    if (!(i.id in q)) return;
    if (i.type === "check") v[i.id] = q[i.id] === "1";
    else if (i.type === "select") { if (i.options.some(o => o[0] === q[i.id])) v[i.id] = q[i.id]; }
    else if (i.type === "mat") { if (MATERIALS.some(m => m.id === q[i.id])) v[i.id] = q[i.id]; }
    else { const x = parseFloat(q[i.id]); if (isFinite(x)) v[i.id] = x; }
  });
  if (q.mat && MATERIALS.some(m => m.id === q.mat)) state.mats[c.id] = q.mat;
  const sg = parseFloat(q.sig);
  state.sigmas[c.id] = sg > 0 ? sg : null;
  state.cur = c.id;
  return true;
}
function sheetText() {
  const L = REF && REF.last;
  if (!L) return "";
  const c = L.c, p = L.p, M = L.M, m = material(state.mats[c.id]), out = [], own = ownMat(c);
  const ver = (document.querySelector(".brand .ver") || {}).textContent || "";
  out.push(t("calc.sheet.title", { name: c.name, short: c.short }));
  out.push(t("calc.sheet.date", { d: new Date().toISOString().slice(0, 10), v: ver || t("calc.sheet.unkver") }));
  out.push("", t("calc.sheet.input"));
  c.inputs.forEach(i => {
    const x = p[i.id];
    if (i.type === "check") out.push("  " + plain(i.label) + ": " + (x ? t("calc.ui.yes") : t("calc.ui.no")));
    else if (i.type === "select") out.push("  " + i.label + ": " + plain(i.options.filter(o => o[0] === x).map(o => o[1])[0] || x));
    else if (i.type === "mat") { const mm = material(x); out.push("  " + i.label + ": " + mm.naam + " (E = " + num(mm.E / 1000) + " GPa, ν = " + num(mm.nu) + ", α = " + num(mm.alpha) + " µm/(m·K), ρ = " + num(mm.rho) + " kg/m³, c = " + num(mm.c) + " J/(kg·K), k = " + num(mm.k) + " W/(m·K), σ_y = " + num(mm.sy) + " MPa)"); }
    else out.push("  " + i.label + " = " + num(x) + " " + i.unit);
  });
  if (!own) out.push("  " + t("calc.sec.Materiaal") + ": " + m.naam + " (E = " + num(m.E / 1000) + " GPa, ν = " + num(m.nu) + ", α = " + num(m.alpha) + " µm/(m·K), ρ = " + num(m.rho) + " kg/m³)");
  if (c.lim) out.push("  " + c.lim.label + " = " + num(M.sigma) + " " + c.lim.unit + " (" + plain(c.lim.hint) + (state.sigmas[c.id] > 0 ? t("calc.sheet.useradj") : "") + ")");
  else if (!own) out.push("  σ_allow = " + num(M.sigma) + t("calc.sheet.allowtxt") + (state.sigmas[c.id] > 0 ? t("calc.sheet.useradj") : "") + ")");
  out.push("", t("calc.sheet.results"));
  L.o.out.forEach(x => out.push("  " + x.k + " = " + x.v + (x.unit ? " " + x.unit : "")));
  if (L.o.warn.length) { out.push("", t("calc.sheet.warnings")); L.o.warn.forEach(w => out.push("  ! " + w)); }
  out.push("", t("calc.sheet.formulas"));
  c.formulas(p, M, L.r).forEach(x => {
    out.push("  " + plain(x[0]) + ": " + plain(x[1]));
    out.push("    = " + plain(x[2]));
    if (x[3]) out.push("    " + t("calc.ui.source") + ": " + plain(x[3]));
  });
  out.push("", t("calc.sheet.assume"));
  c.assume.forEach(a => out.push("  - " + plain(a)));
  out.push("", t("calc.sheet.sources"), "  " + plain(c.source));
  if (!own || matsOf(c).length) out.push("  " + t("calc.ui.matsrc") + (own ? matsOf(c).map(i => material(p[i.id]).bron).join("; ") : m.bron) + ". " + materialSource());
  out.push("", t("calc.sheet.link"), "  " + linkUrl());
  return out.join("\n");
}
// Rekenblad voor print/PDF: dezelfde inhoud als "Kopieer", in de gedeelde A4-weergave
export function openCalcReport() {
  const L = REF && REF.last;
  if (!L) { msg(t("calc.ui.checkfirst")); return; }
  const c = L.c, p = L.p, M = L.M, m = material(state.mats[c.id]), own = ownMat(c);
  const e = x => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const tb = (head, rows) => '<table class="rep-tbl"><thead><tr>' + head.map(h => "<th>" + h + "</th>").join("") + "</tr></thead><tbody>" +
    rows.map(r => "<tr>" + r.map(x => "<td>" + x + "</td>").join("") + "</tr>").join("") + "</tbody></table>";
  const matLine = mm => e(mm.naam) + ": E = " + num(mm.E / 1000) + " GPa, \u03bd = " + num(mm.nu) + ", \u03b1 = " + num(mm.alpha) + " \u00b5m/(m\u00b7K), \u03c1 = " + num(mm.rho) + " kg/m\u00b3";
  const inRows = c.inputs.map(i => {
    const x = p[i.id];
    if (i.type === "check") return [e(plain(i.label)), x ? t("calc.ui.yes") : t("calc.ui.no"), ""];
    if (i.type === "select") return [e(plain(i.label)), e(plain(i.options.filter(o => o[0] === x).map(o => o[1])[0] || x)), ""];
    if (i.type === "mat") return [e(plain(i.label)), matLine(material(x)), ""];
    return [e(plain(i.label)), num(x), e(plain(i.unit || ""))];
  });
  if (!own) inRows.push([t("calc.sec.Materiaal"), matLine(m), ""]);
  inRows.push([e(plain(c.lim ? c.lim.label : "\u03c3_allow")), num(M.sigma), e(c.lim ? c.lim.unit : "MPa")]);
  const svg = $("calcSvg");
  const fig = svg ? '<figure class="rep-fig rep-svg calc-fig">' + svg.outerHTML.replace(/calcArr/g, "repArr").replace(/calcHatch/g, "repHatch").replace(/ id="calcSvg"/, "") + "<figcaption>" + t("calc.rep.figcap") + "</figcaption></figure>" : "";
  const warn = L.o.warn.length ? '<ul class="rep-list rep-warn">' + L.o.warn.map(w => "<li>" + e(w) + "</li>").join("") + "</ul>" : "";
  const frm = c.formulas(p, M, L.r).map(x => [x[0], x[1] + (x[2] ? '<div class="rep-eval">= ' + x[2] + "</div>" : ""), x[3] ? e(plain(x[3])) : ""]);
  showReport({
    title: c.name, sub: t("calc.rep.sub") + " \u00b7 " + plain(c.short),
    meta: [[t("calc.rep.calc"), c.name]],
    sections: [
      { h: t("calc.rep.sketch"), html: fig },
      { h: t("calc.rep.input"), html: tb([t("calc.rep.qty"), t("calc.rep.val"), t("calc.rep.unit")], inRows) },
      { h: t("calc.rep.results"), html: tb([t("calc.rep.qty"), t("calc.rep.val"), t("calc.rep.unit")], L.o.out.map(x => [x.k, e(x.v), x.unit ? e(plain(x.unit)) : ""])) + warn },
      { h: t("calc.sec.Formules"), html: tb([t("calc.rep.qty"), t("calc.rep.formula"), t("calc.rep.src")], frm) },
      { h: t("calc.rep.assume"), html: '<ul class="rep-list">' + c.assume.map(a => "<li>" + a + "</li>").join("") + "</ul>" },
      { h: t("calc.rep.sources"), html: '<p>' + c.source + "</p>" + (!own || matsOf(c).length ? "<p class=\"rep-note\">" + t("calc.ui.matsrc") + e(own ? matsOf(c).map(i => material(p[i.id]).bron).join("; ") : m.bron) + ". " + e(materialSource()) + "</p>" : "") },
      { h: t("calc.rep.link"), html: '<p class="rep-url">' + e(linkUrl()) + "</p>" }
    ],
    text: sheetText()
  });
}
function doPrint() { openCalcReport(); }
function doCopy() {
  const sheet = sheetText();
  if (!sheet) { msg(t("calc.ui.checkfirst")); return; }
  $("calcCopy").dataset.sheet = sheet;
  toClipboard(sheet).then(ok => msg(ok ? t("calc.ui.copied", { n: sheet.split("\n").length }) : t("calc.ui.copyfail")));
}
function doLink() {
  const u = linkUrl();
  $("calcLink").dataset.url = u;
  try { history.replaceState(null, "", u); } catch (_) { /* file:// of sandbox */ }
  toClipboard(u).then(ok => msg(ok ? t("calc.ui.linkcopied") : t("calc.ui.linkbar")));
}
