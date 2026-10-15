import { newPage, loadExample } from '../lib.mjs';
export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url);
  // gereedschap op een leeg canvas: twee klikken plaatsen een flexure
  await p.click('#libBtn'); await p.click('[data-ex="empty"]'); await p.waitForTimeout(400);
  check('gereedschap Flexure bestaat', !!(await p.$('[data-tool="flexure"]')));
  await p.keyboard.press('b');
  check('toets B kiest Flexure', (await p.$eval('[data-tool="flexure"]', e => e.getAttribute('aria-pressed'))) === 'true');
  const box = await p.$eval('#cv', e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await p.mouse.click(box.x + box.w / 2 - 80, box.y + box.h / 2);
  await p.mouse.click(box.x + box.w / 2 + 80, box.y + box.h / 2);
  await p.click('[data-t="props"]');
  const t = await p.$eval('#props', e => e.textContent);
  check('inspector toont de flexure (type, maten, K, σ)', /Flexure \(PRBM\)/.test(t) && /Bladveer \(uitkraging\)/.test(t) && /Dikte t/.test(t) && /K\s*\d/.test(t) && /σ/.test(t), t.slice(0, 300));
  await p.selectOption('#fk', 'notch');
  const t2 = await p.$eval('#props', e => e.textContent);
  check('type Scharnier met inkeping toont R en K_t', /Inkepingsstraal R/.test(t2), t2.slice(0, 200));
  await p.selectOption('#fk', 'cross');
  check('type Kruisveerscharnier', /Kruisveerscharnier/.test(await p.$eval('#props', e => e.textContent)));
  await p.click('[data-t="how"]'); await p.waitForTimeout(250);
  const h = await p.$eval('#howPanel', e => e.textContent);
  check('Hoe rekent dit: PRBM-formules en bron', /Flexure/.test(h) && /Howell/.test(h) && /Soemers/.test(h), h.slice(-300));

  // voorbeeld: parallelgeleiding, FRF geeft de eerste eigenfrequentie
  const before = p.errs.length;
  await loadExample(p, 'parallelguide');
  await p.waitForSelector('#frfNote', { state: 'attached' });
  const note = await p.$eval('#frfNote', e => e.textContent);
  const f1 = parseFloat((note.match(/(\d+(?:[.,]\d+)?)\s*Hz/) || [])[1]);
  check('parallelguide: FRF eigenfrequentie ~ 46,8 Hz', f1 > 44 && f1 < 49, note);
  check('Uitleg-kaart zichtbaar met 24EI/L³-vergelijking', /8,40 N\/mm/.test(await p.$eval('#uitText', e => e.textContent)));
  check('geen page errors', p.errs.length === before && p.errs.length === 0, p.errs.join('|'));
  await p.context().close();
};
