import test from "node:test";
import assert from "node:assert/strict";
import { computeDyn } from "../../src/core/dynamics.js";
import { close, resetModel, run } from "./helpers.mjs";

const g = 9.81;

test("slinger: periode = 2π sqrt(L/g) en energiedrift klein", () => {
  // L = 100 mm, hoek 5 graden. T = 2π sqrt(0.1/9.81) = 0.6344 s (kleine-hoekcorrectie 1 + th²/16 = +0.05%)
  const L = 100, th0 = 5 * Math.PI / 180;
  resetModel({
    gravity: true, simDur: 2,
    nodes: [{ id: "P", x: 0, y: 0, support: "pin" }, { id: "Q", x: L * Math.sin(th0), y: -L * Math.cos(th0), m: 1 }],
    elems: [{ id: "rod", type: "link", a: "P", b: "Q", len: L }]
  });
  const S = run(computeDyn());
  assert.ok(S && S.ok[360]);
  const x = S.pos.Q.map(p => p.x), t = S.t;
  // nuldoorgangen van x(t) (lineair geïnterpoleerd): T/4, 3T/4, 5T/4, 7T/4
  const zc = [];
  for (let i = 0; i < 360; i++) if (x[i] * x[i + 1] < 0) zc.push(t[i] - x[i] * (t[i + 1] - t[i]) / (x[i + 1] - x[i]));
  assert.ok(zc.length >= 4, "minstens vier nuldoorgangen, kreeg " + zc.length);
  const Texp = 2 * Math.PI * Math.sqrt(L / 1000 / g);
  close(zc[2] - zc[0], Texp, { rtol: 0.01, label: "periode (neer-neer)" });
  close(zc[3] - zc[1], Texp, { rtol: 0.01, label: "periode (op-op)" });
  // energie: E = m g y [J, y in mm -> 1e-3]; potentiële spanwijdte m g L (1 - cos th0)
  const span = 1 * g * L * 1e-3 * (1 - Math.cos(th0));
  let lo = Infinity, hi = -Infinity;
  for (const E of S.E) { lo = Math.min(lo, E); hi = Math.max(hi, E); }
  assert.ok(hi - lo < 0.005 * span, `energiedrift ${(hi - lo) / span} van de potentiële spanwijdte`);
  // lengte van de staaf blijft behouden
  const dev = Math.max(...S.pos.Q.map(p => Math.abs(Math.hypot(p.x, p.y) - L)));
  assert.ok(dev < 1e-6, "staaflengte-afwijking " + dev);
});

const block = (mus, muk) => {
  const a = -25 * Math.PI / 180;
  resetModel({
    gravity: true, simDur: 1,
    nodes: [{ id: "S", x: 0, y: 0, support: "slider", dir: -25, m: 1, mus, muk }],
    elems: []
  });
  return a;
};
const speed = (S, i) => Math.hypot(S.vel.S[i].x, S.vel.S[i].y);

test("wrijving: statische wrijving houdt blok vast (tan 25° = 0.466 < mus 0.5)", () => {
  block(0.5, 0.5);
  const S = run(computeDyn());
  assert.ok(S);
  assert.ok(speed(S, 360) < 1, "snelheid na 1 s: " + speed(S, 360) + " mm/s");
});

test("wrijving: glijden met mus .4 muk .2 -> v = g (sin25° - muk cos25°) t", () => {
  // a = 9.81 (0.42262 - 0.2·0.90631) = 2.3677 m/s²  ->  2367.7 mm/s na 1 s
  block(0.4, 0.2);
  const S = run(computeDyn());
  const a = g * (Math.sin(25 * Math.PI / 180) - 0.2 * Math.cos(25 * Math.PI / 180));
  close(speed(S, 360), a * 1000, { rtol: 0.01, label: "snelheid" });
  close(speed(S, 360), 2367.7, { rtol: 0.01, label: "snelheid (getal)" });
  // normaalkracht N = m g cos25° = 8.891 N
  close(Math.abs(S.R.S[180].n), g * Math.cos(25 * Math.PI / 180), { rtol: 1e-3, label: "normaalreactie" });
});

test("wrijving: zonder wrijving v = g sin25° t = 4145.9 mm/s en N = 8.89 N", () => {
  block(0, 0);
  const S = run(computeDyn());
  close(speed(S, 360), g * Math.sin(25 * Math.PI / 180) * 1000, { rtol: 1e-3, label: "snelheid" });
  close(speed(S, 360), 4145.9, { rtol: 1e-3, label: "snelheid (getal)" });
  close(Math.abs(S.R.S[360].n), 8.89, { rtol: 1e-3, label: "normaalreactie (getal)" });
});
