// Overlays laten de tekening vrij: compacte onderbalk bij Stijfheid, hint die verdwijnt (en met ? terugkomt), uitleg die inklapt.
import { newPage, loadExample } from '../lib.mjs';

export default async ({ browser, url, check }) => {
  for (const [w, h, tag] of [[1366, 768, 'desktop'], [390, 800, 'telefoon']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.addInitScript(() => { try { localStorage.setItem('mechschets.tour1', '1'); } catch (e) {} });
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.goto(url); await p.waitForSelector('#menuBtn'); await p.waitForTimeout(500);
    await loadExample(p, 'stiffmixed');
    const geo = await p.evaluate(() => {
      const r = id => document.getElementById(id).getBoundingClientRect();
      const bar = r('stiffBar'), tr = r('transport'), st = document.querySelector('.stage').getBoundingClientRect(), chips = document.getElementById('stiffChips');
      return { barH: bar.height, trH: tr.height, inTransport: !!document.getElementById('transport').contains(document.getElementById('stiffBar')), stageH: st.height,
        oneRow: bar.height < 50, docked: Math.abs(tr.bottom - st.bottom) <= 14, chipsScroll: chips.scrollWidth > chips.clientWidth, chipsOv: getComputedStyle(chips).overflowX,
        hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    check(`${tag}: Stijfheid-balk is één rij, onderin, in de transportbalk`, geo.inTransport && geo.oneRow && geo.docked && geo.trH < 62, JSON.stringify(geo));
    check(`${tag}: modechips scrollen horizontaal`, geo.chipsOv === 'auto' && (tag === 'desktop' || geo.chipsScroll), JSON.stringify(geo));
    check(`${tag}: balk neemt weinig van het canvas (< 12 %)`, geo.trH / geo.stageH < 0.12 + (tag === 'telefoon' ? 0.05 : 0), JSON.stringify(geo));
    check(`${tag}: geen horizontale paginascroll`, !geo.hScroll);
    // inklappen
    await p.click('#stiffFold'); await p.waitForTimeout(100);
    const f = await p.evaluate(() => ({ chips: getComputedStyle(document.getElementById('stiffChips')).display, sum: document.getElementById('stiffSum').textContent, exp: document.getElementById('stiffFold').getAttribute('aria-expanded') }));
    check(`${tag}: balk klapt in (samenvatting zichtbaar)`, f.chips === 'none' && /Statisch/.test(f.sum) && f.exp === 'false', JSON.stringify(f));
    await p.click('#stiffFold'); await p.waitForTimeout(100);
    check(`${tag}: balk klapt weer uit`, await p.$eval('#stiffChips', e => getComputedStyle(e).display !== 'none'));
    // hint: weg na de eerste handeling op de tekening, terug met ?
    await p.click('#libBtn'); await p.click('[data-ex="fourbar"]'); await p.waitForTimeout(100);
    const dim0 = await p.$eval('#hint', e => e.classList.contains('dim'));
    await p.mouse.click(w / 2, h / 3);
    await p.waitForTimeout(150);
    const dim1 = await p.$eval('#hint', e => e.classList.contains('dim'));
    check(`${tag}: hint verdwijnt na de eerste handeling`, dim1, 'voor: ' + dim0);
    await p.click('#helpBtn'); await p.waitForTimeout(100);
    const back = await p.evaluate(() => ({ dim: document.getElementById('hint').classList.contains('dim'), t: document.getElementById('hint').textContent }));
    check(`${tag}: ? brengt de hint terug`, !back.dim && back.t.length > 10, JSON.stringify(back));
    await p.keyboard.press('?'); await p.waitForTimeout(50);
    await p.waitForTimeout(6300);
    check(`${tag}: hint verdwijnt vanzelf na 6 s`, await p.$eval('#hint', e => e.classList.contains('dim')));
    // uitleg klapt in na een klik op de tekening en gaat open met ?
    await p.click('#libBtn'); await p.click('[data-ex="stiffportal"]'); await p.waitForTimeout(150);
    if (tag === 'desktop') check(`${tag}: uitleg staat eerst open`, await p.$eval('#uitleg', e => !e.classList.contains('min')));
    await p.mouse.click(w / 2, h / 4); await p.waitForTimeout(100);
    check(`${tag}: uitleg klapt in als compact label`, await p.$eval('#uitleg', e => !e.hidden && e.classList.contains('min') && e.getBoundingClientRect().height < 40));
    await p.click('#helpBtn'); await p.waitForTimeout(100);
    check(`${tag}: ? klapt de uitleg weer uit`, await p.$eval('#uitleg', e => !e.classList.contains('min')));
    check(`${tag}: geen page errors`, p.errs.length === 0, p.errs.join('|'));
    await ctx.close();
  }
};
