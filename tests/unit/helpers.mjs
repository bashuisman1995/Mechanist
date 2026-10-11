// Gedeelde hulpmiddelen voor de unit-tests van de solverkern.
import assert from "node:assert/strict";
import { model, sim, ui } from "../../src/core/state.js";

/** Controleert |actual - expected| <= atol + rtol*|expected| met een duidelijke melding. */
export function close(actual, expected, { rtol = 0, atol = 0, label = "" } = {}) {
  const tol = atol + rtol * Math.abs(expected);
  const err = Math.abs(actual - expected);
  assert.ok(Number.isFinite(actual) && err <= tol,
    `${label ? label + ": " : ""}verwacht ${expected}, kreeg ${actual} ` +
    `(afwijking ${err.toExponential(3)} > tolerantie ${tol.toExponential(3)}; rtol=${rtol}, atol=${atol})`);
}

/** Draait een generator tot het einde en geeft de returnwaarde terug. */
export function run(gen) {
  for (;;) { const r = gen.next(); if (r.done) return r.value; }
}

const DEFAULTS = structuredClone(Object.fromEntries(
  Object.entries(model).filter(([, v]) => !Array.isArray(v))));
const NODE0 = { support: "free", dir: 0, m: 0, mus: 0, muk: 0, rj: 0 };

/**
 * Leegt het gedeelde model en vult het met spec = {nodes, elems, ...modelinstellingen}.
 * Knopen: {id,x,y,...}; ax/ay (railanker) en name vallen terug op x/y en id.
 * Elementen krijgen een id "e<n>" als dat ontbreekt.
 */
export function resetModel(spec = {}) {
  const { nodes = [], elems = [], ...props } = spec;
  Object.assign(model, structuredClone(DEFAULTS), props);
  model.nodes = nodes.map(n => ({ ...NODE0, ax: n.x, ay: n.y, name: n.id, ...n }));
  model.elems = elems.map((e, i) => ({ id: "e" + (i + 1), ...e }));
  Object.assign(sim, { simT: 0, lenOv: null, solveOK: true, sweep: null, frfMsg: "", solved: null });
  sim.ALIAS.clear(); sim.ALIASN.clear();
  ui.sel = null;
  return model;
}
