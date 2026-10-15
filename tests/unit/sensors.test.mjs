import test from "node:test";
import assert from "node:assert/strict";
import { computeFrf, frfVal } from "../../src/core/frf.js";
import { computeSweep } from "../../src/core/kinematics.js";
import { chVal, channels } from "../../src/core/channels.js";
import { model, sim } from "../../src/core/state.js";
import { massShift, seriesK, sensorMass, springK } from "../../src/core/sensors.js";
import { close, resetModel, run } from "./helpers.mjs";

// massa M (1 kg) op een veer k (10 N/mm); de veer zit op een platform B (0,1 g) dat via een krachtopnemer aan de wand hangt
//   W (vast) --[krachtopnemer k_s]-- B --[veer k]-- M, beide vrij langs x
const K = 10, KS = 50, MM_ = 1, MB = 1e-4;
function chain(extra = [], lc = {}) {
  return resetModel({
    nodes: [{ id: "W", x: 0, y: 0, support: "pin" }, { id: "B", x: 50, y: 0, support: "slider", dir: 0, m: MB },
            { id: "M", x: 100, y: 0, support: "slider", dir: 0, m: MM_ }],
    elems: [{ id: "LC", type: "loadcell", name: "LC1", a: "W", b: "B", len: 50, ks: KS, m: 0, ...lc },
            { id: "SP", type: "spring", a: "B", b: "M", k: K, L0: 50 },
            { id: "F", type: "force", node: "M", mag: 1, ang: 0 }, ...extra],
    mode: "frf"
  });
}
// kleinste eigenwaarde van [[k1+k2, -k2], [-k2, k2]] met M = diag(mB, mM)  (k in N/mm, m in kg -> N s2/mm)
function f1Exact(k1, k2, mB, mM) {
  const a = mB * mM * 1e-6, b = -(mB * k2 + mM * (k1 + k2)) * 1e-3, c = k1 * k2;
  const lam = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  return Math.sqrt(lam) / (2 * Math.PI);
}

test("seriestijfheid 1/k_tot = 1/k + 1/k_s", () => {
  close(seriesK(10, 50), 1 / (1 / 10 + 1 / 50), { rtol: 1e-12 });
  close(seriesK(10, 50), 8.3333333, { atol: 1e-6, label: "8,333 N/mm" });
  // de standaardstijfheid 100 N/um = 1e5 N/mm: bijna niets bij k = 10 N/mm
  close(seriesK(10, 1e5), 10, { rtol: 2e-4 });
  close(springK({ type: "loadcell" }), 1e5, { rtol: 0, label: "standaard k_s" });
});

test("krachtopnemer in serie verlaagt de eigenfrequentie (FRF) volgens de handberekening", () => {
  chain();
  const S = run(computeFrf());
  assert.ok(S, "FRF opgelost");
  const f1 = S.modes.find(m => m.f > 1e-6).f;
  close(f1, f1Exact(KS, K, MB, MM_), { rtol: 1e-4, label: "f1 exact 2x2" });
  const fSeries = Math.sqrt(seriesK(K, KS) * 1000 / MM_) / (2 * Math.PI), fRigid = Math.sqrt(K * 1000 / MM_) / (2 * Math.PI);
  close(fSeries, 14.5288, { atol: 1e-3, label: "f serie (getal)" });
  close(f1, fSeries, { rtol: 2e-3, label: "f1 ~ serie" });
  assert.ok(f1 < fRigid * 0.92, "de krachtopnemer verlaagt f met meer dan 8 %: " + f1 + " vs " + fRigid);
  // statisch: F = 1 N loopt door de opnemer, vervorming 1/k_s = 20 um
  const F = frfVal(S, "s|LC|F", 0), d = frfVal(S, "m|LC|d", 0), x = frfVal(S, "n|M|x", 0);
  close(F[0], 1, { rtol: 0.01, label: "F door opnemer" });
  close(d[0], 1000 / KS, { rtol: 0.01, label: "vervorming 20 um" });
  close(x[0], 1 / seriesK(K, KS), { rtol: 0.01, label: "x = F / k_serie" });
  // kanaal bestaat en staat bovenaan onder "Sensoren"
  const ch = channels();
  assert.equal(ch[0].g, "Sensoren"); assert.ok(ch.some(c => c.key === "m|LC|d"));
});

test("versnellingsopnemer: extra massa verschuift f met sqrt(m/(m+m_s)) en meet a", () => {
  chain([{ id: "AC", type: "accel", name: "AC1", node: "M", ang: 0, m: 0.5 }], { ks: 1e9 });     // stijve opnemer
  assert.equal(sensorMass("M"), 0.5);
  const S = run(computeFrf());
  const f1 = S.modes.find(m => m.f > 1e-6).f, f0 = Math.sqrt(K * 1000 / MM_) / (2 * Math.PI);
  close(f1 / f0, massShift(1, 0.5), { rtol: 2e-3, label: "f-verhouding" });
  close(massShift(1, 0.5), 0.8164966, { atol: 1e-6 });
  // laagfrequent: a = -w^2 x, in m/s2 per N: gelijk aan x (mm/N) * w^2 / 1000
  const z = frfVal(S, "m|AC|a", 0), x = frfVal(S, "n|M|x", 0), w = 2 * Math.PI * S.f[0];
  close(z[0], -w * w * x[0] / 1000, { rtol: 1e-6, label: "a = -w^2 x" });
  close(frfVal(S, "m|AC|g", 0)[0] * 9806.65, z[0] * 1000, { rtol: 1e-9, label: "g" });
});

test("kinematica: krachtopnemer is een stijve schakel, kracht uit de statica", () => {
  // kruk A-B (10 mm) met een krachtopnemer B-C naar een glijder C op de x-as; 20 N in +x op C
  resetModel({
    nodes: [{ id: "A", x: 0, y: 0, support: "pin" }, { id: "B", x: 0, y: 10 }, { id: "C", x: 30, y: 0, support: "slider", dir: 0 }],
    elems: [{ id: "cr", type: "link", a: "A", b: "B", len: 10, driver: true, theta0: 90, rpm: 60 },
            { id: "LC", type: "loadcell", name: "LC1", a: "B", b: "C", len: Math.hypot(30, 10), ks: 100, m: 0 },
            { id: "F", type: "force", node: "C", mag: 20, ang: 0 }],
    mode: "kin"
  });
  computeSweep();
  const S = sim.sweep; assert.ok(S, "sweep");
  const P = S.pos.B[0], Q = S.pos.C[0], L = Math.hypot(Q.x - P.x, Q.y - P.y);
  const Fn = chVal(S, "s|LC|F", 0);
  close(Math.abs(Fn) * Math.abs(Q.x - P.x) / L, 20, { rtol: 1e-6, label: "x-component = 20 N" });
  close(chVal(S, "m|LC|d", 0), Fn / 100 * 1000, { rtol: 1e-9, label: "delta = F/k_s in um" });
  model.mode = "dyn";
});
