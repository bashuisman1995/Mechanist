// Getalnotatie (nooit e-notatie in de zichtbare tekst), compacte onderbalk, hint die verdwijnt, en het rekenblad (A4-printweergave).
import { newPage, dismissAsk } from '../lib.mjs';

const EXP = /\d[eE][+-]?\d/;
const MODES = ['kin', 'dyn', 'equil', 'frf', 'stiff'];

// wacht tot de berekening klaar is (of nooit zal starten); drukt zo nodig op Bereken
async function settle(p) {
  for (let i = 0; i < 80; i++) {
    const st = await p.evaluate(() => {
      const hid = id => { const e = document.getElementById(id); return !e || e.hidden; };
      return { solve: !hid('solveBtn'), busy: !hid('tprog') };
    });
    if (st.solve) { await p.click('#solveBtn'); await p.waitForTimeout(120); continue; }
    if (!st.busy) break;
    await p.waitForTimeout(100);
  }
  await p.waitForTimeout(250);
}
async function openExample(p, ex) {
  await p.click('#libBtn'); await p.click(`[data-ex="${ex}"]`);
  await dismissAsk(p);
  await settle(p);
}
const scan = (p, sel) => p.evaluate(s => document.querySelector(s).innerText, sel);

export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url);
  await p.click('#libBtn');
  const all = (await p.$$eval('[data-ex]', x => x.map(e => e.dataset.ex))).filter(e => e !== 'empty');
  await p.keyboard.press('Escape');
  await p.context().close();

  // alle voorbeelden in alle modi, over een paar pagina's verdeeld
  const hits = [], errs = [];
  let states = 0, reports = 0;
  const W = 4, parts = Array.from({ length: W }, (_, i) => all.filter((_, k) => k % W === i));
  await Promise.all(parts.map(async list => {
    const q = await newPage(browser, url);
    await q.click('[data-t="how"]');                          // Hoe rekent dit? zichtbaar: ook die getallen worden gecontroleerd
    for (const ex of list) {
      try { await openExample(q, ex); } catch (e) { errs.push(ex + ': ' + e.message.split('\n')[0]); continue; }
      for (const m of MODES) {
        await q.click(`#modeSeg [data-v="${m}"]`); await settle(q);
        const t = await scan(q, 'body');
        states++;
        const mm = t.match(new RegExp('.{0,30}' + EXP.source + '.{0,20}'));
        if (mm) hits.push(`${ex}/${m}: ${mm[0].replace(/\s+/g, ' ')}`);
      }
      // en het rekenblad in de laatste modus
      await q.click('#menuBtn'); await q.click('#menu [data-a="report"]');
      const t = await scan(q, '#report');
      reports++;
      const mm = t.match(new RegExp('.{0,30}' + EXP.source + '.{0,20}'));
      if (mm) hits.push(`${ex}/rekenblad: ${mm[0].replace(/\s+/g, ' ')}`);
      await q.keyboard.press('Escape');
    }
    q.errs.forEach(e => errs.push(e));
    await q.context().close();
  }));
  check(`geen e-notatie in de zichtbare tekst (${all.length} voorbeelden x ${MODES.length} modi = ${states} toestanden, ${reports} rekenbladen)`, hits.length === 0 && states === all.length * MODES.length, hits.slice(0, 6).join(' | '));
  check('voorbeelden in alle modi zonder page errors', errs.length === 0, errs.slice(0, 5).join(' | '));

  // calculators: invoer, uitkomsten en rekenblad
  {
    const c = await newPage(browser, url);
    await c.click('#workSeg [data-w="calc"]');
    const n = (await c.$$('#calcList .calc-item')).length;
    const bad = [];
    for (let i = 0; i < n; i++) {
      await (await c.$$('#calcList .calc-item'))[i].click(); await c.waitForTimeout(150);
      let t = await scan(c, '#calcRoot');
      if (EXP.test(t)) bad.push(i + ': ' + t.match(new RegExp('.{0,30}' + EXP.source + '.{0,20}'))[0]);
      await c.click('#calcPrint'); await c.waitForTimeout(80);
      t = await scan(c, '#report');
      if (EXP.test(t)) bad.push(i + ' rekenblad: ' + t.match(new RegExp('.{0,30}' + EXP.source + '.{0,20}'))[0]);
      await c.keyboard.press('Escape');
    }
    check(`calculators (${n}): geen e-notatie op het scherm of in het rekenblad`, n >= 12 && bad.length === 0, bad.join(' | '));
    await c.click('#calcPrint'); await c.waitForTimeout(100);
    const rep = await c.$eval('#report', e => ({ vis: !e.hidden, txt: e.innerText, tbl: e.querySelectorAll('.rep-tbl').length, svg: !!e.querySelector('.rep-svg svg') }));
    check('calculator-rekenblad: invoer, uitkomsten, formules, bronnen, schets, voettekst', rep.vis && rep.tbl >= 3 && rep.svg && /INVOER/i.test(rep.txt) && /UITKOMSTEN/i.test(rep.txt) && /FORMULES/i.test(rep.txt) && /BRONNEN/i.test(rep.txt) &&
      /Thalomex Precision Toolbox — controleer kritische waarden altijd onafhankelijk/.test(rep.txt), rep.txt.slice(0, 200));
    check('rekenblad sluit met Esc', await c.keyboard.press('Escape').then(() => c.$eval('#report', e => e.hidden)));
    check('calculators: geen page errors', c.errs.length === 0, c.errs.join('|'));
    await c.context().close();
  }

  // rekenblad van de schets
  const s = await newPage(browser, url);
  await s.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await openExample(s, 'stiffmixed');
  await s.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await s.click('#menuBtn');
  check('menu: Rekenblad (PDF/print)', /Rekenblad \(PDF\/print\)/.test(await s.$eval('#menu [data-a="report"]', e => e.textContent)));
  await s.click('#menu [data-a="report"]'); await s.waitForTimeout(300);
  const R = await s.evaluate(() => {
    const r = document.getElementById('report'), pg = document.getElementById('repPage');
    const img = pg.querySelector('.rep-fig img');
    return { vis: !r.hidden, txt: pg.innerText, h2: [...pg.querySelectorAll('h2')].map(h => h.textContent), tbls: pg.querySelectorAll('.rep-tbl').length,
      img: img ? img.src.slice(0, 22) : '', imgW: img ? img.naturalWidth : 0, title: pg.querySelector('h1').textContent, theme: document.documentElement.getAttribute('data-theme'),
      hash: (document.querySelector('meta[name="mech-build"]') || {}).content, ver: document.querySelector('.brand .ver').textContent,
      nodeRows: [...pg.querySelectorAll('.rep-tbl')].map(t => t.innerText).join('\n'), copyBtn: [...pg.querySelectorAll('.hw-copy')].length };
  });
  check('rekenblad opent over de app', R.vis);
  check('rekenblad: kop met titel, datum, versie en modus', R.title.length > 0 && /\d{4}-\d\d-\d\d \d\d:\d\d/.test(R.txt) && R.txt.indexOf(R.ver) >= 0 && /Modus\s*Stijfheid/.test(R.txt), R.txt.slice(0, 160));
  check('rekenblad: git-hash uit de bouw staat in de kop (indien bekend)', !R.hash || R.txt.indexOf(R.hash) >= 0, R.hash);
  check('rekenblad: momentopname van het canvas (PNG)', R.img === 'data:image/png;base64,' && R.imgW > 200, R.img + ' ' + R.imgW);
  check('rekenblad: secties Tekening, Model, Belastingen, Uitkomsten, Formules', ['Tekening', 'Model', 'Belastingen'].every(h => R.h2.includes(h)) && R.h2.some(h => /^Uitkomsten/.test(h)) && R.h2.some(h => /^Formules/.test(h)), R.h2.join(','));
  check('rekenblad: modeltabel met punten, elementen, materialen en bronnotitie', /Punten/.test(R.txt) && /\bA\b.*\bB\b.*\bC\b/s.test(R.nodeRows) && /Elementen/.test(R.txt) && /EA·EI|Balk/.test(R.nodeRows) && /Materialen/.test(R.txt) && /MatWeb/.test(R.txt) && /N\/mm/.test(R.txt) && /mm\u00b2|mm⁴/.test(R.txt), R.nodeRows.slice(0, 300));
  check('rekenblad: belasting (kracht) en uitkomsten (verplaatsingen, reacties, spanning)', /Kracht op/.test(R.txt) && /Verplaatsingen/.test(R.txt) && /Reacties/.test(R.txt) && /Maximale spanning/.test(R.txt) && /Eigenfrequenties/.test(R.txt), R.txt.slice(-400));
  check('rekenblad: formules, aannamen en bronnen uit Hoe rekent dit?', /Euler/.test(R.txt) && /Aannamen/i.test(R.txt) && /Bronnen|Przemieniecki|Roark/.test(R.txt), R.txt.slice(-200));
  check('rekenblad: voettekst', /Thalomex Precision Toolbox — controleer kritische waarden altijd onafhankelijk/.test(R.txt));
  check('rekenblad: geen Kopieer-knoppen van Hoe rekent dit?', R.copyBtn === 0);
  check('rekenblad: thema na de momentopname hersteld (donker)', R.theme === 'dark', R.theme);
  check('rekenblad: komma als decimaalteken, geen "1.23"-getallen in tabellen', !/\b\d+\.\d+\b/.test(R.nodeRows), (R.nodeRows.match(/.{0,20}\b\d+\.\d+\b.{0,10}/) || [''])[0]);
  // Afdrukken en Kopieer als tekst
  await s.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await s.click('#repPrint');
  check('Afdrukken / PDF roept window.print() aan', (await s.evaluate(() => window.__printed)) === 1);
  await s.click('#repCopy'); await s.waitForTimeout(200);
  const clip = await s.evaluate(() => navigator.clipboard.readText().catch(() => '')).catch(() => '');
  const cmsg = await s.$eval('#repMsg', e => e.textContent);
  check('Kopieer als tekst: melding en inhoud op het klembord', /Gekopieerd/.test(cmsg) && /PUNTEN|Punten/.test(clip) && /Thalomex Precision Toolbox/.test(clip) && clip.split('\n').length > 40, cmsg + ' | ' + clip.slice(0, 120));
  // printmedia: alleen het rekenblad, A4
  await s.emulateMedia({ media: 'print' });
  const pr = await s.evaluate(() => ({ app: getComputedStyle(document.querySelector('.app')).display, bar: getComputedStyle(document.querySelector('.rep-bar')).display, rep: getComputedStyle(document.getElementById('report')).position }));
  check('printstijl: app en knoppenbalk verborgen, rekenblad in de flow', pr.app === 'none' && pr.bar === 'none' && pr.rep === 'static', JSON.stringify(pr));
  let pdf = null;
  try { pdf = await s.pdf({ preferCSSPageSize: true, printBackground: true }); } catch (e) { pdf = null; }
  const pages = pdf ? (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length : 0;
  const a4 = pdf && /\/MediaBox\s*\[\s*0\s+0\s+59[45](\.\d+)?\s+84[12](\.\d+)?\s*\]/.test(pdf.toString('latin1'));
  check('PDF-uitvoer bestaat, A4 (595 x 842 pt)', !!pdf && pdf.slice(0, 4).toString() === '%PDF' && a4 && pages >= 1, 'pagina\'s ' + pages + ' a4 ' + a4);
  await s.emulateMedia({ media: 'screen' });
  await s.keyboard.press('Escape');
  check('rekenblad sluit en de app is weer zichtbaar', await s.evaluate(() => document.getElementById('report').hidden && getComputedStyle(document.querySelector('.app')).display !== 'none'));
  check('rekenblad schets: geen page errors', s.errs.length === 0, s.errs.join('|'));
  await s.context().close();
};
