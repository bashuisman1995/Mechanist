// Optimaliseer voor de schets (zonder DOM): welke parameters mogen veranderen, welke uitkomsten kun je kiezen en hoe een
// uitkomst bij andere parameters wordt berekend. Elke evaluatie werkt op een diepe kopie van het model die in de plaats
// van het echte model wordt gezet en daarna weer wordt teruggezet; de bestaande oplossers rekenen, de UI merkt niets.
import { axialA, beamSect, dTOf, isAxial, isBeam, isThermal, matOf } from "./axial.js";
import { channels, chVal } from "./channels.js";
import { computeDyn } from "./dynamics.js";
import { dist, E, N } from "./elements.js";
import { GAMMA } from "./flexure.js";
import { alias, compile } from "./formula.js";
import { computeFrf, frfVal } from "./frf.js";
import { computeSweep } from "./kinematics.js";
import { computeModes, solveStiffness } from "./stiffness.js";
import { thermalShift } from "./thermal.js";
import { MATERIALS, material } from "../calc/materials.js";
import { model, sim } from "./state.js";

const PI = Math.PI;
const clone = o => JSON.parse(JSON.stringify(o));
const nm = id => { const n = N(id); return n ? n.name : "?"; };
const pair = e => nm(e.a) + nm(e.b);
const PROPS = ["mode", "dT", "thermNode", "stiffNode", "stiffAng", "frfIn", "frfMin", "frfMax", "gravity", "simDur", "dtStep", "defMass", "durMode",
  "cVisc", "maxT", "jointDamp", "cJoint", "fricVs", "fricVe"];

/** Momentopname van het model (voor een run die niet door tussentijdse bewerkingen mag veranderen). */
export function takeSnap() {
  const props = {}; PROPS.forEach(k => { props[k] = model[k]; });
  return { nodes: clone(model.nodes), elems: clone(model.elems), props };
}

/* ---------- parameters ---------- */
function span() {
  let a = Infinity, b = -Infinity;
  model.nodes.forEach(n => { a = Math.min(a, n.x, n.y); b = Math.max(b, n.x, n.y); });
  return Math.max(20, b - a);
}
const BEAM_FIELDS = { rect: [["pb", "breedte b", 10], ["ph", "hoogte h", 2]], round: [["pd", "diameter d", 4]], tube: [["pD", "buitendiameter D", 10], ["pdi", "binnendiameter d", 8]], custom: [["A", "oppervlak A", 20], ["I", "traagheidsmoment I", 50]] };
const BEAM_UNIT = { pb: "mm", ph: "mm", pd: "mm", pD: "mm", pdi: "mm", A: "mm²", I: "mm⁴" };

/**
 * Alle parameters van het huidige model die geoptimaliseerd kunnen worden:
 * [{ key, label, unit, type: "num"|"mat", group, value, min, max, log }]. Voor een knoop of element dat al bestaat.
 */
export function listVars() {
  const out = [], sp = span();
  const num = (key, label, unit, value, group, lin) => {
    const v = Number(value);
    const r = +(sp / 4).toPrecision(1), p2 = x => +x.toPrecision(2);         // ronde standaardgrenzen: ±een kwart van de afmeting, of een factor 4
    out.push(lin ? { key, label, unit, type: "num", group, value: v, min: +(v - r).toPrecision(4), max: +(v + r).toPrecision(4), log: false }
      : { key, label, unit, type: "num", group, value: v, min: v > 0 ? p2(v / 4) : 0, max: v > 0 ? p2(v * 4) : 1, log: v > 0 });
  };
  for (const n of model.nodes) {
    let ax = true, ay = true;
    if (n.support === "slider") {                      // langs de rail: een horizontale rail laat alleen x, een verticale alleen y toe
      const th = (n.dir || 0) * PI / 180;
      if (Math.abs(Math.sin(th)) < 1e-9) ay = false; else if (Math.abs(Math.cos(th)) < 1e-9) ax = false;
    }
    if (ax) num("nx:" + n.id, "x van punt " + n.name, "mm", n.x, "Punten", true);
    if (ay) num("ny:" + n.id, "y van punt " + n.name, "mm", n.y, "Punten", true);
    if (n.m > 0) num("nm:" + n.id, "massa m van punt " + n.name, "kg", n.m, "Elementen");
  }
  for (const e of model.elems) {
    if (!N(e.a) && e.type !== "force") continue;
    const p = e.type === "force" ? "" : pair(e);
    if (e.type === "spring") num("k:" + e.id, "veerstijfheid k van " + p, "N/mm", e.k, "Elementen");
    else if (e.type === "damper") num("c:" + e.id, "demping c van " + p, "N·s/mm", e.c, "Elementen");
    else if (e.type === "flexure") {
      num("fb:" + e.id, "flexure " + p + ": breedte b", "mm", e.wd || 10, "Elementen");
      num("ft:" + e.id, "flexure " + p + ": dikte t", "mm", e.t || 0.3, "Elementen");
      num("fl:" + e.id, "flexure " + p + ": lengte L", "mm", e.L || 20, "Elementen");
      out.push({ key: "mat:" + e.id, label: "flexure " + p + ": materiaal", type: "mat", group: "Materialen", value: e.mat || "staal" });
    } else if (e.type === "link" && !e.driver) {
      if (isBeam(e)) (BEAM_FIELDS[BEAM_FIELDS[e.prof] ? e.prof : "rect"]).forEach(f => num("bp:" + e.id + ":" + f[0], "balk " + p + ": " + f[1], BEAM_UNIT[f[0]], e[f[0]] > 0 ? e[f[0]] : f[2], "Elementen"));
      else if (isAxial(e)) {
        if (e.sect === "bh") { num("ax:" + e.id + ":sb", "staaf " + p + ": breedte b", "mm", e.sb > 0 ? e.sb : 5, "Elementen"); num("ax:" + e.id + ":sh", "staaf " + p + ": hoogte h", "mm", e.sh > 0 ? e.sh : 4, "Elementen"); }
        else num("ax:" + e.id + ":A", "staaf " + p + ": oppervlak A", "mm²", axialA(e), "Elementen");
      }
      out.push({ key: "mat:" + e.id, label: "staaf " + p + ": materiaal", type: "mat", group: "Materialen", value: e.mat || "staal" });
    }
  }
  return out;
}

// lengtes volgen de tekening (zoals slepen): de hoofdbewerking na het verplaatsen van een punt
function fixLens(ids) {
  for (const e of model.elems) {
    if (!(ids.indexOf(e.a) >= 0 || ids.indexOf(e.b) >= 0) || !N(e.a) || !N(e.b)) continue;
    const L = dist(N(e.a), N(e.b));
    if (e.type === "actuator") { const d = L - e.len; e.min += d; e.max += d; }
    if (e.type === "link" || e.type === "actuator" || e.type === "flexure" || e.type === "loadcell") e.len = L;
    if (e.type === "flexure" && e.kind === "cantilever") e.L = L / GAMMA;
    if (e.type === "spring") e.L0 = L;
  }
}
/** Zet één parameter op het (huidige of gekopieerde) model. */
export function setVar(key, v) {
  const [t, id, f] = key.split(":");
  const n = N(id), e = E(id);
  if (t === "nx" || t === "ny") { if (!n) return; n[t === "nx" ? "x" : "y"] = v; n.ax = n.x; n.ay = n.y; fixLens([id]); return; }
  if (t === "nm") { if (n) n.m = v; return; }
  if (!e) return;
  if (t === "k") e.k = v;
  else if (t === "c") e.c = v;
  else if (t === "fb") e.wd = v;
  else if (t === "ft") e.t = v;
  else if (t === "fl") {
    e.L = v;
    if (e.kind === "cantilever" && N(e.a) && N(e.b)) {             // de schakel is γ·L lang: het eindpunt schuift mee langs de schakel
      const A = N(e.a), B = N(e.b), d = dist(A, B) || 1, L = GAMMA * v;
      B.x = A.x + (B.x - A.x) / d * L; B.y = A.y + (B.y - A.y) / d * L; B.ax = B.x; B.ay = B.y;
      fixLens([B.id]);
    }
  } else if (t === "bp" || t === "ax") e[f] = v;
  else if (t === "mat") e.mat = v;
}
export function getVar(key) {
  const [t, id, f] = key.split(":");
  const n = N(id), e = E(id);
  if (t === "nx") return n ? n.x : NaN;
  if (t === "ny") return n ? n.y : NaN;
  if (t === "nm") return n ? n.m : NaN;
  if (!e) return NaN;
  if (t === "k") return e.k;
  if (t === "c") return e.c;
  if (t === "fb") return e.wd || 10;
  if (t === "ft") return e.t || 0.3;
  if (t === "fl") return e.L || 20;
  if (t === "bp") return e[f];
  if (t === "ax") return f === "A" ? axialA(e) : e[f];
  if (t === "mat") return e.mat || "staal";
  return NaN;
}

/* ---------- uitkomsten ---------- */
export const OUT_MODES = { kin: "Kinematisch", dyn: "Dynamisch", equil: "Evenwicht", frf: "FRF", stiff: "Stijfheid" };
/** Uitkomsten van de huidige modus: [{ key, label, unit, group }]. De sleutel "fx" is een zelf getypte formule (t = 0). */
export function listOutputs() {
  const out = [], m = model.mode, fr = model.nodes.filter(n => n.support !== "pin");
  const O = (key, label, unit, group) => out.push({ key, label, unit, group });
  if (m === "kin") {
    fr.forEach(n => { O("x:" + n.id, "x van " + n.name + " (t = 0)", "mm", "Positie"); O("y:" + n.id, "y van " + n.name + " (t = 0)", "mm", "Positie"); });
    if (model.elems.some(isThermal)) fr.forEach(n => {
      O("th:" + n.id + ":sum", "thermische drift |Δx|+|Δy| van " + n.name, "µm", "Thermisch");
      O("th:" + n.id + ":dx", "thermische Δx van " + n.name, "µm", "Thermisch");
      O("th:" + n.id + ":dy", "thermische Δy van " + n.name, "µm", "Thermisch");
      O("th:" + n.id + ":abs", "thermische |Δ| van " + n.name, "µm", "Thermisch");
    });
    channels().forEach(c => { if (c.hide || c.stiff || /^n\|[^|]*\|(x|y)$/.test(c.key)) return; O("ch:" + c.key, c.lab + " (t = 0)", c.u, "Kanalen"); });
    O("fx", "formule van metingen (t = 0)", "", "Formule");
  } else if (m === "stiff") {
    const free = model.nodes.filter(n => n.support !== "pin" || n.clamp !== true);
    free.forEach(n => {
      O("ux:" + n.id, "uₓ van " + n.name, "µm", "Verplaatsing"); O("uy:" + n.id, "u_y van " + n.name, "µm", "Verplaatsing");
      O("u:" + n.id, "|u| van " + n.name, "µm", "Verplaatsing");
      O("kpt:" + n.id, "stijfheid in " + n.name + " (richting " + (isFinite(model.stiffAng) ? model.stiffAng : 90) + "°)", "N/mm", "Stijfheid");
    });
    O("sigmax", "maximale spanning", "MPa", "Spanning"); O("sigratio", "maximale σ/σ_toel", "%", "Spanning");
    O("f1", "eerste eigenfrequentie", "Hz", "Eigenfrequentie"); O("mass", "massa van balken en staven", "g", "Massa");
  } else if (m === "frf") {
    O("f1", "eerste eigenfrequentie", "Hz", "Eigenfrequentie"); O("f2", "tweede eigenfrequentie", "Hz", "Eigenfrequentie");
    channels().forEach(c => { if (c.frf && !c.hide && !c.stiff) O("pk:" + c.key, "piek |" + c.lab + "| per ingang", (c.u || "") + "/ingang", "Piekamplitude"); });
  } else {                                           // dynamisch en evenwicht: eindstand van een punt
    fr.forEach(n => { O("e:" + n.id + ":x", "x van " + n.name + " (eindstand)", "mm", "Eindstand"); O("e:" + n.id + ":y", "y van " + n.name + " (eindstand)", "mm", "Eindstand"); });
  }
  return out;
}

/* ---------- evaluatie ---------- */
/**
 * Berekent de gevraagde uitkomsten op een kopie van de momentopname `snap`, met de parameters in `assign`
 * ({ sleutel: waarde }) erop gezet. opts.fx = formule voor de uitkomst "fx".
 * Geeft { vals: {sleutel: getal}, err } terug; een uitkomst die niet te berekenen is, is NaN.
 */
export function evaluate(snap, assign, keys, opts) {
  opts = opts || {};
  const live = { nodes: model.nodes, elems: model.elems }, props = {}, simKeep = { sweep: sim.sweep, ok: sim.solveOK, t: sim.simT, len: sim.lenOv, msg: sim.frfMsg };
  PROPS.forEach(k => { props[k] = model[k]; });
  model.nodes = clone(snap.nodes); model.elems = clone(snap.elems); Object.assign(model, snap.props);
  const vals = {};
  let err = "";
  try {
    for (const k in assign) setVar(k, assign[k]);
    const cache = {};
    const sweep = () => {
      if (cache.sw === undefined) { computeSweep(); cache.sw = sim.sweep || null; if (!cache.sw) err = "geen kinematische oplossing (is het mechanisme bepaald en aangedreven?)"; }
      return cache.sw;
    };
    const stiff = () => {
      if (cache.st === undefined) { const r = solveStiffness(); cache.st = r.ok ? r : null; if (!cache.st) err = r.empty ? "niets om door te rekenen" : r.mech ? r.mech.text : "geen oplossing"; }
      return cache.st;
    };
    const frfRun = full => {
      const key = full ? "ff" : "fm";
      if (cache[key] === undefined) {
        const gen = computeFrf();
        let r = gen.next();
        if (!full) { while (!r.done && !(r.value && r.value.modes)) r = gen.next(); }
        if (!full) { cache[key] = r.done ? null : r.value; try { gen.return(); } catch (_) { /* klaar */ } }
        else { while (!r.done) r = gen.next(); cache[key] = r.value; }
        if (!cache[key]) err = sim.frfMsg || "geen FRF-oplossing";
      }
      return cache[key];
    };
    for (const key of keys) {
      const [t, a, b] = key.split(":");
      let v = NaN;
      if (t === "x" || t === "y") { const n = N(a); v = n ? n[t] : NaN; }
      else if (t === "th") {
        if (!model.elems.some(e => isThermal(e) && dTOf(e) !== 0)) model.dT = 1;      // zonder ΔT: de drift per kelvin
        if (cache["th" + a] === undefined) cache["th" + a] = thermalShift(a);
        const r = cache["th" + a];
        if (r.ok) { const dx = r.dx * 1000, dy = r.dy * 1000; v = b === "sum" ? Math.abs(dx) + Math.abs(dy) : b === "dx" ? dx : b === "dy" ? dy : Math.hypot(dx, dy); }
        else err = "thermische verschuiving niet eenduidig (het mechanisme moet bepaald zijn)";
      } else if (t === "ch") { const S = sweep(); if (S) v = chVal(S, key.slice(3), 0); }
      else if (key === "fx") {
        const S = sweep();
        if (S) {
          try {
            const c = compile(opts.fx || "0");
            v = c.f(nmx => (nmx === "t" ? S.t[0] : chVal(S, alias(nmx).key, 0)));
          } catch (ex) { err = "formule: " + ex.message; }
        }
      } else if (t === "ux" || t === "uy" || t === "u") {
        const R = stiff(); const d = R ? R.nodes.get(a) : null;
        if (d) v = t === "ux" ? d.ux * 1000 : t === "uy" ? d.uy * 1000 : Math.hypot(d.ux, d.uy) * 1000;
      } else if (t === "kpt") { const R = stiff(); const pk = R ? R.pointK(a, isFinite(model.stiffAng) ? model.stiffAng : 90) : null; v = pk && isFinite(pk.k) ? pk.k : NaN; }
      else if (t === "sigmax") { const R = stiff(); if (R) v = R.sigMax ? R.sigMax.val : 0; }
      else if (t === "sigratio") { const R = stiff(); if (R) v = R.sigMax ? R.sigMax.ratio * 100 : 0; }
      else if (t === "mass") {
        let g = 0;
        for (const e of model.elems) {
          if (e.type !== "link" || e.driver || !N(e.a) || !N(e.b)) continue;
          if (isBeam(e)) g += beamSect(e).A * e.len * matOf(e).rho * 1e-9 * 1000;
          else if (isAxial(e)) g += axialA(e) * e.len * matOf(e).rho * 1e-9 * 1000;
        }
        v = g;
      } else if (t === "f1" || t === "f2") {
        if (model.mode === "frf") {
          const S = frfRun(false), ms = S ? S.modes.filter(q => q.f > 1e-6) : [];
          v = ms[t === "f1" ? 0 : 1] ? ms[t === "f1" ? 0 : 1].f : NaN;
        } else {
          const R = stiff();
          if (R) { if (cache.md === undefined) { try { cache.md = computeModes(R, 1).modes; } catch (_) { cache.md = []; } } v = cache.md[0] ? cache.md[0].f : NaN; }
        }
      } else if (t === "pk") {
        const S = frfRun(true);
        if (S) { let mx = 0; for (let i = 0; i <= 360; i++) { const z = S.ok[i] ? frfVal(S, key.slice(3), i) : null; if (z) mx = Math.max(mx, Math.hypot(z[0], z[1])); } v = mx; }
      } else if (t === "e") {
        if (cache.dy === undefined) {
          const gen = computeDyn(); let r = gen.next(); while (!r.done) r = gen.next();
          cache.dy = r.value || null; if (!cache.dy) err = "geen dynamische oplossing (overbepaald?)";
        }
        const S = cache.dy;
        if (S && S.pos[a]) { let i = 360; while (i > 0 && S.ok && !S.ok[i]) i--; const p = S.pos[a][i]; v = p ? p[b] : NaN; }
      }
      vals[key] = typeof v === "number" ? v : NaN;
    }
  } catch (ex) { err = ex.message; keys.forEach(k => { if (!(k in vals)) vals[k] = NaN; }); }
  finally {
    model.nodes = live.nodes; model.elems = live.elems; Object.assign(model, props);
    sim.sweep = simKeep.sweep; sim.solveOK = simKeep.ok; sim.simT = simKeep.t; sim.lenOv = simKeep.len; sim.frfMsg = simKeep.msg;
  }
  return { vals, err };
}

/** Zet de waarden in `assign` op het echte model (zonder iets te tekenen of op te slaan). */
export function applyAssign(assign) { for (const k in assign) setVar(k, assign[k]); }
export { MATERIALS, material };
