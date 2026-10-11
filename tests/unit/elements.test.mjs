import test from "node:test";
import assert from "node:assert/strict";
import { actLen, gapForce, gapPen } from "../../src/core/elements.js";
import { close } from "./helpers.mjs";

test("actLen: sinus tussen min en max, start op getekende lengte", () => {
  // min 50, max 150 -> Lm = 100, La = 50. Getekend 70: sin(ph0) = (70-100)/50 = -0.6
  const e = { min: 50, max: 150, freq: 2, len: 70 }, w = 4 * Math.PI;
  const a0 = actLen(e, 0);
  close(a0.L, 70, { atol: 1e-12 });
  assert.ok(a0.Ld > 0, "schuift uit op t = 0");
  close(a0.Ld, 50 * w * Math.sqrt(1 - 0.36), { rtol: 1e-12 });   // La·w·cos(ph0) met cos = 0.8
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i <= 1000; i++) { const L = actLen(e, i / 1000).L; lo = Math.min(lo, L); hi = Math.max(hi, L); }
  close(lo, 50, { atol: 1e-3 }); close(hi, 150, { atol: 1e-3 });
  assert.ok(lo >= 50 - 1e-9 && hi <= 150 + 1e-9);
});

test("actLen: len = middelpunt geeft L = 100 + 50 sin(2π f t)", () => {
  const e = { min: 50, max: 150, freq: 0.5, len: 100 };
  for (const t of [0, 0.3, 0.5, 1.7]) {
    close(actLen(e, t).L, 100 + 50 * Math.sin(Math.PI * t), { atol: 1e-9, label: "L(" + t + ")" });
    close(actLen(e, t).Ld, 50 * Math.PI * Math.cos(Math.PI * t), { atol: 1e-9, label: "Ld(" + t + ")" });
  }
});

test("actLen: Ld = dL/dt en Ldd = dLd/dt (eindige differentie)", () => {
  const e = { min: 40, max: 120, freq: 1.3, len: 55 }, h = 1e-6;
  for (const t of [0, 0.1, 0.37, 0.8]) {
    close(actLen(e, t).Ld, (actLen(e, t + h).L - actLen(e, t - h).L) / (2 * h), { rtol: 1e-6, atol: 1e-6, label: "Ld" });
    close(actLen(e, t).Ldd, (actLen(e, t + h).Ld - actLen(e, t - h).Ld) / (2 * h), { rtol: 1e-6, atol: 1e-5, label: "Ldd" });
  }
});

test("actLen: freq 0 of min=max geeft constante lengte", () => {
  assert.deepEqual(actLen({ min: 10, max: 20, freq: 0, len: 12 }, 3), { L: 12, Ld: 0, Ldd: 0 });
  assert.deepEqual(actLen({ min: 10, max: 10, freq: 2, len: 10 }, 3), { L: 10, Ld: 0, Ldd: 0 });
});

test("gapForce: nul binnen het bereik, kc*indringing erbuiten, trekt nooit", () => {
  const e = { min: 10, max: 20, kc: 100, cc: 2 };
  assert.equal(gapForce(e, 10, 0), 0);
  assert.equal(gapForce(e, 15, 500), 0);
  assert.equal(gapForce(e, 20, -500), 0);
  close(gapForce(e, 8, 0), 100 * (8 - 10), { atol: 1e-12 });       // -200 N (duwt uit elkaar)
  close(gapForce(e, 25, 0), 100 * (25 - 20), { atol: 1e-12 });     // +500 N
  close(gapForce(e, 25, 10), 100 * 5 + 2 * 10, { atol: 1e-12 });   // met demping
  // snel terugtrekkend: demping zou kunnen aantrekken -> begrensd op 0
  assert.equal(gapForce(e, 25, -1000), 0);     // 500 - 2000 < 0
  assert.equal(gapForce(e, 8, 1000), 0);       // -200 + 2000 > 0
  // min/max verwisseld
  close(gapForce({ min: 20, max: 10, kc: 100 }, 25, 0), 500, { atol: 1e-12 });
  for (let L = 0; L < 40; L += 0.5) for (const Ld of [-1e3, 0, 1e3]) {
    const F = gapForce(e, L, Ld);
    if (L < 10) assert.ok(F <= 0); else if (L > 20) assert.ok(F >= 0); else assert.equal(F, 0);
  }
});

test("gapPen: indringing met teken", () => {
  const e = { min: 10, max: 20 };
  assert.equal(gapPen(e, 15), 0);
  assert.equal(gapPen(e, 7), -3);
  assert.equal(gapPen(e, 26), 6);
});
