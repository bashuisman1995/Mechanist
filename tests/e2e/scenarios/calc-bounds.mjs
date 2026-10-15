// Calculators: invoergrenzen (begrensd tot ...), "buiten bereik" i.p.v. NaN, geldige SVG, insteltijd-methode, drift per kelvin.
import { newPage } from '../lib.mjs';
export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url);
  const frame = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const res = k => p.$eval(`[data-res="${k}"]`, e => e.textContent.replace(/\s+/g, ' ').trim());
  const warn = () => p.$eval('#calcWarn', e => e.textContent.replace(/\s+/g, ' '));
  const svgBad = () => p.$eval('#calcSvg', e => /NaN|Infinity/.test(e.innerHTML));
  const val = t => parseFloat(t.replace(/[ s]/g, '').replace('−', '-').replace(',', '.'));
  await p.click('#workSeg [data-w="calc"]');

  await p.click('[data-c="hertz"]');
  await p.fill('[data-in="theta"]', '100'); await frame();
  check('Hertz: θ = 100° begrensd tot 89° met melding', /θ begrensd tot 89 °/.test(await warn()) && val(await res('Normaalkracht per contact F_n')) > 0, await warn());
  check('Hertz: oranje melding gebruikt calc-warn', (await p.$$('#calcWarn .calc-clamp')).length === 1);
  check('Hertz: SVG zonder NaN', !(await svgBad()));
  await p.fill('[data-in="theta"]', '45'); await frame();
  check('Hertz: θ = 45° geen begrenzing', !/begrensd/.test(await warn()));

  await p.click('[data-c="kc"]');
  await p.fill('[data-in="gamma"]', '360'); await frame();
  check('KC: γ = 360° begrensd tot 179°', /γ begrensd tot 179 °/.test(await warn()) && val(await res('Normaalkracht per contact N')) > 0, await warn());
  await p.fill('[data-in="gamma"]', '90');
  await p.fill('[data-in="mu"]', '10'); await frame();
  check('KC: μ = 10 begrensd tot 2', /μ begrensd tot 2/.test(await warn()), await warn());
  await p.fill('[data-in="mu"]', '0.15');

  await p.click('[data-c="msd"]');
  await p.fill('[data-in="dval"]', '5'); await frame();
  check('MSD: ζ < 1 gebruikt 4/(ζ·ω_n)', /4\/\(ζ·ω_n\)/.test(await p.$eval('[data-key="2"]', e => e.textContent)));
  await p.fill('[data-in="dval"]', '200'); await frame();
  check('MSD: ζ = 2 gebruikt numerieke methode', /numeriek/.test(await p.$eval('[data-key="2"]', e => e.textContent)));
  await p.click('[data-sec="Formules"] summary'); await frame();
  check('MSD: formulerij noemt het criterium', /±2 %-band/.test(await p.$eval('#calcFormulas', e => e.textContent)));
  await p.fill('[data-in="dval"]', '1e300'); await frame();
  check('MSD: extreme demping geeft "buiten bereik" en geldige SVG', /buiten bereik/.test(await p.$eval('#calcOut', e => e.textContent)) && /buiten bereik/.test(await warn()) && !(await svgBad()));
  await p.fill('[data-in="dval"]', '5'); await frame();
  check('MSD: terug in bereik zonder "buiten bereik"', !/buiten bereik/.test(await p.$eval('#calcOut', e => e.textContent)));

  await p.click('[data-c="exp"]');
  const drift = await res('Netto drift per kelvin');
  await p.fill('[data-in="dT"]', '0'); await frame();
  check('Uitzetting: drift per kelvin onafhankelijk van ΔT (ΔT = 0)', (await res('Netto drift per kelvin')) === drift && val(drift) !== 0, drift + ' vs ' + await res('Netto drift per kelvin'));
  check('Uitzetting: totale drift bij ΔT = 0 is 0 nm', /^0 nm/.test(await res('Netto drift totaal bij ΔT')), await res('Netto drift totaal bij ΔT'));
  await p.fill('[data-in="dT"]', '5'); await frame();
  check('Uitzetting: totaal = 5 × per kelvin', Math.abs(val(await res('Netto drift totaal bij ΔT')) / 5 - val(drift)) < Math.abs(val(drift)) * 0.01);

  check('geen page errors', p.errs.length === 0, p.errs.join('|'));
  await p.context().close();
};
