// Frequentieresponsie rond het statische evenwicht (zonder DOM).
import { contactPot } from "./contact.js";
import { flexK, flexPhi, flexPot, flexRef, flexRest, flexStressRate } from "./flexure.js";
import { axialA, axialK } from "./axial.js";
import { actLen, actuators, drivers, E, gapPen, isBar, jointDamper, N } from "./elements.js";
import { bounds, G, MM, relax } from "./kinematics.js";
import { sensorMass, springK, springL0, springLike, encBars, G_MM } from "./sensors.js";
import { backSubT, cholesky, congruence, gauss, jacobiEig, lsq } from "./linalg.js";
import { model, sim } from "./state.js";
import { t } from "../ui/i18n.js";

/* ============================================================
   FRF — frequentieresponsie rond het statische evenwicht
   1. Zoek het evenwicht: minimum van de potentiële energie V (veren,
      zwaartekracht, krachten), met alle aandrijvingen vastgezet.
   2. Beschrijf kleine bewegingen met de vrijheidsgraden η in de
      nulruimte Z van de randvoorwaarden, plus een vaste vorm p voor de
      ingang u (actuatorlengte of krukhoek):  q = q0 + Z·η + p·u.
   3. M = Zᵀ M Z,  C = Zᵀ C Z,  K = ∂²V/∂η² (numeriek, dus inclusief de
      stijfheid die zwaartekracht aan een slinger geeft).
   4. Per frequentie: (K − ω²M + iωC)·η = F(ω), en de uitgang volgt uit q.
   ============================================================ */
export function frfInputs() {
  const out = [];
  for (const e of actuators()) out.push({ id: e.id, kind: "act", e, u: "mm",
    lab: t("frf.in.act", { p: N(e.a).name + N(e.b).name }) });
  for (const d of drivers()) if (N(d.a) && N(d.b)) out.push({ id: d.id, kind: "crank", e: d, u: "rad",
    lab: t("frf.in.crank", { p: N(d.a).name + N(d.b).name }) });
  for (const e of model.elems) if (e.type === "force" && N(e.node)) out.push({ id: e.id, kind: "force", e, u: "N",
    lab: t("frf.in.force", { n: N(e.node).name }) });
  return out;
}

export function* computeFrf() {
  sim.frfMsg = "";
  const ins = frfInputs();
  const inp = ins.find(x => x.id === model.frfIn) || ins[0];
  if (!inp) { sim.frfMsg = t("frf.m.noin"); return null; }
  const fr = model.nodes.filter(n => n.support !== "pin");
  const nq = fr.length * 2;
  if (!nq) { sim.frfMsg = t("frf.m.nofree"); return null; }
  if (inp.kind === "force" && N(inp.e.node).support === "pin") { sim.frfMsg = t("frf.m.pin"); return null; }
  const fi = new Map(fr.map((n, i) => [n.id, i]));
  const ds = drivers().filter(d => N(d.a) && N(d.b) && N(d.a).support === "pin" && fi.has(d.b));
  const bars = model.elems.filter(e => isBar(e) && !e.driver && N(e.a) && N(e.b) &&
    !(N(e.a).support === "pin" && N(e.b).support === "pin"));
  const slis = model.nodes.filter(n => n.support === "slider");
  const dm = n => (n.m > 0 ? n.m : (model.defMass || 0.1)) + sensorMass(n.id);     // plus massa van sensoren
  const isIn = e => inp.e === e;
  const pos = (q, id) => fi.has(id) ? { x: q[2 * fi.get(id)], y: q[2 * fi.get(id) + 1] } : N(id);
  const vel = (v, id) => fi.has(id) ? { x: v[2 * fi.get(id)], y: v[2 * fi.get(id) + 1] } : { x: 0, y: 0 };
  const dot = (a, b) => { let t = 0; for (let k = 0; k < a.length; k++) t += a[k] * b[k]; return t; };

  const fxRest = flexRest();
  const bb = bounds();
  const size = bb ? Math.max(40, Math.hypot(bb.b.x - bb.a.x, bb.b.y - bb.a.y)) : 100;
  // stap voor numeriek differentiëren (mm): groot genoeg dat de afronding van de
  // oplosser (1e-7 mm) wegvalt, klein genoeg dat de kromming geen rol speelt
  const h = Math.max(0.01, size * 2e-3);

  // zet q op de randvoorwaarden, met ingang u op de actuator of kruk
  function place(q, u) {
    fr.forEach((n, i) => { n.x = q[2 * i]; n.y = q[2 * i + 1]; });
    sim.lenOv = new Map();
    for (const e of actuators()) sim.lenOv.set(e.id, actLen(e, 0).L + (inp.kind === "act" && isIn(e) ? u : 0));
    const tips = new Set();
    for (const d of ds) {
      const A = N(d.a), B = N(d.b);
      const th = (d.theta0 || 0) * Math.PI / 180 + (inp.kind === "crank" && isIn(d) ? u : 0);
      B.x = A.x + d.len * Math.cos(th); B.y = A.y + d.len * Math.sin(th); tips.add(B.id);
    }
    const ok = relax(tips);
    const out = new Float64Array(nq);
    fr.forEach((n, i) => { out[2 * i] = n.x; out[2 * i + 1] = n.y; });
    return ok ? out : null;
  }
  // Jacobiaan van de randvoorwaarden (afstandsvorm) en hoe de ingang erin zit
  function jrows(q) {
    const rows = [], b = [];
    for (const e of bars) {
      const P = pos(q, e.a), Q = pos(q, e.b), dx = P.x - Q.x, dy = P.y - Q.y, L = Math.hypot(dx, dy) || 1;
      const r = new Float64Array(nq);
      if (fi.has(e.a)) { const i = fi.get(e.a); r[2 * i] += dx / L; r[2 * i + 1] += dy / L; }
      if (fi.has(e.b)) { const i = fi.get(e.b); r[2 * i] -= dx / L; r[2 * i + 1] -= dy / L; }
      rows.push(r); b.push(inp.kind === "act" && isIn(e) ? 1 : 0);
    }
    for (const n of slis) {
      const th = n.dir * Math.PI / 180, r = new Float64Array(nq), i = fi.get(n.id);
      r[2 * i] = -Math.sin(th); r[2 * i + 1] = Math.cos(th);
      rows.push(r); b.push(0);
    }
    for (const d of ds) {
      const i = fi.get(d.b), th = (d.theta0 || 0) * Math.PI / 180, cr = inp.kind === "crank" && isIn(d);
      let r = new Float64Array(nq); r[2 * i] = 1; rows.push(r); b.push(cr ? -d.len * Math.sin(th) : 0);
      r = new Float64Array(nq); r[2 * i + 1] = 1; rows.push(r); b.push(cr ? d.len * Math.cos(th) : 0);
    }
    return { rows, b };
  }
  // orthonormale basis van de bewegingen die de randvoorwaarden toelaten
  function nullBasis(rows) {
    const Z = [];
    for (let j = 0; j < nq; j++) {
      const e = new Float64Array(nq); e[j] = 1;
      if (rows.length) {
        const c = lsq(rows, rows.map(r => r[j]), nq);
        if (c) for (let k = 0; k < nq; k++) e[k] -= c[k];
      }
      for (let pass = 0; pass < 2; pass++)
        for (const z of Z) { const d = dot(z, e); for (let k = 0; k < nq; k++) e[k] -= d * z[k]; }
      const nr = Math.sqrt(dot(e, e));
      if (nr > 1e-5) { for (let k = 0; k < nq; k++) e[k] /= nr; Z.push(e); }
    }
    return Z;
  }
  function V(q) {
    let v = 0;
    if (model.gravity) fr.forEach((n, i) => { v += dm(n) * G * q[2 * i + 1]; });
    for (const e of model.elems) {
      if (springLike(e)) {
        const P = pos(q, e.a), Q = pos(q, e.b), L = Math.hypot(Q.x - P.x, Q.y - P.y);
        v += 0.5 * springK(e) * (L - springL0(e)) * (L - springL0(e));
      } else if (e.type === "gap") {                 // aanslag telt alleen mee als hij raakt
        const P = pos(q, e.a), Q = pos(q, e.b), d = gapPen(e, Math.hypot(Q.x - P.x, Q.y - P.y));
        v += 0.5 * (e.kc || 0) * d * d;
      } else if (e.type === "contact" && fi.has(e.node)) {
        v += contactPot(e, pos(q, e.node));
      } else if (e.type === "flexure" && N(e.a) && N(e.b)) {
        v += flexPot(e, flexPhi(e, id => pos(q, id), fxRest));
      } else if (e.type === "force" && fi.has(e.node)) {
        const P = pos(q, e.node), th = e.ang * Math.PI / 180;
        v -= e.mag * (Math.cos(th) * P.x + Math.sin(th) * P.y);
      }
    }
    return v;
  }
  const comb = (q0, Z, eta, p, u) => {
    const q = Float64Array.from(q0);
    Z.forEach((z, l) => { if (eta[l]) for (let k = 0; k < nq; k++) q[k] += eta[l] * z[k]; });
    if (p && u) for (let k = 0; k < nq; k++) q[k] += p[k] * u;
    return q;
  };
  function hessGrad(q0, Z) {
    const k = Z.length, H = [], g = new Float64Array(k);
    const Vat = eta => { const q = place(comb(q0, Z, eta, null, 0), 0); return q ? V(q) : NaN; };
    const e = (l, a, m, b2) => { const x = new Float64Array(k); x[l] += a; if (m !== undefined) x[m] += b2; return x; };
    const V0 = Vat(new Float64Array(k));
    const Vp = [], Vm = [];
    for (let l = 0; l < k; l++) { Vp[l] = Vat(e(l, h)); Vm[l] = Vat(e(l, -h)); g[l] = (Vp[l] - Vm[l]) / (2 * h); }
    for (let l = 0; l < k; l++) {
      H.push(new Float64Array(k));
      H[l][l] = (Vp[l] - 2 * V0 + Vm[l]) / (h * h);
    }
    for (let l = 0; l < k; l++) for (let m = l + 1; m < k; m++) {
      const v = (Vat(e(l, h, m, h)) - Vat(e(l, h, m, -h)) - Vat(e(l, -h, m, h)) + Vat(e(l, -h, m, -h))) / (4 * h * h);
      H[l][m] = H[m][l] = v;
    }
    return { H, g, V0 };
  }
  const solveR = (A, b) => {
    const n = b.length, M = [];
    for (let i = 0; i < n; i++) { const r = new Float64Array(n + 1); for (let j = 0; j < n; j++) r[j] = A[i][j]; r[n] = b[i]; M.push(r); }
    return gauss(M, n);
  };

  // ---- 1. evenwicht ----
  const keep = model.nodes.map(n => [n, n.x, n.y]);
  const start = new Float64Array(nq);
  fr.forEach((n, i) => { start[2 * i] = n.x; start[2 * i + 1] = n.y; });
  let q0 = place(start, 0);
  if (!q0) { sim.frfMsg = t("frf.m.assemble"); return null; }
  let eqOK = false, it = 0;
  for (; it < 40; it++) {
    yield { phase: "frfeq", it };
    const Z = nullBasis(jrows(q0).rows);
    if (!Z.length) { eqOK = true; break; }
    const { H, g, V0 } = hessGrad(q0, Z);
    const gn = Math.sqrt(dot(g, g));
    let lam = 0, moved = false;
    for (let tries = 0; tries < 10 && !moved; tries++) {
      const A = H.map((r, i) => r.map((v, j) => v + (i === j ? lam : 0)));
      let st = solveR(A, Array.from(g, v => -v));
      if (!st || dot(st, g) >= 0) { lam = lam ? lam * 10 : 1e-3 + Math.abs(H[0][0]); continue; }
      const sn = Math.sqrt(dot(st, st)), lim = 0.05 * size;
      if (sn > lim) st = st.map(v => v * lim / sn);
      if (Math.sqrt(dot(st, st)) < 1e-7 * size) { moved = true; eqOK = true; break; }
      const qn = place(comb(q0, Z, st, null, 0), 0);
      if (qn && V(qn) < V0 - 1e-12 * Math.abs(V0)) { q0 = qn; moved = true; }
      else lam = lam ? lam * 10 : 1e-3 + Math.abs(H[0][0]);
    }
    if (eqOK || gn < 1e-9) { eqOK = true; break; }
    if (!moved) { eqOK = gn < 1e-4 * (1 + Math.abs(V0) / size); break; }
  }

  // ---- 2. linearisatie ----
  const J = jrows(q0), Z = nullBasis(J.rows), k = Z.length;
  const motion = inp.kind !== "force";
  const p = motion ? (J.rows.length ? lsq(J.rows, J.b, nq) : new Float64Array(nq)) : null;
  if (motion && !p) { sim.frfMsg = t("frf.m.bc"); return null; }
  const mA = new Float64Array(nq);
  fr.forEach((n, i) => { mA[2 * i] = mA[2 * i + 1] = dm(n) * MM; });
  // dempingsmatrix van alle snelheidsafhankelijke krachten
  const jl = jointDamper(pos, vel);
  function dampF(v) {
    const F = new Float64Array(nq);
    const cv = model.cVisc || 0;
    if (cv) for (let i = 0; i < nq; i++) F[i] -= cv * v[i];
    for (const e of model.elems) {
      if (e.type !== "damper" && e.type !== "gap") continue;
      const P = pos(q0, e.a), Q = pos(q0, e.b), dx = Q.x - P.x, dy = Q.y - P.y, L = Math.hypot(dx, dy) || 1;
      const c = e.type === "damper" ? e.c : gapPen(e, L) !== 0 ? e.cc || 0 : 0;
      if (!c) continue;
      const ux = dx / L, uy = dy / L, vP = vel(v, e.a), vQ = vel(v, e.b);
      const Fv = c * ((vQ.x - vP.x) * ux + (vQ.y - vP.y) * uy);
      if (fi.has(e.a)) { const i = fi.get(e.a); F[2 * i] += Fv * ux; F[2 * i + 1] += Fv * uy; }
      if (fi.has(e.b)) { const i = fi.get(e.b); F[2 * i] -= Fv * ux; F[2 * i + 1] -= Fv * uy; }
    }
    if (jl) jl(q0, v, (id, fx, fy) => { if (fi.has(id)) { const i = fi.get(id); F[2 * i] += fx; F[2 * i + 1] += fy; } });
    return F;
  }
  const Cq = z => { const f = dampF(z); return f.map(v => -v); };      // C·z
  const Mq = z => z.map((v, i) => mA[i] * v);
  const Kr = [], Mr = [], Cr = [];
  const CZ = Z.map(Cq), MZ = Z.map(Mq);
  for (let a = 0; a < k; a++) {
    Mr.push(new Float64Array(k)); Cr.push(new Float64Array(k));
    for (let b = 0; b < k; b++) { Mr[a][b] = dot(Z[a], MZ[b]); Cr[a][b] = dot(Z[a], CZ[b]); }
  }
  let Ku = new Float64Array(k), Mu = new Float64Array(k), Cu = new Float64Array(k), Fu = new Float64Array(k);
  if (k) {
    const hg = hessGrad(q0, Z);
    for (let a = 0; a < k; a++) Kr.push(hg.H[a]);
    if (motion) {
      const Mp = Mq(p), Cp = Cq(p);
      const hu = h;
      const Vat = (eta, u) => { const q = place(comb(q0, Z, eta, p, u), u); return q ? V(q) : NaN; };
      for (let a = 0; a < k; a++) {
        const e1 = new Float64Array(k), e2 = new Float64Array(k); e1[a] = h; e2[a] = -h;
        Ku[a] = (Vat(e1, hu) - Vat(e1, -hu) - Vat(e2, hu) + Vat(e2, -hu)) / (4 * h * hu);
        Mu[a] = dot(Z[a], Mp); Cu[a] = dot(Z[a], Cp);
      }
    } else {
      const fv = new Float64Array(nq), i = fi.get(inp.e.node), th = inp.e.ang * Math.PI / 180;
      fv[2 * i] = Math.cos(th); fv[2 * i + 1] = Math.sin(th);
      for (let a = 0; a < k; a++) Fu[a] = dot(Z[a], fv);
    }
  }
  keep.forEach(([n, x, y]) => { n.x = x; n.y = y; });
  sim.lenOv = null;

  // ---- 3. eigenfrequenties (ongedempt) en modale demping ----
  const modes = [];
  if (k) {
    const Lc = cholesky(Mr);
    if (Lc) {
      const A = congruence(Lc, Kr);            // L⁻¹ K L⁻ᵀ
      const ev = jacobiEig(A);
      ev.forEach(({ val, vec }) => {
        const y = backSubT(Lc, vec);            // massagenormeerde vorm in η
        let c = 0; for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) c += y[a] * Cr[a][b] * y[b];
        const w = val > 0 ? Math.sqrt(val) : 0;
        const shape = new Float64Array(nq);
        for (let a = 0; a < k; a++) for (let j = 0; j < nq; j++) shape[j] += Z[a][j] * y[a];
        modes.push({ shape, f: w / (2 * Math.PI), zeta: w > 0 ? c / (2 * w) : NaN, unstable: val < -1e-9 * (1 + Math.abs(val)) });
      });
      modes.sort((a, b) => a.f - b.f);
    }
  }

  // ---- 4. frequentieresponsie ----
  const pos0 = modes.filter(m => m.f > 1e-6);
  let f0 = model.frfMin > 0 ? model.frfMin : pos0.length ? pos0[0].f / 20 : 0.1;
  let f1 = model.frfMax > 0 ? model.frfMax : pos0.length ? pos0[pos0.length - 1].f * 20 : 100;
  f0 = Math.max(1e-4, f0); if (!(f1 > f0 * 1.01)) f1 = f0 * 100;
  const S = { frf: true, f: new Array(361), t: new Array(361), ok: new Array(361).fill(true), X: new Array(361),
              pos: {}, vel: {}, acc: {}, N: {}, EF: {}, R: {}, T: {}, dur: 1, stat: false,
              q0, fi, modes, eqOK, inUnit: inp.u, inLab: inp.lab, k };
  // één frequentie exact doorrekenen (ook buiten het rooster); levert {re, im, w} of null
  function solveAt(f) {
    const w = 2 * Math.PI * f;
    let er = new Float64Array(k), ei = new Float64Array(k), ok = true;
    if (k) {
      // [[Kr−ω²M, −ωC], [ωC, Kr−ω²M]] · [ηr; ηi] = [br; bi]
      const n2 = 2 * k, Aug = [];
      for (let a = 0; a < n2; a++) Aug.push(new Float64Array(n2 + 1));
      for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) {
        const re = Kr[a][b] - w * w * Mr[a][b], im = w * Cr[a][b];
        Aug[a][b] = re; Aug[a][k + b] = -im; Aug[k + a][b] = im; Aug[k + a][k + b] = re;
      }
      for (let a = 0; a < k; a++) {
        const br = motion ? -(Ku[a] - w * w * Mu[a]) : Fu[a], bi = motion ? -w * Cu[a] : 0;
        Aug[a][n2] = br; Aug[k + a][n2] = bi;
      }
      const x = gauss(Aug, n2);
      if (x) { er = x.subarray(0, k); ei = x.subarray(k); } else ok = false;
    }
    const re = new Float64Array(nq), im = new Float64Array(nq);
    for (let a = 0; a < k; a++) for (let j = 0; j < nq; j++) { re[j] += Z[a][j] * er[a]; im[j] += Z[a][j] * ei[a]; }
    if (motion) for (let j = 0; j < nq; j++) re[j] += p[j];
    return { re, im, w, ok };
  }
  S.at = solveAt;
  for (let i = 0; i <= 360; i++) {
    if (i % 60 === 0) yield { phase: "frf", f: i, modes };   // modes: voor Optimaliseer (eigenfrequentie zonder de hele sweep)
    const f = f0 * Math.pow(f1 / f0, i / 360);
    S.f[i] = S.t[i] = f;
    const r = solveAt(f);
    if (!r.ok) S.ok[i] = false;
    S.X[i] = { re: r.re, im: r.im, w: r.w };
  }
  sim.solveOK = true;
  return S;
}

// complexe waarde [re, im] van een meetkanaal in een FRF-oplossing
export function frfVal(S, key, i) {
  const [t, id, k] = key.split("|"), X = S.X[i];
  if (!X) return null;
  const w = X.w;
  const at = nid => S.fi.has(nid) ? S.fi.get(nid) : -1;
  const d = (nid, c) => { const j = at(nid); return j < 0 ? [0, 0] : [X.re[2 * j + c], X.im[2 * j + c]]; };
  const q0p = nid => { const j = at(nid); return j < 0 ? N(nid) : { x: S.q0[2 * j], y: S.q0[2 * j + 1] }; };
  const dL = e => {
    const P = q0p(e.a), Q = q0p(e.b), L = Math.hypot(Q.x - P.x, Q.y - P.y) || 1, ux = (Q.x - P.x) / L, uy = (Q.y - P.y) / L;
    const ax = d(e.a, 0), ay = d(e.a, 1), bx = d(e.b, 0), by = d(e.b, 1);
    return [ux * (bx[0] - ax[0]) + uy * (by[0] - ay[0]), ux * (bx[1] - ax[1]) + uy * (by[1] - ay[1])];
  };
  const times = (z, n) => n === 1 ? [-w * z[1], w * z[0]] : n === 2 ? [-w * w * z[0], -w * w * z[1]] : z;
  if (t === "n") {
    const c = { x: 0, y: 1, vx: 0, vy: 1, ax: 0, ay: 1 }[k];
    if (c === undefined) return null;
    return times(d(id, c), k[0] === "v" ? 1 : k[0] === "a" ? 2 : 0);
  }
  const e = E(id); if (!e) return null;
  if (t === "a") return dL(e);
  const rot = (a, b) => {   // rotatie van de lijn a -> b (rad per eenheid van de ingang)
    const P = q0p(a), Q = q0p(b), L = Math.hypot(Q.x - P.x, Q.y - P.y) || 1, ux = (Q.x - P.x) / L, uy = (Q.y - P.y) / L;
    const pa = [d(a, 0), d(a, 1)], pb = [d(b, 0), d(b, 1)];
    return [0, 1].map(c => (ux * (pb[1][c] - pa[1][c]) - uy * (pb[0][c] - pa[0][c])) / L);
  };
  if (t === "m") {            // sensoren: lineaire uitgangen (verplaatsing in µm, hoek in °/µrad, versnelling in m/s² of g)
    if (e.type === "loadcell") return dL(e).map(v => v * 1000);
    if (e.type === "dsens") {
      const a = (e.ang || 0) * Math.PI / 180, cx = Math.cos(a), cy = Math.sin(a), betw = e.b && N(e.b);
      return [0, 1].map(c => {
        const A = [d(e.a, 0)[c], d(e.a, 1)[c]], B = betw ? [d(e.b, 0)[c], d(e.b, 1)[c]] : [0, 0];
        return (betw ? (B[0] - A[0]) * cx + (B[1] - A[1]) * cy : A[0] * cx + A[1] * cy) * 1000;
      });
    }
    if (e.type === "encoder") {
      const bb = encBars(e); if (!bb) return null;
      const dirRot = bar => rot(e.node, bar.a === e.node ? bar.b : bar.a);
      const r1 = dirRot(bb.b1), r2 = bb.b2 ? dirRot(bb.b2) : [0, 0], sc = k === "thu" ? 1e6 : 180 / Math.PI;
      return [(r1[0] - r2[0]) * sc, (r1[1] - r2[1]) * sc];
    }
    if (e.type === "accel") {
      const a = (e.ang || 0) * Math.PI / 180, ax = times(d(e.node, 0), 2), ay = times(d(e.node, 1), 2);
      const sc = (k === "g" ? 1 / G_MM : 1e-3);
      return [0, 1].map(c => (ax[c] * Math.cos(a) + ay[c] * Math.sin(a)) * sc);
    }
    return null;
  }
  if (t === "w") return dL(e).map(v => v * (k === "dL" ? 1000 : axialK(e) / axialA(e)));    // axiale staaf: ΔL (µm) en σ (MPa)
  if (t === "f") {            // flexure: lineaire verandering van de scharnierhoek φ, daaruit spanning en moment
    const r = flexRef(e), th = rot(e.a, e.b), tr = r ? rot(e.a, r.a === e.a ? r.b : r.a) : [0, 0];
    const ph = [th[0] - tr[0], th[1] - tr[1]];
    const sc = k === "phi" ? 180 / Math.PI : k === "sig" ? flexStressRate(e).rate : flexK(e) * 1e-3;
    return [ph[0] * sc, ph[1] * sc];
  }
  if (t === "s") {
    if (springLike(e)) return dL(e).map(v => v * springK(e));
    if (e.type === "damper") return times(dL(e), 1).map(v => v * e.c);
    // speling: alleen stijfheid en demping als hij in evenwicht tegen een aanslag ligt
    const P = q0p(e.a), Q = q0p(e.b);
    if (!gapPen(e, Math.hypot(Q.x - P.x, Q.y - P.y))) return [0, 0];
    const z = dL(e), zd = times(z, 1);
    return [(e.kc || 0) * z[0] + (e.cc || 0) * zd[0], (e.kc || 0) * z[1] + (e.cc || 0) * zd[1]];
  }
  return null;
}
