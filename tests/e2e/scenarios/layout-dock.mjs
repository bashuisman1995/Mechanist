// Indeling: tekening is de hoofdzaak. Transportbalk onder het canvas (geen overlap), lade ~35 %, één rij in FRF,
// uitleg in het rechterpaneel, meetfrequentie met komma, Resultaat per modus.
import { loadExample } from '../lib.mjs';

export default async ({ browser, url, check }) => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('mechschets.tour1', '1'); } catch (e) {} });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.goto(url); await p.waitForSelector('#menuBtn'); await p.waitForTimeout(500);
  await loadExample(p, 'shakerfrf');
  await p.waitForTimeout(500);
  const g = await p.evaluate(() => {
    const r = s => document.querySelector(s).getBoundingClientRect();
    const st = r('.stage'), tr = r('#transport'), dr = r('#drawer'), u = r('#uitleg'), bb = r('.inspector');
    return { stageFrac: st.height / innerHeight, trTop: tr.top, stBottom: st.bottom, trH: tr.height, drFrac: dr.height / innerHeight,
      uitInInspector: u.left >= bb.left - 1 && u.right <= bb.right + 1, uitOverStage: u.left < st.right && u.right > st.left && u.top < st.bottom && u.bottom > st.top,
      meetInside: r('#meetBar').right <= tr.right + 1 && r('#meetBar').top >= tr.top - 1 && r('#meetBar').bottom <= tr.bottom + 1 };
  });
  check('tekening krijgt ≥ 45 % van de hoogte met open lade', g.stageFrac >= 0.45, JSON.stringify(g));
  check('transportbalk ligt onder het canvas, niet erover', g.trTop >= g.stBottom - 1, JSON.stringify(g));
  check('FRF: transportbalk is één compacte rij', g.trH < 56 && g.meetInside, JSON.stringify(g));
  check('lade ongeveer 35 % van het scherm', g.drFrac > 0.28 && g.drFrac < 0.42, JSON.stringify(g));
  check('uitleg staat in het rechterpaneel, niet over de tekening', g.uitInInspector && !g.uitOverStage, JSON.stringify(g));
  const mf = await p.$eval('#meetF', e => e.value);
  check('meetfrequentie met komma en 3-4 cijfers', /^\d,\d{3,4}$/.test(mf), mf);
  await p.fill('#meetF', '3,559'); await p.waitForTimeout(100);
  const o = await p.$eval('#meetOut', e => e.textContent);
  check('komma wordt als invoer geaccepteerd', /°/.test(o), o);
  const res = await p.evaluate(() => ({ big: document.getElementById('dofVal').textContent, of: document.getElementById('dofOf').textContent, st: document.getElementById('resState').textContent }));
  check('Resultaat in FRF: eigenfrequentie en demping, ingang/uitgang', /Hz/.test(res.big) && /ζ/.test(res.of) && /ingang/.test(res.st) && !/aandrijving/.test(res.of), JSON.stringify(res));
  // lade slepen en onthouden
  const grip = await p.$eval('#grip', e => { const b = e.getBoundingClientRect(); return { x: b.left + 200, y: b.top + 3 }; });
  await p.mouse.move(grip.x, grip.y); await p.mouse.down(); await p.mouse.move(grip.x, grip.y - 60, { steps: 4 }); await p.mouse.up();
  await p.waitForTimeout(200);
  const h2 = await p.$eval('#drawer', e => e.getBoundingClientRect().height);
  check('lade is versleepbaar aan de bovenrand', h2 > g.drFrac * 768 + 40, String(h2));
  check('geen page errors', p.errs.length === 0, p.errs.join('|'));
  await ctx.close();
};
