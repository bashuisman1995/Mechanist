import test from "node:test";
import assert from "node:assert/strict";
import { compile } from "../../src/core/formula.js";
import { sim } from "../../src/core/state.js";
import { close, resetModel } from "./helpers.mjs";

const ev = (src, vals = {}) => compile(src).f(nm => vals[nm]);

test("compile: aliassen, hoofdletters en underscore", () => {
  resetModel();
  sim.ALIASN.set("c.x", { u: "mm" });   // "c_x" en "C.x" normaliseren hiernaartoe
  sim.ALIASN.set("c.y", { u: "mm" });
  const { f, used } = compile("c_x - C.y");
  assert.deepEqual(used, ["c_x", "C.y"]);
  // 7 - 2 = 5
  close(f(nm => ({ c_x: 7, "C.y": 2 })[nm]), 5, { atol: 1e-15 });
});

test("compile: exacte alias en de tijdsvariabele t", () => {
  resetModel();
  sim.ALIAS.set("E", { u: "J" });
  close(ev("E*2 + t", { E: 3, t: 0.5 }), 6.5, { atol: 1e-15 });
});

test("compile: operatorvoorrang", () => {
  resetModel();
  close(ev("2+3*4"), 14);                 // 2 + 12
  close(ev("(2+3)*4"), 20);
  close(ev("2+3*4^2/8-1"), 7);            // 2 + 3*16/8 - 1
  close(ev("10-4-3"), 3);                 // links-associatief: (10-4)-3
  close(ev("100/10/5"), 2);               // (100/10)/5
  close(ev("-2^2"), -4);                  // -(2^2)
  close(ev("2^3^2"), 512);                // rechts-associatief: 2^(3^2)
  close(ev("2*-3"), -6);
  close(ev("1.5e2 + 1"), 151);
});

test("compile: functies sqrt/atan2/deg", () => {
  resetModel();
  close(ev("sqrt(16)"), 4);
  close(ev("atan2(1,1)"), Math.PI / 4, { atol: 1e-15 });
  close(ev("deg(atan2(1,1))"), 45, { atol: 1e-12 });   // (π/4)·180/π
  close(ev("deg(pi)"), 180, { atol: 1e-12 });
  close(ev("rad(180)"), Math.PI, { atol: 1e-15 });
  close(ev("hypot(3,4)"), 5);
  close(ev("max(1,5,3) - min(4,2)"), 3);
});

test("compile: fouten", () => {
  resetModel();
  assert.throws(() => compile("onbekend + 1"), /unknown quantity onbekend/);
  assert.throws(() => compile("foo(1)"), /unknown function foo/);
  assert.throws(() => compile("(1+2"), /closing parenthesis/);
  assert.throws(() => compile("1 2"), /unexpected/);
  assert.throws(() => compile("1 + "), /not understood/);
});
