// Gereedschapsbalk, hints en sneltoetsen.
import { ui } from "../core/state.js";
import { onLang, t } from "./i18n.js";
import { draw } from "./draw.js";
import { removeSel } from "./edit.js";
import { syncInspector } from "./inspector.js";
import { atT0, lockNudge, togglePlay, toT0 } from "./playback.js";
import { cancelJob } from "./solver.js";
import { cv } from "./view.js";

/* ============================================================
   Tools
   ============================================================ */
const ICON = {
  select: '<path d="M5 3l12 8-5.2 1.1L14 18l-2.3.9-2.1-5.6L5 17z" fill="currentColor"/>',
  node:   '<circle cx="10" cy="10" r="4.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10 1.5v3.2M10 15.3v3.2M1.5 10h3.2M15.3 10h3.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  link:   '<path d="M5 14L15 6" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><circle cx="5" cy="14" r="2.6" fill="var(--panel)" stroke="currentColor" stroke-width="1.5"/><circle cx="15" cy="6" r="2.6" fill="var(--panel)" stroke="currentColor" stroke-width="1.5"/>',
  pin:    '<circle cx="10" cy="6.2" r="2.6" fill="var(--panel)" stroke="currentColor" stroke-width="1.5"/><path d="M10 8.8L4.6 15.4h10.8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M3 17.2h14M4.4 17.2l-1.6 2M8 17.2l-1.6 2M11.6 17.2L10 19.2M15.2 17.2l-1.6 2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>',
  slider: '<circle cx="10" cy="7" r="2.4" fill="var(--panel)" stroke="currentColor" stroke-width="1.5"/><rect x="5.6" y="4.4" width="8.8" height="5.2" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2.6 12.6h14.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M3.4 14.6l-1.4 2M7 14.6l-1.4 2M10.6 14.6l-1.4 2M14.2 14.6l-1.4 2M17.8 14.6l-1.4 2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>',
  driver: '<circle cx="7" cy="13" r="2.4" fill="var(--panel)" stroke="currentColor" stroke-width="1.5"/><path d="M7 13L14 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M3.4 9.4a5 5 0 016-3.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M9.8 4.6l0 3.2-3-1.1z" fill="currentColor"/>',
  actuator: '<path d="M2.5 13.8L9.6 8.2" stroke="currentColor" stroke-width="4.2" stroke-linecap="round"/><path d="M9 8.6l8-6.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M12.8 14.8l3.6-2.8M14.4 17l3.6-2.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  spring: '<path d="M2.5 10h2.6l1.5-4 2.4 8 2.4-8 1.5 4h2.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  gap: '<path d="M2.4 10h4.2M11.6 10h6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M13.6 6.4H6.6v7.2h7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 7.6v4.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8.2 4.2h3.6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-dasharray="1 1.2"/>',
  flexure: '<path d="M2.6 10h2.4c1.2-4.4 2.4-4.4 3.6 0s2.4 4.4 3.6 0 2.4-4.4 3.6 0h.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M2.6 4.6v10.8M1.2 6.2l1.4-1.4M1.2 9.2l1.4-1.4M1.2 12.2l1.4-1.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="17" cy="10" r="1.6" fill="currentColor"/>',
  contact: '<circle cx="10" cy="7.4" r="3.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M2.6 11.8h14.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 13.6l-1.4 2M7.6 13.6l-1.4 2M11.2 13.6l-1.4 2M14.8 13.6l-1.4 2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>',
  damper: '<path d="M2.4 10h3.4M14.2 10h3.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M5.8 6.2h5.6v7.6H5.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M10 6.9v6.2M10 10h4.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  force:  '<path d="M10 17V4.6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M10 2.4l3.4 4.2H6.6z" fill="currentColor"/>',
  mass:   '<circle cx="10" cy="10" r="4.6" fill="currentColor"/><path d="M4 16.6h12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  trace:  '<path d="M2.5 13.5c3-9 12-9 15 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.4 2.2" stroke-linecap="round"/><circle cx="10" cy="7.6" r="2.8" fill="var(--panel)" stroke="currentColor" stroke-width="1.7"/>',
  loadcell: '<path d="M2.4 10h3.6M14 10h3.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><rect x="6" y="5.4" width="8" height="9.2" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7.6 8.2l2.4 3.6 2.4-3.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>',
  dsens:  '<path d="M3 5.4v9.2M3 10h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M8 6.6v6.8M11 6.6v6.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M11 10h6M14.6 7.8L17 10l-2.4 2.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  encoder: '<circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 4v2M10 14v2M4 10h2M14 10h2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M10 10l3-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  accel:  '<rect x="5.4" y="9.4" width="9.2" height="6.2" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 8V2.8M7.8 5l2.2-2.4L12.2 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  split:  '<path d="M2.6 14.5L17.4 5.5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><rect x="7.4" y="7.3" width="5.2" height="5.2" transform="rotate(-31 10 10)" fill="var(--panel)" stroke="currentColor" stroke-width="1.5"/>',
  del:    '<path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
};

const TOOLS = [
  { g: "tool.g.geometry" },
  { id: "select", kb: "V", ic: "select", },
  { id: "node",       kb: "N", ic: "node", },
  { id: "link",    kb: "L", ic: "link", },
  { id: "split", kb: "O", ic: "split", },
  { g: "tool.g.supports" },
  { id: "pin",  kb: "P", ic: "pin", },
  { id: "slider",    kb: "S", ic: "slider", },
  { id: "driver", kb: "D", ic: "driver", },
  { id: "actuator", kb: "A", ic: "actuator", },
  { g: "tool.g.force" },
  { id: "spring",       kb: "R", ic: "spring", },
  { id: "damper",     kb: "C", ic: "damper", },
  { id: "gap",    kb: "G", ic: "gap", },
  { id: "flexure",   kb: "B", ic: "flexure", },
  { id: "contact",   kb: "K", ic: "contact", },
  { id: "force",     kb: "F", ic: "force", },
  { id: "mass",      kb: "M", ic: "mass", },
  { id: "trace", kb: "T", ic: "trace", },
  { g: "tool.g.sensors" },
  { id: "loadcell", kb: "Q", ic: "loadcell", },
  { id: "dsens", kb: "W", ic: "dsens", },
  { id: "encoder", kb: "H", ic: "encoder", },
  { id: "accel", kb: "J", ic: "accel", },
  { g: "tool.g.edit" },
  { id: "del", kb: "X", ic: "del", }
];

export const rail = document.getElementById("rail");
const railTop = document.createElement("div");

let hintT = 0;
function hintShow() {
  const h = document.getElementById("hint");
  h.classList.remove("dim");
  clearTimeout(hintT);
  hintT = setTimeout(() => h.classList.add("dim"), 6000);
}

// "?" : de hint van het huidige gereedschap en de uitleg bij het voorbeeld weer tonen
export function showHelp() {
  const tl = TOOLS.find(x => x.id === ui.tool);
  document.getElementById("hint").innerHTML = tl ? t("tool." + tl.id + ".hint") : "";
  hintShow();
  const u = document.getElementById("uitleg");
  if (u && !u.hidden) { u.classList.remove("min"); }
}
export function setTool(id) {
  ui.tool = id; ui.pending = null;
  rail.querySelectorAll(".tool").forEach(b =>
    b.setAttribute("aria-pressed", String(b.dataset.tool === id)));
  const tl = TOOLS.find(x => x.id === id);
  document.getElementById("hint").innerHTML = tl ? t("tool." + tl.id + ".hint") : "";
  document.getElementById("stTool").textContent = tl ? t("tool." + tl.id + ".nm") : "—";
  hintShow();
  cv.style.cursor = cursorFor(id);
  draw();
}

// A system crosshair is drawn by XOR on Windows and disappears on a light
// canvas. Ship our own: dark cross with a white halo, readable on both themes.
const CROSS_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26">' +
  '<g fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round">' +
  '<path d="M13 2.5v7.2M13 16.3v7.2M2.5 13h7.2M16.3 13h7.2"/></g>' +
  '<g fill="none" stroke="#16191b" stroke-width="1.7" stroke-linecap="round">' +
  '<path d="M13 2.5v7.2M13 16.3v7.2M2.5 13h7.2M16.3 13h7.2"/></g>' +
  '<circle cx="13" cy="13" r="1.5" fill="#16191b" stroke="#ffffff" stroke-width="1.2"/></svg>';
const CROSS = 'url("data:image/svg+xml;utf8,' + encodeURIComponent(CROSS_SVG) + '") 13 13, crosshair';
export function cursorFor(id) { return id === "select" ? "default" : CROSS; }

let flashMsg = "", flashT = 0;
export function flash(m) {
  flashMsg = m; flashT = Date.now();
  document.getElementById("hint").innerHTML = '<b style="color:var(--bad)">' + m + '</b>';
  hintShow();
  setTimeout(() => { if (Date.now() - flashT >= 2600) setTool(ui.tool); }, 2700);
}
export function toast(msg) { document.getElementById("hint").innerHTML = "<b>" + msg + "</b>"; hintShow(); }

// De gereedschapsbalk wordt (opnieuw) opgebouwd bij het starten en bij een taalwissel.
function buildRail() {
  rail.innerHTML = "";
  if (!railTop.firstChild) {
    railTop.className = "railtop";
    railTop.innerHTML = '<button class="btn ghost ico" id="railBtn">&#8676;</button>';
  }
  const rb = railTop.firstChild;
  rb.title = t("rail.width"); rb.setAttribute("aria-label", t("rail.width"));
  rail.appendChild(railTop);
  TOOLS.forEach(tl => {
    if (tl.g) {
      const h = document.createElement("div");
      h.className = "rail-label"; h.textContent = t(tl.g);
      rail.appendChild(h); return;
    }
    const nm = t("tool." + tl.id + ".nm");
    const b = document.createElement("button");
    b.className = "tool"; b.type = "button"; b.dataset.tool = tl.id;
    b.setAttribute("aria-pressed", String(tl.id === ui.tool));
    b.title = nm + " (" + tl.kb + ")";
    b.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true">' + ICON[tl.ic] + '</svg>' +
                  '<span class="nm">' + nm + '</span><span class="kb">' + tl.kb + '</span>';
    b.addEventListener("click", () => setTool(tl.id));
    rail.appendChild(b);
  });
}

export function initTools() {
  // na de eerste handeling op de tekening verdwijnt de hint; "?" haalt hem terug
  cv.addEventListener("pointerdown", () => { clearTimeout(hintT); document.getElementById("hint").classList.add("dim"); }, true);
  document.getElementById("helpBtn").addEventListener("click", showHelp);
  buildRail();
  onLang(() => { buildRail(); setTool(ui.tool); });

  document.addEventListener("keydown", e => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (e.key === "?") { showHelp(); e.preventDefault(); return; }
    const map = { v: "select", n: "node", l: "link", p: "pin", s: "slider", d: "driver", a: "actuator", r: "spring", c: "damper", g: "gap", k: "contact", b: "flexure", q: "loadcell", w: "dsens", h: "encoder", j: "accel", o: "split", f: "force", m: "mass", t: "trace", x: "del" };
    if (map[k]) { setTool(map[k]); e.preventDefault(); return; }
    if (e.key === " ") {
      // een knop met focus zou anders zelf nog eens "klikken" en het afspelen meteen weer stoppen
      if (e.target.tagName === "BUTTON") e.target.blur();
      togglePlay(); e.preventDefault(); return;
    }
    if (e.key === "Escape") { ui.pending = null; ui.sel = null; syncInspector(); draw(); }
    if (e.key === "Home") { toT0(); e.preventDefault(); return; }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (ui.sel) { e.preventDefault(); if (atT0()) { cancelJob(); removeSel(); } else lockNudge(); }
    }
  });
}
