// Startscherm van de Thalomex Precision Toolbox: kaarten voor Schets en Calculators, Bibliotheek en Recent.
// Beheert ook de drie weergaven (start | sketch | calc); de werkplekwissel zelf blijft in calc.js (setWork).
import { setWork } from "./calc.js";
import { hydrateIcons, icon } from "./icons.js";
import { applyStatic, onLang } from "./i18n.js";
import { hasPrevSession, PREV, restoreSession } from "./persist.js";
import { startTour } from "./tour.js";

const $ = id => document.getElementById(id);
const RKEY = "thalomex.recent";
let view = "start", entering = false, startEl = null;

export const currentView = () => view;

// De paginatitel is alleen in de schets die van het model; op start en in de calculators is hij de naam van de app.
const APP_TITLE = "Thalomex Precision Toolbox";
let docTitle = "";
function syncTitle() {
  const el = document.querySelector("title"); if (!el) return;
  if (view === "sketch") { if (docTitle && document.title === APP_TITLE) document.title = docTitle; return; }
  if (document.title !== APP_TITLE) { docTitle = document.title; document.title = APP_TITLE; }
}

function readRecent() {
  try { const a = JSON.parse(localStorage.getItem(RKEY) || "[]"); return Array.isArray(a) ? a : []; } catch (_) { return []; }
}
function pushRecent(id, title) {
  const a = readRecent().filter(x => x.id !== id);
  a.unshift({ id, title, t: Date.now() });
  try { localStorage.setItem(RKEY, JSON.stringify(a.slice(0, 5))); } catch (_) { /* opslag geblokkeerd */ }
}
function dateText(t) {
  try { return new Date(t).toLocaleDateString(document.documentElement.lang || undefined, { day: "numeric", month: "short" }); } catch (_) { return ""; }
}
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

function renderRecent() {
  const ul = $("recent"), card = $("recentCard"); if (!ul) return;
  const rows = [];
  if (hasPrevSession()) {
    let name = "";
    try { name = (JSON.parse(localStorage.getItem(PREV) || "{}") || {}).name || ""; } catch (_) { name = ""; }
    rows.push('<li><button type="button" data-r="prev"><span class="rn">' + esc(name || "—") + '</span><small data-i18n="look.recent.prev">Last session</small></button></li>');
  }
  readRecent().forEach(r => {
    if (!document.querySelector('#libGrid [data-ex="' + r.id + '"]')) return;
    rows.push('<li><button type="button" data-r="ex:' + esc(r.id) + '"><span class="rn">' + esc(r.title) + "</span><small>" + esc(dateText(r.t)) + "</small></button></li>");
  });
  ul.innerHTML = rows.join(""); applyStatic(ul);
  card.hidden = !rows.length;
  $("startRow2").classList.toggle("no-recent", !rows.length);
}

export function showView(v) {
  const app = document.querySelector(".app"), was = view;
  view = v;
  entering = true;
  try {
    app.classList.toggle("start-on", v === "start");
    startEl.hidden = v !== "start";
    if (v === "start") {
      setWork("sketch");
      document.querySelectorAll("#workSeg [data-w]").forEach(b => b.setAttribute("aria-pressed", "false"));
      renderRecent();
      startEl.scrollTop = 0;
    } else setWork(v);
  } finally { entering = false; }
  syncTitle();
  if (v === "sketch" && was !== "sketch") setTimeout(() => startTour(false), 400);
}

export function initStart() {
  const app = document.querySelector(".app"), main = document.querySelector(".main");
  startEl = document.createElement("section");
  startEl.id = "start"; startEl.className = "screen"; startEl.setAttribute("aria-labelledby", "startTitle");
  startEl.innerHTML =
    '<div class="start-in">' +
    '<h2 id="startTitle" class="start-h" data-i18n="look.start.title">What do you want to do?</h2>' +
    '<p class="lead" data-i18n="look.start.lead">Quick estimates for precision designers: formulas first, always with assumptions and source.</p>' +
    '<div class="big">' +
    '<button type="button" class="bigcard" data-go="sketch">' +
    '<svg viewBox="0 0 240 110" aria-hidden="true"><g fill="none" stroke-width="3" stroke-linecap="round"><path d="M30 85H100" stroke="var(--hatch)"/><path d="M60 85L125 40" stroke="var(--ink)" stroke-width="6"/><path d="M125 40L190 62" stroke="var(--accent)"/><circle cx="60" cy="85" r="5" fill="var(--panel)" stroke="var(--ink)" stroke-width="2"/><rect x="120" y="35" width="10" height="10" fill="var(--ink)" stroke="none"/><path d="M190 20V55" stroke="var(--force)" stroke-width="2.5"/></g></svg>' +
    '<b data-i18n="look.start.sketch">Sketch</b><span data-i18n="look.start.sketch.d">Draw: mechanisms, structures, flexures.</span></button>' +
    '<button type="button" class="bigcard" data-go="calc">' +
    '<svg viewBox="0 0 240 110" aria-hidden="true"><g fill="none" stroke="var(--ink-2)" stroke-width="1.6"><rect x="70" y="14" width="100" height="82" rx="8"/><path d="M85 34H155" stroke="var(--accent)" stroke-width="4"/></g><g fill="var(--ink-3)"><circle cx="92" cy="56" r="4"/><circle cx="120" cy="56" r="4"/><circle cx="148" cy="56" r="4"/><circle cx="92" cy="76" r="4"/><circle cx="120" cy="76" r="4"/><circle cx="148" cy="76" r="4" fill="var(--accent)"/></g></svg>' +
    '<b data-i18n="look.start.calc">Calculators</b><span data-i18n="look.start.calc.d">Fill in: flexures, contact, dynamics, thermal.</span></button>' +
    "</div>" +
    '<div class="row2" id="startRow2">' +
    '<div class="card"><h3 data-i18n="look.start.lib">Library</h3><p class="hint" data-i18n="look.start.lib.d">Examples to start from, with explanation.</p>' +
    '<div class="card-acts"><button type="button" class="btn" id="startLib">' + icon("library", { size: 16 }) + '<span data-i18n="look.start.lib.open">Open library</span></button>' +
    '<button type="button" class="btn ghost" id="startOpen">' + icon("open", { size: 16 }) + '<span data-i18n="look.start.file">Open file…</span></button></div></div>' +
    '<div class="card" id="recentCard" hidden><h3 data-i18n="look.start.recent">Recent</h3><ul class="recent" id="recent"></ul></div>' +
    "</div></div>";
  app.insertBefore(startEl, main);
  hydrateIcons(startEl);
  applyStatic(startEl);
  onLang(() => renderRecent());

  startEl.addEventListener("click", ev => {
    const g = ev.target.closest("[data-go]");
    if (g) { showView(g.dataset.go); return; }
    const r = ev.target.closest("[data-r]");
    if (r) {
      if (r.dataset.r === "prev") { showView("sketch"); restoreSession(); return; }
      const c = document.querySelector('#libGrid [data-ex="' + r.dataset.r.slice(3) + '"]');
      if (c) c.click();
    }
  });
  $("startLib").addEventListener("click", () => $("libBtn").click());
  $("startOpen").addEventListener("click", () => document.querySelector('#menu [data-a="open"]').click());
  $("brand").addEventListener("click", () => { if (view !== "start") showView("start"); });

  // werkplekknoppen en links die calc.js zelf afhandelt: de startweergave netjes verlaten
  document.addEventListener("mech-work", ev => {
    if (entering) return;
    const was = view; view = ev.detail;
    app.classList.remove("start-on"); startEl.hidden = true;
    syncTitle();
    if (view === "sketch" && was !== "sketch") setTimeout(() => startTour(false), 400);
  });

  // een model laden vanuit Bibliotheek, Bestand of Plakken brengt je naar de schets
  const toSketch = () => { if (view !== "sketch") showView("sketch"); };
  $("libGrid").addEventListener("click", ev => {
    const b = ev.target.closest("[data-ex]"); if (!b) return;
    const id = b.dataset.ex, t = b.querySelector(".lc-t");
    if (id !== "empty" && t) pushRecent(id, t.textContent);
    toSketch();
  });
  $("fileInp").addEventListener("change", () => { if ($("fileInp").files && $("fileInp").files.length) toSketch(); });
  $("modalOk").addEventListener("click", toSketch);
  // de rondleiding wijst naar de schets: eerst daarheen (capture: vóór de menu-afhandeling)
  $("menu").addEventListener("click", ev => { if (ev.target.closest('[data-a="tour"]')) toSketch(); }, true);
  document.querySelector('#menu [data-a="restore"]').addEventListener("click", toSketch);

  app.classList.add("start-on");
  syncTitle();
  new MutationObserver(syncTitle).observe(document.querySelector("title"), { childList: true });
  renderRecent();
}
