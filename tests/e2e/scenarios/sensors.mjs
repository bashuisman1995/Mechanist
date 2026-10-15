import { newPage, loadExample } from '../lib.mjs';
export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url);
  await p.click('#libBtn'); await p.click('[data-ex="empty"]'); await p.waitForTimeout(400);
  for (const [id, kb] of [['loadcell', 'q'], ['dsens', 'w'], ['encoder', 'h'], ['accel', 'j']]) {
    check(`gereedschap ${id} bestaat`, !!(await p.$(`[data-tool="${id}"]`)));
    await p.keyboard.press(kb);
    check(`toets ${kb.toUpperCase()} kiest ${id}`, (await p.$eval(`[data-tool="${id}"]`, e => e.getAttribute('aria-pressed'))) === 'true');
  }
  const box = await p.$eval('#cv', e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const pt = { A: [cx - 120, cy + 40], B: [cx, cy + 40], C: [cx + 120, cy + 40], D: [cx, cy - 70] };
  await p.keyboard.press('n');
  for (const k of ['A', 'B', 'C', 'D']) await p.mouse.click(...pt[k]);
  await p.keyboard.press('p'); await p.mouse.click(...pt.A);
  await p.keyboard.press('l');
  await p.mouse.click(...pt.A); await p.mouse.click(...pt.B); await p.mouse.click(...pt.B); await p.mouse.click(...pt.C);
  const txt = () => p.$eval('#props', e => e.textContent);
  await p.click('[data-t="props"]');
  // krachtopnemer B-D
  await p.keyboard.press('q'); await p.mouse.click(...pt.B); await p.mouse.click(...pt.D);
  let t = await txt();
  check('krachtopnemer: inspector met k_s (N/µm), massa en uitleg', /Krachtopnemer LC1/.test(t) && /Stijfheid/.test(t) && /N\/µm/.test(t) && /1\/k/.test(t), t.slice(0, 250));
  check('krachtopnemer: standaard 100 N/µm', (await p.$eval('#lcks', e => +e.value)) === 100);
  // verplaatsingssensor op C ten opzichte van de grond (twee keer klikken)
  await p.keyboard.press('w'); await p.mouse.click(...pt.C); await p.mouse.click(...pt.C);
  t = await txt();
  check('verplaatsingssensor: bereik en resolutie', /Verplaatsingssensor DS1/.test(t) && /Bereik/.test(t) && /Resolutie/.test(t), t.slice(0, 250));
  // hoekencoder in B
  await p.keyboard.press('h'); await p.mouse.click(...pt.B);
  t = await txt();
  check('hoekencoder: counts/omwenteling en kwantisatie', /Hoekencoder HE1/.test(t) && /counts\/omw/.test(t) && /µrad/.test(t), t.slice(0, 250));
  // versnellingsopnemer op C
  await p.keyboard.press('j'); await p.mouse.click(...pt.C);
  t = await txt();
  check('versnellingsopnemer: massa 0,01 kg', /Versnellingsopnemer AC1/.test(t) && (await p.$eval('#acm', e => +e.value)) === 0.01, t.slice(0, 250));
  await p.click('[data-t="how"]'); await p.waitForTimeout(250);
  const h = await p.$eval('#howPanel', e => e.textContent);
  check('Hoe rekent dit: versnellingsopnemer met f-verschuiving', /Versnellingsopnemer/.test(h) && /m \+ m/.test(h), h.slice(-200));

  // kanalen staan onder "Sensoren" bovenaan de keuzelijst
  await p.click('#addSerie'); await p.waitForTimeout(200);
  const list = await p.$eval('#pickList', e => e.textContent);
  const groups = await p.$$eval('#pickList .g', x => x.map(e => e.textContent));
  const firstGroup = groups.find(g => g !== 'Selectie');
  check('picker: groep Sensoren staat bovenaan', firstGroup === 'Sensoren', groups.join('|'));
  check('picker: kanalen van alle vier de sensoren', /LC1/.test(list) && /DS1/.test(list) && /HE1/.test(list) && /AC1/.test(list), list.slice(0, 300));
  await p.keyboard.press('Escape');

  // voorbeeld: loadcell in de krachtweg; FRF vindt de verlaagde eigenfrequentie (14,5 Hz, zonder opnemer 15,9 Hz)
  const before = p.errs.length;
  await loadExample(p, 'loadcell');
  await p.waitForSelector('#frfNote', { state: 'attached' });
  const note = await p.$eval('#frfNote', e => e.textContent);
  const f1 = parseFloat(((note.match(/(\d+(?:[.,]\d+)?)\s*Hz/) || [])[1] || '0').replace(',', '.'));
  check('voorbeeld loadcell: FRF eigenfrequentie ~ 14,5 Hz (lager dan 15,9)', f1 > 14.0 && f1 < 15.0, note);
  check('Uitleg-kaart noemt de seriestijfheid', /8,33 N\/mm/.test(await p.$eval('#uitText', e => e.textContent)));
  // dynamica draait ook (stijve opnemer, kleine tijdstap)
  await p.click('#modeSeg [data-v="dyn"]');
  const solve = await p.$('#solveBtn');
  if (solve && await solve.isVisible()) await solve.click();
  await p.waitForFunction(() => !document.getElementById('playBtn').disabled, null, { timeout: 60000 });
  check('loadcell-voorbeeld rekent in Dynamisch zonder fouten', p.errs.length === before, p.errs.slice(before).join('|'));
  check('geen page errors', p.errs.length === 0, p.errs.join('|'));
  await p.context().close();
};
