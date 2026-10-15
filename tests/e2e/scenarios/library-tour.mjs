import { newPage, dismissAsk, playReady } from '../lib.mjs';
export default async ({ browser, url, check }) => {
  // bibliotheek: filter, sluiten, uitleg
  let p = await newPage(browser, url);
  const open = () => p.$eval('#lib', e => !e.hidden);
  await p.click('#libBtn');
  check('bibliotheek opent', await open());
  const n = await p.$$eval('#libGrid [data-ex]:not([hidden])', x => x.length);
  await p.click('[data-c="frf"]');
  const nf = await p.$$eval('#libGrid [data-ex]:not([hidden])', x => x.length);
  check('filter FRF toont 2 kaarten', nf === 2 && n > nf, n + '/' + nf);
  await p.keyboard.press('Escape');
  check('Esc sluit bibliotheek', !(await open()));
  await p.click('#libBtn'); await p.mouse.click(3, 300);
  check('klik buiten sluit bibliotheek', !(await open()));
  await p.click('#libBtn'); await p.click('[data-ex="slidercrank"]');
  await dismissAsk(p); await playReady(p);
  check('kiezen sluit en toont uitleg', !(await open()) && await p.$eval('#uitleg', e => !e.hidden && /Slinger-krukmechanisme/.test(e.textContent)));
  const ov = await p.evaluate(() => {
    const u = document.getElementById('uitleg').getBoundingClientRect(), t = document.getElementById('transport').getBoundingClientRect();
    return u.bottom <= t.top;
  });
  check('uitleg overlapt transportbalk niet', ov);
  await p.click('#uitClose');
  check('uitleg sluit', await p.$eval('#uitleg', e => e.hidden));
  check('geen page errors (bibliotheek)', p.errs.length === 0, p.errs.join('|'));
  await p.context().close();

  // rondleiding: eerste bezoek
  p = await newPage(browser, url, { tour: true });
  await p.waitForSelector('.tour-bubble');
  check('rondleiding bij eerste bezoek', /1 van 3/.test(await p.textContent('.tour-bubble')));
  await p.click('.tnext'); await p.click('.tnext');
  check('stap 3', /Resultaat en uitleg/.test(await p.textContent('.tour-bubble')));
  await p.click('.tnext');
  check('rondleiding klaar', (await p.$('.tour-bubble')) === null);
  await p.reload(); await p.waitForTimeout(1200);
  check('geen rondleiding bij tweede bezoek', (await p.$('.tour-bubble')) === null);
  await p.click('#menuBtn'); await p.click('[data-a="tour"]');
  check('Rondleiding in Bestand-menu', (await p.$('.tour-bubble')) !== null);
  await p.click('.tskip');
  check('Overslaan sluit', (await p.$('.tour-bubble')) === null);
  await p.context().close();

  // opslag die een fout geeft
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('geblokkeerd'); } }); });
  p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.goto(url); await p.waitForSelector('.tour-bubble', { timeout: 5000 });
  const inView = await p.evaluate(() => { const r = document.querySelector('.tour-bubble').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; });
  check('rondleiding werkt zonder localStorage op 390 px', inView && p.errs.length === 0, p.errs.join('|'));
  await ctx.close();
};
