import { newPage, visible } from '../lib.mjs';
const SHOT = '/tmp/claude-0/-home-user-Mechanist/1e45fc4c-94b6-53cc-82eb-8e0cec55c972/scratchpad/';
export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url);
  const res = () => p.$eval('[data-res="Stijfheid c_x"]', e => e.textContent);
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
  for (const id of ['par', 'cross', 'notch', 'wire']) {
    await p.click(`[data-c="${id}"]`);
    check(`${id}: resultaten en formules`, (await p.$$('#calcOut .calc-res > div')).length >= 7 && (await p.$$('#calcFormulas .fm')).length >= 4);
  }
  await p.click('[data-c="leaf"]');
  await p.screenshot({ path: SHOT + 'f2_calc.png' });
  await p.setViewportSize({ width: 390, height: 800 });
  await p.waitForTimeout(200);
  for (const id of ['leaf', 'par', 'cross', 'notch', 'wire']) {
    await p.click(`[data-c="${id}"]`);
    const w = await p.evaluate(() => [document.documentElement.scrollWidth, document.body.scrollWidth, document.querySelector('.calc-detail').scrollWidth, innerWidth]);
    check(`390 px: geen horizontale scroll (${id})`, w[0] <= w[3] && w[1] <= w[3] && w[2] <= w[3], w.join(','));
  }
  await p.screenshot({ path: SHOT + 'f2_calc_390.png' });
  await p.setViewportSize({ width: 1366, height: 768 });
  await p.click('#workSeg [data-w="sketch"]');
  check('terug naar schets', (await visible(p, '.main')) && !(await visible(p, '#calcRoot')));
  check('geen page errors', p.errs.length === 0, p.errs.join('|'));
  await p.context().close();
};
