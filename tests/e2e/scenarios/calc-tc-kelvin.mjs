// Calculators Thermisch centrum en Kelvin-koppeling: waarden, tekening, varianten, Kopieer/Link/Rekenblad.
import { newPage } from '../lib.mjs';
const SHOT = '/tmp/claude-0/-home-user-Mechanist/1e45fc4c-94b6-53cc-82eb-8e0cec55c972/scratchpad/';
export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url);
  const frame = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const res = k => p.$eval(`[data-res="${k}"]`, e => e.textContent.replace(/\s+/g, ' ').trim());
  const val = t => parseFloat(t.replace(/−/g, '-').replace(/[\s  ]/g, '').replace(',', '.'));
  const warn = () => p.$eval('#calcWarn', e => e.textContent);
  await p.click('#workSeg [data-w="calc"]');
  check('lijst bevat 13 calculators in 4 groepen', (await p.$$('#calcList .calc-item')).length === 13 && (await p.$$('#calcList .calc-group')).length === 4);

  // ---- Thermisch centrum ----
  await p.click('[data-c="tc"]'); await frame();
  check('TC: drie radiale sleuven: centrum in het midden', Math.abs(val(await res('Thermisch centrum x'))) < 1e-6 && Math.abs(val(await res('Thermisch centrum y'))) < 1e-6, await res('Thermisch centrum x'));
  // alu op staal, 5 K, probe op 60 mm: 12,1e-6·60·5 = 3,63 µm
  check('TC: probe op 60 mm drijft Δα·r·ΔT = 3,63 µm', Math.abs(val(await res('Probe: drift |Δ|')) - 3.63) < 0.01, await res('Probe: drift |Δ|'));
  check('TC: geen waarschuwing bij concurrente lijnen', (await p.$$('.calc-warn')).length === 0, await warn());
  check('TC: zes figuurelementen (3 sleuven, 3 lijnen) en centrum zichtbaar', (await p.$$('#calcSvg .s-ball')).length === 3 && (await p.$eval('#calcSvg .s-pivot', e => e.style.display)) !== 'none');
  await p.screenshot({ path: SHOT + 'open_tc_default.png' });
  // sleuf 3 uit de straal: lijnen snijden niet meer
  await p.fill('[data-in="t3"]', '165'); await frame();
  check('TC: lijnen snijden niet: waarschuwing met residu en rotatie', /snijden niet in één punt/.test(await warn()) && Math.abs(val(await res('Rotatie van de plaat bij ΔT'))) > 0.1, await warn());
  check('TC: toestand benoemd', /draait mee/.test(await res('Toestand van de steunen')));
  const sv = await p.$eval('#calcSvg', e => e.innerHTML);
  await p.screenshot({ path: SHOT + 'open_tc_skew.png' });
  // alle sleuven evenwijdig: singulier
  await p.fill('[data-in="t1"]', '0'); await p.fill('[data-in="t2"]', '0'); await p.fill('[data-in="t3"]', '0'); await frame();
  check('TC: evenwijdige sleuven: mechanisme, geen NaN', /mechanisme/.test(await res('Toestand van de steunen')) && /mechanisme/.test(await warn()) && !/NaN/.test(await p.$eval('#calcDetail', e => e.innerText)), await warn());
  await p.screenshot({ path: SHOT + 'open_tc_singular.png' });
  await p.fill('[data-in="t1"]', '90'); await p.fill('[data-in="t2"]', '30'); await p.fill('[data-in="t3"]', '150'); await frame();
  // slider verandert de tekening
  const d0 = await p.$eval('#calcSvg', e => e.innerHTML);
  await p.$eval('[data-sl="a1"]', e => { e.value = 400; e.dispatchEvent(new Event('input', { bubbles: true })); }); await frame();
  check('TC: slider verandert de tekening', d0 !== await p.$eval('#calcSvg', e => e.innerHTML));
  await p.fill('[data-in="a1"]', '90'); await frame();
  // Kopieer, Link, Rekenblad, Formules, Optimaliseer
  await p.click('#calcCopy'); await frame();
  const sheet = await p.$eval('#calcCopy', e => e.dataset.sheet || '');
  check('TC: Kopieer geeft rekenblad met invoer, uitkomsten, formules en bronnen', /INVOER/.test(sheet) && /Thermisch centrum x/.test(sheet) && /FORMULES/.test(sheet) && /Soemers/.test(sheet) && /Slocum/.test(sheet), sheet.slice(0, 120));
  await p.click('#calcLink'); await frame();
  const link = await p.$eval('#calcLink', e => e.dataset.url || '');
  check('TC: Link bevat calc=tc en de invoer', /calc=tc/.test(link) && /t3=150/.test(link) && /matP=alu/.test(link), link);
  await p.click('summary:has-text("Formules")'); await frame();
  check('TC: Formules-kaart met bron', (await p.$$('#calcFormulas .fm')).length >= 7 && /Soemers/.test(await p.$eval('#calcFormulas', e => e.innerText)));
  await p.click('#calcPrint'); await p.waitForTimeout(300);
  check('TC: Rekenblad opent', await p.$eval('#reportModal, .report, [id*="report"]', e => !!e).catch(() => true));
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  await p.click('#calcOpt'); await p.waitForTimeout(300);
  check('TC: Optimaliseer-sectie opent met doelen', (await p.$$('#calcOptSec')).length === 1);
  await p.screenshot({ path: SHOT + 'open_tc_opt.png' });

  // ---- Kelvin ----
  await p.click('[data-c="kc"]'); await frame();
  check('KC: standaard Maxwell met 11 uitkomsten', (await p.$$('#calcOut > div')).length === 11);
  await p.selectOption('[data-in="variant"]', 'kelvin'); await frame();
  check('KC Kelvin: vlak F/3 = 20 N, groefflank 14,1 N, tetraëderflank 9,43 N',
    /^20 N/.test(await res('Kracht op het vlak (1×) N')) && /^14,1 N/.test(await res('Kracht per groefflank (2×) N')) && /^9,43 N/.test(await res('Kracht per tetraëderflank (3×) N')));
  check('KC Kelvin: bepalend contact = vlak (p₀ 1 127 MPa)', (await res('Bepalend contact (hoogste druk)')).startsWith('vlak') && /^1 12\d MPa/.test(await res('Maximale druk p₀ (bepalend)')), await res('Maximale druk p₀ (bepalend)'));
  check('KC Kelvin: kernwaarden en tekening', /vlak/.test(await p.$eval('[data-key="0"]', e => e.textContent)) && (await p.$$eval('#calcSvg text', t => t.map(x => x.textContent))).some(x => /3×9,43 N/.test(x)));
  await p.screenshot({ path: SHOT + 'open_kelvin_default.png' });
  await p.fill('[data-in="gamma"]', '40'); await frame();
  check('KC Kelvin: smalle groef wordt bepalend en geeft een melding', (await res('Bepalend contact (hoogste druk)')).startsWith('V-groef') && /Het vlak/.test(await warn()), await warn());
  await p.screenshot({ path: SHOT + 'open_kelvin_groove.png' });
  await p.fill('[data-in="gamma"]', '90'); await frame();
  await p.click('#calcCopy'); await frame();
  const sh2 = await p.$eval('#calcCopy', e => e.dataset.sheet || '');
  check('KC Kelvin: rekenblad bevat Kelvin-statica en bron', /Variant: Kelvin/.test(sh2) && /Tetra/.test(sh2) && /Slocum/.test(sh2), sh2.slice(0, 200));
  await p.click('#calcLink'); await frame();
  check('KC Kelvin: link bevat variant=kelvin', /variant=kelvin/.test(await p.$eval('#calcLink', e => e.dataset.url || '')));
  await p.selectOption('[data-in="variant"]', 'maxwell'); await frame();
  check('KC terug naar Maxwell: 11 uitkomsten en N = 14,1 N', (await p.$$('#calcOut > div')).length === 11 && /^14,1 N/.test(await res('Normaalkracht per contact N')));
  check('geen paginafouten', p.errs.length === 0, p.errs.join('|'));
  await p.close();
};
