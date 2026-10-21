// Schets: het tabblad "Optimaliseer". Parameters van het model (punten, veren, flexures, balkprofielen, materialen) en een uitkomst
// van de huidige modus; src/core/optimize.js zoekt de beste waarden, src/core/optsketch.js rekent elke stap op een kopie van het model.
import { optimizeGen, sensitivity } from "../core/optimize.js";
import { applyAssign, evaluate, listOutputs, listVars, takeSnap } from "../core/optsketch.js";
import { thermalNode } from "../core/thermal.js";
import { model } from "../core/state.js";
import { MATERIALS } from "../calc/materials.js";
import { numStr } from "./format.js";
import { has, onLang, t } from "./i18n.js";
import { HOW_HTML, esc, reportText, resultHtml, runAsync, sensLine } from "./optpanel.js";
import { undo } from "./persist.js";
import { buildInfo, dateText } from "./report.js";
import { changed } from "./solver.js";

const $ = id => document.getElementById(id);
const n3 = (v, d) => numStr(v, d || 3);
const plainNum = v => String(+Number(v).toPrecision(5));
const parse = s => parseFloat(String(s).replace(",", "."));
const modeName = m => (has("mode." + m) ? t("mode." + m) : m);
const S = { obj: "", sense: "min", target: 0, fx: "", vars: {}, matOn: {}, cons: [], maxEval: 300, res: null, P: null, applied: false, run: null, msg: "", dirty: true };

const visible = () => { const p = document.querySelector('.pane[data-p="opt"]'); return !!p && !p.hidden; };
const outputs = () => listOutputs();
const unitOf = (outs, k) => (outs.filter(o => o.key === k)[0] || {}).unit || "";

function syncState(vs, outs) {
  vs.forEach(v => {
    if (!S.vars[v.key]) S.vars[v.key] = { on: false, min: v.type === "num" ? plainNum(v.min) : "", max: v.type === "num" ? plainNum(v.max) : "", log: !!v.log };
  });
  if (!S.userObj || !outs.some(o => o.key === S.obj)) {
    const nd = model.mode === "kin" ? thermalNode() : null;
    S.obj = outs.length ? ((nd && outs.filter(o => o.key === "th:" + nd.id + ":sum")[0]) || outs.filter(o => o.key !== "fx")[0] || outs[0]).key : "";
  }
  S.cons = S.cons.filter(c => outs.some(o => o.key === c.out));
  if (model.mode === "stiff" && !S.sigPreset && outs.some(o => o.key === "sigratio")) { S.cons.push({ out: "sigratio", op: "le", val: "100", on: true }); S.sigPreset = true; }
}
function optionsHtml(outs, sel, noFx) {
  const groups = [];
  outs.forEach(o => { if (noFx && o.key === "fx") return; let g = groups.filter(x => x.n === o.group)[0]; if (!g) groups.push(g = { n: o.group, l: [] }); g.l.push(o); });
  return groups.map(g => '<optgroup label="' + esc(g.n) + '">' + g.l.map(o => '<option value="' + esc(o.key) + '"' + (o.key === sel ? " selected" : "") + ">" + esc(o.label + (o.unit ? " [" + o.unit + "]" : "")) + "</option>").join("") + "</optgroup>").join("");
}

function formHtml() {
  const vs = listVars(), outs = outputs();
  syncState(vs, outs);
  if (!outs.length) return '<p class="empty">' + esc(t("opt.s.empty")) + "</p>";
  const thermal = model.mode === "kin" && outs.some(o => /^th:/.test(o.key));
  let h = '<p class="empty">' + t("opt.s.intro", { mode: "<b>" + esc(modeName(model.mode)) + "</b>" }) + "</p>";
  if (thermal) h += '<button type="button" class="btn primary opt-oneclick" id="skAth" title="' + esc(t("opt.s.ath.t")) + '">' + esc(t("opt.s.ath")) + "</button>";
  h += '<div class="opt-sec"><div class="opt-h">' + esc(t("opt.s.obj")) + '</div><label class="fld"><span class="sr-only">' + esc(t("opt.s.obj")) + '</span><select id="skObj" aria-label="' + esc(t("opt.s.obj")) + '">' + optionsHtml(outs, S.obj) + "</select></label>" +
    '<label class="fld" id="skFxRow"' + (S.obj === "fx" ? "" : " hidden") + '><span>' + esc(t("opt.s.fx")) + '</span><input type="text" id="skFx" value="' + esc(S.fx) + '" autocomplete="off" spellcheck="false" style="width:100%"></label>' +
    '<div class="opt-seg" id="skSense" role="group" aria-label="' + esc(t("opt.s.dir")) + '">' + [["min", t("opt.s.min")], ["max", t("opt.s.max")], ["target", t("opt.s.target")]].map(a => '<button type="button" class="chip' + (S.sense === a[0] ? " on" : "") + '" data-sense="' + a[0] + '" aria-pressed="' + (S.sense === a[0]) + '">' + a[1] + "</button>").join("") + "</div>" +
    '<label class="fld" id="skTgtRow"' + (S.sense === "target" ? "" : " hidden") + '><span>' + esc(t("opt.s.tgt")) + '</span><input type="number" step="any" id="skTarget" value="' + esc(String(S.target)) + '"></label></div>';
  h += '<div class="opt-sec"><div class="opt-h">' + esc(t("opt.s.vars")) + ' <span class="opt-sub">' + esc(t("opt.s.varsub")) + "</span></div>";
  let lastG = "";
  vs.forEach(v => {
    const s = S.vars[v.key];
    if (v.group !== lastG) { lastG = v.group; h += '<div class="opt-grp">' + esc(v.group) + "</div>"; }
    if (v.type === "mat") {
      h += '<div class="opt-var"><label class="chk"><input type="checkbox" data-mat="' + esc(v.key) + '"' + (S.matOn[v.key] ? " checked" : "") + "> " + esc(t("opt.s.allmat", { l: v.label })) + "</label></div>";
      return;
    }
    h += '<div class="opt-var" data-ov="' + esc(v.key) + '"><label class="chk"><input type="checkbox" data-vf="on"' + (s.on ? " checked" : "") + "> " + esc(v.label) + ' <span class="opt-u">' + esc(t("opt.s.now", { v: n3(v.value), u: v.unit })) + "</span></label>" +
      '<div class="opt-rng"><label>min <input type="number" step="any" data-vf="min" value="' + esc(s.min) + '"></label><label>max <input type="number" step="any" data-vf="max" value="' + esc(s.max) + '"></label>' +
      '<label class="chk opt-log" title="' + esc(t("opt.s.log.t")) + '"><input type="checkbox" data-vf="log"' + (s.log ? " checked" : "") + "> log</label></div></div>";
  });
  h += "</div>";
  h += '<div class="opt-sec"><div class="opt-h">' + esc(t("opt.s.cons")) + "</div>";
  S.cons.forEach((r, k) => {
    h += '<div class="opt-con" data-ci="' + k + '"><div class="opt-con-a"><label class="chk"><input type="checkbox" data-cf="on"' + (r.on ? " checked" : "") + ' aria-label="' + esc(t("opt.s.con.on")) + '"></label><select data-cf="out" aria-label="' + esc(t("opt.s.con.out")) + '">' + optionsHtml(outs, r.out, true) + '</select></div>' +
      '<div class="opt-con-b"><select data-cf="op" aria-label="' + esc(t("opt.s.dir")) + '"><option value="le"' + (r.op === "le" ? " selected" : "") + '>≤</option><option value="ge"' + (r.op === "ge" ? " selected" : "") + '>≥</option></select>' +
      '<input type="number" step="any" data-cf="val" value="' + esc(r.val) + '" aria-label="' + esc(t("opt.s.con.lim")) + '"><button type="button" class="opt-x" data-cdel="' + k + '" aria-label="' + esc(t("opt.s.con.del")) + '" title="' + esc(t("opt.s.con.del.t")) + '">×</button></div></div>';
  });
  h += '<div class="opt-conacts"><button type="button" class="calc-reset" id="skAddCon">' + esc(t("opt.s.addcon")) + "</button></div></div>";
  h += '<div class="opt-sec"><label class="fld"><span>' + esc(t("opt.s.maxeval")) + '</span><input type="number" step="1" min="20" id="skMax" value="' + S.maxEval + '"></label></div>';
  h += '<div class="opt-run"><button type="button" class="btn primary" id="skRun">' + esc(t("opt.s.run")) + '</button><button type="button" class="btn" id="skStop" hidden>' + esc(t("opt.s.stop")) + '</button>' +
    '<progress id="skProg" max="' + S.maxEval + '" value="0" hidden></progress><span class="opt-ptxt" id="skPtxt" role="status" aria-live="polite">' + esc(S.msg) + "</span></div>";
  return h;
}

function mount() {
  const host = $("skOpt"); if (!host) return;
  host.innerHTML = '<div id="skForm" class="opt-form"></div><div id="skRes" class="opt-res"></div>' +
    '<details class="opt-more opt-how" id="skHow"><summary>' + esc(t("opt.how")) + '</summary><div class="opt-howb">' + HOW_HTML +
    "<p><b>" + t("opt.s.how.h") + "</b> " + t("opt.s.how.p") + "</p></div></details>";
  render();
}
function render() {
  S.dirty = false;
  const f = $("skForm"); if (!f) return;
  f.innerHTML = formHtml();
  showResult();
}
function showResult() {
  const box = $("skRes"); if (!box) return;
  if (!S.P) { box.innerHTML = ""; return; }
  S.P.applied = S.applied;
  box.innerHTML = resultHtml(S.P);
}

/* ---------- rekenen ---------- */
function problem() {
  const vs = listVars(), outs = outputs();
  const picked = vs.filter(v => v.type === "num" && S.vars[v.key] && S.vars[v.key].on);
  const dKeys = vs.filter(v => v.type === "mat" && S.matOn[v.key]).map(v => v.key);
  if (!picked.length && !dKeys.length) return { err: t("opt.s.e.none") };
  const vars = [];
  for (const v of picked) {
    const s = S.vars[v.key], lo = parse(s.min), hi = parse(s.max);
    if (!(isFinite(lo) && isFinite(hi) && hi > lo)) return { err: t("opt.s.e.range", { l: v.label }) };
    vars.push({ name: v.key, label: v.label, unit: v.unit, min: lo, max: hi, log: !!s.log && lo > 0, x0: Math.min(hi, Math.max(lo, v.value)), before: v.value });
  }
  if (!outs.some(o => o.key === S.obj)) return { err: t("opt.s.e.obj") };
  const target = parse(S.target);
  if (S.sense === "target" && !isFinite(target)) return { err: t("opt.s.e.tgt") };
  if (S.obj === "fx" && !String(S.fx).trim()) return { err: t("opt.s.e.fx") };
  const consIn = [];
  for (const r of S.cons) { if (!r.on) continue; const val = parse(r.val); if (!isFinite(val)) return { err: t("opt.s.e.con") }; consIn.push({ out: r.out, op: r.op, val }); }
  return { vs, outs, vars, dKeys, consIn, target };
}
function start() {
  if (S.run) return;
  const p = problem();
  if (p.err) { S.msg = p.err; $("skPtxt").textContent = p.err; return; }
  S.msg = ""; S.res = null; S.P = null; S.applied = false;
  $("skRes").innerHTML = "";
  const snap = takeSnap(), fx = S.fx;
  const maxEval = Math.max(20, Math.round(+S.maxEval) || 250);
  const keyList = [S.obj].concat(p.consIn.map(r => r.out)).filter((k, i, a) => a.indexOf(k) === i);
  let lastKey = "", last = null, errMsg = "", tTot = 0;
  const ev = (x, d) => {
    const key = x.join() + "|" + d.join();
    if (key === lastKey) return last;
    const assign = {};
    p.vars.forEach((v, i) => { assign[v.name] = x[i]; });
    p.dKeys.forEach((k, i) => { assign[k] = d[i]; });
    const t0 = performance.now();
    const r = evaluate(snap, assign, keyList, { fx });
    tTot += performance.now() - t0;
    if (r.err) errMsg = r.err;
    lastKey = key; last = r.vals;
    return r.vals;
  };
  const val = (x, d, k) => { const v = ev(x, d)[k]; return typeof v === "number" ? v : NaN; };
  const constraints = p.consIn.map((r, i) => ({
    name: "c" + i, label: unitLabel(p.outs, r.out) + (r.op === "le" ? " ≤ " : " ≥ ") + n3(r.val) + " " + unitOf(p.outs, r.out),
    g: (x, d) => { const v = val(x, d, r.out); return r.op === "le" ? v - r.val : r.val - v; },
    scale: Math.abs(r.val) > 1e-12 ? Math.abs(r.val) : 1
  }));
  const opts = { vars: p.vars.map(v => ({ name: v.name, min: v.min, max: v.max, log: v.log, x0: v.x0 })), discrete: p.dKeys.map(k => ({ name: k, options: MATERIALS.map(m => m.id) })),
    constraints, objective: (x, d) => val(x, d, S.obj), sense: S.sense, target: p.target, maxEval };
  $("skRun").disabled = true; $("skStop").hidden = false; $("skProg").hidden = false; $("skProg").max = maxEval; $("skProg").value = 0;
  $("skPtxt").textContent = t("opt.s.busy");
  S.run = runAsync(opts, {
    progress: pr => { const b = $("skProg"); if (b) b.value = pr.evals; const pt = $("skPtxt"); if (pt) pt.textContent = t("opt.conv.evals", { n: pr.evals }) + (pr.best != null ? t("opt.s.prog.best", { b: n3(pr.best) }) : t("opt.s.prog.none")); },
    error: err => { console.error(err); finish(null, t("opt.s.err", { m: err.message })); },
    done: res => finish({ res, p, snap, ev, val, opts, errMsg, tTot, keyList, fx }, "")
  });
}
const unitLabel = (outs, k) => (outs.filter(o => o.key === k)[0] || { label: k }).label;
function finish(R, msg) {
  S.run = null;
  if ($("skRun")) { $("skRun").disabled = false; $("skStop").hidden = true; $("skProg").hidden = true; $("skPtxt").textContent = msg; }
  if (!R) return;
  S.res = R.res; S.last = R;
  S.P = buildP(R);
  showResult();
  if (R.errMsg && !R.res.feasible) { const m = $("skPtxt"); if (m) m.textContent = t("opt.s.lastmsg", { m: R.errMsg }); }
}
function buildP(R) {
  const { res, p, snap, val, opts, fx } = R;
  const x = res.x, d = res.d || [];
  const outs = p.outs, objUnit = unitOf(outs, S.obj);
  const consKeys = p.consIn.map(r => r.out);
  const pick = outs.filter(o => o.key === S.obj || consKeys.indexOf(o.key) >= 0);
  const grp = (outs.filter(o => o.key === S.obj)[0] || {}).group;
  const nodeOf = k => k.split(":")[1];
  const same = outs.filter(o => o.group === grp && pick.indexOf(o) < 0 && o.key !== "fx");
  const mine = same.filter(o => nodeOf(o.key) === nodeOf(S.obj));
  const rest = (mine.length ? mine : same).slice(0, 5);
  const show = pick.concat(rest), keys = show.map(o => o.key);
  const assignA = {}, assignB = {};
  p.vars.forEach((v, i) => { assignA[v.name] = x[i]; });
  p.dKeys.forEach((k, i) => { assignA[k] = d[i]; });
  const before = evaluate(snap, assignB, keys, { fx }).vals, after = evaluate(snap, assignA, keys, { fx }).vals;
  const f = (v, sc) => (typeof v === "number" && isFinite(v) ? numStr(v, 3, false, sc) : "–");
  const eps = 1e-5;
  const vars = p.vars.map((v, i) => {
    const a = x[i]; let bound = null;
    if (a <= v.min * (1 + eps) + 1e-9 * Math.abs(v.min)) bound = "min"; else if (a >= v.max - eps * Math.abs(v.max) - 1e-12) bound = "max";
    return { id: v.name, label: v.label, unit: v.unit, before: v.before, after: a, bound, opt: true };
  });
  const discrete = p.dKeys.map((k, j) => {
    const v = p.vs.filter(q => q.key === k)[0];
    const mname = id => (MATERIALS.filter(m => m.id === id)[0] || { naam: id }).naam;
    return { key: k, label: v.label, before: mname(v.value), after: mname(d[j]), options: MATERIALS.map(m => m.naam).join(", ") };
  });
  // schaal per eenheid: een restwaarde als 9,7e-10 µm naast 13 µm toont als 0
  const unitScale = {};
  show.forEach(o => { const u = o.unit || ""; unitScale[u] = Math.max(unitScale[u] || 0, Math.abs(before[o.key]) || 0, Math.abs(after[o.key]) || 0); });
  const outRows = show.map(o => ({ label: o.label, unit: o.unit, before: f(before[o.key], unitScale[o.unit || ""]), after: f(after[o.key], unitScale[o.unit || ""]), afterRaw: after[o.key], role: o.key === S.obj ? "doel" : consKeys.indexOf(o.key) >= 0 ? "rand" : "" }));
  const cons = p.consIn.map((r, i) => ({ label: opts.constraints[i].label, active: res.active.some(a => a.name === "c" + i) }));
  const bounds = res.activeBounds.map(b => { const v = vars.filter(q => q.id === b.name)[0]; return t("opt.atbound", { l: v ? v.label : b.name, b: b.bound }); });
  const track = [S.obj].concat(consKeys.filter(k => k !== S.obj));
  const sens = [];
  if (p.vars.length && res.history.length) {
    const sv = sensitivity(opts.vars, x, xx => { const o = {}; track.forEach(k => { o[k] = val(xx, d, k); }); return o; }, 0.01);
    p.vars.forEach(v => {
      const items = track.map(k => { const q = sv[v.name][k]; return { label: unitLabel(outs, k), pct: q.pct, abs: q.abs, base: q.base, ref: before[k], unit: unitOf(outs, k) }; })
        .filter(it => isFinite(it.abs) && (Math.abs(it.pct) >= 0.05 || !isFinite(it.pct)) && it.abs !== 0);
      if (items.length) sens.push({ line: sensLine(v.label, items) });
    });
  }
  const combos = (res.combos || []).length > 1 ? res.combos.map(cb => ({ label: cb.d.map(id => (MATERIALS.filter(m => m.id === id)[0] || { naam: id }).naam).join(" + "), f: isFinite(cb.f) ? n3(cb.f) : "–", feasible: cb.feasible })) : [];
  const defCons = p.consIn.map((r, i) => opts.constraints[i].label);
  return { id: "skOpt", title: t("opt.s.title", { name: model.name && model.name !== "Naamloos" && model.name !== "Untitled" ? model.name : t("opt.s.model") }), res, canApply: true, applied: false, vars, outs: outRows, cons, bounds, sens, combos, discrete,
    defVars: p.vars.map(v => ({ label: v.label, unit: v.unit, min: v.min, max: v.max, log: v.log, x0: v.x0 })), defCons,
    obj: { label: unitLabel(outs, S.obj) + (S.obj === "fx" ? " = " + fx : ""), unit: objUnit, sense: S.sense, target: p.target, beforeTxt: f(before[S.obj]), afterTxt: f(after[S.obj], Math.abs(before[S.obj])) },
    xs: x, names: p.vars.map(v => v.name), dKeys: p.dKeys, aIds: d,
    extra: [t("opt.s.extra1", { mode: modeName(model.mode), ms: n3(R.tTot / Math.max(1, res.evals)) }), t("opt.s.extra2")] };
}

/* ---------- toepassen, terug, kopieer ---------- */
function apply() {
  if (!S.P || S.run) return;
  const P = S.P, a = {};
  P.names.forEach((n, i) => { a[n] = +Number(P.xs[i]).toPrecision(8); });
  P.dKeys.forEach((k, j) => { a[k] = P.aIds[j]; });
  applyAssign(a);
  S.applied = true;
  changed();                                                      // één wijziging = één stap voor ongedaan maken
  showResult();
  const m = $("skOptMsg"); if (m) m.textContent = t("opt.s.applied");
}
function copy() {
  if (!S.P) return;
  const b = buildInfo(), text = reportText(S.P, { date: dateText(), app: b.text });
  $("skOptCopy").dataset.report = text;
  const done = ok => { const m = $("skOptMsg"); if (m) m.textContent = ok ? t("opt.s.copied", { n: text.split("\n").length }) : t("opt.s.copyfail"); };
  const fallback = () => { try { const ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok; } catch (_) { return false; } };
  try { navigator.clipboard.writeText(text).then(() => done(true), () => done(fallback())); } catch (_) { done(fallback()); }
}

/** Eén klik: thermische drift van het gekozen punt naar nul, met de coördinaten van dat punt als variabelen. */
function athermal() {
  const nd = thermalNode();
  if (!nd) return;
  const vs = listVars();
  const mine = vs.filter(v => v.key === "nx:" + nd.id || v.key === "ny:" + nd.id);
  if (!mine.length) { S.msg = t("opt.s.nocoord"); $("skPtxt").textContent = S.msg; return; }
  S.obj = "th:" + nd.id + ":sum"; S.userObj = true; S.sense = "min"; S.cons = [];
  Object.keys(S.vars).forEach(k => { S.vars[k].on = false; });
  mine.forEach(v => { S.vars[v.key] = S.vars[v.key] || {}; Object.assign(S.vars[v.key], { on: true, min: plainNum(v.min), max: plainNum(v.max), log: false }); });
  render();
  start();
}

export function initSketchOpt() {
  const host = $("skOpt"); if (!host) return;
  mount();
  host.addEventListener("click", e => {
    const t = e.target;
    if (t.closest("#skRun")) { start(); return; }
    if (t.closest("#skStop")) { if (S.run) S.run.stop(); return; }
    if (t.closest("#skAth")) { athermal(); return; }
    if (t.closest("#skOptApply")) { apply(); return; }
    if (t.closest("#skOptUndo")) { undo(); S.applied = false; showResult(); return; }
    if (t.closest("#skOptCopy")) { copy(); return; }
    const sb = t.closest("[data-sense]");
    if (sb) { S.sense = sb.dataset.sense; $("skForm").innerHTML = formHtml(); return; }
    if (t.closest("#skAddCon")) {
      const outs = outputs().filter(o => o.key !== "fx");
      if (outs.length) S.cons.push({ out: outs[0].key, op: "le", val: "1", on: true });
      $("skForm").innerHTML = formHtml(); return;
    }
    const del = t.closest("[data-cdel]");
    if (del) { S.cons.splice(+del.dataset.cdel, 1); $("skForm").innerHTML = formHtml(); }
  });
  const onField = e => {
    const t = e.target;
    if (!$("skForm") || !$("skForm").contains(t)) return;
    if (t.id === "skObj") { S.obj = t.value; S.userObj = true; $("skFxRow").hidden = S.obj !== "fx"; return; }
    if (t.id === "skFx") { S.fx = t.value; return; }
    if (t.id === "skTarget") { S.target = t.value; return; }
    if (t.id === "skMax") { S.maxEval = t.value; return; }
    const ov = t.closest("[data-ov]");
    if (ov && t.dataset.vf) { S.vars[ov.dataset.ov][t.dataset.vf] = t.type === "checkbox" ? t.checked : t.value; return; }
    if (t.dataset.mat) { S.matOn[t.dataset.mat] = t.checked; return; }
    const cr = t.closest("[data-ci]");
    if (cr && t.dataset.cf) { S.cons[+cr.dataset.ci][t.dataset.cf] = t.type === "checkbox" ? t.checked : t.value; }
  };
  host.addEventListener("input", onField);
  host.addEventListener("change", onField);
  onLang(() => {
    if (S.run) return;
    S.msg = "";
    if (S.last) { try { S.P = buildP(S.last); } catch (err) { console.error(err); } }
    mount();
  });
  document.addEventListener("mech-tab", e => { if (e.detail === "opt" && S.dirty && !S.run) render(); });
  document.addEventListener("mech-changed", () => {
    if (S.run) return;
    S.dirty = true;
    if (visible()) render();
  });
}
