// Aanwijzen, slepen en pannen op het canvas.
import { solveStiffness } from "../core/stiffness.js";
import { frame } from "../core/contact.js";
import { drivers, N } from "../core/elements.js";
import { relax } from "../core/kinematics.js";
import { eid, model, ui, view } from "../core/state.js";
import { draw, sensorSeg } from "./draw.js";
import { addAccel, addContact, addDsens, addEncoder, addNode, addTwoNode, anchorHere, crankAngle, reharvest, removeElem, removeNode, setDriver, snapPt, splitBeam } from "./edit.js";
import { isBeam } from "../core/axial.js";
import { syncDof, syncInspector } from "./inspector.js";
import { pick, renderPick } from "./picker.js";
import { atT0, lockNudge } from "./playback.js";
import { cancelJob, changed, touched } from "./solver.js";
import { cursorFor, flash } from "./tools.js";
import { cv, toScr, toWld, zoomAt } from "./view.js";
import { tickStr } from "./format.js";
import { t } from "./i18n.js";

/* ============================================================
   Picking
   ============================================================ */
const HIT = window.matchMedia("(pointer: coarse)").matches ? 18 : 11;
function pickNode(sp) {
  let best = null, bd = HIT;
  for (const n of model.nodes) {
    const s = toScr(n), d = Math.hypot(s.x - sp.x, s.y - sp.y);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}
function pickElem(sp) {
  let best = null, bd = 9;
  for (const e of model.elems) {
    let d = Infinity;
    if (e.type === "force") {
      const n = N(e.node); if (!n) continue;
      const s = toScr(n), th = e.ang * Math.PI / 180;
      const tip = { x: s.x + Math.cos(th) * 58, y: s.y - Math.sin(th) * 58 };
      d = segDist(sp, s, tip);
    } else if (e.type === "contact") {
      const n = N(e.node); if (!n) continue;
      const f = frame(e, n), s = toScr({ x: f.fx, y: f.fy }), u = { x: f.tx, y: -f.ty };
      d = segDist(sp, { x: s.x - u.x * 26, y: s.y - u.y * 26 }, { x: s.x + u.x * 26, y: s.y + u.y * 26 });
    } else if (e.type === "encoder" || e.type === "accel" || e.type === "dsens") {
      const g = sensorSeg(e); if (!g) continue;
      d = e.type === "encoder" ? Math.abs(Math.hypot(sp.x - g.a.x, sp.y - g.a.y) - g.r) : segDist(sp, g.a, g.b);
    } else {
      if (!N(e.a) || !N(e.b)) continue;
      const A = toScr(N(e.a)), B = toScr(N(e.b));
      d = segDist(sp, A, B);
    }
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function segDist(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const L2 = vx * vx + vy * vy;
  let t = L2 ? ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
}

/* ============================================================
   Pointer interaction
   ============================================================ */
let drag = null;  // {mode:'node'|'pan', ...}

function localPt(ev) {
  const r = cv.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}

const ptrs = new Map();
let pinch = null;
function pinchNow() {
  const a = [...ptrs.values()];
  return { d: Math.max(1, Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y)),
           mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2 };
}

function endDrag(ev) {
  if (ev && ev.pointerId !== undefined) ptrs.delete(ev.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (drag) {
    const moved = drag.mode === "node" && drag.moved;
    drag = null; cv.style.cursor = cursorFor(ui.tool);
    if (moved) changed();
  }
}

// a new force in Stiffness mode: 1 N scaled so the peak stress is about 20 % of the allowable stress
function stiffForceDefault(e) {
  try {
    e.mag = 1;
    const r = solveStiffness();
    if (r.ok && r.sigMax && r.sigMax.ratio > 0 && isFinite(r.sigMax.ratio)) {
      const raw = 0.2 / r.sigMax.ratio, p = Math.pow(10, Math.floor(Math.log10(raw)));
      return Math.max(1e-3, Math.round(raw / p) * p);
    }
  } catch (err) { /* keep 1 N */ }
  return 1;
}

// keyboard on the canvas: arrows select, Alt+arrows nudge, Enter opens the properties
function selPos() {
  if (!ui.sel) return null;
  if (ui.sel.kind === "node") return N(ui.sel.id);
  const e = model.elems.find(x => x.id === ui.sel.id); if (!e) return null;
  if (e.node) return N(e.node);
  const a = N(e.a), b = N(e.b); return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
}
function cvKey(ev) {
  const dirs = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  const d = dirs[ev.key];
  if (ev.key === "Enter") {
    const f = document.querySelector("#props input, #props select, #props button");
    if (ui.sel && f) { f.focus(); ev.preventDefault(); }
    return;
  }
  if (!d && ev.key !== "PageDown" && ev.key !== "PageUp") return;
  if (ev.ctrlKey || ev.metaKey) return;
  ev.preventDefault();
  if (d && ev.altKey) {
    if (!ui.sel || ui.sel.kind !== "node") return;
    if (!atT0()) { lockNudge(); return; }
    const n = N(ui.sel.id), st = ev.shiftKey ? 10 : 1; if (!n) return;
    cancelJob(); n.x += d[0] * st; n.y += d[1] * st; anchorHere(n); reharvest(n.id);
    changed(); return;
  }
  const items = model.nodes.map(n => ({ kind: "node", id: n.id })).concat(model.elems.map(e => ({ kind: "elem", id: e.id })));
  if (!items.length) return;
  let pick1 = null;
  const cur = selPos();
  if (!d || !cur) {
    const i = ui.sel ? items.findIndex(x => x.kind === ui.sel.kind && x.id === ui.sel.id) : -1;
    const step = ev.key === "ArrowUp" || ev.key === "PageUp" || ev.key === "ArrowLeft" ? -1 : 1;
    pick1 = items[(i < 0 ? (step > 0 ? 0 : items.length - 1) : i + step + items.length) % items.length];
  } else {
    let best = Infinity;
    for (const n of model.nodes) {
      if (ui.sel && ui.sel.kind === "node" && ui.sel.id === n.id) continue;
      const dx = n.x - cur.x, dy = n.y - cur.y, along = dx * d[0] + dy * d[1], L = Math.hypot(dx, dy);
      if (along <= 0 || along < 0.5 * L) continue;                      // within about 60 degrees of the arrow
      const sc = L + 2 * Math.abs(dx * d[1] - dy * d[0]);
      if (sc < best) { best = sc; pick1 = { kind: "node", id: n.id }; }
    }
  }
  if (!pick1) return;
  ui.sel = pick1; syncInspector(); draw();
}

export function initInteract() {
  cv.addEventListener("keydown", cvKey);

  cv.addEventListener("pointerdown", ev => {
    cv.setPointerCapture(ev.pointerId);
    ptrs.set(ev.pointerId, localPt(ev));
    if (ptrs.size === 2) {
      drag = null;
      const q = pinchNow();
      pinch = { d: q.d, mx: q.mx, my: q.my, s: view.s, ox: view.ox, oy: view.oy };
      return;
    }
    if (ptrs.size > 2) return;
    const sp = localPt(ev);
    const wp = toWld(sp);
    const hitN = pickNode(sp), hitE = hitN ? null : pickElem(sp);

    if (ev.button === 1 || ev.shiftKey || (ui.tool === "select" && !hitN && !hitE)) {
      drag = { mode: "pan", sx: sp.x, sy: sp.y, ox: view.ox, oy: view.oy };
      cv.style.cursor = "grabbing";
      return;
    }

    // Buiten t = 0 is het model alleen te bekijken: selecteren en sporen mag,
    // al het andere wacht tot je terug bent op t = 0.
    const editing = ui.tool !== "select" && ui.tool !== "trace";
    if (editing && !atT0()) {
      if (hitN) ui.sel = { kind: "node", id: hitN.id };
      else if (hitE) ui.sel = { kind: "elem", id: hitE.id };
      syncInspector(); draw(); lockNudge();
      return;
    }
    if (editing) cancelJob();

    let edited = false;          // alleen echte modelwijzigingen rekenen opnieuw
    switch (ui.tool) {
      case "select":
        if (hitN) {
          ui.sel = { kind: "node", id: hitN.id };
          if (atT0()) { cancelJob(); drag = { mode: "node", id: hitN.id, dx: hitN.x - wp.x, dy: hitN.y - wp.y, moved: false }; }
          else lockNudge();
        } else if (hitE) {
          ui.sel = { kind: "elem", id: hitE.id };
        }
        break;

      case "node": {
        const n = addNode(snapPt(wp));
        ui.sel = { kind: "node", id: n.id };
        edited = true;
        break;
      }

      case "link": case "spring": case "damper": case "actuator": case "gap": case "flexure": case "loadcell": {
        const n = hitN || addNode(snapPt(wp));
        edited = !hitN;
        if (!ui.pending) { ui.pending = n.id; }
        else if (ui.pending === n.id) { ui.pending = null; }
        else {
          const e = addTwoNode(ui.tool, ui.pending, n.id);
          ui.pending = null;
          if (e) { ui.sel = { kind: "elem", id: e.id }; edited = true; }
        }
        break;
      }

      case "dsens": {
        // eerste punt, dan een tweede punt (tussen twee punten) of hetzelfde punt nog eens (ten opzichte van de grond)
        if (!hitN) { flash(t("int.existing")); break; }
        if (!ui.pending) { ui.pending = hitN.id; break; }
        const e = addDsens(ui.pending, ui.pending === hitN.id ? "" : hitN.id);
        ui.pending = null;
        if (e) { ui.sel = { kind: "elem", id: e.id }; edited = true; }
        break;
      }

      case "encoder": case "accel":
        if (hitN) {
          const e = ui.tool === "encoder" ? addEncoder(hitN.id) : addAccel(hitN.id);
          if (e) { ui.sel = { kind: "elem", id: e.id }; edited = true; }
          else flash(t("int.enc"));
        } else flash(t("int.existing"));
        break;

      case "clamp": {
        const n = hitN || addNode(snapPt(wp));
        const on = n.support === "pin" && n.clamp;
        n.support = on ? "free" : "pin"; n.clamp = !on;
        anchorHere(n);
        ui.sel = { kind: "node", id: n.id };
        edited = true;
        break;
      }

      case "pin": {
        const n = hitN || addNode(snapPt(wp));
        if (model.mode === "stiff" && n.support === "free" && model.elems.some(x => isBeam(x) && (x.a === n.id || x.b === n.id))) {
          n.support = "pin"; n.clamp = true;       // beam end in Stiffness: clamp first, a second click gives a plain hinge, a third frees it
        } else if (n.support === "pin" && n.clamp && model.mode === "stiff") n.clamp = false;
        else { n.support = n.support === "pin" ? "free" : "pin"; n.clamp = false; }
        anchorHere(n);
        ui.sel = { kind: "node", id: n.id };
        edited = true;
        break;
      }

      case "slider": {
        const n = hitN || addNode(snapPt(wp));
        n.support = n.support === "slider" ? "free" : "slider";
        anchorHere(n);
        ui.sel = { kind: "node", id: n.id };
        edited = true;
        break;
      }

      case "split":
        if (hitE && isBeam(hitE) && N(hitE.a) && N(hitE.b)) {
          const A = N(hitE.a), B = N(hitE.b), vx = B.x - A.x, vy = B.y - A.y;
          const t = ((wp.x - A.x) * vx + (wp.y - A.y) * vy) / ((vx * vx + vy * vy) || 1);
          const n = splitBeam(hitE.id, t);
          if (n) { ui.sel = { kind: "node", id: n.id }; edited = true; }
        } else flash(t("int.fullbeam"));
        break;

      case "driver":
        // setDriver rekent zelf door
        if (hitE && hitE.type === "link") { ui.sel = { kind: "elem", id: hitE.id }; setDriver(hitE.id); }
        else flash(t("int.link"));
        break;

      case "force":
        if (hitN) {
          const e = { id: eid(), type: "force", node: hitN.id, mag: 100, ang: -90 };
          model.elems.push(e);
          if (model.mode === "stiff") e.mag = stiffForceDefault(e); ui.sel = { kind: "elem", id: e.id };
          edited = true;
        }
        break;

      case "contact":
        if (hitN) {
          const e = addContact(hitN.id);
          ui.sel = { kind: "elem", id: e.id };
          edited = true;
        }
        break;

      case "mass":
        if (hitN) { if (!hitN.m) hitN.m = 1; ui.sel = { kind: "node", id: hitN.id }; edited = true; }
        break;

      case "trace":
        if (hitN) { hitN.trace = !hitN.trace; ui.sel = { kind: "node", id: hitN.id }; touched(); }
        break;

      case "del":
        if (hitN) { removeNode(hitN.id); edited = true; }
        else if (hitE) { removeElem(hitE.id); edited = true; }
        ui.sel = null;
        break;
    }
    if (edited) changed();
    else { syncInspector(); draw(); }
    if (!pick.hidden) renderPick();          // de selectie komt bovenaan de keuzelijst
  });

  cv.addEventListener("pointermove", ev => {
    if (ptrs.has(ev.pointerId)) ptrs.set(ev.pointerId, localPt(ev));
    if (pinch && ptrs.size >= 2) {
      const q = pinchNow();
      const f = q.d / pinch.d;
      const ns = Math.max(0.15, Math.min(pinch.s * f, 14));
      // keep the world point under the first midpoint pinned to the new one
      const wx = (pinch.mx - pinch.ox) / pinch.s, wy = -(pinch.my - pinch.oy) / pinch.s;
      view.s = ns;
      view.ox = q.mx - wx * ns;
      view.oy = q.my + wy * ns;
      draw();
      return;
    }
    const sp = localPt(ev);
    const wp = toWld(sp);
    document.getElementById("stPos").textContent =
      tickStr(wp.x, 0.1).padStart(7) + " ; " + tickStr(wp.y, 0.1).padStart(7) + " mm";

    if (drag && drag.mode === "pan") {
      view.ox = drag.ox + (sp.x - drag.sx);
      view.oy = drag.oy + (sp.y - drag.sy);
      draw(); return;
    }
    if (drag && drag.mode === "node") {
      const n = N(drag.id);
      const p = snapPt({ x: wp.x + drag.dx, y: wp.y + drag.dy });
      if (p.x === n.x && p.y === n.y) return;
      n.x = p.x; n.y = p.y; drag.moved = true;
      if (model.rigidDrag) {
        relax(new Set([n.id]));
        for (const d of drivers()) { d.theta = crankAngle(d); d.theta0 = d.theta; }
        ui.frame = 0;
      } else {
        anchorHere(n);
        reharvest(n.id);
      }
      syncDof(); syncInspector(); draw(); return;
    }
    const h = pickNode(sp) || pickElem(sp);
    const hid = h ? h.id : null;
    if (hid !== ui.hover) { ui.hover = hid; draw(); }
  });
  cv.addEventListener("pointerup", endDrag);
  cv.addEventListener("pointercancel", endDrag);

  cv.addEventListener("wheel", ev => {
    ev.preventDefault();
    const sp = localPt(ev);
    zoomAt(sp.x, sp.y, ev.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });
}
