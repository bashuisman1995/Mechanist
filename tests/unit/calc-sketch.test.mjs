import test from "node:test";
import assert from "node:assert/strict";
import { leafSpring, parallelLeaf, crossPivot } from "../../src/calc/flexures.js";
import { msd, harmonic, mindlinLoop, isolator, dynAmp } from "../../src/calc/dynamics.js";
import { material } from "../../src/calc/materials.js";
import { kinCoupling } from "../../src/calc/contact.js";
import { sketchSpec, toDoc } from "../../src/calc/sketchspec.js";
import { computeFrf, frfVal } from "../../src/core/frf.js";
import { solveStiffness } from "../../src/core/stiffness.js";
import { close, resetModel, run } from "./helpers.mjs";

const st = material("staal");
const M = { E: st.E, nu: st.nu, sigma: st.sigma, alpha: st.alpha, rho: st.rho };

function load(S) {
  const d = toDoc(S);
  resetModel({ nodes: d.nodes, elems: d.elems, ...d.props });
  return d;
}

test("Open in Schets: bladveer, Stijfheid-modus geeft c_x van de calculator binnen 1 %", () => {
  const p = { L: 20, b: 10, t: 0.2, u: 0.5, F: 0, m: 0.1, drive: "stiff", plate: false };
  const r = leafSpring({ ...p, ...M });
  load(sketchSpec("leaf", p, r, M, { mat: "staal" }));
  const res = solveStiffness();
  assert.ok(res.ok);
  const k = res.pointK("B", 90);
  close(k.k, r.cx, { rtol: 0.01, label: "k" });
});

test("Open in Schets: parallelle bladveer geeft c_x = 2·12EI/L³ binnen 1 %", () => {
  const p = { L: 20, b: 10, t: 0.2, u: 0.5, F: 0, m: 0.1, drive: "stiff", plate: false };
  const r = parallelLeaf({ ...p, ...M });
  load(sketchSpec("par", p, r, M, { mat: "staal" }));
  const res = solveStiffness();
  assert.ok(res.ok);
  close(res.pointK("B", 90).k, r.cx, { rtol: 0.01, label: "k" });
});

test("Open in Schets: kruisveerscharnier geeft c/r² in het punt", () => {
  const p = { L: 20, b: 10, t: 0.2, phi: 5, r: 50, F: 0, m: 0.1, plate: false };
  const r = crossPivot({ ...p, ...M, phi: p.phi * Math.PI / 180 });
  const S = sketchSpec("cross", p, r, M, { mat: "staal" });
  load(S);
  const res = solveStiffness();
  assert.ok(res.ok);
  close(res.pointK("B", 90).k, r.c / p.r ** 2, { rtol: 0.01, label: "k" });
});

test("Open in Schets: massa-veer in FRF heeft f1 = f_n binnen 1 %", () => {
  const p = { m: 2, k: 5, dmode: "zeta", dval: 5, fd: 5 };
  const s = msd(p);
  const S = sketchSpec("msd", p, { ...s, peak: 1 }, M);
  load(S);
  const F = run(computeFrf());
  assert.ok(F);
  close(F.modes[0].f, s.fn, { rtol: 0.01, label: "f1" });
  close(F.modes[0].zeta, s.zeta, { rtol: 0.02, label: "zeta" });
});

test("Open in Schets: trillingsisolatie in FRF geeft T uit de calculator", () => {
  const p = { m: 100, k: 20, zeta: 5, fd: 20, xin: 1 };
  const r = isolator({ m: p.m, k: p.k, zeta: p.zeta, f: p.fd }); r.xout = r.T; r.fiso = Math.SQRT2 * r.fn;
  const S = sketchSpec("iso", p, r, M);
  const d = load(S);
  d.props.frfIn && assert.equal(d.props.frfIn, "actuator#0");
  const act = d.elems.find(e => e.type === "actuator");
  const F = run(computeFrf());
  assert.ok(F);
  close(F.modes[0].f, r.fn, { rtol: 0.01, label: "f1" });
  assert.ok(act);
});

test("harmonic(): stationair en beginvoorwaarden kloppen met een RK4-integratie", () => {
  for (const zeta of [0.05, 1, 2]) {
    const wn = 30, w = 25;
    let x = 0, v = 0; const dt = 1e-5; let tt = 0;
    const acc = (x, v, t) => wn * wn * Math.sin(w * t) - 2 * zeta * wn * v - wn * wn * x;
    for (let i = 0; i < 100000; i++) {                     // 1 s
      const k1x = v, k1v = acc(x, v, tt), k2x = v + dt / 2 * k1v, k2v = acc(x + dt / 2 * k1x, k2x, tt + dt / 2);
      const k3x = v + dt / 2 * k2v, k3v = acc(x + dt / 2 * k2x, k3x, tt + dt / 2), k4x = v + dt * k3v, k4v = acc(x + dt * k3x, k4x, tt + dt);
      x += dt / 6 * (k1x + 2 * k2x + 2 * k3x + k4x); v += dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v); tt += dt;
    }
    close(harmonic(zeta, wn, w, tt), x, { atol: 2e-4, label: "zeta " + zeta });
  }
  close(harmonic(0.1, 20, 15, 0), 0, { atol: 1e-12 });
  assert.ok(dynAmp(0.5, 0.1) > 1);
});

test("Mindlin-lus sluit en heeft de beginstijfheid k_t", () => {
  const mp = { N: 50, mu: 0.15, kt: 2000 };
  const a = mindlinLoop(mp, 0.2), b = mindlinLoop(mp, 1);
  close(b.d, a.d, { rtol: 1e-9, label: "gesloten lus" });
  close(b.Q, a.Q, { rtol: 1e-9 });
  const s = 1e-4, m = mindlinLoop(mp, s * 0.2);
  close(m.Q / m.d, mp.kt, { rtol: 1e-3, label: "beginstijfheid" });
  assert.ok(mindlinLoop(mp, 0.6).d < 0 && mindlinLoop(mp, 0.6).Q < 0);
});

test("kinematische koppeling: spec heeft per flank de calculatorkracht", () => {
  const p = { R: 6, gamma: 90, F: 60, mu: 0.15, mat1: "staal", mat2: "staal" };
  const k = kinCoupling({ F: p.F, R: p.R, gamma: p.gamma, mu: p.mu, E1: st.E, nu1: st.nu, E2: st.E, nu2: st.nu });
  const S = sketchSpec("kc", p, k, M);
  assert.equal(S.elems.filter(e => e.type === "contact").length, 2);
  close(S.expect.find(e => e.k === "N").v, p.F / (6 * Math.sin(Math.PI / 4)), { rtol: 1e-9 });
});
