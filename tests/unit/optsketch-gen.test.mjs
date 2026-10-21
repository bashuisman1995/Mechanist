import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, evaluateGen, takeSnap } from "../../src/core/optsketch.js";
import { optimize, optimizeGen } from "../../src/core/optimize.js";
import { model } from "../../src/core/state.js";
import { resetModel } from "./helpers.mjs";

const dynModel = () => resetModel({
  gravity: true, simDur: 1, mode: "dyn",
  nodes: [{ id: "A", x: 0, y: 0, support: "pin" }, { id: "B", x: 120, y: 0, m: 1.5 }, { id: "C", x: 0, y: 90, support: "pin" }],
  elems: [{ id: "L", type: "link", a: "A", b: "B", len: 120 }, { id: "K", type: "spring", a: "C", b: "B", k: 0.4, L0: 90 }]
});

test("evaluateGen: zelfde uitkomst als evaluate, en het echte model staat terug bij elke yield", () => {
  dynModel();
  const snap = takeSnap(), liveNodes = model.nodes, liveElems = model.elems;
  const ref = evaluate(snap, { "k:K": 0.6 }, ["e:B:x", "e:B:y"]);
  assert.ok(Number.isFinite(ref.vals["e:B:y"]));
  const gen = evaluateGen(snap, { "k:K": 0.6 }, ["e:B:x", "e:B:y"], {});
  let yields = 0, r;
  for (;;) {
    r = gen.next();
    if (r.done) break;
    yields++;
    assert.equal(model.nodes, liveNodes, "echte knopen terug tijdens yield");
    assert.equal(model.elems, liveElems);
    assert.equal(model.elems[1].k, 0.4, "de gekopieerde parameter lekt niet naar het echte model");
  }
  assert.ok(yields > 10, "lange berekening geeft vaak de besturing terug: " + yields);
  assert.deepEqual(r.value.vals, ref.vals);
  assert.equal(model.nodes, liveNodes);
});

test("evaluateGen: shouldStop midden in de berekening stopt direct en laat het model heel", () => {
  dynModel();
  const snap = takeSnap(), liveNodes = model.nodes;
  let n = 0;
  const gen = evaluateGen(snap, {}, ["e:B:y"], { shouldStop: () => ++n > 3 });
  let r, steps = 0;
  for (;;) { r = gen.next(); if (r.done) break; steps++; }
  assert.ok(r.value.aborted && Number.isNaN(r.value.vals["e:B:y"]));
  assert.ok(steps <= 4, "stopte na " + steps + " stappen");
  assert.equal(model.nodes, liveNodes);
});

test("optimize met een generator-doelfunctie geeft hetzelfde resultaat als met een gewone", () => {
  const f = x => (x[0] - 0.3) * (x[0] - 0.3) + (x[1] + 0.2) * (x[1] + 0.2);
  const base = { vars: [{ name: "a", min: -1, max: 1 }, { name: "b", min: -1, max: 1 }], maxEval: 150 };
  const a = optimize({ ...base, objective: f });
  const b = optimize({ ...base, objective: function* (x) { yield; return f(x); } });
  assert.deepEqual(b.x, a.x);
  assert.equal(b.evals, a.evals);
});

test("optimizeGen: Stop midden in een evaluatie telt die evaluatie niet mee", () => {
  let stop = false, calls = 0;
  const gen = optimizeGen({ vars: [{ name: "a", min: -1, max: 1 }], maxEval: 100, shouldStop: () => stop,
    objective: function* (x) { calls++; yield; if (calls === 5) stop = true; yield; return x[0] * x[0]; } });
  let r;
  for (;;) { r = gen.next(); if (r.done) break; }
  assert.ok(r.value.stopped);
  assert.equal(r.value.evals, 4);
});
