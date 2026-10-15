// Bewerken van het model: knopen, elementen, aandrijvers.
import { contactDefaults } from "../core/contact.js";
import { dist, drivers, E, isBar, N } from "../core/elements.js";
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
  if (type === "actuator") {
    e.len = round2(L);                               // lengte op t = 0
    e.min = round2(L * 0.85); e.max = round2(L * 1.15); e.freq = 0.5;
  }
  model.elems.push(e);
  return e;
}

// contact: bal (het punt) op een vlak dat er precies onder ligt (hoek 0°); verschuif/draai het vlak in de inspector
export function addContact(nodeId) {
  const n = N(nodeId); if (!n) return null;
  const e = { id: eid(), type: "contact", node: nodeId, ...contactDefaults() };
  e.ax = n.x; e.ay = round2(n.y - e.R);
  model.elems.push(e);
  return e;
}

export function removeNode(id) {
  model.nodes = model.nodes.filter(n => n.id !== id);
  model.elems = model.elems.filter(e => e.a !== id && e.b !== id && e.node !== id);
}
export function removeElem(id) { model.elems = model.elems.filter(e => e.id !== id); }
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
    if (e.a === nodeId || e.b === nodeId) {
      const L = dist(N(e.a), N(e.b));
      if (e.type === "actuator") {          // het slagbereik schuift mee met de getekende lengte
        const d = round2(L) - e.len;
        e.min = round2(e.min + d); e.max = round2(e.max + d);
      }
      if (isBar(e)) e.len = round2(L);
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
