import test from "node:test";
import assert from "node:assert/strict";
import { computeSweep, mobility } from "../../src/core/kinematics.js";
import { sim } from "../../src/core/state.js";
import { close, resetModel } from "./helpers.mjs";

const r = 30, l = 100;
const sliderCrank = () => resetModel({
  nodes: [
    { id: "A", x: 0, y: 0, support: "pin" },
    { id: "B", x: r, y: 0 },
    { id: "C", x: r + l, y: 0, support: "slider", dir: 0 }],
  elems: [
    { id: "crank", type: "link", a: "A", b: "B", len: r, driver: true, rpm: 60, cw: false, theta0: 0 },
    { id: "rod", type: "link", a: "B", b: "C", len: l }]
});

test("schuifkruk: positie van de glijder volgt x = r cos(th) + sqrt(l^2 - r^2 sin^2(th))", () => {
  sliderCrank();
  computeSweep();
  const S = sim.sweep;
  assert.ok(S, "sweep bestaat");
  close(S.dur, 1, { atol: 1e-12 });   // 60 rpm -> 1 s per omwenteling
  for (const i of [0, 30, 60, 90, 135, 180, 225, 270, 300, 359, 360]) {
    const th = 2 * Math.PI * S.t[i] / S.dur;   // 60 rpm = 2π rad/s
    const x = r * Math.cos(th) + Math.sqrt(l * l - r * r * Math.sin(th) ** 2);
    assert.ok(S.ok[i]);
    close(S.pos.C[i].x, x, { atol: 1e-6, label: `x_C(frame ${i})` });
    close(S.pos.C[i].y, 0, { atol: 1e-6, label: `y_C(frame ${i})` });
    close(S.pos.B[i].x, r * Math.cos(th), { atol: 1e-6, label: `x_B(frame ${i})` });
  }
});

test("schuifkruk: glijdersnelheid komt overeen met dx/dt van de formule en eindige differentie", () => {
  sliderCrank();
  computeSweep();
  const S = sim.sweep, w = 2 * Math.PI;     // rad/s
  const xf = t => { const th = w * t; return r * Math.cos(th) + Math.sqrt(l * l - r * r * Math.sin(th) ** 2); };
  const h = 1e-5;
  for (const i of [10, 45, 90, 150, 200, 260, 330]) {
    const t = S.t[i];
    // analytisch (centrale differentie met zeer kleine stap) en uit de solver
    close(S.vel.C[i].x, (xf(t + h) - xf(t - h)) / (2 * h), { atol: 1e-3, label: `v analytisch frame ${i}` });
    // eindige differentie over de frames (stap 1/360 s): orde dt² fout
    const fd = (S.pos.C[i + 1].x - S.pos.C[i - 1].x) / (S.t[i + 1] - S.t[i - 1]);
    close(S.vel.C[i].x, fd, { atol: 0.05, label: `v frame-differentie ${i}` });
  }
});

const fourBar = driver => resetModel({
  nodes: [
    { id: "A", x: 0, y: 0, support: "pin" }, { id: "D", x: 100, y: 0, support: "pin" },
    { id: "B", x: 0, y: 30 }, { id: "C", x: 100, y: 80 }],
  elems: [
    { id: "ab", type: "link", a: "A", b: "B", len: 30, driver, rpm: 10 },
    { id: "bc", type: "link", a: "B", b: "C", len: Math.hypot(100, 50) },
    { id: "dc", type: "link", a: "D", b: "C", len: 80 }]
});

test("mobiliteit (Grubler): vierstangen met kruk dofDriven=0, zonder kruk dof=1", () => {
  // onbekenden 2*2 vrije knopen = 4, beperkingen 3 stangen -> dof = 1; kruk neemt de laatste weg
  fourBar(true);
  let m = mobility();
  assert.equal(m.unknowns, 4); assert.equal(m.cons, 3);
  assert.equal(m.dof, 1); assert.equal(m.dofDriven, 0);
  fourBar(false);
  m = mobility();
  assert.equal(m.dof, 1); assert.equal(m.dofDriven, 1); assert.equal(m.driver, 0);
});

test("quasi-statisch: tweekrachtenstaaf draagt hangende massa, reactie = m g", () => {
  // B (m = 1 kg) hangt aan horizontale staaf AB (A scharnier) en aan schuine actuator-staaf DB (D=(0,100)).
  // Verticaal: N_DB/sqrt2 = m g ; horizontaal: N_AB = N_DB/sqrt2 -> |N_AB| = m g, |N_DB| = sqrt2 m g.
  // Reactie in A is horizontaal m g, in D: (m g, m g) (alleen D draagt verticaal).
  const m = 1, g = 9.81;
  resetModel({
    gravity: true,
    nodes: [{ id: "A", x: 0, y: 0, support: "pin" }, { id: "D", x: 0, y: 100, support: "pin" },
            { id: "B", x: 100, y: 0, m }],
    elems: [{ type: "link", id: "ab", a: "A", b: "B", len: 100 },
            { type: "actuator", id: "db", a: "D", b: "B", len: Math.hypot(100, 100), min: Math.hypot(100, 100), max: Math.hypot(100, 100), freq: 0 }]
  });
  computeSweep();
  const S = sim.sweep;
  assert.ok(S && S.stat, "statica opgelost");
  for (const i of [0, 100]) {
    close(Math.abs(S.N.ab[i]), m * g, { rtol: 1e-9, label: "staafkracht AB" });
    close(Math.abs(S.N.db[i]), Math.SQRT2 * m * g, { rtol: 1e-9, label: "staafkracht DB" });
    close(Math.abs(S.R.A[i].x), m * g, { rtol: 1e-9, label: "reactie A" });
    close(S.R.A[i].y, 0, { atol: 1e-9 });
    close(S.R.D[i].y, m * g, { rtol: 1e-9, label: "verticale reactie in D = m g" });
  }
});

test("quasi-statisch: kruk met hangende massa -> reactie m g en moment m g L", () => {
  // Horizontale kruk A->B, L = 100 mm, massa 1 kg op B, stilstaand: R_A,y = m g = 9.81 N, T = m g L = 0.981 N·m
  const m = 1, g = 9.81, L = 100;
  resetModel({
    gravity: true,
    nodes: [{ id: "A", x: 0, y: 0, support: "pin" }, { id: "B", x: L, y: 0, m }],
    elems: [{ id: "k", type: "link", a: "A", b: "B", len: L, driver: true, rpm: 0, theta0: 0 }]
  });
  computeSweep();
  const S = sim.sweep;
  assert.ok(S, "sweep");
  close(S.R.A[0].y, m * g, { rtol: 1e-9, label: "R_A,y" });
  close(Math.abs(S.T.k[0]), m * g * L * 1e-3, { rtol: 1e-9, label: "|T|" });
});
