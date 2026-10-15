import { newPage, loadExample, num, stats } from '../lib.mjs';
export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url);
  for (const ex of ['virtualplay', 'preload']) {
    const before = p.errs.length;
    await loadExample(p, ex);
    const g = await stats(p);
    check(`${ex}: Dynamica loopt zonder fouten en geeft meetwaarden`, p.errs.length === before && g.length >= 1 && g.every(s => /min .* max/.test(s)), g.join('|') + p.errs.join('|'));
  }
  // virtuele speling: bal ligt in de groef, x blijft in het micrometerbereik (|x| < 0.01 mm)
  await loadExample(p, 'virtualplay');
  const s = (await stats(p))[0];
  const nums = (s.replace(/\u2212/g, '-').match(/-?\d+([.,]\d+)?/g) || []).map(x => Number(x.replace(',', '.')));
  check('virtualplay: x binnen enkele micrometer (grafiek in µm)', nums.length >= 2 && Math.max(...nums.slice(0, 2).map(Math.abs)) < 5, s);
  // het contact verschijnt in het eigenschappenpaneel: zoek het aan te klikken vlak op het canvas
  await p.click('[data-t="props"]');
  const box = await p.$eval('#cv', e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  let found = false;
  scan: for (let y = box.y + 20; y < box.y + box.h - 20; y += 8)
    for (let x = box.x + 20; x < box.x + box.w - 20; x += 8) {
      await p.mouse.click(x, y);
      if (/Contact bal/.test(await p.$eval('#props', e => e.textContent))) { found = true; break scan; }
    }
  check('contact verschijnt in de inspector', found);
  if (found) {
    const t = await p.$eval('#props', e => e.textContent);
    check('inspector toont R, μ en F_n live', /Straal bal R/.test(t) && /Wrijving/.test(t) && /Fₙ/.test(t) && /Toestand/.test(t), t.slice(0, 200));
    await p.click('[data-t="how"]'); await p.waitForTimeout(200);
    const h = await p.$eval('#howPanel', e => e.textContent);
    check('Hoe rekent dit: Hertz-formule', /Contact bal/.test(h) && /δ3\/2/.test(h.replace(/\s/g, '')) || /δ.*3\/2/.test(h), h.slice(-300));
  }
  check('geen page errors', p.errs.length === 0, p.errs.join('|'));
  await p.context().close();
};
