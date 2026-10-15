import { newPage, visible } from '../lib.mjs';
const SHOT = '/tmp/claude-0/-home-user-Mechanist/1e45fc4c-94b6-53cc-82eb-8e0cec55c972/scratchpad/';
export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url);
  const res = () => p.$eval('[data-res="Stijfheid c_x"]', e => e.textContent);
  const slide = (id, pos) => p.$eval(`[data-sl="${id}"]`, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, pos);
  const frame = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await p.click('#workSeg [data-w="calc"]');
  check('calculators zichtbaar, schets verborgen', (await visible(p, '#calcRoot')) && !(await visible(p, '.main')));
  check('lijst bevat 12 calculators', (await p.$$('#calcList .calc-item')).length === 12);
  const r0 = await res();
  check('Bladveer: c_x = 2,1 N/mm', /^2,1\s*N\/mm/.test(r0), r0);
  await p.fill('[data-in="t"]', '0.1');
  const r1 = await res();
  check('resultaat past zich aan (t=0,1: 0,263 N/mm)', /^0,26/.test(r1), r1);
  await p.fill('[data-in="u"]', '5');
  check('waarschuwing bij te grote spanning', (await p.$$('.calc-warn')).length === 1);
  await p.selectOption('#calcMat', 'alu');
  check('materiaalinfo bijgewerkt', /70 GPa/.test(await p.$eval('#calcMatInfo', e => e.textContent)));
  await p.fill('[data-in="u"]', '0.5');

  // slider: getalveld, resultaat en SVG-attribuut veranderen mee
  await p.fill('[data-in="t"]', '0.2');
  const before = { n: await p.$eval('[data-in="t"]', e => e.value), r: await res(), w: await p.$eval('#calcSvg .s-leaf', e => e.getAttribute('stroke-width') + e.getAttribute('d')) };
  await slide('t', 900); await frame();
  const after = { n: await p.$eval('[data-in="t"]', e => e.value), r: await res(), w: await p.$eval('#calcSvg .s-leaf', e => e.getAttribute('stroke-width') + e.getAttribute('d')) };
  check('slider t: getalveld verandert', before.n !== after.n && +after.n > 0.5, before.n + ' -> ' + after.n);
  check('slider t: resultaat verandert', before.r !== after.r, before.r + ' -> ' + after.r);
  check('slider t: SVG-attribuut verandert', before.w !== after.w);
  await p.fill('[data-in="L"]', '40');
  check('getalveld zet slider mee', (await p.$eval('[data-sl="L"]', e => +e.value)) > 500);
  const dBefore = await p.$eval('#calcSvg .s-leaf', e => e.getAttribute('d'));
  await slide('u', 1000); await frame();
  check('slider u: tekening buigt mee', dBefore !== await p.$eval('#calcSvg .s-leaf', e => e.getAttribute('d')));
  check('veiligheid rood bij te grote u', (await p.$eval('[data-key="2"]', e => e.dataset.status)) === 'bad');
  check('3 grote kerngetallen', (await p.$$('.calc-key')).length === 3);

  // onthouden per calculator + reset
  await p.fill('[data-in="b"]', '23');
  await p.click('[data-c="par"]'); await p.click('[data-c="leaf"]');
  check('waarden onthouden bij wisselen', (await p.$eval('[data-in="b"]', e => e.value)) === '23');
  await p.click('#calcReset');
  check('reset zet beginwaarden terug', (await p.$eval('[data-in="b"]', e => e.value)) === '10' && (await res()).startsWith('2,1'));
  await p.fill('[data-in="t"]', '0.2'); await p.fill('[data-in="u"]', '0.5'); await p.selectOption('#calcMat', 'staal');

  for (const id of ['par', 'cross', 'notch', 'wire']) {
    await p.click(`[data-c="${id}"]`);
    check(`${id}: resultaten en formules`, (await p.$$('#calcOut > div')).length >= 7);
    const k = id === 'cross' || id === 'notch' ? 'phi' : 'u';
    const d0 = await p.$eval('#calcSvg', e => e.innerHTML);
    await slide(k, 800); await frame();
    check(`${id}: tekening past zich aan`, d0 !== await p.$eval('#calcSvg', e => e.innerHTML));
  }
  await p.click('[data-c="leaf"]');
  await p.click('summary:has-text("Formules")'); await frame();
  check('formules uitklapbaar met eigen getallen', (await p.$$('#calcFormulas .fm')).length >= 4 && /met jouw getallen/.test(await p.$eval('#calcFormulas', e => e.textContent)));
  // aandrijving: stijf <-> zacht verandert c_z
  const cz = () => p.$eval('[data-res="Steunstijfheid c_z bij u"]', e => e.textContent);
  const czStiff = await cz();
  await p.selectOption('[data-in="drive"]', 'soft');
  const czSoft = await cz();
  check('aandrijving zacht: c_z verandert (kleiner)', czStiff !== czSoft && /zacht/.test(czSoft) && /stijf/.test(czStiff), czStiff + ' -> ' + czSoft);
  const val = t => parseFloat(t.replace(/ /g, '').replace(',', '.'));
  check('c_z stijf ~19,0 kN/mm, zacht ~2,08 kN/mm', Math.abs(val(czStiff) - 18.97) < 0.1 && Math.abs(val(czSoft) - 2.08) < 0.1, czStiff + ' / ' + czSoft);
  // geen punt als duizendtalscheiding: notch geeft 4 228 N·mm/rad
  await p.click('[data-c="notch"]');
  const cphi = await p.$eval('[data-res="Draaistijfheid c_φ"]', e => e.textContent);
  check('getalnotatie: dunne spatie, geen punt (4 228)', /^4 228\s/.test(cphi) && !/\d\.\d{3}/.test(cphi), JSON.stringify(cphi));
  check('draaistijfheid ook in N·m/rad', /4,23\s*N·m\/rad/.test(await p.$eval('[data-res="Draaistijfheid c_φ (SI)"]', e => e.textContent)));
  check('veiligheidsfactor n aanwezig', /^\d/.test(await p.$eval('[data-res="Veiligheidsfactor n = σ_toel/σ"]', e => e.textContent)));
  await p.click('[data-c="cross"]');
  check('kruisveer: belastingafhankelijke stijfheid als notitie', /niet meegenomen/.test(await p.$eval('[data-res="Stijfheid onder belasting"]', e => e.parentElement.textContent)));
  await p.click('[data-c="leaf"]');
  check('stijfheid in N/µm', /^0,0021\s*N\/µm/.test(await p.$eval('[data-res="Stijfheid c_x in N/µm"]', e => e.textContent)));
  // materiaal: α, ρ, bron; σ_toel aanpasbaar
  const mi = await p.$eval('#calcMatInfo', e => e.textContent), ms = await p.$eval('#calcMatSrc', e => e.textContent);
  check('materiaalregel met α, ρ en σ_toel-uitleg', /α =/.test(mi) && /ρ =/.test(mi) && /vermoeiingssterkte/.test(mi));
  check('Bron materiaalgegevens', /^Bron materiaalgegevens:/.test(ms) && /MatWeb/.test(ms));
  const opts = await p.$$eval('#calcMat option', o => o.map(x => x.textContent));
  check('CuBe2 en fosforbrons apart', opts.some(x => /CuBe2/.test(x)) && opts.some(x => /Fosforbrons/.test(x)) && !opts.some(x => /Brons \/ CuBe/.test(x)), opts.join('|'));
  const nOf = () => p.$eval('[data-res="Veiligheidsfactor n = σ_toel/σ"]', e => e.textContent);
  const n0 = await nOf();
  await p.fill('#calcSigma', '600');
  check('σ_toel aanpasbaar: n verdubbelt', Math.abs(val(await nOf()) / val(n0) - 2) < 0.05, n0 + ' -> ' + await nOf());
  await p.fill('#calcSigma', '300');
  // waarschuwingen
  await p.fill('[data-in="u"]', '3');
  check('waarschuwing u/L > 0,1', /u\/L/.test(await p.$eval('#calcWarn', e => e.textContent)));
  await p.fill('[data-in="u"]', '0.5'); await p.fill('[data-in="L"]', '3');
  check('waarschuwing L/t < 20', /L\/t/.test(await p.$eval('#calcWarn', e => e.textContent)));
  await p.fill('[data-in="L"]', '20');
  await p.fill('[data-in="F"]', '10');
  check('c_x(F) = 2,1 - 1,2*10/20 = 1,5 N/mm', /^1,5\s*N\/mm/.test(await p.$eval('[data-res="Dwarsstijfheid onder F: c_x(F)"]', e => e.textContent)));
  await p.fill('[data-in="F"]', '0');
  // Formules: bronnen zijn literatuur
  await frame();
  const fsrc = await p.$$eval('#calcFormulas .fm-s', e => e.map(x => x.textContent));
  check('elke formule met literatuurbron, geen bestandsnamen', fsrc.length >= 10 && fsrc.every(x => !/\.(js|mjs)\b/.test(x)) && fsrc.some(x => /Soemers/.test(x)), String(fsrc.length));
  check('Formules tonen afleiding van de 700', /700/.test(await p.$eval('#calcFormulas', e => e.textContent)));

  // Kopieer: platte tekst
  await p.selectOption('[data-in="drive"]', 'stiff');
  await p.click('#calcCopy');
  const sheet = await p.$eval('#calcCopy', e => e.dataset.sheet || '');
  check('Kopieer: rekenblad met invoer, uitkomsten, formules, bronnen, versie', /INVOER/.test(sheet) && /UITKOMSTEN/.test(sheet) && /FORMULES/.test(sheet) && /BRONNEN/.test(sheet) && /Soemers/.test(sheet) && /L = 20 mm/.test(sheet) && /Stijfheid c_x = 2,1 N\/mm/.test(sheet) && /v0\.\d/.test(sheet) && /20\d\d-\d\d-\d\d/.test(sheet) && !/<[a-z]+>/.test(sheet), sheet.slice(0, 200));
  check('Kopieer: melding getoond', /gekopieerd|geweigerd/i.test(await p.$eval('#calcActMsg', e => e.textContent)));

  // Link: invoer in hash, nieuwe pagina herstelt waarden
  await p.fill('[data-in="L"]', '33'); await p.fill('[data-in="t"]', '0.15'); await p.selectOption('[data-in="drive"]', 'soft');
  await p.selectOption('#calcMat', 'cube'); await p.fill('#calcSigma', '450');
  await p.click('#calcLink');
  const link = await p.$eval('#calcLink', e => e.dataset.url || '');
  check('Link: hash met invoer', /#calc=leaf&/.test(link) && /L=33/.test(link) && /drive=soft/.test(link) && /mat=cube/.test(link) && /sig=450/.test(link), link);
  const ctx2 = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await ctx2.addInitScript(() => { try { localStorage.setItem('mechschets.tour1', '1'); } catch (e) {} });
  const p2 = await ctx2.newPage(); p2.errs = [];
  p2.on('pageerror', e => p2.errs.push(e.message));
  await p2.goto(link); await p2.waitForSelector('#calcDetail [data-in="L"]');
  const back = await p2.evaluate(() => ({ L: document.querySelector('[data-in="L"]').value, t: document.querySelector('[data-in="t"]').value, drive: document.querySelector('[data-in="drive"]').value, mat: document.querySelector('#calcMat').value, sig: document.querySelector('#calcSigma').value, on: !document.getElementById('calcRoot').hidden }));
  check('Link: calculator en waarden hersteld bij laden', back.on && back.L === '33' && back.t === '0.15' && back.drive === 'soft' && back.mat === 'cube' && back.sig === '450', JSON.stringify(back));
  check('Link: geen page errors', p2.errs.length === 0, p2.errs.join('|'));
  await ctx2.close();
  // terug naar beginwaarden voor de rest
  await p.fill('[data-in="L"]', '20'); await p.fill('[data-in="t"]', '0.2'); await p.selectOption('[data-in="drive"]', 'stiff'); await p.selectOption('#calcMat', 'staal');
  await p.screenshot({ path: SHOT + 'calc3.png' });
  await p.screenshot({ path: SHOT + 'calc2_desktop.png' });
  await p.emulateMedia({ colorScheme: 'dark' });
  await p.click('[data-c="notch"]');
  await p.screenshot({ path: SHOT + 'calc2_dark.png' });
  await p.emulateMedia({ colorScheme: 'light' });
  await p.click('[data-c="leaf"]');
  await p.setViewportSize({ width: 390, height: 800 });
  await p.waitForTimeout(200);
  for (const id of ['leaf', 'par', 'cross', 'notch', 'wire']) {
    await p.click(`[data-c="${id}"]`);
    const w = await p.evaluate(() => [document.documentElement.scrollWidth, document.body.scrollWidth, document.querySelector('.calc-detail').scrollWidth, innerWidth]);
    check(`390 px: geen horizontale scroll (${id})`, w[0] <= w[3] && w[1] <= w[3] && w[2] <= w[3], w.join(','));
  }
  await p.click('[data-c="leaf"]');
  const order = await p.evaluate(() => { const f = document.querySelector('.calc-fig').getBoundingClientRect().top, k = document.querySelector('.calc-keys').getBoundingClientRect().top, i = document.querySelector('.calc-inputs').getBoundingClientRect().top; return [f, k, i]; });
  check('390 px: tekening eerst, dan kerngetallen, dan invoer', order[0] < order[1] && order[1] < order[2], order.join(','));
  await p.screenshot({ path: SHOT + 'calc2_390.png' });
  await p.setViewportSize({ width: 1366, height: 768 });
  await p.click('#workSeg [data-w="sketch"]');
  check('terug naar schets', (await visible(p, '.main')) && !(await visible(p, '#calcRoot')));
  check('geen page errors', p.errs.length === 0, p.errs.join('|'));
  await p.context().close();
};
