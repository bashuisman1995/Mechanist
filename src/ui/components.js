// Gedeelde bouwstenen van de Thalomex-look: toast, tooltip, dialoogfocus, tabtoetsen, menutoetsen,
// gegroepeerde (opvouwbare) gereedschapsbalk en de keuzelijst voor calculators op smalle schermen.
// Alleen bestaande ids/klassen worden gelezen; nieuwe tekst staat met data-i18n="look.*" in lang/look.js.
import { hasIcon, hydrateIcons, icon } from "./icons.js";
import { applyStatic, onLang, t as tr } from "./i18n.js";

const $ = id => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* opslag geblokkeerd */ } }
};

/* ============================================================
   Toast
   ============================================================ */
let toastEl = null, toastT = 0;
export function showToast(msg, o) {
  o = o || {};
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "toast"; toastEl.setAttribute("role", "status"); toastEl.setAttribute("aria-live", "polite");
    toastEl.hidden = true;
    document.body.appendChild(toastEl);
  }
  const kind = o.kind || "ok";
  toastEl.className = "toast " + kind;
  toastEl.textContent = "";
  const t = document.createElement("span"); t.className = "toast-t"; t.textContent = String(msg).replace(/<[^>]+>/g, "");
  toastEl.appendChild(t);
  if (kind === "bad") {
    const x = document.createElement("button"); x.type = "button"; x.className = "toast-x"; x.setAttribute("aria-label", tr("look.close"));
    x.setAttribute("data-i18n-aria", "look.close"); x.innerHTML = icon("close", { size: 14 });
    x.addEventListener("click", () => { toastEl.classList.remove("show"); toastEl.hidden = true; });
    toastEl.appendChild(x);
  }
  toastEl.hidden = false;
  void toastEl.offsetWidth;
  toastEl.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => { toastEl.classList.remove("show"); setTimeout(() => { if (!toastEl.classList.contains("show")) toastEl.hidden = true; }, 200); }, o.ms || (kind === "bad" ? 5000 : 2600));
}

/* ============================================================
   Tooltip: [data-tip] / title -> eigen bel (geen native title); toets als <kbd>
   ============================================================ */
let tipEl = null, tipT = 0, tipFor = null;
const KEYPAT = /^(?:(?:Ctrl|Shift|Alt)\+)*(?:[A-Za-z0-9?]|Esc|Home|F\d+|spatie|Space)$/;
function tipParts(el) {
  let txt = el.getAttribute("data-tip");
  if (txt == null) return null;
  let kb = el.getAttribute("data-kbd") || "";
  const m = /^(.*\S)\s+\(([^()]+)\)$/.exec(txt);
  if (!kb && m && KEYPAT.test(m[2])) { txt = m[1]; kb = m[2]; }
  return { txt, kb };
}
function adoptTitle(el) {
  const t = el.getAttribute("title");
  if (t == null || el.closest("svg")) return;
  el.removeAttribute("title");
  if (t) el.setAttribute("data-tip", t);
  if (t && !el.getAttribute("aria-label") && !el.textContent.trim() && !el.hasAttribute("aria-labelledby")) {
    const p = /^(.*\S)\s+\([^()]+\)$/.exec(t); el.setAttribute("aria-label", p ? p[1] : t);
  }
}
function hideTip() {
  clearTimeout(tipT); tipFor = null;
  if (tipEl) tipEl.classList.remove("show");
}
function showTip(el) {
  const p = tipParts(el); if (!p || !p.txt) return;
  if (!tipEl) {
    tipEl = document.createElement("div"); tipEl.className = "tip"; tipEl.setAttribute("role", "tooltip"); tipEl.id = "tip";
    document.body.appendChild(tipEl);
  }
  tipEl.textContent = "";
  const lines = p.txt.split("\n");
  lines.forEach((l, i) => {
    const d = document.createElement("div"); d.className = i ? "tip-2" : "tip-1"; d.textContent = l;
    if (i === 0 && p.kb) { const k = document.createElement("kbd"); k.textContent = p.kb; d.appendChild(k); }
    tipEl.appendChild(d);
  });
  const dim = el.classList.contains("dim") && el.getAttribute("data-dimtip");
  if (dim) { const d = document.createElement("div"); d.className = "tip-2"; d.textContent = dim; tipEl.appendChild(d); }
  tipFor = el;
  tipEl.style.left = "0px"; tipEl.style.top = "0px";
  tipEl.classList.add("show");
  const r = el.getBoundingClientRect(), tw = tipEl.offsetWidth, th = tipEl.offsetHeight, vw = innerWidth, vh = innerHeight, m = 8;
  const rail = el.closest("#rail");
  let x, y;
  if (rail && vw > 900) { x = r.right + 8; y = r.top + (r.height - th) / 2; }
  else { x = r.left + (r.width - tw) / 2; y = r.bottom + 8; if (y + th > vh - m) y = r.top - th - 8; }
  tipEl.style.left = Math.max(m, Math.min(x, vw - tw - m)) + "px";
  tipEl.style.top = Math.max(m, Math.min(y, vh - th - m)) + "px";
}
function initTooltips() {
  document.addEventListener("pointerover", ev => {
    if (ev.pointerType === "touch") return;
    const el = ev.target.closest && ev.target.closest("[title],[data-tip]");
    if (!el) return;
    adoptTitle(el);
    if (el === tipFor) return;
    hideTip();
    if (!el.getAttribute("data-tip")) return;
    tipT = setTimeout(() => showTip(el), 400);
  });
  document.addEventListener("pointerout", ev => {
    const el = ev.target.closest && ev.target.closest("[data-tip]");
    if (el && !el.contains(ev.relatedTarget)) hideTip();
  });
  document.addEventListener("focusin", ev => {
    const el = ev.target.closest && ev.target.closest("[title],[data-tip]");
    if (!el) return;
    adoptTitle(el);
    hideTip();
    let vis = false; try { vis = el.matches(":focus-visible"); } catch (_) { vis = true; }
    if (vis && el.getAttribute("data-tip")) showTip(el);
  });
  document.addEventListener("focusout", hideTip);
  document.addEventListener("pointerdown", hideTip, true);
  document.addEventListener("keydown", ev => { if (ev.key === "Escape") hideTip(); }, true);
  window.addEventListener("scroll", hideTip, true);
  // de iconknoppen die al in de HTML staan krijgen hun naam meteen (ook zonder hover); titels die de code later zet (afspelen/pauzeren) volgen
  const SCOPE = ".topbar, #transport, .zoomer, #rail";
  document.querySelectorAll(SCOPE.split(", ").map(x => x + " [title]").join(",")).forEach(adoptTitle);
  const mo = new MutationObserver(l => l.forEach(r => adoptTitle(r.target)));
  document.querySelectorAll(SCOPE).forEach(e => mo.observe(e, { attributes: true, subtree: true, attributeFilter: ["title"] }));
}

/* ============================================================
   Dialogen: focus vasthouden, Esc brengt de focus terug naar de opener
   ============================================================ */
const DIALOGS = { lib: 1, report: 1, pick: 1, saveModal: 1, askModal: 1, modal: 1 };
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
let lastTrigger = null;
const openers = {};
const shown = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
function openDialogs() { return Object.keys(DIALOGS).map($).filter(e => e && !e.hidden); }
function focusablesIn(d) { return Array.prototype.filter.call(d.querySelectorAll(FOCUSABLE), e => shown(e) && getComputedStyle(e).visibility !== "hidden"); }
function restoreTo(op) {
  if (!op || !op.isConnected) return;
  let t = op;
  if (!shown(t)) { const m = t.closest("#menu"); t = m ? $("menuBtn") : null; }
  if (t && shown(t)) { try { t.focus({ preventScroll: true }); } catch (_) { /* weg */ } }
}
function initDialogs() {
  document.addEventListener("click", ev => {
    const b = ev.target.closest && ev.target.closest("button,[role=menuitem],a,[tabindex]");
    if (b && !openDialogs().some(d => d.contains(b))) lastTrigger = b;
  }, true);
  document.addEventListener("keydown", ev => {
    if (ev.key === "Enter" || ev.key === " ") {
      const b = ev.target.closest && ev.target.closest("button,[role=menuitem]");
      if (b && !openDialogs().some(d => d.contains(b))) lastTrigger = b;
    }
  }, true);
  new MutationObserver(list => {
    list.forEach(r => {
      const d = r.target;
      if (r.attributeName !== "hidden" || !DIALOGS[d.id]) return;
      if (!d.hidden) {
        if (openers[d.id] === undefined) openers[d.id] = lastTrigger;
        if (!d.contains(document.activeElement)) { const f = focusablesIn(d)[0]; if (f) f.focus({ preventScroll: true }); }
      } else if (openers[d.id] !== undefined) {
        const op = openers[d.id]; delete openers[d.id];
        // niet terugspringen als de focus al bewust ergens anders in de app staat (bv. een volgend dialoogvenster)
        if (!openDialogs().length) setTimeout(() => restoreTo(op), 0);
      }
    });
  }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ["hidden"] });
  document.addEventListener("keydown", ev => {
    if (ev.key !== "Tab") return;
    const ds = openDialogs(); if (!ds.length) return;
    const d = ds[ds.length - 1], f = focusablesIn(d);
    if (!f.length) { ev.preventDefault(); return; }
    const a = document.activeElement, i = f.indexOf(a);
    if (!d.contains(a)) { ev.preventDefault(); f[ev.shiftKey ? f.length - 1 : 0].focus(); }
    else if (ev.shiftKey && i === 0) { ev.preventDefault(); f[f.length - 1].focus(); }
    else if (!ev.shiftKey && i === f.length - 1) { ev.preventDefault(); f[0].focus(); }
  }, true);
}

/* ============================================================
   Tabs: rollende tabindex, pijltjestoetsen, aria-controls
   ============================================================ */
function initTabs() {
  const tabs = $("tabs"); if (!tabs) return;
  const btns = () => Array.prototype.slice.call(tabs.querySelectorAll('[role="tab"]'));
  btns().forEach(b => {
    const pn = document.querySelector('.pane[data-p="' + b.dataset.t + '"]');
    if (pn && !pn.id) pn.id = "pane-" + b.dataset.t;
    b.id = "tab-" + b.dataset.t; if (pn) b.setAttribute("aria-controls", pn.id);
    const ic = { props: "props", how: "how", meas: "meas", opt: "optimise", set: "settings" }[b.dataset.t];
    if (ic && !b.querySelector(".ic")) b.insertAdjacentHTML("afterbegin", icon(ic, { size: 16 }));
    // de tekst in een span, zodat hij onder 360 px kan verdwijnen
    if (!b.querySelector(".tl")) {
      const sp = document.createElement("span"); sp.className = "tl";
      Array.prototype.slice.call(b.childNodes).filter(n => n.nodeType === 3).forEach(n => sp.appendChild(n));
      b.appendChild(sp);
    }
  });
  document.querySelectorAll(".pane[data-p]").forEach(p => { p.setAttribute("role", "tabpanel"); p.setAttribute("aria-labelledby", "tab-" + p.dataset.p); });
  // past alles niet in de smalle zijbalk, dan houdt alleen het gekozen tabblad zijn tekst (de rest krijgt aria-label en tooltip)
  const fit = () => {
    tabs.classList.remove("compact");
    btns().forEach(b => { b.removeAttribute("aria-label"); b.removeAttribute("data-tip"); });
    if (tabs.scrollWidth > tabs.clientWidth + 1) {
      tabs.classList.add("compact");
      btns().forEach(b => { const t = b.querySelector(".tl"); if (t && t.textContent.trim()) { b.setAttribute("aria-label", t.textContent.trim()); b.setAttribute("data-tip", t.textContent.trim()); } });
    }
  };
  const sync = () => { btns().forEach(b => b.setAttribute("tabindex", b.getAttribute("aria-selected") === "true" ? "0" : "-1")); fit(); };
  sync();
  new MutationObserver(sync).observe(tabs, { attributes: true, subtree: true, attributeFilter: ["aria-selected", "hidden"] });
  if (window.ResizeObserver) new ResizeObserver(fit).observe(tabs);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  tabs.addEventListener("keydown", ev => {
    const vis = btns().filter(b => !b.hidden), i = vis.indexOf(document.activeElement);
    if (i < 0) return;
    let n = -1;
    if (ev.key === "ArrowRight") n = (i + 1) % vis.length;
    else if (ev.key === "ArrowLeft") n = (i - 1 + vis.length) % vis.length;
    else if (ev.key === "Home") n = 0;
    else if (ev.key === "End") n = vis.length - 1;
    if (n < 0) return;
    ev.preventDefault(); vis[n].focus(); vis[n].click();
  });
}

/* ============================================================
   Bestand-menu: toetsen, iconen, versieregel
   ============================================================ */
function initMenu() {
  const menu = $("menu"), btn = $("menuBtn"); if (!menu || !btn) return;
  menu.setAttribute("aria-labelledby", "menuBtn"); btn.setAttribute("aria-haspopup", "menu");
  const ICONS = { open: "open", save: "save", restore: "restore", copy: "copy", paste: "paste", link: "link2", report: "report", tour: "tour" };
  menu.querySelectorAll("[data-a]").forEach(b => {
    if (b.querySelector(".ic") || !ICONS[b.dataset.a]) return;
    b.insertAdjacentHTML("afterbegin", icon(ICONS[b.dataset.a], { size: 16 }));
  });
  const ver = document.querySelector(".brand .ver"), meta = document.querySelector('meta[name="mech-build"]');
  const foot = document.createElement("div"); foot.className = "menu-foot";
  foot.textContent = "Thalomex Precision Toolbox " + (ver ? ver.textContent : "") + (meta && /^[0-9a-f]{4,40}$/i.test(meta.content) ? " · " + meta.content : "");
  menu.appendChild(foot);
  const items = () => Array.prototype.filter.call(menu.querySelectorAll('[role="menuitem"]'), b => !b.hidden);
  new MutationObserver(() => {
    if (!menu.hidden) { const f = items()[0]; if (f) f.focus({ preventScroll: true }); }
  }).observe(menu, { attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("keydown", ev => {
    if (menu.hidden) return;
    if (ev.key === "Escape") { setTimeout(() => btn.focus({ preventScroll: true }), 0); return; }
    if (!menu.contains(document.activeElement)) return;
    const it = items(), i = it.indexOf(document.activeElement);
    if (ev.key === "ArrowDown") { ev.preventDefault(); it[(i + 1) % it.length].focus(); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); it[(i - 1 + it.length) % it.length].focus(); }
    else if (ev.key === "Home") { ev.preventDefault(); it[0].focus(); }
    else if (ev.key === "End") { ev.preventDefault(); it[it.length - 1].focus(); }
    else if (ev.key === "Tab") { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); }
  }, true);
}

/* ============================================================
   Gereedschapsbalk: vijf groepen, opvouwbaar, modus-dimmen
   ============================================================ */
const GROUPS = [
  ["geometry", "Geometry", ["select", "node", "link", "split"]],
  ["supports", "Supports", ["pin", "slider", "driver", "actuator"]],
  ["elements", "Elements", ["spring", "damper", "gap", "flexure", "contact", "trace"]],
  ["loads", "Loads", ["force", "mass"]],
  ["sensors", "Sensors", ["loadcell", "dsens", "encoder", "accel"]]
];
const TOOL_MODES = {            // gereedschap dat in een modus niet meedoet: gedimd, nooit verborgen
  kin: ["spring", "damper", "mass", "contact", "gap", "flexure"],
  stiff: ["driver", "actuator", "damper", "gap", "contact", "trace", "loadcell", "dsens", "encoder", "accel"]
};
function initRail() {
  const rail = $("rail"); if (!rail) return;
  const tools = {}; rail.querySelectorAll(".tool").forEach(t => { tools[t.dataset.tool] = t; });
  const top = rail.querySelector(".railtop");
  let collapsed = {}; try { collapsed = JSON.parse(store.get("thalomex.rail.groups") || "{}") || {}; } catch (_) { collapsed = {}; }
  rail.querySelectorAll(".rail-label").forEach(l => l.remove());
  Object.keys(tools).forEach(id => {
    const t = tools[id];
    const sv = t.querySelector("svg"); if (sv && hasIcon(id)) sv.outerHTML = icon(id, { size: 22, sw: 1.6 });
  });
  GROUPS.forEach(g => {
    const wrap = document.createElement("div"); wrap.className = "rgrp"; wrap.dataset.g = g[0];
    const head = document.createElement("button"); head.type = "button"; head.className = "rail-label rg-head";
    head.id = "rg-" + g[0]; head.setAttribute("aria-controls", "rgi-" + g[0]);
    head.innerHTML = icon("down", { size: 12, cls: "rg-chev" }) + '<span data-i18n="look.grp.' + g[0] + '">' + g[1] + "</span>";
    const body = document.createElement("div"); body.className = "rg-items"; body.id = "rgi-" + g[0];
    body.setAttribute("role", "group"); body.setAttribute("aria-labelledby", head.id);
    g[2].forEach(id => { if (tools[id]) body.appendChild(tools[id]); });
    const setC = c => { wrap.classList.toggle("collapsed", c); head.setAttribute("aria-expanded", String(!c)); };
    setC(!!collapsed[g[0]]);
    head.addEventListener("click", () => {
      const c = !wrap.classList.contains("collapsed"); setC(c); collapsed[g[0]] = c;
      store.set("thalomex.rail.groups", JSON.stringify(collapsed));
    });
    wrap.appendChild(head); wrap.appendChild(body); rail.appendChild(wrap);
  });
  if (tools.del) { const d = document.createElement("div"); d.className = "rgrp rg-end"; const b = document.createElement("div"); b.className = "rg-items"; b.appendChild(tools.del); d.appendChild(b); rail.appendChild(d); }
  const rb = $("railBtn"); if (rb) rb.innerHTML = icon("panel", { size: 18 });
  if (top) rail.insertBefore(top, rail.firstChild);
  const ms = $("modeSeg");
  const dim = () => {
    const on = ms && ms.querySelector('[aria-pressed="true"]'), mode = on ? on.dataset.v : "kin", list = TOOL_MODES[mode] || [];
    Object.keys(tools).forEach(id => {
      const d = list.indexOf(id) >= 0;
      tools[id].classList.toggle("dim", d);
      if (d) tools[id].setAttribute("data-dimtip", tr("look.tool.dim")); else tools[id].removeAttribute("data-dimtip");
    });
  };
  dim(); onLang(dim);
  applyStatic(rail);
  if (ms) new MutationObserver(dim).observe(ms, { attributes: true, subtree: true, attributeFilter: ["aria-pressed"] });
}

/* ============================================================
   Calculators op smalle schermen: een keuzelijst in plaats van een rij knoppen
   ============================================================ */
function initCalcSelect() {
  const list = $("calcList"), root = $("calcRoot"); if (!list || !root) return;
  const sel = document.createElement("select"); sel.id = "calcSel"; sel.className = "calc-sel";
  sel.setAttribute("aria-label", tr("look.calc.pick")); sel.setAttribute("data-i18n-aria", "look.calc.pick");
  root.insertBefore(sel, list);
  const build = () => {
    let h = "";
    list.querySelectorAll(".calc-group").forEach(g => {
      const gh = g.querySelector(".calc-gh");
      h += '<optgroup label="' + (gh ? gh.textContent.replace(/"/g, "&quot;") : "") + '">';
      g.querySelectorAll(".calc-item").forEach(b => {
        h += '<option value="' + b.dataset.c + '"' + (b.getAttribute("aria-pressed") === "true" ? " selected" : "") + ">" + b.textContent.replace(/</g, "&lt;") + "</option>";
      });
      h += "</optgroup>";
    });
    sel.innerHTML = h;
  };
  build();
  new MutationObserver(build).observe(list, { childList: true });
  sel.addEventListener("change", () => {
    const b = list.querySelector('.calc-item[data-c="' + sel.value + '"]'); if (b) b.click();
  });
}

export function initComponents() {
  hydrateIcons(document);
  initRail();
  initTooltips();
  initDialogs();
  initTabs();
  initMenu();
  initCalcSelect();
  // zichtbare knop-iconen voor wat in de HTML nog een glyph is
  const set = (id, name, size) => { const e = $(id); if (e) e.innerHTML = icon(name, { size: size || 18 }); };
  set("stiffFold", "down", 16); set("drawerBtn", "down", 16); set("meetDn", "left", 16); set("meetUp", "right", 16);
}
