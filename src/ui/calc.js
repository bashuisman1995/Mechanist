// Werkplek "Calculators": flexure-rekenhulpen naast de schets. Alleen UI; de formules staan in src/calc/.
import { MATERIALS, material } from "../calc/materials.js";
import { crossPivot, leafSpring, notchHinge, parallelLeaf, wireFlexure } from "../calc/flexures.js";

const $ = id => document.getElementById(id);
const DEG = Math.PI / 180;

// ---------- opmaak ----------
function sig(x, n) {
  if (!isFinite(x)) return x > 0 ? "∞" : "—";
  if (x === 0) return "0";
  const a = Math.abs(x), d = Math.max(0, n - 1 - Math.floor(Math.log10(a)));
  return x.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: Math.min(d, 8) });
}
const num = (x, n) => sig(x, n || 3);
function fr(a, b) { return '<span class="fr"><span>' + a + "</span><span>" + b + "</span></span>"; }
const sub = (s, t) => s + "<sub>" + t + "</sub>";
const sup = (s, t) => s + "<sup>" + t + "</sup>";

// ---------- schematische tekeningen ----------
const SVG_OPEN = '<svg viewBox="0 0 260 190" role="img" aria-label="Schets met afmetingen" xmlns="http://www.w3.org/2000/svg">';
const dimV = (x, y1, y2, lab) => '<path class="s-dim" d="M' + x + " " + y1 + "V" + y2 + 'M' + (x - 4) + " " + y1 + "H" + (x + 4) + "M" + (x - 4) + " " + y2 + "H" + (x + 4) +
  '"/><text class="s-txt" x="' + (x - 7) + '" y="' + ((y1 + y2) / 2 + 4) + '" text-anchor="end">' + lab + "</text>";
const dimH = (y, x1, x2, lab) => '<path class="s-dim" d="M' + x1 + " " + y + "H" + x2 + "M" + x1 + " " + (y - 4) + "V" + (y + 4) + "M" + x2 + " " + (y - 4) + "V" + (y + 4) +
  '"/><text class="s-txt" x="' + ((x1 + x2) / 2) + '" y="' + (y - 6) + '" text-anchor="middle">' + lab + "</text>";
const block = (x, y, w, h, hatch) => '<rect class="s-fix" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/>' +
  (hatch ? '<path class="s-hatch" d="' + Array.from({ length: Math.floor(w / 8) }, (_, i) => "M" + (x + 4 + i * 8) + " " + (y + h) + "l-6 6").join("") + '"/>' : "");
const section = (x, y) => '<rect class="s-line" x="' + x + '" y="' + y + '" width="26" height="5" fill="var(--accent-soft)"/>' +
  '<text class="s-txt" x="' + (x + 13) + '" y="' + (y - 5) + '" text-anchor="middle">b</text><text class="s-txt" x="' + (x + 32) + '" y="' + (y + 5) + '">t</text>';

const SCHEMA = {
  leaf: SVG_OPEN + block(70, 150, 90, 12, true) + block(70 + 20, 22, 90, 12, false) +
    '<path class="s-ghost" d="M115 150V34"/><path class="s-line" d="M115 150C115 110 135 74 135 34"/>' +
    dimV(54, 150, 34, "L") + dimH(16, 115, 135, "u") + section(196, 92) + "</svg>",
  par: SVG_OPEN + block(60, 150, 130, 12, true) + block(70, 22, 130, 12, false) +
    '<path class="s-ghost" d="M100 150V34M150 150V34"/><path class="s-line" d="M100 150C100 110 110 74 110 34M150 150C150 110 160 74 160 34"/>' +
    dimV(44, 150, 34, "L") + dimH(14, 100, 110, "u") + section(204, 92) + "</svg>",
  cross: SVG_OPEN + block(70, 160, 120, 12, true) + block(70, 14, 120, 12, false) +
    '<path class="s-line" d="M95 160L165 26M165 160L95 26"/>' + '<circle cx="130" cy="93" r="3" fill="var(--driver)"/>' +
    dimV(60, 160, 26, "L") + '<text class="s-txt" x="136" y="86">φ</text><text class="s-txt" x="136" y="110">50 %</text>' + section(200, 92) + "</svg>",
  notch: SVG_OPEN + block(14, 70, 70, 50, true) + block(176, 70, 70, 50, false) +
    '<path class="s-line" d="M84 70H102A28 28 0 0 0 158 70H176M84 120H102A28 28 0 0 1 158 120H176"/>' +
    '<path class="s-dim" d="M130 70V120M126 70H134M126 120H134"/><text class="s-txt" x="136" y="99">t</text>' +
    '<path class="s-dim" d="M130 98L113 74"/><text class="s-txt" x="104" y="64">R</text>' + '<text class="s-txt" x="130" y="150" text-anchor="middle">b = breedte (loodrecht op het vlak)</text></svg>',
  wire: SVG_OPEN + block(70, 150, 120, 12, true) + block(80, 22, 120, 12, false) +
    '<path class="s-ghost" d="M130 150V34"/><path class="s-line" d="M130 150C130 110 150 74 150 34"/>' +
    dimV(54, 150, 34, "L") + dimH(16, 130, 150, "u") + '<circle class="s-line" cx="215" cy="100" r="9" fill="var(--accent-soft)"/><text class="s-txt" x="215" y="124" text-anchor="middle">d</text></svg>',
};

// ---------- invoervelden ----------
const MAT = { id: "mat", type: "material" };
const f = (id, label, unit, def, min) => ({ id, label, unit, def, min: min == null ? 0 : min });
const IN_M = f("m", "Massa m op de vrije kant", "kg", 0.1);
const IN_F = f("F", "Axiale drukkracht F", "N", 0);
const IN_PLATE = { id: "plate", type: "check", label: "Brede strip (b ≫ t): E′ = E/(1−ν²)", def: false };

// ---------- calculators ----------
function warn(r, sigma, sigmaToel, extra) {
  const w = [];
  if (r.sigma > sigmaToel) w.push("Spanning " + num(r.sigma) + " MPa is hoger dan σ_toel = " + num(sigmaToel) + " MPa.");
  if (r.margin < 2) w.push("Knikveiligheid " + num(r.margin) + " is lager dan 2.");
  return w.concat(extra || []);
}
const res = (k, v, unit, bad) => ({ k, v, unit, bad });
const stressBad = (r, M) => r.sigma > M.sigma;
const marginRes = r => res("Knikveiligheid P_cr/F", isFinite(r.margin) ? num(r.margin) : "∞ (F = 0)", "", r.margin < 2);

const SRC_S = 'Soemers, <i>Design Principles for Precision Mechanisms</i> (T-Pointprint, 2010), hoofdstuk bladveren';
const SRC_H = 'Smith, <i>Flexures: Elements of Elastic Mechanisms</i> (Gordon &amp; Breach, 2000); Henein, <i>Flexure pivot for aerospace mechanisms</i>';

const CALCS = [
  {
    id: "leaf", group: "Flexures", name: "Bladveer", short: "Enkele bladveer, geleid eind (S-vorm)", svg: SCHEMA.leaf,
    inputs: [f("L", "Lengte L", "mm", 20, 0.01), f("b", "Breedte b", "mm", 10, 0.01), f("t", "Dikte t", "mm", 0.2, 0.001), f("u", "Uitwijking u", "mm", 0.5, 0), IN_F, IN_M, IN_PLATE],
    run: (p, M) => {
      const r = leafSpring(Object.assign({}, p, M));
      return { r,
        out: [res("Stijfheid c_x", num(r.cx), "N/mm"), res("Kracht bij u", num(r.force), "N"),
          res("Axiale stijfheid c_z0", num(r.cz0 / 1000), "kN/mm"), res("Stijfheid c_z bij u", num(r.cz / 1000), "kN/mm"),
          res("Zakking Δz bij u", num(r.dz * 1000), "µm"), res("Maximale uitwijking u_max", num(r.uMax), "mm"),
          res("Spanning bij u", num(r.sigma), "MPa", stressBad(r, M)), res("Knikbelasting P_cr", num(r.Pcr), "N"),
          marginRes(r), res("Eigenfrequentie f", num(r.f), "Hz")],
        warn: warn(r, r.sigma, M.sigma) };
    },
    formulas: (p, M, r) => [
      ["Buigstijfheid", "I = " + fr("b·t³", "12"), "I = " + fr(num(p.b) + "·" + num(p.t) + "³", "12") + " = " + num(r.I) + " mm⁴"],
      ["Dwarsstijfheid", sub("c", "x") + " = " + fr("12·E·I", "L³") + " = " + fr("E·b·t³", "L³"), sub("c", "x") + " = " + fr("12·" + num(r.E) + "·" + num(r.I), num(p.L) + "³") + " = " + num(r.cx) + " N/mm"],
      ["Axiale stijfheid", sub("c", "z0") + " = " + fr("E·b·t", "L"), sub("c", "z0") + " = " + fr(num(r.E) + "·" + num(p.b) + "·" + num(p.t), num(p.L)) + " = " + num(r.cz0) + " N/mm"],
      ["Steunstijfheid bij u (Soemers)", fr("1", sub("c", "z")) + " ≈ " + fr("L", "E·b·t") + " + " + fr("u²·L", "700·E·I"), sub("c", "z") + " = " + num(r.cz) + " N/mm"],
      ["Zakking", "Δz ≈ 0,6·" + fr("u²", "L"), "Δz = 0,6·" + fr(num(p.u) + "²", num(p.L)) + " = " + num(r.dz * 1000) + " µm"],
      ["Maximale uitwijking", sub("u", "max") + " = " + fr(sub("σ", "toel") + "·L²", "3·E·t"), sub("u", "max") + " = " + fr(num(M.sigma) + "·" + num(p.L) + "²", "3·" + num(r.E) + "·" + num(p.t)) + " = " + num(r.uMax) + " mm"],
      ["Buigspanning", "σ = " + fr("3·E·t·u", "L²") + " + " + fr("F", "b·t"), "σ = " + num(r.sb) + " + " + num(r.sa) + " = " + num(r.sigma) + " MPa"],
      ["Knik (geleid: één uiteinde mag zijwaarts)", sub("P", "cr") + " = " + fr("π²·E·I", "L²"), sub("P", "cr") + " = " + fr("π²·" + num(r.E) + "·" + num(r.I), num(p.L) + "²") + " = " + num(r.Pcr) + " N"],
      ["Eigenfrequentie", "f = " + fr("1", "2π") + "·√" + fr(sub("c", "x") + "·1000", "m"), "f = " + num(r.f) + " Hz (c in N/m = N/mm·1000)"],
    ],
    assume: ["Twee ingeklemde uiteinden; het ene uiteinde blijft evenwijdig (geleid), dus S-vorm met het buigmoment L/2 op de inklemming.",
      "Kleine doorbuiging (u ≪ L), lineair-elastisch; schuifvervorming en massa van het blad zijn verwaarloosd.",
      "Knikrandvoorwaarde: ingeklemd–geleid (zijwaarts vrij), effectieve lengte L: P_cr = π²EI/L². Een volledig ingeklemd uiteinde zonder zijwaartse beweging geeft 4π²EI/L².",
      "Het steunstijfheidsterm met 700 is een benadering uit Soemers; Δz = 0,6·u²/L is de kinematische verkorting van het blad.",
      "Aangegeven spanning is buiging plus de gemiddelde drukspanning F/(b·t)."],
    source: SRC_S + ".",
  },
  {
    id: "par", group: "Flexures", name: "Parallelle bladveer", short: "Twee bladen, geleide tafel", svg: SCHEMA.par,
    inputs: [f("L", "Lengte L per blad", "mm", 20, 0.01), f("b", "Breedte b", "mm", 10, 0.01), f("t", "Dikte t", "mm", 0.2, 0.001), f("u", "Uitwijking u", "mm", 0.5, 0), IN_F, IN_M, IN_PLATE],
    run: (p, M) => {
      const r = parallelLeaf(Object.assign({}, p, M));
      return { r,
        out: [res("Stijfheid c_x (2 bladen)", num(r.cx), "N/mm"), res("Kracht bij u", num(r.force), "N"),
          res("Axiale stijfheid c_z0", num(r.cz0 / 1000), "kN/mm"), res("Stijfheid c_z bij u", num(r.cz / 1000), "kN/mm"),
          res("Zakking Δz van de tafel", num(r.dz * 1000), "µm"), res("Maximale uitwijking u_max", num(r.uMax), "mm"),
          res("Spanning per blad bij u", num(r.sigma), "MPa", stressBad(r, M)), res("Knikbelasting P_cr (totaal)", num(r.Pcr), "N"),
          marginRes(r), res("Eigenfrequentie f", num(r.f), "Hz")],
        warn: warn(r, r.sigma, M.sigma) };
    },
    formulas: (p, M, r) => [
      ["Stijfheid", sub("c", "x") + " = 2·" + fr("12·E·I", "L³") + " = " + fr("2·E·b·t³", "L³"), sub("c", "x") + " = 2·" + fr("12·" + num(r.E) + "·" + num(r.I), num(p.L) + "³") + " = " + num(r.cx) + " N/mm"],
      ["Zakking van de tafel", "Δz ≈ 0,6·" + fr("u²", "L"), "Δz = " + num(r.dz * 1000) + " µm (geen draaiing van de tafel)"],
      ["Maximale uitwijking", sub("u", "max") + " = " + fr(sub("σ", "toel") + "·L²", "3·E·t"), sub("u", "max") + " = " + num(r.uMax) + " mm"],
      ["Spanning per blad", "σ = " + fr("3·E·t·u", "L²") + " + " + fr("F", "2·b·t"), "σ = " + num(r.sb) + " + " + num(r.sa) + " = " + num(r.sigma) + " MPa"],
      ["Knik", sub("P", "cr") + " = 2·" + fr("π²·E·I", "L²"), sub("P", "cr") + " = " + num(r.Pcr) + " N"],
      ["Eigenfrequentie", "f = " + fr("1", "2π") + "·√" + fr(sub("c", "x") + "·1000", "m"), "f = " + num(r.f) + " Hz"],
    ],
    assume: ["Twee identieke, evenwijdige bladen met een stijve tafel: de tafel blijft evenwijdig en zakt alleen (Δz).",
      "Kleine doorbuiging, lineair-elastisch; de axiale kracht wordt gelijk over de bladen verdeeld.",
      "De zakking Δz is de kinematische verkorting van een geleid blad (3/5·u²/L); zonder tweede stel bladen (tussenlichaam) is dit niet te compenseren.",
      "Knik: twee bladen, elk ingeklemd–geleid (effectieve lengte L)."],
    source: SRC_S + ".",
  },
  {
    id: "cross", group: "Flexures", name: "Kruisveerscharnier", short: "Twee gekruiste bladen, kruising op 50 %", svg: SCHEMA.cross,
    inputs: [f("L", "Lengte L per blad", "mm", 20, 0.01), f("b", "Breedte b", "mm", 10, 0.01), f("t", "Dikte t", "mm", 0.2, 0.001), f("phi", "Rotatie φ", "°", 5, 0), f("r", "Afstand massa tot draaipunt", "mm", 50, 0.01), IN_F, IN_M, IN_PLATE],
    run: (p, M) => {
      const q = Object.assign({}, p, M, { phi: p.phi * DEG });
      const r = crossPivot(q);
      return { r,
        out: [res("Draaistijfheid c_φ", num(r.c), "Nmm/rad"), res("Moment bij φ", num(r.moment), "Nmm"),
          res("Maximale rotatie φ_max", num(r.phiMax / DEG), "°"), res("Spanning bij φ", num(r.sigma), "MPa", stressBad(r, M)),
          res("Verschuiving draaipunt", "≈ 0", "(eerste orde)"), res("Knikbelasting (indicatief)", num(r.Pcr), "N"),
          marginRes(r), res("Eigenfrequentie f", num(r.f), "Hz")],
        warn: warn(r, r.sigma, M.sigma) };
    },
    formulas: (p, M, r) => [
      ["Per blad (relatieve eindrotatie φ, zijwaartse verplaatsing Lφ/2)", sub("c", "φ,blad") + " = " + fr("E·I", "L"), "I = " + num(r.I) + " mm⁴"],
      ["Twee bladen", sub("c", "φ") + " = 2·" + fr("E·I", "L") + " = " + fr("E·b·t³", "6·L"), sub("c", "φ") + " = 2·" + fr(num(r.E) + "·" + num(r.I), num(p.L)) + " = " + num(r.c) + " Nmm/rad"],
      ["Maximale rotatie", sub("φ", "max") + " = " + fr("2·" + sub("σ", "toel") + "·L", "E·t"), sub("φ", "max") + " = " + fr("2·" + num(M.sigma) + "·" + num(p.L), num(r.E) + "·" + num(p.t)) + " = " + num(r.phiMax) + " rad = " + num(r.phiMax / DEG) + "°"],
      ["Spanning", "σ = " + fr("E·t·φ", "2·L") + " + " + fr("F", "2·b·t"), "σ = " + num(r.sb) + " + " + num(r.sa) + " = " + num(r.sigma) + " MPa"],
      ["Eigenfrequentie (massa m op arm r)", "f = " + fr("1", "2π") + "·√" + fr(sub("c", "φ"), "m·r²"), "f = " + num(r.f) + " Hz (c in Nm/rad, r in m)"],
    ],
    assume: ["Twee identieke bladen, kruising op het midden (50 %); het draaipunt ligt dan in de kruising en verschuift in eerste orde niet. Bij een andere kruispositie verschuift het draaipunt.",
      "Afleiding: elk blad krijgt een eindrotatie φ en een zijwaartse verplaatsing Lφ/2 (stijve rotatie om het kruispunt); met de inklemmingsformule U = (2EI/L)(θ_B² − 3ψθ_B + 3ψ²), ψ = φ/2 volgt c = EI/L per blad.",
      "Het blad is een balk met alleen buiging; axiale en schuifbijdragen en de belastingsafhankelijke stijfheidsvermindering zijn verwaarloosd.",
      "Knikbelasting is indicatief: 2·π²EI/L² (twee bladen, effectieve lengte L). Een gekruist scharnier onder druk verliest in werkelijkheid draaistijfheid voordat het knikt."],
    source: SRC_S + "; " + SRC_H + ".",
  },
  {
    id: "notch", group: "Flexures", name: "Scharnier met inkeping", short: "Cirkelvormige inkeping (notch hinge)", svg: SCHEMA.notch,
    inputs: [f("b", "Breedte b", "mm", 10, 0.01), f("t", "Dunste doorsnede t", "mm", 0.3, 0.001), f("R", "Inkepingsstraal R", "mm", 3, 0.01), f("phi", "Rotatie φ", "°", 0.3, 0), f("Kt", "Spanningsconcentratie K_t", "–", 1.5, 1), f("r", "Afstand massa tot draaipunt", "mm", 50, 0.01), IN_M, IN_PLATE],
    run: (p, M) => {
      const r = notchHinge(Object.assign({}, p, M, { phi: p.phi * DEG }));
      const w = warn({ sigma: r.sigma, margin: Infinity }, 0, M.sigma);
      if (r.ratio > 0.5) w.push("t/(2R) = " + num(r.ratio) + " valt buiten het geldige bereik van de Paros–Weisbord-formule (ruim ≤ 0,5).");
      return { r,
        out: [res("Draaistijfheid c_φ", num(r.c), "Nmm/rad"), res("Moment bij φ", num(r.moment), "Nmm"),
          res("Nominale spanning", num(r.sNom), "MPa"), res("Piekspanning K_t·σ", num(r.sigma), "MPa", stressBad(r, M)),
          res("Maximale rotatie φ_max", num(r.phiMax / DEG), "°"), res("Maximale rotatie φ_max", num(r.phiMax * 1000), "mrad"),
          res("Eigenfrequentie f", num(r.f), "Hz")],
        warn: w };
    },
    formulas: (p, M, r) => [
      ["Draaistijfheid (Paros–Weisbord)", sub("c", "φ") + " ≈ " + fr("2·E·b·" + sup("t", "5/2"), "9π·√R"), sub("c", "φ") + " = " + fr("2·" + num(r.E) + "·" + num(p.b) + "·" + num(p.t) + "<sup>5/2</sup>", "9π·√" + num(p.R)) + " = " + num(r.c) + " Nmm/rad"],
      ["Nominale buigspanning", sub("σ", "nom") + " = " + fr("6·M", "b·t²") + " = " + fr("4", "3π") + "·E·√" + fr("t", "R") + "·φ", sub("σ", "nom") + " = " + num(r.sNom) + " MPa"],
      ["Piekspanning", sub("σ", "max") + " = " + sub("K", "t") + "·" + sub("σ", "nom"), sub("σ", "max") + " = " + num(p.Kt) + "·" + num(r.sNom) + " = " + num(r.sigma) + " MPa"],
      ["Maximale rotatie", sub("φ", "max") + " = " + fr(sub("σ", "toel"), sub("K", "t") + "·" + fr("4", "3π") + "·E·√(t/R)"), sub("φ", "max") + " = " + num(r.phiMax * 1000) + " mrad = " + num(r.phiMax / DEG) + "°"],
      ["Eigenfrequentie", "f = " + fr("1", "2π") + "·√" + fr(sub("c", "φ"), "m·r²"), "f = " + num(r.f) + " Hz"],
    ],
    assume: ["Cirkelvormige inkeping aan beide zijden, t ≪ R; de formule is de gesloten vorm van Paros en Weisbord (1965) voor t/(2R) tot ongeveer 0,5, met enkele procenten afwijking.",
      "Rotatie om het midden van de inkeping; parasitaire verplaatsing van het draaipunt en axiale stijfheid zijn niet berekend.",
      "K_t is een invoer (schatting; voor diepe ronde inkepingen ca. 1,3 tot 3). Zie Smith voor grafieken. Bij vermoeiing en hoge φ de waarde conservatief kiezen."],
    source: SRC_H + "; Paros &amp; Weisbord, <i>How to design flexure hinges</i>, Machine Design 37 (1965).",
  },
  {
    id: "wire", group: "Flexures", name: "Draadflexure", short: "Dunne draad als scharnier of veer", svg: SCHEMA.wire,
    inputs: [f("L", "Lengte L", "mm", 50, 0.01), f("d", "Diameter d", "mm", 1, 0.001), f("u", "Zijwaartse uitwijking u", "mm", 0.5, 0), IN_F, IN_M,
      { id: "bc", type: "select", label: "Uiteinden", def: "guided", options: [["guided", "Beide ingeklemd, eind geleid (12EI/L³)"], ["free", "Eén eind ingeklemd, ander vrij (3EI/L³)"]] }],
    run: (p, M) => {
      const r = wireFlexure(Object.assign({}, p, M));
      return { r,
        out: [res("Axiale stijfheid c_ax", num(r.cax / 1000), "kN/mm"), res("Buigstijfheid c_b", num(r.cb), "N/mm"),
          res("Kracht bij u", num(r.force), "N"), res("Maximale uitwijking u_max", num(r.uMax), "mm"),
          res("Spanning bij u", num(r.sigma), "MPa", stressBad(r, M)), res("Knikbelasting P_cr", num(r.Pcr), "N"),
          marginRes(r), res("f zijwaarts", num(r.f), "Hz"), res("f axiaal", num(r.fax), "Hz")],
        warn: warn(r, r.sigma, M.sigma) };
    },
    formulas: (p, M, r) => {
      const g = p.bc === "guided";
      return [
        ["Doorsnede", "A = " + fr("π·d²", "4") + ", I = " + fr("π·d⁴", "64"), "A = " + num(r.A) + " mm², I = " + num(r.I) + " mm⁴"],
        ["Axiale stijfheid", sub("c", "ax") + " = " + fr("E·A", "L"), sub("c", "ax") + " = " + fr(num(p.E) + "·" + num(r.A), num(p.L)) + " = " + num(r.cax) + " N/mm"],
        ["Buigstijfheid", sub("c", "b") + " = " + (g ? fr("12·E·I", "L³") : fr("3·E·I", "L³")), sub("c", "b") + " = " + num(r.cb) + " N/mm"],
        ["Maximale uitwijking", sub("u", "max") + " = " + (g ? fr(sub("σ", "toel") + "·L²", "3·E·d") : fr("2·" + sub("σ", "toel") + "·L²", "3·E·d")), sub("u", "max") + " = " + num(r.uMax) + " mm"],
        ["Spanning", "σ = " + (g ? fr("3·E·d·u", "L²") : fr("3·E·d·u", "2·L²")) + " + " + fr("F", "A"), "σ = " + num(r.sb) + " + " + num(r.sa) + " = " + num(r.sigma) + " MPa"],
        ["Knik", sub("P", "cr") + " = " + fr("π²·E·I", (g ? "" : "4·") + "L²"), sub("P", "cr") + " = " + num(r.Pcr) + " N"],
        ["Eigenfrequenties", "f = " + fr("1", "2π") + "·√" + fr("c·1000", "m"), "f<sub>zijw</sub> = " + num(r.f) + " Hz, f<sub>ax</sub> = " + num(r.fax) + " Hz"],
      ];
    },
    assume: ["Ronde, rechte draad met gelijke diameter; lineair-elastisch en kleine doorbuiging.",
      "Geleid eind (S-vorm): moment L/2·F op de inklemming. Eén eind vrij: moment F·L, knik met effectieve lengte 2L (P_cr = π²EI/(4L²)).",
      "Spanning is buiging plus F/A; de uiteinden zijn ideaal ingeklemd, praktijk is slapper.",
      "Een draad is stijf op trek/druk en slap op buiging: c_ax/c_b ≈ (4/3)·(L/d)² voor de geleide draad."],
    source: SRC_S + "; " + SRC_H + ".",
  },
];

// ---------- toestand ----------
const state = { cur: "leaf", mat: "staal", vals: {} };
CALCS.forEach(c => { state.vals[c.id] = {}; c.inputs.forEach(i => { state.vals[c.id][i.id] = i.def; }); });
const calcOf = id => CALCS.find(c => c.id === id) || CALCS[0];

function params(c) {
  const p = {}, v = state.vals[c.id];
  c.inputs.forEach(i => { p[i.id] = v[i.id]; });
  return p;
}
const invalid = (c, p) => c.inputs.filter(i => typeof i.def === "number" &&
  !(isFinite(p[i.id]) && p[i.id] >= i.min && (i.min === 0 || p[i.id] > 0)));

// ---------- weergave ----------
function matParams() { const m = material(state.mat); return { E: m.E, nu: m.nu, sigma: m.sigma }; }

function renderResults() {
  const c = calcOf(state.cur), p = params(c), box = $("calcOut");
  const bad = invalid(c, p);
  if (bad.length) {
    box.innerHTML = '<div class="calc-warn" role="alert">Controleer de invoer: ' + bad.map(i => i.label).join(", ") + ".</div>";
    $("calcFormulas").innerHTML = "";
    return;
  }
  const o = c.run(p, matParams());
  let h = "";
  if (o.warn.length) h += '<div class="calc-warn" role="alert">' + o.warn.map(w => "<div>⚠ " + w + "</div>").join("") + "</div>";
  h += '<dl class="calc-res">' + o.out.map(x => '<div class="' + (x.bad ? "bad" : "") + '"><dt>' + x.k + '</dt><dd data-res="' + x.k + '">' + x.v + (x.unit ? ' <span class="u">' + x.unit + "</span>" : "") + "</dd></div>").join("") + "</dl>";
  box.innerHTML = h;
  const fm = c.formulas(p, matParams(), o.r);
  $("calcFormulas").innerHTML = fm.map(x => '<div class="fm"><div class="fm-h">' + x[0] + '</div><div class="fm-g">' + x[1] + '</div><div class="fm-n"><span class="fm-lab">met jouw getallen</span> ' + x[2] + "</div></div>").join("");
}

function renderDetail() {
  const c = calcOf(state.cur), v = state.vals[c.id];
  let h = '<h2>' + c.name + '</h2><p class="calc-sub">' + c.short + "</p>";
  h += '<div class="calc-top"><figure class="calc-fig">' + c.svg + "</figure><form class=\"calc-in\" onsubmit=\"return false\">";
  h += '<label class="fld"><span>Materiaal</span><select id="calcMat">' + MATERIALS.map(m => '<option value="' + m.id + '"' + (m.id === state.mat ? " selected" : "") + ">" + m.naam + "</option>").join("") + "</select></label>";
  h += '<div class="mat-info" id="calcMatInfo"></div>';
  c.inputs.forEach(i => {
    if (i.type === "check") h += '<label class="chk"><input type="checkbox" data-in="' + i.id + '"' + (v[i.id] ? " checked" : "") + "> " + i.label + "</label>";
    else if (i.type === "select") h += '<label class="fld"><span>' + i.label + '</span><select data-in="' + i.id + '">' + i.options.map(o => '<option value="' + o[0] + '"' + (v[i.id] === o[0] ? " selected" : "") + ">" + o[1] + "</option>").join("") + "</select></label>";
    else h += '<label class="fld"><span>' + i.label + '</span><span class="inp"><input type="number" inputmode="decimal" step="any" data-in="' + i.id + '" value="' + v[i.id] + '"><b>' + i.unit + "</b></span></label>";
  });
  h += "</form></div>";
  h += '<h3>Resultaat</h3><div id="calcOut"></div>';
  h += '<h3>Formules</h3><div id="calcFormulas" class="calc-formulas"></div>';
  h += '<h3>Aannames</h3><ul class="calc-assume">' + c.assume.map(a => "<li>" + a + "</li>").join("") + "</ul>";
  h += '<p class="calc-src"><span>Bron</span> ' + c.source + "</p>";
  $("calcDetail").innerHTML = h;
  updMatInfo();
  renderResults();
}
function updMatInfo() {
  const m = material(state.mat);
  $("calcMatInfo").textContent = "E = " + num(m.E / 1000) + " GPa · ν = " + num(m.nu) + " · σ_toel = " + num(m.sigma) + " MPa";
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
  else if (!$("calcDetail").firstChild) renderDetail();
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
  $("calcDetail").addEventListener("input", e => {
    const t = e.target, c = calcOf(state.cur);
    if (t.id === "calcMat") { state.mat = t.value; updMatInfo(); renderResults(); return; }
    const id = t.dataset.in;
    if (!id) return;
    const inp = c.inputs.find(i => i.id === id);
    state.vals[c.id][id] = inp.type === "check" ? t.checked : inp.type === "select" ? t.value : parseFloat(String(t.value).replace(",", "."));
    renderResults();
  });
}
