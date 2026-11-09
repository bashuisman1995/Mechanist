// Voorbeelden als gegevens (zonder DOM): knopen, elementen, instellingen en de analytische controle die in de uitleg staat.
// examples.js bouwt hieruit het model in de app; de unit-tests bouwen hetzelfde model in Node en vergelijken de oplossers met
// de formule (check.value), en de e2e-test leest dezelfde grootheid uit de app.
//
// Knoop:   [naam, x, y, steun, richting, extra]   steun "free" | "pin" | "slider"; extra o.a. m (kg), clamp, joint, kth
// Element: [type, a, b, extra]                    link | spring | damper | gap | flexure | loadcell | actuator | dsens
//          ["force", knoop, grootte, hoek]        ["contact", knoop, null, extra]   ["accel", knoop, null, extra]
//          extra.key geeft het element een naam waar series en andere elementen naar kunnen verwijzen (#key, ref)
// Series:  "n|@C|x": @naam wordt het knoop-id, #key het element-id.
// Eenheden: mm · N · N/mm · kg · MPa · Hz.
import { eStar, contactDefaults, deltaFor } from "../core/contact.js";
import { flexDefaults, flexK } from "../core/flexure.js";
import { material } from "../calc/materials.js";
import { notchHinge } from "../calc/flexures.js";

const E_ST = material("staal").E, RHO_ST = material("staal").rho;
const PI = Math.PI;
const r3 = x => Math.round(x * 1000) / 1000;
/** rechthoekige balk b (uit het vlak) × h (in het buigvlak), standaard staal */
export const bm = (b, h, mat) => ({ beam: true, prof: "rect", mat: mat || "staal", pb: b, ph: h });
/** ronde balk Ø d */
export const rb = (d, mat) => ({ beam: true, prof: "round", mat: mat || "staal", pd: d });
const EIrect = (b, h, E) => (E || E_ST) * b * h ** 3 / 12;
const KC = { clamp: true };

/* ---------- Hertz: stijfheid in de normaal bij voorspanning F: kn = (6·F·E*²·R)^(1/3) ---------- */
const CD = contactDefaults();
const ES = eStar(CD.m1, CD.m2);
export const hertzKn = (F, R) => Math.cbrt(6 * F * ES * ES * (R || CD.R));

/* ---------- parameters per voorbeeld ---------- */
// bladveergeleiding
const LG = { w: 20, t: 0.4, L: 40 }, LG_EI = EIrect(LG.w, LG.t);
const LG_K1 = 12 * LG_EI / LG.L ** 3;                      // één blad, beide uiteinden geleid
const LG_KS = 1.6;                                          // aandrijfveer, N/mm
// kruisveerscharnier + hefboom
const CP = { wd: 10, t: 0.5, L: 20, a: 80 };
const CP_K = 2 * EIrect(CP.wd, CP.t) / CP.L;               // N·mm/rad
// inkepingsscharnier + hefboom
const NH = { kind: "notch", wd: 10, t: 0.3, R: 3, Kt: 1.5 }, NH_K = flexK({ ...NH, mat: "staal", L: 20 });
// vierstang met inkepingsscharnieren
const FB = { r: 40, d: 60 }, FB_K = notchHinge({ E: E_ST, b: 10, t: 0.2, R: 2, Kt: 1.5, phi: 0, sigma: 300 }).c;
// draadflexure
const WP = { d: 1, L: 30 }, WP_EI = E_ST * PI * WP.d ** 4 / 64, WP_EA = E_ST * PI * WP.d ** 2 / 4;
// tastarm
const PR = { d: 2, L: 60, m: 0.002 }, PR_MAT = material("wc");
const PR_EI = PR_MAT.E * PI * PR.d ** 4 / 64, PR_A = PI * PR.d ** 2 / 4;
const PR_MB = PR_MAT.rho * PR_A * PR.L * 1e-9;              // massa van de balk, kg
// C-frame
const CF = { b: 20, h: 12, a: 70, H: 100, F: 100 }, CF_EI = EIrect(CF.b, CF.h);
// portaal met diagonaal
const PB = { b: 10, h: 1.5, H: 100, W: 120, A: 0.5 }, PB_EI = EIrect(PB.b, PB.h);
const PB_LD = Math.hypot(PB.W, PB.H), PB_KD = E_ST * PB.A / PB_LD, PB_C = PB.W / PB_LD;
// geschroefde beugel
const BR = { b: 20, h: 3, a: 80, hb: 40, kb: 500 }, BR_EI = EIrect(BR.b, BR.h);
// balk op drie steunen
const TS = { b: 10, h: 2, L: 100, P: 10 };
// tuned mass damper
const TM = { m1: 1, f1: 20, mu: 0.05 };
const kOf = (m, f) => m * (2 * PI * f) ** 2 / 1000;        // N/mm bij massa m (kg) en frequentie f (Hz)
const TM_K1 = kOf(TM.m1, TM.f1), TM_M2 = TM.m1 * TM.mu, TM_F2 = TM.f1 / (1 + TM.mu), TM_K2 = kOf(TM_M2, TM_F2);
const TM_ZOPT = Math.sqrt(3 * TM.mu / (8 * (1 + TM.mu) ** 3));
const cOf = (zeta, k, m) => 2 * zeta * Math.sqrt(k * 1000 * m) / 1000;   // N·s/mm
// isolatie
const IS = { k1: 0.5, M: 5, k2: 50, m: 0.5 };
export function twoMassFreqs(k1, M, k2, m) {                // Hz, ongedempt: M·x'' + K·x = 0
  const a = (k1 + k2) * 1000 / M, d = k2 * 1000 / m, bc = (k2 * 1000) ** 2 / (M * m);
  const s = (a + d) / 2, q = Math.sqrt(((a - d) / 2) ** 2 + bc);
  return [Math.sqrt(s - q) / (2 * PI), Math.sqrt(s + q) / (2 * PI)];
}
// voice-coil
const VC = { m: 0.5, k: 4 * LG_K1 / 2, c: 0.01 };           // k = 8,4 N/mm (twee bladen)
VC.k = 2 * LG_K1;
// capacitieve sensor
const CS = { m: 0.2, k: 2 * LG_K1, c: 0.02, F: 0.5 };
// versnellingsopnemer
const AM = { m: 0.02, k: 0.2, ms: 0.01 };
// vallende massa op een harde aanslag
const HS = { m: 0.2, h: 1, R: 5, g: 9810 };
// slinger met wrijving
const PF = { L: 100, th: 40, mus: 0.3, muk: 0.2, rj: 4, m: 0.3 };
// bimetaal
const BI = { L: 60, d: 5, Lt: 40, dT: 5, as: material("staal").alpha * 1e-6, aa: material("alu").alpha * 1e-6 };
// athermisch paar: staal (A->C) en aluminium (B->C); drift in y is nul als L_alu/L_staal = sqrt(α_staal/α_alu)
const AP = (() => {
  const as = material("staal").alpha, aa = material("alu").alpha, L1 = 150, H = 120, L2 = L1 * Math.sqrt(as / aa);
  const y = (L1 * L1 - L2 * L2 + H * H) / (2 * H), x = Math.sqrt(L1 * L1 - y * y);
  return { as, aa, L1, L2, H, x: r3(x), y: r3(y), dT: 10 };
})();
// thermisch geklemde staaf met zachte steun
const TH = { L: 100, A: 2, ks: 400, dT: 20, a: material("staal").alpha * 1e-6 };
// Roberts: A(0,0), D(100,0), wip AB = DC = 72, koppel BC = 60, benen BP = CP = 160 van de driehoek
const RB = { d: 100, c: 60, L: 72, s: 160, span: 10 };
// optimaliseren: één bladveer, stroke en spanning
const MF = { w: 20, L: 30, t0: 0.4, F: 1, stroke: 0.8, m: 0.02 };
const MF_KMAX = MF.F / MF.stroke, MF_TOPT = Math.cbrt(MF_KMAX * MF.L ** 3 / (E_ST * MF.w));

/* Roberts: hoek van de wip bij de middenstand en de actuatorgrenzen, zodat de wip ±span° zwaait */
function robertsSetup() {
  const a0 = Math.acos((RB.d - RB.c) / (2 * RB.L)), G = [-40, 50];
  const B = a => [RB.L * Math.cos(a), RB.L * Math.sin(a)];
  const len = a => Math.hypot(B(a)[0] - G[0], B(a)[1] - G[1]);
  const aLo = a0 - RB.span * PI / 180, aHi = a0 + RB.span * PI / 180;
  const b0 = B(a0), D = [RB.d, 0];
  const dx = D[0] - b0[0], dy = D[1] - b0[1], dd = Math.hypot(dx, dy);
  const aa = (RB.c * RB.c - RB.L * RB.L + dd * dd) / (2 * dd), h = Math.sqrt(RB.c * RB.c - aa * aa);
  const mx = b0[0] + aa * dx / dd, my = b0[1] + aa * dy / dd;
  const C1 = [mx + h * dy / dd, my - h * dx / dd], C2 = [mx - h * dy / dd, my + h * dx / dd], C = C1[0] > C2[0] ? C1 : C2;
  const M = [(b0[0] + C[0]) / 2, (b0[1] + C[1]) / 2], bl = Math.hypot(C[0] - b0[0], C[1] - b0[1]);
  const hh = Math.sqrt(RB.s * RB.s - (bl / 2) ** 2), nx = (C[1] - b0[1]) / bl, ny = -(C[0] - b0[0]) / bl;
  const P = [M[0] + hh * nx, M[1] + hh * ny];
  const lo = Math.min(len(aLo), len(aHi)), hi = Math.max(len(aLo), len(aHi));
  return { a0, G, B: b0.map(r3), C: C.map(r3), P: P.map(r3), min: r3(lo), max: r3(hi), len: r3(len(a0)) };
}
export const ROBERTS = robertsSetup();

/* ============================================================
   De voorbeelden
   ============================================================ */
export const SPECS = {
  /* ---------------- Flexures ---------------- */
  // parallelgeleiding op twee bladveren met aandrijfveer en aanslag; tafel op de bovenrand
  leafguide: {
    mode: "stiff", stiff: { node: "D", ang: 0 },
    nodes: [["A", 0, 0, "pin", 0, KC], ["B", 40, 0, "pin", 0, KC], ["C", 0, 40, "free", 0, { m: 0.1 }], ["D", 40, 40],
            ["DU", 40, 50], ["W", 95, 50, "pin"], ["S", 46, 40, "pin"]],
    elems: [["link", "A", "C", bm(LG.w, LG.t)], ["link", "B", "D", bm(LG.w, LG.t)], ["link", "C", "D"], ["link", "D", "DU"],
            ["spring", "DU", "W", { k: LG_KS }], ["gap", "D", "S", { min: 5.5, max: 6.5, kc: 500, cc: 0.05 }], ["force", "DU", 1, 0]],
    check: [{ read: "k", value: 2 * LG_K1 + LG_KS, unit: "N/mm", tol: 0.01 }]
  },
  // dubbele parallelgeleiding: twee trappen in serie, de tweede hangt naar beneden aan de eerste
  compoundguide: {
    mode: "stiff", stiff: { node: "H", ang: 0 },
    nodes: [["A", 0, 0, "pin", 0, KC], ["B", 60, 0, "pin", 0, KC], ["C", 0, 40], ["E", 20, 40, "free", 0, { m: 0.03 }], ["F", 40, 40, "free", 0, { m: 0.03 }],
            ["D", 60, 40], ["G", 20, 0, "free", 0, { m: 0.03 }], ["H", 40, 0, "free", 0, { m: 0.03 }]],
    elems: [["link", "A", "C", bm(LG.w, LG.t)], ["link", "B", "D", bm(LG.w, LG.t)],
            ["link", "C", "E"], ["link", "E", "F"], ["link", "F", "D"],
            ["link", "E", "G", bm(LG.w, LG.t)], ["link", "F", "H", bm(LG.w, LG.t)], ["link", "G", "H"],
            ["force", "H", 1, 0]],
    check: [{ read: "k", value: LG_K1, unit: "N/mm", tol: 0.01 }]
  },
  // kruisveerscharnier met een hefboom: K = 2EI/L, kracht aan de tip van de arm a
  crosspivot: {
    mode: "stiff", stiff: { node: "T", ang: 0 },
    nodes: [["P", 0, 0, "pin"], ["T", 0, CP.a, "free", 0, { m: 0.05 }]],
    elems: [["flexure", "P", "T", { kind: "cross", wd: CP.wd, t: CP.t, L: CP.L, R: 3, Kt: 1.5, ref: "" }], ["force", "T", 1, 0]],
    check: [{ read: "k", value: CP_K / CP.a ** 2, unit: "N/mm", tol: 0.01 }]
  },
  // hefboomversterker met één inkepingsscharnier: invoer in I (15 mm boven het scharnier), uitvoer in T (100 mm)
  notchlever: {
    mode: "stiff", stiff: { node: "I", ang: 0 },
    nodes: [["P", 0, 0, "pin"], ["I", 10, 15], ["T", 100, 0, "free", 0, { m: 0.01 }]],
    elems: [["flexure", "P", "I", { ...NH, ref: "" }], ["link", "P", "T"], ["link", "I", "T"], ["force", "I", 1, 0]],
    check: [{ read: "k", value: NH_K / 15 ** 2, unit: "N/mm", tol: 0.01 },
            { read: "dispratio", a: ["T", "uy"], b: ["I", "ux"], value: 100 / 15, tol: 0.01 }]
  },
  // vierstang met vier inkepingsscharnieren (PRBM): parallelogram, k = 4K/r²
  fourbarflex: {
    mode: "stiff", stiff: { node: "C", ang: 0 },
    nodes: [["A", 0, 0, "pin", 0, { clamp: true, joint: "spring", kth: FB_K }], ["D", FB.d, 0, "pin", 0, { clamp: true, joint: "spring", kth: FB_K }],
            ["B", 0, FB.r, "free", 0, { joint: "spring", kth: 2 * FB_K, m: 0.02 }], ["C", FB.d, FB.r, "free", 0, { joint: "spring", kth: 2 * FB_K, m: 0.02 }]],
    elems: [["link", "A", "B"], ["link", "D", "C"], ["link", "B", "C"], ["force", "C", 1, 0]],
    check: [{ read: "k", value: 4 * FB_K / FB.r ** 2, unit: "N/mm", tol: 0.01 }]
  },
  // gevouwen bladveer: twee bladen in serie, gevouwen om ruimte te besparen; k = 6EI/L³
  foldedleaf: {
    mode: "stiff", stiff: { node: "D", ang: 0 },
    nodes: [["A", 0, 0, "pin", 0, KC], ["B", 0, 40], ["C", 20, 40], ["D", 20, 0, "slider", 0, { clamp: true, m: 0.1 }]],
    elems: [["link", "A", "B", bm(LG.w, LG.t)], ["link", "B", "C"], ["link", "C", "D", bm(LG.w, LG.t)], ["force", "D", 1, 0]],
    check: [{ read: "k", value: LG_K1 / 2, unit: "N/mm", tol: 0.01 }]
  },
  // Roberts-rechtgeleiding met flexures als wippen; de actuator zwaait de wip ±10°
  roberts: {
    mode: "kin",
    nodes: [["A", 0, 0, "pin"], ["D", RB.d, 0, "pin"], ["B", ROBERTS.B[0], ROBERTS.B[1]], ["C", ROBERTS.C[0], ROBERTS.C[1]],
            ["P", ROBERTS.P[0], ROBERTS.P[1]], ["G", ROBERTS.G[0], ROBERTS.G[1], "pin"]],
    elems: [["flexure", "A", "B", { kind: "notch", wd: 10, t: 0.3, R: 3, Kt: 1.5, ref: "" }], ["flexure", "D", "C", { kind: "notch", wd: 10, t: 0.3, R: 3, Kt: 1.5, ref: "" }],
            ["link", "B", "C"], ["link", "B", "P"], ["link", "C", "P"],
            ["actuator", "G", "B", { len: ROBERTS.len, min: ROBERTS.min, max: ROBERTS.max, freq: 0.25 }]],
    trace: ["P"], series: ["n|@P|y"], xAxis: "ch|n|@P|x",
    check: [{ read: "straight", unit: "mm" }]
  },
  // XY-tafel, één vlak: buitenste geleiding (bladen langs y, buigen in x) draagt een binnenste geleiding (bladen langs x, buigen in y)
  xystage: {
    mode: "stiff", stiff: { node: "S2", ang: 0 },
    nodes: [["G1", 0, 0, "pin", 0, KC], ["G2", 80, 0, "pin", 0, KC], ["F1", 0, 30, "free", 0, { m: 0.05 }], ["F2", 80, 30, "free", 0, { m: 0.05 }],
            ["X0", 20, 30, "free", 0, { joint: "star" }], ["X1", 20, 45, "free", 0, { joint: "star" }], ["X2", 20, 65, "free", 0, { joint: "star" }],
            ["S1", 50, 45, "free", 0, { m: 0.05 }], ["S2", 50, 65, "free", 0, { m: 0.05 }]],
    elems: [["link", "G1", "F1", bm(20, 0.4)], ["link", "G2", "F2", bm(20, 0.4)], ["link", "F1", "X0"], ["link", "X0", "F2"],
            ["link", "X0", "X1"], ["link", "X1", "X2"],
            ["link", "X1", "S1", bm(20, 0.3)], ["link", "X2", "S2", bm(20, 0.3)], ["link", "S1", "S2"], ["force", "S2", 1, 0]],
    check: [{ read: "k", ang: 0, value: 24 * EIrect(20, 0.4) / 30 ** 3, unit: "N/mm", tol: 0.015 },
            { read: "k", ang: 90, value: 24 * EIrect(20, 0.3) / 30 ** 3, unit: "N/mm", tol: 0.015 }]
  },
  // twee draadflexures: axiaal stijf, dwars zacht
  wirepair: {
    mode: "stiff", stiff: { node: "TM", ang: 0 },
    nodes: [["W1", 0, 0, "pin", 0, KC], ["W2", 40, 0, "pin", 0, KC], ["T1", 0, WP.L], ["T2", 40, WP.L], ["TM", 20, WP.L, "free", 0, { m: 0.02, joint: "star" }]],
    elems: [["link", "W1", "T1", rb(WP.d)], ["link", "W2", "T2", rb(WP.d)], ["link", "T1", "TM"], ["link", "TM", "T2"], ["force", "TM", 1, 0]],
    check: [{ read: "k", ang: 0, value: 24 * WP_EI / WP.L ** 3, unit: "N/mm", tol: 0.015 },
            { read: "k", ang: 90, value: 2 * WP_EA / WP.L, unit: "N/mm", tol: 0.015 }]
  },

  /* ---------------- Contacten en koppelingen ---------------- */
  // Hertz-contact in serie met een veer: de stijfheid van de koppeling is lager dan die van de veer
  hertzseries: (() => {
    const Fp = 100, R = CD.R, d = deltaFor(CD, Fp), ks = 30000;
    return {
      mode: "stiff", stiff: { node: "L", ang: 90 },
      nodes: [["B", 0, 0, "slider", 90, { m: 0.01 }], ["L", 0, 40, "slider", 90, { m: 0.01 }]],
      elems: [["spring", "L", "B", { k: ks }], ["contact", "B", null, { ...CD, ax: 0, ay: -R + d, ang: 0 }], ["force", "L", 10, -90]],
      check: [{ read: "k", value: 1 / (1 / ks + 1 / hertzKn(Fp, R)), unit: "N/mm", tol: 0.01 }]
    };
  })(),
  // twee contacten met voorspanning: de bal heeft geen speling en een dubbele stijfheid
  bearingpair: (() => {
    const Fp = 50, R = CD.R, d = deltaFor(CD, Fp);
    return {
      mode: "stiff", stiff: { node: "L", ang: 90 },
      nodes: [["B", 0, 0, "slider", 90, { m: 0.01 }], ["L", 0, 40, "slider", 90, { m: 0.01 }]],
      elems: [["link", "B", "L"], ["contact", "B", null, { ...CD, ax: 0, ay: -R + d, ang: 0 }], ["contact", "B", null, { ...CD, ax: 0, ay: R - d, ang: 180 }], ["force", "L", 5, 90]],
      check: [{ read: "k", value: 2 * hertzKn(Fp, R), unit: "N/mm", tol: 0.01 }]
    };
  })(),
  // massa die op een harde aanslag valt: Hertz-botsing in Dynamica
  hardstop: (() => {
    const R = HS.R, Es = ES;
    const U = HS.m * 9.81 * HS.h, c = 4 / 3 * Es * Math.sqrt(R);
    // energiebehoud (zonder demping): m·g·(h + δ) = (2/5)·F·δ met F = c·δ^1,5 -> los iteratief op
    let dl = Math.pow(U * 15 / (8 * Es * Math.sqrt(R)), 0.4);
    for (let i = 0; i < 50; i++) dl = Math.pow((U + HS.m * 9.81 * dl) * 15 / (8 * Es * Math.sqrt(R)), 0.4);
    return {
      mode: "dyn", gravity: true, props: { simDur: 0.02, dtStep: 0.01 },
      nodes: [["M", 0, 0, "slider", 90, { m: HS.m }]],
      elems: [["contact", "M", null, { ...CD, ax: 0, ay: -R - HS.h, ang: 0, chi: 0, key: "c" }]],
      series: ["n|@M|y", "s|#c|F"],
      check: [{ read: "seriesmax", idx: 1, value: c * Math.pow(dl, 1.5), unit: "N", tol: 0.05, delta: dl }]
    };
  })(),

  /* ---------------- Dynamica en FRF ---------------- */
  // gedempte dynamische trillingsdemper op een stage: de piek splitst in twee lage pieken
  tmd: {
    mode: "frf", props: { frfMin: 10, frfMax: 35 },
    nodes: [["W", 0, 0, "pin"], ["M1", 100, 0, "slider", 0, { m: TM.m1 }], ["M2", 180, 0, "slider", 0, { m: TM_M2 }]],
    elems: [["spring", "W", "M1", { k: TM_K1 }], ["damper", "W", "M1", { c: cOf(0.001, TM_K1, TM.m1) }],
            ["spring", "M1", "M2", { k: TM_K2 }], ["damper", "M1", "M2", { c: cOf(TM_ZOPT, TM_K2, TM_M2) }], ["force", "M1", 1, 0]],
    series: ["n|@M1|x", "n|@M2|x"],
    check: [{ read: "frfpeak", idx: 0, value: Math.sqrt(1 + 2 / TM.mu) / TM_K1, unit: "mm/N", tol: 0.05 }]
  },
  // twee massa's op een zachte montage: isolatie boven √2·f₁
  isolator: {
    mode: "frf", props: { frfMin: 0.5, frfMax: 100 },
    nodes: [["A", 0, 0, "pin"], ["B", 60, 0, "slider", 0], ["M1", 160, 0, "slider", 0, { m: IS.M }], ["M2", 260, 0, "slider", 0, { m: IS.m }]],
    elems: [["actuator", "A", "B", { len: 60, min: 55, max: 65, freq: 1 }],
            ["spring", "B", "M1", { k: IS.k1 }], ["damper", "B", "M1", { c: cOf(0.1, IS.k1, IS.M + IS.m) }],
            ["spring", "M1", "M2", { k: IS.k2 }], ["damper", "M1", "M2", { c: cOf(0.01, IS.k2, IS.m) }]],
    series: ["n|@M1|x", "n|@M2|x"],
    check: [{ read: "frf", idx: 0, kind: "f", value: twoMassFreqs(IS.k1, IS.M, IS.k2, IS.m)[0], unit: "Hz", tol: 0.03 },
            { read: "frf", idx: 1, kind: "f", value: twoMassFreqs(IS.k1, IS.M, IS.k2, IS.m)[1], unit: "Hz", tol: 0.03 }]
  },
  // voice-coil op een bladveerstage: kracht -> uitwijking met dempingsgraad uit het wervelstroomremmetje
  voicecoil: {
    mode: "frf", props: { frfMin: 1, frfMax: 100 },
    nodes: [["W", 0, 0, "pin"], ["S", 80, 0, "slider", 0, { m: VC.m }]],
    elems: [["spring", "W", "S", { k: VC.k }], ["damper", "W", "S", { c: VC.c }], ["force", "S", 1, 0]],
    series: ["n|@S|x", "n|@S|a"],
    check: [{ read: "frf", idx: 0, kind: "f", value: Math.sqrt(VC.k * 1000 / VC.m) / (2 * PI), unit: "Hz", tol: 0.01 },
            { read: "frf", idx: 0, kind: "z", value: 100 * VC.c * 1000 / (2 * Math.sqrt(VC.k * 1000 * VC.m)), unit: "%", tol: 0.02 }]
  },
  // slinger op een wrijvend scharnier komt tot rust binnen de plakband
  pendfriction: {
    mode: "equil", props: { maxT: 30 }, gravity: true,
    nodes: [["A", 0, 0, "pin", 0, { mus: PF.mus, muk: PF.muk, rj: PF.rj }],
            ["B", r3(PF.L * Math.sin(PF.th * PI / 180)), r3(-PF.L * Math.cos(PF.th * PI / 180)), "free", 0, { m: PF.m }]],
    elems: [["link", "A", "B"]],
    series: ["n|@B|x", "n|@B|v"],
    check: [{ read: "seriesabs", idx: 0, max: PF.mus * PF.rj, unit: "mm" }]
  },

  /* ---------------- Stijfheid ---------------- */
  cframe: {
    mode: "stiff", stiff: { node: "J2", ang: -90 },
    nodes: [["P", 0, 0, "pin", 0, KC], ["R", 0, CF.H], ["J1", CF.a, 0], ["J2", CF.a, CF.H]],
    elems: [["link", "P", "R", bm(CF.b, CF.h)], ["link", "P", "J1", bm(CF.b, CF.h)], ["link", "R", "J2", bm(CF.b, CF.h)],
            ["force", "J2", CF.F, -90], ["force", "J1", CF.F, 90]],
    check: [{ read: "dispdiff", a: ["J1", "uy"], b: ["J2", "uy"],
              value: 2 * CF.F * CF.a ** 3 / (3 * CF_EI) + CF.F * CF.a ** 2 * CF.H / CF_EI, unit: "mm", tol: 0.01 }]
  },
  portalbrace: {
    mode: "stiff", stiff: { node: "B", ang: 0 },
    nodes: [["A", 0, 0, "pin", 0, KC], ["B", 0, PB.H], ["C", PB.W, PB.H], ["D", PB.W, 0, "pin", 0, KC]],
    elems: [["link", "A", "B", bm(PB.b, PB.h)], ["link", "D", "C", bm(PB.b, PB.h)], ["link", "B", "C"],
            ["link", "A", "C", { axial: true, A: PB.A, mat: "staal" }], ["force", "B", 5, 0]],
    check: [{ read: "k", value: 24 * PB_EI / PB.H ** 3 + PB_KD * PB_C ** 2, unit: "N/mm", tol: 0.02 }]
  },
  probe: {
    mode: "stiff", stiff: { node: "T", ang: -90 },
    nodes: [["A", 0, 0, "pin", 0, KC], ["M", PR.L / 2, 0], ["T", PR.L, 0, "free", 0, { m: PR.m }]],
    elems: [["link", "A", "M", rb(PR.d, "wc")], ["link", "M", "T", rb(PR.d, "wc")], ["force", "T", 0.1, -90]],
    check: [{ read: "k", value: 3 * PR_EI / PR.L ** 3, unit: "N/mm", tol: 0.01 },
            { read: "f1", value: Math.sqrt(3 * PR_EI / PR.L ** 3 * 1000 / (PR.m + 33 / 140 * PR_MB)) / (2 * PI), unit: "Hz", tol: 0.02 }]
  },
  threesupport: {
    mode: "stiff", stiff: { node: "M", ang: -90 },
    nodes: [["A", 0, 0, "pin"], ["M", TS.L / 2, 0], ["B", TS.L, 0, "pin", 0, { joint: "star" }], ["C", 2 * TS.L, 0, "pin"]],
    elems: [["link", "A", "M", bm(TS.b, TS.h)], ["link", "M", "B", bm(TS.b, TS.h)], ["link", "B", "C", bm(TS.b, TS.h)], ["force", "M", TS.P, -90]],
    check: [{ read: "react", node: "B", comp: "Ry", value: 11 * TS.P / 16, unit: "N", tol: 0.01 }]
  },
  bolted: {
    mode: "stiff", stiff: { node: "T", ang: -90 },
    nodes: [["Pb", 0, 0, "pin"], ["Pt", 0, BR.hb], ["T", BR.a, BR.hb, "free", 0, { m: 0.01 }], ["W", -30, BR.hb, "pin"]],
    elems: [["link", "Pb", "Pt"], ["link", "Pt", "T", bm(BR.b, BR.h)], ["spring", "W", "Pt", { k: BR.kb }], ["force", "T", 10, -90]],
    check: [{ read: "k", value: 1 / (BR.a ** 3 / (3 * BR_EI) + BR.a ** 2 / (BR.hb ** 2 * BR.kb)), unit: "N/mm", tol: 0.01 }]
  },

  /* ---------------- Thermisch ---------------- */
  athermalpair: {
    mode: "kin", props: { dT: AP.dT }, thermNode: "C",
    nodes: [["A", 0, 0, "pin"], ["B", 0, AP.H, "pin"], ["C", AP.x, AP.y]],
    elems: [["link", "A", "C", { mat: "staal" }], ["link", "B", "C", { mat: "alu" }]],
    check: [{ read: "therm", comp: "dy", value: 0, atol: 0.2, unit: "µm" },
            { read: "therm", comp: "dx", value: AP.as * 1e-6 * AP.L1 ** 2 / AP.x * AP.dT * 1000, unit: "µm", tol: 0.02 }]
  },
  bimetal: {
    mode: "kin", props: { dT: BI.dT }, thermNode: "P",
    nodes: [["A1", 0, 0, "pin"], ["A2", 0, BI.d, "pin"], ["B1", BI.L, 0, "slider", 0], ["B2", BI.L, BI.d], ["P", BI.L + BI.Lt, BI.d / 2]],
    elems: [["link", "A1", "B1", { mat: "staal" }], ["link", "A2", "B2", { mat: "alu" }],
            ["link", "B1", "B2", { mat: "zerodur" }], ["link", "B1", "P", { mat: "zerodur" }], ["link", "B2", "P", { mat: "zerodur" }]],
    check: [{ read: "therm", comp: "dy", value: -BI.Lt / BI.d * (BI.aa - BI.as) * BI.L * BI.dT * 1000, unit: "µm", tol: 0.03 }]
  },
  thermslot: {
    mode: "equil", gravity: false, props: { dT: TH.dT, cVisc: 3, dtStep: 0.02, simDur: 0.05 },
    nodes: [["A", 0, 0, "pin"], ["B", TH.L, 0, "slider", 0, { m: 0.5 }], ["C", TH.L + 15, 0, "pin"]],
    elems: [["link", "A", "B", { axial: true, A: TH.A, mat: "staal", key: "bar" }], ["spring", "B", "C", { k: TH.ks, L0: 15 }]],
    series: ["s|#bar|F", "w|#bar|sig"],
    check: [{ read: "series", idx: 0, scrub: 360, value: -TH.a * TH.dT * TH.L / (TH.L / (E_ST * TH.A) + 1 / TH.ks), unit: "N", tol: 0.03 }]
  },

  /* ---------------- Sensoren ---------------- */
  loadcellflex: {
    mode: "stiff", stiff: { node: "L", ang: 0 },
    nodes: [["A", 0, 0, "pin", 0, KC], ["B", 40, 0, "pin", 0, KC], ["C", 0, 40, "free", 0, { m: 0.05 }], ["D", 40, 40, "free", 0, { m: 0.05 }],
            ["L", 60, 40, "slider", 0, { m: 0.01 }]],
    elems: [["link", "A", "C", bm(LG.w, LG.t)], ["link", "B", "D", bm(LG.w, LG.t)], ["link", "C", "D"],
            ["loadcell", "D", "L", { ks: 20, m: 0 }], ["force", "L", 1, 0]],
    check: [{ read: "k", value: 1 / (1 / (2 * LG_K1) + 1 / 20), unit: "N/mm", tol: 0.01 }]
  },
  capsensor: {
    mode: "equil", props: { maxT: 5, cVisc: 0 },
    nodes: [["W", 0, 0, "pin"], ["S", 80, 0, "slider", 0, { m: CS.m }]],
    elems: [["spring", "W", "S", { k: CS.k }], ["damper", "W", "S", { c: CS.c }], ["dsens", "S", "", { key: "ds", ang: 0, range: 100, res: 0.1 }], ["force", "S", CS.F, 0]],
    series: ["m|#ds|x", "n|@S|x"],
    check: [{ read: "series", idx: 0, scrub: 360, value: CS.F / CS.k * 1000, unit: "µm", tol: 0.02 }]
  },
  accelmass: {
    mode: "frf", props: { frfMin: 5, frfMax: 40 },
    nodes: [["W", 0, 0, "pin"], ["S", 80, 0, "slider", 0, { m: AM.m }]],
    elems: [["spring", "W", "S", { k: AM.k }], ["damper", "W", "S", { c: 1e-4 }], ["accel", "S", null, { key: "ac", ang: 0, m: AM.ms }], ["force", "S", 1, 0]],
    series: ["n|@S|x", "m|#ac|a"],
    check: [{ read: "frf", idx: 0, kind: "f", value: Math.sqrt(AM.k * 1000 / (AM.m + AM.ms)) / (2 * PI), unit: "Hz", tol: 0.02 }]
  },

  /* ---------------- Optimalisatie ---------------- */
  maxfreq: {
    mode: "stiff", stiff: { node: "T", ang: 90 },
    nodes: [["A", 0, 0, "pin", 0, KC], ["T", MF.L, 0, "slider", 90, { clamp: true, m: MF.m }]],
    elems: [["link", "A", "T", bm(MF.w, MF.t0)], ["force", "T", MF.F, 90]],
    opt: { var: "ph", tOpt: MF_TOPT, kMax: MF_KMAX, stroke: MF.stroke },
    check: [{ read: "k", value: E_ST * MF.w * MF.t0 ** 3 / MF.L ** 3, unit: "N/mm", tol: 0.01 }]
  }
};

export const ids = () => Object.keys(SPECS);
export const PARAMS = { LG, LG_K1, LG_KS, CP, CP_K, NH, NH_K, FB, FB_K, WP, PR, PR_EI, PR_MB, CF, PB, PB_KD, BR, TS, TM, TM_K1, TM_K2, TM_M2, TM_F2, TM_ZOPT,
  IS, VC, CS, AM, HS, PF, BI, AP, TH, RB, MF, MF_KMAX, MF_TOPT };

/* ============================================================
   Specificatie -> modelgegevens (met de standaardwaarden van de app)
   ============================================================ */
const round2 = x => Math.round(x * 100) / 100;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/**
 * Maakt knopen, elementen en instellingen van een specificatie. ids = { node(naam) -> id, elem(n) -> id } voor de ids die je wilt.
 * Geeft { nodes, elems, props, series, byName, byKey } terug; props bevat o.a. mode, gravity, stiffNode, thermNode, durMode.
 */
export function materialize(spec, ids) {
  const nodeId = ids && ids.node ? ids.node : (nm => nm), elemId = ids && ids.elem ? ids.elem : (n => "e" + n);
  const nodes = [], byName = {};
  for (const [name, x, y, support, dir, extra] of spec.nodes) {
    const n = { id: nodeId(name), name, x, y, support: support || "free", dir: dir || 0, m: 0, ax: x, ay: y, mus: 0, muk: 0, rj: 0, ...(extra || {}) };
    nodes.push(n); byName[name] = n;
  }
  const elems = [], byKey = {};
  let k = 0, ns = 0;
  const N = nm => { const n = byName[nm]; if (!n) throw new Error("onbekende knoop " + nm); return n; };
  for (const [type, a, b, extra0] of spec.elems) {
    const extra = { ...(extra0 || {}) }, key = extra.key; delete extra.key;
    const id = elemId(++k);
    let e;
    if (type === "force") e = { id, type, node: N(a).id, mag: b, ang: extra0 };
    else if (type === "contact") e = { id, type, node: N(a).id, ...extra };
    else if (type === "accel") e = { id, type, name: "A" + (++ns), node: N(a).id, ...extra };
    else if (type === "dsens") e = { id, type, name: "S" + (++ns), a: N(a).id, b: b ? N(b).id : "", ...extra };
    else {
      const A = N(a), B = N(b), L = dist(A, B), o = { id, type, a: A.id, b: B.id };
      if (type === "link") { o.len = round2(L); o.driver = false; }
      if (type === "spring") { o.k = 1; o.L0 = round2(L); }
      if (type === "damper") o.c = 0.05;
      if (type === "gap") { o.min = round2(L - 2); o.max = round2(L + 2); o.kc = 50; o.cc = 0.05; }
      if (type === "flexure") { o.len = round2(L); Object.assign(o, flexDefaults("cantilever", L)); }
      if (type === "loadcell") { o.len = round2(L); o.name = "L" + (++ns); o.ks = 1e5; o.m = 0; }
      if (type === "actuator") { o.len = round2(L); o.min = round2(L * 0.85); o.max = round2(L * 1.15); o.freq = 0.5; }
      e = Object.assign(o, extra);
      if (type === "flexure" && extra.ref !== undefined && typeof extra.ref === "string" && extra.ref && byKey[extra.ref]) e.ref = byKey[extra.ref].id;
    }
    if (key) byKey[key] = e;
    elems.push(e);
  }
  const sub = s => String(s).replace(/@(\w+)/g, (_, nm) => N(nm).id).replace(/#(\w+)/g, (_, kk) => (byKey[kk] ? byKey[kk].id : "?"));
  const props = { mode: spec.mode === "equil" ? "dyn" : spec.mode, durMode: spec.mode === "equil" ? "equil" : "fixed", gravity: !!spec.gravity, ...(spec.props || {}) };
  if (spec.stiff) { props.stiffNode = N(spec.stiff.node).id; props.stiffAng = spec.stiff.ang; }
  if (spec.thermNode) props.thermNode = N(spec.thermNode).id;
  if (spec.xAxis) props.xAxis = sub(spec.xAxis);
  for (const nm of spec.trace || []) N(nm).trace = true;
  return { nodes, elems, props, series: (spec.series || []).map(s => ({ key: sub(s) })), byName, byKey };
}
