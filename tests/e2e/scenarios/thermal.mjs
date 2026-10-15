import { newPage, loadExample, dismissAsk, setScrub, vals, num } from '../lib.mjs';
export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url);

  // categorie Thermisch en beide voorbeelden staan in de bibliotheek
  await p.click('#libBtn');
  const cats = await p.$$eval('#libChips [data-c]', x => x.map(e => e.textContent));
  check('categorie Thermisch bestaat', cats.includes('Thermisch'), cats.join('|'));
  await p.keyboard.press('Escape');

  // meetarm: ΔT = 5 K, Δx en Δy van de tip gelijk aan de unit-test (Δx +13,5 en Δy +28,0 µm)
  await loadExample(p, 'thermarm');
  check('thermische verschuiving staat in het Resultaat', await p.$eval('#thermBox', e => !e.hidden));
  const dx = num((await p.$eval('#thDx', e => e.textContent)).replace(',', '.').replace('−', '-'));
  const dy = num((await p.$eval('#thDy', e => e.textContent)).replace(',', '.').replace('−', '-'));
  check('tip: Δx ~ +13,5 µm (niet nul, gelijk aan de unit-test)', Math.abs(dx - 13.53) < 0.1, String(dx));
  check('tip: Δy ~ +28,0 µm', Math.abs(dy - 27.98) < 0.1, String(dy));
  const bars = await p.$$eval('#thChart svg rect', x => x.length);
  check('gevoeligheidsgrafiek: x en y per staaf (4 balken)', bars === 4, String(bars));
  // ΔT in Instellingen verdubbelen: lineair
  await p.click('[data-t="set"]');
  await p.fill('#dTInp', '10'); await p.press('#dTInp', 'Enter'); await p.waitForTimeout(500);
  const dy2 = num((await p.$eval('#thDy', e => e.textContent)).replace(',', '.').replace('−', '-'));
  check('ΔT = 10 K geeft het dubbele Δy', Math.abs(dy2 - 2 * 27.98) < 0.3, String(dy2));
  await p.fill('#dTInp', '0'); await p.press('#dTInp', 'Enter'); await p.waitForTimeout(400);
  check('ΔT = 0: resultaatblok weg', await p.$eval('#thermBox', e => e.hidden));
  await p.fill('#dTInp', '5'); await p.press('#dTInp', 'Enter'); await p.waitForTimeout(400);
  await p.click('[data-t="how"]'); await p.waitForTimeout(300);
  const how = await p.$eval('#howPanel', e => e.textContent);
  check('Hoe rekent dit: thermische verschuiving met gevoeligheid', /Thermische verschuiving/.test(how) && /∂x\/∂L|J·dq/.test(how), how.slice(0, 200));
  check('Hoe rekent dit: bronnen zijn literatuur, geen bestandsnamen', /Nikravesh/.test(how) && !/src\//.test(how) && !/\.js\b/.test(how));
  check('Uitleg noemt athermisch ontwerp', /athermisch/.test(await p.$eval('#uitText', e => e.textContent)));

  // inspector: een stang wordt axiaal, met materiaal en eigen ΔT
  await p.click('#libBtn'); await p.click('[data-ex="empty"]'); await dismissAsk(p); await p.waitForTimeout(400);
  const box = await p.$eval('#cv', e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  await p.keyboard.press('n'); await p.mouse.click(cx - 100, cy); await p.mouse.click(cx + 100, cy);
  await p.keyboard.press('p'); await p.mouse.click(cx - 100, cy);
  await p.keyboard.press('l'); await p.mouse.click(cx - 100, cy); await p.mouse.click(cx + 100, cy);
  await p.click('[data-t="props"]');
  check('stang: materiaal, eigen ΔT en stijfheid in de inspector', !!(await p.$('#lmat')) && !!(await p.$('#ldt')) && !!(await p.$('#lst')));
  await p.selectOption('#lst', 'axial'); await p.waitForTimeout(300);
  check('axiaal: doorsnede-invoer en live k = EA/L', !!(await p.$('#lA')) && /EA\/L/.test(await p.$eval('#axLive', e => e.textContent)));
  await p.selectOption('#lmat', 'alu'); await p.waitForTimeout(200);
  await p.fill('#ldt', '3'); await p.press('#ldt', 'Enter'); await p.waitForTimeout(300);
  const live = await p.$eval('#axLive', e => e.textContent);
  check('axiale staaf: aluminium, ΔT = 3 K, rek in µm', /23,6/.test(live) && /3[^\d]/.test(live) && /µm/.test(live), live);
  await p.selectOption('#lsect', 'bh'); await p.waitForTimeout(200);
  check('profiel b × h', !!(await p.$('#lsb')) && !!(await p.$('#lsh')));
  await p.click('[data-t="how"]'); await p.waitForTimeout(300);
  check('Hoe rekent dit: axiale stang met N = −E·A·α·ΔT', /Axiale stang/.test(await p.$eval('#howPanel', e => e.textContent)));

  // thermische spanning: ΔT = 20 K, N = −96,6 N in Evenwicht
  const before = p.errs.length;
  await loadExample(p, 'thermclamp');
  await setScrub(p, 360); await p.waitForTimeout(300);
  const v = await vals(p);
  const N1 = num(v[0]);
  check('ingeklemde staaf: N = −96,6 N (druk)', Math.abs(N1 + 96.6) < 1.5, v.join('|'));
  check('ingeklemde staaf: σ = −48,3 MPa', Math.abs(num(v[1]) + 48.3) < 1, v.join('|'));
  check('thermclamp rekent zonder fouten', p.errs.length === before, p.errs.slice(before).join('|'));
  check('geen page errors', p.errs.length === 0, p.errs.join('|'));
  await p.context().close();
};
