// Axiaal-elastische staven en thermische rek van staven (zonder DOM).
//
// Een schakel (link) heeft een materiaal (standaard staal) en een stijfheid: oneindig (stijve randvoorwaarde, zoals altijd)
// of axiaal (een veer k = E·A/L langs de staaf). Temperatuur: elke staaf krijgt de rustlengte
//    L(ΔT) = L0·(1 + α·ΔT),   ΔL = α·L0·ΔT,
// met ΔT het model-brede verschil (model.dT, K) of de eigen waarde van de staaf (e.dT). Eenheden: mm, N, MPa (= N/mm²), K.
import { MATERIALS, material } from "../calc/materials.js";
import { model } from "./state.js";
import { t } from "../ui/i18n.js";

export { MATERIALS };
export const A_DEFAULT = 20;                       // mm², doorsnede van een nieuwe axiale staaf (5 × 4 mm)
export const isAxial = e => !!e && e.type === "link" && e.axial === true && e.beam !== true && !e.driver;
// Volledig (EA + EI): een 2D Euler–Bernoulli-balk; alleen de modus Stijfheid rekent met de buiging, de andere modi zien een stijve schakel
export const isBeam = e => !!e && e.type === "link" && e.beam === true && !e.driver;
export const isThermal = e => !!e && e.type === "link" && !e.driver;       // alleen vrije staven rekken thermisch uit (kruk niet)
export const matOf = e => material(e.mat || "staal");
export const alphaOf = e => matOf(e).alpha * 1e-6;                          // 1/K  (materialen: µm/(m·K))
export const dTOf = e => (typeof e.dT === "number" && isFinite(e.dT) ? e.dT : (model.dT || 0));
export const thermDL = e => isThermal(e) ? e.len * alphaOf(e) * dTOf(e) : 0;       // mm
export const thermLen = e => e.len + thermDL(e);

// doorsnede: direct A (mm²) of een profiel b × h
export function axialA(e) {
  if (e.sect === "bh") return Math.max(1e-9, (e.sb > 0 ? e.sb : 0) * (e.sh > 0 ? e.sh : 0));
  return Math.max(1e-9, e.A > 0 ? e.A : A_DEFAULT);
}
export const axialE = e => matOf(e).E;                                      // MPa
export const axialK = e => axialE(e) * axialA(e) / Math.max(1e-9, e.len);   // N/mm
export const axialSigma = (e, F) => F / axialA(e);                          // MPa

// staven waarvoor iets thermisch of axiaals te rekenen valt (dan bestaat er ook een kinematische oplossing zonder aandrijving)
export function thermalActive() {
  return model.elems.some(e => isAxial(e) || (isThermal(e) && dTOf(e) !== 0));
}

/* ---- balkprofiel (modus Stijfheid) ----
   rect: b × h (h in het buigvlak), round: Ø d, tube: D × d, custom: A en I direct.
   c is de afstand van de neutrale lijn tot de uiterste vezel, zodat σ_buig = M·c/I. */
export const PROFILES = { get rect() { return t("prof.rect"); }, get round() { return t("prof.round"); }, get tube() { return t("prof.tube"); }, get custom() { return t("prof.custom"); } };
const pos = (v, d) => (v > 0 ? v : d);
export function beamSect(e) {
  const p = PROFILES[e.prof] ? e.prof : "rect";
  let A, I, c;
  if (p === "round") { const d = pos(e.pd, 4); A = Math.PI * d * d / 4; I = Math.PI * d ** 4 / 64; c = d / 2; }
  else if (p === "tube") {
    const D = pos(e.pD, 10), d = Math.min(D * 0.999, e.pdi >= 0 ? e.pdi : 8);
    A = Math.PI * (D * D - d * d) / 4; I = Math.PI * (D ** 4 - d ** 4) / 64; c = D / 2;
  } else if (p === "custom") {
    A = pos(e.A, A_DEFAULT); I = pos(e.I, 50); c = pos(e.cmax, Math.sqrt(12 * I / A) / 2);
  } else { const b = pos(e.pb, 10), h = pos(e.ph, 2); A = b * h; I = b * h ** 3 / 12; c = h / 2; }
  return { prof: p, A: Math.max(1e-9, A), I: Math.max(1e-12, I), c: Math.max(1e-9, c) };
}
export const sigAllow = e => (e.sig > 0 ? e.sig : matOf(e).sigma);          // MPa
