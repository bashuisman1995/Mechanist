import test from "node:test";
import assert from "node:assert/strict";
import { close, resetModel } from "./helpers.mjs";
import { solveStiffness } from "../../src/core/stiffness.js";
import { chainAll, orderPath, pathProfile } from "../../src/core/stiffpath.js";

// uitkraging in A ingeklemd, kracht F omlaag aan het eind. Roark: δ = FL³/(3EI), φ = FL²/(2EI), M(0) = F·L

const E = 210000, L = 200, F = 10, I = 10 * 2 ** 3 / 12, prof = { prof: "rect", pb: 10, ph: 2, mat: "staal" };
function cantilever(n) {
  const nodes = [], elems = [];
  for (let i = 0; i <= n; i++) nodes.push({ id: "P" + i, x: L * i / n, y: 0, ...(i === 0 ? { support: "pin", clamp: true } : {}) });
  for (let i = 0; i < n; i++) elems.push({ id: "b" + i, type: "link", a: "P" + i, b: "P" + (i + 1), len: L / n, beam: true, ...prof });
  elems.push({ id: "F", type: "force", node: "P" + n, mag: F, ang: -90 });
  resetModel({ nodes, elems });
  return solveStiffness();
}
test("verloop langs een uitkraging: einde = FL³/3EI, φ = FL²/2EI, wortelmoment = F·L, s loopt van 0 tot L", () => {
  const res = cantilever(1);
  if (!res.ok) { console.log(res.mech && res.mech.text); }
  assert.ok(res.ok);
  const pr = pathProfile(res, ["b0"]), last = pr.pts[pr.pts.length - 1], first = pr.pts[0];
  close(pr.len, L, { rtol: 1e-12 });
  close(first.s, 0, { atol: 1e-12 }); close(last.s, L, { rtol: 1e-12 });
  close(last.uy, -F * L ** 3 / (3 * E * I), { rtol: 2e-3 });
  close(last.th, -F * L ** 2 / (2 * E * I), { rtol: 2e-3 });
  close(Math.abs(first.M), F * L / 1000, { rtol: 2e-3 });                     // N·m
  close(Math.abs(last.M), 0, { atol: 1e-6 });
  close(first.uy, 0, { atol: 1e-9 });
  // tussenwaarde bij x = L/2: δ(x) = F·x²·(3L − x)/(6EI)
  const mid = pr.pts[12];
  close(mid.uy, -F * (L / 2) ** 2 * (3 * L - L / 2) / (6 * E * I), { rtol: 2e-3 });
  // de eindwaarde komt overeen met de knoopverplaatsing uit de oplossing
  close(last.uy, res.nodes.get("P1").uy, { rtol: 1e-9 });
});
test("pad over twee balken, ook in omgekeerde klikvolgorde: s doorlopend en gelijke eindwaarde", () => {
  const res = cantilever(2);
  assert.ok(res.ok);
  const a = pathProfile(res, ["b0", "b1"]), r = pathProfile(res, ["b1", "b0"]);
  close(a.len, L, { rtol: 1e-12 }); close(r.len, L, { rtol: 1e-12 });
  close(a.pts[a.pts.length - 1].uy, res.nodes.get("P2").uy, { rtol: 1e-9 });
  close(r.pts[0].uy, res.nodes.get("P2").uy, { rtol: 1e-9 });                 // omgekeerd: begint bij C
  close(r.pts[r.pts.length - 1].uy, 0, { atol: 1e-9 });
  assert.deepEqual(chainAll(res), ["b0", "b1"]);
  assert.deepEqual(orderPath(res, ["b0", "b1"]).map(i => i.rev), [false, false]);
  assert.ok(a.pts.every((q, i) => i === 0 || q.s >= a.pts[i - 1].s));
  assert.ok(!a.pts.some(q => q.brk));
  // niet aansluitend pad: onderbroken
  const gap = orderPath(res, ["b0", "b0"]);
  assert.equal(gap.length, 1);
});

test("hoekraamwerk: het moment is continu over de knoop, ook als een balk achterstevoren wordt doorlopen, en keert van teken bij omkeren", () => {
  // A(0,0) ingeklemd, B(0,100), C(100,100); kracht F omlaag in C: M is F·100 bij A..B constant, daarna lineair naar 0 in C
  resetModel({
    nodes: [{ id: "A", x: 0, y: 0, support: "pin", clamp: true }, { id: "B", x: 0, y: 100 }, { id: "C", x: 100, y: 100 }],
    elems: [{ id: "b0", type: "link", a: "A", b: "B", len: 100, beam: true, ...prof }, { id: "b1", type: "link", a: "B", b: "C", len: 100, beam: true, ...prof }, { id: "F", type: "force", node: "C", mag: F, ang: -90 }],
  });
  const res = solveStiffness(); assert.ok(res.ok);
  const f = pathProfile(res, ["b0", "b1"]), r = pathProfile(res, ["b1", "b0"]);
  const at = (pr, s) => pr.pts.reduce((a, q) => (Math.abs(q.s - s) < Math.abs(a.s - s) ? q : a));
  close(Math.abs(at(f, 0).M), F * 100 / 1000, { rtol: 1e-3 });           // N·m
  close(Math.abs(at(f, 200).M), 0, { atol: 1e-6 });
  // continuiteit op de knoop (s = 100): beide kanten van de overgang gelijk
  const jf = f.pts.filter(q => Math.abs(q.s - 100) < 1e-9), jr = r.pts.filter(q => Math.abs(q.s - 100) < 1e-9);
  close(jf[0].M, jf[1].M, { rtol: 1e-6, atol: 1e-9 }); close(jr[0].M, jr[1].M, { rtol: 1e-6, atol: 1e-9 });
  // omgekeerd pad: M_rev(s) = −M_fwd(L − s)
  close(at(r, 40).M, -at(f, 160).M, { rtol: 1e-6, atol: 1e-9 });
  assert.deepEqual(orderPath(res, ["b1", "b0"]).map(i => i.rev), [true, true]);
});
test("axiale staaf in het pad: lineair verloop van de verplaatsing, geen draaiing of moment, σ = N/A", () => {
  resetModel({
    nodes: [{ id: "A", x: 0, y: 0, support: "pin" }, { id: "B", x: 100, y: 0, support: "slider", dir: 0 }],
    elems: [{ id: "s0", type: "link", a: "A", b: "B", len: 100, axial: true, A: 20, mat: "staal" }, { id: "F", type: "force", node: "B", mag: 100, ang: 0 }],
  });
  const res = solveStiffness(), pr = pathProfile(res, ["s0"]);
  assert.ok(res.ok);
  assert.equal(pr.pts.length, 2);
  assert.ok(Number.isNaN(pr.pts[0].th) && Number.isNaN(pr.pts[0].M));
  close(pr.pts[1].sig, 100 / 20, { rtol: 1e-6 });
  close(pr.pts[1].ux, 100 / (210000 * 20 / 100), { rtol: 1e-6 });          // ΔL = N·L/(E·A)
  close(pr.pts[0].ux, 0, { atol: 1e-12 });
});
