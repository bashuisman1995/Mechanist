import { newPage, loadExample, setScrub, vals, stats, num } from '../lib.mjs';
export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url);
  await loadExample(p, 'shakerfrf');
  await p.click('[data-t="set"]');
  const note = await p.$eval('#frfNote', e => e.textContent);
  check('shakerfrf eigenfrequentie 3.56 Hz', /3\.56 Hz/.test(note), note);
  check('shakerfrf ζ 6.7%', /ζ 6\.7%/.test(note), note);
  const st = await stats(p);
  check('shakerfrf piek 7.52 (±0.1)', Math.abs(num(st[0].replace(/^piek/, '')) - 7.52) <= 0.1, st[0]);
  await setScrub(p, 0);
  const v = await vals(p);
  check('shakerfrf lage-frequentiewinst 1.00', Math.abs(num(v[0]) - 1.0) <= 0.01, v[0]);
  // animatiesnelheid
  await p.click('[data-t="props"]');
  await setScrub(p, 180); await p.selectOption('#speedSel', '1');
  await p.click('#playBtn'); await p.waitForTimeout(300);
  let a = await p.$eval('#angOut', e => e.textContent);
  check('resonantie 1x: "echte tijd"', /3\.56 Hz/.test(a) && /echte tijd/.test(a), a);
  await p.selectOption('#speedSel', '0.1'); await p.waitForTimeout(200);
  a = await p.$eval('#angOut', e => e.textContent);
  check('resonantie 0.1x: label 0.1×', /0\.1×/.test(a), a);
  await setScrub(p, 360); await p.selectOption('#speedSel', '1'); await p.waitForTimeout(200);
  a = await p.$eval('#angOut', e => e.textContent);
  check('topfrequentie 1x: 1/N× factor', /1\/\d+×/.test(a), a);
  await p.click('#playBtn'); await p.waitForTimeout(100);

  await loadExample(p, 'pendfrf');
  await p.click('[data-t="set"]');
  const n2 = await p.$eval('#frfNote', e => e.textContent);
  check('pendfrf eigenfrequentie 1.44 Hz', /1\.44 Hz/.test(n2), n2);
  await setScrub(p, 0);
  const v2 = await vals(p);
  check('pendfrf lage-frequentiewinst 12.07 mm/N (±0.1)', Math.abs(num(v2[0]) - 12.07) <= 0.1 && /mm\/N/.test(v2[0]), v2[0]);
  check('geen page errors', p.errs.length === 0, p.errs.join('|'));
  await p.context().close();
};
