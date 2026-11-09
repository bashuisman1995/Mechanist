// "Open in Schets": bouwt het equivalente parametrische model van een calculator (src/calc/sketchspec.js), laadt het via dezelfde weg als de
// voorbeelden (examples.js build), kiest de passende modus en toont een uitleg-kaart met de gebruikte waarden en het verwachte resultaat.
import { SKETCHABLE, sketchSpec } from "../calc/sketchspec.js";
import { eid, model } from "../core/state.js";
import { build } from "./examples.js";
import { markClean, setName, whenDiscarded } from "./files.js";
import { numStr } from "./format.js";
import { t } from "./i18n.js";
import { uitlegMin } from "./library.js";
import { setModeUI } from "./options.js";
import { changed, solveNow } from "./solver.js";

export { SKETCHABLE };
const num = (x, n) => numStr(x, n || 3);
const NODE_KEYS = ["clamp", "m", "joint", "kth"];

// regels van de uitleg-kaart: [sleutel, eenheid] per verwachte grootheid
const UNITS = { k: "N/mm", kth: "N·mm/rad", u: "mm", sig: "MPa", kax: "N/mm", phi: "°", Fn: "N", delta: "µm", deltaCalc: "µm", kn: "N/mm", a: "µm", N: "N",
  kt: "N/µm", xslip: "nm", fn: "Hz", zeta: "%", peak: "", T: "", fiso: "Hz", dP: "µm", d1: "µm", d2: "µm" };
const MODE_KEY = { stiff: "mode.stiff", frf: "mode.frf", dyn: "mode.dyn", equil: "mode.equil", kin: "mode.kin" };

function cardText(id, S, p) {
  const lines = [t("calc.sk.intro." + id, { v: Object.keys(p).filter(k => typeof p[k] === "number").map(k => k + " = " + num(p[k])).join(", ") })];
  lines.push(t("calc.sk.mode", { m: t(MODE_KEY[S.model.mode]) }));
  const ex = S.expect.map(e => t("calc.sk.x." + e.k) + " = " + num(e.v) + (UNITS[e.k] ? " " + UNITS[e.k] : "")).join("; ");
  lines.push(t("calc.sk.expect", { x: ex }));
  if (S.mapped) lines.push(t("calc.sk.mapped"));
  lines.push(t("calc.sk.where." + id));
  return lines.join(" ");
}

export function openInSketch(id, p, r, M, ctx) {
  if (!SKETCHABLE[id]) return;
  const S = sketchSpec(id, p, r, M, ctx);
  const nodes = S.nodes.map(n => [n.name, n.x, n.y, n.support, n.dir]);
  const elems = [];
  S.elems.forEach(e => {
    if (e.type === "force") elems.push(["force", e.node, e.mag, e.ang]);
    else if (e.type !== "contact") { const x = Object.assign({}, e); delete x.type; delete x.a; delete x.b; elems.push([e.type, e.a, e.b, x]); }
  });
  whenDiscarded(() => {
    build(nodes, elems, g => {
      S.nodes.forEach(n => { const nd = g(n.name); NODE_KEYS.forEach(k => { if (n[k] !== undefined) nd[k] = n[k]; }); });
      S.elems.forEach(e => { if (e.type === "contact") model.elems.push(Object.assign({ id: eid() }, e, { node: g(e.node).id })); });
      const nth = (type, k) => model.elems.filter(e => e.type === type)[k];
      const ref = s => { const m = /^(\w+)#(\d+)$/.exec(s); if (m) { const e = nth(m[1], +m[2]); return e ? e.id : ""; } const nd = g(s); return nd ? nd.id : s; };
      const M2 = S.model;
      ["gravity", "dT", "cVisc", "maxT", "dtStep", "simDur"].forEach(k => { if (M2[k] !== undefined) model[k] = M2[k]; });
      const gc = document.getElementById("gravChk"); if (gc) gc.checked = !!model.gravity;
      if (M2.thermNode) model.thermNode = ref(M2.thermNode);
      if (M2.stiffNode) { model.stiffNode = ref(M2.stiffNode); model.stiffAng = M2.stiffAng; }
      if (M2.frfIn) model.frfIn = ref(M2.frfIn);
      model.series = S.series.map(s => ({ key: s[0] + "|" + ref(s[1]) + "|" + s[2] }));
      if (M2.mode === "equil") { model.durMode = "equil"; setModeUI("dyn"); }
      else setModeUI(M2.mode);
    });
    setName(ctx && ctx.name ? ctx.name + " (calculator)" : "Calculator");
    markClean();
    if (ctx && ctx.goSketch) ctx.goSketch();
    const el = document.getElementById("uitleg");
    document.getElementById("uitTitle").textContent = t("calc.sk.title", { n: (ctx && ctx.name) || "" });
    document.getElementById("uitText").textContent = cardText(id, S, p);
    el.hidden = false; el.classList.remove("min");
    setTimeout(() => uitlegMin(true), 30000);
  });
}
