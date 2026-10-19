// Calculators: het paneel "Optimaliseer". Kiest doel, variabelen en randvoorwaarden uit de invoer en uitkomsten van de
// gekozen calculator, draait src/core/optimize.js in stukjes en toont een herleidbaar resultaat.
import { sensitivity } from "../core/optimize.js";
import { HOW_HTML, esc, reportText, resultHtml, runAsync, sensLine } from "./optpanel.js";
import { buildInfo, dateText } from "./report.js";
import { numStr } from "./format.js";

const $ = id => document.getElementById(id);
const n3 = (v, d) => numStr(v, d || 3);
const plainNum = v => String(+Number(v).toPrecision(5));
const parse = s => parseFloat(String(s).replace(",", "."));
const MAXEVAL = 20000;         // rekenen is hier goedkoop; bij een materiaalkeuze geldt dit totaal verdeeld over alle combinaties

let ctx = null;
const S = {};            // paneltoestand per calculator
const isNum = i => typeof i.def === "number";

function st(c) {
  if (S[c.id]) return S[c.id];
  const base = ctx.evalCalc(c, ctx.state.vals[c.id], null);
  const s = S[c.id] = { obj: "", sense: "min", target: 0, vars: {}, matOn: {}, cons: [], n: 1, res: null, P: null, undo: null, run: null, msg: "" };
  const numIns = c.inputs.filter(isNum);
  let ticked = numIns.filter(i => ctx.grpOf(i) === "Geometrie");
  if (!ticked.length) ticked = numIns.slice(0, 2);
  numIns.forEach(i => {
    const r = ctx.rangeOf(c, i), v = ctx.state.vals[c.id][i.id];
    s.vars[i.id] = { on: ticked.indexOf(i) >= 0, min: plainNum(r[0]), max: plainNum(r[1]), log: !!r[2] };
    if (!(v >= r[0] && v <= r[1])) { s.vars[i.id].min = plainNum(Math.min(r[0], v > 0 ? v / 2 : r[0])); s.vars[i.id].max = plainNum(Math.max(r[1], v * 2)); }
  });
  if (base) {
    const outs = outList(base);
    s.obj = outs.length ? outs[0].k : "";
    outs.forEach(o => {
      if (/^Spanning/.test(o.k)) s.cons.push({ out: o.k, op: "le", val: plainNum(base.M.sigma), on: true, sig: true });
    });
    outs.forEach(o => {
      if (/^Knikveiligheid/.test(o.k)) s.cons.push({ out: o.k, op: "ge", val: "2", on: true });
    });
    const f = outs.filter(o => /^Eigenfrequentie/.test(o.k))[0];
    if (f) s.cons.push({ out: f.k, op: "ge", val: plainNum(f.raw), on: false });
  }
  return s;
}
// numerieke uitkomsten van een evaluatie: [{k, unit, raw}]
function outList(ev) { return ev.o.out.filter(x => typeof x.raw === "number" && !isNaN(x.raw)).map(x => ({ k: x.k, unit: x.unit || "", raw: x.raw })); }
const outMap = ev => { const m = {}; if (ev) outList(ev).forEach(o => { m[o.k] = o.raw; }); return m; };

/* ---------- formulier ---------- */
function formHtml(c) {
  const s = st(c), base = ctx.evalCalc(c, ctx.state.vals[c.id], null);
  if (!base) return '<p class="empty">Controleer eerst de invoer: er is geen geldige uitkomst om te optimaliseren.</p>';
  const outs = outList(base);
  const opt = sel => outs.map(o => '<option value="' + esc(o.k) + '"' + (o.k === sel ? " selected" : "") + ">" + esc(o.k + (o.unit ? " [" + o.unit + "]" : "")) + "</option>").join("");
  let h = '<div class="opt-sec"><div class="opt-h">Doel</div><label class="fld"><span class="sr-only">Doel</span><select id="optObj" aria-label="Doel">' + opt(s.obj) + "</select></label>" +
    '<div class="opt-seg" id="optSense" role="group" aria-label="Richting">' +
    [["min", "Minimaliseer"], ["max", "Maximaliseer"], ["target", "= doel"]].map(a => '<button type="button" class="chip' + (s.sense === a[0] ? " on" : "") + '" data-sense="' + a[0] + '" aria-pressed="' + (s.sense === a[0]) + '">' + a[1] + "</button>").join("") + "</div>" +
    '<label class="fld opt-tgt"' + (s.sense === "target" ? "" : " hidden") + '><span>Doelwaarde</span><input type="number" step="any" id="optTarget" value="' + esc(String(s.target)) + '"></label></div>';
  h += '<div class="opt-sec"><div class="opt-h">Variabelen <span class="opt-sub">vink aan wat mag veranderen</span></div>';
  c.inputs.filter(isNum).forEach(i => {
    const v = s.vars[i.id];
    h += '<div class="opt-var" data-ov="' + i.id + '"><label class="chk"><input type="checkbox" data-vf="on"' + (v.on ? " checked" : "") + "> " + esc(i.label) + "</label>" +
      '<div class="opt-rng"><label>min <input type="number" step="any" data-vf="min" value="' + esc(v.min) + '"></label><label>max <input type="number" step="any" data-vf="max" value="' + esc(v.max) + '"></label>' +
      '<span class="opt-u">' + esc(i.unit) + '</span><label class="chk opt-log" title="Logaritmisch afbeelden: handig als de waarde meerdere decaden beslaat"><input type="checkbox" data-vf="log"' + (v.log ? " checked" : "") + "> log</label></div></div>";
  });
  const mats = ctx.ownMat(c) ? ctx.matsOf(c).map(i => ({ key: i.id, label: i.label })) : [{ key: "_", label: "Materiaal" }];
  h += '<div class="opt-matrow">' + mats.map(m => '<label class="chk"><input type="checkbox" data-mat="' + m.key + '"' + (s.matOn[m.key] ? " checked" : "") + "> " + esc(m.label) + ": alle materialen proberen</label>").join("") + "</div></div>";
  h += '<div class="opt-sec"><div class="opt-h">Randvoorwaarden</div>';
  s.cons.forEach((r, k) => {
    h += '<div class="opt-con" data-ci="' + k + '"><div class="opt-con-a"><label class="chk"><input type="checkbox" data-cf="on"' + (r.on ? " checked" : "") + ' aria-label="Randvoorwaarde aan"></label>' +
      '<select data-cf="out" aria-label="Uitkomst">' + opt(r.out) + '</select></div><div class="opt-con-b"><select data-cf="op" aria-label="Richting"><option value="le"' + (r.op === "le" ? " selected" : "") + '>\u2264</option><option value="ge"' + (r.op === "ge" ? " selected" : "") + '>\u2265</option></select>' +
      '<input type="number" step="any" data-cf="val" value="' + esc(r.val) + '" aria-label="Grens"><button type="button" class="opt-x" data-cdel="' + k + '" aria-label="Verwijder randvoorwaarde" title="Verwijderen">\u00d7</button></div></div>';
  });
  const hasSig = s.cons.some(r => r.sig);
  h += '<div class="opt-conacts"><button type="button" class="calc-reset" id="optAddCon">+ Randvoorwaarde</button>' +
    (hasSig ? '<label class="fld opt-n"><span>veiligheidsfactor n (σ ≤ σ_toel/n)</span><input type="number" step="any" min="1" id="optN" value="' + esc(String(s.n)) + '"></label>' : "") + "</div></div>";
  h += '<div class="opt-run"><button type="button" class="btn primary" id="optRun">Optimaliseer</button><button type="button" class="btn" id="optStop" hidden>Stop</button>' +
    '<progress id="optProg" max="' + MAXEVAL + '" value="0" hidden></progress><span class="opt-ptxt" id="optPtxt" role="status" aria-live="polite">' + esc(s.msg) + "</span></div>";
  return h;
}

export function optSection(c) {
  return '<details class="calc-sec calc-card" id="calcOptSec" data-sec="Optimaliseer"><summary>Optimaliseer</summary><div class="calc-sec-b opt-body">' +
    '<div id="optForm" class="opt-form"></div><div id="optRes" class="opt-res"></div>' +
    '<details class="opt-more opt-how" id="optHow"><summary>Hoe rekent dit?</summary><div class="opt-howb">' + HOW_HTML + "</div></details></div></details>";
}
export function optMount() {
  const c = ctx.calcOf();
  if (!$("optForm")) return;
  $("optForm").innerHTML = formHtml(c);
  showResult(c);
}
export function optOpen() {
  const sec = $("calcOptSec");
  if (!sec) return;
  sec.open = true;
  ctx.state.open.Optimaliseer = true;
  const det = $("calcDetail");                      // alleen de detailkolom scrollt, nooit de hele pagina
  if (det) det.scrollTop = sec.getBoundingClientRect().top - det.getBoundingClientRect().top + det.scrollTop - 8;
  const b = $("optRun"); if (b) b.focus({ preventScroll: true });
}

/* ---------- rekenen ---------- */
function problem(c, s) {
  const vals = ctx.state.vals[c.id], base = ctx.evalCalc(c, vals, null);
  if (!base) return { err: "Controleer eerst de invoer." };
  const ins = c.inputs.filter(i => isNum(i) && s.vars[i.id].on);
  if (!ins.length) return { err: "Vink minstens één variabele aan." };
  const vars = [];
  for (const i of ins) {
    const v = s.vars[i.id], lo = parse(v.min), hi = parse(v.max);
    if (!(isFinite(lo) && isFinite(hi) && hi > lo)) return { err: i.label + ": max moet groter zijn dan min." };
    let log = !!v.log;
    if (log && !(lo > 0)) log = false;
    const x = vals[i.id];
    vars.push({ name: i.id, label: i.label, unit: i.unit, min: lo, max: hi, log, x0: Math.min(hi, Math.max(lo, x)), input: i });
  }
  const bOut = outMap(base);
  if (!(s.obj in bOut)) return { err: "Kies een doel." };
  const target = parse(s.target);
  if (s.sense === "target" && !isFinite(target)) return { err: "Geef een doelwaarde." };
  const consIn = [];
  for (const r of s.cons) {
    if (!r.on) continue;
    const val = parse(r.val);
    if (!isFinite(val)) return { err: "Randvoorwaarde: geef een getal." };
    consIn.push({ out: r.out, op: r.op, val: r.sig && s.n > 0 ? val / s.n : val });
  }
  const dKeys = Object.keys(s.matOn).filter(k => s.matOn[k]);
  const discrete = dKeys.map(k => ({ name: k, options: ctx.MATERIALS.map(m => m.id) }));
  return { vals, base, bOut, vars, consIn, dKeys, discrete, target };
}

function start() {
  const c = ctx.calcOf(), s = st(c);
  if (s.run) return;
  const p = problem(c, s);
  if (p.err) { s.msg = p.err; $("optPtxt").textContent = p.err; return; }
  s.msg = ""; s.res = null; s.P = null; s.undo = s.undo || null;
  $("optRes").innerHTML = "";
  let lastKey = "", last = null;
  const ev = (x, d) => {
    const key = x.join() + "|" + d.join();
    if (key === lastKey) return last;
    const v = Object.assign({}, p.vals), mo = {};
    p.vars.forEach((vv, i) => { v[vv.name] = x[i]; });
    p.dKeys.forEach((k, i) => { mo[k] = d[i]; });
    const e = ctx.evalCalc(c, v, p.dKeys.length ? mo : null);
    lastKey = key; last = e;
    return e;
  };
  const val = (x, d, k) => { const e = ev(x, d); const m = e ? outMap(e) : null; return m && k in m ? m[k] : NaN; };
  const constraints = p.consIn.map((r, i) => ({
    name: "c" + i, label: r.out + (r.op === "le" ? " ≤ " : " ≥ ") + n3(r.val),
    g: (x, d) => { const v = val(x, d, r.out); return r.op === "le" ? v - r.val : r.val - v; },
    scale: Math.abs(r.val) > 1e-12 ? Math.abs(r.val) : 1
  }));
  const opts = { vars: p.vars.map(v => ({ name: v.name, min: v.min, max: v.max, log: v.log, x0: v.x0 })), discrete: p.discrete, constraints,
    objective: (x, d) => val(x, d, s.obj), sense: s.sense, target: p.target, maxEval: MAXEVAL };
  $("optRun").disabled = true; $("optStop").hidden = false; $("optProg").hidden = false; $("optProg").value = 0;
  $("optPtxt").textContent = "bezig…";
  s.run = runAsync(opts, {
    progress: pr => { const b = $("optProg"); if (b) { b.value = pr.evals; } const t = $("optPtxt"); if (t) t.textContent = pr.evals + " evaluaties" + (pr.best != null ? " · beste " + n3(pr.best) : " · nog geen toelaatbaar punt"); },
    error: err => { console.error(err); finish(c, s, null, "Fout: " + err.message); },
    done: res => finish(c, s, { res, p, ev, val, opts }, "")
  });
}
function finish(c, s, R, msg) {
  s.run = null;
  if ($("optRun")) { $("optRun").disabled = false; $("optStop").hidden = true; $("optProg").hidden = true; $("optPtxt").textContent = msg; }
  if (!R) return;
  s.res = R.res;
  s.P = buildP(c, s, R);
  showResult(c);
}

function outUnit(c, base, k) { const o = outList(base).filter(x => x.k === k)[0]; return o ? o.unit : ""; }
function buildP(c, s, R) {
  const { res, p, ev, val, opts } = R;
  const x = res.x, d = res.d || [];
  const aEv = ev(x, d), aMap = outMap(aEv), bMap = p.bOut;
  const eps = 1e-5;
  const vars = c.inputs.filter(isNum).map(i => {
    const k = p.vars.findIndex(v => v.name === i.id), before = p.vals[i.id];
    const after = k >= 0 ? x[k] : before;
    let bound = null;
    if (k >= 0) { const vv = p.vars[k]; if (after <= vv.min * (1 + eps) + 1e-12) bound = "min"; else if (after >= vv.max * (1 - eps) - 1e-12) bound = "max"; }
    return { id: i.id, label: i.label, unit: i.unit, before, after, bound, opt: k >= 0, afterRaw: after };
  });
  const matLabel = (key, id) => ctx.MATERIALS.filter(m => m.id === id).map(m => m.naam)[0] || id;
  const discrete = p.dKeys.map((k, j) => {
    const lab = k === "_" ? "Materiaal" : (c.inputs.filter(i => i.id === k)[0] || {}).label || k;
    const before = k === "_" ? ctx.state.mats[c.id] : p.vals[k];
    return { key: k, label: lab, before: matLabel(k, before), after: matLabel(k, d[j]), afterId: d[j], options: ctx.MATERIALS.map(m => m.naam).join(", ") };
  });
  const consOut = {}; p.consIn.forEach(r => { consOut[r.out] = 1; });
  const list = outList(p.base);
  const fmtv = (m, k) => (k in m ? (m[k] === Infinity ? "∞" : numStr(m[k], 3, false, isFinite(bMap[k]) ? Math.abs(bMap[k]) : 0)) : "–");
  const sel = list.filter(o => o.k === s.obj || consOut[o.k]);
  const rest = list.filter(o => !(o.k === s.obj || consOut[o.k])).slice(0, 6);
  const outs = sel.concat(rest).map(o => ({ label: o.k, unit: o.unit, before: fmtv(bMap, o.k), after: fmtv(aMap, o.k), afterRaw: aMap[o.k], role: o.k === s.obj ? "doel" : consOut[o.k] ? "rand" : "" }));
  const cons = p.consIn.map((r, i) => ({ label: opts.constraints[i].label, active: res.active.some(a => a.name === "c" + i) }));
  const bounds = res.activeBounds.map(b => { const v = vars.filter(q => q.id === b.name)[0]; return (v ? v.label : b.name) + " op " + b.bound; });
  // gevoeligheid: +1 % van elke variabele
  const track = [s.obj].concat(Object.keys(consOut).filter(k => k !== s.obj));
  const sens = [];
  if (res.feasible || res.history.length) {
    const sv = sensitivity(opts.vars, x, xx => { const o = {}; track.forEach(k => { o[k] = val(xx, d, k); }); return o; }, 0.01);
    p.vars.forEach(v => {
      const items = track.map(k => { const q = sv[v.name][k]; return { label: k, pct: q.pct, abs: q.abs, base: q.base, ref: bMap[k], unit: outUnit(c, p.base, k) }; })
        .filter(it => isFinite(it.abs) && (Math.abs(it.pct) >= 0.05 || !isFinite(it.pct)) && it.abs !== 0);
      if (items.length) sens.push({ line: sensLine(v.label, items) });
    });
  }
  const combos = (res.combos || []).length > 1 ? res.combos.map(cb => ({ label: cb.d.map((id, j) => matLabel(p.dKeys[j], id)).join(" + "), f: isFinite(cb.f) ? n3(cb.f) : "–", feasible: cb.feasible })) : [];
  const unit = outUnit(c, p.base, s.obj);
  const fm = (m) => (s.obj in m ? numStr(m[s.obj], 3, false, Math.abs(bMap[s.obj])) : "–");
  const senseTxt = s.sense;
  const defVars = p.vars.map(v => ({ label: v.label, unit: v.unit, min: v.min, max: v.max, log: v.log, x0: v.x0 }));
  const defCons = p.consIn.map(r => r.out + (r.op === "le" ? " ≤ " : " ≥ ") + n3(r.val) + " " + outUnit(c, p.base, r.out));
  return { id: "calcOpt", title: c.name, res, p: null, canApply: true, applied: !!s.undo, defVars, defCons, discrete, vars, outs, cons, bounds, sens, combos,
    obj: { label: s.obj, unit, sense: senseTxt, target: p.target, beforeTxt: fm(bMap), afterTxt: fm(aMap) }, aIds: d, xs: x, names: p.vars.map(v => v.name), dKeys: p.dKeys };
}
function showResult(c) {
  const s = S[c.id], box = $("optRes");
  if (!box) return;
  if (!s || !s.P) { box.innerHTML = ""; return; }
  s.P.applied = !!s.undo;
  box.innerHTML = resultHtml(s.P);
}

/* ---------- toepassen, terug, kopieer ---------- */
function apply() {
  const c = ctx.calcOf(), s = S[c.id];
  if (!s || !s.P) return;
  const P = s.P, vals = ctx.state.vals[c.id];
  s.undo = { vals: Object.assign({}, vals), mat: ctx.state.mats[c.id] };
  const nv = Object.assign({}, vals);
  P.names.forEach((n, i) => { nv[n] = +Number(P.xs[i]).toPrecision(6); });
  P.dKeys.forEach((k, j) => { if (k === "_") ctx.state.mats[c.id] = P.aIds[j]; else nv[k] = P.aIds[j]; });
  ctx.state.vals[c.id] = nv;
  ctx.state.sigmas[c.id] = ctx.state.sigmas[c.id];
  ctx.renderDetail();
  optOpen();
  const m = $("calcOptMsg"); if (m) m.textContent = "Waarden toegepast. Met Terug zet je ze terug.";
}
function undo() {
  const c = ctx.calcOf(), s = S[c.id];
  if (!s || !s.undo) return;
  ctx.state.vals[c.id] = s.undo.vals; ctx.state.mats[c.id] = s.undo.mat;
  s.undo = null;
  ctx.renderDetail();
  optOpen();
  const m = $("calcOptMsg"); if (m) m.textContent = "Teruggezet naar de waarden van vóór het toepassen.";
}
function copy() {
  const c = ctx.calcOf(), s = S[c.id];
  if (!s || !s.P) return;
  const b = buildInfo();
  const text = reportText(s.P, { date: dateText(), app: b.text });
  $("calcOptCopy").dataset.report = text;
  ctx.toClipboard(text).then(ok => { const m = $("calcOptMsg"); if (m) m.textContent = ok ? "Optimalisatierapport gekopieerd (" + text.split("\n").length + " regels)." : "Kopiëren geweigerd door de browser."; });
}

/* ---------- gebeurtenissen ---------- */
export function initCalcOpt(c) {
  ctx = c;
  const det = $("calcDetail");
  det.addEventListener("click", e => {
    const t = e.target;
    if (t.closest("#calcOpt")) { optOpen(); return; }
    if (t.closest("#optRun")) { start(); return; }
    if (t.closest("#optStop")) { const s = S[ctx.calcOf().id]; if (s && s.run) s.run.stop(); return; }
    if (t.closest("#calcOptApply")) { apply(); return; }
    if (t.closest("#calcOptUndo")) { undo(); return; }
    if (t.closest("#calcOptCopy")) { copy(); return; }
    const sb = t.closest("[data-sense]");
    if (sb) { const s = st(ctx.calcOf()); s.sense = sb.dataset.sense; $("optForm").innerHTML = formHtml(ctx.calcOf()); return; }
    if (t.closest("#optAddCon")) {
      const c = ctx.calcOf(), s = st(c), outs = outList(ctx.evalCalc(c, ctx.state.vals[c.id], null) || { o: { out: [] } });
      if (outs.length) s.cons.push({ out: outs[0].k, op: "le", val: plainNum(isFinite(outs[0].raw) ? outs[0].raw : 1), on: true });
      $("optForm").innerHTML = formHtml(c); return;
    }
    const del = t.closest("[data-cdel]");
    if (del) { const c = ctx.calcOf(), s = st(c); s.cons.splice(+del.dataset.cdel, 1); $("optForm").innerHTML = formHtml(c); return; }
  });
  const onField = e => {
    const t = e.target, c = ctx.calcOf();
    if (!$("optForm") || !$("optForm").contains(t)) return;
    const s = st(c);
    if (t.id === "optObj") { s.obj = t.value; return; }
    if (t.id === "optTarget") { s.target = t.value; return; }
    if (t.id === "optN") {
      const n = parse(t.value); s.n = n > 0 ? n : 1;
      return;
    }
    const ov = t.closest("[data-ov]");
    if (ov && t.dataset.vf) { const v = s.vars[ov.dataset.ov]; v[t.dataset.vf] = t.type === "checkbox" ? t.checked : t.value; return; }
    if (t.dataset.mat) { s.matOn[t.dataset.mat] = t.checked; return; }
    const cr = t.closest("[data-ci]");
    if (cr && t.dataset.cf) { const r = s.cons[+cr.dataset.ci]; r[t.dataset.cf] = t.type === "checkbox" ? t.checked : t.value; if (t.dataset.cf === "val") r.sig = r.sig && false; }
  };
  det.addEventListener("input", onField);
  det.addEventListener("change", onField);
}
export function optCancel() { Object.keys(S).forEach(k => { if (S[k].run) { S[k].run.cancel(); S[k].run = null; } }); }
