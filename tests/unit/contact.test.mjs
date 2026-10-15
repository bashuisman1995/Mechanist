import test from "node:test";
import assert from "node:assert/strict";
import { contactForce, deltaFor, hertz } from "../../src/core/contact.js";
import { computeDyn } from "../../src/core/dynamics.js";
import { close, resetModel, run } from "./helpers.mjs";

const steel = { R: 5, m1: "staal", m2: "staal", mu: 0.15, chi: 0.02 };

test("Hertz: staal-staal, R = 5 mm, F = 100 N tegen handberekening", () => {
  // E* = E/(2(1-nu^2)) = 210000/(2*0.91) = 115384.6 N/mm2
  const Es = 210000 / (2 * (1 - 0.09));
  // delta = (3F / (4 E* sqrt(R)))^(2/3) = 4.388e-3 mm; a = sqrt(R delta) = 0.1481 mm
  const d = Math.pow(3 * 100 / (4 * Es * Math.sqrt(5)), 2 / 3);
  close(d * 1000, 4.388, { atol: 0.005, label: "delta (um)" });
  close(deltaFor(steel, 100), d, { rtol: 1e-9, label: "deltaFor" });
  const h = hertz(steel, d);
  close(h.Es, Es, { rtol: 1e-9, label: "E*" });
  close(h.Fn, 100, { rtol: 1e-9, label: "F" });
  close(h.a, 0.1481, { atol: 5e-4, label: "a" });
  close(h.kn, 3 * 100 / (2 * d), { rtol: 1e-9, label: "kn = 3F/2delta" });      // dF/ddelta
  // G* = 1/(2(2-nu)/G), G = E/(2(1+nu)) -> kt = 8 G* a
  const G = 210000 / 2.6;
  close(h.kt, 8 * (G / (2 * 1.7)) * h.a, { rtol: 1e-9, label: "kt" });
});

test("Hertz: ongelijke materialen en geen trekkracht", () => {
  const alu = { ...steel, m2: "alu" };
  const Es = 1 / ((1 - 0.09) / 210000 + (1 - 0.33 * 0.33) / 70000);
  close(hertz(alu, 0.001).Es, Es, { rtol: 1e-9 });
  const f = contactForce(steel, { x: 0, y: 5.5 }, { x: 0, y: 0 }, 0);      // bal boven het vlak: los
  assert.equal(f.Fn, 0); assert.ok(f.open);
});

test("borstelmodel: heen en terug geeft hysterese (kracht bij x = 0 niet nul)", () => {
  const e = { ...steel, ax: 0, ay: 0, ang: 0 };
  const y = 5 - deltaFor(e, 100), dt = 1e-3;
  let x = 0, z = 0, Ft0 = null, FtBack = null, slipSeen = false;
  const step = vx => {
    const c = contactForce(e, { x, y }, { x: vx, y: 0 }, z);
    z = c.z + c.dz * dt; x += vx * dt;
    const c2 = contactForce(e, { x, y }, { x: vx, y: 0 }, z); z = c2.z;
    if (c2.slip) slipSeen = true;
    return c2;
  };
  Ft0 = contactForce(e, { x, y }, { x: 0, y: 0 }, z).Ft;
  const v = 0.005;                                   // mm/s: 5 um per s
  for (let i = 0; i < 1000; i++) step(v);           // naar x = +5 um
  assert.ok(slipSeen, "bij 5 um moet het slippen");
  for (let i = 0; i < 1000; i++) step(-v);          // terug naar x = 0
  assert.ok(Math.abs(x) < 1e-9);
  FtBack = contactForce(e, { x, y }, { x: 0, y: 0 }, z).Ft;
  close(Ft0, 0, { atol: 1e-12, label: "Ft heenweg bij x=0" });
  close(FtBack, 0.15 * 100, { rtol: 0.02, label: "Ft terugweg bij x=0 = mu*Fn" });
});

// bal in een V-groef (twee vlakken van +-45 graden), preload 100 N per flank, trekkracht via actuator + veer
function vgroef() {
  const y0 = (5 - deltaFor(steel, 100)) / Math.SQRT1_2;
  resetModel({
    gravity: true, simDur: 2, dtStep: 0.2,
    nodes: [{ id: "K", x: 0, y: y0, m: 2 * 100 * Math.SQRT1_2 / 9.81 }, { id: "D", x: 200, y: y0, support: "pin" },
            { id: "E", x: 80, y: y0, support: "slider", dir: 0, ax: 80, ay: y0 }],
    elems: [{ id: "c1", type: "contact", node: "K", ax: 0, ay: 0, ang: -45, ...steel },
            { id: "c2", type: "contact", node: "K", ax: 0, ay: 0, ang: 45, ...steel },
            { id: "sp", type: "spring", a: "E", b: "K", k: 2, L0: 80 },
            { id: "ac", type: "actuator", a: "D", b: "E", len: 120, min: 70, max: 170, freq: 1 }]
  });
  return run(computeDyn());
}
test("V-groef: in evenwicht 100 N per flank en een hysteresislus van ~1 um", () => {
  const S = vgroef();
  assert.ok(S && S.ok[360]);
  close(S.C.c1[0].Fn, 100, { rtol: 0.01, label: "Fn flank 1" });
  close(S.C.c2[0].Fn, 100, { rtol: 0.01, label: "Fn flank 2" });
  const x = S.pos.K.map(p => p.x * 1000), F = S.EF.sp;
  // tweede periode: x bij F = 0 op de opgaande en neergaande tak
  const up = [], dn = [];
  for (let i = 181; i <= 360; i++) if (F[i - 1] * F[i] < 0) {
    const a = F[i - 1] / (F[i - 1] - F[i]), xc = x[i - 1] + a * (x[i] - x[i - 1]);
    (F[i] > F[i - 1] ? up : dn).push(xc);
  }
  assert.ok(up.length >= 1 && dn.length >= 1);
  const width = Math.abs(dn[0] - up[0]);
  assert.ok(width > 0.6 && width < 1.6, "lusbreedte " + width + " um");
  assert.ok(S.C.c1.some(c => c.slip), "er wordt gesleten");
});

// voorspanning: veer 10 N/mm met 50 N voorspanning drukt de bal op het vlak; een zachte trekveer trekt hem eraf
test("voorspanning: stijfheid onder F_p veel hoger dan erboven (knik bij F = F_p)", () => {
  const Fp = 50, ks = 10;
  resetModel({
    simDur: 5, dtStep: 0.25,
    nodes: [{ id: "B", x: 0, y: 0, m: 5, support: "slider", dir: 90 }, { id: "P", x: 0, y: -60, support: "pin" },
            { id: "C", x: 0, y: 200, support: "pin" }, { id: "D", x: 0, y: 20, support: "slider", dir: 90, ax: 0, ay: 20 }],
    elems: [{ id: "c", type: "contact", node: "B", ax: 0, ay: -5 + deltaFor(steel, Fp), ang: 0, ...steel },
            { id: "pre", type: "spring", a: "B", b: "P", k: ks, L0: 60 - Fp / ks },
            { id: "pull", type: "spring", a: "D", b: "B", k: 1, L0: 20 },
            { id: "ac", type: "actuator", a: "C", b: "D", len: 180, min: 75, max: 180, freq: 0.1 }]
  });
  const S = run(computeDyn());
  assert.ok(S && S.ok[360]);
  const F = S.EF.pull, y = S.pos.B.map(p => p.y);
  const at = f => { for (let i = 1; i <= 360; i++) if (F[i - 1] < f && F[i] >= f) return y[i - 1] + (f - F[i - 1]) / (F[i] - F[i - 1]) * (y[i] - y[i - 1]); return NaN; };
  const kLow = (30 - 10) / (at(30) - at(10));            // N/mm onder F_p
  const kHigh = (90 - 70) / (at(90) - at(70));           // N/mm boven F_p
  close(kHigh, ks, { rtol: 0.1, label: "boven F_p alleen de veer" });
  assert.ok(kLow > 100 * kHigh, `kLow ${kLow} vs kHigh ${kHigh}`);
  // het contact opent bij F ~ F_p
  const iOpen = S.C.c.findIndex(c => c.open);
  close(F[iOpen], Fp, { atol: 3, label: "openen bij F_p" });
});
