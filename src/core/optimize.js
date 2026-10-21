import { t } from "../ui/i18n.js";
// Optimalisatie zonder afgeleiden (zonder DOM).
//
// Methode, zodat elke stap te volgen is:
//  1. Elke variabele wordt naar t in [0,1] afgebeeld (lineair, of logaritmisch voor grootheden over meerdere
//     decaden). De grenzen zijn dus altijd hard: een voorgestelde t buiten [0,1] wordt op de rand gezet.
//  2. Doel: "min" (kleinste f), "max" (grootste f) of "target" (kleinste |f - doel|). Intern wordt altijd een
//     verdienste m geminimaliseerd en op de schaal van het beginpunt gebracht.
//  3. Randvoorwaarden g(x) <= 0 gaan mee als gladde uitwendige straf: phi = m/schaal + mu * som(max(0, g + delta)^2).
//     mu loopt in vier trappen op (1e2, 1e4, 1e6, 1e8); delta (1e-7) schuift de straf iets naar binnen zodat het
//     eindpunt echt aan de toelaatbare kant ligt. Daarna volgt altijd een harde controle g <= 1e-9: alleen zo'n
//     punt telt als toelaatbaar.
//  4. Eén variabele: een rooster van 21 punten en daarna gulden snede in het beste interval.
//     Twee of meer: Nelder-Mead (reflectie 1, uitrekking 2, inkrimping 0,5) met herstart per trap,
//     vanuit het beginpunt en enkele Latin-hypercube-starts (vaste zaadwaarde, dus herhaalbaar).
//  5. Discrete keuzes (bijv. materiaal) worden opgesomd: elke combinatie krijgt een eigen doorlooptijd en de
//     beste toelaatbare wint.
//  6. Stoppen bij tolerantie (simplex kleiner dan 1e-9 en phi-spreiding < 1e-12), bij het maximum aantal
//     evaluaties of op verzoek. De geschiedenis bevat elke evaluatie: x, doel, randvoorwaarden en toelaatbaarheid.
// Het resultaat is een lokaal optimum van deze startpunten; controleer het altijd.

const FEAS = 1e-9;          // g <= FEAS telt als toelaatbaar
const DELTA = 1e-7;         // interieure verschuiving in de strafterm
const MUS = [1e2, 1e4, 1e6, 1e8];
const BIG = 1e30;

function rng(seed) {                    // mulberry32: klein, herhaalbaar
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Latin-hypercube-punten in [0,1]^n. */
export function lhs(n, k, seed) {
  const r = rng(seed || 1), pts = [];
  for (let i = 0; i < k; i++) pts.push(new Array(n));
  for (let d = 0; d < n; d++) {
    const perm = Array.from({ length: k }, (_, i) => i);
    for (let i = k - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (let i = 0; i < k; i++) pts[i][d] = (perm[i] + r()) / k;
  }
  return pts;
}

const clamp01 = t => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * Generator-vorm: elke evaluatie geeft de controle terug (yield), zodat een UI in stukjes kan rekenen.
 * Opties: vars [{name,min,max,log,x0}], objective(x,d), constraints [{name,label,g(x,d),scale}],
 *   sense 'min'|'max'|'target', target, maxEval, starts, seed, discrete [{name,options}], shouldStop().
 * Geeft via return het resultaat (zie optimize).
 */
export function* optimizeGen(opts) {
  const vars = opts.vars || [], n = vars.length;
  const cons = opts.constraints || [];
  const sense = opts.sense || "min", target = opts.target || 0;
  const maxEval = Math.max(10, opts.maxEval || 2000);
  const nStarts = opts.starts != null ? opts.starts : (n >= 2 ? 3 : 0);
  const seed = opts.seed || 1;
  const disc = opts.discrete || [];
  const history = [];
  const st = { evals: 0, stop: false, reason: "" };
  let bestRaw = null, scale = 0, bestMerit = Infinity;     // bestMerit: beste toelaatbare verdienste tot nu toe

  vars.forEach(v => {
    if (!(v.max > v.min)) throw new Error(t("opt.e.range", { n: v.name }));
    if (v.log && !(v.min > 0)) throw new Error(t("opt.e.log", { n: v.name }));
  });
  const toReal = (t, i) => { const v = vars[i]; return v.log ? v.min * Math.pow(v.max / v.min, t) : v.min + t * (v.max - v.min); };
  const toUnit = (x, i) => { const v = vars[i]; const t = v.log ? Math.log(x / v.min) / Math.log(v.max / v.min) : (x - v.min) / (v.max - v.min); return clamp01(isFinite(t) ? t : 0.5); };
  const merit = f => (sense === "max" ? -f : sense === "target" ? Math.abs(f - target) : f);

  // combinaties van discrete keuzes
  let combos = [[]];
  disc.forEach(dv => {
    const next = [];
    combos.forEach(c => dv.options.forEach(o => next.push(c.concat([o]))));
    combos = next;
  });
  if (combos.length > 200) combos = combos.slice(0, 200);

  let cache = new Map(), curCombo = 0, curD = [];
  // één evaluatie op t-vector; geeft {f, m, gs, viol, feas}
  function evalAt(tv) {
    const t = tv.map(clamp01);
    const key = curCombo + "|" + t.map(v => v.toPrecision(13)).join(",");
    const hit = cache.get(key);
    if (hit) return hit;
    const x = t.map(toReal);
    let f = NaN, gs = [];
    try { f = opts.objective(x, curD); } catch (_) { f = NaN; }
    gs = cons.map(c => { let g; try { g = c.g(x, curD) / (c.scale || 1); } catch (_) { g = NaN; } return isFinite(g) ? g : (g === -Infinity ? -BIG : 1e3); });
    let m = isFinite(f) ? merit(f) : BIG;
    if (!isFinite(f)) gs = gs.map(g => Math.max(g, 1e3));
    const viol = gs.reduce((s, g) => s + Math.max(0, g), 0);
    const feas = isFinite(f) && gs.every(g => g <= FEAS);
    if (!scale) scale = Math.max(Math.abs(isFinite(f) ? f : 0), Math.abs(target)) < 1e-9 ? 1 : Math.max(Math.abs(isFinite(f) ? f : 0), Math.abs(target));
    if (feas && (bestRaw === null || m < bestMerit)) { bestRaw = f; bestMerit = m; }
    st.evals++;
    if (opts.onEval) opts.onEval(st.evals, bestRaw);
    history.push({ i: st.evals, x, f: isFinite(f) ? f : NaN, g: gs, feasible: feas, best: bestRaw, combo: curCombo });
    const rec = { t, x, f, m, gs, viol, feas };
    cache.set(key, rec);
    return rec;
  }
  const phiOf = (rec, mu) => (rec.m >= BIG ? BIG : rec.m / scale) + mu * rec.gs.reduce((s, g) => { const v = Math.max(0, g + DELTA); return s + v * v; }, 0);
  const done = limit => st.stop || st.evals >= limit;
  function checkStop() { if (opts.shouldStop && opts.shouldStop()) { st.stop = true; st.reason = t("opt.r.stopped"); } }

  // Nelder-Mead op phi(mu); geeft het beste t terug
  function* nelderMead(start, step, mu, limit) {
    const simplex = [start.map(clamp01)];
    for (let i = 0; i < n; i++) {
      const p = simplex[0].slice();
      p[i] = p[i] + step > 1 ? p[i] - step : p[i] + step;
      simplex.push(p.map(clamp01));
    }
    const F = simplex.map(p => phiOf(evalAt(p), mu));
    yield;
    let iter = 0;
    while (!done(limit) && iter++ < 50 * limit) {
      const ord = F.map((f, i) => i).sort((a, b) => F[a] - F[b]);
      const S = ord.map(i => simplex[i]), Fv = ord.map(i => F[i]);
      for (let i = 0; i <= n; i++) { simplex[i] = S[i]; F[i] = Fv[i]; }
      let size = 0;
      for (let i = 1; i <= n; i++) for (let j = 0; j < n; j++) size = Math.max(size, Math.abs(simplex[i][j] - simplex[0][j]));
      if (size < 1e-9 && Math.abs(F[n] - F[0]) <= 1e-12 * (1 + Math.abs(F[0]))) break;
      const c = new Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += simplex[i][j] / n;
      const at = (a) => c.map((cj, j) => clamp01(cj + a * (simplex[n][j] - cj)));
      const xr = at(-1), fr = phiOf(evalAt(xr), mu); yield; checkStop(); if (st.stop) break;
      if (fr < F[0]) {
        const xe = at(-2), fe = phiOf(evalAt(xe), mu); yield; checkStop();
        if (fe < fr) { simplex[n] = xe; F[n] = fe; } else { simplex[n] = xr; F[n] = fr; }
      } else if (fr < F[n - 1]) { simplex[n] = xr; F[n] = fr; }
      else {
        const outside = fr < F[n];
        const xc = at(outside ? -0.5 : 0.5), fc = phiOf(evalAt(xc), mu); yield; checkStop();
        if (fc < (outside ? fr : F[n])) { simplex[n] = xc; F[n] = fc; }
        else {
          for (let i = 1; i <= n && !done(limit); i++) {
            simplex[i] = simplex[i].map((v, j) => clamp01(simplex[0][j] + 0.5 * (v - simplex[0][j])));
            F[i] = phiOf(evalAt(simplex[i]), mu); yield; checkStop();
          }
        }
      }
      if (st.stop) break;
    }
    let bi = 0; for (let i = 1; i <= n; i++) if (F[i] < F[bi]) bi = i;
    return { t: simplex[bi], phi: F[bi] };
  }

  // gulden snede in één variabele
  function* oneD(mu, limit) {
    const K = 21, ts = [];
    for (let k = 0; k < K; k++) ts.push(k / (K - 1));
    if (vars[0].x0 != null) ts.push(toUnit(vars[0].x0, 0));
    ts.sort((a, b) => a - b);
    let bi = 0, bf = Infinity;
    for (let k = 0; k < ts.length && !done(limit); k++) {
      const f = phiOf(evalAt([ts[k]]), mu); yield; checkStop(); if (st.stop) break;
      if (f < bf) { bf = f; bi = k; }
    }
    let a = ts[Math.max(0, bi - 1)], b = ts[Math.min(ts.length - 1, bi + 1)];
    const gr = (Math.sqrt(5) - 1) / 2;
    let c = b - gr * (b - a), d = a + gr * (b - a);
    let fc = phiOf(evalAt([c]), mu), fd = phiOf(evalAt([d]), mu); yield;
    while (!done(limit) && b - a > 1e-11) {
      if (fc < fd) { b = d; d = c; fd = fc; c = b - gr * (b - a); fc = phiOf(evalAt([c]), mu); }
      else { a = c; c = d; fc = fd; d = a + gr * (b - a); fd = phiOf(evalAt([d]), mu); }
      yield; checkStop(); if (st.stop) break;
    }
    return { t: [fc < fd ? c : d], phi: Math.min(fc, fd) };
  }

  const comboRes = [];
  let overall = null;
  for (let ci = 0; ci < combos.length && !st.stop; ci++) {
    curCombo = ci; curD = combos[ci]; cache = new Map();
    const startEvals = st.evals;
    const limitC = startEvals + Math.max(10, Math.floor((maxEval - startEvals) / (combos.length - ci)));
    let bestT = null;
    if (n === 0) { evalAt([]); yield; }
    else if (n === 1) {
      const r = yield* oneD(MUS[3], limitC);
      bestT = r.t;
    } else {
      // starts: x0 (of het midden) en enkele Latin-hypercube-punten, eerst met een lichte straf
      const starts = [vars.map((v, i) => (v.x0 != null ? toUnit(v.x0, i) : 0.5))].concat(lhs(n, nStarts, seed + ci));
      const share = Math.floor((limitC - st.evals) * 0.5 / starts.length);
      let best = null;
      for (let s = 0; s < starts.length && !st.stop; s++) {
        const r = yield* nelderMead(starts[s], 0.12, MUS[0], Math.min(limitC, st.evals + Math.max(20 * n, share)));
        if (!best || r.phi < best.phi) best = r;
      }
      let cur = best.t;
      for (let k = 1; k < MUS.length && !st.stop; k++) {
        const lim = Math.min(limitC, st.evals + Math.floor((limitC - st.evals) / (MUS.length - k)));
        const r = yield* nelderMead(cur, 0.04 * Math.pow(0.4, k - 1), MUS[k], lim);
        cur = r.t;
      }
      // herstart op de laatste trap zolang het nog verbetert
      for (let rep = 0; rep < 4 && !st.stop && !done(limitC); rep++) {
        const before = phiOf(evalAt(cur), MUS[3]);
        const r = yield* nelderMead(cur, 0.005 / (rep + 1), MUS[3], limitC);
        cur = r.t;
        if (before - r.phi <= 1e-12 * (1 + Math.abs(before))) break;
      }
      bestT = cur;
    }
    // beste punt van deze combinatie uit de geschiedenis (toelaatbaar eerst)
    let pick = null;
    for (const [, rec] of cache) {
      if (!pick) { pick = rec; continue; }
      if (rec.feas !== pick.feas ? rec.feas : (rec.feas ? rec.m < pick.m : (rec.viol < pick.viol || (rec.viol === pick.viol && rec.m < pick.m)))) pick = rec;
    }
    comboRes.push({ d: curD.slice(), f: pick ? pick.f : NaN, feasible: pick ? pick.feas : false, evals: st.evals - startEvals, rec: pick });
    if (pick && (!overall || (pick.feas !== overall.feas ? pick.feas : (pick.feas ? pick.m < overall.m : pick.viol < overall.viol))) ) overall = Object.assign({ ci, d: curD.slice() }, pick);
    if (bestT === null && n > 0) bestT = pick ? pick.t : null;
    if (st.evals >= maxEval && !st.stop && !st.reason) st.reason = t("opt.r.max");
  }
  if (!st.reason) st.reason = st.evals >= maxEval ? t("opt.r.max") : t("opt.r.tol");
  if (!overall) return { x: vars.map(v => v.x0 != null ? v.x0 : (v.min + v.max) / 2), f: NaN, merit: NaN, feasible: false, g: [], active: [], activeBounds: [], history, evals: st.evals, reason: st.reason, stopped: st.stop, d: [], combos: comboRes, discrete: disc };
  const x = overall.x, g = overall.gs;
  const active = [];
  cons.forEach((c, i) => { if (g[i] > -1e-3) active.push({ name: c.name, label: c.label || c.name, g: g[i] }); });
  const activeBounds = [];
  overall.t.forEach((t, i) => { if (t < 1e-5) activeBounds.push({ name: vars[i].name, bound: "min" }); else if (t > 1 - 1e-5) activeBounds.push({ name: vars[i].name, bound: "max" }); });
  const reason = overall.feas ? st.reason : t("opt.r.infeasible", { r: st.reason });
  return { x, f: overall.f, merit: overall.m, feasible: overall.feas, g, active, activeBounds, history, evals: st.evals, reason, stopped: st.stop,
    d: overall.d, ci: overall.ci, combos: comboRes.map(c => ({ d: c.d, f: c.f, feasible: c.feasible, evals: c.evals })), discrete: disc };
}

/** Blokkerende vorm: draait optimizeGen tot het einde. */
export function optimize(opts) {
  const gen = optimizeGen(opts);
  for (;;) { const r = gen.next(); if (r.done) return r.value; }
}

/**
 * Gevoeligheid door een eindig verschil: per variabele het effect van +rel (standaard 1 %) op elke uitkomst.
 * outs(x) geeft {sleutel: getal}; resultaat {varnaam: {sleutel: {pct, abs, base}}}: procentuele en absolute verandering
 * (omgerekend naar +rel, ook als de stap naar beneden moest) en de waarde op x.
 */
export function sensitivity(vars, x, outs, rel) {
  rel = rel || 0.01;
  const base = outs(x), res = {};
  vars.forEach((v, i) => {
    let h = Math.abs(x[i]) * rel;
    if (!(h > 0)) h = (v.max - v.min) * rel;
    const sgn = x[i] + h > v.max ? -1 : 1;
    const xp = x.slice(); xp[i] = x[i] + sgn * h;
    const o = outs(xp), r = {};
    for (const k in base) {
      const b = base[k], q = o[k], d = (q - b) * sgn;
      r[k] = { pct: isFinite(b) && isFinite(q) && b !== 0 ? d / Math.abs(b) * 100 : NaN, abs: isFinite(d) ? d : NaN, base: b };
    }
    res[v.name] = r;
  });
  return res;
}
