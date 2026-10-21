// Sensoren: krachtopnemer, verplaatsingssensor, hoekencoder en versnellingsopnemer (zonder DOM).
//
// Een sensor meet iets, maar verandert ook het systeem:
//   Krachtopnemer (loadcell): axiale veer k_s tussen twee punten, optioneel met eigen massa (half op elk punt).
//                             F = k_s·Δ, de opnemer zelf vervormt Δ = F/k_s; in serie met de rest: 1/k_tot = 1/k + 1/k_s.
//                             Kinematisch is hij een stijve schakel (de kracht komt uit de statica).
//   Verplaatsingssensor:      verandering van de afstand (of de positie ten opzichte van de grond) langs een richting,
//                             met bereik ± en resolutie; geen stijfheid, geen massa.
//   Hoekencoder:              hoek in een scharnier tussen twee schakels (of schakel en grond), met counts/omwenteling.
//   Versnellingsopnemer:      massa m_s op een punt (telt mee in dynamica en FRF) en meet de versnelling langs een richting.
// Waarden zijn relatief ten opzichte van de getekende stand (beeld 0). Eenheden: mm, N, kg; uitvoer in µm, °, µrad, m/s², g.
import { axialK, isAxial, thermLen } from "./axial.js";
import { E, N } from "./elements.js";
import { model, sim, ui } from "./state.js";
import { t } from "../ui/i18n.js";

// nm (naam), pre (voorvoegsel van de standaardnaam) en short (kleine letters) volgen de gekozen taal
const sensorDef = id => ({ get nm() { return t("sens." + id + ".nm"); }, get pre() { return t("sens." + id + ".pre"); }, get short() { return t("sens." + id + ".short"); } });
export const SENSORS = { loadcell: sensorDef("loadcell"), dsens: sensorDef("dsens"), encoder: sensorDef("encoder"), accel: sensorDef("accel") };
export const isSensor = e => !!SENSORS[e.type];
export const KS_DEFAULT = 1e5;        // N/mm = 100 N/µm
export const MS_DEFAULT = 0.01;       // kg, versnellingsopnemer
export const G_MM = 9806.65;          // mm/s² per g
const rad = Math.PI / 180;
const wrap = x => x - 2 * Math.PI * Math.round(x / (2 * Math.PI));

/* ---- veer-achtige elementen: een krachtopnemer is een stijve veer met rustlengte = getekende lengte ---- */
export const springLike = e => e.type === "spring" || e.type === "loadcell" || isAxial(e);     // axiale schakel: k = E·A/L, rustlengte met thermische rek
export const springK = e => isAxial(e) ? axialK(e) : e.type === "loadcell" ? Math.max(1e-6, e.ks > 0 ? e.ks : KS_DEFAULT) : e.k;
export const springL0 = e => isAxial(e) ? thermLen(e) : e.type === "loadcell" ? e.len : e.L0;

// serie van een stijfheid k en de krachtopnemer k_s; en de verschuiving van de eigenfrequentie door extra massa m_s op massa m
export const seriesK = (k, ks) => k > 0 && ks > 0 ? 1 / (1 / k + 1 / ks) : 0;
export const massShift = (m, ms) => Math.sqrt(m / (m + ms));

// extra massa die sensoren op een punt zetten (kg)
export function sensorMass(id) {
  let m = 0;
  for (const e of model.elems) {
    if (e.type === "accel" && e.node === id) m += e.m >= 0 ? e.m : MS_DEFAULT;
    else if (e.type === "loadcell" && (e.a === id || e.b === id)) m += (e.m > 0 ? e.m : 0) / 2;
  }
  return m;
}

/* ---- defaults en namen ---- */
export function sensorName(type) {
  const used = new Set(model.elems.map(e => e.name));
  for (let i = 1; ; i++) if (!used.has(SENSORS[type].pre + i)) return SENSORS[type].pre + i;
}
export const sensorDefaults = type => ({
  loadcell: { ks: KS_DEFAULT, m: 0 },
  dsens: { ang: 0, range: 100, res: 0.1 },
  encoder: { cpr: 4096 },
  accel: { ang: 90, m: MS_DEFAULT }
}[type]);

/* ---- meetwaarden uit posities; P(id) en P0(id) geven {x, y} (nu en getekend) of null ---- */
export function dsensDisp(e, P, P0) {         // mm
  const a = P(e.a), a0 = P0(e.a), t = (e.ang || 0) * rad, cx = Math.cos(t), cy = Math.sin(t);
  if (!a || !a0) return NaN;
  if (e.b && N(e.b)) {
    const b = P(e.b), b0 = P0(e.b);
    if (!b || !b0) return NaN;
    return ((b.x - a.x) - (b0.x - a0.x)) * cx + ((b.y - a.y) - (b0.y - a0.y)) * cy;
  }
  return (a.x - a0.x) * cx + (a.y - a0.y) * cy;
}
export const encBars = e => {
  const b1 = E(e.e1), b2 = e.e2 ? E(e.e2) : null;
  return b1 && N(e.node) && N(b1.a) && N(b1.b) && (!e.e2 || (b2 && N(b2.a) && N(b2.b))) ? { b1, b2 } : null;
};
export function encAngle(e, P, P0) {         // rad
  const bb = encBars(e); if (!bb) return NaN;
  const dir = (bar, Q) => {
    const o = bar.a === e.node ? bar.b : bar.a, p = Q(e.node), q = Q(o);
    return p && q ? Math.atan2(q.y - p.y, q.x - p.x) : NaN;
  };
  const th = Q => dir(bb.b1, Q) - (bb.b2 ? dir(bb.b2, Q) : 0);
  return wrap(th(P) - th(P0));
}
export const encRes = e => 2 * Math.PI / Math.max(1, e.cpr || 4096);              // rad per count
export const encQuant = (e, th) => Math.round(th / encRes(e)) * encRes(e);
export const accVal = (e, a) => a ? (a.x * Math.cos((e.ang || 0) * rad) + a.y * Math.sin((e.ang || 0) * rad)) / 1000 : NaN;   // m/s²
export const dsensOut = (e, x_um) => ({ oor: Math.abs(x_um) > (e.range > 0 ? e.range : Infinity),
  q: e.res > 0 ? Math.round(x_um / e.res) * e.res : x_um });

// kanaalwaarde van een sensor in een oplossing S op beeld i
export function sensorVal(S, e, k, i) {
  const P = id => S.pos && S.pos[id] ? S.pos[id][i] || null : null, P0 = id => S.pos && S.pos[id] ? S.pos[id][0] || null : null;
  if (e.type === "loadcell") {
    const F = S.EF && S.EF[e.id] ? S.EF[e.id][i] : NaN;
    return k === "d" ? F / springK(e) * 1000 : F;
  }
  if (e.type === "dsens") return dsensDisp(e, P, P0) * 1000;
  if (e.type === "encoder") {
    const th = encAngle(e, P, P0);
    return k === "th" ? th / rad : k === "thu" ? th * 1e6 : encQuant(e, th) / rad;
  }
  if (e.type === "accel") {
    const a = S.acc && S.acc[e.node] ? S.acc[e.node][i] : null, v = accVal(e, a);
    return k === "g" ? v * 1000 / G_MM : v;
  }
  return NaN;
}
// uitlezing op het getoonde beeld (of null als er geen doorgerekende beweging is)
export function sensorLive(e) {
  const S = sim.sweep, i = Math.round(ui.frame);
  if (!S || S.frf) return null;
  if (e.type === "loadcell") {
    const F = sensorVal(S, e, "F", i);
    return isFinite(F) ? { F, d: F / springK(e) * 1000 } : null;
  }
  if (e.type === "dsens") {
    const x = sensorVal(S, e, "x", i);
    return isFinite(x) ? Object.assign({ x }, dsensOut(e, x)) : null;
  }
  if (e.type === "encoder") {
    const th = sensorVal(S, e, "th", i);
    return isFinite(th) ? { th, thu: sensorVal(S, e, "thu", i), thq: sensorVal(S, e, "thq", i) } : null;
  }
  if (e.type === "accel") {
    const a = sensorVal(S, e, "a", i);
    return isFinite(a) ? { a, g: a * 1000 / G_MM } : null;
  }
  return null;
}

/* ---- kanalen (komen bovenaan de keuzelijst onder "Sensoren") ---- */
export function sensorChannels() {
  const out = [];
  for (const e of model.elems) {
    if (!isSensor(e) || !e.name) continue;
    const nm = e.name, o = SENSORS[e.type].nm + " " + nm, base = { g: t("sens.group"), o, obj: e.id };
    const add = (key, q, u, al, frf, lab) => out.push(Object.assign({ key, lab: lab || nm + " · " + q, q, u, al: nm + "." + al, frf }, base));
    if (e.type === "loadcell" && N(e.a) && N(e.b)) {
      add("s|" + e.id + "|F", "F", "N", "F", true);
      add("m|" + e.id + "|d", "δ", "µm", "d", true, nm + " · " + t("sens.lc.def") + " δ");
    } else if (e.type === "dsens" && N(e.a)) {
      add("m|" + e.id + "|x", "x", "µm", "x", true);
    } else if (e.type === "encoder" && encBars(e)) {
      add("m|" + e.id + "|th", "θ", "°", "th", true);
      add("m|" + e.id + "|thu", "θ (µrad)", "µrad", "thu", true);
      add("m|" + e.id + "|thq", "θ " + t("sens.quant"), "°", "thq", false);
    } else if (e.type === "accel" && N(e.node)) {
      add("m|" + e.id + "|a", "a", "m/s²", "a", true);
      add("m|" + e.id + "|g", "a (g)", "g", "g", true);
    }
  }
  return out;
}

// aanbevolen maximale tijdstap (s) voor een krachtopnemer of axiale staaf in Dynamica: RK4 is stabiel tot ongeveer 2,8/ω
export function loadcellDt(e, defMass) {
  const A = N(e.a), B = N(e.b); if (!A || !B) return Infinity;
  const mOf = n => (n.support === "pin" ? Infinity : (n.m > 0 ? n.m : defMass || 0.1) + sensorMass(n.id));
  const mA = mOf(A), mB = mOf(B), m = 1 / (1 / mA + 1 / mB);
  if (!isFinite(m)) return Infinity;
  const w = Math.sqrt(springK(e) / (m * 1e-3));      // N/mm / (kg -> N s²/mm)
  return 2.8 / w;
}

// schakels die in een punt samenkomen (kandidaten voor een hoekencoder)
export const barsAt = nodeId => model.elems.filter(e => (e.type === "link" || e.type === "actuator" || e.type === "flexure" || e.type === "loadcell") &&
  (e.a === nodeId || e.b === nodeId) && N(e.a) && N(e.b));
