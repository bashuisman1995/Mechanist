import test from "node:test";
import { leafSpring, parallelLeaf } from "../../src/calc/flexures.js";
import { material, MATERIALS } from "../../src/calc/materials.js";
import { close } from "./helpers.mjs";

// ---------- Rayleigh-Ritz: onafhankelijke afleiding van de steunstijfheid en c_x(F) ----------
// Geleide bladveer, L = 1, EI = 1, uitwijking u aan het vrije eind (eind blijft evenwijdig).
// Energie: Π(y) = ½∫y″² − F·s, s = ½∫y′² (axiale verkorting), F = axiale drukkracht.
// Basis: y = u(3ξ²−2ξ³) + Σ a_k ξ^(k+2)(1−ξ)² (voldoet aan alle randvoorwaarden).
const GL = (() => {                                      // Gauss-Legendre, 24 punten op [0,1]
  const n = 24, xs = [], ws = [];
  for (let i = 0; i < n; i++) {
    let x = Math.cos(Math.PI * (i + 0.75) / (n + 0.5)), dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1, p1 = x;
      for (let k = 2; k <= n; k++) { const p2 = ((2 * k - 1) * x * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; }
      dp = n * (x * p1 - p0) / (x * x - 1);
      const dx = p1 / dp; x -= dx; if (Math.abs(dx) < 1e-15) break;
    }
    xs.push((1 - x) / 2); ws.push(1 / ((1 - x * x) * dp * dp));
  }
  return { xs, ws };
})();
const integ = f => GL.xs.reduce((s, x, i) => s + GL.ws[i] * f(x), 0);
function basis(k) {                                      // ξ^(k+2)(1−ξ)² en afgeleiden
  const poly = []; poly[k + 2] = 1; poly[k + 3] = -2; poly[k + 4] = 1;
  const d = (c, n) => { for (let j = 0; j < n; j++) c = c.map((v, i) => (v ? i * v : 0)).slice(1); return c; };
  const ev = (c, x) => c.reduce((s, v, i) => s + (v || 0) * x ** i, 0);
  const c1 = d(poly, 1), c2 = d(poly, 2);
  return { d1: x => ev(c1, x), d2: x => ev(c2, x) };
}
const y0d1 = (u, x) => u * (6 * x - 6 * x * x), y0d2 = (u, x) => u * (6 - 12 * x);
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    for (let r = i + 1; r < n; r++) { const f = M[r][i] / M[i][i]; for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let c = i + 1; c < n; c++) s -= M[i][c] * x[c]; x[i] = s / M[i][i]; }
  return x;
}
/** Evenwicht bij vaste u en drukkracht F: s = axiale verkorting, W = Π in evenwicht. */
function ritz(u, F, N = 8) {
  const B = Array.from({ length: N }, (_, k) => basis(k));
  const A = B.map(bi => B.map(bj => integ(x => bi.d2(x) * bj.d2(x) - F * bi.d1(x) * bj.d1(x))));
  const rhs = B.map(bi => -integ(x => y0d2(u, x) * bi.d2(x) - F * y0d1(u, x) * bi.d1(x)));
  const a = solve(A, rhs);
  const y1 = x => y0d1(u, x) + a.reduce((s, ak, k) => s + ak * B[k].d1(x), 0);
  const y2 = x => y0d2(u, x) + a.reduce((s, ak, k) => s + ak * B[k].d2(x), 0);
  const s = 0.5 * integ(x => y1(x) ** 2);
  return { s, W: 0.5 * integ(x => y2(x) ** 2) - F * s };
}

test("steunstijfheid (u vast): numerieke afleiding geeft coëfficiënt 700", () => {
  const u = 1, h = 1e-3, dsdF = (ritz(u, h).s - ritz(u, -h).s) / (2 * h);   // extra meegeefbaarheid u²L/(c·EI)
  close(dsdF, u * u / 700, { rtol: 1e-5 });
  close(1 / dsdF, 700, { rtol: 1e-5 });
  close(ritz(u, 0).s, 0.6 * u * u, { rtol: 1e-10 });                         // 0,6·u²/L bij F = 0
  const L = 20, b = 10, t = 0.2, E = 210000, I = b * t ** 3 / 12;
  const r = leafSpring({ L, b, t, E, nu: 0.3, sigma: 300, F: 0, m: 0.1, u: 0.5, drive: "stiff" });
  close(1 / r.czStiff, L / (E * b * t) + (0.5 ** 2 * L / (E * I)) * dsdF, { rtol: 1e-5 });
});

test("steunstijfheid, zachte aandrijving: 3u²L/(25EI) uit koppelterm (1,2u/L)²/c_x", () => {
  const L = 20, b = 10, t = 0.2, E = 210000, I = b * t ** 3 / 12, u = 0.5;
  const p = { L, b, t, E, nu: 0.3, sigma: 300, F: 0, m: 0.1, u };
  const soft = leafSpring(Object.assign({ drive: "soft" }, p)), stiff = leafSpring(Object.assign({ drive: "stiff" }, p));
  const cx = 12 * E * I / L ** 3, n = 1.2 * u / L;
  close(1 / soft.czSoft - 1 / stiff.czStiff, n * n / cx, { rtol: 1e-9 });
  close(n * n / cx, 3 * u * u * L / (25 * E * I), { rtol: 1e-12 });
  close(soft.cz, soft.czSoft, { rtol: 1e-15 }); close(stiff.cz, stiff.czStiff, { rtol: 1e-15 });
  const h = 1e-4;                                                            // d(Δz)/du = 1,2u/L (L = 1)
  close((ritz(u + h, 0).s - ritz(u - h, 0).s) / (2 * h), 1.2 * u, { rtol: 1e-6 });
  if (!(soft.cz < stiff.cz)) throw new Error("zacht moet slapper zijn dan stijf");
  // c_z0/c_z = 1 + 1,44 (u/t)² + 12 u²/(700 t²)  (zacht)  → 21000/10,107 = 2078 N/mm
  close(soft.cz, 21000 / (1 + 1.44 * 6.25 + 12 / 700 * 6.25), { rtol: 1e-9 });
  close(stiff.cz, 21000 / (1 + 12 / 700 * 6.25), { rtol: 1e-9 });
});

test("c_x(F) = 12EI/L³ − 1,2F/L: eerste orde in F uit Ritz", () => {
  const u = 1, h = 1e-3, c = F => 2 * ritz(u, F).W / (u * u);                // L = 1, EI = 1
  close(c(0), 12, { rtol: 1e-9 });
  close((c(h) - c(-h)) / (2 * h), -1.2, { rtol: 1e-5 });
  const p = { L: 20, b: 10, t: 0.2, E: 210000, nu: 0.3, sigma: 300, m: 0.1, u: 0.5 };
  close(leafSpring(Object.assign({ F: 1 }, p)).cxF, 2.1 - 1.2 / 20, { rtol: 1e-12 });
  close(leafSpring(Object.assign({ F: 0 }, p)).cxF, 2.1, { rtol: 1e-12 });
  close(parallelLeaf(Object.assign({ F: 2 }, p)).cxF, 2 * (2.1 - 1.2 / 20), { rtol: 1e-12 });
});

test("materialen: alpha, rho, bron; brons/CuBe gesplitst", () => {
  for (const m of MATERIALS) {
    if (!(m.alpha > 0 && m.rho > 1000 && m.E > 1e4 && m.sigma > 0 && m.bron)) throw new Error("onvolledig: " + m.id);
  }
  if (MATERIALS.some(m => /Brons \/ CuBe/.test(m.naam))) throw new Error("niet gesplitst");
  if (!MATERIALS.some(m => /CuBe2/.test(m.naam)) || !MATERIALS.some(m => /Phosphor bronze/.test(m.naam))) throw new Error("CuBe2/fosforbrons ontbreken");
  close(material("cube").alpha, 17.0, { atol: 1 }); close(material("invar").alpha, 1.2, { atol: 0.3 });
  close(material("fbrons").E, 110000, { rtol: 0.1 });
});
