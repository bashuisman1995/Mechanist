// Flexure-element: pseudo-rigid-body model (PRBM, Howell) als scharnier met draaiveer (zonder DOM).
//
// Het element is een stijve schakel a -> b met in punt a een draaiveer K [N·mm/rad] ten opzichte van een
// referentie: de grond, of een andere schakel in punt a. Het moment op de schakel is M = -K·φ, met
// φ = (hoek schakel - hoek referentie) - rusthoek + voorspanning. De rusthoek is de getekende stand.
//   Bladveer (uitkraging): karakteristiek scharnier op (1-γ)·L van de inklemming, schakel = γ·L lang,
//                          K = γ·K_Θ·E·I/L   (γ = 0,85, K_Θ = 2,65; Howell, Compliant Mechanisms)
//   Kruisveerscharnier:    K uit src/calc/flexures.js (crossPivot)
//   Scharnier met inkeping: K uit src/calc/flexures.js (notchHinge)
// Eenheden: mm, N, MPa, rad.
import { crossPivot, notchHinge } from "../calc/flexures.js";
import { material } from "../calc/materials.js";
import { E, isBar, N } from "./elements.js";
import { model } from "./state.js";
import { t } from "../ui/i18n.js";

export const GAMMA = 0.85, KTHETA = 2.65;
export const FLEX_KINDS = { get cantilever() { return t("flex.cantilever"); }, get cross() { return t("flex.cross"); }, get notch() { return t("flex.notch"); } };
export const flexDefaults = (kind, len) => {
  const k = FLEX_KINDS[kind] ? kind : "cantilever";
  return { kind: k, L: k === "cantilever" ? Math.round(len / GAMMA * 100) / 100 : 20, wd: 10, t: 0.3, R: 3, Kt: 1.5,
           mat: "staal", sig: 0, pre: 0, ref: "" };
};
export const flexures = () => model.elems.filter(e => e.type === "flexure" && N(e.a) && N(e.b));

const rad = Math.PI / 180;
export function flexMat(e) {
  const m = material(e.mat);
  return { E: m.E, nu: m.nu, naam: m.naam, sigma: e.sig > 0 ? e.sig : m.sigma };
}
const geo = e => ({ b: Math.max(1e-6, e.wd || 10), t: Math.max(1e-6, e.t || 0.3), L: Math.max(1e-6, e.L || 20),
                    R: Math.max(1e-6, e.R || 3), Kt: Math.max(1, e.Kt || 1) });
const calcIn = e => { const g = geo(e), m = flexMat(e); return Object.assign({ E: m.E, nu: m.nu, sigma: m.sigma, phi: 0, F: 0, m: 1, r: 1 }, g); };
export const flexI = e => { const g = geo(e); return g.b * g.t ** 3 / 12; };

// draaistijfheid van het scharnier [N·mm/rad]
export function flexK(e) {
  const g = geo(e), m = flexMat(e);
  if (e.kind === "cross") return crossPivot(calcIn(e)).c;
  if (e.kind === "notch") return notchHinge(calcIn(e)).c;
  return GAMMA * KTHETA * m.E * flexI(e) / g.L;
}
// spanning per rad rotatie [MPa/rad], de effectieve lengte L_eff in σ = E·t·φ/(2·L_eff), en de toelaatbare spanning
export function flexStressRate(e) {
  const g = geo(e), m = flexMat(e);
  if (e.kind === "notch") return { rate: notchHinge(calcIn(e)).perRad * g.Kt, Leff: NaN };
  const Leff = e.kind === "cross" ? g.L : g.L / KTHETA;
  return { rate: m.E * g.t / (2 * Leff), Leff };
}
export function flexStress(e, phi) {
  const s = flexStressRate(e), allow = flexMat(e).sigma, sigma = s.rate * Math.abs(phi);
  return { sigma, allow, ratio: sigma / allow, rate: s.rate, Leff: s.Leff, phiMax: allow / s.rate };
}
export const flexBarLen = e => e.kind === "cantilever" ? GAMMA * (e.L || 0) : null;

// referentieschakel (moet punt a delen), anders de grond
export function flexRef(e) {
  if (!e.ref) return null;
  const r = E(e.ref);
  return r && r !== e && isBar(r) && N(r.a) && N(r.b) && (r.a === e.a || r.b === e.a) ? r : null;
}
// standaardreferentie bij het plaatsen: grond bij een oplegging, anders de eerste andere schakel in a
export function flexDefaultRef(e) {
  if (N(e.a).support !== "free") return "";
  const o = model.elems.find(x => x !== e && isBar(x) && N(x.a) && N(x.b) && (x.a === e.a || x.b === e.a));
  return o ? o.id : "";
}
export function flexRefs(e) {
  return model.elems.filter(x => x !== e && isBar(x) && N(x.a) && N(x.b) && (x.a === e.a || x.b === e.a));
}
const wrap = x => x - 2 * Math.PI * Math.round(x / (2 * Math.PI));
// hoek van de schakel ten opzichte van de referentie; pos(id) levert {x, y}
export function flexTheta(e, pos) {
  const P = pos(e.a), Q = pos(e.b), r = flexRef(e);
  let th = Math.atan2(Q.y - P.y, Q.x - P.x);
  if (r) { const O = pos(r.a === e.a ? r.b : r.a); th -= Math.atan2(O.y - P.y, O.x - P.x); }
  return th;
}
// rusthoeken: de getekende stand (aanroepen vóór er iets beweegt)
export function flexRest() {
  const m = new Map();
  for (const e of flexures()) m.set(e.id, flexTheta(e, N));
  return m;
}
export const flexPhi = (e, pos, rest) => wrap(flexTheta(e, pos) - (rest.get(e.id) || 0)) + (e.pre || 0) * rad;
export const flexPot = (e, phi) => 0.5 * flexK(e) * phi * phi;          // N·mm

// koppel tau (N·mm, tegen de klok in) op een schakel als krachtenkoppel op zijn uiteinden: add(id, fx, fy)
export function couple(add, P, Q, ida, idb, tau) {
  const rx = Q.x - P.x, ry = Q.y - P.y, k = tau / (rx * rx + ry * ry || 1);
  add(idb, -k * ry, k * rx);
  add(ida, k * ry, -k * rx);
}
// krachten van alle draaiveren; K·φ wordt met het teken van een veer teruggeduwd
export function flexLoads(pos, rest, add) {
  for (const e of flexures()) {
    const K = flexK(e), M = -K * flexPhi(e, pos, rest), r = flexRef(e);
    couple(add, pos(e.a), pos(e.b), e.a, e.b, M);
    if (r) couple(add, pos(r.a), pos(r.b), r.a, r.b, -M);
  }
}
// φ per beeld van een doorgerekende oplossing (S.pos[id][i]); komt in S.FX[id]
export function flexTrace(S, rest) {
  S.FX = {};
  for (const e of flexures()) {
    const r = flexRef(e), ids = [e.a, e.b].concat(r ? [r.a, r.b] : []);
    if (ids.some(id => !S.pos[id])) continue;
    const out = new Array(S.t ? S.t.length : 361);
    for (let i = 0; i < out.length; i++) out[i] = flexPhi(e, id => S.pos[id][i], rest);
    S.FX[e.id] = out;
  }
}
// φ nu: uit de laatste oplossing op beeld i, anders de voorspanning (stand = getekende stand)
export function flexLivePhi(e, S, i) {
  return S && S.FX && S.FX[e.id] && isFinite(S.FX[e.id][i]) ? S.FX[e.id][i] : (e.pre || 0) * rad;
}
