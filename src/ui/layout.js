// Indeling: lade, tabbladen, werkbalk en venstergrootte.
import { model, ui } from "../core/state.js";
import { draw } from "./draw.js";
import { save } from "./persist.js";
import { renderHowNow } from "./howhook.js";
import { drawPlot, plotCv } from "./plot.js";
import { rail } from "./tools.js";
import { cv, resize } from "./view.js";

/* ============================================================
   Indeling: tabbladen, lade, smalle balk, mobiel
   ============================================================ */
export const drawer = document.getElementById("drawer");
const paneMeas = document.getElementById("paneMeas");
const centre = document.querySelector(".centre");
const tabs = document.getElementById("tabs");
export const narrow = window.matchMedia("(max-width: 900px)");
// oudere Safari kent alleen addListener op een MediaQueryList
function onMedia(mq, fn) { if (mq.addEventListener) mq.addEventListener("change", fn); else if (mq.addListener) mq.addListener(fn); }

export function setTab(t) {
  tabs.querySelectorAll("button").forEach(b =>
    b.setAttribute("aria-selected", String(b.dataset.t === t)));
  document.querySelectorAll(".pane").forEach(p => { p.hidden = p.dataset.p !== t; });
  model.tab = t;
  if (t === "meas") requestAnimationFrame(drawPlot);
  if (t === "how") renderHowNow();
  try { localStorage.setItem("mechschets.tab", t); } catch (_) {}
}

// on a phone the measurement drawer becomes the third tab
function relayout() {
  const measTab = tabs.querySelector('[data-t="meas"]');
  if (narrow.matches) {
    if (drawer.parentElement !== paneMeas) paneMeas.appendChild(drawer);
    measTab.hidden = false;
    drawer.classList.remove("closed");
  } else {
    if (drawer.parentElement !== centre) centre.appendChild(drawer);
    measTab.hidden = true;
    if (model.tab === "meas") setTab("props");
  }
  requestAnimationFrame(() => { resize(); drawPlot(); });
}

export function applyLayout() {
  rail.classList.toggle("slim", !!model.railSlim);
  drawer.classList.toggle("closed", model.drawerOpen === false);
  if (model.drawerH && model.drawerAuto === false) drawer.style.setProperty("--drawerH", model.drawerH + "px");
  let t = model.tab || "props";
  if (t === "meas" && !narrow.matches) t = "props";
  setTab(t);
  relayout();
}

/* ============================================================
   Boot
   ============================================================ */
const ro = new ResizeObserver(resize);
let plotRaf = 0;

export function initLayout() {
  tabs.addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    setTab(b.dataset.t);
  });
  onMedia(narrow, relayout);

  document.getElementById("statusBtn").addEventListener("click", ev => {
    const on = ev.currentTarget.getAttribute("aria-expanded") === "true";
    ev.currentTarget.setAttribute("aria-expanded", String(!on));
    document.getElementById("statusDetail").hidden = on;
  });

  document.getElementById("drawerBtn").addEventListener("click", () => {
    drawer.classList.toggle("closed");
    model.drawerOpen = !drawer.classList.contains("closed");
    requestAnimationFrame(() => { resize(); drawPlot(); });
    save();
  });

  // drag the top edge of the drawer to resize it
  (function () {
    const grip = document.getElementById("grip");
    let g = null;
    grip.addEventListener("pointerdown", ev => {
      if (narrow.matches) return;
      grip.setPointerCapture(ev.pointerId);
      g = { y: ev.clientY, h: drawer.getBoundingClientRect().height };
      drawer.classList.remove("closed");
    });
    grip.addEventListener("pointermove", ev => {
      if (!g) return;
      const h = Math.max(120, Math.min(window.innerHeight * 0.62, g.h - (ev.clientY - g.y)));
      model.drawerH = Math.round(h); model.drawerAuto = false;
      drawer.style.setProperty("--drawerH", h + "px");
      resize(); drawPlot();
    });
    const stop = () => { if (g) { g = null; save(); } };
    grip.addEventListener("pointerup", stop);
    grip.addEventListener("dblclick", () => { model.drawerAuto = true; drawPlot(); save(); });
    grip.addEventListener("pointercancel", stop);
  })();

  document.getElementById("railBtn").addEventListener("click", () => {
    rail.classList.toggle("slim");
    model.railSlim = rail.classList.contains("slim");
    requestAnimationFrame(resize);
    save();
  });
  ro.observe(cv.parentElement);
  new ResizeObserver(() => { ui.plotBox = null; cancelAnimationFrame(plotRaf); plotRaf = requestAnimationFrame(drawPlot); })
    .observe(plotCv.parentElement);
  window.addEventListener("resize", resize);
  onMedia(window.matchMedia("(prefers-color-scheme: dark)"), () => { ui.colorsDirty = true; draw(); drawPlot(); });
}
