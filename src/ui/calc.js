// Werkplek "Calculators": flexure-rekenhulpen naast de schets. Alleen UI; de formules staan in src/calc/.
import { MATERIALS, MATERIAL_SOURCE, material } from "../calc/materials.js";
import { crossPivot, leafSpring, notchHinge, parallelLeaf, wireFlexure } from "../calc/flexures.js";
import { effModulus, effRadius, hertzSphere, kinCoupling } from "../calc/contact.js";
import { dynAmp, fnForT, isolator, msd, overshoot, peakAmp, servo, settleInfo, settleTime, step as stepResp, transmissibility } from "../calc/dynamics.js";
import { athermal, dLength, lumped } from "../calc/thermal.js";
import { numStr } from "./format.js";
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
const LIT = {
  soemers: 'Soemers, <i>Design Principles for Precision Mechanisms</i> (T-Pointprint, 2010), par. bladveren',
  roark: 'Young &amp; Budynas, <i>Roark’s Formulas for Stress and Strain</i> (McGraw-Hill, 7e, 2002), balkformules',
  gere: 'Gere &amp; Goodno, <i>Mechanics of Materials</i> (Cengage), buiging en axiale belasting',
  tim: 'Timoshenko &amp; Gere, <i>Theory of Elastic Stability</i> (McGraw-Hill, 2e, 1961), knik en balk-kolom',
  smith: 'Smith, <i>Flexures: Elements of Elastic Mechanisms</i> (Gordon &amp; Breach, 2000)',
  henein: 'Henein, <i>Conception des guidages flexibles</i> (PPUR, 2001)',
  pw: 'Paros &amp; Weisbord, <i>How to design flexure hinges</i>, Machine Design 37 (1965) 151–156',
  lobontiu: 'Lobontiu, <i>Compliant Mechanisms: Design of Flexure Hinges</i> (CRC Press, 2002)',
  schot: 'Schotborgh e.a., <i>Dimensionless design graphs for flexure elements</i>, Precision Engineering 29 (2005) 41–47',
  wittrick: 'Wittrick, <i>The properties of crossed flexure pivots</i>, Aeronautical Quarterly 2 (1951) 272–292',
  haringx: 'Haringx, <i>The cross-spring pivot as a constructional element</i>, Applied Scientific Research A1 (1949) 313–332',
  denhartog: 'Den Hartog, <i>Mechanical Vibrations</i> (Dover, 1985)',
  awtar: 'Awtar, <i>Synthesis and Analysis of Parallel Kinematic XY Flexure Mechanisms</i> (PhD, MIT, 2004)',
  howell: 'Howell, <i>Compliant Mechanisms</i> (Wiley, 2001)',
  johnson: 'Johnson, <i>Contact Mechanics</i> (Cambridge University Press, 1985), hoofdstukken over Hertz-contact en over tangentiële krachten (Mindlin)',
  slocum: 'Slocum, <i>Precision Machine Design</i> (SME, 1992), delen over contact en kinematische koppelingen',
  rao: 'Rao, <i>Mechanical Vibrations</i> (Pearson, 5e, 2011), vrije en gedwongen trillingen met demping, trillingsisolatie',
  harris: 'Harris &amp; Piersol, <i>Harris’ Shock and Vibration Handbook</i> (McGraw-Hill, 5e, 2002), trillingsisolatie',
  franklin: 'Franklin, Powell &amp; Emami-Naeini, <i>Feedback Control of Dynamic Systems</i> (Pearson), stijgtijd en bandbreedte',
  munnig: 'Munnig Schmidt, Schitter, Rankers &amp; Van Eijk, <i>The Design of High Performance Mechatronics</i> (IOS Press, 3e, 2020), regelaar en eigenfrequentie',
  incropera: 'Incropera &amp; DeWitt, <i>Fundamentals of Heat and Mass Transfer</i> (Wiley), lumped-capacitance methode, Biot-getal',
  invar: 'Slocum, <i>Precision Machine Design</i> (SME, 1992), thermische uitzetting en athermisch ontwerp',
};
const SRC_S = LIT.soemers;
const SRC_H = LIT.smith + "; " + LIT.henein;

// ---------- invoervelden ----------
const f = (id, label, unit, def, min, range, grp) => ({ id, label, unit, def, min: min == null ? 0 : min, range, grp });
// bovengrens voor een veld: de waarde wordt voor de berekening begrensd en er verschijnt een korte oranje melding
const bound = (i, max, sym) => Object.assign(i, { max, sym });
const selIn = (id, label, def, options, grp) => ({ id, type: "select", label, def, options, grp });
const matIn = (id, label, def) => ({ id, type: "mat", label, def, grp: "Materiaal" });
const IN_M = f("m", "Massa m op de vrije kant", "kg", 0.1);
const IN_F = f("F", "Axiale drukkracht F (druk positief)", "N", 0);
const IN_PLATE = { id: "plate", type: "check", label: "Brede strip (b ≫ t): E′ = E/(1−ν²)", def: false };
const IN_DRIVE = { id: "drive", type: "select", label: "Aandrijving", def: "stiff",
  options: [["stiff", "stijf (positie vast)"], ["soft", "zacht (kracht vast)"]] };

// ---------- waarschuwingen (kort) ----------
function warn(r, sigmaToel, extra) {
  const w = [];
  if (r.sigma > sigmaToel) w.push("Spanning " + num(r.sigma) + " MPa is hoger dan σ_toel = " + num(sigmaToel) + " MPa.");
  if (r.margin < 2) w.push("Knikveiligheid " + num(r.margin) + " is lager dan 2.");
  return w.concat(extra || []);
}
// geldigheid van de kleine-doorbuiging-formules voor bladveren en draden
function geomWarn(p, kind) {
  const w = [];
  if (p.u / p.L > 0.1) w.push("u/L = " + num(p.u / p.L) + " > 0,1: geometrische niet-lineariteit, c_x en Δz worden onnauwkeurig.");
  if (kind === "wire") {
    if (p.L / p.d < 20) w.push("L/d = " + num(p.L / p.d) + " < 20: dikke draad, afschuiving niet meegenomen.");
    return w;
  }
  if (p.L / p.t < 20) w.push("L/t = " + num(p.L / p.t) + " < 20: dikke bladveer, afschuiving niet meegenomen.");
  const bt = p.b / p.t;
  if (bt < 5) w.push("b/t = " + num(bt) + " < 5: smal blad" + (p.plate ? ", E′ voor een brede strip is hier niet van toepassing." : "; dwarscontractie en afschuiving worden belangrijk."));
  else if (bt >= 10 && !p.plate) w.push("b/t = " + num(bt) + ": breed blad, overweeg E′ = E/(1−ν²) (vink ‘Brede strip’ aan).");
  return w;
}
function massWarn(p, r) {
  return r.mLeaf > 0.05 * p.m ? ["Bladmassa is " + num(100 * r.mLeaf / p.m) + " % van m: eigenfrequentie wordt te hoog geschat."] : [];
}
// raw = de rekenwaarde achter de tekst v. Alleen als de tekst er (op 0,6 % na) mee overeenkomt; anders NaN (dan is het geen enkel getal).
function rawOf(v) {
  const r = lastRaw; lastRaw = NaN;
  const t = String(v);
  if (/^∞/.test(t)) return Infinity;
  const q = parseFloat(t.replace(/[\s\u202f\u00a0]/g, "").replace(/\u2212/g, "-").replace(",", "."));
  if (!isFinite(q) || !isFinite(r)) return NaN;
  return Math.abs(r - q) <= 0.006 * Math.abs(r) + 1e-12 ? r : NaN;
}
const res = (k, v, unit, bad) => ({ k, v, unit, bad, raw: rawOf(v) });
const stressBad = (r, M) => r.sigma > M.sigma;
const nFac = (r, M) => (r.sigma > 0 ? M.sigma / r.sigma : Infinity);
const nRes = (r, M) => res("Veiligheidsfactor n = σ_toel/σ", isFinite(nFac(r, M)) ? num(nFac(r, M)) : "∞", "", nFac(r, M) < 1);
const marginRes = r => res("Knikveiligheid P_cr/F", isFinite(r.margin) ? num(r.margin) : "∞ (F = 0)", "", r.margin < 2);
const driveTxt = d => (d === "soft" ? "zacht" : "stijf");

const CALCS = [
  {
    id: "leaf", group: "Flexures", name: "Bladveer", short: "Enkele bladveer, geleid eind (S-vorm)",
    inputs: [f("L", "Lengte L", "mm", 20, 0.01), f("b", "Breedte b", "mm", 10, 0.01), f("t", "Dikte t", "mm", 0.2, 0.001), f("u", "Uitwijking u", "mm", 0.5, 0), IN_F, IN_M, IN_DRIVE, IN_PLATE],
    run: (p, M) => {
      const r = leafSpring(Object.assign({}, p, M));
      return { r,
        out: [res("Stijfheid c_x", num(r.cx), "N/mm"), res("Stijfheid c_x in N/µm", num(r.cx / 1000), "N/µm"),
          res("Dwarsstijfheid onder F: c_x(F)", num(r.cxF), "N/mm", r.cxF <= 0), res("Kracht bij u", num(r.force), "N"),
          res("Axiale stijfheid c_z0", num(r.cz0 / 1000), "kN/mm"), res("Steunstijfheid c_z bij u", num(r.cz / 1000), "kN/mm (" + driveTxt(p.drive) + ")"),
          res("Parasitaire verkorting Δz bij u", num(r.dz * 1000), "µm"), res("Maximale uitwijking u_max", num(r.uMax), "mm"),
          res("Spanning bij u", num(r.sigma), "MPa", stressBad(r, M)), nRes(r, M), res("Knikbelasting P_cr", num(r.Pcr), "N"),
          marginRes(r), res("Eigenfrequentie f", num(r.f), "Hz")],
        warn: warn(r, M.sigma, geomWarn(p, "leaf").concat(massWarn(p, r))) };
    },
    formulas: (p, M, r) => [
      ["Buigstijfheid", "I = " + fr("b·t³", "12"), "I = " + fr(num(p.b) + "·" + num(p.t) + "³", "12") + " = " + num(r.I) + " mm⁴", LIT.roark],
      ["Dwarsstijfheid", sub("c", "x") + " = " + fr("12·E·I", "L³") + " = " + fr("E·b·t³", "L³"), sub("c", "x") + " = " + fr("12·" + num(r.E) + "·" + num(r.I), num(p.L) + "³") + " = " + num(r.cx) + " N/mm", LIT.soemers + "; " + LIT.roark],
      ["Dwarsstijfheid onder axiale druk F", sub("c", "x") + "(F) = " + fr("12·E·I", "L³") + " − " + fr("6", "5") + "·" + fr("F", "L"), sub("c", "x") + "(F) = " + num(r.cx) + " − 1,2·" + num(p.F) + "/" + num(p.L) + " = " + num(r.cxF) + " N/mm", LIT.tim + ". De 6/5 is ∫(y₀′)² dx van de S-vorm y₀ = u(3ξ²−2ξ³) (consistent met Δz = 0,6·u²/L)"],
      ["Axiale stijfheid", sub("c", "z0") + " = " + fr("E·b·t", "L"), sub("c", "z0") + " = " + fr(num(r.E) + "·" + num(p.b) + "·" + num(p.t), num(p.L)) + " = " + num(r.cz0) + " N/mm", LIT.gere],
      ["Steunstijfheid, stijve aandrijving (u vast)" + (p.drive === "soft" ? "" : " ← actief"), fr("1", sub("c", "z")) + " = " + fr("L", "E·b·t") + " + " + fr("u²·L", "700·E·I"), sub("c", "z") + " = " + num(r.czStiff) + " N/mm (" + num(r.czStiff / r.cz0 * 100) + " % van c_z0)", LIT.soemers + ". Coëfficiënt 700 hieronder afgeleid en numeriek bevestigd"],
      ["Steunstijfheid, zachte aandrijving (kracht vast)" + (p.drive === "soft" ? " ← actief" : ""), fr("1", sub("c", "z")) + " = " + fr("L", "E·b·t") + " + " + fr("u²·L", "700·E·I") + " + " + fr("3·u²·L", "25·E·I"), sub("c", "z") + " = " + num(r.czSoft) + " N/mm (" + num(r.czSoft / r.cz0 * 100) + " % van c_z0)", LIT.soemers + " (Δz = 0,6·u²/L); de koppelterm (1,2·u/L)²/c_x volgt uit d(Δz)/du = 1,2·u/L, afgeleid in de unit test"],
      ["Afleiding van de coëfficiënt 700", "EI·y⁗ + F·y″ = 0, y = y₀ + F·y₁, y₀ = u(3ξ² − 2ξ³), EI·y₁⁗ = −y₀″ ⇒ " + fr("ds", "dF") + " = ∫ y₀′·y₁′ dx = " + fr("u²·L", "700·E·I"), "u²·L/(700·E·I) = " + num(p.u ** 2 * p.L / (700 * r.E * r.I), 3) + " mm/N, " + num(p.u ** 2 * p.L / (700 * r.E * r.I) / (p.L / (r.E * p.b * p.t)) * 100) + " % van L/(E·b·t)", LIT.soemers + "; nagerekend met Rayleigh–Ritz (unit test): 1/700 = 0,001428…"],
      ["Parasitaire verkorting", "Δz ≈ 0,6·" + fr("u²", "L"), "Δz = 0,6·" + fr(num(p.u) + "²", num(p.L)) + " = " + num(r.dz * 1000) + " µm", LIT.awtar + "; Soemers"],
      ["Maximale uitwijking", sub("u", "max") + " = " + fr(sub("σ", "toel") + "·L²", "3·E·t"), sub("u", "max") + " = " + fr(num(M.sigma) + "·" + num(p.L) + "²", "3·" + num(r.E) + "·" + num(p.t)) + " = " + num(r.uMax) + " mm", LIT.roark],
      ["Buigspanning", "σ = " + fr("3·E·t·u", "L²") + " + " + fr("F", "b·t"), "σ = " + num(r.sb) + " + " + num(r.sa) + " = " + num(r.sigma) + " MPa", LIT.roark],
      ["Veiligheidsfactor", "n = " + fr(sub("σ", "toel"), "σ"), "n = " + fr(num(M.sigma), num(r.sigma)) + " = " + (isFinite(nFac(r, M)) ? num(nFac(r, M)) : "∞"), "Gebruikelijke definitie (bijv. Gere &amp; Goodno, <i>Mechanics of Materials</i>)"],
      ["Knik (geleid: één uiteinde mag zijwaarts)", sub("P", "cr") + " = " + fr("π²·E·I", "L²"), sub("P", "cr") + " = " + fr("π²·" + num(r.E) + "·" + num(r.I), num(p.L) + "²") + " = " + num(r.Pcr) + " N", LIT.tim],
      ["Eigenfrequentie", "f = " + fr("1", "2π") + "·√" + fr(sub("c", "x") + "·1000", "m"), "f = " + num(r.f) + " Hz (c in N/m = N/mm·1000)", LIT.denhartog],
    ],
    assume: ["Twee ingeklemde uiteinden; het ene uiteinde blijft evenwijdig (geleid), dus S-vorm met het buigmoment F·L/2 op de inklemming.",
      "Kleine doorbuiging (u/L ≤ 0,1), lineair-elastisch; schuifvervorming (L/t ≥ 20) en massa van het blad zijn verwaarloosd.",
      "Steunstijfheid c_z hangt af van de aandrijving. Stijf: de actuator houdt u vast; alleen de S-vorm past zich aan onder axiale last (coëfficiënt 700). Zacht: de dwarskracht is vast en u geeft mee door de kinematische koppeling Δz = 0,6·u²/L; dat is veel slapper.",
      "De axiale druk F verlaagt de dwarsstijfheid: c_x(F) = 12EI/L³ − 1,2·F/L (eerste orde, F ≪ P_cr). Trek (F < 0) verhoogt hem.",
      "Knikrandvoorwaarde: ingeklemd–geleid (zijwaarts vrij), effectieve lengte L: P_cr = π²EI/L². Een volledig ingeklemd uiteinde zonder zijwaartse beweging geeft 4π²EI/L².",
      "σ_toel is een toelaatbare spanning, ≈ vermoeiingssterkte met veiligheid (geen vloeigrens); pas hem aan voor je eigen materiaaltoestand. Spanning is buiging plus F/(b·t)."],
    source: SRC_S + ".",
  },
  {
    id: "par", group: "Flexures", name: "Parallelle bladveer", short: "Twee bladen, geleide tafel",
    inputs: [f("L", "Lengte L per blad", "mm", 20, 0.01), f("b", "Breedte b", "mm", 10, 0.01), f("t", "Dikte t", "mm", 0.2, 0.001), f("u", "Uitwijking u", "mm", 0.5, 0), IN_F, IN_M, IN_DRIVE, IN_PLATE],
    run: (p, M) => {
      const r = parallelLeaf(Object.assign({}, p, M));
      return { r,
        out: [res("Stijfheid c_x (2 bladen)", num(r.cx), "N/mm"), res("Stijfheid c_x in N/µm", num(r.cx / 1000), "N/µm"),
          res("Dwarsstijfheid onder F: c_x(F)", num(r.cxF), "N/mm", r.cxF <= 0), res("Kracht bij u", num(r.force), "N"),
          res("Axiale stijfheid c_z0", num(r.cz0 / 1000), "kN/mm"), res("Steunstijfheid c_z bij u", num(r.cz / 1000), "kN/mm (" + driveTxt(p.drive) + ")"),
          res("Parasitaire verkorting Δz van de tafel", num(r.dz * 1000), "µm"), res("Maximale uitwijking u_max", num(r.uMax), "mm"),
          res("Spanning per blad bij u", num(r.sigma), "MPa", stressBad(r, M)), nRes(r, M), res("Knikbelasting P_cr (totaal)", num(r.Pcr), "N"),
          marginRes(r), res("Eigenfrequentie f", num(r.f), "Hz")],
        warn: warn(r, M.sigma, geomWarn(p, "par")) };
    },
    formulas: (p, M, r) => [
      ["Stijfheid", sub("c", "x") + " = 2·" + fr("12·E·I", "L³") + " = " + fr("2·E·b·t³", "L³"), sub("c", "x") + " = 2·" + fr("12·" + num(r.E) + "·" + num(r.I), num(p.L) + "³") + " = " + num(r.cx) + " N/mm", LIT.soemers + "; " + LIT.roark],
      ["Onder axiale druk F (F/2 per blad)", sub("c", "x") + "(F) = 2·" + fr("12·E·I", "L³") + " − " + fr("6", "5") + "·" + fr("F", "L"), sub("c", "x") + "(F) = " + num(r.cxF) + " N/mm", LIT.tim],
      ["Steunstijfheid (2 bladen)" + " – " + driveTxt(p.drive), fr("1", sub("c", "z")) + " = " + fr("L", "2·E·b·t") + " + " + fr("u²·L", "2·700·E·I") + (p.drive === "soft" ? " + " + fr("3·u²·L", "2·25·E·I") : ""), sub("c", "z") + " = " + num(r.cz) + " N/mm (stijf " + num(r.czStiff) + ", zacht " + num(r.czSoft) + ")", LIT.soemers],
      ["Parasitaire verkorting van de tafel", "Δz ≈ 0,6·" + fr("u²", "L"), "Δz = " + num(r.dz * 1000) + " µm (geen draaiing van de tafel)", LIT.awtar + "; Soemers"],
      ["Maximale uitwijking", sub("u", "max") + " = " + fr(sub("σ", "toel") + "·L²", "3·E·t"), sub("u", "max") + " = " + num(r.uMax) + " mm", LIT.roark],
      ["Spanning per blad", "σ = " + fr("3·E·t·u", "L²") + " + " + fr("F", "2·b·t"), "σ = " + num(r.sb) + " + " + num(r.sa) + " = " + num(r.sigma) + " MPa", LIT.roark],
      ["Veiligheidsfactor", "n = " + fr(sub("σ", "toel"), "σ"), "n = " + (isFinite(nFac(r, M)) ? num(nFac(r, M)) : "∞"), "Gere &amp; Goodno, <i>Mechanics of Materials</i>"],
      ["Knik", sub("P", "cr") + " = 2·" + fr("π²·E·I", "L²"), sub("P", "cr") + " = " + num(r.Pcr) + " N", LIT.tim],
      ["Eigenfrequentie", "f = " + fr("1", "2π") + "·√" + fr(sub("c", "x") + "·1000", "m"), "f = " + num(r.f) + " Hz", LIT.denhartog],
    ],
    assume: ["Twee identieke, evenwijdige bladen met een stijve tafel: de tafel blijft evenwijdig en zakt alleen (Δz).",
      "Kleine doorbuiging, lineair-elastisch; de axiale kracht wordt gelijk over de bladen verdeeld. Stijf/zacht werkt als bij de enkele bladveer, per blad.",
      "De verkorting Δz is de kinematische verkorting van een geleid blad (3/5·u²/L); zonder tweede stel bladen (tussenlichaam) is dit niet te compenseren.",
      "Knik: twee bladen, elk ingeklemd–geleid (effectieve lengte L). σ_toel ≈ vermoeiingssterkte met veiligheid; pas aan."],
    source: SRC_S + ".",
  },
  {
    id: "cross", group: "Flexures", name: "Kruisveerscharnier", short: "Twee gekruiste bladen, kruising op 50 %",
    inputs: [f("L", "Lengte L per blad", "mm", 20, 0.01), f("b", "Breedte b", "mm", 10, 0.01), f("t", "Dikte t", "mm", 0.2, 0.001), f("phi", "Rotatie φ", "°", 5, 0), f("r", "Afstand massa tot draaipunt", "mm", 50, 0.01), IN_F, IN_M, IN_PLATE],
    run: (p, M) => {
      const q = Object.assign({}, p, M, { phi: p.phi * DEG });
      const r = crossPivot(q);
      const w = warn(r, M.sigma, []);
      if (p.L / p.t < 20) w.push("L/t = " + num(p.L / p.t) + " < 20: dikke bladveer, afschuiving niet meegenomen.");
      if (p.F > 0) w.push("Onder belasting daalt c_φ (niet meegenomen); knik is hier niet gecontroleerd.");
      return { r,
        out: [res("Draaistijfheid c_φ", num(r.c), "N·mm/rad"), res("Draaistijfheid c_φ (SI)", num(r.c / 1000), "N·m/rad"),
          res("Moment bij φ", num(r.moment), "N·mm"),
          res("Maximale rotatie φ_max", num(r.phiMax / DEG), "°"), res("Spanning bij φ", num(r.sigma), "MPa", stressBad(r, M)), nRes(r, M),
          res("Verschuiving draaipunt", "niet berekend", "(2e orde in φ)"), res("Stijfheid onder belasting", "daalt", "(niet meegenomen)"),
          res("Eigenfrequentie f", num(r.f), "Hz")],
        warn: w };
    },
    formulas: (p, M, r) => [
      ["Per blad (relatieve eindrotatie φ, zijwaartse verplaatsing Lφ/2)", sub("c", "φ,blad") + " = " + fr("E·I", "L"), "I = " + num(r.I) + " mm⁴", LIT.soemers + "; " + LIT.smith],
      ["Twee bladen", sub("c", "φ") + " = 2·" + fr("E·I", "L") + " = " + fr("E·b·t³", "6·L"), sub("c", "φ") + " = 2·" + fr(num(r.E) + "·" + num(r.I), num(p.L)) + " = " + num(r.c) + " N·mm/rad = " + num(r.c / 1000) + " N·m/rad", LIT.soemers + "; " + LIT.henein],
      ["Maximale rotatie", sub("φ", "max") + " = " + fr("2·" + sub("σ", "toel") + "·L", "E·t"), sub("φ", "max") + " = " + fr("2·" + num(M.sigma) + "·" + num(p.L), num(r.E) + "·" + num(p.t)) + " = " + num(r.phiMax) + " rad = " + num(r.phiMax / DEG) + "°", LIT.roark],
      ["Spanning", "σ = " + fr("E·t·φ", "2·L") + " + " + fr("F", "2·b·t"), "σ = " + num(r.sb) + " + " + num(r.sa) + " = " + num(r.sigma) + " MPa", LIT.roark],
      ["Veiligheidsfactor", "n = " + fr(sub("σ", "toel"), "σ"), "n = " + (isFinite(nFac(r, M)) ? num(nFac(r, M)) : "∞"), "Gere &amp; Goodno, <i>Mechanics of Materials</i>"],
      ["Belastingafhankelijke stijfheid", sub("c", "φ") + "(F) < " + sub("c", "φ"), "niet berekend: de stijfheid daalt bij axiale belasting", LIT.wittrick + "; " + LIT.haringx],
      ["Eigenfrequentie (massa m op arm r)", "f = " + fr("1", "2π") + "·√" + fr(sub("c", "φ"), "m·r²"), "f = " + num(r.f) + " Hz (c in N·m/rad, r in m)", LIT.denhartog],
    ],
    assume: ["Twee identieke bladen, kruising op het midden (50 %); het draaipunt ligt dan in de kruising en verschuift in eerste orde niet. In tweede orde (orde L·φ²) verschuift het wel; dat is hier niet berekend. Bij een andere kruispositie verschuift het draaipunt al in eerste orde.",
      "Afleiding: elk blad krijgt een eindrotatie φ en een zijwaartse verplaatsing Lφ/2 (stijve rotatie om het kruispunt); met de inklemmingsformule U = (2EI/L)(θ_B² − 3ψθ_B + 3ψ²), ψ = φ/2 volgt c = EI/L per blad.",
      "Het blad is een balk met alleen buiging; axiale en schuifbijdragen zijn verwaarloosd. De stijfheid daalt bij belasting (niet meegenomen; zie Wittrick 1951, Haringx 1949), daarom is er geen knikveiligheid getoond.",
      "σ_toel ≈ vermoeiingssterkte met veiligheid; pas aan."],
    source: SRC_S + "; " + SRC_H + "; " + LIT.wittrick + ".",
  },
  {
    id: "notch", group: "Flexures", name: "Scharnier met inkeping", short: "Cirkelvormige inkeping (notch hinge)",
    inputs: [f("b", "Breedte b", "mm", 10, 0.01), f("t", "Dunste doorsnede t", "mm", 0.3, 0.001), f("R", "Inkepingsstraal R", "mm", 3, 0.01), f("phi", "Rotatie φ", "°", 0.3, 0), f("Kt", "Spanningsconcentratie K_t", "–", 1.5, 1), f("r", "Afstand massa tot draaipunt", "mm", 50, 0.01), IN_M, IN_PLATE],
    run: (p, M) => {
      const r = notchHinge(Object.assign({}, p, M, { phi: p.phi * DEG }));
      const w = warn({ sigma: r.sigma, margin: Infinity }, M.sigma);
      if (r.ratio > 0.2) w.push("t/(2R) = " + num(r.ratio) + " > 0,2: Paros–Weisbord minder nauwkeurig (afwijking loopt snel op).");
      return { r,
        out: [res("Draaistijfheid c_φ", num(r.c), "N·mm/rad"), res("Draaistijfheid c_φ (SI)", num(r.c / 1000), "N·m/rad"), res("Moment bij φ", num(r.moment), "N·mm"),
          res("Nominale spanning", num(r.sNom), "MPa"), res("Piekspanning K_t·σ", num(r.sigma), "MPa", stressBad(r, M)), nRes(r, M),
          res("Maximale rotatie φ_max", num(r.phiMax / DEG), "°"), res("Maximale rotatie φ_max", num(r.phiMax * 1000), "mrad"),
          res("Eigenfrequentie f", num(r.f), "Hz")],
        warn: w };
    },
    formulas: (p, M, r) => [
      ["Draaistijfheid (Paros–Weisbord)", sub("c", "φ") + " ≈ " + fr("2·E·b·" + sup("t", "5/2"), "9π·√R"), sub("c", "φ") + " = " + fr("2·" + num(r.E) + "·" + num(p.b) + "·" + num(p.t) + "<sup>5/2</sup>", "9π·√" + num(p.R)) + " = " + num(r.c) + " N·mm/rad = " + num(r.c / 1000) + " N·m/rad", LIT.pw],
      ["Nominale buigspanning", sub("σ", "nom") + " = " + fr("6·M", "b·t²") + " = " + fr("4", "3π") + "·E·√" + fr("t", "R") + "·φ", sub("σ", "nom") + " = " + num(r.sNom) + " MPa", LIT.pw + "; " + LIT.smith],
      ["Piekspanning", sub("σ", "max") + " = " + sub("K", "t") + "·" + sub("σ", "nom"), sub("σ", "max") + " = " + num(p.Kt) + "·" + num(r.sNom) + " = " + num(r.sigma) + " MPa", LIT.smith],
      ["Veiligheidsfactor", "n = " + fr(sub("σ", "toel"), sub("σ", "max")), "n = " + (isFinite(nFac(r, M)) ? num(nFac(r, M)) : "∞"), "Gere &amp; Goodno, <i>Mechanics of Materials</i>"],
      ["Maximale rotatie", sub("φ", "max") + " = " + fr(sub("σ", "toel"), sub("K", "t") + "·" + fr("4", "3π") + "·E·√(t/R)"), sub("φ", "max") + " = " + num(r.phiMax * 1000) + " mrad = " + num(r.phiMax / DEG) + "°", LIT.pw],
      ["Geldigheid", "t/(2R) ≤ 0,2", "t/(2R) = " + num(r.ratio), LIT.schot + "; " + LIT.lobontiu],
      ["Eigenfrequentie", "f = " + fr("1", "2π") + "·√" + fr(sub("c", "φ"), "m·r²"), "f = " + num(r.f) + " Hz", LIT.denhartog],
    ],
    assume: ["Cirkelvormige inkeping aan beide zijden, t ≪ R; de vereenvoudigde gesloten vorm van Paros en Weisbord (1965) is een reeksontwikkeling voor kleine t/(2R). Zij is bruikbaar tot ongeveer 0,2; daarboven loopt de afwijking snel op (tientallen procenten).",
      "Rotatie om het midden van de inkeping; parasitaire verplaatsing van het draaipunt, schuif- en axiale stijfheid zijn niet berekend.",
      "K_t is een invoer (schatting; voor diepe ronde inkepingen ca. 1,3 tot 3). Zie Smith voor grafieken. Bij vermoeiing en hoge φ de waarde conservatief kiezen.",
      "σ_toel ≈ vermoeiingssterkte met veiligheid; pas aan."],
    source: SRC_H + "; " + LIT.pw + "; " + LIT.lobontiu + ".",
  },
  {
    id: "wire", group: "Flexures", name: "Draadflexure", short: "Dunne draad als scharnier of veer",
    inputs: [f("L", "Lengte L", "mm", 50, 0.01), f("d", "Diameter d", "mm", 1, 0.001), f("u", "Zijwaartse uitwijking u", "mm", 0.5, 0), IN_F, IN_M,
      { id: "bc", type: "select", label: "Uiteinden", def: "guided", options: [["guided", "Beide ingeklemd, eind geleid (12EI/L³)"], ["free", "Eén eind ingeklemd, ander vrij (3EI/L³)"]] }],
    run: (p, M) => {
      const r = wireFlexure(Object.assign({}, p, M));
      return { r,
        out: [res("Axiale stijfheid c_ax", num(r.cax / 1000), "kN/mm"), res("Buigstijfheid c_b", num(r.cb), "N/mm"), res("Buigstijfheid c_b in N/µm", num(r.cb / 1000), "N/µm"),
          res("Kracht bij u", num(r.force), "N"), res("Maximale uitwijking u_max", num(r.uMax), "mm"),
          res("Spanning bij u", num(r.sigma), "MPa", stressBad(r, M)), nRes(r, M), res("Knikbelasting P_cr", num(r.Pcr), "N"),
          marginRes(r), res("f zijwaarts", num(r.f), "Hz"), res("f axiaal", num(r.fax), "Hz")],
        warn: warn(r, M.sigma, geomWarn(p, "wire")) };
    },
    formulas: (p, M, r) => {
      const g = p.bc === "guided";
      return [
        ["Doorsnede", "A = " + fr("π·d²", "4") + ", I = " + fr("π·d⁴", "64"), "A = " + num(r.A) + " mm², I = " + num(r.I) + " mm⁴", LIT.gere],
        ["Axiale stijfheid", sub("c", "ax") + " = " + fr("E·A", "L"), sub("c", "ax") + " = " + fr(num(p.E) + "·" + num(r.A), num(p.L)) + " = " + num(r.cax) + " N/mm", LIT.gere],
        ["Buigstijfheid", sub("c", "b") + " = " + (g ? fr("12·E·I", "L³") : fr("3·E·I", "L³")), sub("c", "b") + " = " + num(r.cb) + " N/mm", LIT.roark],
        ["Maximale uitwijking", sub("u", "max") + " = " + (g ? fr(sub("σ", "toel") + "·L²", "3·E·d") : fr("2·" + sub("σ", "toel") + "·L²", "3·E·d")), sub("u", "max") + " = " + num(r.uMax) + " mm", LIT.roark],
        ["Spanning", "σ = " + (g ? fr("3·E·d·u", "L²") : fr("3·E·d·u", "2·L²")) + " + " + fr("F", "A"), "σ = " + num(r.sb) + " + " + num(r.sa) + " = " + num(r.sigma) + " MPa", LIT.roark],
        ["Veiligheidsfactor", "n = " + fr(sub("σ", "toel"), "σ"), "n = " + (isFinite(nFac(r, M)) ? num(nFac(r, M)) : "∞"), "Gere &amp; Goodno, <i>Mechanics of Materials</i>"],
        ["Knik", sub("P", "cr") + " = " + fr("π²·E·I", (g ? "" : "4·") + "L²"), sub("P", "cr") + " = " + num(r.Pcr) + " N", LIT.tim],
        ["Eigenfrequenties", "f = " + fr("1", "2π") + "·√" + fr("c·1000", "m"), "f<sub>zijw</sub> = " + num(r.f) + " Hz, f<sub>ax</sub> = " + num(r.fax) + " Hz", LIT.denhartog],
      ];
    },
    assume: ["Ronde, rechte draad met gelijke diameter; lineair-elastisch en kleine doorbuiging (u/L ≤ 0,1).",
      "Geleid eind (S-vorm): moment F·L/2 op de inklemming. Eén eind vrij: moment F·L, knik met effectieve lengte 2L (P_cr = π²EI/(4L²)).",
      "Spanning is buiging plus F/A; de uiteinden zijn ideaal ingeklemd, praktijk is slapper. σ_toel ≈ vermoeiingssterkte met veiligheid; pas aan.",
      "Een draad is stijf op trek/druk en slap op buiging: c_ax/c_b ≈ (4/3)·(L/d)² voor de geleide draad."],
    source: SRC_S + "; " + SRC_H + ".",
  },
];

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
  R.leg.textContent = "σ = " + num(r.sigma) + " MPa · " + Math.round(ratio * 100) + " % van σ_toel"; R.leg.style.fill = col;
  const parts = facs.filter(x => x[1] > 1.15).map(x => x[0] + " ×" + num(x[1], 2));
  R.note.textContent = parts.length ? "× schaal: " + parts.join(", ") : "";
  return col;
}
// doorsnede b × t (of draad d) als inzet
function mkInset(svg, R, wire) {
  R.inH = txt(svg, "s-small", "middle"); R.inH.textContent = "doorsnede"; set(R.inH, { x: 275, y: 118 });
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
      setFoot(R, r, M, [[wire ? "diameter" : "dikte", tFac], ["uitwijking", uFac], ["doorsnede", insF]]);
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
      setFoot(R, r, M, [["dikte", tFac], ["rotatie", pf], ["doorsnede", insF]]);
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
      set(R.bT, { x: cx, y: 212 }); R.bT.textContent = "b = " + num(p.b) + " mm (loodrecht op het vlak)";
      setFoot(R, r, M, [["dunste doorsnede", tFac], ["rotatie", pf]]);
    },
  };
}
const FIGS = { leaf: beamFig("leaf"), par: beamFig("par"), cross: crossFig(), notch: notchFig(), wire: beamFig("wire") };
// (nieuwe calculators: Contact, Dynamica, Thermisch)
// ===================== Contact, Dynamica, Thermisch =====================
const K = (k, u, v, sub, status) => ({ k, u, v, sub: sub || "", status: status || "" });
const statOf = (s, warnBelow) => (s < 1 ? "bad" : s < (warnBelow || 1.5) ? "warn" : "ok");
const tFmt = s => (!isFinite(s) ? ["—", "s"] : s < 1 ? [num(s * 1000), "ms"] : s < 120 ? [num(s), "s"] : s < 7200 ? [num(s / 60), "min"] : [num(s / 3600), "uur"]);
const tTxt = s => tFmt(s).join(" ");
const hzTxt = x => num(x) + " Hz";

// ---------- Contact ----------
const P0_LIM = {
  label: "Toelaatbare Hertz-druk p₀,toel", unit: "MPa",
  hint: "Richtwaarde, zelf te kiezen: standaard 1,6·σ<sub>y</sub> van het zwakste materiaal (vloeibegin onder het oppervlak, Johnson). Lager nemen voor vermoeiing of als geen blijvende indrukking mag optreden.",
  auto: p => 1.6 * Math.min(material(p.mat1).sy, material(p.mat2).sy),
};
const GEOM_OPT = [["flat", "bol – vlak"], ["convex", "bol – bol (bol op bol)"], ["concave", "bol in holle bol (concaaf, R₂ > R₁)"]];
const geomTxt = g => (GEOM_OPT.filter(o => o[0] === g)[0] || GEOM_OPT[0])[1];
const MAT_DEF = [matIn("mat1", "Materiaal bol", "staal"), matIn("mat2", "Materiaal tegenhouder", "staal")];

CALCS.push({
  id: "hertz", group: "Contact", name: "Hertz-contact", short: "Bol op vlak of bol op bol; ook per flank van een V-groef",
  inputs: [selIn("geom", "Geometrie", "flat", GEOM_OPT, "Geometrie"), f("R1", "Straal bol R₁", "mm", 5, 0.01, [0.5, 50, 1], "Geometrie"),
    f("R2", "Straal tegenhouder R₂ (alleen bol–bol / holle bol)", "mm", 10, 0.01, [0.5, 100, 1], "Geometrie"),
    f("F", "Totale belasting F langs de as", "N", 10, 0.001, [0.1, 5000, 1], "Belasting"),
    selIn("n", "Aantal gelijke contacten n (V-groef: 2)", "1", [["1", "1"], ["2", "2 (V-groef)"], ["3", "3"], ["4", "4"], ["6", "6"]], "Belasting"),
    bound(f("theta", "Hoek θ tussen flanknormaal en belasting (V-groef 90°: 45°)", "°", 0, 0, [0, 75, 0], "Belasting"), 89, "θ")].concat(MAT_DEF),
  lim: P0_LIM,
  run: (p, M) => {
    const m1 = material(p.mat1), m2 = material(p.mat2), n = +p.n, th = p.theta * DEG;
    const Es = effModulus(m1.E, m1.nu, m2.E, m2.nu), Re = effRadius(p.geom, p.R1, p.R2);
    const Fn = p.F / (n * Math.cos(th)), h = hertzSphere({ F: Fn, R: Re, Es });
    const r = Object.assign({}, h, { Fn, Es, Re, n, th, kax: n * h.kn * Math.cos(th) ** 2, margin: M.sigma / h.p0, m1, m2 });
    const w = [];
    if (!(Re > 0)) w.push("Bol in holle bol: R₂ moet groter zijn dan R₁ (anders past de bol niet).");
    if (r.margin < 1) w.push("p₀ = " + num(h.p0) + " MPa is hoger dan p₀,toel = " + num(M.sigma) + " MPa: kans op blijvende indrukking (Brinell-afdruk).");
    else if (r.margin < 1.5) w.push("p₀ ligt binnen 50 % van p₀,toel; weinig marge voor stoten of tolerantie in de belasting.");
    if (Re > 0 && h.a / Re > 0.1) w.push("a/R = " + num(h.a / Re) + " > 0,1: de Hertz-aanname (contactvlak ≪ kromtestraal) wordt slecht.");
    if (p.theta > 60) w.push("θ = " + num(p.theta) + "° is zeer steil: F_n = F/(n·cos θ) wordt groot en wrijving bepaalt of het contact blijft zitten.");
    if (m1.id === "zerodur" || m2.id === "zerodur" || m1.id === "alumina" || m2.id === "alumina" || m1.id === "wc" || m2.id === "wc") w.push("Brosse materialen: breuk door trekspanning rond de rand van het contact (Auerbach) is hier niet gecontroleerd; p₀,toel is een schatting.");
    return { r, warn: w,
      out: [res("Normaalkracht per contact F_n", num(Fn), "N"), res("Effectieve modulus E*", num(Es / 1000), "GPa"), res("Effectieve straal R", num(Re), "mm"),
        res("Contactstraal a", num(h.a * 1000), "µm"), res("Contactdiameter 2a", num(2 * h.a), "mm"), res("Nadering δ", num(h.delta * 1000), "µm"),
        res("Maximale druk p₀", num(h.p0), "MPa", r.margin < 1), res("Gemiddelde druk", num(h.pMean), "MPa"), res("Veiligheid p₀,toel/p₀", isFinite(r.margin) ? num(r.margin) : "∞", "", r.margin < 1),
        res("Normaalstijfheid k_n", num(h.kn / 1000), "N/µm"), res("Stijfheid langs de as k_ax", num(r.kax / 1000), "N/µm"),
        res("Diepte max. schuifspanning", num(h.zTau * 1000), "µm"), res("Max. schuifspanning τ_max", num(h.tauMax), "MPa"), res("Max. Von Mises", num(h.vm), "MPa")] };
  },
  keys: (r, p, M) => [K("Maximale druk p₀", "MPa", num(r.p0), "a = " + num(r.a * 1000) + " µm"), K("Normaalstijfheid k_n", "N/µm", num(r.kn / 1000), "δ = " + num(r.delta * 1000) + " µm"),
    K("Veiligheid p₀,toel/p₀", "", isFinite(r.margin) ? "× " + num(r.margin) : "∞", "p₀,toel = " + num(M.sigma) + " MPa", r.margin > 0 ? statOf(r.margin) : "bad")],
  formulas: (p, M, r) => [
    ["Effectieve modulus (twee materialen)", fr("1", "E*") + " = " + fr("1 − " + sub("ν", "1") + "²", sub("E", "1")) + " + " + fr("1 − " + sub("ν", "2") + "²", sub("E", "2")),
      fr("1", "E*") + " = " + fr("1 − " + num(r.m1.nu) + "²", num(r.m1.E)) + " + " + fr("1 − " + num(r.m2.nu) + "²", num(r.m2.E)) + " ⇒ E* = " + num(r.Es) + " MPa", LIT.johnson],
    ["Effectieve straal (" + geomTxt(p.geom) + ")", p.geom === "convex" ? "R = " + fr(sub("R", "1") + "·" + sub("R", "2"), sub("R", "1") + " + " + sub("R", "2")) : p.geom === "concave" ? "R = " + fr(sub("R", "1") + "·" + sub("R", "2"), sub("R", "2") + " − " + sub("R", "1")) : "R = " + sub("R", "1") + " (tegenhouder vlak)",
      "R = " + num(r.Re) + " mm", LIT.johnson],
    ["Normaalkracht per contact", sub("F", "n") + " = " + fr("F", "n·cos θ"), sub("F", "n") + " = " + fr(num(p.F), num(r.n) + "·cos " + num(p.theta) + "°") + " = " + num(r.Fn) + " N", "Statica; V-groef met 90° tussen de flanken: n = 2, θ = 45°, dus F_n = F/√2"],
    ["Contactstraal", "a = " + "(" + fr("3·" + sub("F", "n") + "·R", "4·E*") + ")<sup>1/3</sup>", "a = (" + fr("3·" + num(r.Fn) + "·" + num(r.Re), "4·" + num(r.Es)) + ")<sup>1/3</sup> = " + num(r.a) + " mm = " + num(r.a * 1000) + " µm", LIT.johnson],
    ["Nadering", "δ = " + fr("a²", "R"), "δ = " + fr(num(r.a) + "²", num(r.Re)) + " = " + num(r.delta * 1000) + " µm", LIT.johnson],
    ["Maximale druk", sub("p", "0") + " = " + fr("3·" + sub("F", "n"), "2π·a²"), sub("p", "0") + " = " + fr("3·" + num(r.Fn), "2π·" + num(r.a) + "²") + " = " + num(r.p0) + " MPa (gemiddeld " + num(r.pMean) + " MPa = ⅔·p₀)", LIT.johnson],
    ["Normaalstijfheid (raaklijn) en langs de as", sub("k", "n") + " = " + fr("d" + sub("F", "n"), "dδ") + " = 2·E*·a = " + fr("3·" + sub("F", "n"), "2·δ") + ",  " + sub("k", "ax") + " = n·" + sub("k", "n") + "·cos²θ",
      sub("k", "n") + " = 2·" + num(r.Es) + "·" + num(r.a) + " = " + num(r.kn) + " N/mm = " + num(r.kn / 1000) + " N/µm;  " + sub("k", "ax") + " = " + num(r.kax / 1000) + " N/µm", LIT.johnson + ". Controle: 1,5·F_n/δ geeft hetzelfde"],
    ["Ondergrond: maximale schuifspanning (ν ≈ 0,3)", sub("τ", "max") + " ≈ 0,31·" + sub("p", "0") + " op diepte z ≈ 0,48·a;  " + sub("σ", "VM,max") + " ≈ 0,62·" + sub("p", "0"),
      sub("τ", "max") + " = 0,31·" + num(r.p0) + " = " + num(r.tauMax) + " MPa op z = " + num(r.zTau * 1000) + " µm;  σ<sub>VM</sub> = " + num(r.vm) + " MPa", LIT.johnson + " (par. over spanningen onder het oppervlak; waarden gelden voor ν = 0,3)"],
    ["Veiligheid", "n = " + fr(sub("p", "0,toel"), sub("p", "0")), "n = " + fr(num(M.sigma), num(r.p0)) + " = " + num(r.margin), "p₀,toel is jouw invoer. Vloeibegin: p₀ ≈ 1,6·σ_y (Johnson, Von Mises, ν = 0,3)"],
  ],
  assume: ["Elastisch Hertz-puntcontact: gladde, ideaal bolvormige oppervlakken, a ≪ R (liefst a/R < 0,1), geen wrijving in het contact, halve ruimten (geen randen dicht bij het contact).",
    "Bij een V-groef is elke flank een vlak: bol-op-vlak per flank. Neem n = 2 en θ = 90° − (openingshoek/2); het programma rekent F_n = F/(n·cos θ) en de stijfheid langs de belastingas als n·k_n·cos²θ.",
    "δ is de totale nadering van de twee lichamen (som van beide indrukkingen); k_n is de raaklijnstijfheid in dit werkpunt. De stijfheid neemt toe met F^(1/3).",
    "De spanningsfactoren 0,31 (τ_max), 0,48 (diepte) en 0,62 (Von Mises) gelden voor ν = 0,3 (Johnson); voor ν = 0,22 (keramiek) wijken ze enkele procenten af.",
    "p₀,toel is een richtwaarde die jij kiest. Standaard 1,6·σ_y: dan begint plastische vervorming onder het oppervlak. Voor vermoeiing of een afdrukvrij precisiecontact hoort de grens lager te liggen; voor sterk verharde oppervlakken kan hij hoger. Voor keramiek is σ_y de druksterkte en bepaalt trekspanning aan de rand het falen."],
  source: LIT.johnson + "; " + LIT.slocum + ".",
});

CALCS.push({
  id: "kc", group: "Contact", name: "Kinematische koppeling", short: "Maxwell: 3 bollen in 3 V-groeven, zes contacten",
  inputs: [f("R", "Straal bol R", "mm", 6, 0.01, [1, 25, 1], "Geometrie"), bound(f("gamma", "Openingshoek van de V-groef γ", "°", 90, 10, [30, 150, 0], "Geometrie"), 179, "γ"),
    f("F", "Totale voorspanning F (langs de as)", "N", 60, 0.001, [1, 5000, 1], "Belasting"), bound(f("mu", "Wrijvingscoëfficiënt μ", "–", 0.15, 0, [0.02, 0.6, 0], "Belasting"), 2, "μ")].concat(MAT_DEF),
  lim: P0_LIM,
  run: (p, M) => {
    const m1 = material(p.mat1), m2 = material(p.mat2);
    const k = kinCoupling({ F: p.F, R: p.R, gamma: p.gamma, mu: p.mu, E1: m1.E, nu1: m1.nu, E2: m2.E, nu2: m2.nu });
    const r = Object.assign({}, k, { margin: M.sigma / k.p0, m1, m2 }), w = [];
    if (r.margin < 1) w.push("p₀ = " + num(k.p0) + " MPa is hoger dan p₀,toel = " + num(M.sigma) + " MPa: kans op blijvende indrukking en daarmee herhaalfout.");
    else if (r.margin < 1.5) w.push("p₀ ligt binnen 50 % van p₀,toel; weinig marge.");
    if (p.gamma < 60) w.push("γ = " + num(p.gamma) + "° is scherp: N = F/(6·sin(γ/2)) wordt groot (" + num(r.N) + " N per contact) en de flanken kunnen klemmen.");
    if (k.a / p.R > 0.1) w.push("a/R = " + num(k.a / p.R) + " > 0,1: Hertz wordt onnauwkeurig.");
    return { r, warn: w,
      out: [res("Normaalkracht per contact N", num(k.N), "N"), res("Contactstraal a", num(k.a * 1000), "µm"), res("Nadering δ per contact", num(k.delta * 1000), "µm"),
        res("Maximale druk p₀", num(k.p0), "MPa", r.margin < 1), res("Veiligheid p₀,toel/p₀", isFinite(r.margin) ? num(r.margin) : "∞", "", r.margin < 1),
        res("Normaalstijfheid per contact k_n", num(k.kn / 1000), "N/µm"), res("Koppelingsstijfheid langs de as k_ax", num(k.kAx / 1000), "N/µm"),
        res("Tangentiële stijfheid k_t = 8·G*·a", num(k.kt / 1000), "N/µm"), res("Slipkracht per groef 2·μ·N", num(k.QGroove), "N"),
        res("Verplaatsing tot slippen μ·N/k_t", num(k.xStick * 1e6), "nm"), res("Virtueel spel (volledig slippen)", num(k.xSlip * 1e6), "nm")] };
  },
  keys: (r, p, M) => [K("Stijfheid langs de as k_ax", "N/µm", num(r.kAx / 1000), "6 contacten, N = " + num(r.N) + " N elk"),
    K("Virtueel spel (schatting)", "nm", num(r.xSlip * 1e6), "tot volledig slippen, μ = " + num(p.mu)),
    K("Veiligheid p₀,toel/p₀", "", isFinite(r.margin) ? "× " + num(r.margin) : "∞", "p₀ = " + num(r.p0) + " MPa", statOf(r.margin))],
  formulas: (p, M, r) => [
    ["Normaalkracht per contact (3 groeven × 2 flanken)", "6·N·sin(γ/2) = F  ⇒  N = " + fr("F", "6·sin(γ/2)"), "N = " + fr(num(p.F), "6·sin(" + num(p.gamma / 2) + "°)") + " = " + num(r.N) + " N", LIT.slocum + ". Aanname: voorspanning in het zwaartepunt, alle groeven even zwaar belast"],
    ["Effectieve modulus", fr("1", "E*") + " = " + fr("1 − " + sub("ν", "1") + "²", sub("E", "1")) + " + " + fr("1 − " + sub("ν", "2") + "²", sub("E", "2")), "E* = " + num(r.Es) + " MPa", LIT.johnson],
    ["Hertz per contact (bol op vlakke flank, R = bolstraal)", "a = (" + fr("3·N·R", "4·E*") + ")<sup>1/3</sup>,  δ = " + fr("a²", "R") + ",  " + sub("p", "0") + " = " + fr("3·N", "2π·a²"),
      "a = " + num(r.a * 1000) + " µm, δ = " + num(r.delta * 1000) + " µm, p₀ = " + num(r.p0) + " MPa", LIT.johnson],
    ["Normaalstijfheid per contact", sub("k", "n") + " = 2·E*·a", sub("k", "n") + " = 2·" + num(r.Es) + "·" + num(r.a) + " = " + num(r.kn / 1000) + " N/µm", LIT.johnson],
    ["Stijfheid langs de voorspanningsas", sub("k", "ax") + " = 6·" + sub("k", "n") + "·sin²(γ/2)", sub("k", "ax") + " = 6·" + num(r.kn / 1000) + "·" + num(r.s ** 2) + " = " + num(r.kAx / 1000) + " N/µm", "Elk contact levert k_n·sin²(γ/2) (normaal gedeeld over de flanknormaal), zes contacten. Alleen de Hertz-veerstijfheid; legering, vlakheid en omliggende constructie zijn niet inbegrepen"],
    ["Effectieve schuifmodulus", fr("1", "G*") + " = " + fr("2 − " + sub("ν", "1"), sub("G", "1")) + " + " + fr("2 − " + sub("ν", "2"), sub("G", "2")) + ",  G = " + fr("E", "2(1+ν)"), "G* = " + num(r.Gs) + " MPa", LIT.johnson + " (Mindlin)"],
    ["Tangentiële stijfheid per contact", sub("k", "t") + " = 8·G*·a", sub("k", "t") + " = 8·" + num(r.Gs) + "·" + num(r.a) + " = " + num(r.kt / 1000) + " N/µm", LIT.johnson + " (Mindlin; lineair, onder de slipgrens)"],
    ["Groefas: stijfheid en slipkracht per groef", sub("k", "groef") + " = 2·" + sub("k", "t") + ",  " + sub("Q", "slip") + " = 2·μ·N", sub("k", "groef") + " = " + num(r.kGroove / 1000) + " N/µm,  " + sub("Q", "slip") + " = " + num(r.QGroove) + " N", "Twee flanken per groef; langs de groefas houdt alleen wrijving de bol vast"],
    ["Virtueel spel (schatting)", sub("x", "stick") + " = " + fr("μ·N", sub("k", "t")) + ";  volledig slippen " + sub("x", "slip") + " = " + fr("3·μ·N", "16·G*·a") + " = 1,5·" + sub("x", "stick"),
      sub("x", "stick") + " = " + num(r.xStick * 1e6) + " nm,  " + sub("x", "slip") + " = " + num(r.xSlip * 1e6) + " nm", LIT.johnson + " (Mindlin: δ = 3(2−ν)μN/(8Ga) bij Q = μN, identieke lichamen; gelijk aan 3μN/(16G*a) met G* = G/(2(2−ν))). Het model erachter staat onder Aannames"],
    ["Veiligheid", "n = " + fr(sub("p", "0,toel"), sub("p", "0")), "n = " + fr(num(M.sigma), num(r.p0)) + " = " + num(r.margin), "p₀,toel is jouw invoer (standaard 1,6·σ_y)"],
  ],
  assume: ["Maxwell-koppeling: drie bollen, elk in een V-groef met de groefassen in een vlak loodrecht op de voorspanning; zes puntcontacten bepalen zes vrijheidsgraden exact (geen overbepaling). Een Kelvin-koppeling (kegel, V-groef, vlak) heeft ook zes contacten, maar met verschillende krachten per contact; die is hier niet apart uitgewerkt.",
    "De voorspanning F werkt in het zwaartepunt van de drie bollen, dus elke groef draagt F/3, elke flank N = F/(6·sin(γ/2)). Een excentrische belasting of extern moment verdeelt de krachten anders; controleer dan op afheffen.",
    "Contact per flank is Hertz bol-op-vlak met de bolstraal R; k_ax telt alleen de contactveerstijfheid (de omringende constructie komt er in serie bij). De groefas is een vrije richting: daar houdt alleen wrijving vast.",
    "Virtueel spel: bij een belastingwisseling langs de groefas (bijv. thermische uitzetting) moet het contact eerst elastisch rekken (Mindlin-stijfheid k_t = 8·G*·a, lineair) en slipt pas bij Q = μ·N. De verplaatsing tot volledig slippen 3μN/(16·G*·a) (Mindlin) is de orde van grootte van de herhaalfout (hysterese). Dit is een lineaire schatting; werkelijk gedrag hangt af van oppervlakteruwheid, smering, deeltjes en de belastinghistorie.",
    "μ is jouw invoer (staal op staal droog ≈ 0,15–0,8; gesmeerd 0,05–0,15). p₀,toel is een richtwaarde (standaard 1,6·σ_y): onder blijvende indrukking verslechtert de herhaalbaarheid."],
  source: LIT.slocum + "; " + LIT.johnson + ".",
});

// ---------- Dynamica ----------
const DMODE = [["zeta", "ζ in %"], ["c", "c in N·s/m"], ["Q", "Q-factor (1/2ζ)"]];
const dTxt = m => (DMODE.filter(o => o[0] === m)[0] || DMODE[0])[1];

CALCS.push({
  id: "msd", group: "Dynamica", noMat: true, name: "Massa-veer-demper", short: "Eigenfrequentie, demping, frequentie- en stapresponsie",
  inputs: [f("m", "Massa m", "kg", 2, 0.0001, [0.001, 1000, 1], "Belasting"), f("k", "Veerstijfheid k", "N/mm", 5, 0.0001, [0.001, 10000, 1], "Geometrie"),
    selIn("dmode", "Demping opgeven als", "zeta", DMODE, "Geometrie"), f("dval", "Dempingswaarde (% bij ζ, N·s/m bij c, – bij Q)", "–", 5, 0.0001, [0.01, 10000, 1], "Geometrie"),
    f("fd", "Frequentie van de aanstuiting f", "Hz", 5, 0.0001, [0.01, 10000, 1], "Belasting")],
  run: (p, M) => {
    const s = msd(p), r = Object.assign({}, s), w = [];
    r.r = p.fd / s.fn; r.dyn = dynAmp(r.r, s.zeta); r.T = transmissibility(r.r, s.zeta); r.peak = peakAmp(s.zeta);
    r.ov = overshoot(s.zeta); r.tsx = settleTime(s.zeta, s.wn); const si = settleInfo(s.zeta, s.wn); r.ts = si.t; r.tsMethod = si.method; r.cstat = 1 / s.ks;
    if (s.zeta >= 1) w.push("ζ = " + num(s.zeta) + " ≥ 1: overgedempt, geen resonantiepiek en geen overshoot.");
    if (s.zeta < 0.01) w.push("ζ = " + num(s.zeta) + " < 1 %: zeer lichte demping, een stap klinkt lang na (t_s = " + tTxt(r.ts) + ").");
    if (Math.abs(r.r - 1) < 0.2) w.push("f ligt binnen 20 % van f_n: dicht bij de resonantie, versterking ×" + num(r.dyn) + ".");
    return { r, warn: w,
      out: [res("Eigenfrequentie f_n", num(s.fn), "Hz"), res("Hoekfrequentie ω_n", num(s.wn), "rad/s"), res("Gedempte frequentie f_d", isFinite(s.fd) ? num(s.fd) : "—", "Hz"),
        res("Dempingsverhouding ζ", num(s.zeta * 100), "%"), res("Demping c", num(s.c), "N·s/m"), res("Kritieke demping c_crit", num(s.cc), "N·s/m"), res("Kwaliteitsfactor Q", num(s.Q), ""),
        res("Statische meegeefbaarheid 1/k", num(1000 / p.k), "µm/N"),
        res("Frequentieverhouding f/f_n", num(r.r), ""), res("Dynamische meegeefbaarheid bij f", num(r.dyn * 1000 / p.k), "µm/N"),
        res("Versterking t.o.v. statisch bij f", num(r.dyn), "×"), res("Transmissibiliteit T bij f", num(r.T), ""),
        res("Resonantiepiek (max. versterking)", num(r.peak), "×"), res("Overshoot op een kracht-stap", num(r.ov * 100), "%"), res("Insteltijd t_s (2 %)", tFmt(r.ts)[0], tFmt(r.ts)[1])] };
  },
  keys: r => [K("Eigenfrequentie f_n", "Hz", num(r.fn), "f_d = " + (isFinite(r.fd) ? num(r.fd) + " Hz" : "—")), K("Demping ζ", "%", num(r.zeta * 100), "Q = " + num(r.Q) + " · c = " + num(r.c) + " N·s/m"),
    K("Insteltijd t_s (2 %)", tFmt(r.ts)[1], tFmt(r.ts)[0], "overshoot " + num(r.ov * 100) + " % · " + (r.tsMethod === "approx" ? "4/(ζ·ω_n)" : "numeriek, ±2 %-band"))],
  formulas: (p, M, r) => [
    ["Eigenfrequentie", sub("f", "n") + " = " + fr("1", "2π") + "·√" + fr("k", "m"), sub("f", "n") + " = " + fr("1", "2π") + "·√" + fr(num(p.k * 1000), num(p.m)) + " = " + num(r.fn) + " Hz  (k in N/m = N/mm·1000)", LIT.denhartog + "; " + LIT.rao],
    ["Dempingsverhouding (" + dTxt(p.dmode) + " opgegeven)", "ζ = " + fr("c", "2·√(k·m)") + " = " + fr("1", "2Q"),
      "c_crit = 2·√(" + num(p.k * 1000) + "·" + num(p.m) + ") = " + num(r.cc) + " N·s/m;  ζ = " + num(r.zeta) + " (" + num(r.zeta * 100) + " %),  c = " + num(r.c) + " N·s/m,  Q = " + num(r.Q), LIT.denhartog],
    ["Gedempte frequentie", sub("f", "d") + " = " + sub("f", "n") + "·√(1 − ζ²)", sub("f", "d") + " = " + (isFinite(r.fd) ? num(r.fd) + " Hz" : "— (ζ ≥ 1)"), LIT.rao],
    ["Dynamische meegeefbaarheid", "|" + fr("x", "F") + "| = " + fr("1", "k") + "·" + fr("1", "√((1 − r²)² + (2ζr)²)") + ",  r = " + fr("f", sub("f", "n")),
      "r = " + num(r.r) + ":  |x/F| = " + num(r.dyn) + "/" + num(p.k) + " N/mm = " + num(r.dyn * 1000 / p.k) + " µm/N  (× " + num(r.dyn) + " statisch)", LIT.denhartog + "; " + LIT.rao],
    ["Transmissibiliteit (grondexcitatie en krachtoverdracht)", "T = " + fr("√(1 + (2ζr)²)", "√((1 − r²)² + (2ζr)²)"), "T(" + num(r.r) + ") = " + num(r.T), LIT.rao + "; " + LIT.denhartog],
    ["Resonantiepiek", sub("A", "max") + " = " + fr("1", "2ζ·√(1 − ζ²)") + " (ζ < 0,707); bij kleine ζ ≈ Q", sub("A", "max") + " = " + num(r.peak) + " ×", LIT.denhartog],
    ["Stapresponsie en overshoot", "y(t) = 1 − e<sup>−ζ·ω<sub>n</sub>·t</sup>·(cos ω<sub>d</sub>t + " + fr("ζ", "√(1 − ζ²)") + "·sin ω<sub>d</sub>t),  OS = e<sup>−πζ/√(1−ζ²)</sup>", "overshoot = " + num(r.ov * 100) + " %", LIT.rao + "; " + LIT.franklin],
    ["Insteltijd, ±2 %-band (criterium: respons blijft binnen 2 % van de eindwaarde)", "ζ < 1:  " + sub("t", "s") + " ≈ " + fr("4", "ζ·" + sub("ω", "n")) + " (omhullende e<sup>−ζω<sub>n</sub>t</sup> = 2 %, bovengrens);  ζ ≥ 1: numeriek uit y(t) (exacte stapresponsie) tot |1 − y| ≤ 2 %",
      (r.tsMethod === "approx" ? "gebruikt: 4/(ζ·ω_n) = " + tTxt(r.ts) + " (ζ < 1);  laatste doorgang van de 2 %-band exact uit y(t): " + tTxt(r.tsx) : "gebruikt: numeriek uit y(t) = " + tTxt(r.ts) + " (ζ ≥ 1, geen formule 4/(ζ·ω_n))"), LIT.franklin],
  ],
  assume: ["Lineair massa-veer-demper-systeem met één vrijheidsgraad; viskeuze demping (kracht ∝ snelheid). Echte constructies hebben vaak materiaaldemping (ζ ≈ 0,1–1 %), wrijving en meer eigenvormen.",
    "De meegeefbaarheid is de verplaatsing per newton bij een harmonische kracht met frequentie f; de statische waarde is 1/k. De transmissibiliteit geldt voor grondexcitatie (afstand massa/grond) en voor kracht-transmissie naar de ondergrond.",
    "De stap is een kracht-stap op de massa; de eindwaarde is F/k. Insteltijd: voor ζ < 1 de vuistregel 4/(ζ·ω_n) (omhullende op 2 %, iets conservatief); voor ζ ≥ 1 numeriek uit de exacte stapresponsie tot de ±2 %-band. De gebruikte methode staat onder de uitkomst.",
    "Q = 1/(2ζ) is de benadering voor lichte demping; de exacte piek is 1/(2ζ√(1−ζ²)) en wordt ook getoond."],
  source: LIT.denhartog + "; " + LIT.rao + "; " + LIT.franklin + ".",
});

CALCS.push({
  id: "iso", group: "Dynamica", noMat: true, name: "Trillingsisolatie", short: "Transmissibiliteit T(f) van een geïsoleerde massa",
  inputs: [f("m", "Geïsoleerde massa m", "kg", 100, 0.001, [0.1, 10000, 1], "Belasting"), f("k", "Totale isolatorstijfheid k (verticaal)", "N/mm", 20, 0.0001, [0.01, 10000, 1], "Geometrie"),
    f("zeta", "Demping ζ", "%", 5, 0.01, [0.1, 100, 1], "Geometrie"), f("fd", "Storingsfrequentie f", "Hz", 20, 0.01, [0.1, 1000, 1], "Belasting"),
    f("xin", "Amplitude van de vloertrilling", "µm", 1, 0, [0.001, 1000, 1], "Belasting")],
  run: (p, M) => {
    const r = isolator({ m: p.m, k: p.k, zeta: p.zeta, f: p.fd }), w = [];
    r.xout = r.T * p.xin; r.fn20 = fnForT(p.fd, 0.1); r.fiso = Math.SQRT2 * r.fn;
    if (!r.isolating) w.push("f = " + num(p.fd) + " Hz ligt onder √2·f_n = " + num(r.fiso) + " Hz: de isolator versterkt de storing (T = " + num(r.T) + ") in plaats van isoleert.");
    else if (r.r < 3) w.push("f/f_n = " + num(r.r) + " < 3: weinig isolatie; T daalt pas ongeveer met 1/r².");
    if (Math.abs(r.r - 1) < 0.3) w.push("Storing dichtbij de resonantie van de isolator (f/f_n = " + num(r.r) + ").");
    if (p.zeta > 20) w.push("ζ = " + num(p.zeta) + " %: sterke demping verslechtert de isolatie boven de resonantie (T ≈ 2ζ/r voor r ≫ 1).");
    return { r, warn: w,
      out: [res("Eigenfrequentie f_n", num(r.fn), "Hz"), res("Statische inzakking m·g/k", num(r.dSt), "mm"), res("Frequentieverhouding f/f_n", num(r.r), ""),
        res("Transmissibiliteit T bij f", num(r.T), ""), res("Isolatie bij f", num(r.dB), "dB", r.T > 1), res("Amplitude op de massa", num(r.xout * 1000), "nm"),
        res("Piek T bij resonantie", num(r.Tmax), ""), res("Isolatie begint vanaf √2·f_n", num(r.fiso), "Hz"),
        res("f_n voor T = 0,1 (−20 dB, ongedempt)", num(r.fn20), "Hz"), res("Verhouding benodigd/huidig f_n", num(r.fn20 / r.fn), "")] };
  },
  keys: r => [K("Eigenfrequentie f_n", "Hz", num(r.fn), "δ_st = " + num(r.dSt) + " mm"), K("Transmissibiliteit T", "", num(r.T), "amplitude op massa " + num(r.xout * 1000) + " nm"),
    K("Isolatie bij f", "dB", num(r.dB), r.isolating ? "f/f_n = " + num(r.r) : "versterking: f < √2·f_n", r.T > 1 ? "bad" : r.T > 0.3 ? "warn" : "ok")],
  formulas: (p, M, r) => [
    ["Eigenfrequentie van de isolator", sub("f", "n") + " = " + fr("1", "2π") + "·√" + fr("k", "m") + " ≈ " + fr("0,5", "√" + sub("δ", "st") + "[m]"), sub("f", "n") + " = " + fr("1", "2π") + "·√" + fr(num(p.k * 1000), num(p.m)) + " = " + num(r.fn) + " Hz", LIT.harris + "; " + LIT.denhartog],
    ["Statische inzakking", sub("δ", "st") + " = " + fr("m·g", "k"), sub("δ", "st") + " = " + fr(num(p.m) + "·9,81", num(p.k * 1000)) + " = " + num(r.dSt) + " mm", "Statica"],
    ["Transmissibiliteit", "T = " + fr("√(1 + (2ζr)²)", "√((1 − r²)² + (2ζr)²)") + ",  r = " + fr("f", sub("f", "n")), "r = " + num(r.r) + ":  T = " + num(r.T), LIT.harris + "; " + LIT.rao + "; " + LIT.denhartog],
    ["Isolatie in dB", "L = −20·log" + sub("", "10") + "(T)", "L = −20·log(" + num(r.T) + ") = " + num(r.dB) + " dB", LIT.harris],
    ["Isolatie begint", "T < 1 voor r > √2  (elke demping)", sub("f", "iso") + " = √2·" + num(r.fn) + " = " + num(r.fiso) + " Hz", LIT.denhartog],
    ["Hoge frequenties (ongedempt)", "T ≈ " + fr("1", "r² − 1") + ";  voor T-doel: " + sub("f", "n") + " = " + fr("f", "√(1 + 1/T)"), sub("f", "n") + " voor T = 0,1: " + fr(num(p.fd), "√(1 + 10)") + " = " + num(r.fn20) + " Hz", LIT.harris],
    ["Amplitude op de massa", sub("x", "uit") + " = T·" + sub("x", "vloer"), sub("x", "uit") + " = " + num(r.T) + "·" + num(p.xin) + " µm = " + num(r.xout * 1000) + " nm", LIT.harris],
  ],
  assume: ["Een vrijheidsgraad (verticale translatie van een star lichaam) op een lineaire veer met viskeuze demping; grondexcitatie met een harmonische beweging. Koppeling met kantelen, horizontale modes en de eigen flexibiliteit van de massa is niet meegenomen.",
    "Transmissibiliteit is beweging van de massa gedeeld door beweging van de vloer (absolute transmissibiliteit); voor kracht-transmissie naar de vloer geldt dezelfde formule.",
    "Bij hoge frequenties daalt T met 1/r² (ongedempt) of met 2ζ/r (gedempt). Stijfheid van lucht- of rubberisolatoren is frequentieafhankelijk; k is de dynamische waarde bij de werkfrequentie.",
    "De piek T bij resonantie is numeriek bepaald. Er is geen verband gelegd met schokbelasting of tilting; dat vraagt een volledige modale analyse."],
  source: LIT.harris + "; " + LIT.rao + "; " + LIT.denhartog + ".",
});

CALCS.push({
  id: "servo", group: "Dynamica", noMat: true, name: "Servo-vuistregels", short: "Vuistregels: bandwijdte, servostijfheid en positiefout",
  inputs: [f("fn", "Eerste eigenfrequentie van de constructie f_n", "Hz", 300, 0.01, [10, 5000, 1], "Geometrie"), f("div", "Verhouding f_n/f_bw (vuistregel: 3 tot 5)", "–", 3, 1, [1.5, 10, 0], "Geometrie"),
    f("m", "Bewegende massa m", "kg", 2, 0.0001, [0.01, 1000, 1], "Belasting"), f("Fd", "Storingskracht F_d (laagfrequent)", "N", 1, 0, [0.01, 1000, 1], "Belasting"),
    f("xmax", "Toegestane positiefout", "µm", 1, 0.0001, [0.001, 1000, 1], "Belasting")],
  run: (p, M) => {
    const s = servo({ fn: p.fn, div: p.div, m: p.m, Fd: p.Fd, xMax: p.xmax / 1000 }), r = Object.assign({}, s, { xum: s.x * 1000, marg: p.xmax / (s.x * 1000) }), w = [];
    if (p.div < 3) w.push("f_n/f_bw = " + num(p.div) + " < 3: agressief; dat kan alleen met een notchfilter of goed gedempte, gecollokeerde regeling. Buiten de vuistregel.");
    if (r.marg < 1) w.push("De fout " + num(r.xum) + " µm is groter dan de toegestane " + num(p.xmax) + " µm. Nodig: f_bw ≥ " + num(s.fbwReq) + " Hz, dus f_n ≥ " + num(s.fnReq) + " Hz.");
    return { r, warn: w,
      out: [res("Bandbreedte f_bw ≈ f_n/verhouding", num(s.fbw), "Hz"), res("Servostijfheid k_servo = m·(2π·f_bw)²", num(s.kServo / 1000), "N/µm"),
        res("Positiefout x = F_d/k_servo", num(r.xum), "µm", r.marg < 1), res("Marge toegestaan/fout", isFinite(r.marg) ? num(r.marg) : "∞", "", r.marg < 1),
        res("Vereiste servostijfheid F_d/x_max", num(s.kReq / 1000), "N/µm"), res("Vereiste bandbreedte", num(s.fbwReq), "Hz"), res("Vereiste f_n bij deze verhouding", num(s.fnReq), "Hz"),
        res("Stijfheid constructie bij f_n: m·(2π·f_n)²", num(s.kStruct / 1000), "N/µm"), res("Stijfheid nodig voor vereiste f_n", num(s.kStructReq / 1000), "N/µm"), res("Stijgtijd ≈ 0,35/f_bw", tFmt(s.tRise)[0], tFmt(s.tRise)[1])] };
  },
  keys: (r, p) => [K("Bandbreedte f_bw", "Hz", num(r.fbw), "vuistregel f_n/" + num(p.div)), K("Servostijfheid", "N/µm", num(r.kServo / 1000), "vuistregel m·(2π·f_bw)²"),
    K("Positiefout", "µm", num(r.xum), "toegestaan " + num(p.xmax) + " µm", statOf(r.marg))],
  formulas: (p, M, r) => [
    ["Bandbreedte uit eigenfrequentie (vuistregel)", sub("f", "bw") + " ≈ " + fr(sub("f", "n"), "3 … 5"), sub("f", "bw") + " = " + fr(num(p.fn), num(p.div)) + " = " + num(r.fbw) + " Hz", "Vuistregel uit de mechatronica: de eerste eigenfrequentie ligt 3 tot 5 keer boven de bandbreedte; zie " + LIT.munnig],
    ["Servostijfheid binnen de bandbreedte (vuistregel)", sub("k", "servo") + " ≈ m·(2π·" + sub("f", "bw") + ")²", sub("k", "servo") + " = " + num(p.m) + "·(2π·" + num(r.fbw) + ")² = " + num(r.kServo / 1000) + " N/µm", "Equivalent van K_p bij een PD-regeling met kruisfrequentie ω_c = 2π·f_bw (K_p ≈ m·ω_c²); " + LIT.franklin + "; " + LIT.munnig],
    ["Positiefout onder storingskracht", "x ≈ " + fr(sub("F", "d"), sub("k", "servo")), "x = " + fr(num(p.Fd), num(r.kServo)) + " = " + num(r.xum) + " µm", "Geldt voor storingen onder de bandbreedte; een integrator onderdrukt de statische fout volledig"],
    ["Vereiste servostijfheid en bandbreedte (omgekeerd)", sub("k", "req") + " = " + fr(sub("F", "d"), sub("x", "max")) + ",  " + sub("f", "bw,req") + " = " + fr("1", "2π") + "·√" + fr(sub("k", "req"), "m"),
      sub("k", "req") + " = " + num(r.kReq / 1000) + " N/µm,  " + sub("f", "bw,req") + " = " + num(r.fbwReq) + " Hz", "Omkering van de vuistregel hierboven"],
    ["Vereiste constructiestijfheid", sub("f", "n,req") + " = verhouding·" + sub("f", "bw,req") + ",  " + sub("k", "str") + " = m·(2π·" + sub("f", "n,req") + ")²", sub("f", "n,req") + " = " + num(r.fnReq) + " Hz,  " + sub("k", "str") + " = " + num(r.kStructReq / 1000) + " N/µm", "Eén-massa-model: een veel stijvere constructie dan de servostijfheid is nodig, factor (f_n/f_bw)²"],
    ["Stijgtijd (eerste-orde-vuistregel)", sub("t", "r") + " ≈ " + fr("0,35", sub("f", "bw")), sub("t", "r") + " = " + tTxt(r.tRise), LIT.franklin],
  ],
  assume: ["Dit zijn vuistregels, bedoeld voor een eerste keuze van bandbreedte en stijfheid, niet voor het ontwerp van een regelaar. De factor 3 tot 5 tussen f_n en f_bw hangt af van demping, gecollokeerde versus niet-gecollokeerde sensing en of een notchfilter wordt gebruikt.",
    "k_servo = m·ω_bw² is de equivalente veerstijfheid van de regeling rond de kruisfrequentie; onder de bandbreedte neemt de dynamische stijfheid met een integrator toe, boven de bandbreedte valt hij terug naar de massa m·ω².",
    "De positiefout is quasi-statisch (storing onder f_bw); voor storingen boven f_bw wordt de fout bepaald door m·ω² en de constructie, niet door de regelaar.",
    "Eén bewegende massa; geen ruis, sensorresolutie, vertraging of niet-lineaire effecten. De getoonde stijgtijd 0,35/f_bw is die van een eerste-orde-systeem."],
  source: LIT.munnig + "; " + LIT.franklin + ". Vuistregels; de exacte factoren verschillen per auteur en toepassing.",
});

// ---------- Thermisch ----------
CALCS.push({
  id: "exp", group: "Thermisch", name: "Thermische uitzetting", short: "ΔL = α·L·ΔT; twee materialen en athermisch ontwerp",
  inputs: [f("L1", "Lengte staaf 1 (L₁)", "mm", 100, 0.01, [1, 2000, 1], "Geometrie"), f("L2", "Lengte staaf 2 (L₂)", "mm", 205, 0.01, [1, 2000, 1], "Geometrie"),
    f("dT", "Temperatuurverandering ΔT", "K", 5, 0, [0.01, 100, 1], "Belasting"),
    matIn("mat1", "Materiaal staaf 1", "alu"), matIn("mat2", "Materiaal staaf 2", "staal")],
  run: (p, M) => {
    const m1 = material(p.mat1), m2 = material(p.mat2);
    const r = athermal({ a1: m1.alpha, L1: p.L1, a2: m2.alpha, L2: p.L2, dT: p.dT, E1: m1.E, E2: m2.E });
    r.m1 = m1; r.m2 = m2; r.dev = (p.L2 - r.L2ath) / r.L2ath; r.per1 = m1.alpha * p.L1 * 1e-3, r.per2 = m2.alpha * p.L2 * 1e-3;     // µm/K
    r.driftK = (r.per2 - r.per1) * 1000;                                     // nm/K, onafhankelijk van ΔT
    const w = [];
    if (m1.id === m2.id) w.push("Beide staven hebben hetzelfde materiaal: de uitzettingen zijn gelijk in verhouding, athermisch ontwerp met L₂ = L₁ kan alleen op geometrie.");
    if (Math.abs(r.driftK) > 300 * Math.abs(r.per1)) w.push("Netto drift is " + num(Math.abs(r.driftK) / Math.abs(r.per1) / 10) + " % van de uitzetting van staaf 1: weinig gecompenseerd (athermisch L₂ = " + num(r.L2ath) + " mm).");
    if (r.s1 > m1.sigma || r.s2 > m2.sigma) w.push("Bij volledig inklemmen zou de thermische spanning (" + num(Math.max(r.s1, r.s2)) + " MPa) boven σ_toel van het materiaal komen.");
    if (Math.abs(r.dev) > 1 && r.L2ath > 5000) w.push("De athermale lengte L₂ is erg groot; kies materialen met een kleinere α-verhouding.");
    return { r, warn: w,
      out: [res("Uitzetting staaf 1: ΔL₁ = α₁·L₁·ΔT", num(r.d1 * 1000), "µm"), res("Uitzetting staaf 2: ΔL₂ = α₂·L₂·ΔT", num(r.d2 * 1000), "µm"),
        res("Uitzetting per kelvin, staaf 1", num(r.per1), "µm/K"), res("Uitzetting per kelvin, staaf 2", num(r.per2), "µm/K"),
        res("Netto verplaatsing ΔP = ΔL₂ − ΔL₁", num(r.dP * 1000), "µm"), res("Netto drift per kelvin", num(r.driftK), "nm/K"), res("Netto drift totaal bij ΔT", num(r.dP * 1e6), "nm"),
        res("Netto lengte P (L₂ − L₁)", num(r.Lnet), "mm"), res("Athermale lengte L₂ = L₁·α₁/α₂", num(r.L2ath), "mm"), res("Afwijking L₂ van athermaal", num(r.dev * 100), "%"),
        res("Spanning staaf 1, volledig ingeklemd E·α·ΔT", num(r.s1), "MPa", r.s1 > m1.sigma), res("Spanning staaf 2, volledig ingeklemd", num(r.s2), "MPa", r.s2 > m2.sigma)] };
  },
  keys: (r, p) => [K("Uitzetting staaf 1 ΔL₁", "µm", num(r.d1 * 1000), num(r.per1) + " µm/K"), K("Netto verplaatsing ΔP", "µm", num(r.dP * 1000), num(r.driftK) + " nm/K · totaal " + num(r.dP * 1e6) + " nm",
    Math.abs(r.dP) < 0.05 * Math.abs(r.d1) ? "ok" : Math.abs(r.dP) < 0.3 * Math.abs(r.d1) ? "warn" : "bad"), K("Athermale lengte L₂", "mm", num(r.L2ath), "huidige L₂ wijkt " + num(r.dev * 100) + " % af")],
  formulas: (p, M, r) => [
    ["Uitzetting van een staaf", "ΔL = α·L·ΔT", "ΔL₁ = " + num(r.m1.alpha) + "·10⁻⁶·" + num(p.L1) + "·" + num(p.dT) + " = " + num(r.d1 * 1000) + " µm;  ΔL₂ = " + num(r.m2.alpha) + "·10⁻⁶·" + num(p.L2) + "·" + num(p.dT) + " = " + num(r.d2 * 1000) + " µm", LIT.invar + "; " + LIT.roark],
    ["Tegengestelde opstelling (staaf 2 heen, staaf 1 terug)", "P = " + sub("L", "2") + " − " + sub("L", "1") + ",  ΔP = (" + sub("α", "2") + sub("L", "2") + " − " + sub("α", "1") + sub("L", "1") + ")·ΔT", "ΔP = (" + num(r.m2.alpha) + "·" + num(p.L2) + " − " + num(r.m1.alpha) + "·" + num(p.L1) + ")·10⁻⁶·" + num(p.dT) + " = " + num(r.dP * 1000) + " µm", LIT.invar],
    ["Athermale lengteverhouding", "ΔP = 0  ⇒  " + fr(sub("L", "1"), sub("L", "2")) + " = " + fr(sub("α", "2"), sub("α", "1")), sub("L", "2") + " = " + num(p.L1) + "·" + fr(num(r.m1.alpha), num(r.m2.alpha)) + " = " + num(r.L2ath) + " mm  (nu " + num(p.L2) + " mm: " + num(r.dev * 100) + " % verschil)", LIT.invar],
    ["Ingeklemde thermische spanning", "σ = E·α·ΔT", "σ₁ = " + num(r.m1.E) + "·" + num(r.m1.alpha) + "·10⁻⁶·" + num(p.dT) + " = " + num(r.s1) + " MPa;  σ₂ = " + num(r.s2) + " MPa", LIT.roark],
  ],
  assume: ["Lineaire uitzetting met een constante α (de waarde bij kamertemperatuur); α verandert met de temperatuur, vooral bij Invar en Zerodur (curve rond het nulpunt) en bij cryogene toepassingen.",
    "Homogene temperatuur in beide staven; temperatuurgradiënten, verschillen tussen de staven en materiaaldrift (relaxatie bij Invar, Zerodur-veroudering) zijn niet meegenomen.",
    "Opstelling: staaf 2 loopt van het vaste punt A naar B, staaf 1 loopt terug van B naar P. P is het meetpunt op afstand L₂ − L₁ van A en verschuift met (α₂L₂ − α₁L₁)·ΔT. Draai het teken om voor de andere richting.",
    "De athermale lengte L₂ = L₁·α₁/α₂ geldt voor het gehele temperatuurbereik als α constant is; de ingeklemde spanning geeft de bovengrens als de uitzetting wordt tegengehouden."],
  source: LIT.invar + "; " + LIT.roark + ".",
});

CALCS.push({
  id: "tau", group: "Thermisch", name: "Thermische tijdconstante", short: "Lumped blok: τ = m·c/(h·A), opwarmen en uitzetting",
  inputs: [f("L", "Lengte L", "mm", 100, 0.01, [5, 500, 1], "Geometrie"), f("B", "Breedte B", "mm", 50, 0.01, [5, 500, 1], "Geometrie"), f("H", "Hoogte H", "mm", 20, 0.01, [2, 500, 1], "Geometrie"),
    f("h", "Warmteoverdrachtscoëfficiënt h (incl. straling)", "W/(m²·K)", 10, 0.01, [1, 200, 1], "Belasting"), f("P", "Dissipatie in het blok P", "W", 0.5, 0, [0.01, 100, 1], "Belasting"),
    f("dTo", "Stap in omgevingstemperatuur ΔT", "K", 1, 0, [0.01, 50, 1], "Belasting"), f("t", "Tijd t na de stap", "min", 30, 0, [0.1, 600, 1], "Belasting"),
    matIn("mat", "Materiaal", "alu")],
  run: (p, M) => {
    const m = material(p.mat), l = lumped({ L: p.L, B: p.B, H: p.H, rho: m.rho, c: m.c, h: p.h, k: m.k, P: p.P }), w = [];
    const r = Object.assign({}, l, { mat: m, t95: 3 * l.tau, t99: Math.log(100) * l.tau });
    r.dTend = p.dTo + l.dTss; r.frac = 1 - Math.exp(-p.t * 60 / l.tau); r.dTt = r.dTend * r.frac;
    r.Lmax = Math.max(p.L, p.B, p.H); r.dLend = dLength(m.alpha, r.Lmax, r.dTend); r.dLt = dLength(m.alpha, r.Lmax, r.dTt);
    if (l.Bi > 0.1) w.push("Biot-getal Bi = " + num(l.Bi) + " > 0,1: de temperatuur in het blok is niet meer uniform; de lumped-methode onderschat de tijd tot het midden (Incropera).");
    if (p.h < 3 || p.h > 100) w.push("h = " + num(p.h) + " W/(m²·K) ligt buiten het gebruikelijke bereik 3 tot 100 (natuurlijke convectie + straling ≈ 5 tot 15; geblazen lucht 20 tot 100).");
    return { r, warn: w,
      out: [res("Massa m", num(l.m), "kg"), res("Warmtecapaciteit C = m·c", num(l.C), "J/K"), res("Oppervlak A", num(l.A * 1e4), "cm²"), res("Karakteristieke lengte V/A", num(l.Lc * 1000), "mm"),
        res("Tijdconstante τ", tFmt(l.tau)[0], tFmt(l.tau)[1]), res("95 % bereikt na 3τ", tFmt(r.t95)[0], tFmt(r.t95)[1]), res("99 % bereikt na 4,6τ", tFmt(r.t99)[0], tFmt(r.t99)[1]),
        res("Voortgang op tijd t", num(r.frac * 100), "%"), res("Eindtemperatuur ΔT_eind = ΔT + P/(h·A)", num(r.dTend), "K"), res("Temperatuurverandering op tijd t", num(r.dTt), "K"),
        res("Uitzetting langste maat, eind", num(r.dLend * 1000), "µm"), res("Uitzetting langste maat op tijd t", num(r.dLt * 1000), "µm"),
        res("Biot-getal h·(V/A)/k", num(l.Bi), "", l.Bi > 0.1)] };
  },
  keys: r => [K("Tijdconstante τ", tFmt(r.tau)[1], tFmt(r.tau)[0], "95 % na " + tTxt(r.t95)), K("Eindtemperatuur ΔT_eind", "K", num(r.dTend), "uitzetting " + num(r.dLend * 1000) + " µm"),
    K("Biot-getal Bi", "", num(r.Bi), r.Bi <= 0.1 ? "lumped is geldig" : "lumped is onnauwkeurig", r.Bi <= 0.1 ? "ok" : r.Bi <= 0.3 ? "warn" : "bad")],
  formulas: (p, M, r) => [
    ["Volume, oppervlak, massa", "V = L·B·H,  A = 2(L·B + L·H + B·H),  m = ρ·V", "V = " + num(r.V * 1e6) + " cm³,  A = " + num(r.A * 1e4) + " cm²,  m = " + num(r.mat.rho) + "·" + num(r.V) + " = " + num(r.m) + " kg", "Meetkunde"],
    ["Warmtecapaciteit", "C = m·c", "C = " + num(r.m) + "·" + num(r.mat.c) + " = " + num(r.C) + " J/K", LIT.incropera],
    ["Tijdconstante (lumped)", "τ = " + fr("m·c", "h·A"), "τ = " + fr(num(r.C), num(p.h) + "·" + num(r.A)) + " = " + num(r.tau) + " s = " + tTxt(r.tau), LIT.incropera],
    ["Respons op een stap", "ΔT(t) = " + sub("ΔT", "eind") + "·(1 − e<sup>−t/τ</sup>);  63 % bij τ, 95 % bij 3τ, 99 % bij 4,6τ", "t = " + num(p.t) + " min: " + num(r.frac * 100) + " % van " + num(r.dTend) + " K = " + num(r.dTt) + " K", LIT.incropera],
    ["Eindtemperatuur", sub("ΔT", "eind") + " = ΔT + " + fr("P", "h·A"), sub("ΔT", "eind") + " = " + num(p.dTo) + " + " + fr(num(p.P), num(p.h) + "·" + num(r.A)) + " = " + num(r.dTend) + " K", LIT.incropera],
    ["Uitzetting", "ΔL = α·L·ΔT", "ΔL = " + num(r.mat.alpha) + "·10⁻⁶·" + num(r.Lmax) + "·" + num(r.dTend) + " = " + num(r.dLend * 1000) + " µm (eind), " + num(r.dLt * 1000) + " µm op tijd t", LIT.invar],
    ["Biot-getal (geldigheid)", "Bi = " + fr("h·" + sub("L", "c"), "k") + " ≤ 0,1,  " + sub("L", "c") + " = " + fr("V", "A"), "Bi = " + fr(num(p.h) + "·" + num(r.Lc), num(r.mat.k)) + " = " + num(r.Bi), LIT.incropera],
  ],
  assume: ["Lumped-capacitance: het blok heeft overal dezelfde temperatuur (geldig als Bi ≤ 0,1). Bij een hogere Bi loopt het oppervlak voor op het midden en is de werkelijke tijd tot het midden langer.",
    "Alle zes zijden wisselen warmte uit met één omgevingstemperatuur via dezelfde h. Straling is bij h inbegrepen (h_rad ≈ 4·ε·σ·T³ ≈ 6·ε W/(m²·K) bij 20 °C); geleiding naar de opspanning en andere warmteflows zijn niet meegenomen.",
    "Typische h: natuurlijke convectie in stilstaande lucht 3 tot 10 W/(m²·K), geblazen lucht 20 tot 100, water veel hoger. De tijdconstante schaalt direct met 1/h; neem de onzekerheid mee.",
    "De uitzetting is van de langste maat bij een uniforme temperatuur; de thermische gradiënt tijdens het opwarmen geeft tijdelijk meer vervorming (kromtrekken) dan de eindwaarde.",
    "Materiaalgegevens c en k zijn typische kamertemperatuurwaarden (MatWeb/datasheets)."],
  source: LIT.incropera + "; " + LIT.invar + ".",
});

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
      const zp = rt(C.x + 6, C.y + 0.48 * ap + 12); set(R.zT, { x: f1(zp[0] + 4), y: f1(zp[1]) }); R.zT.textContent = "τ_max op 0,48·a";
      const rp = rt(C.x - R1 * 0.866, C.y - R1 - R1 * 0.5);
      set(R.rl, { d: "M" + C.x + " " + f1(C.y - R1) + "L" + f1(C.x - R1 * 0.866) + " " + f1(C.y - R1 - R1 * 0.5) });
      set(R.rT, { x: f1(rp[0] - 4), y: f1(rp[1] + 1) }); R.rT.textContent = "R₁ = " + num(p.R1) + " mm";
      R.note.textContent = ok ? "2a = " + num(2 * r.a * 1000) + " µm" + (ex > 1.15 ? ", contact × " + num(ex, 2) + " vergroot getekend" : "") + " · δ = " + num(r.delta * 1000) + " µm" : "";
      R.leg.textContent = ok ? "p₀ = " + num(r.p0) + " MPa · " + Math.round(100 / r.margin) + " % van p₀,toel" : "ongeldige geometrie"; R.leg.style.fill = col;
    },
  };
}

function kcFig() {
  return {
    build(svg) {
      const R = { gr: [], ba: [], ax: [] };
      R.tri = mk("path", { class: "s-ghost" }, svg);
      for (let i = 0; i < 3; i++) { R.gr.push(mk("path", { class: "s-slot" }, svg)); R.ba.push(mk("circle", { class: "s-ball", r: 9 }, svg)); R.ax.push(mk("path", { class: "s-ghost" }, svg)); }
      R.cen = mk("circle", { class: "s-fix", cx: 82, cy: 108, r: 7 }, svg); R.cenx = mk("path", { class: "s-dim", d: "M78.5 104.5L85.5 111.5M85.5 104.5L78.5 111.5" }, svg);
      R.tv = txt(svg, "s-small", "middle"); set(R.tv, { x: 82, y: 20 }); R.tv.textContent = "bovenaanzicht";
      R.fT = txt(svg, "s-val", "start"); set(R.fT, { x: 88, y: 121 });
      R.sv = txt(svg, "s-small", "middle"); set(R.sv, { x: 232, y: 20 }); R.sv.textContent = "doorsnede één groef";
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
      ang.forEach((a, i) => {
        const ux = Math.cos(a * DEG), uy = Math.sin(a * DEG), q = pts[i];
        set(R.gr[i], { d: "M" + f1(q[0] - ux * 22) + " " + f1(q[1] - uy * 22) + "L" + f1(q[0] + ux * 16) + " " + f1(q[1] + uy * 16), "stroke-width": 11 });
        set(R.ba[i], { cx: f1(q[0]), cy: f1(q[1]) });
        set(R.ax[i], { d: "M" + f1(q[0] - ux * 22) + " " + f1(q[1] - uy * 22) + "L" + f1(q[0] + ux * 16) + " " + f1(q[1] + uy * 16) });
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
      const ap = clamp(r.a * Rp / p.R, 2.5, 12), tl = [sg, cg];
      set(R.c1, { d: "M" + f1(cpL[0] - tl[0] * ap) + " " + f1(cpL[1] + tl[1] * ap) + "L" + f1(cpL[0] + tl[0] * ap) + " " + f1(cpL[1] - tl[1] * ap), "stroke-width": 3 });
      set(R.c2, { d: "M" + f1(cpR[0] + tl[0] * ap) + " " + f1(cpR[1] + tl[1] * ap) + "L" + f1(cpR[0] - tl[0] * ap) + " " + f1(cpR[1] - tl[1] * ap), "stroke-width": 3 });
      set(R.n1, { d: arrowPath(cpL[0] - nL[0] * 26, cpL[1] - nL[1] * 26, cpL[0] - nL[0] * 2, cpL[1] - nL[1] * 2) });
      set(R.n2, { d: arrowPath(cpR[0] - nR[0] * 26, cpR[1] - nR[1] * 26, cpR[0] - nR[0] * 2, cpR[1] - nR[1] * 2) });
      set(R.fa, { d: arrowPath(bc.x, 34, bc.x, bc.y - Rp - 2) });
      set(R.nT, { x: f1(ax - ex - 6), y: f1(cpL[1] - 6), "text-anchor": "end" }); R.nT.textContent = "N = " + num(r.N) + " N";
      set(R.gT, { x: ax, y: f1(ay + 18) }); R.gT.textContent = "γ = " + num(p.gamma) + "°";
      const ra = 22;
      set(R.arc, { d: "M" + f1(ax - ra * sg) + " " + f1(ay - ra * cg) + "A" + ra + " " + ra + " 0 0 0 " + f1(ax + ra * sg) + " " + f1(ay - ra * cg) });
      const col = stressCol(1 / r.margin);
      R.note.textContent = "per contact: 2a = " + num(2 * r.a * 1000) + " µm · k_t = " + num(r.kt / 1000) + " N/µm · p₀ = " + num(r.p0) + " MPa";
      R.leg.textContent = "virtueel spel ≈ " + num(r.xSlip * 1e6) + " nm (schatting) · k_ax = " + num(r.kAx / 1000) + " N/µm"; R.leg.style.fill = col;
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
      R.cap = txt(svg, "s-small s-bold", "start"); set(R.cap, { x: 34, y: 124 }); R.cap.textContent = "stapresponsie op een krachtstap (eindwaarde F/k)";
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
      R.note.textContent = "f_n = " + num(r.fn) + " Hz · overshoot " + num(r.ov * 100) + " % · Q = " + num(r.Q);
      R.leg.textContent = "bij f = " + num(p.fd) + " Hz: T = " + num(r.T) + ", versterking × " + num(r.dyn); R.leg.style.fill = "";
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
      R.xl = txt(svg, "s-small", "end"); set(R.xl, { x: 306, y: 213 }); R.xl.textContent = "frequentie f [Hz]";
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
      R.note.textContent = "schaduw: T > 1 (f < √2·f_n = " + num(r.fiso) + " Hz) · stip: T = 1";
      R.leg.textContent = "f = " + num(p.fd) + " Hz: T = " + num(r.T) + " · piek " + num(r.Tmax) + " bij f_n"; R.leg.style.fill = stressCol(clamp(r.T, 0, 1.2) / 1.2);
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
      R.hd = txt(svg, "s-small s-bold", "start"); set(R.hd, { x: 10, y: 163 }); R.hd.textContent = "positiefout onder F_d (vuistregel)";
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
      set(R.regT, { x: X0 + 3, y: 98 }); R.regT.textContent = "regelbereik";
      const xb = X(r.fbw), xn = X(p.fn), xr = X(r.fbwReq);
      set(R.lb, { d: "M" + f1(xb) + " 60V" + ya }); set(R.lbT, { x: f1(cx(xb)), y: 56 }); R.lbT.textContent = "f_bw = " + num(r.fbw) + " Hz";
      set(R.ln, { d: "M" + f1(xn) + " 28V" + ya }); set(R.lnT, { x: f1(cx(xn)), y: 24 }); R.lnT.textContent = "f_n = " + num(p.fn) + " Hz";
      set(R.lr, { d: "M" + f1(xr) + " 70V" + ya }); set(R.lrT, { x: f1(xr >= xb ? xr + 4 : xr - 4), y: 110, "text-anchor": xr >= xb ? "start" : "end" }); R.lrT.textContent = "nodig: " + num(r.fbwReq) + " Hz";
      showEl(R.rat, xn - xb > 14); showEl(R.ratT, xn - xb > 14);
      set(R.rat, { d: arrowPath(xb + 2, 40, xn - 2, 40) }); set(R.ratT, { x: f1((xb + xn) / 2), y: 36 }); R.ratT.textContent = "× " + num(p.div);
      // fout-balken
      const mx = Math.max(r.xum, p.xmax) * 1.12, W = 250, x0 = 10, w1 = r.xum / mx * W, w2 = p.xmax / mx * W, col = stressCol(r.xum / p.xmax);
      set(R.b1, { x: x0, y: 172, width: f1(Math.max(w1, 1)), height: 16 }); R.b1.style.fill = col; R.b1.style.stroke = col;
      set(R.b2, { x: x0, y: 197, width: f1(Math.max(w2, 1)), height: 16 });
      set(R.b1T, { x: f1(Math.min(x0 + w1 + 5, 260)), y: 183 }); R.b1T.textContent = num(r.xum) + " µm (F_d/k_servo)";
      set(R.b2T, { x: f1(Math.min(x0 + w2 + 5, 260)), y: 208 }); R.b2T.textContent = num(p.xmax) + " µm toegestaan";
      R.note.textContent = "k_servo = m·(2π·f_bw)² = " + num(r.kServo / 1000) + " N/µm · stijgtijd ≈ " + tTxt(r.tRise);
      R.leg.textContent = r.marg >= 1 ? "voldoet: marge × " + num(r.marg) : "voldoet niet: nodig f_bw " + num(r.fbwReq) + " Hz, f_n " + num(r.fnReq) + " Hz"; R.leg.style.fill = col;
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
      R.c1T = txt(svg, "s-small", "start"); R.c2T = txt(svg, "s-small", "start"); R.ch = txt(svg, "s-small s-bold", "start"); set(R.ch, { x: 10, y: 165 }); R.ch.textContent = "uitzetting per staaf apart (gelijke schaal)";
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
      set(R.t2, { x: f1((xA + xB) / 2), y: y2 - 5 }); R.t2.textContent = "staaf 2: L₂ = " + num(p.L2) + " mm, α₂ = " + num(r.m2.alpha);
      set(R.t1, { x: f1(xB - 5), y: y1 - 5, "text-anchor": "end" }); R.t1.textContent = "staaf 1: L₁ = " + num(p.L1) + " mm, α₁ = " + num(r.m1.alpha);
      set(R.tA, { x: f1(xA), y: 30 }); R.tA.textContent = "A (vast)"; set(R.tP, { x: f1(xP), y: y1 + 40 }); R.tP.textContent = "P";
      set(R.tB, { x: f1(xB), y: y2 - 5 }); R.tB.textContent = "B";
      // vergelijking van de uitzetting van beide staven
      const mx = dmax, w = 170;
      set(R.cmp1, { y: 176, width: f1(Math.max(Math.abs(r.d1) / mx * w, 1)) }); set(R.cmp2, { y: 192, width: f1(Math.max(Math.abs(r.d2) / mx * w, 1)) });
      set(R.c1T, { x: 6, y: 185 }); R.c1T.textContent = "ΔL₁"; set(R.c2T, { x: 6, y: 201 }); R.c2T.textContent = "ΔL₂";
      R.note.textContent = (ex > 1.15 ? "uitzetting × " + num(ex, 2) + " vergroot · " : "") + "ΔL₁ = " + num(r.d1 * 1000) + " µm, ΔL₂ = " + num(r.d2 * 1000) + " µm";
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
      R.cap = txt(svg, "s-small s-bold", "start"); set(R.cap, { x: 196, y: 24 }); R.cap.textContent = "opwarmen (genormeerd)";
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
      set(R.t63, { x: f1(X(1) + 4), y: Y0 - 5 }); R.t63.textContent = "63 % bij τ = " + tTxt(r.tau);
      const u = clamp(p.t * 60 / r.tau, 0, N), yu = Y(1 - Math.exp(-u));
      set(R.dot, { cx: f1(X(u)), cy: f1(yu) });
      set(R.nowT, { x: f1(u > 3 ? X(u) - 8 : X(u) + 8), y: f1(yu + 16), "text-anchor": u > 3 ? "end" : "start" }); R.nowT.textContent = "t = " + num(p.t) + " min: " + Math.round(r.frac * 100) + " %";
      R.xt.textContent = "5τ = " + tTxt(5 * r.tau);
      R.note.textContent = "m = " + num(r.m) + " kg · C = " + num(r.C) + " J/K · A = " + num(r.A * 1e4) + " cm²";
      R.leg.textContent = "ΔT(t) = " + num(r.dTt) + " K van " + num(r.dTend) + " K · Bi = " + num(r.Bi); R.leg.style.fill = r.Bi > 0.1 ? stressCol(0.9) : "";
    },
  };
}
Object.assign(FIGS, { hertz: hertzFig(), kc: kcFig(), msd: msdFig(), iso: isoFig(), servo: servoFig(), exp: expFig(), tau: tauFig() });


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
  leaf: r => [["Stijfheid c_x", "N/mm", num(r.cx)], ["Max. uitwijking u_max", "mm", num(r.uMax)]],
  cross: r => [["Draaistijfheid c_φ", "N·mm/rad", num(r.c)], ["Max. rotatie φ_max", "°", num(r.phiMax / DEG)]],
  wire: r => [["Buigstijfheid c_b", "N/mm", num(r.cb)], ["Max. uitwijking u_max", "mm", num(r.uMax)]],
};
KEYS.par = KEYS.leaf; KEYS.notch = KEYS.cross;
function safety(r, M) {
  const sS = r.sigma > 0 ? M.sigma / r.sigma : Infinity, sK = isFinite(r.margin) ? r.margin : Infinity, s = Math.min(sS, sK);
  return { s, status: s < 1 ? "bad" : s < 2 ? "warn" : "ok",
    sub: "σ_toel/σ = " + (isFinite(sS) ? num(sS) : "∞") + (isFinite(sK) ? " · knik = " + num(sK) : "") };
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
  c.inputs.forEach(i => { if (i.max != null && isFinite(p[i.id]) && p[i.id] > i.max) { p[i.id] = i.max; notes.push(i.sym + " begrensd tot " + num(i.max) + (i.unit && i.unit !== "–" ? " " + i.unit : "")); } });
  return notes;
}
const OOR = "buiten bereik";
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
  c.inputs.forEach(i => { const n = REF.fields[i.id]; if (n && n.type === "number") n.setAttribute("aria-invalid", String(bad.indexOf(i) >= 0)); });
  if (bad.length) {
    REF.warn.innerHTML = '<div class="calc-warn" role="alert">Controleer de invoer: ' + bad.map(i => i.label).join(", ") + ".</div>";
    REF.warnH = "";
    REF.root.classList.add("is-bad");
    REF.last = null;
    return;
  }
  REF.root.classList.remove("is-bad");
  nonFin = 0;
  const o = c.run(p, M), r = o.r, kl = keysOf(c, r, p, M), oor = nonFin > 0;     // niet-eindige uitkomst: "buiten bereik" in plaats van NaN
  REF.last = { c, p, M, o, r };
  const wh = clH + (oor ? '<div class="calc-warn" role="alert"><div>⚠ Uitkomst ' + OOR + ': de invoer geeft een niet-eindige waarde. Kies een kleinere of grotere waarde (of een andere combinatie van massa, stijfheid en demping).</div></div>' : "") + (o.warn.length ? '<div class="calc-warn" role="alert">' + o.warn.map(w => "<div>⚠ " + w + "</div>").join("") + "</div>" : "");
  if (wh !== REF.warnH) { REF.warn.innerHTML = wh; REF.warnH = wh; }
  o.out.forEach((x, k) => {
    const cell = REF.cells[k];
    if (!cell) return;
    const nf = oor && /^(—|∞)$/.test(String(x.v));
    cell.dd.firstChild.nodeValue = (nf ? OOR : x.v) + (x.unit && !nf ? " " : "");
    cell.u.textContent = nf ? "" : (x.unit || "");
    cell.box.classList.toggle("bad", !!x.bad);
  });
  kl.forEach((k, n) => {
    const nf = oor && /^(—|∞)$/.test(String(k.v));
    const e = REF.keys[n]; e.v.firstChild.nodeValue = (nf ? OOR : k.v) + (k.u && !nf ? " " : ""); e.u.textContent = nf ? "" : k.u;
    e.sub.textContent = k.sub || ""; e.box.setAttribute("data-status", k.status || "");
  });
  FIGS[c.id].draw(REF.fig, p, r, M);
  if (state.open.Formules) renderFormulas(c, p, M, r);
}
function renderFormulas(c, p, M, r) {
  REF.formulas.innerHTML = c.formulas(p, M, r).map(x => '<div class="fm"><div class="fm-h">' + x[0] + '</div><div class="fm-g">' + x[1] + '</div><div class="fm-n"><span class="fm-lab">met jouw getallen</span> ' + x[2] + "</div>" +
    (x[3] ? '<div class="fm-s"><span class="fm-lab">bron</span> ' + x[3] + "</div>" : "") + "</div>").join("");
}
// drie kerngetallen: {k: naam, u: eenheid, v: tekst, sub, status}
function keysOf(c, r, p, M) {
  if (c.keys) return c.keys(r, p, M);
  const ks = KEYS[c.id](r), sf = safety(r, M);
  return [{ k: ks[0][0], u: ks[0][1], v: ks[0][2] }, { k: ks[1][0], u: ks[1][1], v: ks[1][2], sub: "bij σ_toel = " + num(M.sigma) + " MPa" },
    { k: "Veiligheid", u: "", v: isFinite(sf.s) ? "× " + num(sf.s) : "∞", sub: sf.sub, status: sf.status }];
}
const schedule = () => { if (!state.raf) state.raf = requestAnimationFrame(render); };

function inputHtml(c, i, v) {
  if (i.type === "check") return '<label class="chk"><input type="checkbox" data-in="' + i.id + '"' + (v[i.id] ? " checked" : "") + "> " + i.label + "</label>";
  if (i.type === "mat") return '<label class="fld"><span>' + i.label + '</span><select data-in="' + i.id + '">' + MATERIALS.map(m => '<option value="' + m.id + '"' + (v[i.id] === m.id ? " selected" : "") + ">" + m.naam + "</option>").join("") + "</select></label>";
  if (i.type === "select") return '<label class="fld"><span>' + i.label + '</span><select data-in="' + i.id + '">' + i.options.map(o => '<option value="' + o[0] + '"' + (v[i.id] === o[0] ? " selected" : "") + ">" + o[1] + "</option>").join("") + "</select></label>";
  return '<div class="fld"><div class="fld-row"><label for="in_' + i.id + '">' + i.label + '</label><span class="inp"><input id="in_' + i.id + '" type="number" inputmode="decimal" step="any" data-in="' + i.id + '" value="' + v[i.id] + '"><b>' + i.unit + "</b></span></div>" +
    '<input type="range" class="sl" min="0" max="1000" step="1" data-sl="' + i.id + '" aria-label="' + i.label + '" value="' + toPos(c, i, v[i.id]) + '"></div>';
}
const secHtml = (name, body) => '<details class="calc-sec" data-sec="' + name + '"' + (state.open[name] ? " open" : "") + "><summary>" + name + '</summary><div class="calc-sec-b">' + body + "</div></details>";

function renderDetail() {
  optCancel();
  if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
  const c = calcOf(state.cur), v = state.vals[c.id], M0 = matParams(c, v), own = ownMat(c);
  const body = { Geometrie: "", Materiaal: "", Belasting: "" };
  if (!own) body.Materiaal += '<label class="fld"><span>Materiaal</span><select id="calcMat">' + MATERIALS.map(m => '<option value="' + m.id + '"' + (m.id === state.mats[c.id] ? " selected" : "") + ">" + m.naam + "</option>").join("") + "</select></label>";
  else c.inputs.forEach(i => { if (i.type === "mat") body.Materiaal += inputHtml(c, i, v); });
  if (!own || c.lim) body.Materiaal += '<div class="fld"><div class="fld-row"><label for="calcSigma">' + (c.lim ? c.lim.label : "Toelaatbare spanning σ_toel") + '</label><span class="inp"><input id="calcSigma" type="number" inputmode="decimal" step="any" min="0" value="' + fmtv(M0.sigma) + '"><b>' + (c.lim ? c.lim.unit : "MPa") + "</b></span></div>" +
    (c.lim ? '<div class="fld-hint">' + c.lim.hint + "</div>" : "") + "</div>";
  if (!own || matsOf(c).length) body.Materiaal += '<div class="mat-info" id="calcMatInfo"></div><div class="mat-src" id="calcMatSrc"></div>';
  c.inputs.forEach(i => { if (i.type !== "mat") body[grpOf(i)] += inputHtml(c, i, v); });
  let h = '<div class="calc-head"><div><h2>' + c.name + '</h2><p class="calc-sub">' + c.short + '</p></div><div class="calc-acts"><button type="button" class="calc-reset" id="calcOpt" title="Zoek de beste waarden voor een doel, met grenzen en randvoorwaarden">Optimaliseer</button><button type="button" class="calc-reset" id="calcCopy" title="Kopieer een rekenblad (invoer, uitkomsten, formules, bronnen) als tekst">Kopieer</button><button type="button" class="calc-reset" id="calcPrint" title="Een schoon A4-rekenblad om af te drukken of als PDF te bewaren">Rekenblad</button><button type="button" class="calc-reset" id="calcLink" title="Kopieer een link met deze invoerwaarden">Link</button><button type="button" class="calc-reset" id="calcReset" title="Zet deze calculator terug op de beginwaarden">↺ Reset</button></div></div><div class="calc-actmsg" id="calcActMsg" role="status" aria-live="polite"></div>';
  h += '<div class="calc-grid" id="calcGrid"><div class="calc-keys">' +
    [0, 1, 2].map(n => '<div class="calc-key" data-key="' + n + '"><span class="k"></span><b class="v">0<span class="u"></span></b><span class="s"></span></div>').join("") + "</div>";
  h += '<div class="calc-left"><figure class="calc-fig"><svg id="calcSvg" viewBox="0 0 320 245" role="img" aria-label="Schets met afmetingen"></svg></figure><div id="calcWarn" class="calc-warnbox"></div><dl class="calc-res" id="calcOut"></dl></div>';
  h += '<div class="calc-right"><div class="calc-inputs">' + secHtml("Geometrie", body.Geometrie) + (body.Materiaal ? secHtml("Materiaal", body.Materiaal) : "") + secHtml("Belasting", body.Belasting) + "</div>";
  h += optSection(c);
  h += '<details class="calc-sec calc-card" data-sec="Formules"' + (state.open.Formules ? " open" : "") + '><summary>Formules</summary><div class="calc-sec-b calc-formulas" id="calcFormulas"></div></details>';
  h += '<details class="calc-sec calc-card" data-sec="Aannames"' + (state.open.Aannames ? " open" : "") + '><summary>Aannames en bron</summary><div class="calc-sec-b"><ul class="calc-assume">' + c.assume.map(a => "<li>" + a + "</li>").join("") + '</ul><p class="calc-src"><span>Bron</span> ' + c.source + "</p></div></details></div></div>";
  $("calcDetail").innerHTML = h;
  // resultaatkaarten (vaste opbouw per calculator; daarna alleen tekst bijwerken)
  const o0 = c.run(defaults(c), M0), out = $("calcOut"), cells = [];
  o0.out.forEach(x => {
    const box = document.createElement("div"), dt = document.createElement("dt"), dd = document.createElement("dd"), u = document.createElement("span");
    dt.textContent = x.k; dd.setAttribute("data-res", x.k); u.className = "u"; dd.appendChild(document.createTextNode("")); dd.appendChild(u);
    box.appendChild(dt); box.appendChild(dd); out.appendChild(box); cells.push({ box, dd, u });
  });
  const fields = {}, sliders = {};
  $("calcDetail").querySelectorAll("[data-in]").forEach(n => { fields[n.dataset.in] = n; });
  $("calcDetail").querySelectorAll("[data-sl]").forEach(n => { sliders[n.dataset.sl] = n; });
  const svg = $("calcSvg"); svg.innerHTML = SVG_DEFS;
  REF = {
    root: $("calcGrid"), warn: $("calcWarn"), warnH: "", cells, fields, sliders, formulas: $("calcFormulas"),
    keys: [0, 1, 2].map(n => { const b = $("calcDetail").querySelector('[data-key="' + n + '"]'); return { box: b, v: b.querySelector(".v"), u: b.querySelector(".v .u"), sub: b.querySelector(".s") }; }),
    fig: FIGS[c.id].build(svg),
  };
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
    $("calcMatSrc").textContent = "Bron materiaalgegevens: " + ms.map(x => x.m.bron).filter((b, n, a) => a.indexOf(b) === n).join("; ") + ". " + MATERIAL_SOURCE;
    return;
  }
  const m = material(state.mats[state.cur]), M = matParams();
  $("calcMatInfo").textContent = "E = " + num(m.E / 1000) + " GPa · ν = " + num(m.nu) + " · α = " + num(m.alpha) + " µm/(m·K) · ρ = " + num(m.rho) + " kg/m³ · σ_toel = " + num(M.sigma) + " MPa (toelaatbaar, ≈ vermoeiingssterkte met veiligheid; pas aan)";
  $("calcMatSrc").textContent = "Bron materiaalgegevens: " + m.bron + ". " + MATERIAL_SOURCE;
}

function renderList() {
  const groups = {};
  CALCS.forEach(c => { (groups[c.group] = groups[c.group] || []).push(c); });
  $("calcList").innerHTML = Object.keys(groups).map(g => '<div class="calc-group"><div class="calc-gh">' + g + "</div>" +
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
  toClipboard: t => toClipboard(t)
};

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
      const sg = parseFloat(String(t.value).replace(",", "."));
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
    const val = inp.type === "check" ? t.checked : (inp.type === "select" || inp.type === "mat") ? t.value : parseFloat(String(t.value).replace(",", "."));
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
}

// ---------- kopiëren en delen ----------
function msg(t) {
  const e = $("calcActMsg");
  if (!e) return;
  e.textContent = t;
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
  out.push("Mechanist rekenblad: " + c.name + " (" + c.short + ")");
  out.push("Datum: " + new Date().toISOString().slice(0, 10) + " · app " + (ver || "onbekende versie"));
  out.push("", "INVOER");
  c.inputs.forEach(i => {
    const x = p[i.id];
    if (i.type === "check") out.push("  " + plain(i.label) + ": " + (x ? "ja" : "nee"));
    else if (i.type === "select") out.push("  " + i.label + ": " + plain(i.options.filter(o => o[0] === x).map(o => o[1])[0] || x));
    else if (i.type === "mat") { const mm = material(x); out.push("  " + i.label + ": " + mm.naam + " (E = " + num(mm.E / 1000) + " GPa, ν = " + num(mm.nu) + ", α = " + num(mm.alpha) + " µm/(m·K), ρ = " + num(mm.rho) + " kg/m³, c = " + num(mm.c) + " J/(kg·K), k = " + num(mm.k) + " W/(m·K), σ_y = " + num(mm.sy) + " MPa)"); }
    else out.push("  " + i.label + " = " + num(x) + " " + i.unit);
  });
  if (!own) out.push("  Materiaal: " + m.naam + " (E = " + num(m.E / 1000) + " GPa, ν = " + num(m.nu) + ", α = " + num(m.alpha) + " µm/(m·K), ρ = " + num(m.rho) + " kg/m³)");
  if (c.lim) out.push("  " + c.lim.label + " = " + num(M.sigma) + " " + c.lim.unit + " (" + plain(c.lim.hint) + (state.sigmas[c.id] > 0 ? "; door gebruiker aangepast" : "") + ")");
  else if (!own) out.push("  σ_toel = " + num(M.sigma) + " MPa (toelaatbaar, ≈ vermoeiingssterkte met veiligheid" + (state.sigmas[c.id] > 0 ? "; door gebruiker aangepast" : "") + ")");
  out.push("", "UITKOMSTEN");
  L.o.out.forEach(x => out.push("  " + x.k + " = " + x.v + (x.unit ? " " + x.unit : "")));
  if (L.o.warn.length) { out.push("", "WAARSCHUWINGEN"); L.o.warn.forEach(w => out.push("  ! " + w)); }
  out.push("", "FORMULES");
  c.formulas(p, M, L.r).forEach(x => {
    out.push("  " + plain(x[0]) + ": " + plain(x[1]));
    out.push("    = " + plain(x[2]));
    if (x[3]) out.push("    bron: " + plain(x[3]));
  });
  out.push("", "AANNAMEN");
  c.assume.forEach(a => out.push("  - " + plain(a)));
  out.push("", "BRONNEN", "  " + plain(c.source));
  if (!own || matsOf(c).length) out.push("  Bron materiaalgegevens: " + (own ? matsOf(c).map(i => material(p[i.id]).bron).join("; ") : m.bron) + ". " + MATERIAL_SOURCE);
  out.push("", "LINK", "  " + linkUrl());
  return out.join("\n");
}
// Rekenblad voor print/PDF: dezelfde inhoud als "Kopieer", in de gedeelde A4-weergave
export function openCalcReport() {
  const L = REF && REF.last;
  if (!L) { msg("Controleer eerst de invoer."); return; }
  const c = L.c, p = L.p, M = L.M, m = material(state.mats[c.id]), own = ownMat(c);
  const e = x => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const tb = (head, rows) => '<table class="rep-tbl"><thead><tr>' + head.map(h => "<th>" + h + "</th>").join("") + "</tr></thead><tbody>" +
    rows.map(r => "<tr>" + r.map(x => "<td>" + x + "</td>").join("") + "</tr>").join("") + "</tbody></table>";
  const matLine = mm => e(mm.naam) + ": E = " + num(mm.E / 1000) + " GPa, \u03bd = " + num(mm.nu) + ", \u03b1 = " + num(mm.alpha) + " \u00b5m/(m\u00b7K), \u03c1 = " + num(mm.rho) + " kg/m\u00b3";
  const inRows = c.inputs.map(i => {
    const x = p[i.id];
    if (i.type === "check") return [e(plain(i.label)), x ? "ja" : "nee", ""];
    if (i.type === "select") return [e(plain(i.label)), e(plain(i.options.filter(o => o[0] === x).map(o => o[1])[0] || x)), ""];
    if (i.type === "mat") return [e(plain(i.label)), matLine(material(x)), ""];
    return [e(plain(i.label)), num(x), e(plain(i.unit || ""))];
  });
  if (!own) inRows.push(["Materiaal", matLine(m), ""]);
  inRows.push([e(plain(c.lim ? c.lim.label : "\u03c3_toel")), num(M.sigma), e(c.lim ? c.lim.unit : "MPa")]);
  const svg = $("calcSvg");
  const fig = svg ? '<figure class="rep-fig rep-svg calc-fig">' + svg.outerHTML.replace(/calcArr/g, "repArr").replace(/calcHatch/g, "repHatch").replace(/ id="calcSvg"/, "") + "<figcaption>Schets met afmetingen (niet op schaal).</figcaption></figure>" : "";
  const warn = L.o.warn.length ? '<ul class="rep-list rep-warn">' + L.o.warn.map(w => "<li>" + e(w) + "</li>").join("") + "</ul>" : "";
  const frm = c.formulas(p, M, L.r).map(x => [x[0], x[1] + (x[2] ? '<div class="rep-eval">= ' + x[2] + "</div>" : ""), x[3] ? e(plain(x[3])) : ""]);
  showReport({
    title: c.name, sub: "Rekenblad calculator \u00b7 " + plain(c.short),
    meta: [["Calculator", c.name]],
    sections: [
      { h: "Schets", html: fig },
      { h: "Invoer", html: tb(["Grootheid", "Waarde", "Eenheid"], inRows) },
      { h: "Uitkomsten", html: tb(["Grootheid", "Waarde", "Eenheid"], L.o.out.map(x => [x.k, e(x.v), x.unit ? e(plain(x.unit)) : ""])) + warn },
      { h: "Formules", html: tb(["Grootheid", "Formule en invulling", "Bron"], frm) },
      { h: "Aannamen", html: '<ul class="rep-list">' + c.assume.map(a => "<li>" + a + "</li>").join("") + "</ul>" },
      { h: "Bronnen", html: '<p>' + c.source + "</p>" + (!own || matsOf(c).length ? "<p class=\"rep-note\">Bron materiaalgegevens: " + e(own ? matsOf(c).map(i => material(p[i.id]).bron).join("; ") : m.bron) + ". " + e(MATERIAL_SOURCE) + "</p>" : "") },
      { h: "Link met deze invoer", html: '<p class="rep-url">' + e(linkUrl()) + "</p>" }
    ],
    text: sheetText()
  });
}
function doPrint() { openCalcReport(); }
function doCopy() {
  const t = sheetText();
  if (!t) { msg("Controleer eerst de invoer."); return; }
  $("calcCopy").dataset.sheet = t;
  toClipboard(t).then(ok => msg(ok ? "Rekenblad gekopieerd (" + t.split("\n").length + " regels)." : "Kopiëren geweigerd door de browser."));
}
function doLink() {
  const u = linkUrl();
  $("calcLink").dataset.url = u;
  try { history.replaceState(null, "", u); } catch (_) { /* file:// of sandbox */ }
  toClipboard(u).then(ok => msg(ok ? "Link met deze invoer gekopieerd." : "Link staat in de adresbalk."));
}
