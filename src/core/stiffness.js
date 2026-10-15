// Lineaire statische stijfheid en eigenfrequenties van het getekende raamwerk (zonder DOM).
//
// Elk punt heeft drie vrijheidsgraden (x, y, θ). De elementen:
//   Volledig (EA + EI)   2D Euler–Bernoulli-balk, 6×6: EA/L, 12EI/L³, 6EI/L², 4EI/L, 2EI/L (Przemieniecki, hoofdstuk 4)
//   Axiaal / veer / krachtopnemer / speling / contact   een veer langs de verbindingslijn (contact: k_n in de normaal)
//   Flexure              stijve schakel met een draaiveer K in punt a (PRBM, zoals in de andere modi)
//   Oneindig (stijf)     een balk met EA en EI van RIGID_FACTOR × de grootste elastische stijfheid van het model (penalty)
//   Actuator             op de huidige lengte vastgezet: net als Oneindig, maar met scharnieren aan beide kanten
// Verbindingen in een punt (n.joint): "star" (momentvast: de balkuiteinden delen de knoophoek), "pin" (scharnier: elk
// uiteinde draait vrij), "spring" (torsieveer k_θ tussen elk uiteinde en de knoophoek), of "auto" (zie jointOf).
// Opleggingen: pin (x, y vast), slider (alleen de normaal op de glijbaan vast), met n.clamp ook de draaiing vast.
// Het getekende model is de onbelaste referentiestand; voorspanning geeft geen verplaatsing en geometrische stijfheid
// (spanningsverstijving) is verwaarloosd. Eenheden: mm, N, MPa, kg (massa's als N·s²/mm), rad.
import { axialA, beamSect, isAxial, isBeam, matOf, sigAllow } from "./axial.js";
import { frame as contactFrame, hertz } from "./contact.js";
import { dist, gapPen, N } from "./elements.js";
import { flexK, flexRef, flexStress } from "./flexure.js";
import { backSubT, congruence, cholesky, jacobiEig } from "./linalg.js";
import { bounds } from "./kinematics.js";
import { sensorMass, springK } from "./sensors.js";
import { model } from "./state.js";

export const RIGID_FACTOR = 1e5;          // stijve schakel: EA en EI zijn 10^5 × de grootste elastische stijfheid in het model
export const NSEG = 24;                    // segmenten waarmee een balk getekend en op spanning gekeurd wordt
const G_ACC = 9.81;                        // m/s²
const TOL = 1e-11;                         // pivot ≤ TOL × diagonaal betekent: singulier (mechanisme)

/* ---------- elementmatrices ---------- */
export function frameKlocal(EA, EI, L) {
  const a = EA / L, b = 12 * EI / L ** 3, c = 6 * EI / L ** 2, d = 4 * EI / L, e = 2 * EI / L;
  return [
    [a, 0, 0, -a, 0, 0],
    [0, b, c, 0, -b, c],
    [0, c, d, 0, -c, e],
    [-a, 0, 0, a, 0, 0],
    [0, -b, -c, 0, b, -c],
    [0, c, e, 0, -c, d]
  ];
}
// consistente massamatrix van een balk, mu = massa per lengte (N·s²/mm per mm)
export function frameMlocal(mu, L) {
  const m = mu * L / 420, L2 = L * L;
  return [
    [140 * m, 0, 0, 70 * m, 0, 0],
    [0, 156 * m, 22 * L * m, 0, 54 * m, -13 * L * m],
    [0, 22 * L * m, 4 * L2 * m, 0, 13 * L * m, -3 * L2 * m],
    [70 * m, 0, 0, 140 * m, 0, 0],
    [0, 54 * m, 13 * L * m, 0, 156 * m, -22 * L * m],
    [0, -13 * L * m, -3 * L2 * m, 0, -22 * L * m, 4 * L2 * m]
  ];
}
const tmat = (c, s) => [[c, s, 0, 0, 0, 0], [-s, c, 0, 0, 0, 0], [0, 0, 1, 0, 0, 0], [0, 0, 0, c, s, 0], [0, 0, 0, -s, c, 0], [0, 0, 0, 0, 0, 1]];
function toGlobal(Kl, T) {            // Tᵀ·Kl·T
  const n = 6, A = [], G = [];
  for (let i = 0; i < n; i++) { A.push(new Float64Array(n)); G.push(new Float64Array(n)); }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < n; k++) s += Kl[i][k] * T[k][j]; A[i][j] = s; }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < n; k++) s += T[k][i] * A[k][j]; G[i][j] = s; }
  return G;
}

/* ---------- verbindingen ---------- */
// "auto": Star in een vrij punt waar een Volledige balk aan zit; Scharnier bij een scharnier- of glijder-oplegging
// (ingeklemd: Star) en tussen stijve schakels onderling.
export function jointOf(n, nBeam) {
  const p = n.joint;
  if (p === "star" || p === "pin" || p === "spring") return { type: p, k: p === "spring" ? Math.max(0, +n.kth || 0) : 0, auto: false };
  const sup = n.support === "pin" || n.support === "slider";
  return { type: sup ? (n.clamp ? "star" : "pin") : nBeam >= 1 ? "star" : "pin", k: 0, auto: true };
}
export const beamsAt = id => model.elems.filter(e => isBeam(e) && (e.a === id || e.b === id) && N(e.a) && N(e.b));
export const jointFor = n => jointOf(n, beamsAt(n.id).length);
export const hasBeams = () => model.elems.some(e => isBeam(e) && N(e.a) && N(e.b));

/* ---------- opbouw van het stelsel ---------- */
function newMat(n) { const K = []; for (let i = 0; i < n; i++) K.push(new Float64Array(n)); return K; }

export function buildSystem() {
  const nodes = model.nodes, nIdx = new Map(nodes.map((n, i) => [n.id, i]));
  const mem = [], spr = [];           // balkachtige leden en veren
  let other = 0;                       // elementen die geen Volledige balk zijn (voor de analytische controles)
  const nBeam = new Map();
  for (const e of model.elems) {
    if (e.type === "force" || e.type === "damper" || SENS.has(e.type) && e.type !== "loadcell") continue;
    if (e.type === "contact") {
      const n = N(e.node); if (!n) continue;
      const f = contactFrame(e, n), h = hertz(e, f.delta);
      if (f.delta > 0 && h.kn > 0) spr.push({ e, kind: "contact", node: e.node, k: h.kn, nx: f.nx, ny: f.ny });
      other++; continue;
    }
    if (!N(e.a) || !N(e.b)) continue;
    const A = N(e.a), B = N(e.b), L = dist(A, B);
    if (!(L > 1e-9)) continue;
    const c = (B.x - A.x) / L, s = (B.y - A.y) / L;
    if (isBeam(e)) {
      const sec = beamSect(e), mat = matOf(e);
      mem.push({ e, kind: "beam", a: e.a, b: e.b, L, c, s, EA: mat.E * sec.A, EI: mat.E * sec.I, sec, mat, carrier: true });
      nBeam.set(e.a, (nBeam.get(e.a) || 0) + 1); nBeam.set(e.b, (nBeam.get(e.b) || 0) + 1);
    } else if (e.type === "link" && isAxial(e)) { spr.push({ e, kind: "axial", a: e.a, b: e.b, L, c, s, k: springK(e) }); other++; }
    else if (e.type === "link") { mem.push({ e, kind: "rigid", a: e.a, b: e.b, L, c, s, carrier: true, rigid: true }); other++; }
    else if (e.type === "actuator") { mem.push({ e, kind: "rigid", a: e.a, b: e.b, L, c, s, carrier: false, rigid: true }); other++; }
    else if (e.type === "flexure") { mem.push({ e, kind: "flex", a: e.a, b: e.b, L, c, s, carrier: false, rigid: true, K: flexK(e) }); other++; }
    else if (e.type === "spring") { if (e.k > 0) spr.push({ e, kind: "spring", a: e.a, b: e.b, L, c, s, k: e.k }); other++; }
    else if (e.type === "loadcell") { spr.push({ e, kind: "loadcell", a: e.a, b: e.b, L, c, s, k: springK(e) }); other++; }
    else if (e.type === "gap") { if (gapPen(e, L) !== 0 && e.kc > 0) spr.push({ e, kind: "gap", a: e.a, b: e.b, L, c, s, k: e.kc }); other++; }
  }
  // grootste elastische stijfheid: bepaalt de penalty voor stijve schakels
  let kmax = 0;
  for (const m of mem) if (!m.rigid) kmax = Math.max(kmax, m.EA / m.L, 12 * m.EI / m.L ** 3);
  for (const m of mem) if (m.kind === "flex") kmax = Math.max(kmax, m.K / (m.L * m.L));
  for (const p of spr) kmax = Math.max(kmax, p.k);
  for (const n of nodes) { const j = jointOf(n, nBeam.get(n.id) || 0); if (j.type === "spring") kmax = Math.max(kmax, j.k / 100); }
  const kref = kmax > 0 ? kmax : 1;
  for (const m of mem) if (m.rigid) { m.EA = RIGID_FACTOR * kref * m.L; m.EI = RIGID_FACTOR * kref * m.L ** 3; }

  // vrijheidsgraden: 3 per punt, plus een eigen draaiing voor elk scharnierend balkuiteinde
  let nd = 3 * nodes.length;
  const info = [];
  nodes.forEach(n => { info.push({ node: n.id, kind: "x" }, { node: n.id, kind: "y" }, { node: n.id, kind: "rot" }); });
  const joints = new Map(nodes.map(n => [n.id, jointOf(n, nBeam.get(n.id) || 0)]));
  const tors = [];                      // torsieveren {p, q, k}: q = -1 is de grond
  for (const m of mem) {
    m.rot = [0, 0];
    [m.a, m.b].forEach((id, end) => {
      const i = nIdx.get(id), jt = joints.get(id);
      if (m.carrier && jt.type === "star") m.rot[end] = 3 * i + 2;
      else {
        const d = nd++; info.push({ node: id, kind: "rot", member: m.e.id }); m.rot[end] = d;
        if (m.carrier && jt.type === "spring" && jt.k > 0) tors.push({ p: d, q: 3 * i + 2, k: jt.k });
      }
    });
  }
  for (const m of mem) if (m.kind === "flex") {          // draaiveer in a ten opzichte van de grond of de referentieschakel
    const r = flexRef(m.e), rm = r ? mem.find(x => x.e === r) : null;
    let q = -1;
    if (rm) q = rm.a === m.a ? rm.rot[0] : rm.rot[1];
    tors.push({ p: m.rot[0], q, k: m.K });
  }
  m_dofs(mem, nIdx);

  const K = newMat(nd), F = new Float64Array(nd);
  const addB = (idx, Ke) => { for (let i = 0; i < idx.length; i++) for (let j = 0; j < idx.length; j++) K[idx[i]][idx[j]] += Ke[i][j]; };
  for (const m of mem) {
    m.Kl = frameKlocal(m.EA, m.EI, m.L);
    m.T = tmat(m.c, m.s);
    addB(m.dofs, toGlobal(m.Kl, m.T));
  }
  for (const p of spr) {
    if (p.kind === "contact") {
      const i = nIdx.get(p.node), ix = 3 * i, iy = 3 * i + 1, a = p.k * p.nx * p.nx, b = p.k * p.nx * p.ny, d = p.k * p.ny * p.ny;
      K[ix][ix] += a; K[ix][iy] += b; K[iy][ix] += b; K[iy][iy] += d;
      p.dofs = [ix, iy]; continue;
    }
    const ia = nIdx.get(p.a), ib = nIdx.get(p.b), c = p.c, s = p.s, k = p.k;
    const v = [c, s, -c, -s], idx = [3 * ia, 3 * ia + 1, 3 * ib, 3 * ib + 1];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) K[idx[i]][idx[j]] += k * v[i] * v[j];
    p.dofs = idx;
  }
  for (const t of tors) {
    K[t.p][t.p] += t.k;
    if (t.q >= 0) { K[t.q][t.q] += t.k; K[t.p][t.q] -= t.k; K[t.q][t.p] -= t.k; }
  }

  // belastingen: krachten, zwaartekracht (puntmassa's en eigen gewicht van de balken)
  const gravity = !!model.gravity;
  for (const e of model.elems) if (e.type === "force" && nIdx.has(e.node)) {
    const i = nIdx.get(e.node), th = (e.ang || 0) * Math.PI / 180;
    F[3 * i] += e.mag * Math.cos(th); F[3 * i + 1] += e.mag * Math.sin(th);
  }
  if (gravity) for (const n of nodes) {
    const w = ((n.m > 0 ? n.m : 0) + sensorMass(n.id)) * G_ACC;
    F[3 * nIdx.get(n.id) + 1] -= w;
  }
  for (const m of mem) {
    m.q = { x: 0, y: 0 }; m.feq = new Float64Array(6);
    if (!(gravity && m.kind === "beam")) continue;
    const w = m.mat.rho * 1e-9 * m.sec.A * G_ACC;                   // N/mm
    const qx = -w * m.s, qy = -w * m.c, L = m.L;                     // (0, -w) in het lokale stelsel
    m.q = { x: qx, y: qy };
    const fl = [qx * L / 2, qy * L / 2, qy * L * L / 12, qx * L / 2, qy * L / 2, -qy * L * L / 12];
    for (let i = 0; i < 6; i++) m.feq[i] = fl[i];
    for (let i = 0; i < 6; i++) { let g = 0; for (let k = 0; k < 6; k++) g += m.T[k][i] * fl[k]; F[m.dofs[i]] += g; }
  }

  // opleggingen
  const fixed = new Set(), sliders = [];
  for (const n of nodes) {
    const i = nIdx.get(n.id);
    const gnd = n.clamp || (joints.get(n.id).type === "spring");       // draaiing vast; bij een torsieveer op een oplegging is de knoophoek de grond
    if (n.support === "pin") { fixed.add(3 * i); fixed.add(3 * i + 1); if (gnd) fixed.add(3 * i + 2); }
    else if (n.support === "slider") {
      const ph = (n.dir || 0) * Math.PI / 180;
      sliders.push({ ix: 3 * i, iy: 3 * i + 1, c: Math.cos(ph), s: Math.sin(ph), node: n.id });
      fixed.add(3 * i + 1); if (gnd) fixed.add(3 * i + 2);
    }
  }
  // dofs zonder enige stijfheid horen nergens aan vast (bv. de knoophoek van een scharnier): weglaten
  // (een verplaatsing zonder stijfheid is wel een mechanisme, behalve bij een punt dat nergens aan vastzit)
  const touched = new Set();
  for (const m of mem) { touched.add(m.a); touched.add(m.b); }
  for (const p of spr) { if (p.a) { touched.add(p.a); touched.add(p.b); } else touched.add(p.node); }
  const active = new Array(nd).fill(true);
  for (let i = 0; i < nd; i++) {
    let mx = 0; const r = K[i]; for (let j = 0; j < nd; j++) { const a = Math.abs(r[j]); if (a > mx) mx = a; }
    if (mx === 0 && (info[i].kind === "rot" || !touched.has(info[i].node))) active[i] = false;
  }
  return { nodes, nIdx, mem, spr, nd, info, joints, K, F, fixed, sliders, active, kref, gravity, other, nBeam };
}
const SENS = new Set(["loadcell", "dsens", "encoder", "accel"]);

// dofs per lid: [ax, ay, rotA, bx, by, rotB]
function m_dofs(mem, nIdx) {
  for (const m of mem) {
    const ia = nIdx.get(m.a), ib = nIdx.get(m.b);
    m.dofs = [3 * ia, 3 * ia + 1, m.rot[0], 3 * ib, 3 * ib + 1, m.rot[1]];
  }
}

/* ---------- rekenwerk ---------- */
function rotateSliders(sys, K, v) {                 // basis (t, n) op glijderpunten: K' = R K Rᵀ, v' = R v
  const n = sys.nd;
  for (const sl of sys.sliders) {
    const { ix, iy, c, s } = sl;
    if (K) {
      for (let j = 0; j < n; j++) { const a = K[ix][j], b = K[iy][j]; K[ix][j] = c * a + s * b; K[iy][j] = -s * a + c * b; }
      for (let i = 0; i < n; i++) { const a = K[i][ix], b = K[i][iy]; K[i][ix] = c * a + s * b; K[i][iy] = -s * a + c * b; }
    }
    if (v) { const a = v[ix], b = v[iy]; v[ix] = c * a + s * b; v[iy] = -s * a + c * b; }
  }
}
function unrotate(sys, v) {
  for (const sl of sys.sliders) { const { ix, iy, c, s } = sl; const a = v[ix], b = v[iy]; v[ix] = c * a - s * b; v[iy] = s * a + c * b; }
}

// Cholesky op een kopie; geeft { L } of { fail: index }
function chol(Kff, tol) {
  const m = Kff.length, L = [];
  const d0 = new Float64Array(m);
  for (let i = 0; i < m; i++) { L.push(new Float64Array(m)); d0[i] = Kff[i][i]; }
  for (let i = 0; i < m; i++) {
    const Li = L[i], Ki = Kff[i];
    for (let j = 0; j <= i; j++) {
      const Lj = L[j];
      let s = Ki[j];
      for (let k = 0; k < j; k++) s -= Li[k] * Lj[k];
      if (i === j) { if (!(s > tol * Math.max(d0[i], 1e-300))) return { fail: i }; Li[i] = Math.sqrt(s); }
      else Li[j] = s / Lj[j];
    }
  }
  return { L };
}
function lsolve(L, b, m) {            // L·y = b (vooruit), daarna Lᵀ·x = y
  const y = new Float64Array(m);
  for (let i = 0; i < m; i++) { let s = b[i]; const Li = L[i]; for (let k = 0; k < i; k++) s -= Li[k] * y[k]; y[i] = s / Li[i]; }
  const x = new Float64Array(m);
  for (let i = m - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < m; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
  return x;
}

export const dofText = (sys, d) => {
  const inf = sys.info[d], n = N(inf.node);
  return { node: n ? n.name : "?", kind: inf.kind };
};

// herkent een verouderde uitkomst (het model is intussen anders)
export const modelKey = () => model.nodes.map(n => n.id).join() + "|" + model.elems.map(e => e.id).join();
export function solveStiffness() {
  const sys = buildSystem();
  const res = { sys, key: modelKey(), ok: false, empty: false, mech: null, nodes: new Map(), members: [], reactions: [], maxDisp: 0, sigMax: null, eq: 0 };
  if (!sys.mem.length && !sys.spr.length) { res.empty = true; return res; }
  const nd = sys.nd, K0 = sys.K, Kr = K0.map(r => Float64Array.from(r));
  const F = Float64Array.from(sys.F);
  rotateSliders(sys, Kr, F);
  const free = [];
  for (let i = 0; i < nd; i++) if (sys.active[i] && !sys.fixed.has(i)) free.push(i);
  const m = free.length;
  const Kff = free.map(i => { const r = new Float64Array(m); for (let j = 0; j < m; j++) r[j] = Kr[i][free[j]]; return r; });
  res.free = free; res.nfree = m; res.Kr = Kr;
  // factoriseren; bij singulariteit een vrije beweging benoemen en dat dof vastzetten om verder te zoeken
  let fac = chol(Kff, TOL);
  if (fac.fail !== undefined) {
    const mech = [], work = Kff.map(r => Float64Array.from(r));
    let maxd = 0; for (let i = 0; i < m; i++) maxd = Math.max(maxd, Kff[i][i]);
    let f = fac;
    for (let it = 0; it < 6 && f.fail !== undefined; it++) {
      const i = f.fail, v = new Float64Array(m);
      if (i > 0) {                             // nulvector: K[0:i,0:i]·x = −K[0:i,i]
        const lead = []; for (let r = 0; r < i; r++) lead.push(work[r].subarray(0, i));
        const c2 = chol(lead, 1e-300);
        if (c2.L) { const x = lsolve(c2.L, Float64Array.from({ length: i }, (_, r) => -work[r][i]), i); for (let r = 0; r < i; r++) v[r] = x[r]; }
      }
      v[i] = 1;
      mech.push(describeMech(sys, free, v));
      work[i][i] += 1e6 * maxd;
      f = chol(work, TOL);
    }
    res.mech = { items: mech, count: mech.length + (f.fail !== undefined ? 1 : 0) };
    res.mech.text = mechText(res.mech);
    return res;
  }
  const L = fac.L;
  const rhs = Float64Array.from(free, i => F[i]);
  const xf = lsolve(L, rhs, m);
  const u = new Float64Array(nd);
  free.forEach((i, k) => { u[i] = xf[k]; });
  // controle: restkracht van K·u − F op de vrije dofs
  let rn = 0, fn = 0;
  for (let a = 0; a < m; a++) { let s = -rhs[a]; for (let b = 0; b < m; b++) s += Kff[a][b] * xf[b]; rn += s * s; fn += rhs[a] * rhs[a]; }
  res.resid = Math.sqrt(rn / Math.max(fn, 1e-300));
  unrotate(sys, u);
  res.u = u; res.L = L; res.F = F;
  res.ok = true;
  postProcess(sys, res, u);
  res.pointK = (id, angDeg) => pointStiffness(sys, res, id, angDeg);
  return res;
}

function describeMech(sys, free, v) {
  // het dof met de grootste bijdrage: verplaatsing in mm, draaiing × karakteristieke lengte
  let Lc = 0; for (const mm of sys.mem) Lc = Math.max(Lc, mm.L);
  if (!(Lc > 0)) Lc = 100;
  const score = new Map();
  free.forEach((d, k) => {
    const inf = sys.info[d], w = Math.abs(v[k]) * (inf.kind === "rot" ? Lc : 1);
    const key = inf.node + "|" + inf.kind;
    score.set(key, Math.max(score.get(key) || 0, w));
  });
  let best = null, bs = -1;
  score.forEach((w, key) => { if (w > bs) { bs = w; best = key; } });
  const [id, kind] = best.split("|"), n = N(id);
  return { node: id, name: n ? n.name : "?", kind };
}
function mechText(mech) {
  const w = k => (k === "rot" ? "kan vrij draaien" : k === "x" ? "kan vrij verschuiven in x-richting" : "kan vrij verschuiven in y-richting");
  const seen = new Set(), parts = [];
  for (const it of mech.items) { const k = it.name + it.kind; if (seen.has(k)) continue; seen.add(k); parts.push("punt " + it.name + " " + w(it.kind)); }
  return "Mechanisme: " + parts.join("; ") + (mech.count > parts.length ? " (en nog meer)" : "") + ". Voeg een steun, balk of inklemming toe.";
}

/* ---------- uitkomsten per lid ---------- */
function postProcess(sys, res, u) {
  const { nodes, nIdx } = sys;
  let maxU = 0;
  for (const n of nodes) {
    const i = nIdx.get(n.id), act = sys.active[3 * i + 2];
    const d = { ux: u[3 * i], uy: u[3 * i + 1], th: act ? u[3 * i + 2] : NaN, id: n.id, name: n.name };
    res.nodes.set(n.id, d); maxU = Math.max(maxU, Math.hypot(d.ux, d.uy));
  }
  // afrondingsruis (relatief < 1e-9 van het grootste getal) tonen we als 0
  const cl = (v, ref) => (Math.abs(v) < (sys.mem.some(m => m.rigid) ? 1e-5 : 1e-9) * ref ? 0 : v);      // met een penalty-schakel is de ruis groter
  let maxT = 0; res.nodes.forEach(d => { if (!Number.isNaN(d.th)) maxT = Math.max(maxT, Math.abs(d.th)); });
  res.nodes.forEach(d => { d.ux = cl(d.ux, maxU); d.uy = cl(d.uy, maxU); if (!Number.isNaN(d.th)) d.th = cl(d.th, maxT); });
  res.maxDisp = maxU;
  let best = null;
  const consider = (val, e, frac, allow) => {
    if (!best || val > best.val) best = { val, ratio: val / allow, e, frac };
  };
  for (const m of sys.mem) {
    const ue = m.dofs.map(d => u[d]);
    const ul = new Float64Array(6);
    for (let i = 0; i < 6; i++) { let s = 0; for (let k = 0; k < 6; k++) s += m.T[i][k] * ue[k]; ul[i] = s; }
    const fl = new Float64Array(6);
    for (let i = 0; i < 6; i++) { let s = -m.feq[i]; for (let k = 0; k < 6; k++) s += m.Kl[i][k] * ul[k]; fl[i] = s; }
    const rec = { m, e: m.e, kind: m.kind, ul, fl, ue, a: m.a, b: m.b, L: m.L, c: m.c, s: m.s, NN: -fl[0], sig: null, ratio: null };
    if (m.kind === "beam") {
      const A = m.sec.A, I = m.sec.I, cc = m.sec.c, allow = sigAllow(m.e);
      const sig = new Float64Array(NSEG + 1), Ms = new Float64Array(NSEG + 1), Ns = new Float64Array(NSEG + 1);
      let mx = 0, mxk = 0;
      for (let k = 0; k <= NSEG; k++) {
        const x = m.L * k / NSEG;
        const Nx = -(fl[0] + m.q.x * x), Mx = -fl[2] + fl[1] * x + m.q.y * x * x / 2;
        Ns[k] = Nx; Ms[k] = Mx; sig[k] = Math.abs(Nx) / A + Math.abs(Mx) * cc / I;
        if (sig[k] > mx) { mx = sig[k]; mxk = k; }
      }
      rec.sig = sig; rec.M = Ms; rec.Nx = Ns; rec.sigMax = mx; rec.ratio = mx / allow; rec.allow = allow;
      rec.Mmax = Math.max(...Array.from(Ms, Math.abs));
      consider(mx, m.e, mxk / NSEG, allow);
    } else if (m.kind === "flex") {
      const rm = flexRef(m.e), rotA = ue[2];
      const rr = rm ? sys.mem.find(x => x.e === rm) : null;
      const refRot = rr ? u[rr.a === m.a ? rr.rot[0] : rr.rot[1]] : 0;
      const phi = rotA - refRot, st = flexStress(m.e, phi);
      rec.phi = phi; rec.sigMax = st.sigma; rec.ratio = st.ratio; rec.allow = st.allow; rec.Mf = -m.K * phi;
      consider(st.sigma, m.e, 0, st.allow);
    }
    res.members.push(rec);
  }
  for (const p of sys.spr) {
    if (p.kind === "contact") { res.members.push({ kind: "contact", e: p.e, p }); continue; }
    const ia = nIdx.get(p.a), ib = nIdx.get(p.b);
    const dl = (u[3 * ib] - u[3 * ia]) * p.c + (u[3 * ib + 1] - u[3 * ia + 1]) * p.s, NN = p.k * dl;
    const rec = { kind: p.kind, e: p.e, p, a: p.a, b: p.b, dL: dl, NN, L: p.L, c: p.c, s: p.s };
    if (p.kind === "axial") {
      const A = axialA(p.e), allow = sigAllow(p.e);
      rec.sigMax = Math.abs(NN) / A; rec.ratio = rec.sigMax / allow; rec.allow = allow;
      consider(rec.sigMax, p.e, 0.5, allow);
    }
    res.members.push(rec);
  }
  res.sigMax = best;
  // reacties: R = K0·u − F_ext op de dofs van de opleggingen
  for (const n of nodes) {
    if (n.support !== "pin" && n.support !== "slider") continue;
    const i = nIdx.get(n.id), row = k => { let s = -sys.F[k]; const r = sys.K[k]; for (let j = 0; j < sys.nd; j++) s += r[j] * u[j]; return s; };
    const Rx = row(3 * i), Ry = row(3 * i + 1), Mz = n.clamp ? row(3 * i + 2) : 0;
    res.reactions.push({ id: n.id, name: n.name, Rx, Ry, Mz, clamp: !!n.clamp, slider: n.support === "slider" });
  }
  let rmax = 0, mmax = 0;
  for (const r of res.reactions) { rmax = Math.max(rmax, Math.abs(r.Rx), Math.abs(r.Ry)); mmax = Math.max(mmax, Math.abs(r.Mz)); }
  for (const r of res.reactions) { r.Rx = cl(r.Rx, rmax); r.Ry = cl(r.Ry, rmax); r.Mz = cl(r.Mz, mmax); }
  let sx = 0, sy = 0, sc = 0;
  for (const r of res.reactions) { sx += r.Rx; sy += r.Ry; sc = Math.max(sc, Math.hypot(r.Rx, r.Ry)); }
  for (let i = 0; i < nodes.length; i++) { sx += sys.F[3 * i]; sy += sys.F[3 * i + 1]; }
  res.eq = Math.hypot(sx, sy);          // evenwicht: som van reacties en belastingen (N), hoort ~0 te zijn
}

/* ---------- stijfheid in een punt ---------- */
function pointStiffness(sys, res, nodeId, angDeg) {
  const i = sys.nIdx.get(nodeId); if (i === undefined) return null;
  const th = angDeg * Math.PI / 180, dx = Math.cos(th), dy = Math.sin(th);
  const v = new Float64Array(sys.nd);
  v[3 * i] = dx; v[3 * i + 1] = dy;
  rotateSliders(sys, null, v);
  const rhs = Float64Array.from(res.free, d => v[d]);
  const x = lsolve(res.L, rhs, res.nfree);
  const w = new Float64Array(sys.nd);
  res.free.forEach((d, k) => { w[d] = x[k]; });
  unrotate(sys, w);
  const d = w[3 * i] * dx + w[3 * i + 1] * dy;              // mm per N
  const k = d > 1e-300 ? 1 / d : Infinity;
  return { k, compliance: d, ux: w[3 * i], uy: w[3 * i + 1], kUm: k / 1000 };
}

/* ---------- vervormde vorm ---------- */
// kubische Hermite-kromme langs een balk, met de verplaatsingen in u (globaal) vergroot met `scale`.
// Geeft [{x, y}] (wereld, mm), ns + 1 punten.
export function memberCurve(sys, rec, u, scale, ns, withLoad) {
  const A = N(rec.a), B = N(rec.b), out = [];
  if (!rec.m) {
    const ia = sys.nIdx.get(rec.a), ib = sys.nIdx.get(rec.b);
    return [{ x: A.x + scale * u[3 * ia], y: A.y + scale * u[3 * ia + 1] }, { x: B.x + scale * u[3 * ib], y: B.y + scale * u[3 * ib + 1] }];
  }
  const m = rec.m, L = m.L, c = m.c, s = m.s, d = m.dofs;
  const ue = d.map(k => u[k]);
  const u1 = c * ue[0] + s * ue[1], v1 = -s * ue[0] + c * ue[1], t1 = ue[2];
  const u2 = c * ue[3] + s * ue[4], v2 = -s * ue[3] + c * ue[4], t2 = ue[5];
  const EI = m.EI, qy = withLoad && m.q ? m.q.y : 0;
  for (let k = 0; k <= ns; k++) {
    const xi = k / ns, x = xi * L;
    const N1 = 1 - 3 * xi * xi + 2 * xi ** 3, N2 = L * (xi - 2 * xi * xi + xi ** 3), N3 = 3 * xi * xi - 2 * xi ** 3, N4 = L * (-xi * xi + xi ** 3);
    let v = N1 * v1 + N2 * t1 + N3 * v2 + N4 * t2;
    if (qy) v += qy * x * x * (L - x) * (L - x) / (24 * EI);
    const ax = u1 + (u2 - u1) * xi;
    const lx = x + scale * ax, ly = scale * v;
    out.push({ x: A.x + c * lx - s * ly, y: A.y + s * lx + c * ly });
  }
  return out;
}

/* ---------- eigenfrequenties ---------- */
export function computeModes(res, nModes) {
  const sys = res.sys, nd = sys.nd;
  const M = newMat(nd);
  for (const n of sys.nodes) {
    const i = sys.nIdx.get(n.id), mm = ((n.m > 0 ? n.m : 0) + sensorMass(n.id)) * 1e-3;
    M[3 * i][3 * i] += mm; M[3 * i + 1][3 * i + 1] += mm;
  }
  for (const m of sys.mem) if (m.kind === "beam") {
    const mu = m.mat.rho * 1e-9 * m.sec.A * 1e-3;                 // N·s²/mm per mm
    const Mg = toGlobal(frameMlocal(mu, m.L), m.T);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) M[m.dofs[i]][m.dofs[j]] += Mg[i][j];
  }
  rotateSliders(sys, M, null);
  const free = res.free;
  let mx = 0; for (let i = 0; i < nd; i++) mx = Math.max(mx, Math.abs(M[i][i]));
  if (!(mx > 0)) return { modes: [], msg: "Geen massa in het model: geef punten een puntmassa of gebruik Volledige balken." };
  const hasM = free.map(d => { for (let j = 0; j < nd; j++) if (M[d][j] !== 0) return true; return false; });
  const mi = [], si = [];
  free.forEach((d, k) => (hasM[k] ? mi : si).push(k));
  const Kf = (a, b) => res.Kr[free[a]][free[b]];
  const nm = mi.length, ns = si.length;
  if (nm > 700) return { modes: [], msg: "Te veel vrijheidsgraden voor eigenfrequenties (" + nm + ")." };
  let Kred = mi.map(a => Float64Array.from(mi, b => Kf(a, b)));
  let X = null, facS = null;
  if (ns) {
    const Kss = si.map(a => Float64Array.from(si, b => Kf(a, b)));
    facS = chol(Kss, TOL);
    if (!facS.L) return { modes: [], msg: "Massaloze vrijheidsgraden zijn niet vast te leggen." };
    X = mi.map(a => {                                             // kolommen Kss⁻¹·K_s,m
      const col = Float64Array.from(si, b => Kf(b, a));
      return lsolve(facS.L, col, ns);
    });
    for (let a = 0; a < nm; a++) for (let b = 0; b < nm; b++) {
      let s = 0; for (let k = 0; k < ns; k++) s += Kf(mi[a], si[k]) * X[b][k];
      Kred[a][b] -= s;
    }
  }
  const Mmm = mi.map(a => Float64Array.from(mi, b => M[free[a]][free[b]]));
  const Lm = cholesky(Mmm);
  if (!Lm) return { modes: [], msg: "De massamatrix is niet positief: voeg massa toe aan de vrije punten." };
  // kleine problemen: Cholesky-reductie en Jacobi op alles; grote: de laagste modes met deelruimte-iteratie (Jacobi op het kleine probleem)
  let eig;
  if (nm <= 80) eig = jacobiEig(congruence(Lm, Kred)).map(e => ({ val: e.val, vec: backSubT(Lm, e.vec) }));
  else eig = lowModes(Kred, Mmm, Math.min(nm, Math.max(2 * nModes, nModes + 6)));
  eig.sort((p, q) => p.val - q.val);
  const modes = [];
  for (const ev of eig) {
    if (!(ev.val > 0)) continue;                                  // K is positief definiet: dit is afrondingsruis
    if (modes.length >= nModes) break;
    const phim = ev.vec;
    const full = new Float64Array(nd);
    mi.forEach((a, k) => { full[free[a]] = phim[k]; });
    if (ns) {
      for (let k = 0; k < ns; k++) { let s = 0; for (let a = 0; a < nm; a++) s += X[a][k] * phim[a]; full[free[si[k]]] = -s; }
    }
    unrotate(sys, full);
    let mxT = 0;
    for (const n of sys.nodes) { const i = sys.nIdx.get(n.id); mxT = Math.max(mxT, Math.hypot(full[3 * i], full[3 * i + 1])); }
    if (!(mxT > 0)) for (let i = 0; i < nd; i++) mxT = Math.max(mxT, Math.abs(full[i]));
    for (let i = 0; i < nd; i++) full[i] /= mxT || 1;
    modes.push({ f: Math.sqrt(ev.val) / (2 * Math.PI), lam: ev.val, shape: full });
  }
  return { modes, msg: "" };
}

// laagste eigenparen van K·φ = λ·M·φ met deelruimte-iteratie: Y = K⁻¹·M·X, daarna Rayleigh–Ritz in de deelruimte
function lowModes(K, M, q) {
  const n = K.length, fac = chol(K, 1e-300);
  if (!fac.L) return [];
  let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) - 0.5;
  let X = []; for (let j = 0; j < q; j++) X.push(Float64Array.from({ length: n }, rnd));
  const mul = (A, v) => { const o = new Float64Array(n); for (let i = 0; i < n; i++) { let s = 0; const r = A[i]; for (let k = 0; k < n; k++) s += r[k] * v[k]; o[i] = s; } return o; };
  const dot = (a, b) => { let s = 0; for (let i = 0; i < n; i++) s += a[i] * b[i]; return s; };
  let vals = null, Z = null;
  for (let it = 0; it < 60; it++) {
    const Y = X.map(x => lsolve(fac.L, mul(M, x), n));
    const KY = Y.map(y => mul(K, y)), MY = Y.map(y => mul(M, y));
    const Kr = [], Mr = [];
    for (let a = 0; a < q; a++) { Kr.push(new Float64Array(q)); Mr.push(new Float64Array(q)); }
    for (let a = 0; a < q; a++) for (let b = 0; b <= a; b++) { Kr[a][b] = Kr[b][a] = dot(Y[a], KY[b]); Mr[a][b] = Mr[b][a] = dot(Y[a], MY[b]); }
    const Lr = cholesky(Mr); if (!Lr) break;
    const eg = jacobiEig(congruence(Lr, Kr)).sort((p, c) => p.val - c.val);
    Z = eg.map(e => backSubT(Lr, e.vec));
    const nv = eg.map(e => e.val);
    X = Z.map(z => { const o = new Float64Array(n); for (let a = 0; a < q; a++) { const y = Y[a], c = z[a]; for (let i = 0; i < n; i++) o[i] += c * y[i]; } return o; });
    let done = !!vals;
    if (vals) for (let k = 0; k < Math.max(1, q >> 1); k++) if (Math.abs(nv[k] - vals[k]) > 1e-9 * Math.abs(nv[k])) { done = false; break; }
    vals = nv; lowModes.iters = it + 1;
    if (done) break;
  }
  return vals ? vals.map((v, k) => ({ val: v, vec: X[k] })) : [];
}

/* ---------- analytische controles ----------
   Als het model precies een eenvoudig ligger- of uitkragingsgeval is, geven we de formule naast de FE-uitkomst. */
export function analyticChecks(res, modes) {
  if (!res || !res.ok) return [];
  const sys = res.sys;
  if (sys.other > 0 || !sys.mem.length || sys.mem.some(m => m.kind !== "beam")) return [];
  const deg = new Map();
  for (const m of sys.mem) { deg.set(m.a, (deg.get(m.a) || 0) + 1); deg.set(m.b, (deg.get(m.b) || 0) + 1); }
  const ends = [...deg].filter(([, d]) => d === 1).map(([id]) => id);
  if (ends.length !== 2 || [...deg.values()].some(d => d > 2)) return [];
  // keten van P naar Q
  const order = (start) => {
    const nodesO = [start], used = new Set(); let cur = start, len = 0;
    for (;;) {
      const nx = sys.mem.find(m => !used.has(m) && (m.a === cur || m.b === cur));
      if (!nx) break;
      used.add(nx); len += nx.L; cur = nx.a === cur ? nx.b : nx.a; nodesO.push(cur);
    }
    return { ids: nodesO, L: len, count: used.size };
  };
  const forward = order(ends[0]);
  if (forward.count !== sys.mem.length) return [];
  const sec0 = sys.mem[0];
  for (const m of sys.mem) if (Math.abs(m.EI - sec0.EI) > 1e-9 * sec0.EI || Math.abs(m.EA - sec0.EA) > 1e-9 * sec0.EA || Math.abs(m.mat.rho - sec0.mat.rho) > 1e-9) return [];
  const forces = model.elems.filter(e => e.type === "force" && N(e.node));
  const out = [];
  const tryChain = (ids) => {
    const P = N(ids[0]), Q = N(ids[ids.length - 1]), Ltot = dist(P, Q);
    const ex = [(Q.x - P.x) / Ltot, (Q.y - P.y) / Ltot], ey = [-ex[1], ex[0]];
    for (const id of ids) {                                    // alle punten op een lijn
      const n = N(id), off = (n.x - P.x) * ey[0] + (n.y - P.y) * ey[1];
      if (Math.abs(off) > 1e-6 * Ltot) return null;
    }
    const EI = sec0.EI, mu = sec0.mat.rho * 1e-9 * sec0.sec.A * 1e-3;
    const ang = Math.atan2(ex[1], ex[0]) * 180 / Math.PI;
    const dirMod = (a, b) => { let d = ((a - b) % 180 + 180) % 180; return Math.min(d, 180 - d); };
    const jointNo = n => n.joint !== "pin" && n.joint !== "spring";
    const mids = ids.slice(1, -1).map(N);
    if (mids.some(n => n.support !== "free" || n.clamp)) return null;
    const nm = model.nodes.some(n => n.m > 0) || model.elems.some(e => e.type === "accel" || (e.type === "loadcell" && e.m > 0));
    const perp = f => f.mag * (Math.cos(f.ang * Math.PI / 180) * ey[0] + Math.sin(f.ang * Math.PI / 180) * ey[1]);
    const disp = id => res.nodes.get(id);
    const perpU = id => disp(id).ux * ey[0] + disp(id).uy * ey[1];
    const nameOf = id => N(id).name;
    const clampedP = P.support === "pin" && P.clamp && jointNo(P), free = Q.support === "free" && !Q.clamp;
    if (!sys.gravity && forces.length === 1) {
      const f = forces[0], Fp = perp(f);
      if (clampedP && free && f.node === Q.id && Math.abs(Fp) > 0) {
        const rows = [{ k: "Tipuitzakking δ = F·L³/(3EI)", an: Fp * Ltot ** 3 / (3 * EI), fe: perpU(Q.id), unit: "µm", f: 1000, at: nameOf(Q.id) },
          { k: "Tiphoek θ = F·L²/(2EI)", an: Fp * Ltot ** 2 / (2 * EI), fe: disp(Q.id).th, unit: "µrad", f: 1e6, at: nameOf(Q.id) }];
        out.push({ id: "uitkraging", title: "Uitkragende balk (Roark)", rows });
      } else if (clampedP && Q.support === "slider" && Q.clamp && jointNo(Q) && dirMod(Q.dir || 0, ang + 90) < 1e-6 && f.node === Q.id && Math.abs(Fp) > 0) {
        out.push({ id: "geleid", title: "Geleide uitkraging (Roark)", rows: [
          { k: "Uitzakking δ = F·L³/(12EI)", an: Fp * Ltot ** 3 / (12 * EI), fe: perpU(Q.id), unit: "µm", f: 1000, at: nameOf(Q.id) },
          { k: "Stijfheid k = 12EI/L³", an: 12 * EI / Ltot ** 3, fe: Fp / perpU(Q.id), unit: "N/µm", f: 1e-3, at: nameOf(Q.id) }] });
      } else {
        const pinnedP = P.support === "pin" && !P.clamp;
        const okQ = (Q.support === "pin" && !Q.clamp) || (Q.support === "slider" && !Q.clamp && dirMod(Q.dir || 0, ang) < 1e-6);
        const fn = N(f.node);
        const along = fn ? ((fn.x - P.x) * ex[0] + (fn.y - P.y) * ex[1]) / Ltot : -1;
        if (pinnedP && okQ && Math.abs(along - 0.5) < 1e-6 && ids.includes(f.node) && Math.abs(Fp) > 0)
          out.push({ id: "ligger", title: "Vrij opgelegde balk (Roark)", rows: [
            { k: "Uitbuiging midden δ = F·L³/(48EI)", an: Fp * Ltot ** 3 / (48 * EI), fe: perpU(f.node), unit: "µm", f: 1000, at: nameOf(f.node) }] });
      }
    }
    if (!nm && modes && modes.length) {
      if (clampedP && free) {
        const fa = 1.8751041 ** 2 / (2 * Math.PI) * Math.sqrt(EI / (mu * Ltot ** 4));
        out.push({ id: "uitkraging-f", title: "Eerste buigfrequentie uitkraging", rows: [
          { k: "f₁ = 1,875²/(2π)·√(EI/(ρAL⁴))", an: fa, fe: modes[0].f, unit: "Hz", f: 1 }] });
      } else if (P.support === "pin" && !P.clamp && (Q.support === "pin" && !Q.clamp || (Q.support === "slider" && !Q.clamp && dirMod(Q.dir || 0, ang) < 1e-6))) {
        const fa = Math.PI / 2 * Math.sqrt(EI / (mu * Ltot ** 4));
        out.push({ id: "ligger-f", title: "Eerste buigfrequentie vrij opgelegde balk", rows: [
          { k: "f₁ = π/2·√(EI/(ρAL⁴))", an: fa, fe: modes[0].f, unit: "Hz", f: 1 }] });
      }
    }
    return out.length ? out : null;
  };
  // beide richtingen proberen (de inklemming kan aan P of Q zitten)
  const r1 = tryChain(forward.ids);
  if (r1) return r1;
  out.length = 0;
  const r2 = tryChain(forward.ids.slice().reverse());
  return r2 || [];
}

/* ---------- vergroting van de weergave ---------- */
const nice125 = x => { const e = 10 ** Math.floor(Math.log10(x)), m = x / e; return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * e; };
const spanOf = () => { const bb = bounds(); return bb ? Math.max(Math.hypot(bb.b.x - bb.a.x, bb.b.y - bb.a.y), 20) : 100; };
// automatisch: de grootste verplaatsing wordt ongeveer 10 % van de afmeting van het model (1-2-5, nooit kleiner dan ×1)
export function autoScale(res) {
  if (!res || !(res.maxDisp > 0)) return 1;
  const raw = Math.min(0.1 * spanOf() / res.maxDisp, 1e7);
  return raw <= 1 ? 1 : nice125(raw);
}
export const effectiveScale = res => (model.stiffScale > 0 ? model.stiffScale : autoScale(res));
export const modeScale = () => 0.07 * spanOf();           // eigenvormen zijn genormeerd op een grootste verplaatsing van 1
