// Calculator-tekeningen: bij elke sliderstand (min, max, willekeurige combinaties) blijft alles in het kader,
// overlappen tekstlabels elkaar niet en vult de tekening 30-90 % van het kader. Plus: geen horizontale overflow bij 5 breedtes.
import { newPage, pickCalc } from '../lib.mjs';
const SHOT = '/tmp/claude-0/-home-user-Mechanist/1e45fc4c-94b6-53cc-82eb-8e0cec55c972/scratchpad/';
const IDS = ['leaf', 'par', 'cross', 'notch', 'wire', 'hertz', 'kc', 'msd', 'iso', 'servo', 'exp', 'tau', 'tc'];
// meet in viewBox-eenheden (320 x 245)
const MEASURE = () => {
  const svg = document.getElementById('calcSvg'), vb = svg.viewBox.baseVal, R = svg.getBoundingClientRect();
  const k = Math.min(R.width / vb.width, R.height / vb.height), ox = R.left + (R.width - vb.width * k) / 2, oy = R.top + (R.height - vb.height * k) / 2;
  const box = e => { const b = e.getBoundingClientRect(); return { x0: (b.left - ox) / k, y0: (b.top - oy) / k, x1: (b.right - ox) / k, y1: (b.bottom - oy) / k }; };
  const hid = n => n.nodeType === 1 && (getComputedStyle(n).display === 'none' || ['defs', 'marker', 'pattern', 'linearGradient'].indexOf(n.tagName) >= 0);
  const vis = e => { for (let n = e; n && n !== svg; n = n.parentNode) if (hid(n)) return false; return true; };
  const out = { out: [], texts: [], ink: null };
  svg.querySelectorAll('*').forEach(e => {
    if (!vis(e) || e.tagName === 'g' || e.tagName === 'stop') return;
    const b = box(e); if (!isFinite(b.x0) || (b.x1 - b.x0 === 0 && b.y1 - b.y0 === 0)) return;
    const name = e.tagName + '.' + (e.getAttribute('class') || '');
    if (b.x0 < -0.5 || b.y0 < -0.5 || b.x1 > vb.width + 0.5 || b.y1 > vb.height + 0.5) out.out.push(name + ' ' + [b.x0, b.y0, b.x1, b.y1].map(v => Math.round(v)).join(','));
    if (e.tagName === 'text') { if (e.textContent.trim()) out.texts.push(Object.assign({ s: e.textContent.trim().slice(0, 24) }, b)); }
    else { out.ink = out.ink ? { x0: Math.min(out.ink.x0, b.x0), y0: Math.min(out.ink.y0, b.y0), x1: Math.max(out.ink.x1, b.x1), y1: Math.max(out.ink.y1, b.y1) } : b; }
  });
  out.over = [];
  for (let i = 0; i < out.texts.length; i++) for (let j = i + 1; j < out.texts.length; j++) {
    const a = out.texts[i], b = out.texts[j], w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    if (w > 2 && h > 2) out.over.push(a.s + ' | ' + b.s);
  }
  out.occ = out.ink ? Math.max((out.ink.x1 - out.ink.x0) / vb.width, (out.ink.y1 - out.ink.y0) / vb.height) : 0;
  return out;
};
export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url);
  await p.click('#workSeg [data-w="calc"]');
  const frames = () => p.waitForTimeout(450);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const bad = [];
  for (const id of IDS) {
    await pickCalc(p, id);
    const sl = await p.$$eval('[data-sl]', n => n.map(e => e.dataset.sl));
    const combos = [['min', () => 0], ['max', () => 1000]];
    for (let k = 0; k < 3; k++) { const m = {}; sl.forEach(s => { m[s] = Math.round(rnd() * 1000); }); combos.push(['rnd' + k, s => m[s]]); }
    for (const [nm, fn] of combos) {
      const vals = {}; sl.forEach(s => { vals[s] = fn(s); });
      await p.$$eval('[data-sl]', (n, vals) => n.forEach(e => { e.value = vals[e.dataset.sl]; e.dispatchEvent(new Event('input', { bubbles: true })); }), vals);
      await frames();
      const m = await p.evaluate(MEASURE);
      const why = [];
      if (m.out.length) why.push('buiten kader: ' + m.out.slice(0, 4).join('; '));
      if (m.over.length) why.push('overlap: ' + m.over.slice(0, 4).join('; '));
      if (!(m.occ >= 0.3 && m.occ <= 0.9)) why.push('vulling ' + Math.round(m.occ * 100) + ' %');
      if (why.length) bad.push(id + '/' + nm + ': ' + why.join(' · '));
      if (process.env.FITSHOT || (why.length && process.env.FITSHOTBAD)) await p.screenshot({ path: SHOT + 'calcfit_' + id + '_' + nm + '.png', clip: await p.$eval('#calcSvg', e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }) });
    }
  }
  if (process.env.VERBOSE || bad.length) console.log(bad.join('\n'));
  check('alle calculators: binnen kader, geen overlappende labels, vulling 30-90 % (min/max/willekeurig)', bad.length === 0, bad.length + ' afwijkingen');

  // fluide layout
  for (const w of [390, 768, 1366, 1920, 2560]) {
    await p.setViewportSize({ width: w, height: 900 });
    const over = [];
    for (const id of IDS) {
      await pickCalc(p, id); await p.waitForTimeout(120);
      const o = await p.evaluate(() => {
        const r = document.getElementById('calcRoot'), res = [];
        r.querySelectorAll('details').forEach(d => { d.open = true; });
        if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) res.push('document');
        r.querySelectorAll('*').forEach(e => {
          if (e.closest('svg') && e.tagName !== 'svg') return;
          if (getComputedStyle(e).display === 'none') return;
          if (e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible') res.push(e.tagName + '.' + (typeof e.className === 'string' ? e.className : '') + '#' + e.id);
        });
        return res.slice(0, 3);
      });
      if (o.length) over.push(id + ': ' + o.join(', '));
    }
    if (over.length && process.env.VERBOSE) console.log(w, over.join('\n'));
    check('geen overflow bij ' + w + ' px', over.length === 0, over.slice(0, 4).join(' | '));
    if (process.env.FITSHOT) { await pickCalc(p, 'msd'); await p.screenshot({ path: SHOT + 'calcfit_page_' + w + '.png' }); }
  }
  check('geen paginafouten', p.errs.length === 0, p.errs.join('|'));
};
