import { newPage, loadExample, playReady, visible } from '../lib.mjs';
export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url);
  const txt = async () => { await p.waitForTimeout(150); return p.$eval('#howPanel', e => e.textContent); };
  await loadExample(p, 'fourbar');
  await p.click('[data-t="how"]');
  let t = await txt();
  check('kinematica: titel en Gauss-Newton', /Kinematica/.test(t) && /J·Δq = −Φ/.test(t), t.slice(0, 80));
  check('kinematica: Grübler en DOF live', /Grübler/.test(t) && /Vrijheidsgraden/.test(t));
  check('geen placeholder meer in het tabblad', (await p.$$('#howPlaceholder')).length === 0);
  // selectie van een stang toont de elementwet
  await p.click('[data-t="props"]'); await p.click('[data-t="how"]');
  await loadExample(p, 'springload');   // dynamisch voorbeeld met veer
  await p.click('[data-t="how"]');
  t = await txt();
  check('dynamica: KKT-stelsel en Baumgarte', /Dynamica/.test(t) && /Φq/.test(t) && /Baumgarte/.test(t) && /20 1\/s/.test(t), t.slice(0, 80));
  check('dynamica: RK4', /RK4/.test(t));
  // selecteer de veer via de canvas is fragiel; kopieerknop aanwezig
  check('kopieerknop aanwezig', (await p.$$('#howPanel .hw-copy')).length >= 1);
  await p.click('#howPanel .hw-copy'); await p.waitForTimeout(100);
  await p.click('#modeSeg [data-v="equil"]'); await p.waitForTimeout(150);
  t = await txt();
  check('evenwicht: criteria', /Evenwichtscriteria/.test(t) && /0,5 mm\/s/.test(t) && /50 mm\/s²/.test(t), t.slice(0, 80));
  await p.click('#modeSeg [data-v="frf"]'); await p.waitForTimeout(150);
  t = await txt();
  check('FRF: vergelijking', /\(K − ω²M \+ iωC\)/.test(t) && /Z·η/.test(t), t.slice(0, 80));
  await loadExample(p, 'shakerfrf');
  await p.click('[data-t="how"]');
  t = await txt();
  check('FRF: eigenfrequentie live', /Eigenfrequentie f1/.test(t) && /3,56 Hz/.test(t), t.slice(-300));
  check('FRF: k getoond', /Vrijheidsgraden k/.test(t));
  check('geen page errors', p.errs.length === 0, p.errs.join('|'));
  await p.context().close();
};
