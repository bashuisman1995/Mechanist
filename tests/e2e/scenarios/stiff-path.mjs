// Stijfheid: verloop langs een pad van balken in de lade, waarden en formules van verplaatsingskanalen.
import { newPage, loadExample, near, num } from '../lib.mjs';
const SHOT = '/tmp/claude-0/-home-user-Mechanist/1e45fc4c-94b6-53cc-82eb-8e0cec55c972/scratchpad/';
const nonEmpty = (p, sel) => p.evaluate(s => {
  const cv = document.querySelector(s), g = cv.getContext('2d'), d = g.getImageData(0, 0, cv.width, cv.height).data;
  let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n;
}, sel);
export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url);
  const vis = sel => p.$eval(sel, e => !e.hidden && getComputedStyle(e).display !== 'none');
  await loadExample(p, 'stiffcant');
  check('lade: keuzeknop Tabellen / Verloop zichtbaar, tabellen standaard', await vis('#stiffView') && await vis('#stiffTab') && !(await vis('.plotwrap')));
  check('lade: Metingen… en ƒ Formule beschikbaar in Stijfheid', await vis('#addSerie') && await vis('#addFx'));
  await p.click('#stiffView [data-v="pad"]'); await p.waitForTimeout(250);
  check('verloop: plot en padbediening zichtbaar, tabellen weg', await vis('.plotwrap') && await vis('#pathCtl') && !(await vis('#stiffTab')));
  const empty = await nonEmpty(p, '#plot');
  await p.click('#pathCtl [data-a="all"]'); await p.waitForTimeout(250);
  const full = await nonEmpty(p, '#plot');
  check('pad: alle balken geeft een grafiek', full > empty && (await p.$$('#pcBars .chip[aria-pressed="true"]')).length >= 1, `${empty} -> ${full}`);
  await p.screenshot({ path: SHOT + 'open_path_cant.png' });
  // pad over drie balken (portaal)
  await loadExample(p, 'stiffportal');
  await p.click('#stiffView [data-v="pad"]'); await p.waitForTimeout(250);
  await p.click('#pathCtl [data-a="all"]'); await p.waitForTimeout(250);
  const nb = (await p.$$('#pcBars .chip[aria-pressed="true"]')).length;
  check('portaal: alle balken in het pad', nb >= 2, 'n=' + nb);
  const st = await p.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('mechschets.r1') || '{}').stiffPath || null));
  await p.click('#pcQ [data-q="M"]'); await p.click('#pcQ [data-q="sig"]'); await p.click('#pcQ [data-q="th"]'); await p.waitForTimeout(250);
  await p.screenshot({ path: SHOT + 'open_path_portal.png' });
  // aanwijzer: waarden in de kop
  const box = await p.$eval('#plot', e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await p.mouse.move(box.x + box.w * 0.5, box.y + box.h * 0.4); await p.waitForTimeout(150);
  await p.screenshot({ path: SHOT + 'open_path_hover.png' });
  // eerst een bal wissen en weer kiezen door klikken op een chip
  await p.click('#pathCtl [data-a="clear"]'); await p.waitForTimeout(150);
  check('wis: pad leeg', (await p.$$('#pcBars .chip[aria-pressed="true"]')).length === 0);
  await p.click('#pcBars .chip >> nth=0'); await p.waitForTimeout(150);
  check('chip kiest een balk', (await p.$$('#pcBars .chip[aria-pressed="true"]')).length === 1);
  await p.click('#pathCtl [data-a="rev"]');
  // klik een balk in de tekening: komt achteraan in het pad
  const before = (await p.$$('#pcBars .chip[aria-pressed="true"]')).length;
  const pos = await p.evaluate(() => { const m = window.__pickBarPos; return m || null; });
  // metingen: verplaatsingskanaal en formule
  await p.click('#addSerie'); await p.waitForTimeout(200);
  const chips = await p.$$eval('#pickList .chip', c => c.map(x => x.textContent));
  check('picker bevat verplaatsingen van punten en balkgrootheden', chips.indexOf('uₓ') >= 0 && chips.indexOf('|u|') >= 0 && chips.indexOf('σmax') >= 0, chips.slice(0, 12).join(' '));
  await p.click('#pickList .chip >> nth=1'); await p.click('#pickOk'); await p.waitForTimeout(200);
  const vtxt = await p.$eval('#series [data-v]', e => e.textContent);
  check('meting toont een waarde in µm', /µm|mm|nm/.test(vtxt) && isFinite(num(vtxt)), vtxt);
  await p.click('#addFx'); await p.waitForTimeout(150);
  const al = await p.$eval('#pickList .chip', c => c.title);
  await p.fill('#pickFxInp', 'hypot(' + (await p.$$eval('#pickList .chip', c => c.filter(x => /uₓ/.test(x.textContent))[0].title)).split('in formules: ')[1] + ', 1)');
  await p.click('#pickOk'); await p.waitForTimeout(200);
  const vals = await p.$$eval('#series [data-v]', e => e.map(x => x.textContent));
  check('formule werkt op statische waarden', vals.length === 2 && /\d/.test(vals[1]) && !/onbekend/.test(vals[1]), vals.join(' | '));
  await p.screenshot({ path: SHOT + 'open_path_series.png' });
  // rekenblad: pad als afbeelding en de losse metingen
  await p.click('#menuBtn'); await p.click('#menu [data-a="report"]'); await p.waitForTimeout(300);
  const rep = await p.$eval('#report', e => ({ t: e.innerText, imgs: e.querySelectorAll('img[alt="Verloop langs het gekozen pad"]').length }));
  check('rekenblad bevat het verloop langs het pad en de meting', rep.imgs === 1 && /Verloop langs een pad/.test(rep.t) && /Metingen/.test(rep.t), rep.t.slice(0, 80));
  await p.screenshot({ path: SHOT + 'open_path_report.png' });
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  // terug naar tabellen en naar Kinematisch: geen paginafouten, Kinematisch ziet de stijfheidsmetingen niet
  await p.click('#stiffView [data-v="tab"]'); await p.waitForTimeout(150);
  check('tabellen terug', await vis('#stiffTab') && !(await vis('.plotwrap')));
  await p.click('#modeSeg [data-v="kin"]'); await p.waitForTimeout(300);
  check('Kinematisch: stijfheidsmeting niet in de lijst, lade normaal', (await p.$$('#series .serie')).length === 0 && !(await vis('#stiffView')));
  // telefoonbreedte: de lade zit in het tabblad Metingen
  await loadExample(p, 'stiffportal');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await p.click('#tabs [data-t="meas"]'); await p.waitForTimeout(250);
  await p.click('#stiffView [data-v="pad"]'); await p.waitForTimeout(250);
  await p.click('#pathCtl [data-a="all"]'); await p.waitForTimeout(300);
  const ov = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, cw: document.getElementById('plot').getBoundingClientRect().width }));
  check('390 px: geen horizontale scroll en het verloop heeft breedte', ov.sw <= ov.iw + 1 && ov.cw > 200, JSON.stringify(ov));
  await p.screenshot({ path: SHOT + 'open_path_390.png' });
  check('geen paginafouten', p.errs.length === 0, p.errs.join('|'));
  await p.close();
};
