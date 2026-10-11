// Metingen kiezen en de lijst met reeksen.
import { compile, exprUnit } from "../core/formula.js";
import { model, sim, ui, view } from "../core/state.js";
import { draw } from "./draw.js";
import { fmtHz } from "./format.js";
import { save } from "./persist.js";
import { buildPdata, drawPlot, refreshChannels, serieLab, seriesBox } from "./plot.js";
import { serieColor } from "./theme.js";
import { cv, fitInto } from "./view.js";

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
  let l = 0, t = 0, r = ui.W, b = ui.H - 70;                       // onderaan zit de afspeelbalk
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
  document.getElementById("pickTitle").textContent = pickFor >= 0 ? "Meting vervangen" : "Metingen kiezen";
  pickOk.textContent = m === "f" ? "Formule toevoegen" : "Klaar";
  renderPick(); checkFx();
}

export function plotted(key) { return model.series.some(s => s.key === key); }
export function chip(c, on) {
  return '<button type="button" class="chip" data-k="' + c.key + '" aria-pressed="' + !!on + '" title="' +
    c.lab + " [" + c.u + "] \u2014 in formules: " + c.al + '">' + c.q + "</button>";
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
  if (!list.length) { pickList.innerHTML = '<div class="g">niets gevonden</div>'; return; }
  let html = "", g = null;
  const mark = pickMode === "q" && pickFor < 0;
  const rowHtml = r => '<div class="prow' + (r.obj === sid ? " sel" : "") + '" data-o="' + r.obj + '"><span class="po">' + r.o +
    '</span><span class="pq">' + r.cs.map(c => chip(c, mark && plotted(c.key))).join("") + "</span></div>";
  const selRow = list.find(r => r.obj === sid);
  if (selRow) html += '<div class="g">Selectie</div>' + rowHtml(selRow);
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
  if (pickMode !== "f") { pickMsg.textContent = pickFor < 0 ? "Klik een grootheid om hem aan of uit te zetten." : ""; return true; }
  const src = pickFxInp.value.trim();
  if (!src) { pickMsg.textContent = "Typ een formule, of klik hieronder grootheden aan."; return false; }
  try {
    const c = compile(src);
    const u = exprUnit(c.used, src);
    pickMsg.innerHTML = '<span style="color:var(--spring)">\u2713 geldig</span>' + (u ? " \u00b7 eenheid " + u : "");
    return true;
  } catch (e) {
    pickMsg.innerHTML = '<span style="color:var(--bad)">' + e.message + "</span>";
    return false;
  }
}

function setSerie(idx, sr) {
  if (idx < 0) model.series.push(sr); else model.series[idx] = sr;
  ui.pdata = null; renderSeries(); drawPlot(); save();
}
export function toggleSerie(key) {
  const i = model.series.findIndex(s => s.key === key);
  if (i >= 0) model.series.splice(i, 1); else model.series.push({ key });
  ui.pdata = null; renderSeries(); drawPlot(); save();
}

export function renderSeries() {
  refreshChannels();
  const note = document.getElementById("serieNote");
  if (!model.series.length) {
    seriesBox.innerHTML = "";
    note.textContent = sim.sweep
      ? "Klik op Metingen\u2026, of selecteer een onderdeel en kies hoe je het meet."
      : "Nog geen oplossing \u2014 zie de melding onder het canvas.";
    return;
  }
  note.textContent = sim.sweep && !sim.sweep.stat && !sim.sweep.frf
    ? "Krachten zijn niet bepaald: het stelsel is niet vierkant." : "";
  seriesBox.innerHTML = model.series.map((sr, i) =>
    '<div class="serie">' +
      '<span class="sw" style="background:' + serieColor(i) + '"></span>' +
      (sr.expr
        ? '<input class="fx" data-f="' + i + '" value="' + String(sr.expr).replace(/"/g, "&quot;") + '">'
        : '<button class="lab" data-i="' + i + '">' + serieLab(sr) + '</button>') +
      '<button class="rm" data-r="' + i + '" title="Verwijderen" aria-label="Meting verwijderen">\u00d7</button>' +
      '<span class="meta"><span data-v="' + i + '">\u2013</span><span data-s="' + i + '"></span></span>' +
    '</div>').join("");
  seriesBox.querySelectorAll(".lab").forEach(el =>
    el.addEventListener("click", () => openPick(+el.dataset.i)));
  seriesBox.querySelectorAll(".fx").forEach(el => {
    const commit = () => {
      model.series[+el.dataset.f] = { expr: el.value };
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

const num = (v, u) => !isFinite(v) ? "–"
  : (Math.abs(v) >= 1e4 || (v !== 0 && Math.abs(v) < 1e-2) ? v.toExponential(2) : v.toFixed(2)) + (u ? " " + u : "");

export function syncSeriesValues() {
  if (!sim.sweep) return;
  if (!ui.pdata) buildPdata();
  const i = Math.max(0, Math.min(360, ui.hoverI !== null ? ui.hoverI : Math.round(ui.frame)));
  const frf = ui.pdata && ui.pdata.frf;
  const put = (el, html) => { if (el.__h !== html) { el.__h = html; el.innerHTML = html; } };
  seriesBox.querySelectorAll("[data-v]").forEach(el => {
    const d = ui.pdata && ui.pdata.ss[+el.dataset.v];
    put(el, !d ? "–"
      : d.err ? '<b style="color:var(--bad)">' + d.err + "</b>"
      : frf ? "<b>" + num(Math.pow(10, d.a[i]), d.u) + "</b> \u00b7 " + (isFinite(d.ph[i]) ? d.ph[i].toFixed(0) + "\u00b0" : "\u2013") +
              " \u00b7 " + fmtHz(sim.sweep.f[i])
      : "<b>" + num(d.a[i], d.u) + "</b>");
  });
  seriesBox.querySelectorAll("[data-s]").forEach(el => {
    const d = ui.pdata && ui.pdata.ss[+el.dataset.s];
    put(el, !(d && d.ok) ? ""
      : frf ? "piek " + num(d.peak) + " bij " + fmtHz(sim.sweep.f[d.pk])
      : "min " + num(d.mn) + " · max " + num(d.mx) + " · rms " + num(d.rms));
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
