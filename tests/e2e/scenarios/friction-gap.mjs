import { newPage, pasteModel, setScrub, vals, stats, loadExample, num } from '../lib.mjs';
export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url);
  const slider = async (mus, muk) => {
    await pasteModel(p, { nodes: [{ id: 'n1', x: 0, y: 0, support: 'slider', dir: -25, m: 1, name: 'A', ax: 0, ay: 0, mus, muk }],
      elems: [], series: [{ key: 'n|n1|v' }, { key: 'r|n1|Rn' }], mode: 'dyn', gravity: true, simDur: 1, dtStep: 0.1, defMass: 0.1, durMode: 'fixed' });
    await setScrub(p, 360); await p.waitForTimeout(100);
    return vals(p);
  };
  let v = await slider(0.5, 0.3);
  check('helling 25°, mus .5: blijft staan (|v| 0 mm/s)', Math.abs(num(v[0])) <= 0.01 && /mm\/s/.test(v[0]), v[0]);
  check('normaalkracht 8.89 N', Math.abs(num(v[1]) - 8.89) <= 0.02, v[1]);
  v = await slider(0.4, 0.2);
  check('mus .4 muk .2: glijdt met 2358 mm/s (±15)', Math.abs(num(v[0]) - 2358) <= 15, v[0]);
  v = await slider(0, 0);
  check('zonder wrijving: 4145.9 mm/s (±5)', Math.abs(num(v[0]) - 4145.9) <= 5, v[0]);
  check('normaalkracht zonder wrijving 8.89 N', Math.abs(num(v[1]) - 8.89) <= 0.02, v[1]);

  const pend = (mus, rj = 5) => pasteModel(p, { nodes: [{ id: 'n1', x: 0, y: 0, support: 'pin', name: 'A', ax: 0, ay: 0, mus, muk: mus * 0.8, rj, m: 0 },
    { id: 'n2', x: 100, y: 0, support: 'free', name: 'B', ax: 100, ay: 0, m: 1 }],
    elems: [{ id: 'e3', type: 'link', a: 'n1', b: 'n2', len: 100 }], series: [{ key: 'n|n2|y' }, { key: 'e||E' }],
    mode: 'dyn', gravity: true, simDur: 1, dtStep: 0.1, defMass: 0.1, durMode: 'fixed' });
  await pend(25);
  await setScrub(p, 360); await p.waitForTimeout(100);
  v = await vals(p);
  check('scharnierwrijving mus 25: blijft op y 0.00', Math.abs(num(v[0])) <= 0.01, v[0]);
  await pend(15);
  await setScrub(p, 360); await p.waitForTimeout(100);
  v = await vals(p);
  check('scharnierwrijving mus 15: valt (y < -90)', num(v[0]) < -90, v[0]);

  // energieverval met wrijving
  await pasteModel(p, { nodes: [{ id: 'n1', x: 0, y: 0, support: 'pin', name: 'A', ax: 0, ay: 0, mus: 0.3, muk: 0.2, rj: 20, m: 0 },
    { id: 'n2', x: 100, y: 0, support: 'free', name: 'B', ax: 100, ay: 0, m: 1 }],
    elems: [{ id: 'e3', type: 'link', a: 'n1', b: 'n2', len: 100 }], series: [{ key: 'e||E' }],
    mode: 'dyn', gravity: true, simDur: 4, dtStep: 0.1, defMass: 0.1, durMode: 'fixed' });
  const E = [];
  for (let i = 0; i <= 360; i += 30) { await setScrub(p, i); await p.waitForTimeout(40); E.push(num((await vals(p))[0])); }
  let mono = true; for (let i = 1; i < E.length; i++) if (E[i] > E[i - 1] + 1e-6) mono = false;
  check('energie stijgt nooit (wrijving dissipeert)', mono, E.join(' '));
  check('energie eindwaarde is gedaald (< -0.5 J)', E[E.length - 1] < -0.5, E[E.length - 1]);

  await loadExample(p, 'gaplimit');
  const g = await stats(p);
  check('gaplimit heeft statistieken (2 reeksen)', g.length === 2 && g.every(s => /min .* max/.test(s)), g.join('|'));
  check('gaplimit: max-waarden 0.00 (speling begrenst)', g.every(s => /max 0\b/.test(s)), g.join('|'));
  await loadExample(p, 'frictionslide');
  const f = await stats(p);
  check('frictionslide heeft statistieken', f.length === 2 && f.every(s => /min .* max/.test(s)), f.join('|'));
  check('geen page errors', p.errs.length === 0, p.errs.join('|'));
  await p.context().close();
};
