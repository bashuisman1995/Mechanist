// Optimaliseer in de schets: evaluatie op een kopie, athermische meetarm, stijfheid en eigenfrequentie.
import test from "node:test";
import assert from "node:assert/strict";
import { optimize, optimizeGen } from "../../src/core/optimize.js";
import { evaluate, listOutputs, listVars, takeSnap, setVar } from "../../src/core/optsketch.js";
import { material } from "../../src/calc/materials.js";
import { model, sim } from "../../src/core/state.js";
import { close, resetModel } from "./helpers.mjs";

const alu = material("alu"), steel = material("staal");
// meetarm: A (vast) - B (glijder) is staal, B - P (glijder) is aluminium; P ligt op L_AB - L_BP van A
const arm = () => resetModel({
  nodes: [{ id: "A", x: 0, y: 0, support: "pin" }, { id: "B", x: 150, y: 0, support: "slider", dir: 0 }, { id: "P", x: 60, y: 0, support: "slider", dir: 0 }],
  elems: [{ id: "e1", type: "link", a: "A", b: "B", len: 150, mat: "staal" }, { id: "e2", type: "link", a: "B", b: "P", len: 90, mat: "alu" }],
  mode: "kin", dT: 10, thermNode: "P"
});

test("evaluatie werkt op een kopie: het echte model en de oplosserstand blijven gelijk", () => {
  arm();
  const before = JSON.stringify([model.nodes, model.elems, model.dT]);
  const sweepBefore = sim.sweep;
  const r = evaluate(takeSnap(), { "nx:P": 40 }, ["th:P:sum", "x:P"]);
  assert.equal(JSON.stringify([model.nodes, model.elems, model.dT]), before);
  assert.equal(sim.sweep, sweepBefore);
  close(r.vals["x:P"], 40, { atol: 1e-12 });
  assert.ok(r.vals["th:P:sum"] > 0);
});

test("athermische meetarm: drift is nul bij L_BP/L_AB = α_AB/α_BP", () => {
  arm();
  const snap = takeSnap();
  const d0 = evaluate(snap, {}, ["th:P:sum"]).vals["th:P:sum"];
  // analytisch: Δ = (α_s·L_AB − α_al·L_BP)·ΔT
  close(d0, Math.abs(steel.alpha * 150 - alu.alpha * 90) * 1e-6 * 10 * 1000, { rtol: 1e-6, label: "startdrift" });
  const vars = listVars().filter(v => v.key === "nx:P");
  assert.equal(vars.length, 1, "een glijder op een horizontale rail biedt alleen x");
  const r = optimize({
    vars: [{ name: "nx:P", min: 20, max: 140, x0: 60 }],
    objective: x => evaluate(snap, { "nx:P": x[0] }, ["th:P:sum"]).vals["th:P:sum"], sense: "min", maxEval: 200
  });
  const ratio = (150 - r.x[0]) / 150, ath = steel.alpha / alu.alpha;
  close(ratio, ath, { rtol: 1e-3, label: "lengteverhouding" });
  assert.ok(r.f < 0.01 * d0, "drift " + r.f + " tegen " + d0);
});

test("zonder ΔT rekent de drift per kelvin", () => {
  arm(); model.dT = 0;
  const v = evaluate(takeSnap(), {}, ["th:P:sum"]).vals["th:P:sum"];
  close(v, Math.abs(steel.alpha * 150 - alu.alpha * 90) * 1e-6 * 1000, { rtol: 1e-6 });
});

test("Stijfheid: k in het punt volgt 3EI/L³ en groeit met t³; massa en eigenfrequentie", () => {
  const L = 100, b = 10, t = 2, I = b * t ** 3 / 12;
  resetModel({
    nodes: [{ id: "A", x: 0, y: 0, support: "pin", clamp: true }, { id: "C", x: L, y: 0 }],
    elems: [{ id: "bm", type: "link", a: "A", b: "C", len: L, beam: true, prof: "rect", pb: b, ph: t, mat: "staal" }, { id: "F", type: "force", node: "C", mag: 1, ang: -90 }],
    mode: "stiff", stiffNode: "C", stiffAng: 90
  });
  const snap = takeSnap();
  const keys = ["kpt:C", "uy:C", "sigmax", "mass", "f1"];
  const a = evaluate(snap, {}, keys).vals;
  close(a["kpt:C"], 3 * steel.E * I / L ** 3, { rtol: 1e-6, label: "k" });
  close(a["uy:C"], -1 / (3 * steel.E * I / L ** 3) * 1000, { rtol: 1e-6, label: "uy in µm" });
  close(a.mass, b * t * L * steel.rho * 1e-9 * 1000, { rtol: 1e-9, label: "massa in g" });
  assert.ok(a.f1 > 10, "f1 " + a.f1);
  const c = evaluate(snap, { "bp:bm:ph": 2 * t }, ["kpt:C"]).vals["kpt:C"];
  close(c / a["kpt:C"], 8, { rtol: 1e-6, label: "t³" });
  // minimaliseer de massa onder k >= 5 N/mm door de hoogte te kiezen: t = (12·k·L³/(3·E·b))^(1/3)
  const r = optimize({
    vars: [{ name: "bp:bm:ph", min: 0.5, max: 6, log: true, x0: 2 }],
    objective: x => evaluate(snap, { "bp:bm:ph": x[0] }, ["mass"]).vals.mass, sense: "min",
    constraints: [{ name: "k", g: x => 5 - evaluate(snap, { "bp:bm:ph": x[0] }, ["kpt:C"]).vals["kpt:C"], scale: 5 }]
  });
  const tH = Math.cbrt(5 * 4 * L ** 3 / (steel.E * b)) * Math.cbrt(3 / 12 * 3) / Math.cbrt(3);   // k = 3EI/L³ = E·b·t³/(4L³)
  assert.ok(r.feasible);
  close(r.x[0], Math.cbrt(5 * 4 * L ** 3 / (steel.E * b)), { rtol: 2e-3, label: "t" });
  assert.deepEqual(r.active.map(x => x.name), ["k"]);
  assert.ok(tH > 0);
});

test("FRF: eerste eigenfrequentie en lijsten met parameters en uitkomsten", () => {
  resetModel({
    nodes: [{ id: "A", x: 0, y: 0, support: "pin" }, { id: "B", x: 100, y: 0, support: "slider", dir: 0, m: 1 }],
    elems: [{ id: "sp", type: "spring", a: "A", b: "B", k: 40, L0: 100 }, { id: "F", type: "force", node: "B", mag: 1, ang: 0 }],
    mode: "frf"
  });
  const snap = takeSnap();
  const f = evaluate(snap, {}, ["f1"]).vals.f1;
  close(f, Math.sqrt(40 * 1000 / 1) / (2 * Math.PI), { rtol: 1e-4, label: "f1" });
  const f2 = evaluate(snap, { "k:sp": 160 }, ["f1"]).vals.f1;
  close(f2 / f, 2, { rtol: 1e-4, label: "k × 4 geeft f × 2" });
  const ks = listVars().map(v => v.key);
  assert.ok(ks.includes("k:sp") && ks.includes("nm:B"));
  assert.ok(listOutputs().some(o => o.key === "f1"));
  assert.ok(listOutputs().some(o => /^pk:/.test(o.key)));
});

test("Kinematica: kanaal en formule op t = 0; Evenwicht: eindstand", async () => {
  const { channels } = await import("../../src/core/channels.js");
  const { normAl } = await import("../../src/core/formula.js");
  resetModel({
    nodes: [{ id: "A", x: 0, y: 0, support: "pin" }, { id: "B", x: 25.71, y: 30.64 }, { id: "C", x: 141.73, y: 0, support: "slider", dir: 0 }],
    elems: [{ id: "cr", type: "link", a: "A", b: "B", len: 40, driver: true, theta0: 50, rpm: 60, cw: false, theta: 50 }, { id: "rod", type: "link", a: "B", b: "C", len: 120 }],
    mode: "kin"
  });
  sim.ALIAS = new Map(); sim.ALIASN = new Map();
  channels().forEach(c => { if (c.al) { sim.ALIAS.set(c.al, c); sim.ALIASN.set(normAl(c.al), c); } });
  const snap = takeSnap();
  const a = evaluate(snap, {}, ["ch:n|C|vx", "fx", "x:C"], { fx: "C.x + 1" });
  assert.ok(isFinite(a.vals["ch:n|C|vx"]) && a.vals["ch:n|C|vx"] !== 0, JSON.stringify(a));
  assert.ok(Math.abs(a.vals.fx - (a.vals["x:C"] + 1)) < 0.5, "C.x op t = 0 volgt de gesolvde stand: " + a.vals.fx + " tegen " + a.vals["x:C"]);
  const b = evaluate(snap, { "nx:B": 20 }, ["ch:n|C|vx"]);
  assert.ok(b.vals["ch:n|C|vx"] !== a.vals["ch:n|C|vx"], "andere krukpositie geeft andere snelheid");
  // evenwicht: massa aan een veer, eindstand x = L0 + F/k
  resetModel({
    nodes: [{ id: "A", x: 0, y: 0, support: "pin" }, { id: "B", x: 100, y: 0, support: "slider", dir: 0, m: 0.5 }],
    elems: [{ id: "sp", type: "spring", a: "A", b: "B", k: 10, L0: 100 }, { id: "F", type: "force", node: "B", mag: 5, ang: 0 }],
    mode: "equil", durMode: "equil", cVisc: 1, dtStep: 0.01, simDur: 0.2
  });
  const e = evaluate(takeSnap(), {}, ["e:B:x"]);
  assert.ok(Math.abs(e.vals["e:B:x"] - 100.5) < 0.05, "eindstand " + e.vals["e:B:x"] + " " + e.err);
  const e2 = evaluate(takeSnap(), { "k:sp": 20 }, ["e:B:x"]);
  assert.ok(Math.abs(e2.vals["e:B:x"] - 100.25) < 0.05, "k = 20: " + e2.vals["e:B:x"]);
});
