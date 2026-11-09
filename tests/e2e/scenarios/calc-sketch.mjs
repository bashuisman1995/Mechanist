// "Open in Sketch" vanuit alle 10 calculators die het hebben: de schets laadt, de juiste modus is actief, geen consolefouten,
// en de getoonde stijfheid/frequentie komt binnen 1 % overeen met de calculator.
import { kNmm, newPage, num, pickCalc } from '../lib.mjs';
const CASES = [
  // id, verwachte modus, wat te vergelijken
  ['leaf', 'stiff', 'k'], ['par', 'stiff', 'k'], ['cross', 'stiff', 'kth'], ['notch', 'stiff', 'kth'], ['wire', 'stiff', 'k'],
  ['hertz', 'equil', 'delta'], ['kc', 'dyn', ''], ['msd', 'frf', 'fn'], ['iso', 'frf', 'fn'], ['exp', 'kin', ''],
];
export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url);
  const cerr = [];
  p.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) cerr.push(m.text()); });
  for (const [id, mode, cmp] of CASES) {
    await p.click('#workSeg [data-w="calc"]');
    await pickCalc(p, id);
    const key0 = await p.$eval('[data-key="0"]', e => e.textContent.replace(/\s+/g, ' '));
    const key0v = num(key0.replace(/^[^\d-]*/, '').replace(/[\u2009\u202f\u00a0 ](?=\d{3})/g, ''));
    await p.click('#calcSketch');
    await p.waitForFunction(() => !document.querySelector('.main').hidden && getComputedStyle(document.querySelector('.main')).display !== 'none', null, { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(1500);
    const got = await p.$eval('#modeSeg [aria-pressed="true"]', e => e.dataset.v).catch(() => '');
    check(`${id}: schets geladen in modus ${mode}`, got === mode, got);
    check(`${id}: uitleg-kaart zichtbaar`, await p.$eval('#uitText', e => e.textContent.length > 30 && !e.closest('[hidden]')).catch(() => false));
    if (cmp === 'k' || cmp === 'kth') {
      const k = kNmm(await p.$eval('#skVal', e => e.textContent));
      // calculator toont c (N/mm of N·mm/rad); de schets k = c bij translatie, c/r^2 (r = 50 mm) bij rotatie
      const want = cmp === 'kth' ? key0v / 2500 : key0v;
      check(`${id}: stijfheid schets = calculator (1 %)`, Math.abs(k - want) <= 0.01 * Math.abs(want), `schets ${k} calc ${want}`);
    } else if (cmp === 'fn') {
      const s = (await p.$$eval('#series [data-s]', x => x.map(e => e.textContent))).join(' ');
      const m = /at ([\d.,]+) Hz/.exec(s);
      check(`${id}: eigenfrequentie schets = calculator (1 %)`, !!m && Math.abs(num(m[1]) - key0v) <= 0.01 * key0v, `${s} vs ${key0v}`);
    } else if (cmp === 'delta') {
      const s = (await p.$$eval('#series [data-s]', x => x.map(e => e.textContent))).join(' ');
      const m = /max ([\d.,]+)/g; let last = null, q; while ((q = m.exec(s))) last = q[1];
      const dcalc = num(await p.evaluate(() => (document.querySelector('[data-key="1"]').textContent.match(/δ = ([\d.,]+)/) || [0, '0'])[1]));
      check(`${id}: indringing schets = calculator (1 %)`, last !== null && Math.abs(num(last) - dcalc) <= 0.01 * dcalc, `${s} vs ${dcalc}`);
    }
  }
  check('geen consolefouten of paginafouten', cerr.length === 0 && p.errs.length === 0, cerr.concat(p.errs).join(' | '));
};
