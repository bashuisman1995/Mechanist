import { kNmm, newPage, loadExample, near, num } from '../lib.mjs';

// aantal pixels in de kleuren van het spanningsverloop (blauw - groen - geel - rood)
const rampPixels = p => p.evaluate(() => {
  const cv = document.getElementById('cv'), g = cv.getContext('2d');
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  const S = [[58, 110, 190], [38, 168, 160], [128, 198, 66], [240, 190, 40], [214, 56, 47]];
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    for (const s of S) if (Math.abs(d[i] - s[0]) < 14 && Math.abs(d[i + 1] - s[1]) < 14 && Math.abs(d[i + 2] - s[2]) < 14) { n++; break; }
  }
  return n;
});

export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url);
  const vis = sel => p.$eval(sel, e => !e.hidden && getComputedStyle(e).display !== 'none');

  // vijfde modus: de knop bestaat en schakelt om
  check('knop Stijfheid in de modusbalk', (await p.$$eval('#modeSeg button', b => b.map(x => x.textContent))).includes('Stijfheid'));
  await p.click('#modeSeg [data-v="stiff"]'); await p.waitForTimeout(250);
  check('Stijfheid: balk en uitleesblok zichtbaar', await vis('#stiffBox') && (await p.$eval('#modeSeg [data-v="stiff"]', e => e.getAttribute('aria-pressed'))) === 'true');
  const t0 = await p.$eval('#stiffBox', e => e.innerText);
  check('vierstang is een mechanisme, in gewone taal', /Mechanisme/.test(t0) && /vrij/.test(t0), t0.slice(0, 160));
  check('mechanisme: afspelen uit', await p.$eval('#playBtn', e => e.disabled));
  await p.click('#modeSeg [data-v="kin"]'); await p.waitForTimeout(300);
  check('terug naar Kinematisch: stijfheidsbalk weg, afspelen weer actief', !(await vis('#stiffBox')) && !(await p.$eval('#playBtn', e => e.disabled)));

  // voorbeelden
  for (const ex of ['stiffcant', 'stiffleaf', 'stiffportal', 'stiffmixed']) {
    const before = p.errs.length;
    await loadExample(p, ex);
    const px = await rampPixels(p);
    const ok = await vis('#stiffBar') && await vis('#stiffBox') && px > 150;
    check(`voorbeeld ${ex}: stijfheid-modus, vervorming getekend, geen fouten`, ok && p.errs.length === before, `px=${px} ${p.errs.slice(before).join('|')}`);
  }

  // uitkraging: stijfheid in punt = 3EI/L³ (zelfde waarde als de unittest), analytische waarde ernaast
  await loadExample(p, 'stiffcant');
  const k = kNmm(await p.$eval('#skVal', e => e.textContent));
  const kExact = 3 * 210000 * (20 * 27 / 12) / 200 ** 3;
  check('stijfheid in punt C = 3EI/L³ = 3,544 N/mm', near(k, kExact, 0.006), `k=${k} verwacht ${kExact}`);
  const ana = await p.$eval('#stiffBox', e => e.innerText);
  check('analytische controle naast de FE-waarde (uitkraging, f₁)', /Uitkragende balk \(Roark\)/.test(ana) && /Eerste buigfrequentie/.test(ana), ana.slice(-300));
  // richting en punt kiezen
  await p.fill('#skAng', '0'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  const kx = kNmm(await p.$eval('#skVal', e => e.textContent));
  check('stijfheid in x-richting (EA/L) is veel hoger', kx > 100 * k, `kx=${kx}`);
  await p.fill('#skAng', '-90'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);

  // eigenvormen en vergroting
  await p.waitForFunction(() => document.querySelectorAll('#stiffChips .chip').length >= 5, null, { timeout: 8000 });
  const chips = await p.$$eval('#stiffChips .chip', c => c.map(x => x.textContent));
  check('chips: statisch + eigenmodes met frequentie', chips[0] === 'Statisch' && /Mode 1 · \d/.test(chips[1]) && /Hz/.test(chips[1]), chips.join(' | '));
  const mag0 = await p.$eval('#stiffMag', e => e.textContent);
  check('vergroting automatisch (×N)', /^×\d/.test(mag0), mag0);
  await p.$eval('#stiffSc', e => { e.value = 3; e.dispatchEvent(new Event('input')); });
  check('schuifregelaar zet de vergroting op ×1000 en Auto uit', (await p.$eval('#stiffMag', e => e.textContent)).replace(/\s/g, '') === '×1000' && !(await p.$eval('#stiffAuto', e => e.checked)),
    await p.$eval('#stiffMag', e => e.textContent));
  await p.click('#stiffAuto'); await p.waitForTimeout(100);
  check('Auto herstelt de automatische vergroting', (await p.$eval('#stiffMag', e => e.textContent)) === mag0);
  await p.click('#stiffChips .chip[data-m="0"]'); await p.waitForTimeout(150);
  check('mode 1 gekozen', await p.$eval('#stiffChips .chip[data-m="0"]', e => e.classList.contains('on')));
  await p.click('#playBtn'); await p.waitForTimeout(300);
  check('afspelen animeert (pauzeknop)', /Pauzeren/.test(await p.$eval('#playBtn', e => e.title)));
  await p.click('#playBtn');
  await p.click('#stiffChips .chip[data-m="-1"]');

  // Hoe rekent dit? bevat de formules, de bronnen en de analytische waarden
  await p.click('#tabs [data-t="how"]'); await p.waitForTimeout(400);
  const how = await p.$eval('#howPanel', e => e.innerText);
  check('Hoe rekent dit?: Przemieniecki, Roark, Soemers, FL³/3EI', /Przemieniecki/.test(how) && /Roark/.test(how) && /Soemers/.test(how) && /3EI/.test(how) && /analytisch/.test(how), how.slice(0, 120));
  await p.click('#tabs [data-t="props"]');

  // gereedschap Knoop op balk
  await p.keyboard.press('o');
  check('gereedschap Knoop op balk (toets O)', (await p.$eval('#stTool', e => e.textContent)) === 'Knoop op balk');
  await p.keyboard.press('v');
  await p.close();

  // stijfheid na splitsen blijft gelijk (via de inspector van de balk)
  const q = await newPage(browser, url);
  await loadExample(q, 'stiffleaf');
  const kLeaf = kNmm(await q.$eval('#skVal', e => e.textContent));
  check('bladveer: k = 12EI/L³ = 0,886 N/mm', near(kLeaf, 0.8859, 0.001), String(kLeaf));
  const leafText = await q.$eval('#stiffBox', e => e.innerText);
  check('bladveer: analytische controle geleid, verschil 0,00 %', /Geleide uitkraging/.test(leafText) && /verschil 0,00 %/.test(leafText), leafText.slice(-200));
  check('geen page errors', q.errs.length === 0, q.errs.join('|'));
  await q.context().close();

  // inspector: stijfheid Volledig, profiel, verbinding
  const r = await newPage(browser, url);
  await loadExample(r, 'stiffportal');
  // de vervormde dwarsbalk aanklikken: zoek een pixel van het spanningsverloop aan de bovenkant van de tekening
  const pt = await r.evaluate(() => {
    const cv = document.getElementById('cv'), b = cv.getBoundingClientRect();
    // zoek een pixel van een kleur uit het verloop dicht bij de bovenrand: de dwarsbalk
    const g = cv.getContext('2d'), w = cv.width, h = cv.height, d = g.getImageData(0, 0, w, h).data;
    const S = [[58, 110, 190], [38, 168, 160], [128, 198, 66]];
    const out = [];
    for (let y = Math.round(50 * w / b.width); y < h; y += 2) for (let x = 0; x < w; x += 2) {      // de legenda linksboven slaan we over
      const i = (y * w + x) * 4;
      if (S.some(s => Math.abs(d[i] - s[0]) < 10 && Math.abs(d[i + 1] - s[1]) < 10 && Math.abs(d[i + 2] - s[2]) < 10)) out.push([x, y]);
    }
    if (!out.length) return null;
    out.sort((a, c) => a[1] - c[1]);
    const top = out[0], dpr = w / b.width;
    return { x: b.left + top[0] / dpr, y: b.top + top[1] / dpr + 3 };
  });
  check('vervormde dwarsbalk gevonden op het canvas', !!pt);
  if (pt) {
    await r.mouse.click(pt.x, pt.y); await r.waitForTimeout(200);
    const props = await r.$eval('#props', e => e.innerText);
    check('balk geselecteerd: Balk (EA + EI), Volledig, profiel', /Balk \(EA \+ EI\)/.test(props) && /Profiel/.test(props) && /Knoop op balk/.test(props), props.slice(0, 200));
    const nBefore = await r.$$eval('#stiffTab > div:first-child table tr', t => t.length);
    await r.click('#splitBtn'); await r.waitForTimeout(300);
    const nAfter = await r.$$eval('#stiffTab > div:first-child table tr', t => t.length);
    check('Knoop op balk: een punt erbij', nAfter === nBefore + 1, nBefore + ' -> ' + nAfter);
    const k2 = await r.$eval('#skVal', e => e.textContent);
    check('na splitsen blijft de stijfheid gelijk (9,45 N/mm)', /9,4\d/.test(k2), k2);
    const props2 = await r.$eval('#props', e => e.innerText);
    check('nieuw punt geselecteerd met verbinding Star (automatisch)', /Star/.test(props2) && /automatisch/.test(props2), props2.slice(0, 200));
  }
  check('geen page errors (inspector)', r.errs.length === 0, r.errs.join('|'));
  await r.context().close();

  // een model dat een mechanisme is (balk op een scharnier, zonder torsieveer) wordt in gewone taal benoemd
  const s = await newPage(browser, url);
  await s.click('#menuBtn'); await s.click('[data-a="paste"]');
  await s.fill('#modalTa', JSON.stringify({ mode: 'stiff',
    nodes: [{ id: 'n1', x: 0, y: 0, support: 'pin', name: 'A', dir: 0, m: 0 }, { id: 'n2', x: 100, y: 0, support: 'free', name: 'B', dir: 0, m: 0 }],
    elems: [{ id: 'e1', type: 'link', a: 'n1', b: 'n2', len: 100, driver: false, beam: true, prof: 'rect', pb: 10, ph: 2 }, { id: 'e2', type: 'force', node: 'n2', mag: 1, ang: 90 }] }));
  await s.click('#modalOk'); await s.waitForTimeout(500);
  const mt = await s.$eval('#stiffBox', e => e.innerText);
  check('mechanisme in gewone taal (punt B kan vrij draaien)', /Mechanisme: punt [AB] kan vrij draaien/.test(mt), mt.slice(0, 200));
  check('mechanisme: Resultaat toont vrije bewegingen', /^\+1/.test(await s.$eval('#dofVal', e => e.textContent)) && /mechanisme/.test(await s.$eval('#dofOf', e => e.textContent)));
  check('geen page errors (mechanisme)', s.errs.length === 0, s.errs.join('|'));
  await s.context().close();

  // mobiel
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('mechschets.tour1', '1'); } catch (e) {} });
  const m = await ctx.newPage(); m.errs = []; m.on('pageerror', e => m.errs.push(e.message));
  await m.goto(url); await m.waitForSelector('#menuBtn'); await m.waitForTimeout(600);
  await m.click('#libBtn'); await m.click('[data-ex="stiffportal"]'); await m.waitForTimeout(1200);
  const sw = await m.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  check('390 px: geen horizontale scroll in Stijfheid', sw[0] <= sw[1], sw.join('/'));
  check('390 px: geen page errors', m.errs.length === 0, m.errs.join('|'));
  await ctx.close();
};
