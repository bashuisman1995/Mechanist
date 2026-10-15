// Calculators Contact, Dynamica, Thermisch: waarden uit handberekeningen, sliders, tekening, Kopieer/Link en 390 px.
import { newPage } from '../lib.mjs';
const SHOT = '/tmp/claude-0/-home-user-Mechanist/1e45fc4c-94b6-53cc-82eb-8e0cec55c972/scratchpad/';
export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url);
  const frame = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const slide = (id, pos) => p.$eval(`[data-sl="${id}"]`, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, pos);
  const res = k => p.$eval(`[data-res="${k}"]`, e => e.textContent.replace(/\s+/g, ' ').trim());
  const val = t => parseFloat(t.replace(/ /g, '').replace(',', '.'));
  const key = n => p.$eval(`[data-key="${n}"]`, e => e.textContent.replace(/\s+/g, ' '));
  await p.click('#workSeg [data-w="calc"]');
  check('lijst bevat 12 calculators in 4 groepen', (await p.$$('#calcList .calc-item')).length === 12 && (await p.$$('#calcList .calc-group')).length === 4);

  // Hertz: staal/staal, R = 5 mm, F = 10 N: a = 68,8 µm, p0 = 1010 MPa, k = 15,9 N/µm
  await p.click('[data-c="hertz"]');
  check('Hertz: a = 68,8 µm', Math.abs(val(await res('Contactstraal a')) - 68.8) < 0.3, await res('Contactstraal a'));
  check('Hertz: p0 = 1 010 MPa (dunne spatie)', /^1 010 MPa/.test(await res('Maximale druk p₀')), await res('Maximale druk p₀'));
  check('Hertz: k_n = 15,9 N/µm', /^15,9 N\/µm/.test(await res('Normaalstijfheid k_n')), await res('Normaalstijfheid k_n'));
  check('Hertz: p0,toel standaard 1,6·σ_y = 1600', (await p.$eval('#calcSigma', e => e.value)) === '1600');
  await p.fill('[data-in="F"]', '100');
  check('Hertz: waarschuwing p0 boven p0,toel (F = 100 N)', /p₀,toel/.test(await p.$eval('#calcWarn', e => e.textContent)) && (await p.$eval('[data-key="2"]', e => e.dataset.status)) === 'bad', await key(2));
  await p.fill('[data-in="F"]', '10');
  await p.selectOption('[data-in="mat2"]', 'alu');
  check('Hertz: materiaalwissel zet p0,toel op 1,6·275 = 440', (await p.$eval('#calcSigma', e => e.value)) === '440', await p.$eval('#calcSigma', e => e.value));
  await p.selectOption('[data-in="mat2"]', 'staal');
  await p.selectOption('[data-in="n"]', '2'); await p.fill('[data-in="theta"]', '45');
  check('Hertz: V-groef n = 2, θ = 45°: F_n = 7,07 N', /^7,07 N/.test(await res('Normaalkracht per contact F_n')), await res('Normaalkracht per contact F_n'));
  await p.selectOption('[data-in="n"]', '1'); await p.fill('[data-in="theta"]', '0');
  const svg0 = await p.$eval('#calcSvg', e => e.innerHTML);
  await slide('F', 900); await frame();
  check('Hertz: slider F verandert getalveld, uitkomst en tekening', +(await p.$eval('[data-in="F"]', e => e.value)) > 100 && svg0 !== await p.$eval('#calcSvg', e => e.innerHTML));
  await p.fill('[data-in="F"]', '10');

  // Kinematische koppeling: F = 60 N, R = 6, 90°: N = 14,1 N
  await p.click('[data-c="kc"]');
  check('KC: N = 14,1 N per contact', /^14,1 N/.test(await res('Normaalkracht per contact N')), await res('Normaalkracht per contact N'));
  check('KC: k_ax = 56,8 N/µm', /^56,8 N\/µm/.test(await res('Koppelingsstijfheid langs de as k_ax')), await res('Koppelingsstijfheid langs de as k_ax'));
  check('KC: virtueel spel gemarkeerd als schatting', /schatting/.test(await key(1)));
  await p.fill('[data-in="mu"]', '0.3');
  check('KC: μ verdubbelt het virtuele spel (204 → 407 nm)', Math.abs(val(await res('Virtueel spel (volledig slippen)')) - 407) < 4, await res('Virtueel spel (volledig slippen)'));
  await p.fill('[data-in="mu"]', '0.15');

  // Massa-veer-demper: 2 kg, 5 N/mm: 7,96 Hz, ζ = 5 %; ζ -> c en Q
  await p.click('[data-c="msd"]');
  check('MSD: f_n = 7,96 Hz', /^7,96 Hz/.test(await res('Eigenfrequentie f_n')), await res('Eigenfrequentie f_n'));
  check('MSD: geen materiaalsectie', (await p.$$('#calcMat')).length === 0 && (await p.$$('[data-sec="Materiaal"]')).length === 0);
  await p.selectOption('[data-in="dmode"]', 'Q'); await p.fill('[data-in="dval"]', '20');
  check('MSD: Q = 20 geeft ζ = 2,5 %', /^2,5 %/.test(await res('Dempingsverhouding ζ')), await res('Dempingsverhouding ζ'));
  await p.selectOption('[data-in="dmode"]', 'c'); await p.fill('[data-in="dval"]', '10');
  check('MSD: c = 10 N·s/m geeft ζ = 5 %', /^5 %/.test(await res('Dempingsverhouding ζ')), await res('Dempingsverhouding ζ'));
  const d0 = await p.$eval('#calcSvg .s-curve', e => e.getAttribute('d'));
  await slide('k', 900); await frame();
  check('MSD: slider k verandert stapresponsie-curve', d0 !== await p.$eval('#calcSvg .s-curve', e => e.getAttribute('d')));
  await p.selectOption('[data-in="dmode"]', 'zeta'); await p.fill('[data-in="dval"]', '5'); await p.fill('[data-in="k"]', '5');

  // Trillingsisolatie
  await p.click('[data-c="iso"]');
  check('ISO: f_n = 2,25 Hz en T = 0,0172', /^2,25 Hz/.test(await res('Eigenfrequentie f_n')) && /^0,0172/.test(await res('Transmissibiliteit T bij f')));
  check('ISO: 35,3 dB isolatie', /^35,3 dB/.test(await res('Isolatie bij f')));
  await p.fill('[data-in="fd"]', '2');
  check('ISO: onder √2·f_n waarschuwing en rode kerngetal', /versterkt/.test(await p.$eval('#calcWarn', e => e.textContent)) && (await p.$eval('[data-key="2"]', e => e.dataset.status)) === 'bad');
  await p.fill('[data-in="fd"]', '20');

  // Servo-vuistregels
  await p.click('[data-c="servo"]');
  check('Servo: f_bw = 100 Hz, k_servo = 0,79 N/µm, fout 1,27 µm', /^100 Hz/.test(await res('Bandbreedte f_bw ≈ f_n/verhouding')) && /^0,79 N\/µm/.test(await res('Servostijfheid k_servo = m·(2π·f_bw)²')) && /^1,27 µm/.test(await res('Positiefout x = F_d/k_servo')));
  check('Servo: vuistregel benoemd in kerngetallen', /vuistregel/.test(await key(0)));
  await p.fill('[data-in="xmax"]', '2');
  check('Servo: fout binnen toegestaan geeft geen waarschuwing', (await p.$$('.calc-warn')).length === 0);
  await p.fill('[data-in="xmax"]', '1');

  // Uitzetting: alu 100 mm, 5 K = 11,8 µm; athermisch L2 = 205,2
  await p.click('[data-c="exp"]');
  check('Uitzetting: ΔL₁ = 11,8 µm', /^11,8 µm/.test(await res('Uitzetting staaf 1: ΔL₁ = α₁·L₁·ΔT')), await res('Uitzetting staaf 1: ΔL₁ = α₁·L₁·ΔT'));
  check('Uitzetting: athermale L₂ = 205 mm', /^205 mm/.test(await res('Athermale lengte L₂ = L₁·α₁/α₂')), await res('Athermale lengte L₂ = L₁·α₁/α₂'));
  check('Uitzetting: geen σ_toel-veld', (await p.$$('#calcSigma')).length === 0);
  await p.fill('[data-in="L2"]', '100');
  check('Uitzetting: L₂ = 100: ΔP = −6,05 µm', /^−6,05 µm/.test(await res('Netto verplaatsing ΔP = ΔL₂ − ΔL₁')), await res('Netto verplaatsing ΔP = ΔL₂ − ΔL₁'));
  await p.selectOption('[data-in="mat2"]', 'invar'); await frame();
  check('Uitzetting: Invar als staaf 2: 0,12 µm/K', /^0,12 µm\/K/.test(await res('Uitzetting per kelvin, staaf 2')), await res('Uitzetting per kelvin, staaf 2'));
  await p.selectOption('[data-in="mat2"]', 'staal'); await p.fill('[data-in="L2"]', '205');

  // Tijdconstante: alu-blok 100×50×20, h = 10: 25,2 min
  await p.click('[data-c="tau"]');
  check('Tijdconstante: τ = 25,2 min', /^25,2 min/.test(await res('Tijdconstante τ')), await res('Tijdconstante τ'));
  check('Tijdconstante: Biot ≪ 0,1', val(await res('Biot-getal h·(V/A)/k')) < 0.001);
  await p.fill('[data-in="h"]', '1000'); await p.fill('[data-in="L"]', '100');
  check('Tijdconstante: groot Biot-getal geeft waarschuwing', /Biot/.test(await p.$eval('#calcWarn', e => e.textContent)) || (await p.$$('.calc-warn')).length > 0);
  await p.fill('[data-in="h"]', '10');

  // alle nieuwe: structuur, formules, tekening past zich aan, Kopieer, Link
  const sl = { hertz: 'R1', kc: 'F', msd: 'm', iso: 'fd', servo: 'fn', exp: 'L2', tau: 't' };
  for (const id of Object.keys(sl)) {
    await p.click(`[data-c="${id}"]`);
    check(`${id}: resultaten en drie kerngetallen`, (await p.$$('#calcOut > div')).length >= 9 && (await p.$$('.calc-key')).length === 3);
    const s0 = await p.$eval('#calcSvg', e => e.innerHTML);
    await slide(sl[id], 850); await frame();
    check(`${id}: tekening past zich aan met slider`, s0 !== await p.$eval('#calcSvg', e => e.innerHTML));
    await p.click('#calcReset'); await frame();
    if (!(await p.$eval('details[data-sec="Formules"]', e => e.open))) await p.click('summary:has-text("Formules")');
    await frame();
    const ftxt = await p.$eval('#calcFormulas', e => e.textContent), fsrc = await p.$$eval('#calcFormulas .fm-s', e => e.map(x => x.textContent));
    check(`${id}: formules met eigen getallen en literatuur, geen bestandsnamen`, (await p.$$('#calcFormulas .fm')).length >= 4 && /met jouw getallen/.test(ftxt) && fsrc.length >= 3 && fsrc.every(x => !/\.(js|mjs)\b/.test(x)));
    check(`${id}: Aannames en bron`, (await p.$$eval('.calc-assume li', e => e.length)) >= 3);
    check(`${id}: Kopieer / Link / Reset aanwezig`, (await p.$$('#calcCopy, #calcLink, #calcReset')).length === 3);
  }
  // Kopieer en Link op Hertz
  await p.click('[data-c="hertz"]');
  await p.fill('[data-in="R1"]', '3'); await p.selectOption('[data-in="mat1"]', 'wc'); await p.fill('#calcSigma', '2500');
  await p.click('#calcCopy');
  const sheet = await p.$eval('#calcCopy', e => e.dataset.sheet || '');
  check('Kopieer: Hertz-rekenblad met invoer, materialen, uitkomsten, formules en bronnen', /INVOER/.test(sheet) && /Straal bol R₁ = 3 mm/.test(sheet) && /Hardmetaal/.test(sheet) && /p₀,toel = 2\s500 MPa/.test(sheet) && /UITKOMSTEN/.test(sheet) && /FORMULES/.test(sheet) && /Johnson/.test(sheet) && !/<[a-z]+>/.test(sheet), sheet.slice(0, 300));
  await p.click('#calcLink');
  const link = await p.$eval('#calcLink', e => e.dataset.url || '');
  check('Link: hash met calculator, invoer en materialen', /#calc=hertz&/.test(link) && /R1=3/.test(link) && /mat1=wc/.test(link) && /sig=2500/.test(link), link);
  const ctx2 = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await ctx2.addInitScript(() => { try { localStorage.setItem('mechschets.tour1', '1'); } catch (e) {} });
  const p2 = await ctx2.newPage(); p2.errs = [];
  p2.on('pageerror', e => p2.errs.push(e.message));
  await p2.goto(link); await p2.waitForSelector('#calcDetail [data-in="R1"]');
  const back = await p2.evaluate(() => ({ R1: document.querySelector('[data-in="R1"]').value, m1: document.querySelector('[data-in="mat1"]').value, sig: document.querySelector('#calcSigma').value, on: !document.getElementById('calcRoot').hidden }));
  check('Link: Hertz-waarden en materiaal hersteld', back.on && back.R1 === '3' && back.m1 === 'wc' && back.sig === '2500', JSON.stringify(back));
  check('Link: geen page errors', p2.errs.length === 0, p2.errs.join('|'));
  await ctx2.close();
  await p.click('#calcReset');

  // 390 px
  await p.setViewportSize({ width: 390, height: 800 });
  await p.waitForTimeout(200);
  for (const id of Object.keys(sl)) {
    await p.click(`[data-c="${id}"]`);
    const w = await p.evaluate(() => [document.documentElement.scrollWidth, document.body.scrollWidth, document.querySelector('.calc-detail').scrollWidth, innerWidth]);
    check(`390 px: geen horizontale scroll (${id})`, w[0] <= w[3] && w[1] <= w[3] && w[2] <= w[3], w.join(','));
    await p.evaluate(() => { document.querySelector('.calc-detail').scrollTop = 0; });
    if (['iso', 'kc'].indexOf(id) >= 0) await p.screenshot({ path: SHOT + 'calc4_390_' + id + '.png' });
  }
  await p.setViewportSize({ width: 1366, height: 768 });
  await p.emulateMedia({ colorScheme: 'dark' });
  await p.click('[data-c="iso"]'); await frame();
  await p.screenshot({ path: SHOT + 'calc4_dark_iso.png' });
  await p.emulateMedia({ colorScheme: 'light' });
  check('geen page errors', p.errs.length === 0, p.errs.join('|'));
  await p.context().close();
};
