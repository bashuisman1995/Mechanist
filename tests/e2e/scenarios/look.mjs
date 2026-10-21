// Thalomex-look: startscherm, merk, werkplekken, gegroepeerde gereedschapsbalk, dialoogfocus, tabtoetsen, toast, aanraakdoelen.
import { newPage, visible } from '../lib.mjs';

// echt zichtbaar: ook als een voorouder verborgen is
const shown = (p, sel) => p.$eval(sel, e => e.getClientRects().length > 0);

export default async ({ browser, url, check }) => {
  let p = await newPage(browser, url, { start: true });
  check('titel: Thalomex Precision Toolbox', (await p.title()) === 'Thalomex Precision Toolbox');
  check('start: het startscherm is de eerste weergave', await visible(p, '#start') && !(await visible(p, '.main')));
  check('start: twee werkplekkaarten (Schets, Calculators)', (await p.$$('#start .bigcard')).length === 2);
  check('start: geen werkplek ingedrukt', await p.$$eval('#workSeg [data-w]', b => b.every(x => x.getAttribute('aria-pressed') === 'false')));
  check('merk: knop met Thalomex + Precision Toolbox', /Thalomex/.test(await p.textContent('#brand')) && /Precision Toolbox/.test(await p.textContent('#brand')) && (await p.$eval('#brand', e => e.tagName)) === 'BUTTON');
  check('start: modi, undo en redo verborgen', !(await shown(p, '#modeSeg')) && !(await shown(p, '#undoBtn')) && !(await shown(p, '#redoBtn')));
  check('start: Bibliotheek, Bestand en thema bereikbaar', await visible(p, '#libBtn') && await visible(p, '#menuBtn') && await visible(p, '#themeBtn'));
  await p.click('#start [data-go="calc"]'); await p.waitForTimeout(300);
  check('Calculators: thema, Bestand en Bibliotheek blijven zichtbaar', await visible(p, '#calcRoot') && await visible(p, '#libBtn') && await visible(p, '#menuBtn') && await visible(p, '#themeBtn'));
  check('Calculators: modusgroep verborgen', !(await shown(p, '#modeSeg')));
  await p.click('#themeBtn'); check('thema wisselt in Calculators', !!(await p.evaluate(() => document.documentElement.getAttribute('data-theme'))));
  await p.click('#brand'); await p.waitForTimeout(200);
  check('merk: terug naar het startscherm', await visible(p, '#start') && !(await visible(p, '#calcRoot')));
  await p.click('#start [data-go="sketch"]'); await p.waitForTimeout(300);
  check('Schets: werkplek ingedrukt, modi zichtbaar', (await p.getAttribute('#workSeg [data-w="sketch"]', 'aria-pressed')) === 'true' && await shown(p, '#modeSeg') && await visible(p, '.main'));
  await p.context().close();

  p = await newPage(browser, url);
  // gereedschapsbalk: vijf groepen, compact standaard, opvouwbaar
  const groups = await p.$$eval('#rail .rgrp[data-g]', g => g.map(x => x.dataset.g));
  check('rail: vijf groepen in vaste volgorde', groups.join() === 'geometry,supports,elements,loads,sensors', groups.join());
  check('rail: kracht staat bij Belastingen, spoor bij Elementen', await p.$eval('[data-g="loads"] [data-tool="force"]', () => true) && await p.$eval('[data-g="elements"] [data-tool="trace"]', () => true));
  check('rail: compact (56 px) is de standaard', (await p.$eval('#rail', e => e.getBoundingClientRect().width)) < 70);
  check('rail: elk gereedschap heeft een tooltip met toets', await p.$$eval('#rail .tool', t => t.every(x => /\(\w\)$/.test(x.getAttribute('data-tip') || x.getAttribute('title') || ''))));
  await p.click('#railBtn'); await p.waitForTimeout(150);
  check('rail: breed met groepskoppen', (await p.$eval('#rail', e => e.getBoundingClientRect().width)) > 120 && await visible(p, '#rg-geometry'));
  await p.click('#rg-geometry'); await p.waitForTimeout(100);
  check('rail: groep klapt in (aria-expanded)', (await p.getAttribute('#rg-geometry', 'aria-expanded')) === 'false' && !(await shown(p, '[data-tool="node"]')));
  await p.click('#rg-geometry'); await p.click('#railBtn');
  check('Kinematisch dimt veer en massa, niet de schakel', await p.$eval('[data-tool="spring"]', e => e.classList.contains('dim')) && !(await p.$eval('[data-tool="link"]', e => e.classList.contains('dim'))));
  await p.click('#modeSeg [data-v="stiff"]'); await p.waitForTimeout(150);
  check('Stijfheid dimt aandrijving en sensoren', await p.$eval('[data-tool="driver"]', e => e.classList.contains('dim')) && await p.$eval('[data-tool="loadcell"]', e => e.classList.contains('dim')));
  await p.click('#modeSeg [data-v="kin"]');

  // aria-live
  check('aria-live op resultaat en hint', (await p.getAttribute('#resState', 'aria-live')) === 'polite' && (await p.getAttribute('#hint', 'aria-live')) === 'polite');

  // tabs: rollende tabindex en pijltjestoetsen
  await p.focus('#tabs [aria-selected="true"]'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(100);
  check('tabs: pijl rechts kiest het volgende tabblad', (await p.getAttribute('#tabs [data-t="how"]', 'aria-selected')) === 'true' && (await p.getAttribute('#tabs [data-t="how"]', 'tabindex')) === '0' && (await p.getAttribute('#tabs [data-t="props"]', 'tabindex')) === '-1');
  check('tabs: aria-controls verwijst naar een paneel', await p.$eval('#tabs [data-t="how"]', e => !!document.getElementById(e.getAttribute('aria-controls'))));
  await p.keyboard.press('Home'); await p.waitForTimeout(100);

  // Bibliotheek: focus vast, Esc brengt de focus terug
  await p.click('#libBtn'); await p.waitForTimeout(200);
  let outside = 0;
  for (let i = 0; i < 40; i++) { await p.keyboard.press('Tab'); if (!(await p.evaluate(() => document.getElementById('lib').contains(document.activeElement)))) outside++; }
  check('Bibliotheek: Tab blijft binnen het dialoogvenster (40 keer)', outside === 0, String(outside));
  await p.keyboard.press('Shift+Tab');
  check('Bibliotheek: Shift+Tab blijft binnen', await p.evaluate(() => document.getElementById('lib').contains(document.activeElement)));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  check('Bibliotheek: Esc sluit en focus keert terug naar de knop', (await p.evaluate(() => document.activeElement && document.activeElement.id)) === 'libBtn');

  // Bestand-menu: toetsen
  await p.click('#menuBtn'); await p.waitForTimeout(100);
  check('menu: focus gaat naar het eerste item', (await p.evaluate(() => document.activeElement.getAttribute('data-a'))) === 'open');
  await p.keyboard.press('ArrowDown');
  check('menu: pijl omlaag gaat naar het volgende item', (await p.evaluate(() => document.activeElement.getAttribute('data-a'))) === 'save');
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  check('menu: Esc sluit en focus keert terug naar Bestand', (await p.evaluate(() => document.activeElement.id)) === 'menuBtn');

  // Rekenblad: focus vast en terug
  await p.click('#menuBtn'); await p.click('#menu [data-a="report"]'); await p.waitForTimeout(400);
  let out2 = 0;
  for (let i = 0; i < 12; i++) { await p.keyboard.press('Tab'); if (!(await p.evaluate(() => document.getElementById('report').contains(document.activeElement)))) out2++; }
  check('Rekenblad: Tab blijft binnen het dialoogvenster', out2 === 0, String(out2));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  check('Rekenblad: Esc brengt de focus terug (niet naar BODY)', (await p.evaluate(() => document.activeElement.tagName)) !== 'BODY');

  // Metingen kiezen: focus terug naar de opener
  await p.click('#addSerie'); await p.waitForTimeout(200);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  check('Metingen kiezen: Esc brengt de focus terug naar de knop', (await p.evaluate(() => document.activeElement.id)) === 'addSerie');

  // toast
  await p.click('#menuBtn'); await p.click('#menu [data-a="copy"]'); await p.waitForTimeout(300);
  check('toast: melding als role=status', (await p.getAttribute('.toast', 'role')) === 'status' && /\S/.test(await p.textContent('.toast')));
  // tooltip bij toetsenbordfocus
  await p.focus('#undoBtn'); await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Tab'); await p.waitForTimeout(200);
  check('tooltip verschijnt bij toetsenbordfocus', await p.$eval('#tip', e => e.classList.contains('show') && /\S/.test(e.textContent)).catch(() => false));
  // focusring op de donkere topbalk is licht
  const ring = await p.evaluate(() => { const e = document.activeElement; return getComputedStyle(e).outlineColor + '|' + getComputedStyle(e).outlineStyle + '|' + e.closest('.topbar')?.tagName; });
  check('focusring op de topbalk is licht en zichtbaar', /rgb\(233, 235, 234\)\|solid\|HEADER/.test(ring), ring);
  check('geen page errors', p.errs.length === 0, p.errs.join('|'));
  await p.context().close();

  // aanraakdoelen >= 40 px op een aanraakscherm
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('mechschets.tour1', '1'); } catch (e) {} });
  p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.goto(url); await p.waitForSelector('#menuBtn');
  await p.click('#start [data-go="sketch"]'); await p.waitForTimeout(500);
  const small = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('.topbar button, #rail .tool, .zoomer button, #transport button, #transport select, #tabs button, #statusBtn, #brand').forEach(e => {
      const r = e.getBoundingClientRect(); if (!r.width || e.closest('[hidden]')) return;
      if (r.height < 39.5 || r.width < 39.5) out.push((e.id || e.className || e.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    });
    return out;
  });
  check('aanraakscherm: knoppen en gereedschap minstens 40 px', small.length === 0, small.join(', '));
  check('aanraakscherm: geen page errors', p.errs.length === 0, p.errs.join('|'));
  await ctx.close();
};
