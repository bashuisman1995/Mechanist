// Gedeelde hulpfuncties voor scenario's
export async function newPage(browser, url, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
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
  await p.click('#menuBtn'); await p.click(`[data-ex="${ex}"]`);
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
export const num = s => parseFloat(String(s).replace(/[^\d.eE+-]/g, ' ').trim().split(/\s+/)[0]);
export const store = p => p.evaluate(() => JSON.parse(localStorage.getItem('mechschets.r1')));
export const visible = (p, sel) => p.$eval(sel, e => !e.hidden && getComputedStyle(e).display !== 'none');
export const near = (a, b, tol) => Math.abs(a - b) <= tol;
