import test from "node:test";
import assert from "node:assert/strict";
import { gauss, cholesky, congruence, jacobiEig, backSubT, lsq } from "../../src/core/linalg.js";
import { close } from "./helpers.mjs";

test("gauss lost een 3x3 stelsel op", () => {
  // 2x + y - z = 8 ; -3x - y + 2z = -11 ; -2x + y + 2z = -3  ->  x=2, y=3, z=-1
  const A = [[2, 1, -1, 8], [-3, -1, 2, -11], [-2, 1, 2, -3]];
  const x = gauss(A, 3);
  [2, 3, -1].forEach((v, i) => close(x[i], v, { atol: 1e-12, label: "x" + i }));
});

test("gauss geeft null bij singulier stelsel", () => {
  assert.equal(gauss([[1, 2, 3], [2, 4, 6]], 2), null);
});

test("cholesky + congruence + jacobiEig geven bekende eigenwaarden", () => {
  // K = [[2,-1,0],[-1,2,-1],[0,-1,2]]: eigenwaarden 2-sqrt2, 2, 2+sqrt2 (2 - 2cos(kπ/4))
  const K = [[2, -1, 0], [-1, 2, -1], [0, -1, 2]];
  const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const Lc = cholesky(I);
  const ev = jacobiEig(congruence(Lc, K)).map(e => e.val).sort((a, b) => a - b);
  const exp = [2 - Math.SQRT2, 2, 2 + Math.SQRT2];
  exp.forEach((v, i) => close(ev[i], v, { atol: 1e-10, label: "lambda" + i }));
});

test("cholesky: L L^T = M en gegeneraliseerd eigenprobleem K y = lambda M y", () => {
  // M = diag(1,2,4) -> eigenwaarden van M^-1 K via L^-1 K L^-T; spoor = sum(K_ii/M_ii) = 2+1+0.5
  const M = [[1, 0, 0], [0, 2, 0], [0, 0, 4]];
  const K = [[2, -1, 0], [-1, 2, -1], [0, -1, 2]];
  const L = cholesky(M);
  [1, Math.SQRT2, 2].forEach((v, i) => close(L[i][i], v, { atol: 1e-12 }));
  const ev = jacobiEig(congruence(L, K));
  close(ev.reduce((s, e) => s + e.val, 0), 3.5, { atol: 1e-10, label: "spoor" });
  // elke eigenvector y = L^-T v voldoet aan K y = lambda M y
  for (const { val, vec } of ev) {
    const y = backSubT(L, vec);
    for (let i = 0; i < 3; i++) {
      let Ky = 0; for (let j = 0; j < 3; j++) Ky += K[i][j] * y[j];
      close(Ky, val * M[i][i] * y[i], { atol: 1e-9, label: "K y = lambda M y" });
    }
  }
});

test("cholesky geeft null bij niet-positief-definiete matrix", () => {
  assert.equal(cholesky([[1, 2], [2, 1]]), null);
});

test("lsq geeft de minimum-norm oplossing", () => {
  // x + y = 2 -> minimum norm (1,1)
  const x = lsq([Float64Array.from([1, 1])], [2], 2);
  close(x[0], 1, { atol: 1e-6 }); close(x[1], 1, { atol: 1e-6 });
});
