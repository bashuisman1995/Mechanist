// De nieuwe voorbeelden (src/ui/example-specs.js): het model wordt in Node opgebouwd en de oplossers moeten de analytische
// waarde uit de uitleg halen binnen de genoemde tolerantie. De e2e-test (tests/e2e/scenarios/examples-more.mjs) leest dezelfde
// grootheid uit de app.
import test from "node:test";
import assert from "node:assert/strict";
import { chVal } from "../../src/core/channels.js";
import { computeDyn } from "../../src/core/dynamics.js";
import { computeFrf, frfVal } from "../../src/core/frf.js";
import { computeSweep } from "../../src/core/kinematics.js";
import { evaluate, listOutputs, takeSnap } from "../../src/core/optsketch.js";
import { optimize } from "../../src/core/optimize.js";
import { computeModes, solveStiffness } from "../../src/core/stiffness.js";
import { thermalShift } from "../../src/core/thermal.js";
import { model, sim } from "../../src/core/state.js";
import { PARAMS, ROBERTS, SPECS, materialize } from "../../src/ui/example-specs.js";
import { close, resetModel, run } from "./helpers.mjs";

export function load(id) {
  const spec = SPECS[id], M = materialize(spec, { node: nm => nm });
  resetModel({ nodes: M.nodes, elems: M.elems, ...M.props, series: M.series });
  sim.CH = []; sim.CHM = new Map();
  return { spec, M };
}
const near = (actual, c, label) => c.atol !== undefined
  ? close(actual, c.value, { atol: c.atol, label })
  : close(actual, c.value, { rtol: c.tol, label });

test("alle voorbeelden: knopen en elementen kloppen en elk voorbeeld heeft een controle", () => {
  for (const id of Object.keys(SPECS)) {
    const { spec, M } = load(id);
    assert.ok(spec.check && spec.check.length, id + ": controle ontbreekt");
    const names = new Set(M.nodes.map(n => n.name));
    assert.equal(names.size, M.nodes.length, id + ": dubbele knoopnamen");
    for (const e of M.elems) for (const k of ["a", "b", "node"]) if (e[k]) assert.ok(M.nodes.some(n => n.id === e[k]), `${id}: ${e.type} verwijst naar een onbekende knoop ${e[k]}`);
    assert.ok(["kin", "dyn", "equil", "frf", "stiff"].includes(spec.mode), id);
  }
});

// stijfheidsvoorbeelden
const STIFF = Object.keys(SPECS).filter(id => SPECS[id].mode === "stiff");
for (const id of STIFF) {
  test(`${id}: stijfheid binnen de tolerantie van de uitleg`, () => {
    const { spec } = load(id);
    const r = solveStiffness();
    assert.ok(r.ok, id + " niet oplosbaar: " + (r.mech ? r.mech.text : ""));
    const modes = spec.check.some(c => c.read === "f1") ? computeModes(r, 3).modes : null;
    for (const c of spec.check) {
      const lab = `${id} ${c.read}`;
      if (c.read === "k") near(r.pointK(c.node ? c.node : spec.stiff.node, c.ang !== undefined ? c.ang : spec.stiff.ang).k, c, lab);
      else if (c.read === "f1") near(modes[0].f, c, lab);
      else if (c.read === "dispratio") near(Math.abs(r.nodes.get(c.a[0])[c.a[1]] / r.nodes.get(c.b[0])[c.b[1]]), c, lab);
      else if (c.read === "dispdiff") near(r.nodes.get(c.a[0])[c.a[1]] - r.nodes.get(c.b[0])[c.b[1]], c, lab);
      else if (c.read === "react") near(r.reactions.find(x => x.id === c.node)[c.comp], c, lab);
      else assert.fail("onbekende controle " + c.read);
    }
    if (!spec.elems.some(e => e[0] === "contact")) assert.ok(r.eq < 1e-4, "evenwicht " + r.eq);
  });
}

// thermische voorbeelden
for (const id of ["athermalpair", "bimetal"]) {
  test(`${id}: thermische verschuiving`, () => {
    const { spec } = load(id);
    const r = thermalShift(model.thermNode);
    assert.ok(r.ok, "vierkant bepaald");
    for (const c of spec.check) near(c.comp === "dx" ? r.dx * 1000 : r.dy * 1000, c, id + " " + c.comp);
  });
}
test("athermisch paar: de exacte driftberekening (cirkelsnijpunt) geeft ook nul in y", () => {
  const { as, aa, L1, L2, H, x, y, dT } = PARAMS.AP;
  const l1 = L1 * (1 + as * 1e-6 * dT), l2 = L2 * (1 + aa * 1e-6 * dT);
  // snijpunt van cirkels om A (0,0) met straal l1 en om B (0,H) met straal l2
  const yy = (l1 * l1 - l2 * l2 + H * H) / (2 * H), xx = Math.sqrt(l1 * l1 - yy * yy);
  close((yy - y) * 1000, 0, { atol: 0.5, label: "Δy exact (µm)" });
  assert.ok(Math.abs(xx - x) > 0, "x verschuift");
});

// FRF-voorbeelden
for (const id of ["tmd", "isolator", "voicecoil", "accelmass"]) {
  test(`${id}: FRF`, () => {
    const { spec, M } = load(id);
    const S = run(computeFrf());
    assert.ok(S && S.eqOK, id + ": FRF niet opgelost " + sim.frfMsg);
    const modes = S.modes.filter(q => q.f > 1e-6).sort((a, b) => a.f - b.f);
    for (const c of spec.check) {
      if (c.read === "frf") near(c.kind === "f" ? modes[c.idx].f : modes[c.idx].zeta * 100, c, `${id} ${c.kind}`);
      else if (c.read === "frfpeak") {
        const key = M.series[c.idx].key;
        let mx = 0;
        for (let i = 0; i <= 360; i++) { const z = S.ok[i] ? frfVal(S, key, i) : null; if (z) mx = Math.max(mx, Math.hypot(z[0], z[1])); }
        near(mx, c, `${id} piek`);
      }
    }
  });
}

test("pendfriction, capsensor, thermslot, hardstop: dynamica", () => {
  // slinger met wrijving: blijft staan binnen μs·r (in mm aan de tip, kleine hoeken)
  let { spec, M } = load("pendfriction");
  let S = run(computeDyn());
  assert.ok(S && S.ok[360]);
  const xs = S.pos.B.map(p => p.x);
  assert.ok(Math.abs(xs[360]) <= spec.check[0].max * 1.05, "eindstand " + xs[360]);
  assert.ok(Math.abs(xs[360]) > 0.05, "plakt vast buiten de verticaal (wrijving), x = " + xs[360]);

  // capacitieve sensor: F/k
  ({ spec, M } = load("capsensor"));
  S = run(computeDyn());
  assert.ok(S && S.ok[360]);
  const key = M.series[0].key;
  near(chVal(S, key, 360), spec.check[0], "dsens eindwaarde");

  // thermisch geklemd met zachte steun
  ({ spec, M } = load("thermslot"));
  S = run(computeDyn());
  near(chVal(S, M.series[0].key, 360), spec.check[0], "N in de staaf");

  // harde aanslag: piek van de Hertz-kracht uit energiebehoud
  ({ spec, M } = load("hardstop"));
  S = run(computeDyn());
  assert.ok(S && S.ok[360], "doorgerekend");
  let mx = 0;
  for (let i = 0; i <= 360; i++) mx = Math.max(mx, chVal(S, M.series[1].key, i) || 0);
  near(mx, spec.check[0], "piek Hertz-kracht");
});

test("roberts: rechte lijn binnen 0,1 mm over meer dan 55 mm slag", () => {
  const { M } = load("roberts");
  computeSweep();
  const S = sim.sweep;
  assert.ok(S, "doorgerekend");
  const P = M.nodes.find(n => n.name === "P").id, pts = S.pos[P];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  assert.ok(x1 - x0 > 55, "slag " + (x1 - x0));
  assert.ok(y1 - y0 < 0.1, "afwijking " + (y1 - y0));
  assert.ok(ROBERTS.min < ROBERTS.max);
});

test("maxfreq: de optimaliseerder vindt de dikte waarbij de slag precies gehaald wordt", () => {
  const { M } = load("maxfreq");
  const beam = M.elems.find(e => e.type === "link").id;
  const snap = takeSnap();
  const T = M.nodes.find(n => n.name === "T").id;
  assert.ok(listOutputs().some(o => o.key === "f1"));
  const { tOpt, stroke } = SPECS.maxfreq.opt;
  const ev = h => evaluate(snap, { ["bp:" + beam + ":ph"]: h }, ["f1", "uy:" + T, "sigratio"]).vals;
  const res = optimize({
    vars: [{ name: "bp:" + beam + ":ph", min: 0.1, max: 0.6, x0: 0.4 }],
    objective: x => ev(x[0]).f1, sense: "max",
    constraints: [{ name: "slag", label: "slag", g: x => stroke * 1000 - ev(x[0])["uy:" + T] },
                  { name: "sigma", label: "sigma", g: x => ev(x[0]).sigratio - 100 }],
    maxEval: 300
  });
  close(res.x[0], tOpt, { rtol: 0.02, label: "optimale dikte" });
  // zonder de slagvoorwaarde zou f₁ nog stijgen: de grens is dus actief
  assert.ok(ev(res.x[0] * 1.2).f1 > ev(res.x[0]).f1);
});
