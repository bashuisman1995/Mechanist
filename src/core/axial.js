// Axiaal-elastische staven en thermische rek van staven (zonder DOM).
//
// Een schakel (link) heeft een materiaal (standaard staal) en een stijfheid: oneindig (stijve randvoorwaarde, zoals altijd)
// of axiaal (een veer k = E·A/L langs de staaf). Temperatuur: elke staaf krijgt de rustlengte
//    L(ΔT) = L0·(1 + α·ΔT),   ΔL = α·L0·ΔT,
// met ΔT het model-brede verschil (model.dT, K) of de eigen waarde van de staaf (e.dT). Eenheden: mm, N, MPa (= N/mm²), K.
import { MATERIALS, material } from "../calc/materials.js";
import { model } from "./state.js";

export { MATERIALS };
export const A_DEFAULT = 20;                       // mm², doorsnede van een nieuwe axiale staaf (5 × 4 mm)
export const isAxial = e => !!e && e.type === "link" && e.axial === true && !e.driver;
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
