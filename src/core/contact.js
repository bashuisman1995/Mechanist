import { sim, ui } from "./state.js";
import { t } from "../ui/i18n.js";
// Contact: bal op vlak (Hertz) met Mindlin-achtige plak/slip-wrijving (zonder DOM).
//   Normaal:   F_n = 4/3·E*·√R·δ^(3/2)  (+ kleine demping, Hunt-Crossley)
//   Tangentiaal: borstel z met k_t = 8·G*·a, begrensd op μ·F_n (elasto-plastisch: plakken tot de grens, dan slip)
// Eenheden: mm, N, MPa (= N/mm²), s.
export const MATERIALS = {
  staal:    { E: 210000, nu: 0.30 },
  rvs:      { E: 193000, nu: 0.29 },
  alu:      { E: 70000,  nu: 0.33 },
  keramiek: { E: 310000, nu: 0.27 },
  hardmetaal: { E: 600000, nu: 0.22 }
};
// weergavenaam volgt de gekozen taal (sleutels blijven zoals ze in opgeslagen modellen staan)
Object.keys(MATERIALS).forEach(k => Object.defineProperty(MATERIALS[k], "nm", { get() { return t("cmat." + k); }, enumerable: false }));
export const mat = k => MATERIALS[k] || MATERIALS.staal;
export const eStar = (k1, k2) => { const a = mat(k1), b = mat(k2); return 1 / ((1 - a.nu * a.nu) / a.E + (1 - b.nu * b.nu) / b.E); };
export const gStar = (k1, k2) => {
  const a = mat(k1), b = mat(k2), Ga = a.E / (2 * (1 + a.nu)), Gb = b.E / (2 * (1 + b.nu));
  return 1 / ((2 - a.nu) / Ga + (2 - b.nu) / Gb);
};
// uitkomst van de laatst doorgerekende dynamica op het getoonde beeld (of null)
export function liveContact(e) {
  const S = sim.sweep;
  return S && S.dyn && S.C && S.C[e.id] ? S.C[e.id][ui.frame] || null : null;
}
export const contactDefaults = () => ({ R: 5, m1: "staal", m2: "staal", mu: 0.15, chi: 0.02, ang: 0 });

// statische Hertz-grootheden bij indringing delta (mm)
export function hertz(e, delta) {
  const R = Math.max(1e-6, e.R || 5), Es = eStar(e.m1, e.m2), Gs = gStar(e.m1, e.m2);
  if (!(delta > 0)) return { Fn: 0, a: 0, kn: 0, kt: 0, Es, Gs };
  const a = Math.sqrt(R * delta);
  return { Fn: 4 / 3 * Es * Math.sqrt(R) * Math.pow(delta, 1.5), a, kn: 2 * Es * a, kt: 8 * Gs * a, Es, Gs };
}
// omgekeerd: indringing bij normaalkracht F
export function deltaFor(e, F) {
  const R = Math.max(1e-6, e.R || 5);
  return Math.pow(3 * F / (4 * eStar(e.m1, e.m2) * Math.sqrt(R)), 2 / 3);
}
// potentiële energie (N·mm): 8/15·E*·√R·δ^(5/2)
export function contactPot(e, p) {
  const f = frame(e, p);
  return f.delta > 0 ? 8 / 15 * eStar(e.m1, e.m2) * Math.sqrt(Math.max(1e-6, e.R || 5)) * Math.pow(f.delta, 2.5) : 0;
}
// vlak: lijn door (ax, ay) met richting ang; normaal n = (−sin, cos) wijst naar de kant van de bal
export function frame(e, p) {
  const th = (e.ang || 0) * Math.PI / 180, tx = Math.cos(th), ty = Math.sin(th), nx = -ty, ny = tx;
  const d = (p.x - e.ax) * nx + (p.y - e.ay) * ny;
  return { tx, ty, nx, ny, d, delta: (e.R || 5) - d, fx: p.x - d * nx, fy: p.y - d * ny };
}
/* Kracht op het balmiddelpunt p (snelheid v, borstelverplaatsing z).
   Geeft ook dz (verloop van z): z loopt mee met de tangentiële snelheid tot |k_t·z| = μ·F_n, dan slipt het. */
export function contactForce(e, p, v, z) {
  const f = frame(e, p), out = { open: !(f.delta > 0), delta: f.delta, Fn: 0, Ft: 0, a: 0, kn: 0, kt: 0, zmax: 0,
    z: 0, slip: false, dz: 0, fx: 0, fy: 0, nx: f.nx, ny: f.ny, tx: f.tx, ty: f.ty };
  if (out.open) return out;
  const h = hertz(e, f.delta), chi = e.chi === undefined ? 0.02 : e.chi, mu = e.mu === undefined ? 0.15 : e.mu;
  const vn = v.x * f.nx + v.y * f.ny, vt = v.x * f.tx + v.y * f.ty;
  const Fn = Math.max(0, h.Fn * (1 - chi * vn));
  out.Fn = Fn; out.a = h.a; out.kn = h.kn; out.kt = h.kt;
  if (!(Fn > 0)) { out.open = true; return out; }
  const zmax = mu * Fn / h.kt, zc = Math.max(-zmax, Math.min(zmax, z || 0));
  out.zmax = zmax; out.z = zc;
  const lim = mu * Fn;
  out.Ft = Math.max(-lim, Math.min(lim, -(h.kt * zc + chi * Fn * vt)));
  out.slip = Math.abs(zc) >= zmax * (1 - 1e-9) && zc * vt > 0;
  out.dz = out.slip ? 0 : vt;
  out.fx = Fn * f.nx + out.Ft * f.tx; out.fy = Fn * f.ny + out.Ft * f.ty;
  return out;
}
