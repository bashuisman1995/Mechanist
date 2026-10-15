import test from "node:test";
import assert from "node:assert/strict";
import { axialA, axialK, thermDL, thermLen } from "../../src/core/axial.js";
import { computeDyn } from "../../src/core/dynamics.js";
import { computeFrf, frfVal } from "../../src/core/frf.js";
import { computeSweep, relax } from "../../src/core/kinematics.js";
import { thermalShift } from "../../src/core/thermal.js";
import { loadcellDt, springK, springL0 } from "../../src/core/sensors.js";
import { chVal, channels } from "../../src/core/channels.js";
import { material } from "../../src/calc/materials.js";
import { model, sim } from "../../src/core/state.js";
import { close, resetModel, run } from "./helpers.mjs";

const steel = material("staal"), alu = material("alu");

test("axiale staaf: veerstijfheid k = E·A/L (profiel b×h en direct A)", () => {
  const e = { type: "link", axial: true, len: 100, A: 20, mat: "staal" };
  close(axialK(e), steel.E * 20 / 100, { rtol: 1e-12, label: "EA/L" });
  close(springK(e), 42000, { rtol: 1e-12, label: "springK" });
  const bh = { ...e, sect: "bh", sb: 5, sh: 4 };
  close(axialA(bh), 20, { rtol: 1e-12 }); close(axialK(bh), 42000, { rtol: 1e-12 });
  close(axialK({ ...e, mat: "alu", len: 50 }), alu.E * 20 / 50, { rtol: 1e-12, label: "alu, 50 mm" });
});

test("axiale staaf in de FRF: statische stijfheid EA/L en eigenfrequentie sqrt(k/m)", () => {
  resetModel({
    nodes: [{ id: "A", x: 0, y: 0, support: "pin" }, { id: "B", x: 100, y: 0, support: "slider", dir: 0, m: 1 }],
    elems: [{ id: "bar", type: "link", a: "A", b: "B", len: 100, axial: true, A: 20, mat: "staal" },
            { id: "F", type: "force", node: "B", mag: 1, ang: 0 }],
    mode: "frf"
  });
  const S = run(computeFrf());
  assert.ok(S, "FRF opgelost");
  const k = steel.E * 20 / 100;                                   // 42000 N/mm
  const f1 = S.modes.find(m => m.f > 1e-6).f;
  close(f1, Math.sqrt(k / 1e-3) / (2 * Math.PI), { rtol: 1e-4, label: "f1" });
  close(frfVal(S, "n|B|x", 0)[0], 1 / k, { rtol: 5e-3, label: "x = F/k" });
  close(frfVal(S, "s|bar|F", 0)[0], 1, { rtol: 5e-3, label: "N = F" });
  close(frfVal(S, "w|bar|dL", 0)[0], 1000 / k, { rtol: 5e-3, label: "ΔL in µm" });
  close(frfVal(S, "w|bar|sig", 0)[0], 1 / 20, { rtol: 5e-3, label: "σ = N/A" });
  assert.ok(channels().some(c => c.key === "w|bar|dL") && channels().some(c => c.key === "w|bar|sig"));
});

test("temperatuur: rustlengte L·(1+α·ΔT), eigen ΔT gaat voor", () => {
  resetModel({ nodes: [], elems: [], dT: 10 });
  const e = { type: "link", len: 100, mat: "alu" };
  close(thermDL(e), 100 * alu.alpha * 1e-6 * 10, { rtol: 1e-12 });
  close(thermLen(e), 100.02360, { atol: 1e-9, label: "100 mm alu +10 K" });
  close(thermDL({ ...e, dT: -5 }), -100 * alu.alpha * 1e-6 * 5, { rtol: 1e-12, label: "eigen ΔT" });
  close(thermDL({ ...e, mat: undefined }), 100 * steel.alpha * 1e-6 * 10, { rtol: 1e-12, label: "standaard staal" });
  close(thermDL({ type: "link", len: 100, driver: true }), 0, { atol: 0, label: "kruk rekt niet" });
});

// twee pinnen en een vrij punt T met een aluminium en een stalen staaf (statisch bepaald)
function truss(extra = {}) {
  return resetModel({
    nodes: [{ id: "P", x: 0, y: 0, support: "pin" }, { id: "Q", x: 0, y: 60, support: "pin" }, { id: "T", x: 100, y: 30 }],
    elems: [{ id: "ba", type: "link", a: "P", b: "T", len: Math.hypot(100, 30), mat: "alu" },
            { id: "bs", type: "link", a: "Q", b: "T", len: Math.hypot(100, 30), mat: "staal" }],
    mode: "kin", ...extra
  });
}
const snap = () => model.nodes.map(n => [n.x, n.y]);
const restore = s => model.nodes.forEach((n, i) => { n.x = s[i][0]; n.y = s[i][1]; });

test("thermische verschuiving: analytisch (Jacobiaan) komt overeen met opnieuw oplossen", () => {
  truss({ dT: 1 });
  const s0 = snap(), r = thermalShift("T");
  assert.ok(r.ok, "bepaald stelsel");
  assert.equal(r.parts.length, 2);
  relax();
  const T = model.nodes.find(n => n.id === "T");
  close(T.x - 100, r.dx, { atol: 3e-7, label: "Δx" });
  close(T.y - 30, r.dy, { atol: 3e-7, label: "Δy" });
  assert.ok(Math.abs(r.dx) > 1e-3 && Math.abs(r.dy) > 1e-6, "niet nul: " + r.dx + ", " + r.dy);
  // de som van de bijdragen is het totaal
  close(r.parts.reduce((s, p) => s + p.cx, 0), r.dx, { rtol: 1e-12 });
  restore(s0);
});

test("gevoeligheid ∂x/∂L_i per staaf = eindige differentie (rekken van één staaf)", () => {
  truss();
  const s0 = snap();
  const base = thermalShift("T");           // dT = 0: gevoeligheden bestaan, bijdragen zijn 0
  assert.ok(base.ok); assert.equal(base.dx, 0);
  for (const id of ["ba", "bs"]) {
    const e = model.elems.find(x => x.id === id), part = base.parts.find(p => p.e === e);
    const h = 1e-4;                           // mm lengteverandering
    model.elems.forEach(x => { delete x.dT; });
    model.dT = 0; e.dT = h / (e.len * (material(e.mat).alpha * 1e-6));     // dL = h
    relax();
    const T = model.nodes.find(n => n.id === "T");
    close((T.x - 100) / h, part.sx, { rtol: 1e-4, atol: 1e-6, label: id + " ∂x/∂L" });
    close((T.y - 30) / h, part.sy, { rtol: 1e-4, atol: 1e-6, label: id + " ∂y/∂L" });
    restore(s0);
  }
  // bijdragen bij een echte ΔT = 5 K: Σ s_i·α_i·L_i·ΔT
  model.elems.forEach(x => { delete x.dT; }); model.dT = 5;
  const r = thermalShift("T");
  let sx = 0; for (const p of r.parts) sx += p.sx * p.e.len * material(p.e.mat).alpha * 1e-6 * 5;
  close(r.dx, sx, { rtol: 1e-12, label: "som" });
  restore(s0);
});

test("thermische verschuiving met een glijder en een kruk-tip als randvoorwaarde", () => {
  // kruk A-B vast op 90°, koppelstang B-C naar een glijder C op de x-as (aluminium), dT = 2 K
  resetModel({
    nodes: [{ id: "A", x: 0, y: 0, support: "pin" }, { id: "B", x: 0, y: 40 }, { id: "C", x: 90, y: 0, support: "slider", dir: 0 }],
    elems: [{ id: "cr", type: "link", a: "A", b: "B", len: 40, driver: true, theta0: 90, rpm: 0 },
            { id: "rod", type: "link", a: "B", b: "C", len: Math.hypot(90, 40), mat: "alu" }],
    mode: "kin", dT: 2
  });
  const s0 = snap(), r = thermalShift("C");
  assert.ok(r.ok);
  relax(new Set(["B"]));
  const C = model.nodes.find(n => n.id === "C");
  close(C.x - 90, r.dx, { rtol: 1e-4, label: "Δx glijder" });
  close(r.dy, 0, { atol: 1e-9, label: "Δy (op de rail)" });
  restore(s0);
});

test("ingeklemde axiale staaf: N = −E·A·α·ΔT (druk), exact uit de rustlengte", () => {
  resetModel({
    nodes: [{ id: "A", x: 0, y: 0, support: "pin" }, { id: "B", x: 100, y: 0, support: "pin" }],
    elems: [{ id: "bar", type: "link", a: "A", b: "B", len: 100, axial: true, A: 20, mat: "staal" }],
    mode: "dyn", dT: 10
  });
  const e = model.elems[0];
  const N = springK(e) * (100 - springL0(e));        // F = k·(L − L0'): geometrie vast, rustlengte gegroeid
  const expect = -steel.E * 20 * steel.alpha * 1e-6 * 10;
  close(N, expect, { rtol: 1e-9, label: "N" });
  assert.ok(N < 0, "drukkracht");
  close(expect, -483, { atol: 0.1, label: "−483 N" });
});

test("thermische spanning in Evenwicht: twee axiale staven tussen vaste punten, N = −E·A·α·ΔT", () => {
  // A (vast) -- B (glijder langs de staafrichting, massa) -- C (vast): beide staven zijn 100 mm staal van 2 mm²
  resetModel({
    nodes: [{ id: "A", x: 0, y: 0, support: "pin" }, { id: "B", x: 100, y: 0, support: "slider", dir: 0, m: 0.5 },
            { id: "C", x: 200, y: 0, support: "pin" }],
    elems: [{ id: "b1", type: "link", a: "A", b: "B", len: 100, axial: true, A: 2, mat: "staal" },
            { id: "b2", type: "link", a: "B", b: "C", len: 100, axial: true, A: 2, mat: "staal" }],
    mode: "dyn", durMode: "fixed", simDur: 0.05, dtStep: 0.02, cVisc: 3, dT: 20
  });
  const dt = loadcellDt(model.elems[0], model.defMass);
  assert.ok(dt > 0.02 / 1000, "tijdstap onder de stabiliteitsgrens: " + dt);
  const S = run(computeDyn());
  assert.ok(S, "opgelost");
  const expect = -steel.E * 2 * steel.alpha * 1e-6 * 20;        // −96,6 N
  for (const id of ["b1", "b2"]) {
    close(S.EF[id][360], expect, { rtol: 5e-3, label: "N " + id });
    close(chVal(S, "w|" + id + "|sig", 360), -steel.E * steel.alpha * 1e-6 * 20, { rtol: 5e-3, label: "σ = −E·α·ΔT" });
    close(chVal(S, "w|" + id + "|dL", 360), expect / axialK(model.elems[0]) * 1000, { rtol: 5e-3, label: "ΔL" });
  }
  assert.ok(S.EF.b1[360] < 0, "druk");
  // B blijft in het midden (symmetrie)
  close(S.pos.B[360].x, 100, { atol: 1e-3, label: "B blijft staan" });
});

test("Kinematica: axiale staaf is stijf, kracht en rek uit de statica; ΔT verlengt de staaf", () => {
  // kruk A-B (vast op 90°, 10 mm), axiale staaf B-C naar een glijder C op de x-as; 20 N in +x op C
  resetModel({
    nodes: [{ id: "A", x: 0, y: 0, support: "pin" }, { id: "B", x: 0, y: 10 }, { id: "C", x: 30, y: 0, support: "slider", dir: 0 }],
    elems: [{ id: "cr", type: "link", a: "A", b: "B", len: 10, driver: true, theta0: 90, rpm: 60 },
            { id: "ax", type: "link", a: "B", b: "C", len: Math.hypot(30, 10), axial: true, A: 20, mat: "staal" },
            { id: "F", type: "force", node: "C", mag: 20, ang: 0 }],
    mode: "kin"
  });
  computeSweep();
  const S = sim.sweep; assert.ok(S, "sweep");
  const F = chVal(S, "s|ax|F", 0), k = axialK(model.elems[1]);
  close(chVal(S, "w|ax|dL", 0), F / k * 1000, { rtol: 1e-9, label: "ΔL = N/k" });
  close(Math.abs(F) * 30 / Math.hypot(30, 10), 20, { rtol: 1e-6, label: "x-component = 20 N" });
  // met ΔT = 10 K is de staaf langer: de glijder schuift op
  model.dT = 10; computeSweep();
  const S2 = sim.sweep;
  const L = Math.hypot(S2.pos.C[0].x - S2.pos.B[0].x, S2.pos.C[0].y - S2.pos.B[0].y);
  close(L, thermLen(model.elems[1]), { rtol: 1e-9, label: "nieuwe lengte" });
  model.dT = 0; model.mode = "dyn";
});

test("tijdstapwaarschuiving: axiale staaf krijgt dezelfde grens als een krachtopnemer", () => {
  resetModel({
    nodes: [{ id: "A", x: 0, y: 0, support: "pin" }, { id: "B", x: 100, y: 0, support: "slider", dir: 0, m: 0.1 }],
    elems: [{ id: "bar", type: "link", a: "A", b: "B", len: 100, axial: true, A: 20, mat: "staal" }], mode: "dyn"
  });
  const dt = loadcellDt(model.elems[0], 0.1);
  close(dt, 2.8 / Math.sqrt(42000 / (0.1 * 1e-3)), { rtol: 1e-12, label: "2,8/ω" });
  assert.ok(dt < 0.2 / 1000, "de standaardtijdstap van 0,2 ms is te groot voor deze stijfheid");
});
