import test from "node:test";
import assert from "node:assert/strict";
import { computeFrf, frfVal } from "../../src/core/frf.js";
import { close, resetModel, run } from "./helpers.mjs";

const g = 9.81;

test("FRF massa-veer op glijder: eigenfrequentie, demping en transmissibiliteit", () => {
  // k = 0.5 N/mm = 500 N/m, m = 1 kg: w = sqrt(k/m) = 22.36 rad/s -> f = 3.559 Hz
  // zeta = c / (2 sqrt(k m)) = 3 Ns/m / (2 sqrt(500)) = 0.0671 (c = 0.003 Ns/mm)
  const k = 500, m = 1, c = 3;
  resetModel({
    nodes: [
      { id: "A", x: 0, y: 0, support: "pin" },
      { id: "B", x: 100, y: 0, support: "slider", dir: 0, m: 1 },     // voet, door actuator verplaatst
      { id: "C", x: 200, y: 0, support: "slider", dir: 0, m }],
    elems: [
      { id: "act", type: "actuator", a: "A", b: "B", len: 100, min: 100, max: 100, freq: 0 },
      { id: "sp", type: "spring", a: "B", b: "C", k: 0.5, L0: 100 },
      { id: "dp", type: "damper", a: "B", b: "C", c: 0.003 }]
  });
  const S = run(computeFrf());
  assert.ok(S, "FRF opgelost");
  assert.equal(S.modes.length, 1);
  const w = Math.sqrt(k / m), zeta = c / (2 * Math.sqrt(k * m));
  close(S.modes[0].f, w / (2 * Math.PI), { rtol: 0.005, label: "f1" });
  close(S.modes[0].f, 3.559, { rtol: 0.005, label: "f1 (getal)" });
  close(S.modes[0].zeta, zeta, { rtol: 0.02, label: "zeta" });
  // laagfrequent: positie van de massa per mm actuator ~ 1
  const lo = frfVal(S, "n|C|x", 0);
  close(lo[0], 1, { rtol: 0.01, label: "laagfrequente winst" });
  // transmissibiliteit H = (k + i w c) / (k - m w² + i w c), overal op de frequentie-as
  for (const i of [0, 120, 180, 200, 250, 360]) {
    const om = 2 * Math.PI * S.f[i];
    const dr = k - m * om * om, di = om * c, nr = k, ni = om * c, den = dr * dr + di * di;
    const hr = (nr * dr + ni * di) / den, hi = (ni * dr - nr * di) / den;
    const [re, im] = frfVal(S, "n|C|x", i);
    close(re, hr, { rtol: 0.02, atol: 1e-3, label: `Re H(${S.f[i].toFixed(2)} Hz)` });
    close(im, hi, { rtol: 0.02, atol: 1e-3, label: `Im H(${S.f[i].toFixed(2)} Hz)` });
  }
});

test("FRF slinger L = 120 mm: f = sqrt(g/L)/(2π) = 1.439 Hz", () => {
  const L = 120;
  resetModel({
    gravity: true,
    nodes: [{ id: "P", x: 0, y: 0, support: "pin" }, { id: "Q", x: 0, y: -L, m: 1 }],
    elems: [{ id: "rod", type: "link", a: "P", b: "Q", len: L },
            { id: "F", type: "force", node: "Q", mag: 0, ang: 0 }]
  });
  const S = run(computeFrf());
  assert.ok(S && S.eqOK);
  assert.equal(S.modes.length, 1);
  close(S.modes[0].f, Math.sqrt(g / (L / 1000)) / (2 * Math.PI), { rtol: 0.01, label: "f" });
  close(S.modes[0].f, 1.439, { rtol: 0.01, label: "f (getal)" });
});
