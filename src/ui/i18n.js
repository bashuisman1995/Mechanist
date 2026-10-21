// Taallaag: t(sleutel, parameters) met woordenboeken en (standaard) en nl. Geen DOM nodig bij het importeren (draait ook in Node).
// De woordenboeken staan in src/ui/lang/*.js als { sleutel: [Engelse tekst, Nederlandse tekst] }.
// Parameters staan als {naam} in de tekst. De keuze wordt onthouden in localStorage; standaard is Engels, ongeacht de browsertaal.
import DICT_UI from "./lang/ui.js";
import DICT_INSPECTOR from "./lang/inspector.js";
import DICT_HOW from "./lang/how.js";
import DICT_CALC from "./lang/calc.js";
import DICT_CORE from "./lang/core.js";
import DICT_EXAMPLES from "./lang/examples.js";
import DICT_REPORT from "./lang/report.js";

export const LANGS = ["en", "nl"];
export const LANG_KEY = "mechschets.lang";
export const DICTS = { en: {}, nl: {} };
[DICT_UI, DICT_INSPECTOR, DICT_HOW, DICT_CALC, DICT_CORE, DICT_EXAMPLES, DICT_REPORT].forEach(d => {
  Object.keys(d).forEach(k => {
    if (DICTS.en[k] !== undefined) throw new Error("dubbele vertaalsleutel: " + k);
    DICTS.en[k] = d[k][0]; DICTS.nl[k] = d[k][1];
  });
});

let cur = "en";
try { const s = localStorage.getItem(LANG_KEY); if (s === "en" || s === "nl") cur = s; } catch (_) {}
const listeners = [];

export const lang = () => cur;
export const isNl = () => cur === "nl";
export function onLang(fn) { listeners.push(fn); }

// vertaal een sleutel; ontbrekende sleutels vallen terug op Engels en dan op de sleutel zelf
export function t(key, p) {
  let s = DICTS[cur][key];
  if (s === undefined) s = DICTS.en[key];
  if (s === undefined) { s = key; if (typeof console !== "undefined") console.warn("vertaling ontbreekt: " + key); }
  if (p) s = s.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined && p[k] !== null ? String(p[k]) : m));
  return s;
}
export const has = key => DICTS.en[key] !== undefined;

// statische tekst in de HTML: data-i18n (innerHTML), data-i18n-title, data-i18n-aria, data-i18n-ph
export function applyStatic(root) {
  if (typeof document === "undefined") return;
  const r = root || document;
  r.querySelectorAll("[data-i18n]").forEach(e => { e.innerHTML = t(e.getAttribute("data-i18n")); });
  r.querySelectorAll("[data-i18n-title]").forEach(e => { e.title = t(e.getAttribute("data-i18n-title")); });
  r.querySelectorAll("[data-i18n-aria]").forEach(e => { e.setAttribute("aria-label", t(e.getAttribute("data-i18n-aria"))); });
  r.querySelectorAll("[data-i18n-ph]").forEach(e => { e.setAttribute("placeholder", t(e.getAttribute("data-i18n-ph"))); });
  if (!root) {
    document.documentElement.lang = cur;
    document.querySelectorAll("#langSeg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lang === cur)));
  }
}

export function setLang(l, silent) {
  if (l !== "en" && l !== "nl") return;
  const changedLang = l !== cur;
  cur = l;
  try { localStorage.setItem(LANG_KEY, l); } catch (_) {}
  if (typeof document !== "undefined") applyStatic();
  if (changedLang && !silent) listeners.forEach(fn => { try { fn(l); } catch (e) { console.error(e); } });
}
// getal uit een invoerveld: komma of punt als decimaalteken, spaties (ook dunne) als duizendtalscheiding
export function parseNum(s) {
  if (typeof s === "number") return s;
  let x = String(s === undefined || s === null ? "" : s).replace(/[\s  ]/g, "").replace(/−/g, "-");
  if (x === "") return NaN;
  const lc = x.lastIndexOf(","), ld = x.lastIndexOf(".");
  if (lc >= 0 && ld >= 0) {                              // beide: het laatste is het decimaalteken
    x = lc > ld ? x.replace(/\./g, "").replace(",", ".") : x.replace(/,/g, "");
  } else if (lc >= 0) x = x.replace(",", ".");
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(x) ? parseFloat(x) : NaN;
}
