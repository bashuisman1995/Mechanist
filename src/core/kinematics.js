// Kinematica: randvoorwaarden, relaxatie, sweep, krachten, beweeglijkheid (zonder DOM).
import { contactForce } from "./contact.js";
import { flexRest, flexTrace } from "./flexure.js";
import { actLen, actuators, curLen, drivers, frictionLoads, gapForce, hasFriction, isBar, N, omega } from "./elements.js";
import { gauss, lsq } from "./linalg.js";
import { model, sim } from "./state.js";

// omhullende van het model, inclusief de hele beweging als die bekend is
export function bounds() {
  if (!model.nodes.length) return null;
  let a = { x: Infinity, y: Infinity }, b = { x: -Infinity, y: -Infinity };
  const add = p => { if (!p) return; a.x = Math.min(a.x, p.x); a.y = Math.min(a.y, p.y);
                     b.x = Math.max(b.x, p.x); b.y = Math.max(b.y, p.y); };
  for (const n of model.nodes) {
    add(n);
    if (sim.sweep && sim.sweep.pos[n.id])
      for (let i = 0; i <= 360; i += 4) if (sim.sweep.ok[i]) add(sim.sweep.pos[n.id][i]);
  }
  return { a, b };
}

/* ============================================================
   Constraint solver — least-norm Gauss-Newton
   Keeps every bar at its own length and every glijder on its rail,
   moving the sketch as little as possible. No time stepping.
   ============================================================ */
function constraintRows(vars) {
  const idx = new Map(); vars.forEach((n, i) => idx.set(n.id, i));
  const rows = [], res = [];
  for (const e of model.elems) {
    if (!isBar(e)) continue;
    const A = N(e.a), B = N(e.b);
    if (!A || !B) continue;
    const dx = A.x - B.x, dy = A.y - B.y;
    const d = Math.hypot(dx, dy) || 1e-9;
    const ux = dx / d, uy = dy / d;
    const row = new Float64Array(vars.length * 2);
    let touched = false;
    if (idx.has(A.id)) { const i = idx.get(A.id); row[2 * i] = ux; row[2 * i + 1] = uy; touched = true; }
    if (idx.has(B.id)) { const i = idx.get(B.id); row[2 * i] = -ux; row[2 * i + 1] = -uy; touched = true; }
    if (!touched) continue;
    rows.push(row); res.push(d - curLen(e));
  }
  for (const n of model.nodes) {
    if (n.support !== "slider" || !idx.has(n.id)) continue;
    const th = n.dir * Math.PI / 180;
    const nx = -Math.sin(th), ny = Math.cos(th);
    const row = new Float64Array(vars.length * 2);
    const i = idx.get(n.id); row[2 * i] = nx; row[2 * i + 1] = ny;
    rows.push(row); res.push((n.x - n.ax) * nx + (n.y - n.ay) * ny);
  }
  return { rows, res };
}
export function relax(fixed) {
  fixed = fixed || new Set();
  const vars = model.nodes.filter(n => n.support !== "pin" && !fixed.has(n.id));
  if (!vars.length) { sim.solveOK = true; return true; }
  const nv = vars.length * 2;
  for (let it = 0; it < 80; it++) {
    const { rows, res } = constraintRows(vars);
    if (!rows.length) { sim.solveOK = true; return true; }
    let worst = 0;
    for (const c of res) worst = Math.max(worst, Math.abs(c));
    if (worst < 1e-8) { snapCoords(vars); sim.solveOK = true; return true; }
    const m = rows.length;
    const mu = 1e-8 + worst * 1e-6;
    const A = [];
    for (let i = 0; i < m; i++) {
      const r = new Float64Array(m + 1), ri = rows[i];
      for (let j = 0; j < m; j++) {
        const rj = rows[j];
        let s = 0;
        for (let k = 0; k < nv; k++) s += ri[k] * rj[k];
        r[j] = s + (i === j ? mu : 0);
      }
      r[m] = -res[i];
      A.push(r);
    }
    const lam = gauss(A, m);
    if (!lam) { sim.solveOK = false; return false; }
    for (let k = 0; k < nv; k++) {
      let d = 0;
      for (let i = 0; i < m; i++) d += rows[i][k] * lam[i];
      const n = vars[k >> 1];
      if (k % 2 === 0) n.x += d; else n.y += d;
    }
  }
  snapCoords(vars);
  sim.solveOK = false;
  return false;
}

function snapCoords(vars) {
  for (const n of vars) {
    n.x = Math.round(n.x * 1e7) / 1e7;
    n.y = Math.round(n.y * 1e7) / 1e7;
    if (n.support === "slider") { /* rail anchor stays put */ }
  }
}

/* ============================================================
   Velocity & acceleration — analytic, from the same Jacobian.
   Squared-length form:  |p-q|² - L² = 0
     first  derivative:  2(p-q)·(vp-vq) = 0
     second derivative:  2(p-q)·(ap-aq) + 2|vp-vq|² = 0
   ============================================================ */
function kinAt() {
  const all = model.nodes, ai = new Map(all.map((n, i) => [n.id, i]));
  const nAll = all.length * 2;

  const vel = new Map(), acc = new Map();
  for (const n of all) if (n.support === "pin") { vel.set(n.id, { x: 0, y: 0 }); acc.set(n.id, { x: 0, y: 0 }); }
  const tips = new Set();
  for (const d of drivers()) {
    const A = N(d.a), B = N(d.b);
    if (!A || !B) continue;
    const om = omega(d), rx = B.x - A.x, ry = B.y - A.y;
    vel.set(B.id, { x: -om * ry, y: om * rx });
    acc.set(B.id, { x: -om * om * rx, y: -om * om * ry });
    tips.add(B.id);
  }

  const vars = all.filter(n => n.support !== "pin" && !tips.has(n.id));
  const vi = new Map(vars.map((n, i) => [n.id, i]));
  const nv = vars.length * 2;

  const full = [], pair = [], act = [];
  for (const e of model.elems) {
    if (!isBar(e)) continue;
    const P = N(e.a), Q = N(e.b);
    const dx = 2 * (P.x - Q.x), dy = 2 * (P.y - Q.y);
    const f = new Float64Array(nAll);
    const p = ai.get(P.id), q = ai.get(Q.id);
    f[2 * p] += dx; f[2 * p + 1] += dy;
    f[2 * q] -= dx; f[2 * q + 1] -= dy;
    full.push(f); pair.push([P, Q]); act.push(e.type === "actuator" ? actLen(e, sim.simT) : null);
  }
  for (const n of all) {
    if (n.support !== "slider") continue;
    const th = n.dir * Math.PI / 180;
    const f = new Float64Array(nAll);
    const i = ai.get(n.id);
    f[2 * i] = -Math.sin(th); f[2 * i + 1] = Math.cos(th);
    full.push(f); pair.push(null); act.push(null);
  }

  function split(known, extra) {
    const rows = [], rhs = [];
    for (let r = 0; r < full.length; r++) {
      const f = full[r], row = new Float64Array(nv);
      let b = extra ? extra(r) : 0, touched = false;
      for (const n of all) {
        const i = ai.get(n.id);
        const cx = f[2 * i], cy = f[2 * i + 1];
        if (!cx && !cy) continue;
        if (vi.has(n.id)) {
          const j = vi.get(n.id);
          row[2 * j] += cx; row[2 * j + 1] += cy; touched = true;
        } else {
          const k = known.get(n.id) || { x: 0, y: 0 };
          b -= cx * k.x + cy * k.y;
        }
      }
      if (!touched) continue;
      rows.push(row); rhs.push(b);
    }
    return { rows, rhs };
  }

  // actuatoren: |p-q|² = L(t)²  geeft rechterleden 2·L·L' en 2·(L'² + L·L'')
  const sv = split(vel, r => act[r] ? 2 * act[r].L * act[r].Ld : 0);
  const xv = lsq(sv.rows, sv.rhs, nv);
  if (!xv) return null;
  vars.forEach((n, i) => vel.set(n.id, { x: xv[2 * i], y: xv[2 * i + 1] }));

  const sa = split(acc, r => {
    const pr = pair[r];
    if (!pr) return 0;
    const vp = vel.get(pr[0].id) || { x: 0, y: 0 }, vq = vel.get(pr[1].id) || { x: 0, y: 0 };
    const dvx = vp.x - vq.x, dvy = vp.y - vq.y;
    const a = act[r];
    return -2 * (dvx * dvx + dvy * dvy) + (a ? 2 * (a.Ld * a.Ld + a.L * a.Ldd) : 0);
  });
  const xa = lsq(sa.rows, sa.rhs, nv);
  if (!xa) return null;
  vars.forEach((n, i) => acc.set(n.id, { x: xa[2 * i], y: xa[2 * i + 1] }));

  return { vel, acc };
}

export function computeSweep() {
  sim.sweep = null;
  const ds = drivers(), as = actuators();
  if (!ds.length && !as.length) return;
  if (mobility().dofDriven !== 0) return;
  if (ds.some(d => !N(d.a) || !N(d.b) || N(d.a).support !== "pin")) return;

  const keep = model.nodes.map(n => ({ n, x: n.x, y: n.y }));
  const fxRest = flexRest();      // flexures: alleen de spanning wordt getoond, de stijfheid doet niet mee
  // Eén periode van de langzaamste aandrijving (kruk of actuator): de hele
  // beweging herhaalt zich alleen als de snelheden in verhouding staan.
  const per = ds.map(d => Math.abs(d.rpm || 0)).filter(r => r > 0).map(r => 60 / r)
    .concat(as.map(e => e.freq > 0 ? 1 / e.freq : 0).filter(x => x > 0));
  const dur = per.length ? Math.max(...per) : 1;
  const S = { ok: new Array(361).fill(false), pos: {}, vel: {}, acc: {},
              N: {}, EF: {}, R: {}, T: {}, t: new Array(361), dur, stat: false };
  for (const d of ds) S.T[d.id] = new Array(361).fill(NaN);
  for (const n of model.nodes) {
    S.pos[n.id] = new Array(361); S.vel[n.id] = new Array(361); S.acc[n.id] = new Array(361);
    if (n.support !== "free") S.R[n.id] = new Array(361);
  }
  for (const e of model.elems) {
    if (isBar(e)) S.N[e.id] = new Array(361);
    if (e.type === "spring" || e.type === "damper" || e.type === "gap" || e.type === "contact") S.EF[e.id] = new Array(361);
  }

  let Rmax = 0, Nmax = 0;
  for (let i = 0; i <= 360; i++) {
    const t = dur * i / 360;
    S.t[i] = t;
    const ok = placeAt(t);
    S.ok[i] = ok;
    const kin = ok ? kinAt() : null;
    for (const n of model.nodes) {
      S.pos[n.id][i] = { x: n.x, y: n.y };
      S.vel[n.id][i] = kin ? kin.vel.get(n.id) || { x: 0, y: 0 } : { x: 0, y: 0 };
      S.acc[n.id][i] = kin ? kin.acc.get(n.id) || { x: 0, y: 0 } : { x: 0, y: 0 };
    }
    const fr = kin ? forcesAt(kin.vel, kin.acc) : null;
    if (fr) {
      S.stat = true;
      for (const id in S.T) S.T[id][i] = fr.T[id];
      for (const id in S.N) S.N[id][i] = fr.N[id];
      for (const id in S.EF) S.EF[id][i] = fr.EF[id];
      for (const id in S.R) { S.R[id][i] = fr.R[id]; Rmax = Math.max(Rmax, Math.hypot(fr.R[id].x, fr.R[id].y)); }
      for (const id in S.N) Nmax = Math.max(Nmax, Math.abs(fr.N[id] || 0));
    }
  }
  S.Rmax = Rmax; S.Nmax = Nmax;
  keep.forEach(r => { r.n.x = r.x; r.n.y = r.y; });
  sim.simT = 0;
  flexTrace(S, fxRest);
  sim.solveOK = S.ok.some(Boolean);
  sim.sweep = S.ok.some(Boolean) ? S : null;
}

/* ============================================================
   Inverse dynamics — one linear system per crank angle.
   Bars are two-force members (axial N). The crank is not: it carries
   a motor torque, so it transmits a full force vector at its tip.
   Unknowns: N per bar, Fx/Fy at the crank tip, reaction per scharnier
   (2) and per glijder (1, normal to the rail). Equations: ΣF = m·a
   at every point. Square by construction when DOF = 0.
   ============================================================ */
export const G = 9.81;         // m/s²
export const MM = 1e-3;        // kg·mm/s²  ->  N

function forcesAt(vel, acc) {
  const nd = model.nodes, ri = new Map(nd.map((n, i) => [n.id, i]));
  const links = model.elems.filter(isBar);
  const pins = nd.filter(n => n.support === "pin");
  const slis = nd.filter(n => n.support === "slider");

  let nc = 0;
  const cL = new Map(), cP = new Map(), cS = new Map(), cD = new Map();
  for (const e of links) { if (e.driver) { cD.set(e.id, nc); nc += 2; } else cL.set(e.id, nc++); }
  for (const n of pins) { cP.set(n.id, nc); nc += 2; }
  for (const n of slis) cS.set(n.id, nc++);
  const neq = 2 * nd.length;
  if (nc !== neq) return null;

  const A = [];
  for (let i = 0; i < neq; i++) A.push(new Float64Array(nc + 1));

  for (const e of links) {
    const P = N(e.a), Q = N(e.b);
    const dx = Q.x - P.x, dy = Q.y - P.y, L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L;
    const p = 2 * ri.get(P.id), q = 2 * ri.get(Q.id);
    if (e.driver) {
      const c = cD.get(e.id);
      A[q][c] += 1; A[q + 1][c + 1] += 1;   // crank pushes its tip
      A[p][c] -= 1; A[p + 1][c + 1] -= 1;   // and the pivot the other way
    } else {
      const c = cL.get(e.id);
      A[p][c] += ux; A[p + 1][c] += uy;
      A[q][c] -= ux; A[q + 1][c] -= uy;
    }
  }
  for (const n of pins) { const i = 2 * ri.get(n.id), c = cP.get(n.id); A[i][c] += 1; A[i + 1][c + 1] += 1; }
  for (const n of slis) {
    const th = n.dir * Math.PI / 180, i = 2 * ri.get(n.id), c = cS.get(n.id);
    A[i][c] += -Math.sin(th); A[i + 1][c] += Math.cos(th);
  }

  // known loads
  const kn = nd.map(() => ({ x: 0, y: 0 })), EF = {};
  for (const e of model.elems) {
    if (e.type === "spring" || e.type === "damper" || e.type === "gap") {
      const P = N(e.a), Q = N(e.b);
      const dx = Q.x - P.x, dy = Q.y - P.y, L = Math.hypot(dx, dy) || 1;
      const ux = dx / L, uy = dy / L;
      let F;
      if (e.type === "spring") F = e.k * (L - e.L0);
      else {
        const vP = vel.get(P.id) || { x: 0, y: 0 }, vQ = vel.get(Q.id) || { x: 0, y: 0 };
        const Ld = (vQ.x - vP.x) * ux + (vQ.y - vP.y) * uy;
        F = e.type === "gap" ? gapForce(e, L, Ld) : e.c * Ld;
      }
      EF[e.id] = F;
      const p = ri.get(P.id), q = ri.get(Q.id);
      kn[p].x += F * ux; kn[p].y += F * uy;
      kn[q].x -= F * ux; kn[q].y -= F * uy;
    } else if (e.type === "contact") {
      const i = ri.get(e.node), P = N(e.node);
      if (i === undefined || !P) continue;
      const c = contactForce(e, P, { x: 0, y: 0 }, 0);     // alleen de normaalkracht (statisch)
      EF[e.id] = c.Fn;
      kn[i].x += c.Fn * c.nx; kn[i].y += c.Fn * c.ny;
    } else if (e.type === "force") {
      const i = ri.get(e.node);
      if (i === undefined) continue;
      const t = e.ang * Math.PI / 180;
      kn[i].x += e.mag * Math.cos(t); kn[i].y += e.mag * Math.sin(t);
    }
  }
  nd.forEach((n, i) => { if (model.gravity) kn[i].y -= (n.m || 0) * G; });
  const base = A;
  function solveWith(extra) {
    const M = base.map(r => Float64Array.from(r));
    nd.forEach((n, i) => {
      const a = acc.get(n.id) || { x: 0, y: 0 }, m = n.m || 0, ex = extra ? extra[i] : { x: 0, y: 0 };
      M[2 * i][nc] = m * a.x * MM - kn[i].x - ex.x;
      M[2 * i + 1][nc] = m * a.y * MM - kn[i].y - ex.y;
    });
    return gauss(M, nc);
  }
  let x = solveWith(null);
  if (!x) return null;
  // wrijving hangt af van de krachten die hij zelf beïnvloedt: een paar keer bijwerken
  if (hasFriction()) {
    const loadsOf = x => {
      const bear = new Map(), addB = (id, fx, fy) => { const b = bear.get(id) || { x: 0, y: 0 }; b.x += fx; b.y += fy; bear.set(id, b); };
      const bar = new Map();
      for (const e of links) {
        const P = N(e.a), Q = N(e.b), L = Math.hypot(Q.x - P.x, Q.y - P.y) || 1, ux = (Q.x - P.x) / L, uy = (Q.y - P.y) / L;
        if (e.driver) {
          const c = cD.get(e.id); bar.set(e.id, Math.hypot(x[c], x[c + 1]));
          addB(e.b, x[c], x[c + 1]); addB(e.a, -x[c], -x[c + 1]);
        } else {
          const Nf = x[cL.get(e.id)]; bar.set(e.id, Math.abs(Nf));
          addB(e.a, Nf * ux, Nf * uy); addB(e.b, -Nf * ux, -Nf * uy);
        }
      }
      return { bar: e => bar.get(e.id) || 0, sli: n => cS.has(n.id) ? Math.abs(x[cS.get(n.id)]) : 0,
               pin: n => { const b = bear.get(n.id); return b ? Math.hypot(b.x, b.y) : 0; } };
    };
    const zero = { x: 0, y: 0 };
    for (let it = 0; it < 5; it++) {
      const ex = nd.map(() => ({ x: 0, y: 0 }));
      frictionLoads((q, id) => N(id), (v, id) => vel.get(id) || zero, null, null, loadsOf(x), (id, fx, fy) => {
        const i = ri.get(id); if (i !== undefined) { ex[i].x += fx; ex[i].y += fy; }
      });
      const x2 = solveWith(ex);
      if (!x2) break;
      x = x2;
    }
  }

  const out = { N: {}, EF, R: {}, T: {} };
  for (const e of links) if (!e.driver) out.N[e.id] = x[cL.get(e.id)];
  for (const n of pins) out.R[n.id] = { x: x[cP.get(n.id)], y: x[cP.get(n.id) + 1] };
  for (const n of slis) {
    const th = n.dir * Math.PI / 180, Rn = x[cS.get(n.id)];
    out.R[n.id] = { x: -Math.sin(th) * Rn, y: Math.cos(th) * Rn, n: Rn };
  }
  for (const e of links) {
    if (!e.driver) continue;
    const c = cD.get(e.id), P = N(e.a), Q = N(e.b);
    const rx = Q.x - P.x, ry = Q.y - P.y, L = Math.hypot(rx, ry) || 1;
    out.T[e.id] = (rx * x[c + 1] - ry * x[c]) * MM;       // N·mm -> N·m
    out.N[e.id] = (x[c] * rx + x[c + 1] * ry) / L;        // axial part of the crank load
  }
  return out;
}

// Put every crank where it is at time t and solve the rest around them.
export function placeAt(t) {
  sim.simT = t;
  const fix = new Set();
  for (const d of drivers()) {
    const A = N(d.a), B = N(d.b);
    if (!A || !B) continue;
    const th = (d.theta0 || 0) * Math.PI / 180 + omega(d) * t;
    B.x = A.x + d.len * Math.cos(th);
    B.y = A.y + d.len * Math.sin(th);
    d.theta = (((th * 180 / Math.PI) % 360) + 360) % 360;
    fix.add(B.id);
  }
  return relax(fix);
}

/* ============================================================
   Mobility (Gruebler on the point/bar model)
   ============================================================ */
export function mobility() {
  const free = model.nodes.filter(n => n.support !== "pin");
  const unknowns = 2 * free.length;
  const links = model.elems.filter(isBar);
  const sliders = model.nodes.filter(n => n.support === "slider");
  // a bar between two pinned nodes constrains nothing
  const activeLinks = links.filter(e => !(N(e.a).support === "pin" && N(e.b).support === "pin"));
  const cons = activeLinks.length + sliders.length;
  const driver = links.filter(e => e.driver).length;
  const acts = links.filter(e => e.type === "actuator").length;   // een actuator is een schakel met bewegende lengte
  return {
    unknowns, cons, driver, acts, drive: driver + acts,
    dof: unknowns - cons,
    dofDriven: unknowns - cons - driver,
    nNodes: model.nodes.length,
    nPinned: model.nodes.length - free.length,
    nSliders: sliders.length,
    nLinks: links.length,
    nDead: links.length - activeLinks.length
  };
}
