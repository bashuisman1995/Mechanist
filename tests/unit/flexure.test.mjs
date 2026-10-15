import test from "node:test";
import assert from "node:assert/strict";
import { computeDyn } from "../../src/core/dynamics.js";
import { flexK, flexStress, GAMMA, KTHETA } from "../../src/core/flexure.js";
import { computeFrf, frfVal } from "../../src/core/frf.js";
import { crossPivot, notchHinge } from "../../src/calc/flexures.js";
import { close, resetModel, run } from "./helpers.mjs";

const leaf = { type: "flexure", kind: "cantilever", wd: 10, t: 0.5, L: 40, R: 3, Kt: 1.5, mat: "staal", sig: 0, pre: 0, ref: "" };

test("PRBM-bladveer: K = gamma*K_theta*E*I/L tegen handberekening", () => {
  // E = 210000 MPa, I = 10*0.5^3/12 = 0.104167 mm4, EI = 21875 N mm2
  // K = 0,85 * 2,65 * 21875 / 40 = 1231,8 N mm/rad
  close(flexK(leaf), 0.85 * 2.65 * 21875 / 40, { rtol: 1e-9, label: "K" });
  close(flexK(leaf), 1231.84, { atol: 0.01, label: "K (getal)" });
  assert.equal(GAMMA, 0.85); assert.equal(KTHETA, 2.65);
  // spanning: sigma = K_theta*E*t*phi/(2L), phi = 0,05 rad -> 2,65*210000*0.5*0.05/80 = 173,9 MPa
  close(flexStress(leaf, 0.05).sigma, 2.65 * 210000 * 0.5 * 0.05 / 80, { rtol: 1e-9, label: "sigma" });
  close(flexStress(leaf, 0.05).ratio, 173.91 / 300, { atol: 1e-3, label: "ratio met sigma_toel 300" });
});

test("kruisveerscharnier en inkeping gebruiken src/calc/flexures.js", () => {
  const cr = { ...leaf, kind: "cross", L: 20 }, nt = { ...leaf, kind: "notch", t: 0.3, R: 3 };
  const base = { E: 210000, nu: 0.3, b: 10, sigma: 300, phi: 0, F: 0, m: 1, r: 1 };
  close(flexK(cr), crossPivot({ ...base, t: 0.5, L: 20 }).c, { rtol: 1e-12 });
  close(flexK(cr), 2 * 21875 / 20, { rtol: 1e-9, label: "2EI/L" });
  close(flexK(nt), notchHinge({ ...base, t: 0.3, R: 3, Kt: 1.5 }).c, { rtol: 1e-12 });
  close(flexStress(nt, 0.01).sigma, notchHinge({ ...base, t: 0.3, R: 3, Kt: 1.5, phi: 0.01 }).sigma, { rtol: 1e-12, label: "notch sigma" });
});

// parallelgeleiding: twee bladen van 50 x 20 x 0,5 mm, elk als twee halve bladen (S-vorm), tafel B1-B2
function guide(extra = {}) {
  const f = (id, a, b) => ({ id, ...leaf, a, b, wd: 20, t: 0.5, L: 25, len: 21.25, ...extra });
  return resetModel({
    nodes: [{ id: "A1", x: 0, y: 0, support: "pin" }, { id: "A2", x: 40, y: 0, support: "pin" },
            { id: "M1", x: 0, y: 21.25, m: 0.002 }, { id: "M2", x: 40, y: 21.25, m: 0.002 },
            { id: "B1", x: 0, y: 42.5, m: 0.05 }, { id: "B2", x: 40, y: 42.5, m: 0.05 }],
    elems: [{ id: "st", type: "link", a: "B1", b: "B2", len: 40 },
            f("f1", "A1", "M1"), { ...f("f2", "B1", "M1"), ref: "st" },
            f("f3", "A2", "M2"), { ...f("f4", "B2", "M2"), ref: "st" },
            { id: "F", type: "force", node: "B1", mag: 1, ang: 0 }],
    mode: "frf"
  });
}

test("parallelgeleiding: PRBM-stijfheid binnen 5 % van 24EI/L^3 (verwacht +3,9 %)", () => {
  guide();
  const S = run(computeFrf());
  assert.ok(S, "FRF opgelost");
  // laagfrequent: x van de tafel per N = 1/c_x (mm/N)
  const c = 1 / frfVal(S, "n|B1|x", 0)[0];
  const EI = 210000 * 20 * 0.5 ** 3 / 12, cAn = 2 * 12 * EI / 50 ** 3;
  close(cAn, 8.4, { rtol: 1e-9, label: "analytisch 8,4 N/mm" });
  close(c, cAn, { rtol: 0.05, label: "c_x PRBM vs 24EI/L3" });
  close(c / cAn, KTHETA / (3 * GAMMA), { rtol: 0.005, label: "verhouding = K_theta/(3 gamma)" });
  // eerste eigenfrequentie: analytisch met de stijfheid 24EI/L3 en de tafelmassa 0,1 kg (+ een deel van de bladmassa)
  const f1 = S.modes.find(m => m.f > 1e-6).f, fAn = Math.sqrt(cAn * 1000 / 0.1) / (2 * Math.PI);
  close(f1, fAn, { rtol: 0.05, label: "f1 vs analytisch" });
  // spanning en hoek lineair in de FRF: sigma = rate*phi
  const ph = frfVal(S, "f|f1|phi", 0), sg = frfVal(S, "f|f1|sig", 0);
  assert.ok(Math.abs(ph[0]) > 0);
  close(sg[0] / ph[0], 2.65 * 210000 * 0.5 / (2 * 25) * Math.PI / 180, { rtol: 1e-6, label: "sigma per graad" });
});

test("torsieslinger: FRF-eigenfrequentie en Dynamica-evenwicht volgen uit K", () => {
  // schakel van 42,5 mm uit scharnier A met massa 0,2 kg aan de tip; J = m l^2, f = sqrt(K/J)/2pi
  const l = 42.5, m = 0.2;
  resetModel({
    nodes: [{ id: "A", x: 0, y: 0, support: "pin" }, { id: "B", x: l, y: 0, m }],
    elems: [{ id: "f1", ...leaf, a: "A", b: "B", L: 50, len: l },
            { id: "F", type: "force", node: "B", mag: -1, ang: 90 }],
    mode: "frf"
  });
  const K = flexK({ ...leaf, L: 50 }) / 1000;                 // N m/rad
  const fAn = Math.sqrt(K / (m * (l / 1000) ** 2)) / (2 * Math.PI);
  const S = run(computeFrf());
  close(S.modes.find(x => x.f > 1e-6).f, fAn, { rtol: 0.01, label: "f torsieslinger" });
  // Evenwicht: kracht 1 N omlaag; phi = F l / K, B zakt l*sin(phi)
  resetModel({
    nodes: [{ id: "A", x: 0, y: 0, support: "pin" }, { id: "B", x: l, y: 0, m }],
    elems: [{ id: "f1", ...leaf, a: "A", b: "B", L: 50, len: l },
            { id: "F", type: "force", node: "B", mag: 1, ang: 270 }],
    mode: "dyn", durMode: "equil", cVisc: 0.02, maxT: 20, dtStep: 0.5
  });
  const D = run(computeDyn());
  assert.ok(D, "dynamica loopt");
  const last = D.pos.B[D.pos.B.length - 1];
  const phi = Math.asin(-last.y / l), phi0 = 1 * l / (K * 1000);
  close(phi, phi0, { rtol: 0.03, label: "evenwichtshoek" });
  const FX = D.FX.f1[D.FX.f1.length - 1];
  close(FX, -phi, { rtol: 0.01, label: "S.FX = scharnierhoek" });
});
