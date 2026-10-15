// Elementen van het model: lengtes, aandrijvingen, wrijving, speling (zonder DOM).
import { model, sim } from "./state.js";

export const N = id => model.nodes.find(n => n.id === id);
export const E = id => model.elems.find(e => e.id === id);

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/* ---- lineaire actuator ----
   De lengte beweegt sinusvormig tussen min en max met frequentie freq (Hz).
   Op t = 0 heeft hij zijn getekende lengte en schuift hij uit. */
export function actLen(e, t) {
  const lo = Math.min(e.min, e.max), hi = Math.max(e.min, e.max);
  const w = 2 * Math.PI * (e.freq || 0), La = (hi - lo) / 2, Lm = (hi + lo) / 2;
  if (!(La > 0) || !(w > 0)) return { L: e.len, Ld: 0, Ldd: 0 };
  const L0 = Math.max(lo, Math.min(hi, e.len));
  const ph = Math.asin(Math.max(-1, Math.min(1, (L0 - Lm) / La))) + w * t;
  return { L: Lm + La * Math.sin(ph), Ld: La * w * Math.cos(ph), Ldd: -La * w * w * Math.sin(ph) };
}
export const actuators = () => model.elems.filter(e => e.type === "actuator" && N(e.a) && N(e.b));
export const isBar = e => e.type === "link" || e.type === "actuator" || e.type === "flexure";
export function curLen(e) {
  if (e.type !== "actuator") return e.len;
  if (sim.lenOv && sim.lenOv.has(e.id)) return sim.lenOv.get(e.id);
  return actLen(e, sim.simT).L;
}

// Demping in scharnieren: een rotatiedemper tussen elk paar lichamen dat in
// een knooppunt samenkomt (stangen, en de vaste wereld bij een oplegging).
// Een moment τ op een stang wordt een krachtenkoppel op zijn uiteinden.
// Geeft een functie (q, v, add) terug, of null als er geen scharnierdemping is.
export function jointDamper(pos, vel) {
  const cj = model.jointDamp ? Math.max(0, model.cJoint || 0) * 1000 : 0;   // N·m·s -> N·mm·s
  const joints = [];
  if (cj > 0) for (const n of model.nodes) {
    const ls = model.elems.filter(e => isBar(e) && (e.a === n.id || e.b === n.id) && N(e.a) && N(e.b));
    const ground = n.support !== "free";
    if (ls.length + (ground ? 1 : 0) >= 2) joints.push({ ls, ground });
  }
  if (!joints.length) return null;
  return function (q, v, add) {
    for (const j of joints) {
      const bodies = j.ls.map(e => {
        const P = pos(q, e.a), Q = pos(q, e.b), vP = vel(v, e.a), vQ = vel(v, e.b);
        const rx = Q.x - P.x, ry = Q.y - P.y, L2 = rx * rx + ry * ry || 1;
        return { e, rx, ry, L2, w: (rx * (vQ.y - vP.y) - ry * (vQ.x - vP.x)) / L2 };
      });
      if (j.ground) bodies.push({ e: null, w: 0 });
      for (let a = 0; a < bodies.length; a++)
        for (let b = a + 1; b < bodies.length; b++) {
          const tau = -cj * (bodies[a].w - bodies[b].w);
          torque(bodies[a], tau); torque(bodies[b], -tau);
        }
    }
    function torque(B, tau) {
      if (!B.e) return;
      const k = tau / B.L2;
      add(B.e.b, -k * B.ry, k * B.rx);
      add(B.e.a, k * B.ry, -k * B.rx);
    }
  };
}

/* ---- wrijving ----
   Stribeck, dus niet puur Coulomb: μ loopt van μs (stilstand) naar μk
   (glijden) met de Stribeck-snelheid vS, en rond v = 0 wordt hij over vε
   afgevlakt zodat de integratie stabiel blijft:
      μ(v) = [μk + (μs − μk)·exp(−(v/vS)²)] · tanh(v/vε)
   Glijder: kracht langs de rails, μ·normaalkracht.
   Scharnier: moment μ·r·lagerkracht tussen elk paar lichamen in het punt,
   met v = r·ω_rel (r = penstraal). `load` levert de krachten die daarvoor
   nodig zijn: bar(e) axiaal, pin(n) lagerkracht, sli(n) normaalkracht. */
export function hasFriction() { return model.nodes.some(n => n.mus > 0 || n.muk > 0); }
export function frictionLoads(pos, vel, q, v, load, add) {
  const vS = Math.max(1e-6, model.fricVs || 5), ve = Math.max(1e-6, model.fricVe || 2);
  const mu = (n, s) => {
    const a = Math.abs(s), ms = n.mus || 0, mk = n.muk || 0;
    return Math.sign(s) * (mk + (ms - mk) * Math.exp(-(a / vS) * (a / vS))) * Math.tanh(a / ve);
  };
  const torque = (B, tau) => {
    if (!B.e) return;
    const k = tau / B.L2;
    add(B.e.b, -k * B.ry, k * B.rx);
    add(B.e.a, k * B.ry, -k * B.rx);
  };
  for (const n of model.nodes) {
    if (!(n.mus > 0 || n.muk > 0)) continue;
    if (n.support === "slider") {
      const th = n.dir * Math.PI / 180, tx = Math.cos(th), ty = Math.sin(th);
      const vn = vel(v, n.id), vt = vn.x * tx + vn.y * ty;
      const F = -mu(n, vt) * load.sli(n);
      add(n.id, F * tx, F * ty);
    }
    const r = n.rj > 0 ? n.rj : 5;
    const bodies = model.elems.filter(e => isBar(e) && (e.a === n.id || e.b === n.id) && N(e.a) && N(e.b)).map(e => {
      const P = pos(q, e.a), Q = pos(q, e.b), vP = vel(v, e.a), vQ = vel(v, e.b);
      const rx = Q.x - P.x, ry = Q.y - P.y, L2 = rx * rx + ry * ry || 1;
      return { e, rx, ry, L2, w: (rx * (vQ.y - vP.y) - ry * (vQ.x - vP.x)) / L2, F: load.bar(e) };
    });
    if (n.support !== "free") bodies.push({ e: null, w: 0, F: 0 });
    for (let a = 0; a < bodies.length; a++)
      for (let b = a + 1; b < bodies.length; b++) {
        const A = bodies[a], B = bodies[b];
        const Nn = (!A.e || !B.e) ? load.pin(n) : (A.F + B.F) / 2;
        if (!(Nn > 0)) continue;
        const tau = -mu(n, r * (A.w - B.w)) * r * Nn;
        torque(A, tau); torque(B, -tau);
      }
  }
}

// speling: vrij tussen kortst en langst, daarbuiten een stijve aanslag met demping
export function gapForce(e, L, Ld) {
  const lo = Math.min(e.min, e.max), hi = Math.max(e.min, e.max);
  if (L < lo) return Math.min(0, (e.kc || 0) * (L - lo) + (e.cc || 0) * Ld);
  if (L > hi) return Math.max(0, (e.kc || 0) * (L - hi) + (e.cc || 0) * Ld);
  return 0;
}
export function gapPen(e, L) {
  const lo = Math.min(e.min, e.max), hi = Math.max(e.min, e.max);
  return L < lo ? L - lo : L > hi ? L - hi : 0;
}

export function drivers() { return model.elems.filter(e => e.type === "link" && e.driver); }
// dynamisch en FRF rekenen op de achtergrond, kinematisch direct
export function asyncMode() { return model.mode === "dyn" || model.mode === "frf"; }
export const omega = d => (d.cw ? -1 : 1) * (d.rpm || 0) * Math.PI / 30;   // rad/s
