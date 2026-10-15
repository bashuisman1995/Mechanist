// Gedeelde hulpfuncties voor scenario's
export async function newPage(browser, url, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  // de rondleiding hoort niet in de weg te zitten; opts.tour = true laat hem juist zien
  if (!opts.tour) await ctx.addInitScript(() => { try { if (!localStorage.getItem('mechschets.tour1')) localStorage.setItem('mechschets.tour1', '1'); } catch (e) {} });
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', e => p.errs.push(e.message));
  p.on('dialog', d => d.accept()); // o.a. beforeunload bij onopgeslagen wijzigingen
  await p.goto(url);
  await p.waitForSelector('#menuBtn');
  await p.waitForTimeout(600);
  return p;
}
export const playReady = (p, timeout = 60000) =>
  p.waitForFunction(() => !document.getElementById('playBtn').disabled, null, { timeout });
export async function dismissAsk(p) {
  if (await p.$eval('#askModal', e => !e.hidden)) await p.click('#askDrop');
}
export async function loadExample(p, ex) {
  await p.click('#libBtn'); await p.click(`[data-ex="${ex}"]`);
  await dismissAsk(p);
  await playReady(p);
  await p.waitForTimeout(300);
}
export async function pasteModel(p, doc) {
  await p.click('#menuBtn'); await p.click('[data-a="paste"]');
  await p.fill('#modalTa', JSON.stringify(doc)); await p.click('#modalOk');
  await dismissAsk(p);
  await p.waitForTimeout(100);
  if (await p.$eval('#solveBtn', e => !e.hidden)) await p.click('#solveBtn');
  await playReady(p);
}
export const setScrub = (p, v) => p.$eval('#scrub', (e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, v);
export const vals = p => p.$$eval('#series [data-v]', x => x.map(e => e.textContent));
export const stats = p => p.$$eval('#series [data-s]', x => x.map(e => e.textContent));
// leest het eerste getal uit weergegeven tekst: decimale komma, dunne spatie als duizendtalscheiding, echte minteken
export const num = s => parseFloat(String(s).replace(/\u2212/g, '-').replace(/(\d)[\u202f\u00a0](?=\d{3}(?!\d))/g, '$1').replace(/(\d),(\d)/g, '$1.$2').replace(/[^\d.eE+-]/g, ' ').trim().split(/\s+/)[0]);
// stijfheid uit "k = 3,54 N/mm" of "... N/µm" naar N/mm
export const kNmm = t => { const m = String(t).match(/N\/(m|mm|\u00b5m)\b/); return num(String(t).replace(/^k\s*=\s*/, '')) * (m && m[1] === '\u00b5m' ? 1000 : m && m[1] === 'm' ? 0.001 : 1); };
export const store = p => p.evaluate(() => JSON.parse(localStorage.getItem('mechschets.r1')));
export const visible = (p, sel) => p.$eval(sel, e => !e.hidden && getComputedStyle(e).display !== 'none');
export const near = (a, b, tol) => Math.abs(a - b) <= tol;
