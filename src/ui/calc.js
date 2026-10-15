// Werkplek "Calculators": flexure-rekenhulpen naast de schets. Alleen UI; de formules staan in src/calc/.
import { MATERIALS, MATERIAL_SOURCE, material } from "../calc/materials.js";
import { crossPivot, leafSpring, notchHinge, parallelLeaf, wireFlexure } from "../calc/flexures.js";

const $ = id => document.getElementById(id);
const DEG = Math.PI / 180;
const NNBSP = " ";                      // dunne, niet-brekende spatie als duizendtalscheiding

// ---------- opmaak ----------
// Komma als decimaalteken; duizendtallen (vanaf 4 cijfers) met een dunne spatie, nooit met een punt:
// "4.228" zou voor een decimaal doorgaan. Alles wat boven 1000 komt blijft dus ondubbelzinnig: "4 228".
function sig(x, n) {
  if (!isFinite(x)) return x > 0 ? "∞" : "—";
  if (x === 0) return "0";
  const a = Math.abs(x), d = Math.min(8, Math.max(0, n - 1 - Math.floor(Math.log10(a))));
  let s = Math.abs(x).toFixed(d);
  if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
  const parts = s.split("."), ip = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
  const out = parts.length > 1 ? ip + "," + parts[1] : ip;
  return (x < 0 && /[1-9]/.test(s) ? "−" : "") + out;
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
};
const SRC_S = LIT.soemers;
const SRC_H = LIT.smith + "; " + LIT.henein;

// ---------- invoervelden ----------
const f = (id, label, unit, def, min) => ({ id, label, unit, def, min: min == null ? 0 : min });
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
const res = (k, v, unit, bad) => ({ k, v, unit, bad });
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
function set(e, a) { for (const k in a) e.setAttribute(k, a[k]); return e; }
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

// ---------- sliders: [min, max, logaritmisch] ----------
const RANGE = {
  L: [5, 200, 1], b: [1, 100, 1], t: [0.02, 2, 1], u: [0.01, 10, 1], d: [0.05, 5, 1], R: [0.1, 30, 1],
  F: [0.01, 1000, 1], m: [0.001, 10, 1], r: [5, 500, 1], Kt: [1, 4, 0], phi: [0, 20, 0],
};
function rng(c, i) { if (c.id === "notch" && i.id === "phi") return [0.01, 5, 1]; return RANGE[i.id]; }
const GROUP = { L: "Geometrie", b: "Geometrie", t: "Geometrie", d: "Geometrie", R: "Geometrie", Kt: "Geometrie", bc: "Geometrie", plate: "Materiaal" };
const grpOf = i => GROUP[i.id] || "Belasting";
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
const invalid = (c, p) => c.inputs.filter(i => typeof i.def === "number" &&
  !(isFinite(p[i.id]) && p[i.id] >= i.min && (i.min === 0 || p[i.id] > 0)));
function matParams() {
  const m = material(state.mats[state.cur]), sg = state.sigmas[state.cur];
  return { E: m.E, nu: m.nu, sigma: sg > 0 ? sg : m.sigma, alpha: m.alpha, rho: m.rho };
}
const fmtv = v => String(+Number(v).toPrecision(3));

// ---------- weergave ----------
let REF = null;   // verwijzingen naar de huidige DOM
function render() {
  state.raf = 0;
  if (!REF) return;
  const c = calcOf(state.cur), p = params(c), bad = invalid(c, p), M = matParams();
  c.inputs.forEach(i => { const n = REF.fields[i.id]; if (n && n.type === "number") n.setAttribute("aria-invalid", String(bad.indexOf(i) >= 0)); });
  if (bad.length) {
    REF.warn.innerHTML = '<div class="calc-warn" role="alert">Controleer de invoer: ' + bad.map(i => i.label).join(", ") + ".</div>";
    REF.warnH = "";
    REF.root.classList.add("is-bad");
    REF.last = null;
    return;
  }
  REF.root.classList.remove("is-bad");
  const o = c.run(p, M), r = o.r;
  REF.last = { c, p, M, o, r };
  const wh = o.warn.length ? '<div class="calc-warn" role="alert">' + o.warn.map(w => "<div>⚠ " + w + "</div>").join("") + "</div>" : "";
  if (wh !== REF.warnH) { REF.warn.innerHTML = wh; REF.warnH = wh; }
  o.out.forEach((x, k) => {
    const cell = REF.cells[k];
    if (!cell) return;
    cell.dd.firstChild.nodeValue = x.v + (x.unit ? " " : "");
    cell.u.textContent = x.unit || "";
    cell.box.classList.toggle("bad", !!x.bad);
  });
  const ks = KEYS[c.id](r), sf = safety(r, M);
  [ks[0], ks[1], ["Veiligheid", "", isFinite(sf.s) ? "× " + num(sf.s) : "∞"]].forEach((k, n) => {
    const e = REF.keys[n]; e.v.firstChild.nodeValue = k[2] + (k[1] ? " " : ""); e.u.textContent = k[1];
  });
  REF.keys[2].box.setAttribute("data-status", sf.status); REF.keys[2].sub.textContent = sf.sub;
  REF.keys[0].sub.textContent = ""; REF.keys[1].sub.textContent = "bij σ_toel = " + num(M.sigma) + " MPa";
  FIGS[c.id].draw(REF.fig, p, r, M);
  if (state.open.Formules) renderFormulas(c, p, M, r);
}
function renderFormulas(c, p, M, r) {
  REF.formulas.innerHTML = c.formulas(p, M, r).map(x => '<div class="fm"><div class="fm-h">' + x[0] + '</div><div class="fm-g">' + x[1] + '</div><div class="fm-n"><span class="fm-lab">met jouw getallen</span> ' + x[2] + "</div>" +
    (x[3] ? '<div class="fm-s"><span class="fm-lab">bron</span> ' + x[3] + "</div>" : "") + "</div>").join("");
}
const schedule = () => { if (!state.raf) state.raf = requestAnimationFrame(render); };

function inputHtml(c, i, v) {
  if (i.type === "check") return '<label class="chk"><input type="checkbox" data-in="' + i.id + '"' + (v[i.id] ? " checked" : "") + "> " + i.label + "</label>";
  if (i.type === "select") return '<label class="fld"><span>' + i.label + '</span><select data-in="' + i.id + '">' + i.options.map(o => '<option value="' + o[0] + '"' + (v[i.id] === o[0] ? " selected" : "") + ">" + o[1] + "</option>").join("") + "</select></label>";
  return '<div class="fld"><div class="fld-row"><label for="in_' + i.id + '">' + i.label + '</label><span class="inp"><input id="in_' + i.id + '" type="number" inputmode="decimal" step="any" data-in="' + i.id + '" value="' + v[i.id] + '"><b>' + i.unit + "</b></span></div>" +
    '<input type="range" class="sl" min="0" max="1000" step="1" data-sl="' + i.id + '" aria-label="' + i.label + '" value="' + toPos(c, i, v[i.id]) + '"></div>';
}
const secHtml = (name, body) => '<details class="calc-sec" data-sec="' + name + '"' + (state.open[name] ? " open" : "") + "><summary>" + name + '</summary><div class="calc-sec-b">' + body + "</div></details>";

function renderDetail() {
  if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
  const c = calcOf(state.cur), v = state.vals[c.id], M0 = matParams();
  const body = { Geometrie: "", Materiaal: "", Belasting: "" };
  body.Materiaal += '<label class="fld"><span>Materiaal</span><select id="calcMat">' + MATERIALS.map(m => '<option value="' + m.id + '"' + (m.id === state.mats[c.id] ? " selected" : "") + ">" + m.naam + "</option>").join("") + "</select></label>" +
    '<div class="fld"><div class="fld-row"><label for="calcSigma">Toelaatbare spanning σ_toel</label><span class="inp"><input id="calcSigma" type="number" inputmode="decimal" step="any" min="0" value="' + fmtv(M0.sigma) + '"><b>MPa</b></span></div>' +
    "</div>" +
    '<div class="mat-info" id="calcMatInfo"></div><div class="mat-src" id="calcMatSrc"></div>';
  c.inputs.forEach(i => { body[grpOf(i)] += inputHtml(c, i, v); });
  let h = '<div class="calc-head"><div><h2>' + c.name + '</h2><p class="calc-sub">' + c.short + '</p></div><div class="calc-acts"><button type="button" class="calc-reset" id="calcCopy" title="Kopieer een rekenblad (invoer, uitkomsten, formules, bronnen) als tekst">Kopieer</button><button type="button" class="calc-reset" id="calcLink" title="Kopieer een link met deze invoerwaarden">Link</button><button type="button" class="calc-reset" id="calcReset" title="Zet deze calculator terug op de beginwaarden">↺ Reset</button></div></div><div class="calc-actmsg" id="calcActMsg" role="status" aria-live="polite"></div>';
  h += '<div class="calc-grid" id="calcGrid"><div class="calc-keys">' +
    [0, 1, 2].map(n => '<div class="calc-key" data-key="' + n + '"><span class="k"></span><b class="v">0<span class="u"></span></b><span class="s"></span></div>').join("") + "</div>";
  h += '<div class="calc-left"><figure class="calc-fig"><svg id="calcSvg" viewBox="0 0 320 245" role="img" aria-label="Schets met afmetingen"></svg></figure><div id="calcWarn" class="calc-warnbox"></div><dl class="calc-res" id="calcOut"></dl></div>';
  h += '<div class="calc-right"><div class="calc-inputs">' + secHtml("Geometrie", body.Geometrie) + secHtml("Materiaal", body.Materiaal) + secHtml("Belasting", body.Belasting) + "</div>";
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
  const kl = KEYS[c.id](o0.r);
  REF.keys.forEach((k, n) => { k.box.querySelector(".k").textContent = n < 2 ? kl[n][0] : "Veiligheid"; });
  updMatInfo();
  render();
}
function updMatInfo() {
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

export function initCalc() {
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
    const val = inp.type === "check" ? t.checked : inp.type === "select" ? t.value : parseFloat(String(t.value).replace(",", "."));
    state.vals[c.id][id] = val;
    if (REF.sliders[id]) REF.sliders[id].value = toPos(c, inp, val);
    render();
  });
  det.addEventListener("click", e => {
    if (e.target.closest("#calcCopy")) { doCopy(); return; }
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
  q.push("mat=" + encodeURIComponent(state.mats[c.id]));
  if (state.sigmas[c.id] > 0) q.push("sig=" + state.sigmas[c.id]);
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
  const c = L.c, p = L.p, M = L.M, m = material(state.mats[c.id]), out = [];
  const ver = (document.querySelector(".brand .ver") || {}).textContent || "";
  out.push("Mechanist rekenblad: " + c.name + " (" + c.short + ")");
  out.push("Datum: " + new Date().toISOString().slice(0, 10) + " · app " + (ver || "onbekende versie"));
  out.push("", "INVOER");
  c.inputs.forEach(i => {
    const x = p[i.id];
    if (i.type === "check") out.push("  " + plain(i.label) + ": " + (x ? "ja" : "nee"));
    else if (i.type === "select") out.push("  " + i.label + ": " + plain(i.options.filter(o => o[0] === x).map(o => o[1])[0] || x));
    else out.push("  " + i.label + " = " + num(x) + " " + i.unit);
  });
  out.push("  Materiaal: " + m.naam + " (E = " + num(m.E / 1000) + " GPa, ν = " + num(m.nu) + ", α = " + num(m.alpha) + " µm/(m·K), ρ = " + num(m.rho) + " kg/m³)");
  out.push("  σ_toel = " + num(M.sigma) + " MPa (toelaatbaar, ≈ vermoeiingssterkte met veiligheid" + (state.sigmas[c.id] > 0 ? "; door gebruiker aangepast" : "") + ")");
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
  out.push("", "BRONNEN", "  " + plain(c.source), "  Bron materiaalgegevens: " + m.bron + ". " + MATERIAL_SOURCE);
  out.push("", "LINK", "  " + linkUrl());
  return out.join("\n");
}
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
