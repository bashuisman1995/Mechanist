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

/**
 * Thermisch centrum van een stijve plaat op drie steunen (2D). Elke steun i staat op (x, y) [mm] en laat de plaat
 * vrij schuiven langs de hoek th [°]; loodrecht daarop (n_i) is hij stijf. Bij uniforme uitzetting van de plaat ten
 * opzichte van de basis, relatieve rek δ = (α_plaat − α_basis)·ΔT, verplaatst een plaatpunt p zich (ten opzichte van de
 * basis) over d(p) = u + θ·J·p + δ·p (J = draaiing over 90°, kleine rotatie θ). Steun i laat alleen beweging langs
 * zijn vrije richting toe: n_i·d(x_i) = 0, drie lineaire vergelijkingen in (u_x, u_y, θ). Alles is evenredig met δ,
 * dus hieronder per eenheid δ (u', θ'). Het thermisch centrum is het punt zonder verplaatsing: d(c) = 0.
 * Snijden de drie lijnen langs de vrije richtingen in één punt c, dan is θ' = 0 en zet de plaat uit rond c (zuivere
 * schaling). Anders draait de plaat mee (θ = θ'·δ) en ligt c bij het draaicentrum van de (schaal + draai)-beweging.
 * Snijden de drie stijve richtingen (lijnen langs n_i) in één punt of lopen ze evenwijdig, dan is de matrix singulier:
 * de plaat is dan niet bepaald (kan om dat punt vrij draaien of schuiven).
 */
export function thermalCentre(sup) {
  const DEG = Math.PI / 180;
  const s = sup.map(q => { const t = q.th * DEG; return { x: q.x, y: q.y, dx: Math.cos(t), dy: Math.sin(t), nx: -Math.sin(t), ny: Math.cos(t) }; });
  const L = Math.max(1, Math.max.apply(null, s.map(q => Math.hypot(q.x, q.y))));
  // onbekenden w = [u_x, u_y, L·θ]; rij i: n_i·u + θ·n_i·(J·x_i) = −n_i·x_i
  const A = s.map(q => [q.nx, q.ny, (-q.nx * q.y + q.ny * q.x) / L]), b = s.map(q => -(q.nx * q.x + q.ny * q.y));
  const det3 = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const det = det3(A);
  const out = { L, det, singular: !(Math.abs(det) > 1e-9), ill: false, lines: s };
  // kleinste-kwadraten snijpunt van de lijnen langs de vrije richtingen (voor het residu)
  let m11 = 0, m12 = 0, m22 = 0, r1 = 0, r2 = 0;
  s.forEach(q => { const k = q.nx * q.x + q.ny * q.y; m11 += q.nx * q.nx; m12 += q.nx * q.ny; m22 += q.ny * q.ny; r1 += q.nx * k; r2 += q.ny * k; });
  const dm = m11 * m22 - m12 * m12;
  out.cLS = Math.abs(dm) > 1e-12 ? { x: (r1 * m22 - r2 * m12) / dm, y: (m11 * r2 - m12 * r1) / dm } : null;
  out.resid = out.cLS ? Math.max.apply(null, s.map(q => Math.abs(q.nx * (out.cLS.x - q.x) + q.ny * (out.cLS.y - q.y)))) : Infinity;
  out.concurrent = out.resid <= 1e-4 * L;
  if (out.singular) { out.ill = true; return out; }
  const w = [0, 1, 2].map(j => det3(A.map((r, k) => r.map((v, c) => (c === j ? b[k] : v)))) / det);
  out.ill = Math.abs(det) < 0.02;                                  // bijna singulier: de plaat reageert zeer gevoelig
  out.u = { x: w[0], y: w[1] }; out.theta = w[2] / L;              // per eenheid δ
  const k = 1 / (1 + out.theta * out.theta);
  out.c = { x: -k * (out.u.x + out.theta * out.u.y), y: -k * (-out.theta * out.u.x + out.u.y) };
  /** verplaatsing van plaatpunt p ten opzichte van de basis, per eenheid δ (mm per mm) */
  out.disp = p => ({ x: out.u.x - out.theta * p.y + p.x, y: out.u.y + out.theta * p.x + p.y });
  out.slide = s.map(q => { const d = out.disp(q); return d.x * q.dx + d.y * q.dy; });          // schuifweg langs de vrije richting
  out.side = s.map(q => { const d = out.disp(q); return d.x * q.nx + d.y * q.ny; });           // moet 0 zijn (de steun houdt dit vast)
  return out;
}
