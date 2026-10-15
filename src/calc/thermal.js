// Thermische uitzetting en lumped tijdconstante. Puur, zonder DOM. Eenheden: mm, K, kg, s, W; alpha in µm/(m·K).
/** Lengteverandering [mm] van een staaf L [mm] bij temperatuurstap dT [K]. */
export const dLength = (alpha, L, dT) => alpha * 1e-6 * L * dT;

/** Twee materialen in tegengestelde richting: punt P ligt op L2 − L1 van A (staaf 2 van A naar B, staaf 1 van B terug naar P). */
export function athermal({ a1, L1, a2, L2, dT, E1, E2 }) {
  const d1 = dLength(a1, L1, dT), d2 = dLength(a2, L2, dT);
  return { d1, d2, dP: d2 - d1, L2ath: L1 * a1 / a2, Lnet: L2 - L1,
    s1: E1 * a1 * 1e-6 * Math.abs(dT), s2: E2 * a2 * 1e-6 * Math.abs(dT) };       // ingeklemde thermische spanning [MPa]
}

/** Lumped warmtecapaciteit van een blok L×B×H [mm]. h [W/(m²K)], c [J/(kg K)], rho [kg/m³], k [W/(m K)], P [W]. */
export function lumped({ L, B, H, rho, c, h, k, P }) {
  const V = L * B * H * 1e-9, A = 2 * (L * B + L * H + B * H) * 1e-6, m = rho * V, C = m * c;
  return { V, A, m, C, tau: C / (h * A), Lc: V / A, Bi: h * (V / A) / k, dTss: P / (h * A) };
}
