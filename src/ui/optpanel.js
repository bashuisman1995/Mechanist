// Optimaliseer: gedeelde onderdelen voor Calculators en Schets (uitleg, asynchroon rekenen, resultaatweergave, kopieertekst).
import { optimizeGen } from "../core/optimize.js";
import { MINUS, numStr } from "./format.js";

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
export const HOW_HTML =
  "<p><b>Methode.</b> Elke variabele wordt naar t in [0, 1] afgebeeld (lineair, of logaritmisch als de waarde meerdere decaden beslaat), zodat de grenzen hard zijn. " +
  "Eén variabele: een rooster van 21 punten en daarna gulden snede. Twee of meer: Nelder–Mead zonder afgeleiden (reflectie 1, uitrekking 2, inkrimping 0,5), " +
  "vanuit de huidige waarden en drie Latin-hypercube-starts met een vaste zaadwaarde, dus herhaalbaar. Een materiaalkeuze wordt opgesomd: elke combinatie krijgt een eigen optimalisatie.</p>" +
  "<p><b>Randvoorwaarden.</b> Een uitkomst die een grens overschrijdt, krijgt een gladde uitwendige straf: " +
  "φ = f/f₀ + μ·Σ max(0, g + δ)², met g de relatieve overschrijding en μ in vier trappen oplopend van 10² tot 10⁸. " +
  "De schuif δ = 10⁻⁷ legt het eindpunt net aan de toelaatbare kant. Daarna volgt een harde controle (g ≤ 10⁻⁹): alleen zo’n punt telt als toelaatbaar. " +
  "Een randvoorwaarde met g binnen 0,1 % van de grens heet <i>actief</i>: die begrenst het optimum.</p>" +
  "<p><b>Stoppen.</b> Bij tolerantie (simplex kleiner dan 10⁻⁹ en φ-spreiding onder 10⁻¹²), bij het maximum aantal evaluaties, of met Stop. " +
  "Elke evaluatie staat in de geschiedenis; het convergentieplotje toont het beste toelaatbare doel per evaluatie.</p>" +
  "<p><b>Gevoeligheid.</b> Eindige verschillen op het optimum: de relatieve verandering van het doel en van de begrensde uitkomsten bij +1 % van elke variabele.</p>" +
  "<p class=\"opt-cav\"><b>Let op: lokaal optimum mogelijk; controleer.</b> Meerdere starts verkleinen de kans op een slecht lokaal minimum maar bewijzen niets. " +
  "Controleer het resultaat met de formules, een handberekening of een tweede run met andere grenzen.</p>";

export const METHOD_TEXT = [
  "Nelder–Mead zonder afgeleiden op variabelen afgebeeld naar [0, 1] (log of lineair); één variabele: rooster + gulden snede.",
  "Randvoorwaarden g ≤ 0 via gladde uitwendige straf φ = f/f₀ + μ·Σ max(0, g + δ)² (μ = 1e2, 1e4, 1e6, 1e8; δ = 1e-7) met een harde eindcontrole g ≤ 1e-9.",
  "Start vanuit de huidige waarden plus drie Latin-hypercube-starts (vaste zaadwaarde); discrete keuzes worden opgesomd.",
  "Stoppen bij tolerantie (simplex < 1e-9), maximum aantal evaluaties of op verzoek.",
  "Lokaal optimum mogelijk; controleer het resultaat."
];

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
    return '<svg class="opt-plot" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Convergentie: geen toelaatbaar punt gevonden"><text x="' + W / 2 + '" y="' + H / 2 + '" text-anchor="middle" class="opt-pt">geen toelaatbaar punt gevonden</text></svg>';
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
  return '<svg class="opt-plot" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Convergentie: beste doel tegen het aantal evaluaties">' +
    '<line class="opt-ax" x1="' + L + '" y1="' + (H - B) + '" x2="' + (W - R) + '" y2="' + (H - B) + '"/><line class="opt-ax" x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + (H - B) + '"/>' +
    dots + '<path class="opt-ln" d="' + d + '"/>' +
    '<text class="opt-pt" x="' + (L - 4) + '" y="' + (T + 8) + '" text-anchor="end">' + esc(numStr(hi, 3, false, hi)) + '</text><text class="opt-pt" x="' + (L - 4) + '" y="' + (H - B) + '" text-anchor="end">' + esc(numStr(lo, 3, false, hi)) + "</text>" +
    '<text class="opt-pt" x="' + L + '" y="' + (H - 6) + '">1</text><text class="opt-pt" x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end">' + N + ' evaluaties' + (useLog ? " · log" : "") + "</text></svg>";
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
  const stat = r.feasible
    ? '<div class="opt-stat opt-ok" id="' + id + 'Stat">Toelaatbaar optimum na ' + r.evals + " evaluaties" + (r.stopped ? " (gestopt)" : "") + ". Reden van stoppen: " + esc(r.reason.replace(/ \(.*/, "")) + ".</div>"
    : '<div class="opt-stat opt-bad" id="' + id + 'Stat" role="alert">Geen toelaatbare oplossing gevonden binnen de grenzen (' + r.evals + " evaluaties, " + esc(r.reason.replace(/^geen toelaatbare oplossing gevonden \(/, "").replace(/\)$/, "")) + "). Verruim een grens of een randvoorwaarde. Hieronder het punt met de kleinste overschrijding.</div>";
  const chg = (a, b) => a !== b;
  let t = '<table class="opt-tbl" id="' + id + 'Tbl"><thead><tr><th>Invoer</th><th>Voor</th><th title="Wijs een waarde in deze kolom aan: de tekening toont dan het optimum">Na</th></tr></thead><tbody>';
  P.vars.forEach(v => {
    t += "<tr" + (v.opt ? ' class="opt-chg"' : "") + "><td>" + esc(v.label) + '</td><td class="n">' + esc(n3(v.before)) + "</td><td class=\"n\" data-raw=\"" + v.after + "\" data-id=\"" + esc(v.id || "") + "\"><b>" + esc(n3(v.after)) + "</b> " + esc(v.unit || "") +
      (v.bound ? ' <span class="opt-tag" title="Op de grens van het toegestane bereik">' + (v.bound === "min" ? "min" : "max") + "</span>" : "") + "</td></tr>";
  });
  P.discrete.forEach(d => { t += '<tr class="opt-chg"><td>' + esc(d.label) + '</td><td class="n">' + esc(d.before) + '</td><td class="n"><b>' + esc(d.after) + "</b></td></tr>"; });
  t += "</tbody></table>";
  let o = '<table class="opt-tbl" id="' + id + 'Out"><thead><tr><th>Uitkomst</th><th>Voor</th><th title="Wijs een waarde in deze kolom aan: de tekening toont dan het optimum">Na</th></tr></thead><tbody>';
  P.outs.forEach(x => {
    o += "<tr" + (x.role ? ' class="opt-' + x.role + '"' : "") + "><td>" + esc(x.label) + (x.role === "doel" ? ' <span class="opt-tag">doel</span>' : x.role === "rand" ? ' <span class="opt-tag">rand</span>' : "") +
      '</td><td class="n">' + esc(x.before) + '</td><td class="n" data-raw="' + (x.afterRaw != null ? x.afterRaw : "") + '"><b>' + esc(x.after) + "</b> " + esc(x.unit || "") + "</td></tr>";
  });
  o += "</tbody></table>";
  let act = "";
  if (P.cons.length) {
    act = '<div class="opt-act" id="' + id + 'Act"><b>Actieve randvoorwaarden</b> (begrenzen het optimum): ' +
      (P.cons.filter(c => c.active).length ? P.cons.filter(c => c.active).map(c => "<span class=\"opt-tag opt-on\">" + esc(c.label) + "</span>").join(" ") : "geen, het optimum ligt binnen alle randvoorwaarden") +
      (P.bounds.length ? "<br><b>Variabelen op hun grens:</b> " + P.bounds.map(b => '<span class="opt-tag">' + esc(b) + "</span>").join(" ") : "") + "</div>";
  } else if (P.bounds.length) {
    act = '<div class="opt-act" id="' + id + 'Act"><b>Variabelen op hun grens:</b> ' + P.bounds.map(b => '<span class="opt-tag">' + esc(b) + "</span>").join(" ") + "</div>";
  } else act = '<div class="opt-act" id="' + id + 'Act">Geen randvoorwaarde of grens is actief: een inwendig optimum.</div>';
  let s = "";
  if (P.sens && P.sens.length) {
    s = '<div class="opt-sens" id="' + id + 'Sens"><b>Gevoeligheid op het optimum</b>' + P.sens.map(x => "<div>" + esc(x.line) + "</div>").join("") + "</div>";
  }
  let combos = "";
  if (P.combos && P.combos.length > 1) {
    combos = '<details class="opt-more"><summary>Alle materialen</summary><table class="opt-tbl"><thead><tr><th>Keuze</th><th>Doel</th><th>Toelaatbaar</th></tr></thead><tbody>' +
      P.combos.map(c => "<tr><td>" + esc(c.label) + '</td><td class="n">' + esc(c.f) + "</td><td>" + (c.feasible ? "ja" : "nee") + "</td></tr>").join("") + "</tbody></table></details>";
  }
  return stat + t + o + act + '<div class="opt-plotbox"><div class="opt-h">Convergentie</div>' + convergenceSvg(r.history, P.obj.sense, P.obj.target) + "</div>" + s + combos +
    '<div class="opt-btns"><button type="button" class="btn primary" id="' + id + 'Apply"' + (P.canApply ? "" : " disabled") + ">Toepassen</button>" +
    '<button type="button" class="btn" id="' + id + 'Undo"' + (P.applied ? "" : " hidden") + ">Terug</button>" +
    '<button type="button" class="btn" id="' + id + 'Copy">Kopieer</button></div>' +
    '<div class="opt-msg" id="' + id + 'Msg" role="status" aria-live="polite"></div>';
}

/** Platte-tekstrapport van een optimalisatie. */
export function reportText(P, meta) {
  const r = P.res, L = [];
  const senseTxt = P.obj.sense === "max" ? "maximaliseer" : P.obj.sense === "min" ? "minimaliseer" : "bereik waarde " + n3(P.obj.target) + " voor";
  L.push("Mechanist optimalisatie: " + P.title);
  L.push("Datum: " + meta.date + " · app " + meta.app);
  L.push("", "PROBLEEMDEFINITIE");
  L.push("  Doel: " + senseTxt + " " + P.obj.label + (P.obj.unit ? " [" + P.obj.unit + "]" : ""));
  L.push("  Variabelen:");
  P.defVars.forEach(v => L.push("    " + v.label + " in [" + n3(v.min) + "; " + n3(v.max) + "]" + (v.unit ? " " + v.unit : "") + (v.log ? " (logaritmisch)" : "") + ", start " + n3(v.x0)));
  P.discrete.forEach(d => L.push("    " + d.label + " uit: " + d.options));
  L.push("  Randvoorwaarden:" + (P.defCons.length ? "" : " geen"));
  P.defCons.forEach(c => L.push("    " + c));
  L.push("", "METHODE");
  METHOD_TEXT.forEach(m => L.push("  - " + m));
  if (P.extra) P.extra.forEach(m => L.push("  - " + m));
  L.push("", "RESULTAAT");
  L.push("  Status: " + (r.feasible ? "toelaatbaar" : "NIET toelaatbaar") + " · " + r.evals + " evaluaties · " + r.reason);
  L.push("  Doelwaarde: " + P.obj.beforeTxt + " → " + P.obj.afterTxt + (P.obj.unit ? " " + P.obj.unit : ""));
  L.push("  Invoer (voor → na):");
  P.vars.forEach(v => L.push("    " + v.label + " = " + n3(v.before) + " → " + n3(v.after) + (v.unit ? " " + v.unit : "") + (v.bound ? " (op " + v.bound + "-grens)" : "")));
  P.discrete.forEach(d => { if (d.after != null) L.push("    " + d.label + ": " + d.before + " → " + d.after); });
  L.push("  Uitkomsten (voor → na):");
  P.outs.forEach(x => L.push("    " + x.label + " = " + x.before + " → " + x.after + (x.unit ? " " + x.unit : "") + (x.role === "doel" ? "  [doel]" : x.role === "rand" ? "  [randvoorwaarde]" : "")));
  const act = P.cons.filter(c => c.active).map(c => c.label);
  L.push("  Actieve randvoorwaarden: " + (act.length ? act.join("; ") : "geen"));
  if (P.bounds.length) L.push("  Variabelen op hun grens: " + P.bounds.join("; "));
  if (P.sens && P.sens.length) { L.push("  Gevoeligheid (eindige verschillen):"); P.sens.forEach(x => L.push("    " + x.line)); }
  L.push("", "VERLOOP");
  const h = r.history, firstF = h.findIndex(x => x.feasible);
  L.push("  " + h.length + " evaluaties; eerste toelaatbare punt: " + (firstF >= 0 ? "#" + (firstF + 1) : "geen") + ".");
  if (h.length) {
    const val = x => (x.best != null ? n3(x.best) : "–");
    const marks = [0, 0.1, 0.25, 0.5, 0.75, 1].map(q => Math.min(h.length - 1, Math.max(0, Math.round(q * (h.length - 1)))));
    const seen = {};
    L.push("  Beste toelaatbare doel per evaluatie: " + marks.filter(m => !seen[m] && (seen[m] = 1)).map(m => "#" + (m + 1) + ": " + val(h[m])).join(" · "));
  }
  L.push("", "Let op: lokaal optimum mogelijk; controleer het resultaat met een handberekening of een tweede run met andere grenzen.");
  return L.join("\n");
}
