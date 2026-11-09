// De nieuwe voorbeelden (src/ui/example-specs.js): elk opent in zijn sprekendste modus, laadt zonder fouten in elke modus die het
// kaartje claimt, heeft een miniatuur en een uitleg met de controlewaarde, en de app geeft die waarde binnen de tolerantie.
// De waarde in de uitleg is dezelfde als die in tests/unit/examples-more.test.mjs met de oplossers is nagerekend.
import { kNmm, loadExample, newPage, num, playReady, setScrub, vals } from '../lib.mjs';
import { SPECS } from '../../../src/ui/example-specs.js';

const IDS = Object.keys(SPECS);
const MODE_BTN = { kin: 'kin', dyn: 'dyn', equil: 'equil', frf: 'frf', stiff: 'stiff' };
const metaModes = {};   // uit de bibliotheekkaartjes: de tags per voorbeeld

const parseList = (txt) => [...String(txt).replace(/−/g, '-').matchAll(/([\d.,  ]+)\s*(k?Hz)\s*\(ζ\s*([\d.,]+)\s*%\)/g)]
  .map(m => ({ f: num(m[1]) * (m[2] === 'kHz' ? 1000 : 1), z: num(m[3]) }));
// rij uit een tabel in #stiffTab: eerste cel is de puntnaam; sectie = 'DISPLACEMENTS' of 'REACTIONS'
const rowOf = (txt, section, name) => {
  const lines = String(txt).split('\n').map(l => l.split('\t'));
  let on = false;
  for (const c of lines) {
    if (c.length === 1) { on = new RegExp(section, 'i').test(c[0]); continue; }
    if (on && c[0] === name) return c.slice(1).map(num);
  }
  return null;
};

async function readCheck(p, id, spec, c) {
  const stat = async () => p.$$eval('#series [data-s]', x => x.map(e => e.textContent));
  switch (c.read) {
    case 'k': {
      if (c.ang !== undefined && c.ang !== spec.stiff.ang) { await p.fill('#skAng', String(c.ang)); await p.keyboard.press('Enter'); await p.waitForTimeout(250); }
      return kNmm(await p.$eval('#skVal', e => e.textContent));
    }
    case 'f1': {
      await p.waitForFunction(() => document.querySelectorAll('#stiffChips .chip').length >= 2, null, { timeout: 8000 });
      const t = await p.$eval('#stiffChips .chip:nth-child(2)', e => e.textContent);
      return num(t.split('·')[1]) * (/kHz/.test(t) ? 1000 : 1);
    }
    case 'dispratio': case 'dispdiff': {
      const txt = await p.$eval('#stiffTab', e => e.innerText);
      const a = rowOf(txt, 'DISPLACEMENTS', c.a[0]), b = rowOf(txt, 'DISPLACEMENTS', c.b[0]);
      const ix = comp => (comp === 'ux' ? 0 : 1);
      const va = a[ix(c.a[1])], vb = b[ix(c.b[1])];
      return c.read === 'dispratio' ? Math.abs(va / vb) : va - vb;
    }
    case 'react': {
      const txt = await p.$eval('#stiffTab', e => e.innerText);
      return rowOf(txt, 'REACTIONS', c.node)[c.comp === 'Rx' ? 0 : 1];
    }
    case 'therm': return num(await p.$eval(c.comp === 'dx' ? '#thDx' : '#thDy', e => e.textContent));
    case 'frf': {
      const L = parseList(await p.$eval('#frfNote', e => e.textContent)).sort((a, b) => a.f - b.f);
      return c.kind === 'f' ? L[c.idx].f : L[c.idx].z;
    }
    case 'frfpeak': {
      const t = (await p.$eval('#drawer', e => e.innerText)).replace(/−/g, '-');
      const m = [...t.matchAll(/peak\s+([\d., ]+)\s+at/g)].map(x => num(x[1]));
      return m[c.idx];
    }
    case 'series': case 'seriesabs': {
      await setScrub(p, c.scrub || 360); await p.waitForTimeout(300);
      const v = num((await vals(p))[c.idx]);
      return c.read === 'seriesabs' ? Math.abs(v) : v;
    }
    case 'seriesmax': return num((await stat())[c.idx].split('max')[1]);
    case 'straight': {
      const s = (await stat())[0].replace(/−/g, '-');
      const lo = num(s.split('min')[1]), hi = num(s.split('max')[1]);
      return hi - lo;
    }
  }
  throw new Error('onbekende controle ' + c.read);
}

export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url);
  const cons = [];
  p.on('console', m => { if (m.type() === 'error' || /vertaling ontbreekt/.test(m.text())) cons.push(m.text()); });

  // bibliotheek: kaartje, miniatuur, categorie en modustags per nieuw voorbeeld
  await p.click('#libBtn');
  const cards = await p.$$eval('#libGrid [data-ex]', x => x.map(e => ({ id: e.dataset.ex, thumb: !!e.querySelector('svg.thumb *'), tags: [...e.querySelectorAll('.tag')].map(t => t.textContent), title: e.querySelector('.lc-t').textContent, desc: e.querySelector('.lc-d').textContent })));
  const cats = await p.$$eval('#libChips [data-c]', x => x.map(e => e.textContent));
  check('categorieen: Mechanisms, Flexures, Contacts & couplings, Dynamics & FRF, Stiffness, Thermal, Sensors, Optimization',
    ['Mechanisms', 'Flexures', 'Contacts & couplings', 'Dynamics & FRF', 'Stiffness', 'Thermal', 'Sensors', 'Optimization'].every(c => cats.includes(c)), cats.join('|'));
  for (const id of IDS) {
    const c = cards.find(x => x.id === id);
    check(`${id}: kaartje met miniatuur, titel en beschrijving`, c && c.thumb && c.title.length > 3 && c.desc.length > 10, JSON.stringify(c));
    if (c) metaModes[id] = c.tags;
  }
  for (const cat of ['flex', 'cont', 'dyn', 'stiff', 'therm', 'sens', 'opt']) {
    await p.click(`#libChips [data-c="${cat}"]`);
    const n = await p.$$eval('#libGrid [data-ex]:not([hidden])', x => x.length);
    check(`filter ${cat} toont kaarten`, n >= 2, String(n));
  }
  await p.keyboard.press('Escape');

  for (const id of IDS) {
    const spec = SPECS[id], before = p.errs.length, cb = cons.length;
    let why = '';
    try { await loadExample(p, id); } catch (e) { why = e.message.split('\n')[0]; }
    // opent in de sprekendste modus
    const pressed = await p.$eval('#modeSeg [aria-pressed="true"]', e => e.dataset.v).catch(() => '?');
    check(`${id}: opent in modus ${spec.mode}`, pressed === spec.mode, `modus ${pressed} ${why}`);
    // uitleg met de controle
    const ut = await p.$eval('#uitleg', e => (e.hidden ? '' : e.textContent)).catch(() => '');
    check(`${id}: uitleg noemt de controle en de waarde`, /Check:/.test(ut) && ut.length > 250, ut.slice(0, 80));
    // de analytische waarde tegen de app
    for (const c of spec.check) {
      let got, err = '';
      try { got = await readCheck(p, id, spec, c); } catch (e) { err = e.message.split('\n')[0]; }
      let ok;
      if (c.read === 'seriesabs') ok = got <= c.max * 1.05 && got > 0.05;
      else if (c.read === 'straight') ok = got <= 0.3;
      else if (c.atol !== undefined) ok = Math.abs(got - c.value) <= c.atol;
      else ok = Math.abs(got - c.value) <= c.tol * Math.abs(c.value);
      const label = c.read === 'straight' ? 'y-bereik van P' : `${c.read}${c.kind ? ' ' + c.kind : ''}${c.ang !== undefined ? ' ' + c.ang + '°' : ''}`;
      check(`${id}: ${label} = ${c.value !== undefined ? Math.round(c.value * 1e4) / 1e4 : '<= ' + c.max} ${c.unit}`, ok, `app ${got} ${err}`);
    }
    // elke gekozen modus laadt zonder fouten
    for (const tag of metaModes[id] || []) {
      const mode = { Kinematics: 'kin', Dynamics: 'dyn', Equilibrium: 'equil', FRF: 'frf', Stiffness: 'stiff' }[tag];
      if (!mode || mode === pressed) continue;
      await p.click(`#modeSeg [data-v="${MODE_BTN[mode]}"]`);
      await p.waitForTimeout(800);
      if (mode !== 'stiff') { const sb = await p.$eval('#solveBtn', e => !e.hidden); if (sb) await p.click('#solveBtn'); await p.waitForTimeout(500); }
    }
    check(`${id}: geen fouten in alle gekozen modi`, p.errs.length === before && cons.length === cb, p.errs.slice(before).concat(cons.slice(cb)).join('|'));
  }
  check('geen page errors', p.errs.length === 0, p.errs.join('|'));
  await p.context().close();
};
