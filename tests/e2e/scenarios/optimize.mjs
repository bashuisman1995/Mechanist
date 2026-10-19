// Optimaliseer: calculator Bladveer (handberekend optimum), athermische meetarm in de schets, Stop, responsiviteit, 390 px.
import { newPage, loadExample } from '../lib.mjs';
import { MATERIALS } from '../../../src/calc/materials.js';

const startLongtasks = p => p.evaluate(() => {
  window.__lt = [];
  try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); } catch (e) { /* geen ondersteuning */ }
});
const maxLong = p => p.evaluate(() => Math.max(0, ...(window.__lt || [0])));
const raw = (p, sel) => p.$eval(sel, e => parseFloat(e.dataset.raw));

export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url);
  const cerrs = [];
  p.on('console', m => { if (m.type() === 'error') cerrs.push(m.text()); });
  await startLongtasks(p);

  /* ---------- calculator Bladveer ---------- */
  await p.click('#workSeg [data-w="calc"]');
  await p.waitForSelector('#calcOpt');
  check('knop Optimaliseer per calculator', !!(await p.$('#calcOpt')));
  await p.click('#calcOpt'); await p.waitForTimeout(200);
  check('paneel opent en toont doel, variabelen en randvoorwaarden', await p.$eval('#calcOptSec', e => e.open) && !!(await p.$('#optObj')) && (await p.$$('[data-ov]')).length >= 4);
  const pre = await p.$$eval('#optForm [data-ci]', x => x.length);
  check('voorgevulde randvoorwaarden: σ ≤ σ_toel, knik ≥ 2, f (uit)', pre === 3, String(pre));
  await p.uncheck('[data-ov="b"] [data-vf="on"]');              // b blijft 10 mm
  await p.selectOption('#optObj', 'Maximale uitwijking u_max');
  await p.click('#optSense [data-sense="max"]');
  await p.click('#optAddCon');
  await p.selectOption('#optForm [data-ci="3"] [data-cf="out"]', 'Stijfheid c_x');
  await p.selectOption('#optForm [data-ci="3"] [data-cf="op"]', 'ge');
  await p.fill('#optForm [data-ci="3"] [data-cf="val"]', '0.5');
  await p.click('#optRun');
  await p.waitForSelector('#calcOptTbl', { timeout: 30000 });
  // handberekening: maximaal u_max = σ·L²/(3·E·t) onder c_x = E·b·t³/L³ ≥ 0,5: L op zijn bovengrens (200), t uit c_x
  const E = 210000, b = 10, sg = 300, Lh = 200, th = Math.cbrt(0.5 * Lh ** 3 / (E * b)), uh = sg * Lh ** 2 / (3 * E * th);
  const L = await raw(p, '#calcOptTbl td[data-id="L"]'), t = await raw(p, '#calcOptTbl td[data-id="t"]');
  const u = await raw(p, '#calcOptOut tr.opt-doel td[data-raw]');
  check('bladveer: L op de bovengrens (200 mm), binnen 1 %', Math.abs(L - Lh) / Lh < 0.01, String(L));
  check('bladveer: t = ' + th.toFixed(3) + ' mm uit c_x ≥ 0,5, binnen 1 %', Math.abs(t - th) / th < 0.01, String(t));
  check('bladveer: u_max = ' + uh.toFixed(2) + ' mm, binnen 1 %', Math.abs(u - uh) / uh < 0.01, String(u));
  const act = await p.$eval('#calcOptAct', e => e.textContent);
  check('actieve randvoorwaarde c_x en variabele L op zijn grens genoemd', /Stijfheid c_x/.test(act) && /Lengte L op max/.test(act), act);
  const cx = await raw(p, '#calcOptOut tr.opt-rand td[data-raw]');
  check('echt toelaatbaar: c_x ≥ 0,5', await p.$$eval('#calcOptOut tr.opt-rand', x => x.length) >= 1 && cx >= 0.5 - 1e-9, String(cx));
  check('convergentieplotje en gevoeligheidsregel', !!(await p.$('#optRes svg.opt-plot path.opt-ln')) && /\+1 %.*→/.test(await p.$eval('#calcOptSens', e => e.textContent)), await p.$eval('#calcOptSens', e => e.textContent));
  await p.$eval('#optRes', e => { const d = document.getElementById('calcDetail'); d.scrollTop = e.getBoundingClientRect().top - d.getBoundingClientRect().top + d.scrollTop - 8; });
  await p.screenshot({ path: '/tmp/claude-0/-home-user-Mechanist/1e45fc4c-94b6-53cc-82eb-8e0cec55c972/scratchpad/opt_calc_result.png' });
  await p.click('#calcOptCopy'); await p.waitForTimeout(150);
  const rep = await p.$eval('#calcOptCopy', e => e.dataset.report || '');
  check('Kopieer: rapport met probleemdefinitie, methode, resultaat en geschiedenis', ['PROBLEEMDEFINITIE', 'METHODE', 'RESULTAAT', 'VERLOOP', 'lokaal optimum'].every(s => rep.indexOf(s) >= 0) && !/e[+-]\d/.test(rep.replace(/1e[-+]?\d/g, '')), rep.slice(0, 200));
  await p.click('#calcOptApply'); await p.waitForTimeout(200);
  const inL = parseFloat(await p.$eval('#in_L', e => e.value));
  check('Toepassen schrijft de waarden in de calculator', Math.abs(inL - 200) < 2, String(inL));
  check('Terug is zichtbaar na Toepassen', await p.$eval('#calcOptUndo', e => !e.hidden));
  await p.click('#calcOptUndo'); await p.waitForTimeout(200);
  check('Terug zet de oude waarden terug (L = 20)', parseFloat(await p.$eval('#in_L', e => e.value)) === 20);
  // onhaalbaar: c_x ≥ 1e9
  await p.fill('#optForm [data-ci="3"] [data-cf="val"]', '1e9');
  await p.click('#optRun'); await p.waitForSelector('#calcOptStat.opt-bad', { timeout: 30000 });
  check('onhaalbaar probleem wordt als onhaalbaar gemeld', /Geen toelaatbare/.test(await p.$eval('#calcOptStat', e => e.textContent)));
  // materiaal opsommen
  await p.fill('#optForm [data-ci="3"] [data-cf="val"]', '0.5');
  await p.check('[data-mat="_"]');
  await p.click('#optRun'); await p.waitForSelector('#calcOptTbl', { timeout: 60000 });
  let best = null;
  for (const m of MATERIALS) { const tt = Math.cbrt(0.5 * Lh ** 3 / (E * b)) * Math.cbrt(210000 / m.E), uu = m.sigma * Lh ** 2 / (3 * m.E * Math.cbrt(0.5 * Lh ** 3 / (m.E * b))); if (tt <= 2 && (!best || uu > best.u)) best = { naam: m.naam, u: uu }; }
  const matRow = await p.$eval('#calcOptTbl tr.opt-chg:last-child', e => e.textContent);
  check('materiaal opgesomd: beste = ' + best.naam, matRow.indexOf(best.naam) >= 0, matRow);
  check('alle materialen staan in de tabel', (await p.$$('#optRes .opt-more tbody tr')).length === MATERIALS.length);
  const how = await p.$eval('#optHow', e => e.textContent);
  check('Hoe rekent dit?: methode, straf, stopcriteria, multi-start en "lokaal optimum mogelijk; controleer"', /Nelder/.test(how) && /straf/.test(how) && /Stoppen/.test(how) && /Latin-hypercube/.test(how) && /lokaal optimum mogelijk; controleer/.test(how));
  check('calculator: geen long task > 200 ms tijdens de runs', (await maxLong(p)) < 200, String(await maxLong(p)));

  /* ---------- Schets: athermische meetarm ---------- */
  await p.click('#workSeg [data-w="sketch"]');
  await loadExample(p, 'athermarm');
  check('voorbeeld "Athermische meetarm optimaliseren" in categorie Optimalisatie, Uitleg noemt de knop', /Athermisch maken/.test(await p.$eval('#uitText', e => e.textContent)));
  const d0 = parseFloat((await p.$eval('#thD', e => e.textContent)).replace(/\s/g, '').replace(',', '.'));
  await p.mouse.click(600, 300);
  await p.click('[data-t="opt"]'); await p.waitForTimeout(200);
  await p.screenshot({ path: '/tmp/claude-0/-home-user-Mechanist/1e45fc4c-94b6-53cc-82eb-8e0cec55c972/scratchpad/opt_sk_form.png' });
  await p.click('#skAth');
  await p.waitForSelector('#skOptTbl', { timeout: 30000 });
  const xC = await raw(p, '#skOptTbl td[data-id^="nx:"]');
  const ratio = (150 - xC) / 150, ath = 11.5 / 23.6;
  const dAfter = await raw(p, '#skOptOut tr.opt-doel td[data-raw]');
  check('athermisch: startdrift ~ 4 µm', d0 > 3.9 && d0 < 4.1, String(d0));
  check('athermisch: drift < 1 % van de startdrift', Math.abs(dAfter) < 0.01 * d0, dAfter + ' µm tegen ' + d0);
  check('athermisch: L_BC/L_AB = α_staal/α_alu (= ' + ath.toFixed(4) + ') binnen 1 %', Math.abs(ratio - ath) / ath < 0.01, String(ratio));
  await p.$eval('#skRes', e => { const d = e.closest('.pane'); d.scrollTop = 0; e.scrollIntoView({ block: 'start' }); });
  await p.screenshot({ path: '/tmp/claude-0/-home-user-Mechanist/1e45fc4c-94b6-53cc-82eb-8e0cec55c972/scratchpad/opt_sk_result.png' });
  const xBefore = await p.evaluate(() => JSON.parse(localStorage.getItem('mechschets.r1')).nodes.map(n => n.x).join());
  await p.click('#skOptApply'); await p.waitForTimeout(500);
  const dNow = parseFloat((await p.$eval('#thD', e => e.textContent)).replace(/\s/g, '').replace(',', '.'));
  check('Toepassen: de thermische verschuiving in het Resultaat is nu (bijna) nul', Math.abs(dNow) < 0.01 * d0, String(dNow));
  await p.click('#undoBtn'); await p.waitForTimeout(500);
  const xAfterUndo = await p.evaluate(() => JSON.parse(localStorage.getItem('mechschets.r1')).nodes.map(n => n.x).join());
  check('Toepassen is één stap ongedaan maken', xAfterUndo === xBefore, xBefore + ' / ' + xAfterUndo);
  check('na ongedaan maken is de startdrift terug', Math.abs(parseFloat((await p.$eval('#thD', e => e.textContent)).replace(/\s/g, '').replace(',', '.')) - d0) < 0.05);
  check('Kopieer in de schets geeft een rapport', await (async () => { await p.click('#skOptCopy'); await p.waitForTimeout(150); const r = await p.$eval('#skOptCopy', e => e.dataset.report || ''); return /PROBLEEMDEFINITIE/.test(r) && /lokaal optimum/.test(r); })());

  /* ---------- Stop en responsiviteit (FRF-voorbeeld: elke stap is een complete FRF-berekening) ---------- */
  await loadExample(p, 'parallelguide');
  await p.mouse.click(600, 300);
  await p.click('[data-t="opt"]'); await p.waitForTimeout(200);
  await p.selectOption('#skObj', 'f1');
  await p.click('#skSense [data-sense="max"]');
  for (const k of ['ft:e8', 'ft:e9', 'ft:e10', 'ft:e11']) await p.check(`[data-ov="${k}"] [data-vf="on"]`);
  await p.fill('#skMax', '5000');
  await startLongtasks(p);
  await p.click('#skRun');
  await p.waitForTimeout(250);
  check('tijdens de run: Stop zichtbaar en voortgang loopt', await p.$eval('#skStop', e => !e.hidden) && /evaluaties/.test(await p.$eval('#skPtxt', e => e.textContent)), await p.$eval('#skPtxt', e => e.textContent));
  await p.click('#skStop');
  await p.waitForSelector('#skOptTbl', { timeout: 30000 });
  const st = await p.$eval('#skOptStat', e => e.textContent);
  const nEv = parseInt(st.match(/na (\d+) evaluaties/)[1], 10);
  check('Stop: de run stopt voortijdig en toont het tussenresultaat', /gestopt/.test(st) && nEv < 600, st);
  check('na Stop is de knop Optimaliseer weer actief', await p.$eval('#skRun', e => !e.disabled));
  await p.click('#skRun'); await p.waitForSelector('#skOptTbl', { timeout: 60000 }); await p.waitForTimeout(300);
  check('volledige run: f1 neemt toe en variabelen staan op hun grens', parseFloat((await p.$$eval('#skOptOut tr.opt-doel td[data-raw]', x => x.map(e => e.dataset.raw)))[0]) > 100 && /op max/.test(await p.$eval('#skOptAct', e => e.textContent)));
  check('schets: geen long task > 200 ms tijdens de runs', (await maxLong(p)) < 200, String(await maxLong(p)));

  /* ---------- 390 px ---------- */
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(400);
  const hs = async () => p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
  check('390 px, Schets met tab Optimaliseer: geen horizontale scroll', (await hs()) <= 0, String(await hs()));
  await p.screenshot({ path: '/tmp/claude-0/-home-user-Mechanist/1e45fc4c-94b6-53cc-82eb-8e0cec55c972/scratchpad/opt_sk_390.png' });
  await p.click('#workSeg [data-w="calc"]'); await p.waitForTimeout(300);
  await p.click('#calcOpt'); await p.waitForTimeout(300);
  await p.click('#optRun'); await p.waitForSelector('#calcOptTbl', { timeout: 30000 });
  check('390 px, calculator met resultaat: geen horizontale scroll', (await hs()) <= 0, String(await hs()));
  check('390 px: de detailkolom scrolt niet horizontaal', await p.$eval('#calcDetail', e => e.scrollWidth <= e.clientWidth + 1));
  await p.$eval('#optRes', e => { const d = document.getElementById('calcDetail'); d.scrollTop = e.getBoundingClientRect().top - d.getBoundingClientRect().top + d.scrollTop - 8; });
  await p.screenshot({ path: '/tmp/claude-0/-home-user-Mechanist/1e45fc4c-94b6-53cc-82eb-8e0cec55c972/scratchpad/opt_calc_390.png' });
  check('geen console- of paginafouten', cerrs.length === 0 && p.errs.length === 0, cerrs.concat(p.errs).join(' | '));
  await p.close();
};
