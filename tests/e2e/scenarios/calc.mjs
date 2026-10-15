import { newPage, visible } from '../lib.mjs';
const SHOT = '/tmp/claude-0/-home-user-Mechanist/1e45fc4c-94b6-53cc-82eb-8e0cec55c972/scratchpad/';
export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url);
  const res = () => p.$eval('[data-res="Stijfheid c_x"]', e => e.textContent);
  const slide = (id, pos) => p.$eval(`[data-sl="${id}"]`, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, pos);
  const frame = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await p.click('#workSeg [data-w="calc"]');
  check('calculators zichtbaar, schets verborgen', (await visible(p, '#calcRoot')) && !(await visible(p, '.main')));
  check('lijst bevat 5 calculators', (await p.$$('#calcList .calc-item')).length === 5);
  const r0 = await res();
  check('Bladveer: c_x = 2,1 N/mm', /^2,1\s*N\/mm/.test(r0), r0);
  await p.fill('[data-in="t"]', '0.1');
  const r1 = await res();
  check('resultaat past zich aan (t=0,1: 0,263 N/mm)', /^0,26/.test(r1), r1);
  await p.fill('[data-in="u"]', '5');
  check('waarschuwing bij te grote spanning', (await p.$$('.calc-warn')).length === 1);
  await p.selectOption('#calcMat', 'alu');
  check('materiaalinfo bijgewerkt', /70 GPa/.test(await p.$eval('#calcMatInfo', e => e.textContent)));
  await p.fill('[data-in="u"]', '0.5');

  // slider: getalveld, resultaat en SVG-attribuut veranderen mee
  await p.fill('[data-in="t"]', '0.2');
  const before = { n: await p.$eval('[data-in="t"]', e => e.value), r: await res(), w: await p.$eval('#calcSvg .s-leaf', e => e.getAttribute('stroke-width') + e.getAttribute('d')) };
  await slide('t', 900); await frame();
  const after = { n: await p.$eval('[data-in="t"]', e => e.value), r: await res(), w: await p.$eval('#calcSvg .s-leaf', e => e.getAttribute('stroke-width') + e.getAttribute('d')) };
  check('slider t: getalveld verandert', before.n !== after.n && +after.n > 0.5, before.n + ' -> ' + after.n);
  check('slider t: resultaat verandert', before.r !== after.r, before.r + ' -> ' + after.r);
  check('slider t: SVG-attribuut verandert', before.w !== after.w);
  await p.fill('[data-in="L"]', '40');
  check('getalveld zet slider mee', (await p.$eval('[data-sl="L"]', e => +e.value)) > 500);
  const dBefore = await p.$eval('#calcSvg .s-leaf', e => e.getAttribute('d'));
  await slide('u', 1000); await frame();
  check('slider u: tekening buigt mee', dBefore !== await p.$eval('#calcSvg .s-leaf', e => e.getAttribute('d')));
  check('veiligheid rood bij te grote u', (await p.$eval('[data-key="2"]', e => e.dataset.status)) === 'bad');
  check('3 grote kerngetallen', (await p.$$('.calc-key')).length === 3);

  // onthouden per calculator + reset
  await p.fill('[data-in="b"]', '23');
  await p.click('[data-c="par"]'); await p.click('[data-c="leaf"]');
  check('waarden onthouden bij wisselen', (await p.$eval('[data-in="b"]', e => e.value)) === '23');
  await p.click('#calcReset');
  check('reset zet beginwaarden terug', (await p.$eval('[data-in="b"]', e => e.value)) === '10' && (await res()).startsWith('2,1'));
  await p.fill('[data-in="t"]', '0.2'); await p.fill('[data-in="u"]', '0.5'); await p.selectOption('#calcMat', 'staal');

  for (const id of ['par', 'cross', 'notch', 'wire']) {
    await p.click(`[data-c="${id}"]`);
    check(`${id}: resultaten en formules`, (await p.$$('#calcOut > div')).length >= 7);
    const k = id === 'cross' || id === 'notch' ? 'phi' : 'u';
    const d0 = await p.$eval('#calcSvg', e => e.innerHTML);
    await slide(k, 800); await frame();
    check(`${id}: tekening past zich aan`, d0 !== await p.$eval('#calcSvg', e => e.innerHTML));
  }
  await p.click('[data-c="leaf"]');
  await p.click('summary:has-text("Formules")'); await frame();
  check('formules uitklapbaar met eigen getallen', (await p.$$('#calcFormulas .fm')).length >= 4 && /met jouw getallen/.test(await p.$eval('#calcFormulas', e => e.textContent)));
  await p.screenshot({ path: SHOT + 'calc2_desktop.png' });
  await p.emulateMedia({ colorScheme: 'dark' });
  await p.click('[data-c="notch"]');
  await p.screenshot({ path: SHOT + 'calc2_dark.png' });
  await p.emulateMedia({ colorScheme: 'light' });
  await p.click('[data-c="leaf"]');
  await p.setViewportSize({ width: 390, height: 800 });
  await p.waitForTimeout(200);
  for (const id of ['leaf', 'par', 'cross', 'notch', 'wire']) {
    await p.click(`[data-c="${id}"]`);
    const w = await p.evaluate(() => [document.documentElement.scrollWidth, document.body.scrollWidth, document.querySelector('.calc-detail').scrollWidth, innerWidth]);
    check(`390 px: geen horizontale scroll (${id})`, w[0] <= w[3] && w[1] <= w[3] && w[2] <= w[3], w.join(','));
  }
  await p.click('[data-c="leaf"]');
  const order = await p.evaluate(() => { const f = document.querySelector('.calc-fig').getBoundingClientRect().top, k = document.querySelector('.calc-keys').getBoundingClientRect().top, i = document.querySelector('.calc-inputs').getBoundingClientRect().top; return [f, k, i]; });
  check('390 px: tekening eerst, dan kerngetallen, dan invoer', order[0] < order[1] && order[1] < order[2], order.join(','));
  await p.screenshot({ path: SHOT + 'calc2_390.png' });
  await p.setViewportSize({ width: 1366, height: 768 });
  await p.click('#workSeg [data-w="sketch"]');
  check('terug naar schets', (await visible(p, '.main')) && !(await visible(p, '#calcRoot')));
  check('geen page errors', p.errs.length === 0, p.errs.join('|'));
  await p.context().close();
};
