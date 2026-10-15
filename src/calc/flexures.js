// Formules voor flexures. Puur, zonder DOM. Eenheden: mm, N, MPa (= N/mm²), kg.
// Stijfheid in N/mm of Nmm/rad; frequenties in Hz.
const PI = Math.PI;

/** Eerste eigenfrequentie [Hz] bij translatiestijfheid c [N/mm] en massa m [kg]. */
export function freqTrans(cNmm, m) {
  if (!(cNmm > 0) || !(m > 0)) return NaN;
  return Math.sqrt(cNmm * 1000 / m) / (2 * PI);          // N/mm -> N/m
}
/** Eerste eigenfrequentie [Hz] bij draaistijfheid c [Nmm/rad], massa m [kg] op arm r [mm]. */
export function freqRot(cNmmRad, m, r) {
  if (!(cNmmRad > 0) || !(m > 0) || !(r > 0)) return NaN;
  const J = m * (r / 1000) ** 2;                          // kg m²
  return Math.sqrt(cNmmRad / 1000 / J) / (2 * PI);        // Nmm -> Nm
}
const margin = (Pcr, F) => (F > 0 ? Pcr / F : Infinity);
const eff = p => (p.plate ? p.E / (1 - p.nu * p.nu) : p.E);

/** Bladveer, geleid uiteinde (S-vorm): Soemers, bladveren.
 *  p.drive: "stiff" (uitwijking u vast gehouden) of "soft" (dwarskracht vast, u mag meegeven). */
export function leafSpring(p) {
  const E = eff(p), I = p.b * p.t ** 3 / 12;
  const cx = 12 * E * I / p.L ** 3;                       // = E b t³ / L³
  const cz0 = E * p.b * p.t / p.L;
  const comp0 = p.L / (E * p.b * p.t);                    // axiale meegeefbaarheid [mm/N]
  const compShape = p.u ** 2 * p.L / (700 * E * I);       // S-vorm verandert onder axiale last, u vast
  const compSoft = 3 * p.u ** 2 * p.L / (25 * E * I);     // (1,2·u/L)² / c_x: u mag meegeven onder F
  const czStiff = 1 / (comp0 + compShape);
  const czSoft = 1 / (comp0 + compShape + compSoft);
  const cz = p.drive === "soft" ? czSoft : czStiff;
  const uMax = p.sigma * p.L ** 2 / (3 * E * p.t);
  const sb = 3 * E * p.t * p.u / p.L ** 2, sa = Math.abs(p.F) / (p.b * p.t);
  const Pcr = PI ** 2 * E * I / p.L ** 2;
  const cxF = cx - 1.2 * p.F / p.L;                       // drukkracht F > 0 verlaagt de dwarsstijfheid
  return { E, I, cx, cxF, cz0, cz, czStiff, czSoft, dz: 0.6 * p.u ** 2 / p.L, uMax, sb, sa, sigma: sb + sa,
    Pcr, margin: margin(Pcr, Math.abs(p.F)), f: freqTrans(cx, p.m), force: cx * p.u,
    mLeaf: (p.rho || 0) * p.L * p.b * p.t * 1e-9 };
}

/** Parallelle bladveer: twee identieke bladen, geleide tafel. */
export function parallelLeaf(p) {
  const s = leafSpring(Object.assign({}, p, { F: p.F / 2 }));
  return { E: s.E, I: s.I, cx: 2 * s.cx, cxF: 2 * s.cxF, cz0: 2 * s.cz0, cz: 2 * s.cz, czStiff: 2 * s.czStiff, czSoft: 2 * s.czSoft,
    dz: s.dz, uMax: s.uMax,
    sb: s.sb, sa: s.sa, sigma: s.sigma, Pcr: 2 * s.Pcr, margin: margin(2 * s.Pcr, Math.abs(p.F)),
    f: freqTrans(2 * s.cx, p.m), force: 2 * s.cx * p.u };
}

/** Kruisveerscharnier, twee bladen, kruising op 50 %. phi in rad.
 *  De belastingafhankelijke stijfheid en de tweede-orde verschuiving van het draaipunt zijn niet berekend. */
export function crossPivot(p) {
  const E = eff(p), I = p.b * p.t ** 3 / 12;
  const c = 2 * E * I / p.L;                              // Nmm/rad (twee bladen, EI/L elk)
  const phiMax = 2 * p.sigma * p.L / (E * p.t);
  const sb = E * p.t * p.phi / (2 * p.L), sa = Math.abs(p.F) / (2 * p.b * p.t);
  return { E, I, c, phiMax, sb, sa, sigma: sb + sa, moment: c * p.phi, f: freqRot(c, p.m, p.r) };
}

/** Cirkelvormig inkepingsscharnier, Paros-Weisbord. phi in rad, Kt = spanningsconcentratie. */
export function notchHinge(p) {
  const E = eff(p);
  const c = 2 * E * p.b * p.t ** 2.5 / (9 * PI * Math.sqrt(p.R));
  const perRad = (4 / (3 * PI)) * E * Math.sqrt(p.t / p.R);   // nominale σ per rad
  const sNom = perRad * p.phi, sigma = p.Kt * sNom;
  return { E, c, perRad, sNom, sigma, phiMax: p.sigma / (p.Kt * perRad), moment: c * p.phi,
    ratio: p.t / (2 * p.R), f: freqRot(c, p.m, p.r) };
}

/** Draadflexure. bc "guided" (S-vorm, 12EI/L³) of "free" (ingeklemd/vrij, 3EI/L³). */
export function wireFlexure(p) {
  const E = p.E, A = PI * p.d ** 2 / 4, I = PI * p.d ** 4 / 64, g = p.bc === "guided";
  const cax = E * A / p.L, cb = (g ? 12 : 3) * E * I / p.L ** 3;
  const k = g ? 3 : 1.5;                                   // σ_b = k E d u / L²
  const uMax = p.sigma * p.L ** 2 / (k * E * p.d);
  const sb = k * E * p.d * p.u / p.L ** 2, sa = Math.abs(p.F) / A;
  const Pcr = PI ** 2 * E * I / ((g ? 1 : 2) * p.L) ** 2;
  return { A, I, cax, cb, uMax, sb, sa, sigma: sb + sa, Pcr, margin: margin(Pcr, Math.abs(p.F)),
    f: freqTrans(cb, p.m), fax: freqTrans(cax, p.m), force: cb * p.u };
}
