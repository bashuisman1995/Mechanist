// Metingen kiezen en de lijst met reeksen.
import { chVal } from "../core/channels.js";
import { alias, compile, exprUnit } from "../core/formula.js";
import { model, sim, ui, view } from "../core/state.js";
import { draw } from "./draw.js";
import { fmtHz, sg } from "./format.js";
import { save } from "./persist.js";
import { buildPdata, drawPlot, refreshChannels, serieLab, seriesBox } from "./plot.js";
import { serieColor } from "./theme.js";
import { cv, fitInto } from "./view.js";
import { t } from "./i18n.js";

/* ---------- meting kiezen ----------
   Eén regel per onderdeel met knopjes voor de grootheden. In de stand
   "Grootheid" zet een klik de meting aan of uit; in de stand "Formule"
   komt de naam in de formule te staan. */
export const pick = document.getElementById("pick"), pickQ = document.getElementById("pickQ"),
      pickList = document.getElementById("pickList"), pickFxInp = document.getElementById("pickFxInp"),
      pickMsg = document.getElementById("pickMsg"), pickOk = document.getElementById("pickOk");
let pickFor = -1, pickMode = "q", pickView = null;
function openPick(idx, mode) {
  refreshChannels();
  pickFor = idx;
  pickQ.value = "";
  setPickMode(mode || "q");
  pick.hidden = false;
  // het paneel mag het mechanisme niet afdekken: schuif het beeld naar het vrije deel
  const was = { s: view.s, ox: view.ox, oy: view.oy };
  const cr = cv.getBoundingClientRect(), pr = pick.querySelector(".card").getBoundingClientRect();
  let l = 0, t = 0, r = ui.W, b = ui.H - 8;                        // de afspeelbalk ligt onder het canvas
  if (pr.left > cr.left + ui.W * 0.4) r = Math.min(r, pr.left - cr.left - 8);   // paneel rechts
  else if (pr.top > cr.top) b = Math.min(b, pr.top - cr.top - 8);           // paneel onderaan
  pickView = fitInto(l, t + 56, r, b) ? was : null;          // bovenaan staat de hulptekst
  draw();
  (pickMode === "f" ? pickFxInp : pickQ).focus();
}
function closePick() {
  pick.hidden = true; ui.hover = null;
  if (pickView) { Object.assign(view, pickView); pickView = null; }
  draw();
}
function setPickMode(m) {
  pickMode = m;
  document.querySelectorAll("#pickMode button").forEach(b =>
    b.setAttribute("aria-pressed", String(b.dataset.v === m)));
  document.getElementById("pickFxBox").hidden = m !== "f";
  document.getElementById("pickTitle").textContent = pickFor >= 0 ? t("pick.replace") : t("pick.title");
  pickOk.textContent = m === "f" ? t("pick.addfx") : t("pick.ok");
  renderPick(); checkFx();
}

export function plotted(key) { return model.series.some(s => s.key === key); }
export function chip(c, on) {
  return '<button type="button" class="chip" data-k="' + c.key + '" aria-pressed="' + !!on + '" title="' +
    c.lab + " [" + c.u + "] \u2014 " + t("pick.informulas") + " " + c.al + '">' + c.q + "</button>";
}
export function renderPick() {
  const words = pickQ.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const rows = new Map();
  for (const c of sim.CH) {
    if (c.hide) continue;
    const hay = (c.o + " " + c.q + " " + c.al + " " + c.lab).toLowerCase();
    if (!words.every(w => hay.includes(w))) continue;
    if (!rows.has(c.o)) rows.set(c.o, { o: c.o, g: c.g, obj: c.obj, cs: [] });
    rows.get(c.o).cs.push(c);
  }
  const sid = ui.sel ? ui.sel.id : null;
  const list = [...rows.values()];
  if (!list.length) { pickList.innerHTML = '<div class="g">' + t("pick.none") + '</div>'; return; }
  let html = "", g = null;
  const mark = pickMode === "q" && pickFor < 0;
  const rowHtml = r => '<div class="prow' + (r.obj === sid ? " sel" : "") + '" data-o="' + r.obj + '"><span class="po">' + r.o +
    '</span><span class="pq">' + r.cs.map(c => chip(c, mark && plotted(c.key))).join("") + "</span></div>";
  const selRow = list.find(r => r.obj === sid);
  if (selRow) html += '<div class="g">' + t("pick.selection") + '</div>' + rowHtml(selRow);
  for (const r of list) {
    if (r === selRow) continue;
    if (r.g !== g) { g = r.g; html += '<div class="g">' + g + "</div>"; }
    html += rowHtml(r);
  }
  pickList.innerHTML = html;
}

function insertFx(txt) {
  const el = pickFxInp;
  const a = el.selectionStart != null ? el.selectionStart : el.value.length;
  const b = el.selectionEnd != null ? el.selectionEnd : a;
  const before = el.value.slice(0, a), after = el.value.slice(b);
  const pad = before && !/[\s(+\-*/^,]$/.test(before) ? " " : "";
  el.value = before + pad + txt + after;
  const p = (before + pad + txt).length;
  el.focus(); el.setSelectionRange(p, p);
  checkFx();
}
function checkFx() {
  if (pickMode !== "f") { pickMsg.textContent = pickFor < 0 ? t("pick.hint") : ""; return true; }
  const src = pickFxInp.value.trim();
  if (!src) { pickMsg.textContent = t("pick.typefx"); return false; }
  try {
    const c = compile(src);
    const u = exprUnit(c.used, src);
    pickMsg.innerHTML = '<span style="color:var(--spring)">\u2713 ' + t("pick.valid") + '</span>' + (u ? " \u00b7 " + t("pick.unit") + " " + u : "");
    return true;
  } catch (e) {
    pickMsg.innerHTML = '<span style="color:var(--bad)">' + e.message + "</span>";
    return false;
  }
}

function setSerie(idx, sr) {
  if (sr.expr && model.mode === "stiff") sr.stiff = true;            // een formule van statische waarden hoort bij de modus Stijfheid
  if (idx < 0) model.series.push(sr); else model.series[idx] = sr;
  ui.pdata = null; renderSeries(); drawPlot(); save();
}
export function toggleSerie(key) {
  const i = model.series.findIndex(s => s.key === key);
  if (i >= 0) model.series.splice(i, 1); else model.series.push({ key });
  ui.pdata = null; renderSeries(); drawPlot(); save();
}

// metingen met een statische waarde (modus Stijfheid) horen niet in de tijdgrafieken van de andere modi, en omgekeerd
const isStiffKey = k => /^[uk]\|/.test(k || "");
const showSerie = sr => (model.mode === "stiff" ? !!(sr.stiff || isStiffKey(sr.key)) : !(sr.stiff || isStiffKey(sr.key)));
// Stijfheid: één waarde per meting (of formule), uit de statische oplossing
export function stiffSeriesRows() {
  return model.series.filter(showSerie).map(sr => Object.assign({ lab: serieLab(sr) }, stiffValue(sr)));
}
function stiffValue(sr) {
  try {
    if (!(sim.stiff && sim.stiff.ok)) return { v: NaN, u: "", err: t("pick.nosol") };
    if (sr.expr) {
      const c = compile(sr.expr);
      return { v: c.f(nm => (nm === "t" ? 0 : chVal(null, alias(nm).key, 0))), u: exprUnit(c.used, sr.expr) };
    }
    const c = sim.CHM.get(sr.key);
    return { v: chVal(null, sr.key, 0), u: c ? c.u : "" };
  } catch (e) { return { v: NaN, u: "", err: e.message }; }
}

export function renderSeries() {
  refreshChannels();
  const note = document.getElementById("serieNote");
  if (model.mode === "stiff") note.textContent = "";
  const shown = model.series.map((sr, i) => i).filter(i => showSerie(model.series[i]));
  if (!shown.length) {
    if (model.mode === "stiff") { seriesBox.innerHTML = '<p class="empty">' + t("pick.stiffhint") + '</p>'; return; }
    seriesBox.innerHTML = "";
    note.textContent = sim.sweep
      ? t("pick.noseries")
      : t("pick.nosolyet");
    return;
  }
  note.textContent = sim.sweep && !sim.sweep.stat && !sim.sweep.frf
    ? t("pick.indet") : "";
  seriesBox.innerHTML = shown.map(i => [model.series[i], i]).map(([sr, i]) =>
    '<div class="serie">' +
      '<span class="sw" style="background:' + (model.mode === "stiff" ? "var(--ink-3)" : serieColor(i)) + '"></span>' +
      (sr.expr
        ? '<input class="fx" data-f="' + i + '" value="' + String(sr.expr).replace(/"/g, "&quot;") + '">'
        : '<button class="lab" data-i="' + i + '">' + serieLab(sr) + '</button>') +
      '<button class="rm" data-r="' + i + '" title="' + t("pick.remove") + '" aria-label="' + t("pick.remove.aria") + '">\u00d7</button>' +
      '<span class="meta"><span data-v="' + i + '">\u2013</span><span data-s="' + i + '"></span></span>' +
    '</div>').join("");
  seriesBox.querySelectorAll(".lab").forEach(el =>
    el.addEventListener("click", () => openPick(+el.dataset.i)));
  seriesBox.querySelectorAll(".fx").forEach(el => {
    const commit = () => {
      model.series[+el.dataset.f] = model.series[+el.dataset.f].stiff ? { expr: el.value, stiff: true } : { expr: el.value };
      ui.pdata = null; syncSeriesValues(); drawPlot(); save();
    };
    el.addEventListener("change", commit);
    el.addEventListener("keydown", ev => {
      if (ev.key === "Enter") { ev.preventDefault(); commit(); el.blur(); }
    });
  });
  seriesBox.querySelectorAll(".rm").forEach(b =>
    b.addEventListener("click", () => {
      model.series.splice(+b.dataset.r, 1);
      ui.pdata = null; renderSeries(); drawPlot(); save();
    }));
  syncSeriesValues();
}

const degs = p => { const r = Math.round(p) || 0; return (r < 0 ? "\u2212" : "") + Math.abs(r); };
const num = (v, u) => !isFinite(v) ? "\u2013" : sg(v) + (u ? " " + u : "");

export function syncSeriesValues() {
  if (model.mode === "stiff") {
    seriesBox.querySelectorAll("[data-v]").forEach(el => {
      const r = stiffValue(model.series[+el.dataset.v]);
      const h = r.err ? '<b style="color:var(--bad)">' + r.err + "</b>" : "<b>" + num(r.v, r.u) + "</b>";
      if (el.__h !== h) { el.__h = h; el.innerHTML = h; }
    });
    return;
  }
  if (!sim.sweep) return;
  if (!ui.pdata) buildPdata();
  const i = Math.max(0, Math.min(360, ui.hoverI !== null ? ui.hoverI : Math.round(ui.frame)));
  const frf = ui.pdata && ui.pdata.frf;
  const put = (el, html) => { if (el.__h !== html) { el.__h = html; el.innerHTML = html; } };
  seriesBox.querySelectorAll("[data-v]").forEach(el => {
    const d = ui.pdata && ui.pdata.ss[+el.dataset.v];
    const mv = frf && ui.hoverI === null && ui.meet && d ? ui.meet.v[d.si] : null;      // exact bij de meetfrequentie
    put(el, mv ? "<b>" + num(mv.amp, d.u) + "</b> \u00b7 " + degs(mv.ph) + "\u00b0 \u00b7 " + fmtHz(ui.meet.f)
      : !d ? "–"
      : d.err ? '<b style="color:var(--bad)">' + d.err + "</b>"
      : frf ? "<b>" + num(Math.pow(10, d.a[i]), d.u) + "</b> \u00b7 " + (isFinite(d.ph[i]) ? degs(d.ph[i]) + "\u00b0" : "\u2013") +
              " \u00b7 " + fmtHz(sim.sweep.f[i])
      : "<b>" + num(d.a[i], d.u) + "</b>");
  });
  seriesBox.querySelectorAll("[data-s]").forEach(el => {
    const d = ui.pdata && ui.pdata.ss[+el.dataset.s];
    put(el, !(d && d.ok) ? ""
      : frf ? t("pick.peak", { v: num(d.peak), f: fmtHz(sim.sweep.f[d.pk]) })
      : t("pick.stats", { mn: num(d.mn), mx: num(d.mx), rms: num(d.rms) }));
  });
}

export function initPicker() {
  document.getElementById("pickMode").addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (b) setPickMode(b.dataset.v);
  });
  pickQ.addEventListener("input", renderPick);
  pickList.addEventListener("click", ev => {
    const b = ev.target.closest("button.chip"); if (!b) return;
    const c = sim.CHM.get(b.dataset.k); if (!c) return;
    if (pickMode === "f") { insertFx(c.al); return; }
    if (pickFor >= 0) { setSerie(pickFor, { key: c.key }); closePick(); return; }
    toggleSerie(c.key);
    b.setAttribute("aria-pressed", String(plotted(c.key)));
  });
  pickFxInp.addEventListener("input", checkFx);
  pickFxInp.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); pickOk.click(); } });
  pickOk.addEventListener("click", () => {
    if (pickMode === "f") {
      if (!checkFx()) return;
      setSerie(pickFor, { expr: pickFxInp.value.trim() });
      pickFxInp.value = "";
    }
    closePick();
  });
  document.getElementById("pickCancel").addEventListener("click", closePick);
  // met de muis over een regel: dat onderdeel licht op in de tekening
  pickList.addEventListener("pointerover", ev => {
    const r = ev.target.closest(".prow");
    const id = r ? r.dataset.o || null : null;
    if (id !== ui.hover) { ui.hover = id; draw(); }
  });
  pickList.addEventListener("pointerleave", () => { if (ui.hover !== null) { ui.hover = null; draw(); } });
  pick.addEventListener("keydown", ev => { if (ev.key === "Escape") closePick(); });

  document.getElementById("addSerie").addEventListener("click", () => openPick(-1, "q"));
  document.getElementById("addFx").addEventListener("click", () => openPick(-1, "f"));
}
