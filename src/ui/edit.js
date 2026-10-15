// Bewerken van het model: knopen, elementen, aandrijvers.
import { isBeam } from "../core/axial.js";
import { contactDefaults } from "../core/contact.js";
import { flexDefaults, flexDefaultRef, GAMMA } from "../core/flexure.js";
import { dist, drivers, E, isBar, N } from "../core/elements.js";
import { barsAt, sensorDefaults, sensorName } from "../core/sensors.js";
import { eid, model, nid, ui } from "../core/state.js";
import { changed } from "./solver.js";
import { flash } from "./tools.js";

/* ============================================================
   Model edits
   ============================================================ */
export function snapPt(p) {
  if (!model.snap) return { x: round2(p.x), y: round2(p.y) };
  const g = model.grid || 1;
  return { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
}
export const round2 = v => Math.round(v * 100) / 100;
const NAMES = "ABCDEFGHJKLMNPQRSTUVWXYZ";
function nextName() {
  const i = ui.nameCounter++;
  return i < 24 ? NAMES[i] : NAMES[i % 24] + Math.floor(i / 24);
}

export function addNode(p) {
  const n = {
    id: nid(), x: round2(p.x), y: round2(p.y),
    support: "free", dir: 0, m: 0, name: nextName(),
    ax: round2(p.x), ay: round2(p.y)     // anchor of the slider rail
  };
  model.nodes.push(n);
  return n;
}

export function anchorHere(n) { n.ax = n.x; n.ay = n.y; }

export function addTwoNode(type, a, b) {
  if (a === b) return null;
  const dup = model.elems.find(e => e.type === type &&
    ((e.a === a && e.b === b) || (e.a === b && e.b === a)));
  if (dup) return dup;
  const L = dist(N(a), N(b));
  const e = { id: eid(), type, a, b };
  if (type === "link") { e.len = round2(L); e.driver = false; }
  if (type === "spring") { e.k = 1.0; e.L0 = round2(L); }
  if (type === "damper") { e.c = 0.05; }
  if (type === "gap") { e.min = round2(L - 2); e.max = round2(L + 2); e.kc = 50; e.cc = 0.05; }
  if (type === "flexure") { e.len = round2(L); Object.assign(e, flexDefaults("cantilever", L)); e.ref = flexDefaultRef(e); }
  if (type === "loadcell") { e.len = round2(L); e.name = sensorName("loadcell"); Object.assign(e, sensorDefaults("loadcell")); }
  if (type === "actuator") {
    e.len = round2(L);                               // lengte op t = 0
    e.min = round2(L * 0.85); e.max = round2(L * 1.15); e.freq = 0.5;
  }
  model.elems.push(e);
  return e;
}

// "Knoop op balk": splitst een Volledige balk op fractie t (0..1 vanaf a) in twee elementen met een punt ertussen.
// Het punt ligt exact op de lijn (niet op het raster) en erft de eigenschappen van de balk; de verbinding is Auto (Star).
export function splitBeam(id, t) {
  const e = E(id);
  if (!e || !isBeam(e) || !N(e.a) || !N(e.b)) return null;
  const A = N(e.a), B = N(e.b), f = Math.max(0.02, Math.min(0.98, t === undefined ? 0.5 : t));
  const n = addNode({ x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f });
  n.x = A.x + (B.x - A.x) * f; n.y = A.y + (B.y - A.y) * f; n.ax = n.x; n.ay = n.y;
  const e2 = { ...e, id: eid(), a: n.id, b: e.b };
  e.b = n.id;
  e.len = round2(dist(A, n)); e2.len = round2(dist(n, B));
  model.elems.push(e2);
  return n;
}

// contact: bal (het punt) op een vlak dat er precies onder ligt (hoek 0°); verschuif/draai het vlak in de inspector
export function addContact(nodeId) {
  const n = N(nodeId); if (!n) return null;
  const e = { id: eid(), type: "contact", node: nodeId, ...contactDefaults() };
  e.ax = n.x; e.ay = round2(n.y - e.R);
  model.elems.push(e);
  return e;
}

// verplaatsingssensor (b leeg = ten opzichte van de grond), hoekencoder en versnellingsopnemer
export function addDsens(a, b) {
  const A = N(a); if (!A) return null;
  const e = { id: eid(), type: "dsens", name: sensorName("dsens"), a, b: b || "", ...sensorDefaults("dsens") };
  if (b && N(b)) e.ang = round2(Math.atan2(N(b).y - A.y, N(b).x - A.x) * 180 / Math.PI);
  model.elems.push(e);
  return e;
}
export function addEncoder(nodeId) {
  const bars = barsAt(nodeId); if (!bars.length) return null;
  const e = { id: eid(), type: "encoder", name: sensorName("encoder"), node: nodeId, e1: bars[0].id, e2: bars[1] ? bars[1].id : "", ...sensorDefaults("encoder") };
  model.elems.push(e);
  return e;
}
export function addAccel(nodeId) {
  if (!N(nodeId)) return null;
  const e = { id: eid(), type: "accel", name: sensorName("accel"), node: nodeId, ...sensorDefaults("accel") };
  model.elems.push(e);
  return e;
}
// encoders verliezen hun schakels als die verdwijnen
function pruneEncoders() {
  model.elems = model.elems.filter(e => e.type !== "encoder" || (model.elems.some(x => x.id === e.e1) && (!e.e2 || model.elems.some(x => x.id === e.e2))));
}
export function removeNode(id) {
  model.nodes = model.nodes.filter(n => n.id !== id);
  model.elems = model.elems.filter(e => e.a !== id && e.b !== id && e.node !== id);
  pruneEncoders();
}
export function removeElem(id) { model.elems = model.elems.filter(e => e.id !== id); pruneEncoders(); }
export function removeSel() {
  if (!ui.sel) return;
  if (ui.sel.kind === "node") removeNode(ui.sel.id); else removeElem(ui.sel.id);
  ui.sel = null; ui.pending = null; changed();
}

export function crankAngle(l) {
  const A = N(l.a), B = N(l.b);
  let a = Math.atan2(B.y - A.y, B.x - A.x) * 180 / Math.PI;
  return Math.round(((a % 360) + 360) % 360 * 100) / 100;
}

// Lengths / rest lengths follow the sketch while you drag.
export function reharvest(nodeId) {
  for (const e of model.elems) {
    if ((e.a === nodeId || e.b === nodeId) && N(e.a) && N(e.b)) {
      const L = dist(N(e.a), N(e.b));
      if (e.type === "actuator") {          // het slagbereik schuift mee met de getekende lengte
        const d = round2(L) - e.len;
        e.min = round2(e.min + d); e.max = round2(e.max + d);
      }
      if (isBar(e) || e.type === "link" || e.type === "loadcell") e.len = round2(L);
      if (e.type === "flexure" && e.kind === "cantilever") e.L = round2(e.len / GAMMA);
      if (e.type === "spring") e.L0 = round2(L);
    }
  }
}

export function setDriver(linkId) {
  const l = E(linkId);
  if (!l || l.type !== "link") return;
  const pinned = N(l.a).support === "pin" || N(l.b).support === "pin";
  if (!pinned) { flash("De kruk moet één vast scharnier hebben. Zet eerst een scharnier op een van de uiteinden."); return; }
  const on = !l.driver;
  if (on) {
    if (N(l.a).support !== "pin") { const t = l.a; l.a = l.b; l.b = t; }
    if (drivers().some(d => d.id !== l.id && d.b === l.b)) {
      flash("Dat punt wordt al door een andere kruk aangedreven."); return;
    }
    l.theta0 = crankAngle(l);
    l.theta = l.theta0;
    if (l.rpm === undefined) l.rpm = 60;
    if (l.cw === undefined) l.cw = false;
  }
  l.driver = on;
  changed();
}
