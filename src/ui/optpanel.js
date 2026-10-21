// Optimaliseer: gedeelde onderdelen voor Calculators en Schets (uitleg, asynchroon rekenen, resultaatweergave, kopieertekst).
import { optimizeGen } from "../core/optimize.js";
import { MINUS, numStr } from "./format.js";
import { onLang, t } from "./i18n.js";

export const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const n3 = (v, d) => numStr(v, d || 3);
/** Procentuele verandering met teken: +2,9 of −2,9. */
export function pct(v) {
  if (!isFinite(v)) return "–";
  const a = Math.abs(v);
  return (v < 0 && a >= 0.05 ? MINUS : "+") + numStr(a < 0.05 ? 0 : a, a >= 10 ? 3 : 2, a < 10);
}

/**
 * Regel "+1 % L → −2,9 % c_x". items: [{label, pct, abs, base, ref, unit}]. Staat de waarde op het optimum (bijna) op nul ten opzichte van de
 * startwaarde ref, dan is een procent betekenisloos en volgt de absolute verandering.
 */
export function sensLine(varLabel, items) {
  const parts = items.map(it => {
    const tiny = !isFinite(it.pct) || Math.abs(it.base) < 1e-6 * Math.max(Math.abs(it.ref || 0), 1e-300);
    if (tiny) return (it.abs >= 0 ? "+" : MINUS) + numStr(Math.abs(it.abs), 2, false, Math.abs(it.ref || 0)) + (it.unit ? " " + it.unit : "") + " " + it.label;
    return pct(it.pct) + " % " + it.label;
  });
  return "+1 % " + varLabel + " \u2192 " + parts.join(", ");
}
// uitleg en methodetekst volgen de gekozen taal (live bindings: bij een taalwissel opnieuw opgebouwd)
const howHtml = () =>
  "<p><b>" + t("opt.how.h1") + "</b> " + t("opt.how.p1") + "</p>" +
  "<p><b>" + t("opt.how.h2") + "</b> " + t("opt.how.p2") + "</p>" +
  "<p><b>" + t("opt.how.h3") + "</b> " + t("opt.how.p3") + "</p>" +
  "<p><b>" + t("opt.how.h4") + "</b> " + t("opt.how.p4") + "</p>" +
  "<p class=\"opt-cav\"><b>" + t("opt.how.h5") + "</b> " + t("opt.how.p5") + "</p>";
const methodText = () => [1, 2, 3, 4, 5].map(k => t("opt.method." + k));
export let HOW_HTML = howHtml();
export let METHOD_TEXT = methodText();
onLang(() => { HOW_HTML = howHtml(); METHOD_TEXT = methodText(); });

/**
 * Draait optimizeGen in stukjes van enkele milliseconden per beeld, zodat de pagina bedienbaar blijft.
 * cb: { progress({evals, best}), done(result), error(err) }. Geeft { stop() } terug.
 */
export function runAsync(opts, cb) {
  let stopFlag = false, raf = 0, dead = false;
  const prog = { evals: 0, best: null };
  const o = Object.assign({}, opts, { shouldStop: () => stopFlag, onEval: (n, best) => { prog.evals = n; prog.best = best; } });
  const gen = optimizeGen(o);
  const tick = () => {
    raf = 0;
    if (dead) return;
    const t0 = performance.now();
    let r;
    try { do { r = gen.next(); } while (!r.done && performance.now() - t0 < 8); }
    catch (err) { cb.error(err); return; }
    if (r.done) { cb.done(r.value); return; }
    cb.progress(prog);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return { stop() { stopFlag = true; }, cancel() { dead = true; if (raf) cancelAnimationFrame(raf); } };
}

/** Convergentieplotje: beste toelaatbare doel (of |f − doel|) per evaluatie. */
export function convergenceSvg(history, sense, target) {
  const W = 300, H = 112, L = 40, R = 8, T = 8, B = 20;
  const val = f => (sense === "target" ? Math.abs(f - target) : f);
  const pts = [], raw = [];
  history.forEach((h, i) => {
    if (h.best != null && isFinite(h.best)) pts.push([i + 1, val(h.best)]);
    if (isFinite(h.f)) raw.push([i + 1, val(h.f), h.feasible]);
  });
  const N = Math.max(1, history.length);
  if (!pts.length) {
    return '<svg class="opt-plot" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(t("opt.conv.none")) + '"><text x="' + W / 2 + '" y="' + H / 2 + '" text-anchor="middle" class="opt-pt">' + esc(t("opt.conv.none")) + '</text></svg>';
  }
  let lo = Math.min.apply(null, pts.map(p => p[1])), hi = Math.max.apply(null, pts.map(p => p[1]));
  const useLog = lo > 0 && hi / lo > 30;
  const tr = v => (useLog ? Math.log10(v) : v);
  let a = tr(lo), b = tr(hi);
  if (!(b > a)) { b = a + (Math.abs(a) || 1) * 0.1; a -= (Math.abs(a) || 1) * 0.1; }
  const X = i => (L + (i - 1) / Math.max(1, N - 1) * (W - L - R)).toFixed(1);
  const Y = v => (T + (1 - (tr(v) - a) / (b - a)) * (H - T - B)).toFixed(1);
  let d = "", prev = null;
  pts.forEach(p => { if (prev !== null) d += "L" + X(p[0]) + " " + Y(prev); d += (d ? "L" : "M") + X(p[0]) + " " + Y(p[1]); prev = p[1]; });
  d += "L" + X(N) + " " + Y(prev);
  const dots = raw.filter((p, k) => k % Math.max(1, Math.floor(raw.length / 120)) === 0)
    .map(p => "<circle cx=\"" + X(p[0]) + "\" cy=\"" + Y(Math.min(Math.max(p[1], lo), hi)) + '" r="1.4" class="' + (p[2] ? "opt-dok" : "opt-dno") + '"/>').join("");
  return '<svg class="opt-plot" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(t("opt.conv.aria")) + '">' +
    '<line class="opt-ax" x1="' + L + '" y1="' + (H - B) + '" x2="' + (W - R) + '" y2="' + (H - B) + '"/><line class="opt-ax" x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + (H - B) + '"/>' +
    dots + '<path class="opt-ln" d="' + d + '"/>' +
    '<text class="opt-pt" x="' + (L - 4) + '" y="' + (T + 8) + '" text-anchor="end">' + esc(numStr(hi, 3, false, hi)) + '</text><text class="opt-pt" x="' + (L - 4) + '" y="' + (H - B) + '" text-anchor="end">' + esc(numStr(lo, 3, false, hi)) + "</text>" +
    '<text class="opt-pt" x="' + L + '" y="' + (H - 6) + '">1</text><text class="opt-pt" x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end">' + esc(t("opt.conv.evals", { n: N })) + (useLog ? " · log" : "") + "</text></svg>";
}

/**
 * Resultaatweergave. P: {
 *   id (voorvoegsel van de knop-id's), res (uitkomst van optimize), obj: {label, unit, sense, target, before, after},
 *   vars: [{label, unit, before, after, bound}], discrete: [{label, before, after}],
 *   outs: [{label, unit, before, after, role}], cons: [{label, active, after, unit}], sens: [{v, items: [{label, pct}]}],
 *   applied (bool), canApply (bool) }
 */
export function resultHtml(P) {
  const r = P.res, id = P.id;
  const inner = (r.reason.match(/^[^(]*\((.*)\)$/) || [0, r.reason])[1];
  const stat = r.feasible
    ? '<div class="opt-stat opt-ok" id="' + id + 'Stat">' + esc(t("opt.stat.ok", { n: r.evals, stopped: r.stopped ? t("opt.stat.stopped") : "", r: r.reason.replace(/ \(.*/, "") })) + "</div>"
    : '<div class="opt-stat opt-bad" id="' + id + 'Stat" role="alert">' + esc(t("opt.stat.bad", { n: r.evals, r: inner })) + "</div>";
  const chg = (a, b) => a !== b;
  let tb = '<table class="opt-tbl" id="' + id + 'Tbl"><thead><tr><th>' + esc(t("opt.th.input")) + '</th><th>' + esc(t("opt.th.before")) + '</th><th title="' + esc(t("opt.th.after.t")) + '">' + esc(t("opt.th.after")) + '</th></tr></thead><tbody>';
  P.vars.forEach(v => {
    tb += "<tr" + (v.opt ? ' class="opt-chg"' : "") + "><td>" + esc(v.label) + '</td><td class="n">' + esc(n3(v.before)) + "</td><td class=\"n\" data-raw=\"" + v.after + "\" data-id=\"" + esc(v.id || "") + "\"><b>" + esc(n3(v.after)) + "</b> " + esc(v.unit || "") +
      (v.bound ? ' <span class="opt-tag" title="' + esc(t("opt.tag.bound.t")) + '">' + (v.bound === "min" ? "min" : "max") + "</span>" : "") + "</td></tr>";
  });
  P.discrete.forEach(d => { tb += '<tr class="opt-chg"><td>' + esc(d.label) + '</td><td class="n">' + esc(d.before) + '</td><td class="n"><b>' + esc(d.after) + "</b></td></tr>"; });
  tb += "</tbody></table>";
  let o = '<table class="opt-tbl" id="' + id + 'Out"><thead><tr><th>' + esc(t("opt.th.output")) + '</th><th>' + esc(t("opt.th.before")) + '</th><th title="' + esc(t("opt.th.after.t")) + '">' + esc(t("opt.th.after")) + '</th></tr></thead><tbody>';
  P.outs.forEach(x => {
    o += "<tr" + (x.role ? ' class="opt-' + x.role + '"' : "") + "><td>" + esc(x.label) + (x.role === "doel" ? ' <span class="opt-tag">' + esc(t("opt.tag.obj")) + "</span>" : x.role === "rand" ? ' <span class="opt-tag">' + esc(t("opt.tag.con")) + "</span>" : "") +
      '</td><td class="n">' + esc(x.before) + '</td><td class="n" data-raw="' + (x.afterRaw != null ? x.afterRaw : "") + '"><b>' + esc(x.after) + "</b> " + esc(x.unit || "") + "</td></tr>";
  });
  o += "</tbody></table>";
  let act = "";
  if (P.cons.length) {
    act = '<div class="opt-act" id="' + id + 'Act"><b>' + esc(t("opt.act.h")) + '</b> ' + esc(t("opt.act.sub")) + ' ' +
      (P.cons.filter(c => c.active).length ? P.cons.filter(c => c.active).map(c => "<span class=\"opt-tag opt-on\">" + esc(c.label) + "</span>").join(" ") : esc(t("opt.act.none"))) +
      (P.bounds.length ? "<br><b>" + esc(t("opt.act.bounds")) + "</b> " + P.bounds.map(b => '<span class="opt-tag">' + esc(b) + "</span>").join(" ") : "") + "</div>";
  } else if (P.bounds.length) {
    act = '<div class="opt-act" id="' + id + 'Act"><b>' + esc(t("opt.act.bounds")) + '</b> ' + P.bounds.map(b => '<span class="opt-tag">' + esc(b) + "</span>").join(" ") + "</div>";
  } else act = '<div class="opt-act" id="' + id + 'Act">' + esc(t("opt.act.interior")) + "</div>";
  let s = "";
  if (P.sens && P.sens.length) {
    s = '<div class="opt-sens" id="' + id + 'Sens"><b>' + esc(t("opt.sens.h")) + '</b>' + P.sens.map(x => "<div>" + esc(x.line) + "</div>").join("") + "</div>";
  }
  let combos = "";
  if (P.combos && P.combos.length > 1) {
    combos = '<details class="opt-more"><summary>' + esc(t("opt.combos.h")) + '</summary><table class="opt-tbl"><thead><tr><th>' + esc(t("opt.combos.choice")) + '</th><th>' + esc(t("opt.combos.obj")) + '</th><th>' + esc(t("opt.combos.feas")) + '</th></tr></thead><tbody>' +
      P.combos.map(c => "<tr><td>" + esc(c.label) + '</td><td class="n">' + esc(c.f) + "</td><td>" + esc(c.feasible ? t("opt.yes") : t("opt.no")) + "</td></tr>").join("") + "</tbody></table></details>";
  }
  return stat + tb + o + act + '<div class="opt-plotbox"><div class="opt-h">' + esc(t("opt.conv.h")) + '</div>' + convergenceSvg(r.history, P.obj.sense, P.obj.target) + "</div>" + s + combos +
    '<div class="opt-btns"><button type="button" class="btn primary" id="' + id + 'Apply"' + (P.canApply ? "" : " disabled") + ">" + esc(t("opt.apply")) + "</button>" +
    '<button type="button" class="btn" id="' + id + 'Undo"' + (P.applied ? "" : " hidden") + ">" + esc(t("opt.undo")) + "</button>" +
    '<button type="button" class="btn" id="' + id + 'Copy">' + esc(t("opt.copy")) + '</button></div>' +
    '<div class="opt-msg" id="' + id + 'Msg" role="status" aria-live="polite"></div>';
}

/** Platte-tekstrapport van een optimalisatie. */
export function reportText(P, meta) {
  const r = P.res, L = [];
  const senseTxt = P.obj.sense === "max" ? t("opt.rt.max") : P.obj.sense === "min" ? t("opt.rt.min") : t("opt.rt.target", { v: n3(P.obj.target) });
  L.push(t("opt.rt.title", { title: P.title }));
  L.push(t("opt.rt.date", { date: meta.date, app: meta.app }));
  L.push("", t("opt.rt.def"));
  L.push("  " + t("opt.rt.obj", { s: senseTxt, label: P.obj.label }) + (P.obj.unit ? " [" + P.obj.unit + "]" : ""));
  L.push("  " + t("opt.rt.vars"));
  P.defVars.forEach(v => L.push("    " + v.label + " " + t("opt.rt.in") + " [" + n3(v.min) + "; " + n3(v.max) + "]" + (v.unit ? " " + v.unit : "") + (v.log ? " " + t("opt.rt.log") : "") + ", " + t("opt.rt.start") + " " + n3(v.x0)));
  P.discrete.forEach(d => L.push("    " + d.label + " " + t("opt.rt.from") + " " + d.options));
  L.push("  " + t("opt.rt.cons") + (P.defCons.length ? "" : " " + t("opt.rt.none")));
  P.defCons.forEach(c => L.push("    " + c));
  L.push("", t("opt.rt.method"));
  METHOD_TEXT.forEach(m => L.push("  - " + m));
  if (P.extra) P.extra.forEach(m => L.push("  - " + m));
  L.push("", t("opt.rt.result"));
  L.push("  " + t("opt.rt.status") + " " + (r.feasible ? t("opt.rt.feas") : t("opt.rt.infeas")) + " · " + t("opt.conv.evals", { n: r.evals }) + " · " + r.reason);
  L.push("  " + t("opt.rt.objval") + " " + P.obj.beforeTxt + " → " + P.obj.afterTxt + (P.obj.unit ? " " + P.obj.unit : ""));
  L.push("  " + t("opt.rt.inputs"));
  P.vars.forEach(v => L.push("    " + v.label + " = " + n3(v.before) + " → " + n3(v.after) + (v.unit ? " " + v.unit : "") + (v.bound ? " (" + t("opt.rt.atbound", { b: v.bound }) + ")" : "")));
  P.discrete.forEach(d => { if (d.after != null) L.push("    " + d.label + ": " + d.before + " → " + d.after); });
  L.push("  " + t("opt.rt.outputs"));
  P.outs.forEach(x => L.push("    " + x.label + " = " + x.before + " → " + x.after + (x.unit ? " " + x.unit : "") + (x.role === "doel" ? "  [" + t("opt.tag.obj") + "]" : x.role === "rand" ? "  [" + t("opt.tag.con") + "]" : "")));
  const act = P.cons.filter(c => c.active).map(c => c.label);
  L.push("  " + t("opt.rt.active") + " " + (act.length ? act.join("; ") : t("opt.rt.none")));
  if (P.bounds.length) L.push("  " + t("opt.act.bounds") + " " + P.bounds.join("; "));
  if (P.sens && P.sens.length) { L.push("  " + t("opt.rt.sens")); P.sens.forEach(x => L.push("    " + x.line)); }
  L.push("", t("opt.rt.hist"));
  const h = r.history, firstF = h.findIndex(x => x.feasible);
  L.push("  " + t("opt.rt.hline", { n: h.length, first: firstF >= 0 ? "#" + (firstF + 1) : t("opt.rt.nofirst") }));
  if (h.length) {
    const val = x => (x.best != null ? n3(x.best) : "–");
    const marks = [0, 0.1, 0.25, 0.5, 0.75, 1].map(q => Math.min(h.length - 1, Math.max(0, Math.round(q * (h.length - 1)))));
    const seen = {};
    L.push("  " + t("opt.rt.best") + " " + marks.filter(m => !seen[m] && (seen[m] = 1)).map(m => "#" + (m + 1) + ": " + val(h[m])).join(" · "));
  }
  L.push("", t("opt.rt.caveat"));
  return L.join("\n");
}
