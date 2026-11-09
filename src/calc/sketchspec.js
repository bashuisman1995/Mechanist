// Calculator -> schetsmodel. Puur, zonder DOM: geeft een beschrijving van een equivalent parametrisch model met de waarden van de calculator.
// spec = { nodes: [{name, x, y, support, dir, clamp, m}], elems: [{type, a, b, node, ...eigenschappen}], model: {mode, ...}, series: [...], expect: [{k, v}], names }
// Knopen heten A, B, C ... in volgorde (zoals de schets ze zelf noemt). Eenheden: mm, N, kg, N/mm, N·s/mm.
import { contactDefaults, deltaFor, hertz } from "../core/contact.js";
import { flexDefaults } from "../core/flexure.js";

const G0 = 9.81;
export const SKETCHABLE = { leaf: 1, par: 1, cross: 1, notch: 1, wire: 1, hertz: 1, kc: 1, msd: 1, iso: 1, exp: 1 };
const CMAT = { staal: "staal", rvs: "rvs", alu: "alu", alumina: "keramiek", wc: "hardmetaal" };
export const contactMat = id => CMAT[id] || "staal";
const r4 = x => +Number(x).toPrecision(5);

function beamProps(p, M, mat, round) {
  const nu = M.nu === undefined ? 0.3 : M.nu;
  const o = { beam: true, mat, sig: M.sigma };
  if (round) { o.prof = "round"; o.pd = p.d; return o; }
  if (p.plate) {                                  // plaatbuiging: E/(1−ν²) als A en I met dezelfde factor
    const f = 1 / (1 - nu * nu);
    o.prof = "custom"; o.A = r4(p.b * p.t * f); o.I = r4(p.b * p.t ** 3 / 12 * f); o.cmax = p.t / 2; return o;
  }
  o.prof = "rect"; o.pb = p.b; o.ph = p.t; return o;
}

export function sketchSpec(id, p, r, M, ctx) {
  ctx = ctx || {};
  const mat = ctx.mat || "staal";
  const S = { nodes: [], elems: [], model: {}, series: [], expect: [], note: "" };
  const node = (name, x, y, o) => S.nodes.push(Object.assign({ name, x, y, support: "free", dir: 0 }, o || {}));
  if (id === "leaf" || id === "wire") {
    const wire = id === "wire", guided = !wire || p.bc === "guided", L = p.L;
    const c = wire ? r.cb : r.cx, F = p.u > 0 ? c * p.u : 1;
    node("A", 0, 0, { support: "pin", clamp: true });
    node("B", L, 0, guided ? { support: "slider", dir: 90, clamp: true, m: p.m } : { m: p.m });
    S.elems.push(Object.assign({ type: "link", a: "A", b: "B", len: L }, beamProps(p, M, mat, wire)));
    S.elems.push({ type: "force", node: "B", mag: F, ang: 90 });
    S.model = { mode: "stiff", stiffNode: "B", stiffAng: 90 };
    S.kExpect = c; S.fLoad = F;
    S.expect = [{ k: "k", v: c }, { k: "u", v: F / c }, { k: "sig", v: wire ? (guided ? 3 : 1.5) * M.E * p.d * (F / c) / L ** 2 : r.sb * (F / c) / (p.u > 0 ? p.u : F / c) }];
    if (wire) S.expect.push({ k: "kax", v: r.cax });
  } else if (id === "par") {
    const L = p.L, d = Math.round(L * 0.5 * 100) / 100, F = p.u > 0 ? r.cx * p.u : 1;
    node("A", 0, 0, { support: "pin", clamp: true }); node("B", L, 0, { m: p.m });
    node("C", 0, d, { support: "pin", clamp: true }); node("D", L, d);
    S.elems.push(Object.assign({ type: "link", a: "A", b: "B", len: L }, beamProps(p, M, mat)));
    S.elems.push(Object.assign({ type: "link", a: "C", b: "D", len: L }, beamProps(p, M, mat)));
    S.elems.push({ type: "link", a: "B", b: "D", len: d });             // stijve tafel (Oneindig)
    S.elems.push({ type: "force", node: "B", mag: F, ang: 90 });
    S.model = { mode: "stiff", stiffNode: "B", stiffAng: 90 };
    S.kExpect = r.cx; S.fLoad = F;
    S.expect = [{ k: "k", v: r.cx }, { k: "u", v: F / r.cx }];
  } else if (id === "cross" || id === "notch") {
    const phi = p.phi * Math.PI / 180, c = r.c, arm = p.r, F = phi > 0 ? c * phi / arm : 1 / arm;
    node("A", 0, 0, { support: "pin" }); node("B", arm, 0, { m: p.m });
    const fx = { type: "flexure", a: "A", b: "B", len: arm };
    Object.assign(fx, flexDefaults(id === "cross" ? "cross" : "notch", arm), { kind: id, wd: p.b, t: p.t, mat, sig: M.sigma, ref: "" });
    if (id === "cross") fx.L = p.L; else { fx.R = p.R; fx.Kt = p.Kt; }
    S.elems.push(fx);
    S.elems.push({ type: "force", node: "B", mag: F, ang: 90 });
    S.model = { mode: "stiff", stiffNode: "B", stiffAng: 90 };
    S.kExpect = c / arm ** 2; S.fLoad = F;
    S.expect = [{ k: "kth", v: c }, { k: "k", v: c / arm ** 2 }, { k: "phi", v: (phi > 0 ? phi : 1 / arm) * 180 / Math.PI }];
  } else if (id === "hertz") {
    const m1 = contactMat(p.mat1), m2 = contactMat(p.mat2), Re = r.Re, Fn = r.Fn;
    const c0 = Object.assign(contactDefaults(), { R: Re, m1, m2 });
    const dl = deltaFor(c0, Fn), h = hertz(c0, dl);
    node("A", 0, Re - dl, { support: "slider", dir: 90, m: 0.01 });
    S.elems.push(Object.assign({ type: "contact", node: "A", ax: 0, ay: 0, ang: 0 }, c0));
    S.elems.push({ type: "force", node: "A", mag: Fn, ang: -90 });
    S.model = { mode: "equil", gravity: false, cVisc: 2, maxT: 5, dtStep: 0.01, simDur: 0.2 };
    S.series = [["s", "contact#0", "F"], ["c", "contact#0", "d"]];
    S.expect = [{ k: "Fn", v: Fn }, { k: "delta", v: dl * 1000 }, { k: "deltaCalc", v: r.delta * 1000 }, { k: "kn", v: h.kn }, { k: "a", v: h.a * 1000 }];
    S.mapped = CMAT[p.mat1] !== p.mat1 || CMAT[p.mat2] !== p.mat2;
  } else if (id === "kc") {
    // één groef van de koppeling: bal in een V-groef (2D-doorsnede), belast met F/3; per flank N = F/(6·sin(γ/2)) zoals in de calculator
    const m1 = contactMat(p.mat1), m2 = contactMat(p.mat2), gam = p.gamma, sn = Math.sin(gam * Math.PI / 360);
    const N = r.N;
    const c0 = Object.assign(contactDefaults(), { R: p.R, m1, m2, mu: p.mu });
    const dl = deltaFor(c0, N), y0 = (p.R - dl) / sn, h = hertz(c0, dl), W = 200;
    const ang = 90 - gam / 2;
    node("A", 0, y0, { m: p.F / 3 / G0 }); node("B", W, y0, { support: "pin" }); node("C", W * 0.4, y0, { support: "slider", dir: 0 });
    S.elems.push({ type: "spring", a: "C", b: "A", k: 2, L0: W * 0.4 });
    S.elems.push({ type: "actuator", a: "B", b: "C", len: W * 0.6, min: W * 0.35, max: W * 0.85, freq: 1 });
    S.elems.push(Object.assign({ type: "contact", node: "A", ax: 0, ay: 0, ang: -ang }, c0));
    S.elems.push(Object.assign({ type: "contact", node: "A", ax: 0, ay: 0, ang }, c0));
    S.model = { mode: "dyn", gravity: true, simDur: 2, dtStep: 0.2 };
    S.expect = [{ k: "N", v: N }, { k: "delta", v: dl * 1000 }, { k: "a", v: h.a * 1000 }, { k: "kt", v: h.kt / 1000 }, { k: "xslip", v: 1.5 * p.mu * N / h.kt * 1e6 }];
    S.mapped = CMAT[p.mat1] !== p.mat1 || CMAT[p.mat2] !== p.mat2;
  } else if (id === "msd") {
    node("A", 0, 0, { support: "pin" }); node("B", 100, 0, { support: "slider", dir: 0, m: p.m });
    S.elems.push({ type: "spring", a: "A", b: "B", k: p.k, L0: 100 });
    S.elems.push({ type: "damper", a: "A", b: "B", c: r.c / 1000 });
    S.elems.push({ type: "force", node: "B", mag: 1, ang: 0 });
    S.model = { mode: "frf", dtStep: 0.05, simDur: 0.3 };
    S.series = [["n", "B", "x"]];
    S.expect = [{ k: "fn", v: r.fn }, { k: "zeta", v: r.zeta * 100 }, { k: "peak", v: r.peak }];
  } else if (id === "iso") {
    const c = 2 * (p.zeta / 100) * Math.sqrt(p.k * 1000 * p.m) / 1000;           // N·s/mm
    node("A", 0, 0, { support: "pin" }); node("B", 80, 0, { support: "slider", dir: 0 }); node("C", 180, 0, { support: "slider", dir: 0, m: p.m });
    S.elems.push({ type: "actuator", a: "A", b: "B", len: 80, min: 76, max: 84, freq: 1 });
    S.elems.push({ type: "spring", a: "B", b: "C", k: p.k, L0: 100 });
    S.elems.push({ type: "damper", a: "B", b: "C", c });
    S.model = { mode: "frf", frfIn: "actuator#0", dtStep: 0.05, simDur: 0.3 };
    S.series = [["n", "C", "x"]];
    S.expect = [{ k: "fn", v: r.fn }, { k: "T", v: r.T }, { k: "fiso", v: r.fiso }];
  } else if (id === "exp") {
    // staaf 2 (L2) van A naar B, staaf 1 (L1) van B terug naar P: P ligt op L2 − L1; ΔT als temperatuurstap
    node("A", 0, 0, { support: "pin" }); node("B", p.L2, 0, { support: "slider", dir: 0 }); node("C", p.L2 - p.L1, 0, { support: "slider", dir: 0 });
    S.elems.push({ type: "link", a: "A", b: "B", len: p.L2, mat: p.mat2 });
    S.elems.push({ type: "link", a: "B", b: "C", len: p.L1, mat: p.mat1 });
    S.model = { mode: "kin", dT: p.dT, thermNode: "C" };
    S.expect = [{ k: "dP", v: r.dP * 1000 }, { k: "d1", v: r.d1 * 1000 }, { k: "d2", v: r.d2 * 1000 }];
  }
  return S;
}

/** Document voor de kern (zoals een opgeslagen model): voor unit-tests en voor het laden. */
export function toDoc(S) {
  const nodes = S.nodes.map(n => Object.assign({ id: n.name, ax: n.x, ay: n.y }, n));
  const elems = S.elems.map((e, i) => {
    const o = Object.assign({ id: "e" + (i + 1) }, e);
    if (e.type === "link" && o.driver === undefined) o.driver = false;
    return o;
  });
  return { nodes, elems, props: Object.assign({}, S.model) };
}
