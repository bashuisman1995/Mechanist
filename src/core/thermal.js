// Thermische verschuiving van een punt, analytisch (zonder DOM).
//
// Eén-richtingskoppeling temperatuur -> mechanica. Elke staaf i krijgt een lengteverandering dL_i = α_i·L_i·ΔT_i
// (axial.js). De randvoorwaarden zijn Φ_i = |p_a − p_b| − L_i = 0 (afstandsvorm) en de glijderbanen. Bij een kleine
// lengteverandering van staaf i verschuiven de vrije punten met dq, zodat
//      J·dq = −∂Φ/∂L_i · dL_i = dL_i · e_i        (J = ∂Φ/∂q, e_i = eenheidsvector op de rij van staaf i)
// De gevoeligheid s_i = ∂q/∂L_i is dus de oplossing van J·s_i = e_i (kleinste-normoplossing), en de totale verschuiving is
//      Δq = Σ_i s_i · α_i·L_i·ΔT_i.
// Krukken staan vast op hun hoek (de punt van de kruk is voorgeschreven), actuatoren op hun huidige lengte.
import { dTOf, isThermal, alphaOf, thermDL } from "./axial.js";
import { N } from "./elements.js";
import { lsq } from "./linalg.js";
import { model } from "./state.js";

const ROWS = new Set(["link", "actuator", "flexure", "loadcell"]);

/**
 * Verschuiving van punt `nodeId` door de temperatuur, op de stand zoals de knopen nu staan.
 * Geeft { ok, dx, dy, parts, resid } met dx, dy in mm en per thermische staaf
 * { e, sx, sy, dL, cx, cy }: gevoeligheid ∂x/∂L, ∂y/∂L (–), lengteverandering dL (mm) en bijdrage cx, cy (mm).
 * ok = false als het model niet vierkant bepaald is (dan is de verschuiving niet eenduidig).
 */
export function thermalShift(nodeId) {
  const tips = new Set();
  for (const e of model.elems) if (e.type === "link" && e.driver && N(e.b)) tips.add(e.b);
  const vars = model.nodes.filter(n => n.support !== "pin" && !tips.has(n.id));
  const idx = new Map(vars.map((n, i) => [n.id, i]));
  const target = idx.get(nodeId);
  const bars = [], rows = [];
  for (const e of model.elems) {
    if (!ROWS.has(e.type) || e.driver) continue;
    const A = N(e.a), B = N(e.b);
    if (!A || !B || (!idx.has(A.id) && !idx.has(B.id))) continue;
    const dx = A.x - B.x, dy = A.y - B.y, d = Math.hypot(dx, dy) || 1e-9, ux = dx / d, uy = dy / d;
    const row = new Float64Array(vars.length * 2);
    if (idx.has(A.id)) { const i = idx.get(A.id); row[2 * i] = ux; row[2 * i + 1] = uy; }
    if (idx.has(B.id)) { const i = idx.get(B.id); row[2 * i] = -ux; row[2 * i + 1] = -uy; }
    bars.push(e); rows.push(row);
  }
  for (const n of vars) {
    if (n.support !== "slider") continue;
    const th = n.dir * Math.PI / 180, row = new Float64Array(vars.length * 2), i = idx.get(n.id);
    row[2 * i] = -Math.sin(th); row[2 * i + 1] = Math.cos(th);
    bars.push(null); rows.push(row);
  }
  const out = { ok: false, dx: 0, dy: 0, parts: [], resid: 0 };
  if (target === undefined) {          // een vast punt of de punt van een kruk beweegt niet
    out.ok = true; return out;
  }
  let resid = 0, ok = rows.length === vars.length * 2;       // vierkant: elke vrijheidsgraad is vastgelegd
  for (let r = 0; r < rows.length; r++) {
    const e = bars[r];
    if (!e || !isThermal(e)) continue;
    const rhs = rows.map((_, k) => k === r ? 1 : 0);
    const s = lsq(rows, rhs, vars.length * 2);
    if (!s) { ok = false; continue; }
    rows.forEach((row, k) => {                                  // restfout van J·s = e_r
      let v = -rhs[k]; for (let j = 0; j < s.length; j++) v += row[j] * s[j];
      resid = Math.max(resid, Math.abs(v));
    });
    const sx = s[2 * target], sy = s[2 * target + 1], dL = thermDL(e);
    out.parts.push({ e, sx, sy, dL, cx: sx * dL, cy: sy * dL, alpha: alphaOf(e), dT: dTOf(e) });
    out.dx += sx * dL; out.dy += sy * dL;
  }
  out.resid = resid;
  out.ok = ok && resid < 1e-6;
  return out;
}

// punt waarvan we de verschuiving tonen: de keuze van de gebruiker, anders het laatste vrije punt
export function thermalNode() {
  const free = model.nodes.filter(n => n.support !== "pin");
  const pick = free.find(n => n.id === model.thermNode);
  return pick || free[free.length - 1] || null;
}
