// Taalwissel: EN en NL tonen geen ruwe vertaalsleutels, in EN blijft geen Nederlands over, het model blijft bij een wissel behouden.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { newPage, loadExample, dismissAsk, playReady, store } from '../lib.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const { DICTS } = await import(pathToFileURL(path.join(root, 'src/ui/i18n.js')).href);
const KEYS = Object.keys(DICTS.en).filter(k => k.indexOf('.') > 0).sort((a, b) => b.length - a.length);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const KEY_RE = new RegExp('(?<![\\w.])(?:' + KEYS.map(esc).join('|') + ')(?![\\w])');
// onbekende sleutels (niet in het woordenboek) herkennen we aan het voorvoegsel van een sleutelgroep
const GROUPS = [...new Set(KEYS.map(k => k.split('.')[0]))].filter(g => g.length > 2);
const UNKNOWN_RE = new RegExp('(?<![\\w.])(?:' + GROUPS.map(esc).join('|') + ')\\.[a-z][\\w]*(?:\\.[\\w]+)*(?![\\w(])');
// veelvoorkomende Nederlandse woorden; hoofdletterongevoelig, hele woorden
const NL_RE = /\b(het|een|van|niet|stijfheid|veer|veren|klik|selecteer|kies|instellingen|schakel|schakels|staaf|staven|punt|punten|waarde|kracht|lengte|uitkomst|uitkomsten|opslaan|sluiten|annuleren|bereken|doorgerekend|hoek|toelaatbare|geen|voor|met|bij|naar|zonder|alleen|meer|onder|boven|tussen|eigenschappen|metingen|gereedschap|bibliotheek|rekenblad|aandrijving|massa|snelheid|frequentie|demper|speling|glijder|scharnier|kruk)\b/i;
const grid = [];
for (let i = 0; i < 9; i++) for (let j = 0; j < 6; j++) grid.push([0.1 + i * 0.1, 0.12 + j * 0.15]);

export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url);
  const txt = () => p.evaluate(() => document.body.innerText + '\n' + [...document.querySelectorAll('[title],[aria-label],[placeholder]')].map(e => (e.title || '') + ' ' + (e.getAttribute('aria-label') || '') + ' ' + (e.getAttribute('placeholder') || '')).join('\n') + '\n' + [...document.querySelectorAll('canvas')].map(() => '').join(''));
  const svgTxt = () => p.evaluate(() => [...document.querySelectorAll('svg text, #report, #calcDetail')].map(e => e.textContent).join('\n'));
  const bad = { key: [], unk: [], nl: [] };
  let n = 0;
  const scan = async (where, lang) => {
    n++;
    const t = (await txt()) + '\n' + (await svgTxt());
    const k = t.match(KEY_RE), u = t.match(UNKNOWN_RE);
    if (k) bad.key.push(where + ': ' + k[0]);
    if (u) bad.unk.push(where + ': ' + u[0]);
    if (lang === 'en') { const d = t.match(NL_RE); if (d) bad.nl.push(where + ': ' + d[0] + ' …' + t.slice(Math.max(0, d.index - 25), d.index + 25).replace(/\s+/g, ' ')); }
  };
  const tabs = ['props', 'how', 'opt', 'set'];
  const sketchPass = async lang => {
    const exs = await p.evaluate(() => { document.getElementById('libBtn').click(); const a = [...document.querySelectorAll('[data-ex]')].map(e => e.dataset.ex); document.getElementById('libBtn').click(); return a; });
    for (const ex of exs) {
      await loadExample(p, ex);
      await scan(lang + ' ' + ex, lang);
      const box = await p.$eval('#cv', e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
      const seen = new Set();
      for (const [fx, fy] of grid) {
        await p.mouse.click(box.x + box.w * fx, box.y + box.h * fy);
        const sig = await p.$eval('#props', e => e.textContent.slice(0, 60));
        if (seen.has(sig)) continue; seen.add(sig);
        for (const tb of tabs) { await p.click(`#tabs [data-t="${tb}"]`); await scan(`${lang} ${ex} sel ${tb}`, lang); }
        await p.click('#tabs [data-t="props"]');
      }
      for (const tb of tabs) { await p.click(`#tabs [data-t="${tb}"]`); await scan(`${lang} ${ex} ${tb}`, lang); }
      await p.click('#tabs [data-t="props"]');
      await p.keyboard.press('Escape');
    }
    // alle modi op het laatste voorbeeld en de tools
    for (const m of ['kin', 'dyn', 'equil', 'frf', 'stiff']) { await p.click(`#modeSeg [data-v="${m}"]`); await p.waitForTimeout(400); await scan(`${lang} mode ${m}`, lang); }
    await p.click('#helpBtn'); await scan(lang + ' hint', lang);
    await p.click('#menuBtn'); await scan(lang + ' menu', lang); await p.keyboard.press('Escape');
    await p.click('#libBtn'); await scan(lang + ' library', lang); await p.keyboard.press('Escape');
    await p.click('#menuBtn'); await p.click('[data-a="report"]'); await p.waitForTimeout(500); await scan(lang + ' sketch report', lang);
    await p.keyboard.press('Escape');
    if (await p.$('#repClose')) { try { await p.click('#repClose'); } catch (e) { /* al gesloten */ } }
  };
  const calcPass = async lang => {
    await p.click('#workSeg [data-w="calc"]');
    const items = await p.$$eval('#calcList button', b => b.map((x, i) => i));
    for (const i of items) {
      await p.click(`#calcList button >> nth=${i}`); await p.waitForTimeout(150);
      await p.$$eval('#calcDetail details', d => d.forEach(x => { x.open = true; }));
      const name = (await p.$eval(`#calcList button >> nth=${i}`, e => e.textContent)).trim().slice(0, 30);
      await scan(`${lang} calc ${i} ${name}`, lang);
      await p.click('#menuBtn'); await p.click('[data-a="report"]'); await p.waitForTimeout(250); await scan(`${lang} calc ${i} sheet`, lang);
      await p.keyboard.press('Escape');
      if (await p.$('#repClose')) { try { await p.click('#repClose'); } catch (e) { /* al gesloten */ } }
    }
    await p.click('#workSeg [data-w="sketch"]');
  };

  // ---- Engels (standaard, ook als de browser Nederlands is)
  check('standaardtaal is Engels', (await p.evaluate(() => document.documentElement.lang)) === 'en' && /File/.test(await p.$eval('#menuBtn', e => e.textContent)));
  await sketchPass('en'); await calcPass('en');
  check(`EN: geen ruwe sleutels (${n} schermen)`, bad.key.length === 0, bad.key.slice(0, 5).join(' | '));
  check('EN: geen onbekende sleutels', bad.unk.length === 0, bad.unk.slice(0, 5).join(' | '));
  check('EN: geen Nederlandse woorden zichtbaar', bad.nl.length === 0, bad.nl.slice(0, 6).join(' | '));

  // ---- wisselen naar NL en terug: model blijft, taal wordt onthouden
  await loadExample(p, 'fourbar');
  const before = await store(p);
  const nodesBefore = before.nodes.length;
  await p.click('#menuBtn'); await p.click('#langSeg [data-lang="nl"]');
  check('NL: menu en titel zijn Nederlands', /Bestand/.test(await p.$eval('#menuBtn', e => e.textContent)) && /Vierstangenmechanisme/.test(await p.$eval('#docName', e => e.textContent)) && (await p.evaluate(() => document.documentElement.lang)) === 'nl');
  check('NL: model ongewijzigd na wissel', (await store(p)).nodes.length === nodesBefore);
  await p.keyboard.press('Escape');
  const keep = { k: bad.key.length, u: bad.unk.length };
  await sketchPass('nl'); await calcPass('nl');
  check('NL: geen ruwe of onbekende sleutels', bad.key.length === keep.k && bad.unk.length === keep.u, bad.key.concat(bad.unk).slice(keep.k + keep.u, keep.k + keep.u + 5).join(' | '));
  await loadExample(p, 'fourbar');
  await p.reload(); await p.waitForSelector('#menuBtn'); await p.waitForTimeout(600);
  check('NL: taal onthouden na herladen', /Bestand/.test(await p.$eval('#menuBtn', e => e.textContent)));
  await p.click('#menuBtn'); await p.click('#langSeg [data-lang="en"]');
  check('terug naar EN: menu Engels en voorbeeldnaam vertaald', /File/.test(await p.$eval('#menuBtn', e => e.textContent)) && /Four-bar linkage/.test(await p.$eval('#docName', e => e.textContent)));
  check('geen page errors', p.errs.length === 0, p.errs.join('|'));
  await p.context().close();
};
