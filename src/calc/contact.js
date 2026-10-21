// Hertz-contact en kinematische koppeling. Puur, zonder DOM. Eenheden: mm, N, MPa (= N/mm²).
// Bron: Johnson, Contact Mechanics (Cambridge UP, 1985): Hertz (bol), Mindlin (tangentiële stijfheid).
import { t } from "../ui/i18n.js";
const PI = Math.PI, DEG = PI / 180;

/** Effectieve modulus E*: 1/E* = (1−ν₁²)/E₁ + (1−ν₂²)/E₂ [MPa]. */
export const effModulus = (E1, nu1, E2, nu2) => 1 / ((1 - nu1 * nu1) / E1 + (1 - nu2 * nu2) / E2);
export const shearModulus = (E, nu) => E / (2 * (1 + nu));
/** Effectieve schuifmodulus G*: 1/G* = (2−ν₁)/G₁ + (2−ν₂)/G₂ (Mindlin, Johnson). */
export const effShear = (G1, nu1, G2, nu2) => 1 / ((2 - nu1) / G1 + (2 - nu2) / G2);

/** Effectieve straal. kind: "flat" (bol op vlak), "convex" (bol op bol), "concave" (bol in holle bol, R2 > R1). */
export function effRadius(kind, R1, R2) {
  if (kind === "convex") return R1 * R2 / (R1 + R2);
  if (kind === "concave") return R2 > R1 ? R1 * R2 / (R2 - R1) : NaN;
  return R1;
}

/** Hertz-puntcontact met effectieve straal R [mm], normaalkracht F [N], E* [MPa]. */
export function hertzSphere({ F, R, Es }) {
  const a = Math.cbrt(3 * F * R / (4 * Es));            // contactstraal [mm]
  const delta = a * a / R;                               // totale nadering [mm]
  const p0 = 3 * F / (2 * PI * a * a);                   // maximale druk [MPa]
  return { a, delta, p0, pMean: F / (PI * a * a), kn: 2 * Es * a,    // kn = dF/dδ = 3F/(2δ) [N/mm]
    zTau: 0.48 * a, tauMax: 0.31 * p0, vm: 0.62 * p0 };   // ν = 0,3 (Johnson, par. 4.3)
}

/** Maxwell-koppeling: 3 bollen in 3 V-groeven (hoek gamma tussen de flanken), zes contacten, voorspanning F in het zwaartepunt. */
export function kinCoupling(p) {
  const s = Math.sin(p.gamma * DEG / 2);                 // flanknormaal maakt hoek (90°−γ/2) met de voorspanningsas
  const N = p.F / (6 * s);                               // normaalkracht per contact
  const Es = effModulus(p.E1, p.nu1, p.E2, p.nu2);
  const h = hertzSphere({ F: N, R: p.R, Es });
  const Gs = effShear(shearModulus(p.E1, p.nu1), p.nu1, shearModulus(p.E2, p.nu2), p.nu2);
  const kt = 8 * Gs * h.a;                               // Mindlin: tangentiële stijfheid per contact [N/mm]
  const xStick = p.mu * N / kt;                          // lineaire schatting van de verplaatsing tot slippen
  return Object.assign(h, { s, N, Es, Gs, kt,
    kAx: 6 * h.kn * s * s,                               // stijfheid langs de voorspanningsas
    kGroove: 2 * kt,                                     // wrijvingsstijfheid per groef, langs de groefas
    QGroove: 2 * p.mu * N,                               // slipkracht per groef langs de groefas
    xStick, xSlip: 1.5 * xStick });                      // volledig slippen (Mindlin): 3μN/(16 G* a) = 1,5·μN/k_t
}

/**
 * Kelvin-koppeling: drie bollen onder 120° op een cirkel. Bol A zit in een tetraëder (drie vlakke flanken, 3 contacten),
 * bol B in een V-groef waarvan de as naar A wijst (2 contacten), bol C op een plat vlak (1 contact): 3 + 2 + 1 = 6.
 * Voorspanning F langs de as door het zwaartepunt, wrijvingsloos, bolmiddelpunten in één horizontaal vlak.
 * Statica: elke bol draagt F/3 verticaal (momentenevenwicht om twee horizontale assen). De horizontale componenten van
 * de drie tetraëderflanken (onder 120°, gelijk) en van de twee groefflanken heffen elkaar op; zo is ook de kracht in
 * het vlak en het moment om de as nul. Dus: vlak N = F/3, groefflank N = F/(6·sin(γ/2)), tetraëderflank N = F/(9·sin(γk/2)),
 * met sin(γ/2) de verticale component van de flanknormaal. Per contact Hertz bol-op-vlak (de flanken zijn vlak).
 */
export function kelvinCoupling(p) {
  const sg = Math.sin(p.gamma * DEG / 2), sk = Math.sin(p.gammaC * DEG / 2);
  const Es = effModulus(p.E1, p.nu1, p.E2, p.nu2);
  const Gs = effShear(shearModulus(p.E1, p.nu1), p.nu1, shearModulus(p.E2, p.nu2), p.nu2);
  const mk = (id, label, count, N, s) => {
    const h = hertzSphere({ F: N, R: p.R, Es }), kt = 8 * Gs * h.a;
    return Object.assign(h, { id, label, count, N, s, kt, kAx: count * h.kn * s * s, xStick: p.mu * N / kt });
  };
  const contacts = [mk("cone", t("calc.kelvin.cone"), 3, p.F / (9 * sk), sk), mk("groove", t("calc.kelvin.groove"), 2, p.F / (6 * sg), sg), mk("flat", t("calc.kelvin.flat"), 1, p.F / 3, 1)];
  let gov = contacts[0];
  contacts.forEach(c => { if (c.p0 > gov.p0) gov = c; });
  return { contacts, gov, Es, Gs, kAx: contacts.reduce((a, c) => a + c.kAx, 0),
    N: gov.N, a: gov.a, delta: gov.delta, p0: gov.p0, kn: gov.kn, kt: gov.kt,
    QGroove: 2 * p.mu * contacts[1].N, xStick: gov.xStick, xSlip: 1.5 * gov.xStick };
}
