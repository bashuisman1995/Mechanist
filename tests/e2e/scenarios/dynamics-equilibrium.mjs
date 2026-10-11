import { newPage, playReady, store, visible } from '../lib.mjs';
export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url);
  await p.click('#menuBtn'); await p.click('[data-ex="springload"]');
  await playReady(p, 30000);
  check('dynamisch voorbeeld opgelost, play actief', !(await p.$eval('#playBtn', e => e.disabled)));
  // afspelen tot het einde
  await p.selectOption('#speedSel', '1'); await p.click('#playBtn'); await p.waitForTimeout(3600);
  const sc = +(await p.$eval('#scrub', e => e.value)), mx = +(await p.$eval('#scrub', e => e.max));
  check('dynamisch afspelen stopt aan het einde', sc >= mx - 1, `${sc}/${mx}`);
  // bewerken op t0 maakt oplossing stale, undo herstelt
  await p.click('#rewBtn');
  await p.click('[data-t="set"]'); await p.fill('#mInp', '0.3'); await p.press('#mInp', 'Enter'); await p.waitForTimeout(200);
  check('wijziging maakt oplossing stale (Bereken zichtbaar)', await visible(p, '#solveBtn'));
  await p.$eval('#mInp', e => e.blur()); await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
  check('undo herstelt oplossing zonder Bereken', !(await p.$eval('#playBtn', e => e.disabled)));
  // pannen/selecteren invalideert niet
  const box = await p.$eval('#cv', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y }; });
  await p.mouse.click(box.x + 20, box.y + 300);
  await p.mouse.move(box.x + 50, box.y + 200); await p.mouse.down(); await p.mouse.move(box.x + 120, box.y + 230, { steps: 4 }); await p.mouse.up();
  await p.waitForTimeout(200);
  check('pan/selecteren invalideert niet', !(await p.$eval('#playBtn', e => e.disabled)) && !(await visible(p, '#solveBtn')));
  // zwaartekracht
  await p.click('[data-t="set"]');
  await p.click('#gravChk'); await p.waitForTimeout(200);
  check('zwaartekracht uit -> Bereken zichtbaar', await visible(p, '#solveBtn'));
  check('stale-melding in tmsg', /Model gewijzigd/.test(await p.$eval('#tmsg', e => e.textContent)));
  await p.click('#gravChk'); await p.waitForTimeout(200);
  check('zwaartekracht terug -> oplossing weer geldig', !(await p.$eval('#playBtn', e => e.disabled)));
  // evenwicht met gewrichtsdemping
  await p.click('#jdChk'); await p.fill('#cjInp', '0.5'); await p.press('#cjInp', 'Enter');
  await p.click('#modeSeg [data-v="equil"]'); await p.waitForTimeout(100);
  check('evenwichtsmodus maakt oplossing stale', await visible(p, '#solveBtn'));
  await p.click('#solveBtn');
  await playReady(p);
  const note = await p.$eval('#dynNote', e => e.textContent);
  check('"Evenwicht na 1.26 s"', /Evenwicht na 1\.26 s/.test(note), note);
  check('geen page errors', p.errs.length === 0, p.errs.join('|'));
  await p.context().close();
};
