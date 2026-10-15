// Dynamica: tijdsintegratie als generator (zonder DOM).
import { contactForce, contactPot } from "./contact.js";
import { flexLoads, flexPhi, flexPot, flexRest, flexTrace, flexures } from "./flexure.js";
import { actLen, drivers, gapForce, gapPen, hasFriction, isBar, jointDamper, N, omega } from "./elements.js";
import { G, MM, relax } from "./kinematics.js";
import { gauss, lsq } from "./linalg.js";
import { model, sim } from "./state.js";

/* ============================================================
   Dynamische modus — tijdintegratie van het beperkte stelsel
      M q̈ + Φ_qᵀ λ = F(q, q̇, t),    Φ(q, t) = 0
   Eén KKT-stelsel per RK4-stap, met Baumgarte-stabilisatie en na
   elke beeldstap een positie- en snelheidsprojectie. Hier sturen
   veren en dempers de beweging in plaats van alleen kracht te
   dragen, dus deze modus draait óók met vrijheidsgraden over.
   ============================================================ */
const BA = 20, BB = 20;   // Baumgarte, 1/s

export function* computeDyn() {
  const fr = model.nodes.filter(n => n.support !== "pin");
  const nq = fr.length * 2;
  if (!nq) return null;
  const fi = new Map(fr.map((n, i) => [n.id, i]));
  const ds = drivers().filter(d => N(d.a) && N(d.b) && N(d.a).support === "pin" && fi.has(d.b));
  const bars = model.elems.filter(e => isBar(e) && !e.driver && N(e.a) && N(e.b) &&
    !(N(e.a).support === "pin" && N(e.b).support === "pin"));
  const slis = model.nodes.filter(n => n.support === "slider");
  const nm = bars.length + slis.length + 2 * ds.length;
  if (nm > nq) return null;                       // overbepaald

  const fixed = {};
  for (const n of model.nodes) if (n.support === "pin") fixed[n.id] = { x: n.x, y: n.y };
  const dm = n => (n.m > 0 ? n.m : (model.defMass || 0.1));
  const mA = new Float64Array(nq);
  fr.forEach((n, i) => { mA[2 * i] = mA[2 * i + 1] = dm(n) * MM; });

  const pos = (q, id) => fi.has(id) ? { x: q[2 * fi.get(id)], y: q[2 * fi.get(id) + 1] } : fixed[id];
  const vel = (v, id) => fi.has(id) ? { x: v[2 * fi.get(id)], y: v[2 * fi.get(id) + 1] } : { x: 0, y: 0 };

  const jointLoads = jointDamper(pos, vel);
  const fxRest = flexRest();                          // flexures: draaiveren rond de getekende stand
  const cj = jointLoads ? 1 : 0;

  // crank pose prescribed by the clock
  function crankAt(d, t) {
    const A = fixed[d.a], om = omega(d);
    const th = (d.theta0 || 0) * Math.PI / 180 + om * t;
    return { x: A.x + d.len * Math.cos(th), y: A.y + d.len * Math.sin(th),
             vx: -om * d.len * Math.sin(th), vy: om * d.len * Math.cos(th),
             ax: -om * om * d.len * Math.cos(th), ay: -om * om * d.len * Math.sin(th), th };
  }

  // Φ_q, Φ, Φ_t and the acceleration right-hand side
  function jac(t, q, v) {
    const rows = [], phi = [], gam = [], phit = [], kind = [];
    for (const e of bars) {
      const P = pos(q, e.a), Q = pos(q, e.b);
      const vP = vel(v, e.a), vQ = vel(v, e.b);
      const dx = P.x - Q.x, dy = P.y - Q.y;
      const row = new Float64Array(nq);
      if (fi.has(e.a)) { const i = fi.get(e.a); row[2 * i] += 2 * dx; row[2 * i + 1] += 2 * dy; }
      if (fi.has(e.b)) { const i = fi.get(e.b); row[2 * i] -= 2 * dx; row[2 * i + 1] -= 2 * dy; }
      const dvx = vP.x - vQ.x, dvy = vP.y - vQ.y;
      const a = e.type === "actuator" ? actLen(e, t) : { L: e.len, Ld: 0, Ldd: 0 };
      rows.push(row); phi.push(dx * dx + dy * dy - a.L * a.L);
      gam.push(-2 * (dvx * dvx + dvy * dvy) + 2 * (a.Ld * a.Ld + a.L * a.Ldd));
      phit.push(-2 * a.L * a.Ld); kind.push({ t: "bar", e });
    }
    for (const n of slis) {
      const th = n.dir * Math.PI / 180, nx = -Math.sin(th), ny = Math.cos(th);
      const row = new Float64Array(nq), i = fi.get(n.id);
      row[2 * i] = nx; row[2 * i + 1] = ny;
      const p = pos(q, n.id);
      rows.push(row); phi.push((p.x - n.ax) * nx + (p.y - n.ay) * ny);
      gam.push(0); phit.push(0); kind.push({ t: "sli", n });
    }
    for (const d of ds) {
      const c = crankAt(d, t), i = fi.get(d.b), B = pos(q, d.b);
      let r = new Float64Array(nq); r[2 * i] = 1;
      rows.push(r); phi.push(B.x - c.x); gam.push(c.ax); phit.push(-c.vx); kind.push({ t: "drv", d, c });
      r = new Float64Array(nq); r[2 * i + 1] = 1;
      rows.push(r); phi.push(B.y - c.y); gam.push(c.ay); phit.push(-c.vy); kind.push({ t: "drv", d, c });
    }
    return { rows, phi, gam, phit, kind };
  }

  // contacten: bal op vlak, met een borstel (z) per contact als extra toestand
  const cons = model.elems.filter(e => e.type === "contact" && fi.has(e.node));
  let zCur = new Float64Array(cons.length);
  const pv = (q, v, id) => ({ p: pos(q, id), v: vel(v, id) });
  // z terug binnen de grens μ·F_n/k_t (na elke stap; bij losraken nul)
  function clampZ(q, v, z) {
    cons.forEach((e, k) => { const s = pv(q, v, e.node), c = contactForce(e, s.p, s.v, z[k]); z[k] = c.z; });
  }

  function loads(q, v, zv) {
    const F = new Float64Array(nq), EF = {}, CF = {}, dz = new Float64Array(cons.length);
    cons.forEach((e, k) => {
      const s = pv(q, v, e.node), c = contactForce(e, s.p, s.v, zv[k]), i = fi.get(e.node);
      F[2 * i] += c.fx; F[2 * i + 1] += c.fy;
      EF[e.id] = c.Fn; CF[e.id] = c; dz[k] = c.dz;
    });
    if (model.gravity) fr.forEach((n, i) => { F[2 * i + 1] -= dm(n) * G; });
    const cv = model.cVisc || 0;
    if (cv) for (let i = 0; i < nq; i++) F[i] -= cv * v[i];   // demping op elk vrij punt
    for (const e of model.elems) {
      if (e.type === "spring" || e.type === "damper" || e.type === "gap") {
        const P = pos(q, e.a), Q = pos(q, e.b);
        const dx = Q.x - P.x, dy = Q.y - P.y, L = Math.hypot(dx, dy) || 1;
        const ux = dx / L, uy = dy / L;
        let Fv;
        if (e.type === "spring") Fv = e.k * (L - e.L0);
        else {
          const vP = vel(v, e.a), vQ = vel(v, e.b);
          const Ld = (vQ.x - vP.x) * ux + (vQ.y - vP.y) * uy;
          Fv = e.type === "gap" ? gapForce(e, L, Ld) : e.c * Ld;
        }
        EF[e.id] = Fv;
        if (fi.has(e.a)) { const i = fi.get(e.a); F[2 * i] += Fv * ux; F[2 * i + 1] += Fv * uy; }
        if (fi.has(e.b)) { const i = fi.get(e.b); F[2 * i] -= Fv * ux; F[2 * i + 1] -= Fv * uy; }
      } else if (e.type === "force" && fi.has(e.node)) {
        const i = fi.get(e.node), th = e.ang * Math.PI / 180;
        F[2 * i] += e.mag * Math.cos(th); F[2 * i + 1] += e.mag * Math.sin(th);
      }
    }
    if (cj > 0) jointLoads(q, v, (id, fx, fy) => {
      if (!fi.has(id)) return;
      const i = fi.get(id); F[2 * i] += fx; F[2 * i + 1] += fy;
    });
    flexLoads(id => pos(q, id), fxRest, (id, fx, fy) => {
      if (!fi.has(id)) return;
      const i = fi.get(id); F[2 * i] += fx; F[2 * i + 1] += fy;
    });
    return { F, EF, CF, dz };
  }

  function kkt(J, F, v) {
    const m = J.rows.length, n = nq + m;
    const A = [];
    for (let i = 0; i < n; i++) A.push(new Float64Array(n + 1));
    for (let i = 0; i < nq; i++) { A[i][i] = mA[i]; A[i][n] = F[i]; }
    for (let j = 0; j < m; j++) {
      const r = J.rows[j];
      let rv = 0;
      for (let k = 0; k < nq; k++) if (r[k]) { A[k][nq + j] = r[k]; A[nq + j][k] = r[k]; rv += r[k] * v[k]; }
      const pdot = rv + J.phit[j];
      A[nq + j][n] = J.gam[j] - 2 * BA * pdot - BB * BB * J.phi[j];
    }
    return gauss(A, n);
  }
  // stangkrachten, lagerkrachten en normaalkrachten uit de multiplicatoren
  function lamLoads(q, J, lam) {
    const bar = new Map(), bear = new Map(), sli = new Map();
    const addB = (id, x, y) => { const b = bear.get(id) || { x: 0, y: 0 }; b.x += x; b.y += y; bear.set(id, b); };
    J.kind.forEach((k, j) => {
      if (k.t === "bar") {
        const P = pos(q, k.e.a), Q = pos(q, k.e.b), dx = P.x - Q.x, dy = P.y - Q.y, L = Math.hypot(dx, dy) || 1;
        bar.set(k.e.id, Math.abs(2 * L * lam[j]));
        addB(k.e.a, -2 * dx * lam[j], -2 * dy * lam[j]); addB(k.e.b, 2 * dx * lam[j], 2 * dy * lam[j]);
      } else if (k.t === "sli") sli.set(k.n.id, Math.abs(lam[j]));
    });
    let j = bars.length + slis.length;
    for (const d of ds) {
      const lx = lam[j], ly = lam[j + 1]; j += 2;
      bar.set(d.id, Math.hypot(lx, ly)); addB(d.a, lx, ly); addB(d.b, -lx, -ly);
    }
    return { bar: e => bar.get(e.id) || 0, sli: n => sli.get(n.id) || 0,
             pin: n => { const b = bear.get(n.id); return b ? Math.hypot(b.x, b.y) : 0; },
             vec: n => bear.get(n.id) || { x: 0, y: 0 } };
  }
  // krachten die de wrijvingsmomenten (als koppel op de stangen) op elk punt zetten
  function coupleMap(q, cs, gen) {
    const out = {};
    cs.forEach((e, k) => {
      if (e.c.k !== "jt" || !gen[k]) return;
      for (const [b, sg] of [[e.c.A, 1], [e.c.B, -1]]) {
        if (!b) continue;
        const P = pos(q, b.a), Q = pos(q, b.b), rx = Q.x - P.x, ry = Q.y - P.y, kk = sg * gen[k] / (rx * rx + ry * ry || 1);
        for (const [id, fx, fy] of [[b.b, -kk * ry, kk * rx], [b.a, kk * ry, -kk * rx]]) {
          const o = out[id] || (out[id] = { x: 0, y: 0 }); o.x += fx; o.y += fy;
        }
      }
    });
    return out;
  }
  /* Wrijving met echt plakken. Elk wrijvingscontact (glijder langs de rails,
     of een paar lichamen in een scharnier) heeft een rij c met c·v = de
     schuifsnelheid (glijder, mm/s) of de relatieve hoeksnelheid (scharnier).
     - schuift het (|v| ≥ vε): kracht of moment −μ(v)·N·sign(v), Stribeck;
     - staat het (bijna) stil: tijdelijk de voorwaarde c·a = −2·BA·(c·v)
       erbij; de benodigde kracht is dan de multiplicator. Past die binnen
       μs·N, dan plakt het; anders schiet het los met μs·N. */
  const fricOn = hasFriction();
  const vS = Math.max(1e-6, model.fricVs || 5), vE = Math.max(1e-6, model.fricVe || 2);
  const contacts = [];
  if (fricOn) for (const n of model.nodes) {
    if (!(n.mus > 0 || n.muk > 0)) continue;
    if (n.support === "slider" && fi.has(n.id)) contacts.push({ k: "sli", n });
    const ls = model.elems.filter(e => isBar(e) && (e.a === n.id || e.b === n.id) && N(e.a) && N(e.b));
    const bodies = ls.slice();
    if (n.support !== "free") bodies.push(null);
    for (let a = 0; a < bodies.length; a++)
      for (let b = a + 1; b < bodies.length; b++) {
        const A = bodies[a], B = bodies[b];
        // een door de klok gedraaide kruk tegen de vaste wereld kan niet plakken
        const forced = (A && A.driver && !B) || (B && B.driver && !A) || (A && A.driver && B && B.driver);
        contacts.push({ k: "jt", n, A, B, r: n.rj > 0 ? n.rj : 5, forced });
      }
  }
  function bodyRow(q, e, row, sgn) {
    const P = pos(q, e.a), Q = pos(q, e.b), rx = Q.x - P.x, ry = Q.y - P.y, L2 = rx * rx + ry * ry || 1;
    if (fi.has(e.b)) { const i = fi.get(e.b); row[2 * i] += sgn * -ry / L2; row[2 * i + 1] += sgn * rx / L2; }
    if (fi.has(e.a)) { const i = fi.get(e.a); row[2 * i] += sgn * ry / L2; row[2 * i + 1] += sgn * -rx / L2; }
  }
  function evalContact(c, q, v, ld, cpl) {
    const row = new Float64Array(nq);
    let N0, scale;
    if (c.k === "sli") {
      const th = c.n.dir * Math.PI / 180, i = fi.get(c.n.id);
      row[2 * i] = Math.cos(th); row[2 * i + 1] = Math.sin(th);
      N0 = ld.sli(c.n); scale = 1;
    } else {
      if (c.A) bodyRow(q, c.A, row, 1);
      if (c.B) bodyRow(q, c.B, row, -1);
      if (c.A && c.B) N0 = (ld.bar(c.A) + ld.bar(c.B)) / 2;
      else {       // lager naar de vaste wereld: stangkrachten plus de koppelkrachten in dit punt
        const b = ld.vec(c.n), o = cpl && cpl[c.n.id];
        N0 = o ? Math.hypot(b.x - o.x, b.y - o.y) : Math.hypot(b.x, b.y);
      }
      scale = c.r;
    }
    let w = 0; for (let k = 0; k < nq; k++) if (row[k]) w += row[k] * v[k];
    return { c, row, w, sv: w * scale, lim: N0 * scale };     // lim·μ = grootste kracht of moment
  }
  const muSlip = (n, a) => (n.muk || 0) + ((n.mus || 0) - (n.muk || 0)) * Math.exp(-(a / vS) * (a / vS));
  function deriv(t, q, v, zv) {
    const J = jac(t, q, v), { F, EF, CF, dz } = loads(q, v, zv || zCur);
    let x = kkt(J, F, v);
    if (!x) return null;
    let fpin = null;
    if (fricOn) {
      // De normaal- en lagerkrachten hangen af van wat de wrijving doet (een
      // vastzittende slinger drukt anders op zijn lager dan een vallende), dus
      // herhalen tot plakken en glijden elkaar niet meer veranderen.
      const m0 = J.rows.length, loosened = new Set(), lastGen = {};
      let xc = x, cs = null, gen = null, x2 = null, cpl = null;
      for (let it = 0; it < 10; it++) {
        cs = contacts.map(c => evalContact(c, q, v, lamLoads(q, J, xc.subarray(nq, nq + m0)), cpl));
        gen = new Float64Array(cs.length);
        const stick = [];
        cs.forEach((e, k) => {
          const a = Math.abs(e.sv);
          if (loosened.has(k)) gen[k] = e.sv ? -Math.sign(e.sv) * (e.c.n.mus || 0) * e.lim : Math.sign(lastGen[k] || 0) * (e.c.n.mus || 0) * e.lim;
          else if (a >= vE || e.c.forced || !(e.c.n.mus > 0))
            gen[k] = -muSlip(e.c.n, a) * e.lim * Math.sign(e.sv) * (a >= vE ? 1 : Math.tanh(a / vE));
          else stick.push(k);
        });
        const F2 = Float64Array.from(F);
        cs.forEach((e, k) => { if (gen[k]) for (let i = 0; i < nq; i++) if (e.row[i]) F2[i] += gen[k] * e.row[i]; });
        const J2 = stick.length ? { rows: J.rows.concat(stick.map(k => cs[k].row)), phi: J.phi.concat(stick.map(() => 0)),
                                   gam: J.gam.concat(stick.map(() => 0)), phit: J.phit.concat(stick.map(() => 0)) } : J;
        x2 = kkt(J2, F2, v);
        if (!x2) {                         // strijdige voorwaarden: die contacten glijden afgevlakt
          stick.forEach(k => loosened.add(k));
          continue;
        }
        // houdkracht per plakkend contact, getoetst aan μs·N van déze oplossing
        const ld2 = lamLoads(q, J, x2.subarray(nq, nq + m0));
        stick.forEach((k, j) => { gen[k] = -x2[nq + m0 + j]; });
        cpl = coupleMap(q, cs, gen);
        let changedSet = false;
        stick.forEach(k => {
          const e = cs[k], lim = evalContact(e.c, q, v, ld2, cpl).lim;
          if (Math.abs(gen[k]) > (e.c.n.mus || 0) * lim * (1 + 1e-9)) { loosened.add(k); lastGen[k] = gen[k]; changedSet = true; }
        });
        const prevN = cs.map(e => e.lim), nowN = contacts.map(c => evalContact(c, q, v, ld2, cpl).lim);
        xc = x2.subarray(0, nq + m0);
        if (!changedSet && nowN.every((n, k) => Math.abs(n - prevN[k]) <= 1e-6 * (1 + Math.abs(n)))) break;
      }
      if (x2) x = x2.subarray(0, nq + m0);
      // krachten op vaste scharnieren, voor de oplegreacties
      fpin = {};
      cs.forEach((e, k) => {
        if (e.c.k !== "jt" || !gen[k]) return;
        const tau = gen[k];
        for (const [b, sg] of [[e.c.A, 1], [e.c.B, -1]]) {
          if (!b) continue;
          const P = pos(q, b.a), Q = pos(q, b.b), rx = Q.x - P.x, ry = Q.y - P.y, kk = sg * tau / (rx * rx + ry * ry || 1);
          for (const [id, fx, fy] of [[b.b, -kk * ry, kk * rx], [b.a, kk * ry, -kk * rx]])
            if (!fi.has(id)) { const o = fpin[id] || (fpin[id] = { x: 0, y: 0 }); o.x += fx; o.y += fy; }
        }
      });
    }
    return { a: x.subarray(0, nq), lam: x.subarray(nq), J, EF, CF, dz, fpin };
  }

  /* ---- time march ---- */
  const keep = model.nodes.map(n => ({ n, x: n.x, y: n.y }));
  const h0 = Math.max(1e-6, (model.dtStep || 0.2) / 1000);
  const q = new Float64Array(nq), v = new Float64Array(nq);
  fr.forEach((n, i) => { q[2 * i] = n.x; q[2 * i + 1] = n.y; });
  project(0, q, v);

  // "tot evenwicht": loop eerst zonder op te slaan tot het stil ligt
  let dur = Math.max(0.01, model.simDur || 2);
  let settled = null;
  if (model.durMode === "equil") {
    const q0 = q.slice(), v0 = v.slice(), z0 = zCur.slice();
    const maxT = Math.max(0.2, model.maxT || 30);
    const VTOL = 0.5, ATOL = 50;       // mm/s en mm/s²
    let t = 0, calm = 0, k = 0;
    while (t < maxT) {
      if (!rk4(t, q, v, h0)) break;
      t += h0;
      if ((k % 250) === 0) yield { phase: "equil", t, maxT };
      if ((++k % 10) === 0) {
        project(t, q, v);
        let mv = 0;
        for (let i = 0; i < nq; i++) mv = Math.max(mv, Math.abs(v[i]));
        const d = deriv(t, q, v);
        let ma = 0;
        if (d) for (let i = 0; i < nq; i++) ma = Math.max(ma, Math.abs(d.a[i]));
        if (mv < VTOL && ma < ATOL) { calm += 10 * h0; if (calm > 0.1) break; } else calm = 0;
      }
    }
    settled = Math.min(maxT, Math.max(0.05, t));
    dur = settled;
    q.set(q0); v.set(v0); zCur = z0;
  }
  const dtF = dur / 360;
  let sub = Math.max(1, Math.ceil(dtF / h0));
  if (sub > 2000) sub = 2000;
  const h = dtF / sub;

  const S = { ok: new Array(361).fill(false), pos: {}, vel: {}, acc: {},
              N: {}, EF: {}, R: {}, T: {}, E: new Array(361).fill(NaN),
              t: new Array(361), dur, settled, stat: true, dyn: true };
  for (const n of model.nodes) {
    S.pos[n.id] = new Array(361); S.vel[n.id] = new Array(361); S.acc[n.id] = new Array(361);
    if (n.support !== "free") S.R[n.id] = new Array(361);
  }
  for (const e of model.elems) {
    if (isBar(e)) S.N[e.id] = new Array(361);
    if (e.type === "spring" || e.type === "damper" || e.type === "gap") S.EF[e.id] = new Array(361);
  }
  S.C = {};
  for (const e of cons) { S.C[e.id] = new Array(361); S.EF[e.id] = new Array(361); }
  for (const d of ds) S.T[d.id] = new Array(361).fill(NaN);

  let Rmax = 0, Nmax = 0, bad = false;
  for (let f = 0; f <= 360; f++) {
    const t = f * dtF;
    yield { phase: "rec", f };
    const d0 = deriv(t, q, v);
    if (!d0) { bad = true; break; }
    record(f, t, q, v, d0);
    Rmax = Math.max(Rmax, S._rmax || 0); Nmax = Math.max(Nmax, S._nmax || 0);
    if (f === 360) break;
    for (let s = 0; s < sub; s++) {
      if (!rk4(t + s * h, q, v, h)) { bad = true; break; }
    }
    if (bad) break;
    project(t + dtF, q, v);
    if (!isFinite(q[0])) { bad = true; break; }
  }
  keep.forEach(r => { r.n.x = r.x; r.n.y = r.y; });
  sim.simT = 0;
  flexTrace(S, fxRest);
  S.Rmax = Rmax; S.Nmax = Nmax;
  sim.solveOK = S.ok.some(Boolean);
  return S.ok.some(Boolean) ? S : null;

  function rk4(t, q, v, h) {
    const n = nq, z = zCur;
    const k1 = deriv(t, q, v, z); if (!k1) return false;
    const q2 = add(q, v, h / 2), v2 = add(v, k1.a, h / 2), z2 = add(z, k1.dz, h / 2);
    const k2 = deriv(t + h / 2, q2, v2, z2); if (!k2) return false;
    const q3 = add(q, v2, h / 2), v3 = add(v, k2.a, h / 2), z3 = add(z, k2.dz, h / 2);
    const k3 = deriv(t + h / 2, q3, v3, z3); if (!k3) return false;
    const q4 = add(q, v3, h), v4 = add(v, k3.a, h), z4 = add(z, k3.dz, h);
    const k4 = deriv(t + h, q4, v4, z4); if (!k4) return false;
    for (let i = 0; i < n; i++) {
      q[i] += h / 6 * (v[i] + 2 * v2[i] + 2 * v3[i] + v4[i]);
      v[i] += h / 6 * (k1.a[i] + 2 * k2.a[i] + 2 * k3.a[i] + k4.a[i]);
    }
    for (let k = 0; k < z.length; k++) z[k] += h / 6 * (k1.dz[k] + 2 * k2.dz[k] + 2 * k3.dz[k] + k4.dz[k]);
    if (z.length) clampZ(q, v, z);
    return true;
  }
  function add(a, b, s) {
    const o = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) o[i] = a[i] + b[i] * s;
    return o;
  }

  // pull the state back onto the constraint manifold
  function project(t, q, v) {
    sim.simT = t;
    fr.forEach((n, i) => { n.x = q[2 * i]; n.y = q[2 * i + 1]; });
    const tips = new Set();
    for (const d of ds) {
      const c = crankAt(d, t), B = N(d.b);
      B.x = c.x; B.y = c.y; tips.add(B.id);
    }
    relax(tips);
    fr.forEach((n, i) => { q[2 * i] = n.x; q[2 * i + 1] = n.y; });
    const J = jac(t, q, v);
    const err = J.rows.map((r, j) => {
      let s = J.phit[j];
      for (let k = 0; k < nq; k++) s += r[k] * v[k];
      return -s;
    });
    const dv = lsq(J.rows, err, nq);
    if (dv) for (let i = 0; i < nq; i++) v[i] += dv[i];
  }

  function record(f, t, q, v, D) {
    S.ok[f] = true; S.t[f] = t;
    fr.forEach((n, i) => { n.x = q[2 * i]; n.y = q[2 * i + 1]; });
    for (const n of model.nodes) {
      const p = n.support === "pin" ? fixed[n.id] : { x: q[2 * fi.get(n.id)], y: q[2 * fi.get(n.id) + 1] };
      S.pos[n.id][f] = { x: p.x, y: p.y };
      S.vel[n.id][f] = vel(v, n.id);
      S.acc[n.id][f] = fi.has(n.id)
        ? { x: D.a[2 * fi.get(n.id)], y: D.a[2 * fi.get(n.id) + 1] } : { x: 0, y: 0 };
    }
    for (const id in S.EF) S.EF[id][f] = D.EF[id];
    for (const e of cons) {
      const c = D.CF[e.id];
      S.C[e.id][f] = { Fn: c.Fn, Ft: c.Ft, d: Math.max(0, c.delta) * 1000, a: c.a, kn: c.kn, kt: c.kt, z: c.z * 1000, slip: c.slip, open: c.open };
    }

    // constraint multipliers -> bar forces, reactions, torques
    const onPin = {}, jPin = {};
    for (const n of model.nodes) if (n.support === "pin") { onPin[n.id] = { x: 0, y: 0 }; jPin[n.id] = { x: 0, y: 0 }; }
    if (cj > 0) jointLoads(q, v, (id, fx, fy) => { if (jPin[id]) { jPin[id].x += fx; jPin[id].y += fy; } });
    if (D.fpin) for (const id in D.fpin) if (jPin[id]) { jPin[id].x += D.fpin[id].x; jPin[id].y += D.fpin[id].y; }
    let rm = 0, nm2 = 0;
    D.J.kind.forEach((k, j) => {
      const lam = D.lam[j];
      if (k.t === "bar") {
        const P = pos(q, k.e.a), Q = pos(q, k.e.b);
        const dx = P.x - Q.x, dy = P.y - Q.y, L = Math.hypot(dx, dy) || 1;
        S.N[k.e.id][f] = 2 * L * lam;
        nm2 = Math.max(nm2, Math.abs(2 * L * lam));
        if (onPin[k.e.a]) { onPin[k.e.a].x += -2 * dx * lam; onPin[k.e.a].y += -2 * dy * lam; }
        if (onPin[k.e.b]) { onPin[k.e.b].x += 2 * dx * lam; onPin[k.e.b].y += 2 * dy * lam; }
      } else if (k.t === "sli") {
        const th = k.n.dir * Math.PI / 180, nx = -Math.sin(th), ny = Math.cos(th);
        S.R[k.n.id][f] = { x: -nx * lam, y: -ny * lam, n: -lam };
        rm = Math.max(rm, Math.abs(lam));
      }
    });
    // drivers come in pairs of rows
    let j = bars.length + slis.length;
    for (const d of ds) {
      const lx = D.lam[j], ly = D.lam[j + 1]; j += 2;
      const A = fixed[d.a], B = S.pos[d.b][f];
      const rx = B.x - A.x, ry = B.y - A.y;
      S.T[d.id][f] = (ry * lx - rx * ly) * MM;
      S.N[d.id][f] = (-lx * rx - ly * ry) / (Math.hypot(rx, ry) || 1);
      if (onPin[d.a]) { onPin[d.a].x += lx; onPin[d.a].y += ly; }
    }
    for (const n of model.nodes) {
      if (n.support !== "pin") continue;
      const o = onPin[n.id];
      let fx = o.x + jPin[n.id].x, fy = o.y + jPin[n.id].y;
      for (const e of model.elems) {
        if (e.type === "spring" || e.type === "damper" || e.type === "gap") {
          const sgn = e.a === n.id ? 1 : e.b === n.id ? -1 : 0;
          if (!sgn) continue;
          const P = pos(q, e.a), Q = pos(q, e.b);
          const dx = Q.x - P.x, dy = Q.y - P.y, L = Math.hypot(dx, dy) || 1;
          fx += sgn * D.EF[e.id] * dx / L; fy += sgn * D.EF[e.id] * dy / L;
        } else if (e.type === "force" && e.node === n.id) {
          const th = e.ang * Math.PI / 180;
          fx += e.mag * Math.cos(th); fy += e.mag * Math.sin(th);
        }
      }
      if (model.gravity) fy -= (n.m || 0) * G;
      S.R[n.id][f] = { x: -fx, y: -fy };
      rm = Math.max(rm, Math.hypot(fx, fy));
    }
    S._rmax = rm; S._nmax = nm2;

    // energy bookkeeping, so drift is visible rather than hidden
    let E = 0;
    for (const n of model.nodes) {
      const vv = S.vel[n.id][f], m = n.support === "pin" ? (n.m || 0) : dm(n);
      E += 0.5 * m * (vv.x * vv.x + vv.y * vv.y) * 1e-6;
      if (model.gravity) E += m * G * S.pos[n.id][f].y * 1e-3;
    }
    for (const e of cons) E += contactPot(e, S.pos[e.node][f]) * 1e-3;
    for (const e of flexures()) E += flexPot(e, flexPhi(e, id => S.pos[id][f], fxRest)) * 1e-3;
    for (const e of model.elems) {
      if (e.type !== "spring" && e.type !== "gap") continue;
      const P = S.pos[e.a][f], Q = S.pos[e.b][f];
      const L = Math.hypot(Q.x - P.x, Q.y - P.y);
      const d = e.type === "gap" ? gapPen(e, L) : L - e.L0;
      E += 0.5 * (e.type === "gap" ? e.kc || 0 : e.k) * d * d * 1e-3;
    }
    S.E[f] = E;
  }
}
