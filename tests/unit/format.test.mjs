// Getalnotatie van de UI: komma, dunne spatie, drie cijfers, nooit machtsnotatie, voorvoegsel wisselt, rommel wordt 0.
import test from "node:test";
import assert from "node:assert/strict";
import { REL_FE, colUnit, fmt, fmtAngle, fmtForce, fmtHz, fmtLen, fmtQ, fmtStiff, fmtStress, fmtTime, numStr, powTick, sg, tickStr } from "../../src/ui/format.js";

const NN = " ", MIN = "−";
const hasE = s => /\d[eE][+-]?\d/.test(s);

test("decimale komma, drie geldige cijfers, dunne spatie bij duizendtallen", () => {
  assert.equal(sg(0.5), "0,5");
  assert.equal(sg(3.14159), "3,14");
  assert.equal(sg(123.456), "123");
  assert.equal(sg(1234.5), "1" + NN + "235");
  assert.equal(sg(-0.0123), MIN + "0,0123");
  assert.equal(sg(1234567), "1" + NN + "234" + NN + "567");
  assert.equal(fmt(50), "50,0");
  assert.equal(fmt(2), "2,00");
  assert.equal(fmt(0.2), "0,2");
  assert.equal(sg(undefined), "–");
  assert.equal(sg(NaN), "–");
  assert.equal(sg(Infinity), "∞");
});

test("nooit machtsnotatie, over 60 orden van grootte", () => {
  const bad = [];
  for (let ex = -30; ex <= 30; ex++) for (const m of [1, 1.234, 5.56, 9.99, -7.5]) {
    const v = m * Math.pow(10, ex);
    const all = [sg(v), sg(v, 5), fmt(v), numStr(v, 3, true), tickStr(v, Math.abs(v) / 10), tickStr(v),
      fmtLen(v), fmtForce(v), fmtStiff(v), fmtStress(v), fmtAngle(v), fmtHz(Math.abs(v)), fmtTime(Math.abs(v)), colUnit([v, v / 7], "len").s(v), powTick(ex)];
    all.forEach(s => { if (hasE(s) || /NaN|undefined/.test(s)) bad.push(v + " -> " + s); });
  }
  assert.deepEqual(bad, []);
});

test("het voorvoegsel wisselt in plaats van e-notatie", () => {
  assert.equal(fmtQ(0.112, "stiff"), "0,112 N/mm");
  assert.equal(fmtQ(1.12e-4, "stiff"), "0,112 N/m");
  assert.equal(fmtQ(15900, "stiff"), "15,9 N/µm");
  assert.equal(fmtLen(2.45), "2,45 mm");
  assert.equal(fmtLen(0.0025), "2,5 µm");
  assert.equal(fmtLen(2.5e-6), "2,5 nm");
  assert.equal(fmtAngle(3.59e-5), "35,9 µrad");
  assert.equal(fmtAngle(0.02), "20 mrad");
  assert.equal(fmtStress(16.7), "16,7 MPa");
  assert.equal(fmtStress(2100), "2,1 GPa");
  assert.equal(fmtHz(56.1), "56,1 Hz");
  assert.equal(fmtHz(23763), "23,8 kHz");
  assert.equal(fmtForce(0.2), "0,2 N");
  assert.equal(fmtForce(1500), "1,5 kN");
  assert.equal(fmtTime(0.0123), "12,3 ms");
});

test("waarden onder 1e-9 x de probleemschaal zijn 0", () => {
  assert.equal(sg(5.56e-7, 3, 0.2), "0,000000556");        // boven de drempel: leesbaar, nooit als 5,56e-7
  assert.equal(sg(5.56e-11, 3, 0.2), "0");
  assert.equal(fmtForce(5.56e-11, 3, 0.2), "0 N");
  assert.equal(fmtLen(1e-13, 3, 50), "0 mm");
  const c = colUnit([0.2, 5.56e-11, -0.2], "force");
  assert.equal(c.u, "N");
  assert.equal(c.s(5.56e-11), "0");
  assert.equal(c.s(0.2), "0,2");
  assert.equal(c.s(-0.2), MIN + "0,2");
  // reacties uit een penalty-FE: ruis van 1e-6 relatief valt weg (5,56e-7 N naast 0,2 N)
  const r = colUnit([-0.2, 5.56e-7], "force", REL_FE);
  assert.equal(r.s(5.56e-7), "0");
  assert.equal(r.s(-0.2), MIN + "0,2");
});

test("tabelkolom kiest een gemeenschappelijke eenheid", () => {
  const u = colUnit([0.00952e-3, 1.68, -1.79], "len");
  assert.equal(u.u, "mm");
  const small = colUnit([2e-3, -3.4e-3], "len");
  assert.equal(small.u, "µm");
  assert.equal(small.s(2e-3), "2");
});

test("assen: decimalen volgen de stap, log-as met 10^n", () => {
  assert.equal(tickStr(0.25, 0.05), "0,25");
  assert.equal(tickStr(1e-7, 1e-7), "0,0000001");
  assert.equal(tickStr(-1500, 500), MIN + "1" + NN + "500");
  assert.equal(powTick(-1), "0,1");
  assert.equal(powTick(-4), "10⁻⁴");
  assert.equal(powTick(5), "10⁵");
});
