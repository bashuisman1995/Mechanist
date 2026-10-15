import test from "node:test";
import assert from "node:assert/strict";
import { beamSect } from "../../src/core/axial.js";
import { analyticChecks, computeModes, memberCurve, solveStiffness } from "../../src/core/stiffness.js";
import { material } from "../../src/calc/materials.js";
import { hertz } from "../../src/core/contact.js";
import { flexK } from "../../src/core/flexure.js";
import { close, resetModel } from "./helpers.mjs";

const steel = material("staal");
const E0 = steel.E;
const prof = { prof: "rect", pb: 10, ph: 2, mat: "staal" };         // 10 × 2 mm staal
const I0 = 10 * 2 ** 3 / 12, A0 = 20;

// keten van n gelijke balken van x = 0 tot L; opleggingen en lasten via extra
function chain(n, L, extraNodes = {}, force) {
  const nodes = [], elems = [];
  for (let i = 0; i <= n; i++) nodes.push({ id: "P" + i, x: L * i / n, y: 0, ...(extraNodes[i] || {}) });
  for (let i = 0; i < n; i++) elems.push({ id: "b" + i, type: "link", a: "P" + i, b: "P" + (i + 1), len: L / n, beam: true, ...prof });
  if (force) elems.push({ id: "F", type: "force", ...force });
  return { nodes, elems };
}

test("uitkraging met 1 element: δ = F·L³/(3EI), θ = F·L²/(2EI) en k = 3EI/L³ exact", () => {
  const L = 100, F = 2;
  resetModel(chain(1, L, { 0: { support: "pin", clamp: true } }, { node: "P1", mag: F, ang: -90 }));
  const r = solveStiffness();
  assert.ok(r.ok, "opgelost");
  const EI = E0 * I0, tip = r.nodes.get("P1");
  close(tip.uy, -F * L ** 3 / (3 * EI), { rtol: 1e-9, label: "δ" });
  close(tip.th, -F * L ** 2 / (2 * EI), { rtol: 1e-9, label: "θ" });
  close(tip.ux, 0, { atol: 1e-12, label: "geen axiale verplaatsing" });
  const k = r.pointK("P1", 90);
  close(k.k, 3 * EI / L ** 3, { rtol: 1e-9, label: "k = 3EI/L³" });
  close(k.kUm, 3 * EI / L ** 3 / 1000, { rtol: 1e-9, label: "k in N/µm" });
  // reactie en evenwicht
  const R = r.reactions[0];
  close(R.Ry, F, { rtol: 1e-9, label: "Ry" });
  close(R.Mz, F * L, { rtol: 1e-9, label: "inklemmingsmoment" });
  assert.ok(r.eq < 1e-9, "evenwicht " + r.eq);
  // spanning in de inklemming: σ = M·c/I
  close(r.sigMax.val, F * L * 1 / I0, { rtol: 1e-9, label: "σ_max = M·c/I" });
  assert.equal(r.sigMax.frac, 0);
});

test("de uitkraging geeft hetzelfde met 4 elementen (knopen op de balk)", () => {
  const L = 100, F = 2;
  resetModel(chain(4, L, { 0: { support: "pin", clamp: true } }, { node: "P4", mag: F, ang: -90 }));
  const r = solveStiffness(), EI = E0 * I0;
  close(r.nodes.get("P4").uy, -F * L ** 3 / (3 * EI), { rtol: 1e-9 });
  // het midden: δ(L/2) = F·(L/2)²·(3L − L/2)/(6EI)
  close(r.nodes.get("P2").uy, -F * (L / 2) ** 2 * (3 * L - L / 2) / (6 * EI), { rtol: 1e-9, label: "midden" });
});

test("geleide bladveer (inklemming en glijder met vaste hoek): k = 12EI/L³", () => {
  const L = 40;
  resetModel(chain(1, L, { 0: { support: "pin", clamp: true }, 1: { support: "slider", dir: 90, clamp: true } }, { node: "P1", mag: 0.1, ang: 90 }));
  const r = solveStiffness(), EI = E0 * I0;
  assert.ok(r.ok);
  close(r.pointK("P1", 90).k, 12 * EI / L ** 3, { rtol: 1e-9, label: "k = 12EI/L³" });
  close(r.nodes.get("P1").uy, 0.1 * L ** 3 / (12 * EI), { rtol: 1e-9, label: "δ" });
  close(r.nodes.get("P1").th, 0, { atol: 1e-14, label: "geen hoek bij de geleiding" });
  const R = r.reactions.find(x => x.id === "P1");
  close(R.Ry, 0, { atol: 1e-9, label: "geen reactie in de glijrichting" });
  assert.ok(Math.abs(R.Rx) < 1e-9);
  assert.ok(r.eq < 1e-9);
});

test("vrij opgelegde balk met 2 elementen: δ(midden) = F·L³/(48EI)", () => {
  const L = 100, F = 3;
  resetModel(chain(2, L, { 0: { support: "pin" }, 2: { support: "slider", dir: 0 } }, { node: "P1", mag: F, ang: -90 }));
  const r = solveStiffness(), EI = E0 * I0;
  assert.ok(r.ok, r.mech && r.mech.text);
  close(r.nodes.get("P1").uy, -F * L ** 3 / (48 * EI), { rtol: 1e-9, label: "δ" });
  close(r.pointK("P1", 90).k, 48 * EI / L ** 3, { rtol: 1e-9, label: "k = 48EI/L³" });
  const ra = r.reactions.find(x => x.id === "P0"), rb = r.reactions.find(x => x.id === "P2");
  close(ra.Ry, F / 2, { rtol: 1e-9 }); close(rb.Ry, F / 2, { rtol: 1e-9 });
  // het moment onder de last is F·L/4
  const mid = r.members[0];
  close(Math.abs(mid.M[mid.M.length - 1]), F * L / 4, { rtol: 1e-9, label: "M(midden)" });
  // de gebogen lijn gaat door de knopen
  const c = memberCurve(r.sys, r.members[0], r.u, 1, 8);
  close(c[8].y, -F * L ** 3 / (48 * EI), { rtol: 1e-9, label: "kromme eindigt in de knoop" });
});

test("eerste buigfrequentie van een uitkraging met 8 elementen binnen 0,5 %", () => {
  const L = 100;
  resetModel(chain(8, L, { 0: { support: "pin", clamp: true } }));
  const r = solveStiffness();
  const { modes } = computeModes(r, 6);
  assert.ok(modes.length >= 3, "meerdere modes");
  const mu = steel.rho * 1e-9 * A0 * 1e-3, EI = E0 * I0;
  const f1 = 1.8751041 ** 2 / (2 * Math.PI) * Math.sqrt(EI / (mu * L ** 4));
  close(modes[0].f, f1, { rtol: 0.005, label: "f1" });
  const f2 = 4.6940911 ** 2 / (2 * Math.PI) * Math.sqrt(EI / (mu * L ** 4));
  close(modes[1].f, f2, { rtol: 0.01, label: "f2" });
  assert.ok(modes[0].f < modes[1].f && modes[1].f < modes[2].f);
});

test("analytische controle: uitkraging, geleid en vrij opgelegd worden herkend", () => {
  const L = 100;
  resetModel(chain(2, L, { 0: { support: "pin", clamp: true } }, { node: "P2", mag: 1, ang: -90 }));
  let r = solveStiffness();
  let a = analyticChecks(r, computeModes(r, 3).modes);
  assert.equal(a[0].id, "uitkraging");
  close(a[0].rows[0].fe, a[0].rows[0].an, { rtol: 1e-9 });
  assert.equal(a[1].id, "uitkraging-f");
  close(a[1].rows[0].fe, a[1].rows[0].an, { rtol: 0.01 });
  resetModel(chain(2, L, { 0: { support: "pin" }, 2: { support: "slider", dir: 0 } }, { node: "P1", mag: 1, ang: -90 }));
  r = solveStiffness(); a = analyticChecks(r, []);
  assert.equal(a[0].id, "ligger"); close(a[0].rows[0].fe, a[0].rows[0].an, { rtol: 1e-9 });
  resetModel(chain(1, L, { 0: { support: "pin", clamp: true }, 1: { support: "slider", dir: 90, clamp: true } }, { node: "P1", mag: 1, ang: 90 }));
  r = solveStiffness(); a = analyticChecks(r, []);
  assert.equal(a[0].id, "geleid"); close(a[0].rows[1].fe, a[0].rows[1].an, { rtol: 1e-9 });
  // bij een extra veer is het geen standaardgeval meer
  resetModel({ ...chain(1, L, { 0: { support: "pin", clamp: true } }, { node: "P1", mag: 1, ang: -90 }) });
  r = solveStiffness(); assert.ok(analyticChecks(r, []).length === 1);
});

test("mechanisme: een balk op twee scharnieren met een knik, en een vrij draaiend scharnier", () => {
  // twee balken in een scharnier (pin-joint), tussen twee scharnier-opleggingen: kan door buigen niet, maar de middelste knoop heeft geen stijfheid in de scharnier-hoek
  resetModel({
    nodes: [{ id: "A", x: 0, y: 0, support: "pin" }, { id: "B", x: 100, y: 0 }],
    elems: [{ id: "b", type: "link", a: "A", b: "B", len: 100, beam: true, ...prof }, { id: "F", type: "force", node: "B", mag: 1, ang: 90 }]
  });
  let r = solveStiffness();
  assert.ok(!r.ok && r.mech, "mechanisme herkend");
  assert.match(r.mech.text, /Mechanisme/);
  assert.match(r.mech.text, /punt [AB] kan vrij/);
  // een scharnier met een torsieveer is geen mechanisme meer
  resetModel({
    nodes: [{ id: "A", x: 0, y: 0, support: "pin", joint: "spring", kth: 1000 }, { id: "B", x: 100, y: 0 }],
    elems: [{ id: "b", type: "link", a: "A", b: "B", len: 100, beam: true, ...prof }, { id: "F", type: "force", node: "B", mag: 1, ang: 90 }]
  });
  r = solveStiffness();
  assert.ok(r.ok, "torsieveer stabiliseert: " + (r.mech && r.mech.text));
  // stijve starre rotatie k_θ: tip van een rechte balk om een torsieveer: δ = F·L²/kθ + F·L³/(3EI)
  const EI = E0 * I0, L = 100, kth = 1000;
  close(r.nodes.get("B").uy, 1 * L * L / kth + L ** 3 / (3 * EI), { rtol: 1e-9, label: "veer + buiging" });
  // een ongesteund vrij punt met alleen een veer: x en y zijn vrij
  resetModel({
    nodes: [{ id: "A", x: 0, y: 0, support: "pin" }, { id: "B", x: 100, y: 0 }],
    elems: [{ id: "s", type: "spring", a: "A", b: "B", k: 5 }]
  });
  r = solveStiffness();
  assert.ok(!r.ok && /punt B kan vrij verschuiven in y-richting/.test(r.mech.text), r.mech && r.mech.text);
});

test("star tegenover scharnier: portaal met een scharnierende dwarsbalk is veel slapper", () => {
  const H = 100, W = 100, build = joint => resetModel({
    nodes: [{ id: "A", x: 0, y: 0, support: "pin", clamp: true }, { id: "B", x: 0, y: H, joint }, { id: "C", x: W, y: H, joint },
            { id: "D", x: W, y: 0, support: "pin", clamp: true }],
    elems: [{ id: "c1", type: "link", a: "A", b: "B", len: H, beam: true, ...prof }, { id: "t", type: "link", a: "B", b: "C", len: W, beam: true, ...prof },
            { id: "c2", type: "link", a: "D", b: "C", len: H, beam: true, ...prof }, { id: "F", type: "force", node: "B", mag: 1, ang: 0 }]
  });
  build("star");
  let r = solveStiffness(); assert.ok(r.ok);
  const EI = E0 * I0, kStar = 1 / r.nodes.get("B").ux;
  // star-portaal met slanke ligger: tussen 24EI/h³ (stijve ligger) en 6EI/h³ (scharnierende ligger)
  assert.ok(kStar > 6 * EI / H ** 3 && kStar < 24 * EI / H ** 3 * 1.0001, "k = " + kStar);
  build("pin"); r = solveStiffness();
  assert.ok(r.ok, r.mech && r.mech.text);
  // scharnierende kop: twee uitkragingen via de (axiaal stijve) ligger aan elkaar gekoppeld, k = 2·3EI/h³
  close(1 / r.nodes.get("B").ux, 6 * EI / H ** 3, { rtol: 1e-3 });
  assert.ok(1 / r.nodes.get("B").ux < kStar);
});

test("stijve schakel (Oneindig) met star-verbinding aan een balk: tip = δ_B + θ_B·L_r (penalty < 1e-4)", () => {
  const L1 = 100, Lr = 50, F = 1;
  resetModel({
    nodes: [{ id: "A", x: 0, y: 0, support: "pin", clamp: true }, { id: "B", x: L1, y: 0 }, { id: "C", x: L1 + Lr, y: 0 }],
    elems: [{ id: "b", type: "link", a: "A", b: "B", len: L1, beam: true, ...prof }, { id: "r", type: "link", a: "B", b: "C", len: Lr },
            { id: "F", type: "force", node: "C", mag: F, ang: -90 }]
  });
  const r = solveStiffness(), EI = E0 * I0;
  assert.ok(r.ok);
  const M = F * Lr, dB = F * L1 ** 3 / (3 * EI) + M * L1 ** 2 / (2 * EI), tB = F * L1 ** 2 / (2 * EI) + M * L1 / EI;
  close(-r.nodes.get("B").uy, dB, { rtol: 1e-4, label: "δ_B" });
  close(-r.nodes.get("C").uy, dB + tB * Lr, { rtol: 1e-4, label: "tip" });
  // de knoophoek van het uiteinde C van een stijve schakel bestaat niet (geen balk): die waarde is niet gedefinieerd
  assert.ok(Number.isNaN(r.nodes.get("C").th));
});

test("axiale staaf in het raamwerk: k = EA/L; veer in serie", () => {
  resetModel({
    nodes: [{ id: "A", x: 0, y: 0, support: "pin" }, { id: "B", x: 100, y: 0, support: "slider", dir: 0 }],
    elems: [{ id: "a", type: "link", a: "A", b: "B", len: 100, axial: true, A: 20, mat: "staal" }, { id: "F", type: "force", node: "B", mag: 10, ang: 0 }]
  });
  let r = solveStiffness();
  assert.ok(r.ok);
  close(r.nodes.get("B").ux, 10 / (E0 * 20 / 100), { rtol: 1e-9 });
  close(r.members[0].NN, 10, { rtol: 1e-9, label: "N" });
  close(r.sigMax.val, 10 / 20, { rtol: 1e-9, label: "σ" });
  resetModel({
    nodes: [{ id: "A", x: 0, y: 0, support: "pin" }, { id: "B", x: 100, y: 0, support: "slider", dir: 0 }, { id: "C", x: 200, y: 0, support: "pin" }],
    elems: [{ id: "s1", type: "spring", a: "A", b: "B", k: 4 }, { id: "s2", type: "spring", a: "B", b: "C", k: 4 }, { id: "F", type: "force", node: "B", mag: 1, ang: 0 }]
  });
  r = solveStiffness();
  close(r.pointK("B", 0).k, 8 * 1, { rtol: 1e-9 }); // twee veren parallel
});

test("zwaartekracht: eigen gewicht van een uitkraging, δ = w·L⁴/(8EI)", () => {
  const L = 100;
  resetModel({ ...chain(2, L, { 0: { support: "pin", clamp: true } }), gravity: true });
  const r = solveStiffness(), EI = E0 * I0;
  const w = steel.rho * 1e-9 * A0 * 9.81;
  close(r.nodes.get("P2").uy, -w * L ** 4 / (8 * EI), { rtol: 1e-9, label: "tip" });
  close(r.reactions[0].Ry, w * L, { rtol: 1e-9, label: "reactie = gewicht" });
  // de gebogen lijn in het midden van het eerste element volgt de exacte vorm w x²(6L²−4Lx+x²)/(24EI)
  const x = L / 4, ex = -w * x * x * (6 * L * L - 4 * L * x + x * x) / (24 * EI);
  const c = memberCurve(r.sys, r.members[0], r.u, 1, 2, true);
  close(c[1].y, ex, { rtol: 1e-9, label: "exacte vorm" });
});

test("profielen: rechthoek, rond, buis en eigen A/I", () => {
  const rc = beamSect({ prof: "rect", pb: 10, ph: 2 });
  close(rc.I, 10 * 8 / 12, { rtol: 1e-12 }); close(rc.c, 1, { rtol: 1e-12 }); close(rc.A, 20, { rtol: 1e-12 });
  const rd = beamSect({ prof: "round", pd: 4 });
  close(rd.I, Math.PI * 256 / 64, { rtol: 1e-12 }); close(rd.A, Math.PI * 4, { rtol: 1e-12 });
  const tb = beamSect({ prof: "tube", pD: 10, pdi: 8 });
  close(tb.I, Math.PI * (1e4 - 4096) / 64, { rtol: 1e-12 }); close(tb.A, Math.PI * 36 / 4 * 1, { rtol: 1e-12 });
  const cu = beamSect({ prof: "custom", A: 7, I: 3 });
  close(cu.I, 3, { rtol: 1e-12 }); close(cu.A, 7, { rtol: 1e-12 });
});

test("eigenfrequenties van een vrij opgelegde balk en van een fijn net (deelruimte-iteratie) kloppen met de formules", () => {
  const L = 100, mu = steel.rho * 1e-9 * A0 * 1e-3, EI = E0 * I0, s = Math.sqrt(EI / (mu * L ** 4));
  resetModel(chain(8, L, { 0: { support: "pin" }, 8: { support: "slider", dir: 0 } }));
  let r = solveStiffness(), { modes } = computeModes(r, 3);
  close(modes[0].f, Math.PI / 2 * s, { rtol: 0.005, label: "ligger f1" });
  close(modes[1].f, 4 * Math.PI / 2 * s, { rtol: 0.01, label: "ligger f2 = 4 f1" });
  assert.equal(analyticChecks(r, modes).find(a => a.id === "ligger-f").rows.length, 1);
  // 40 elementen: 120 vrije dofs, dus de deelruimte-iteratie
  resetModel(chain(40, L, { 0: { support: "pin", clamp: true } }));
  r = solveStiffness(); ({ modes } = computeModes(r, 6));
  assert.equal(modes.length, 6);
  const beta = [1.8751041, 4.6940911, 7.8547574, 10.9955407, 14.1371684];       // de zesde is de eerste axiale mode (≈ 12,9 kHz)
  beta.forEach((b, k) => close(modes[k].f, b ** 2 / (2 * Math.PI) * s, { rtol: 0.003, label: "mode " + (k + 1) }));
  close(modes[5].f, Math.sqrt(E0 * 1e6 / steel.rho) / (4 * L * 1e-3), { rtol: 0.01, label: "axiale mode" });
});

test("puntmassa op een uitkraging: f = sqrt(k/m)/(2π) met k = 3EI/L³; zonder massa geen modes", () => {
  const L = 100, m = 0.05, EI = E0 * I0;
  resetModel(chain(1, L, { 0: { support: "pin", clamp: true }, 1: { m } }));
  let r = solveStiffness(), { modes } = computeModes(r, 4);
  const mb = steel.rho * 1e-9 * A0 * L;                                          // massa van de balk (kg): Rayleigh, m_eff = m + 33/140·m_b
  close(modes[0].f, Math.sqrt(3 * EI / L ** 3 / ((m + 33 / 140 * mb) * 1e-3)) / (2 * Math.PI), { rtol: 0.005, label: "f1" });
  resetModel({ nodes: [{ id: "A", x: 0, y: 0, support: "pin" }, { id: "B", x: 100, y: 0, support: "slider", dir: 0 }], elems: [{ id: "s", type: "spring", a: "A", b: "B", k: 2 }] });
  r = solveStiffness(); const res = computeModes(r, 3);
  assert.equal(res.modes.length, 0); assert.match(res.msg, /massa/);
});

test("flexure: stijve schakel met draaiveer K, δ = F·L²/K; contact als veer k_n", () => {
  resetModel({
    nodes: [{ id: "A", x: 0, y: 0, support: "pin" }, { id: "B", x: 40, y: 0 }],
    elems: [{ id: "x", type: "flexure", a: "A", b: "B", len: 40, kind: "notch", L: 20, wd: 10, t: 1, R: 3, Kt: 1.5, mat: "staal", sig: 0, pre: 0, ref: "" },
            { id: "F", type: "force", node: "B", mag: 1, ang: 90 }]
  });
  const r = solveStiffness();
  assert.ok(r.ok, r.mech && r.mech.text);
  close(r.nodes.get("B").uy, 40 * 40 / flexK(r.sys.mem[0].e), { rtol: 1e-4, label: "δ = F L²/K" });
  // contact: bal op een vlak met 10 µm indringing, k_n = 2E*·√(R·δ) in de normaal
  resetModel({
    nodes: [{ id: "A", x: 0, y: 4.99, support: "slider", dir: 90 }],
    elems: [{ id: "c", type: "contact", node: "A", R: 5, m1: "staal", m2: "staal", mu: 0.1, chi: 0, ang: 0, ax: 0, ay: 0 }]
  });
  const r2 = solveStiffness();
  assert.ok(r2.ok, r2.mech && r2.mech.text);
  close(r2.pointK("A", 90).k, hertz({ R: 5, m1: "staal", m2: "staal" }, 0.01).kn, { rtol: 1e-9, label: "k_n" });
});
