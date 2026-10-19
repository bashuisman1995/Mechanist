import { newPage, loadExample } from '../lib.mjs';
const EX = ['fourbar', 'slidercrank', 'fivebar', 'jansen', 'hoeken', 'compressor', 'doublependulum', 'settle', 'liftarm', 'shaker', 'springload', 'gaplimit', 'frictionslide', 'shakerfrf', 'pendfrf', 'steamL', 'virtualplay', 'preload', 'parallelguide', 'loadcell', 'thermarm', 'athermarm', 'thermclamp', 'stiffcant', 'stiffleaf', 'stiffportal', 'stiffmixed'];
export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url);
  // controle dat de lijst volledig is
  await p.click('#libBtn');
  const all = (await p.$$eval('[data-ex]', x => x.map(e => e.dataset.ex))).filter(e => e !== 'empty');
  await p.keyboard.press('Escape');
  const missing = all.filter(e => !EX.includes(e));
  check('alle voorbeelden in Bibliotheek getest', missing.length === 0, 'ontbreekt: ' + missing.join(','));
  for (const ex of all) {
    const before = p.errs.length;
    let ok = true, why = '';
    try { await loadExample(p, ex); } catch (e) { ok = false; why = e.message.split('\n')[0]; }
    const en = ok && !(await p.$eval('#playBtn', e => e.disabled));
    check(`voorbeeld ${ex} laadt en play is actief`, en && p.errs.length === before, why || p.errs.slice(before).join('|'));
  }
  check('geen page errors', p.errs.length === 0, p.errs.join('|'));
  await p.context().close();
};
