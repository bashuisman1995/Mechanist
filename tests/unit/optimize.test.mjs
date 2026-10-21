// Tests van de optimaliseerder: Rosenbrock met grenzen, een beperkt probleem met handberekend optimum,
// discreet + continu, onhaalbaar, stoppen en geschiedenis.
import test from "node:test";
import assert from "node:assert/strict";
import { optimize, optimizeGen, sensitivity, lhs } from "../../src/core/optimize.js";
import { leafSpring } from "../../src/calc/flexures.js";
import { MATERIALS, material } from "../../src/calc/materials.js";

test("Rosenbrock met grenzen vindt (1, 1)", () => {
  const r = optimize({
    vars: [{ name: "x", min: -2, max: 2, x0: -1.2 }, { name: "y", min: -2, max: 2, x0: 1 }],
    objective: x => (1 - x[0]) ** 2 + 100 * (x[1] - x[0] ** 2) ** 2, maxEval: 6000
  });
  assert.ok(r.feasible);
  assert.ok(r.f < 1e-6, "f = " + r.f);
  assert.ok(Math.abs(r.x[0] - 1) < 2e-3 && Math.abs(r.x[1] - 1) < 4e-3, r.x.join());
  assert.equal(r.history.length, r.evals);
});

test("Rosenbrock: grens maakt het optimum anders (x <= 0,5)", () => {
  // met x in [-2, 0,5] ligt het optimum op de rand x = 0,5, y = x^2 = 0,25, f = 0,25
  const r = optimize({
    vars: [{ name: "x", min: -2, max: 0.5 }, { name: "y", min: -2, max: 2 }],
    objective: x => (1 - x[0]) ** 2 + 100 * (x[1] - x[0] ** 2) ** 2, maxEval: 6000
  });
  assert.ok(Math.abs(r.x[0] - 0.5) < 1e-3, r.x.join());
  assert.ok(Math.abs(r.f - 0.25) < 2e-3, "f = " + r.f);
  assert.deepEqual(r.activeBounds.map(b => b.name + b.bound), ["xmax"]);
});

test("golden snede met één logaritmische variabele", () => {
  const r = optimize({ vars: [{ name: "a", min: 0.01, max: 100, log: true }], objective: x => (Math.log(x[0]) - Math.log(0.37)) ** 2 });
  assert.ok(Math.abs(r.x[0] - 0.37) / 0.37 < 1e-6, String(r.x[0]));
  assert.ok(r.evals < 120, "evals " + r.evals);
});

// bladveer: maximaliseer u_max = sigma L^2 / (3 E t) onder c_x = E b t^3 / L^3 >= c_min en L <= L_max
// (een bovengrens op c_x zou nooit actief zijn: u_max groeit juist als t kleiner wordt)
const E = 210000, b = 10, sigma = 300;
const leaf = (L, t) => leafSpring({ L, b, t, u: 0, F: 0, m: 0.1, E, nu: 0.3, sigma, drive: "stiff" });
test("bladveer: maximale uitwijking onder cx >= cmin en L <= Lmax (beide actief)", () => {
  const cmax = 0.5, Lmax = 120;   // cmax is hier de ondergrens c_min
  const r = optimize({
    vars: [{ name: "L", min: 5, max: 200, log: true, x0: 40 }, { name: "t", min: 0.02, max: 2, log: true, x0: 0.3 }],
    objective: x => leaf(x[0], x[1]).uMax, sense: "max",
    constraints: [
      { name: "cx", label: "c_x ≥ " + cmax, g: x => cmax - leaf(x[0], x[1]).cx, scale: cmax },
      { name: "L", label: "L ≤ " + Lmax, g: x => x[0] - Lmax, scale: Lmax }
    ], maxEval: 4000
  });
  const tH = Math.cbrt(cmax * Lmax ** 3 / (E * b));          // handberekening: L = Lmax, t uit c_x
  const uH = sigma * Lmax ** 2 / (3 * E * tH);
  assert.ok(r.feasible);
  assert.ok(Math.abs(r.x[0] - Lmax) / Lmax < 5e-3, "L = " + r.x[0]);
  assert.ok(Math.abs(r.x[1] - tH) / tH < 5e-3, "t = " + r.x[1] + " verwacht " + tH);
  assert.ok(Math.abs(r.f - uH) / uH < 5e-3, "u_max = " + r.f + " verwacht " + uH);
  assert.deepEqual(r.active.map(a => a.name).sort(), ["L", "cx"]);
  assert.ok(r.g.every(g => g <= 1e-9), "echt toelaatbaar: " + r.g);
});

test("discrete materiaalkeuze + continue lengte en dikte", () => {
  const cmax = 0.5, L = 100;
  const r = optimize({
    vars: [{ name: "t", min: 0.02, max: 3, log: true }],
    discrete: [{ name: "mat", options: MATERIALS.map(m => m.id) }],
    objective: (x, d) => { const m = material(d[0]); return m.sigma * L * L / (3 * m.E * x[0]); }, sense: "max",
    constraints: [{ name: "cx", g: (x, d) => cmax - material(d[0]).E * b * x[0] ** 3 / L ** 3, scale: cmax }],
    maxEval: 4000
  });
  // brute force: u ~ sigma / E^(2/3); t uit c_x
  let best = null;
  for (const m of MATERIALS) {
    const t = Math.cbrt(cmax * L ** 3 / (m.E * b)), u = m.sigma * L * L / (3 * m.E * t);
    if (!best || u > best.u) best = { id: m.id, u };
  }
  assert.equal(r.d[0], best.id);
  assert.ok(Math.abs(r.f - best.u) / best.u < 5e-3);
  assert.equal(r.combos.length, MATERIALS.length);
});

test("onhaalbaar probleem wordt als onhaalbaar gemeld", () => {
  const r = optimize({
    vars: [{ name: "x", min: 0, max: 1 }, { name: "y", min: 0, max: 1 }],
    objective: x => x[0] + x[1],
    constraints: [{ name: "te groot", label: "x + y ≥ 5", g: x => 5 - x[0] - x[1] }], maxEval: 600
  });
  assert.equal(r.feasible, false);
  assert.ok(/feasible/.test(r.reason));
  assert.ok(r.history.every(h => !h.feasible));
});

test("doel = waarde (target) en Stop", () => {
  const r = optimize({ vars: [{ name: "x", min: 0, max: 10 }, { name: "y", min: 0, max: 10 }], objective: x => x[0] * x[1], sense: "target", target: 12, maxEval: 3000 });
  assert.ok(Math.abs(r.f - 12) < 1e-4, String(r.f));
  let n = 0;
  const g = optimizeGen({ vars: [{ name: "x", min: -5, max: 5 }, { name: "y", min: -5, max: 5 }], objective: x => x[0] ** 2 + x[1] ** 2, maxEval: 5000, shouldStop: () => ++n > 30 });
  let s; for (;;) { s = g.next(); if (s.done) break; }
  assert.equal(s.value.stopped, true);
  assert.ok(s.value.evals < 60);
  assert.equal(s.value.reason, "stopped");
});

test("herhaalbaar (vaste zaadwaarde) en gevoeligheid", () => {
  const o = { vars: [{ name: "x", min: -3, max: 3 }, { name: "y", min: -3, max: 3 }], objective: x => Math.sin(3 * x[0]) + x[0] * x[0] / 4 + (x[1] - 1) ** 2, maxEval: 1500 };
  const a = optimize(o), c = optimize(o);
  assert.deepEqual(a.x, c.x);
  assert.equal(lhs(2, 4, 1).length, 4);
  // c_x ~ t^3 / L^3 : +1 % L geeft ongeveer -3 % c_x
  const s = sensitivity([{ name: "L", min: 5, max: 200 }, { name: "t", min: 0.02, max: 2 }], [50, 0.5], x => ({ cx: leaf(x[0], x[1]).cx }), 0.01);
  assert.ok(Math.abs(s.L.cx.pct + 2.97) < 0.05, String(s.L.cx.pct));
  assert.ok(Math.abs(s.t.cx.pct - 3.03) < 0.05, String(s.t.cx.pct));
});
