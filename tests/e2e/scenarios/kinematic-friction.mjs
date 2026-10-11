import { newPage, stats, store, pasteModel } from '../lib.mjs';
export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url);
  const base = await store(p);
  const s0 = await stats(p);
  check('vierstang: statistieken zonder wrijving', s0.length >= 1 && /min 106\.68 · max 358\.18/.test(s0[0]), s0[0]);
  for (const n of base.nodes) { n.mus = 0.3; n.muk = 0.2; n.rj = 4; }
  base.mode = 'kin';
  await pasteModel(p, base).catch(() => {});
  await p.waitForTimeout(300);
  const s1 = await stats(p);
  check('kinematisch + wrijving: geometrie ongewijzigd', /min 106\.68 · max 358\.18/.test(s1[0]), s1[0]);
  check('geen page errors', p.errs.length === 0, p.errs.join('|'));
  await p.context().close();
};
