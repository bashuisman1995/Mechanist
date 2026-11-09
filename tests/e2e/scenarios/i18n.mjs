// Language switch EN -> NL -> EN: no raw translation keys, no console errors, no Dutch left in EN, decimal comma in NL.
import { newPage, loadExample, dismissAsk } from '../lib.mjs';

export const timeout = 900000;  // the English pass visits every library example (~10 min)
const KEY_RE = /\b[a-z]{2,}(\.[a-z0-9]+){2,}\b/;
// common Dutch words that must not appear in the English UI (whole words, case-insensitive)
const NL_RE = /\b(het|een|niet|stijfheid|veren|klik|selecteer|kies|instellingen|schakel|staaf|staven|waarde|kracht|lengte|uitkomst|opslaan|sluiten|annuleren|bereken|doorgerekend|toelaatbare|geen|voor|zonder|alleen|onder|boven|tussen|belasting|eigenschappen|metingen|gereedschap|bibliotheek|rekenblad|aandrijving|snelheid|frequentie|demper|speling|glijder|scharnier|kruk)\b/i;

export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url, { start: true });
  const bad = { key: [], nl: [], nlComma: [] };
  let n = 0;
  const text = () => p.evaluate(() => {
    const vis = e => !e.closest('[hidden]') && e.getClientRects().length > 0;
    const attrs = [...document.querySelectorAll('[title],[aria-label],[placeholder],[data-tip]')].filter(vis)
      .map(e => [e.title, e.getAttribute('aria-label'), e.getAttribute('placeholder'), e.getAttribute('data-tip')].join(' '));
    const svg = [...document.querySelectorAll('svg text')].filter(vis).map(e => e.textContent);
    const tip = document.getElementById('tip'); if (tip) tip.hidden = true; // stale tooltip text from hover
    return document.body.innerText + '\n' + attrs.join('\n') + '\n' + svg.join('\n');
  });
  const scan = async (where, lang) => {
    n++;
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); // panels render in a frame
    const t = await text();
    const k = t.match(KEY_RE);
    if (k) bad.key.push(where + ': ' + k[0]);
    if (lang === 'en') { const d = t.match(NL_RE); if (d) bad.nl.push(where + ': ' + d[0] + ' ...' + t.slice(Math.max(0, d.index - 25), d.index + 25).replace(/\s+/g, ' ')); }
  };
  const closeAll = async () => {
    await p.keyboard.press('Escape');
    if (await p.$('#repClose').catch(() => null)) { try { await p.click('#repClose', { timeout: 1000 }); } catch (e) { /* already closed */ } }
  };
  const setLang = async lang => {
    await p.click('#menuBtn');
    await p.click(`#langSeg [data-lang="${lang}"]`);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(200);
  };
  const toWork = async w => { await p.click(`#workSeg [data-w="${w}"]`); await p.waitForTimeout(300); };

  const pass = async (lang, light) => {
    // start screen
    if (await p.$('#start:not([hidden])')) await scan(lang + ' start', lang);
    else { await p.click('#brand').catch(() => {}); await scan(lang + ' start', lang); }
    await toWork('sketch');
    // every library example
    const exs = await p.evaluate(() => { document.getElementById('libBtn').click(); const a = [...document.querySelectorAll('[data-ex]')].map(e => e.dataset.ex); document.getElementById('libBtn').click(); return a; });
    for (const ex of (light || process.env.I18N_LIGHT ? ['fourbar', 'stiffportal'] : exs)) {
      if (ex === 'empty') { await p.click('#libBtn'); await p.click('[data-ex="empty"]'); await dismissAsk(p); await p.waitForTimeout(300); } else await loadExample(p, ex);
      await scan(`${lang} ${ex}`, lang);
      // Optimize/Settings are model-independent text: scan them on two examples only, so the scenario stays within its timeout
      const tabs = ex === 'fourbar' || ex === 'stiffportal' ? ['how', 'opt', 'set', 'props'] : ['how', 'props'];
      for (const tb of tabs) { await p.click(`#tabs [data-t="${tb}"]`); await scan(`${lang} ${ex} tab ${tb}`, lang); }
    }
    // every mode on a mechanism example and on a stiffness example
    for (const ex of ['fourbar', 'stiffportal']) {
      await loadExample(p, ex);
      for (const m of ['kin', 'dyn', 'equil', 'frf', 'stiff']) {
        await p.click(`#modeSeg [data-v="${m}"]`); await p.waitForTimeout(500);
        await scan(`${lang} ${ex} mode ${m}`, lang);
        if (lang === 'nl' && ex === 'fourbar' && m === 'kin') {
          const series = await p.$$eval('#series [data-v], #series [data-s]', x => x.map(e => e.textContent).join(' '));
          if (/\d\.\d/.test(series) || !/\d,\d/.test(series)) bad.nlComma.push('series: ' + series.slice(0, 80));
        }
        if (lang === 'nl' && ex === 'stiffportal' && m === 'stiff') {
          const sk = await p.$eval('#skVal', e => e.textContent);
          if (/\d\.\d/.test(sk) || !/\d,\d/.test(sk)) bad.nlComma.push('skVal: ' + sk);
        }
      }
    }
    await p.click('#helpBtn'); await scan(lang + ' hint', lang);
    await p.click('#menuBtn'); await scan(lang + ' menu', lang); await p.keyboard.press('Escape');
    await p.click('#libBtn'); await scan(lang + ' library', lang); await p.keyboard.press('Escape');
    await loadExample(p, 'fourbar');
    await p.click('#menuBtn'); await p.click('[data-a="report"]'); await p.waitForTimeout(500);
    await scan(lang + ' sketch calculation sheet', lang); await closeAll();
    // calculators
    await toWork('calc');
    const cnt = await p.$$eval('#calcList button', b => b.length);
    for (let i = 0; i < cnt; i++) {
      await p.click(`#calcList button >> nth=${i}`); await p.waitForTimeout(150);
      await p.$$eval('#calcDetail details', d => d.forEach(x => { x.open = true; }));
      await scan(`${lang} calc ${i}`, lang);
      if (lang === 'nl') {
        const d = await p.$eval('#calcDetail', e => e.innerText);
        if (/\d\.\d/.test(d.replace(/\d+\.\d+\.\d+/g, ''))) {
          const m = d.match(/.{20}\d\.\d.{10}/); bad.nlComma.push(`calc ${i}: ` + (m ? m[0].replace(/\s+/g, ' ') : ''));
        }
      }
      await p.click('#calcPrint'); await p.waitForTimeout(250); await scan(`${lang} calc ${i} sheet`, lang);
      await closeAll();
    }
    await toWork('sketch');
  };

  check('default language is English', (await p.evaluate(() => document.documentElement.lang)) === 'en' && /File/.test(await p.$eval('#menuBtn', e => e.textContent)));
  await pass('en');
  check(`EN: no raw keys (${n} screens)`, bad.key.length === 0, bad.key.slice(0, 5).join(' | '));
  check('EN: no Dutch words visible', bad.nl.length === 0, bad.nl.slice(0, 6).join(' | '));

  await loadExample(p, 'fourbar');
  await setLang('nl');
  check('NL: menu is Dutch and document lang is nl', /Bestand/.test(await p.$eval('#menuBtn', e => e.textContent)) && (await p.evaluate(() => document.documentElement.lang)) === 'nl');
  const k0 = bad.key.length;
  await pass('nl', true);  // light: completeness of every Dutch text is checked in tests/unit/i18n-dict.test.mjs
  check('NL: no raw keys', bad.key.length === k0, bad.key.slice(k0, k0 + 5).join(' | '));
  check('NL: decimal comma, no decimal point', bad.nlComma.length === 0, bad.nlComma.slice(0, 5).join(' | '));

  await setLang('en');
  check('back to EN: menu English', /File/.test(await p.$eval('#menuBtn', e => e.textContent)));
  await pass('en', true);
  check('EN after round trip: no raw keys and no Dutch', bad.key.length === k0 && bad.nl.length === 0, bad.key.concat(bad.nl).slice(0, 5).join(' | '));
  check('no page errors', p.errs.length === 0, p.errs.join('|'));
  await p.context().close();
};
