import test from "node:test";
import { leafSpring, parallelLeaf, crossPivot, notchHinge, wireFlexure, freqTrans, freqRot } from "../../src/calc/flexures.js";
import { material } from "../../src/calc/materials.js";
import { close } from "./helpers.mjs";

const st = material("staal");
const base = { E: st.E, nu: st.nu, sigma: st.sigma, F: 0, m: 0.1, u: 0.5 };

test("bladveer L=20 b=10 t=0.2 staal", () => {
  const r = leafSpring(Object.assign({ L: 20, b: 10, t: 0.2 }, base));
  // c_x = 210000*10*0.008/8000 = 2.1 N/mm ; u_max = 300*400/(3*210000*0.2) = 0.952 mm
  close(r.cx, 2.1, { rtol: 1e-9 });
  close(r.uMax, 120000 / 126000, { rtol: 1e-9 });
  close(r.cz0, 21000, { rtol: 1e-9 });                    // 210000*2/20
  close(r.dz, 0.6 * 0.25 / 20, { rtol: 1e-9 });           // 0.0075 mm
  close(r.Pcr, Math.PI ** 2 * 1400 / 400, { rtol: 1e-9 }); // EI = 1400 Nmm²
  close(r.sb, 3 * 210000 * 0.2 * 0.5 / 400, { rtol: 1e-9 }); // 157.5 MPa
  close(leafSpring(Object.assign({ L: 20, b: 10, t: 0.2 }, base, { u: r.uMax })).sb, 300, { rtol: 1e-9 });
});

test("bladveer t=0.1: c_x = 0.2625 N/mm", () => {
  close(leafSpring(Object.assign({ L: 20, b: 10, t: 0.1 }, base)).cx, 0.2625, { rtol: 1e-9 });
});

test("frequentie: eenheden", () => {
  // c = 2.1 N/mm = 2100 N/m, m = 0.1 kg: sqrt(21000)/2pi = 23.06 Hz
  close(freqTrans(2.1, 0.1), Math.sqrt(21000) / (2 * Math.PI), { rtol: 1e-12 });
  close(freqTrans(2.1, 0.1), 23.06, { atol: 0.01 });
  // 1000 Nmm/rad = 1 Nm/rad, m=1 kg op 100 mm: J=0.01 -> sqrt(100)/2pi
  close(freqRot(1000, 1, 100), 10 / (2 * Math.PI), { rtol: 1e-12 });
});

test("parallelle bladveer", () => {
  const r = parallelLeaf(Object.assign({ L: 20, b: 10, t: 0.2 }, base));
  close(r.cx, 4.2, { rtol: 1e-9 });
  close(r.Pcr, 2 * Math.PI ** 2 * 1400 / 400, { rtol: 1e-9 });
  close(r.dz, 0.0075, { atol: 1e-9 });
});

test("kruisveerscharnier", () => {
  // c = 2EI/L = 2*210000*(10*0.008/12)/20 = 140 Nmm/rad ; phi_max = 2*300*20/(210000*0.2) = 0.2857 rad
  const r = crossPivot(Object.assign({ L: 20, b: 10, t: 0.2, phi: 0.1, r: 50 }, base));
  close(r.c, 140, { rtol: 1e-9 });
  close(r.phiMax, 12000 / 42000, { rtol: 1e-9 });
  close(r.sb, 210000 * 0.2 * 0.1 / 40, { rtol: 1e-9 });   // 105 MPa
});

test("notch hinge (Paros-Weisbord)", () => {
  // b=10 t=0.3 R=3: c = 2*210000*10*0.3^2.5/(9 pi sqrt3) = 4228 Nmm/rad
  const p = Object.assign({ b: 10, t: 0.3, R: 3, phi: 0.005, Kt: 1.5, r: 50 }, base);
  const r = notchHinge(p);
  close(r.c, 4228, { rtol: 2e-3 });
  close(notchHinge(Object.assign({}, p, { phi: r.phiMax })).sigma, 300, { rtol: 1e-9 });
  close(r.phiMax, 0.00709, { rtol: 5e-3 });
});

test("draadflexure", () => {
  // d=1, L=50, staal: A=0.7854, I=0.04909 ; c_ax = 210000*0.7854/50 = 3298.7 N/mm
  const p = Object.assign({ L: 50, d: 1, bc: "guided" }, base);
  const g = wireFlexure(p);
  close(g.cax, 3298.67, { rtol: 1e-4 });
  close(g.cb, 12 * 210000 * 0.0490874 / 125000, { rtol: 1e-4 });   // 0.9896 N/mm
  const f = wireFlexure(Object.assign({}, p, { bc: "free" }));
  close(f.cb, g.cb / 4, { rtol: 1e-12 });
  close(f.Pcr, g.Pcr / 4, { rtol: 1e-12 });
  close(g.uMax, 300 * 2500 / (3 * 210000), { rtol: 1e-9 });        // 1.19 mm
});
