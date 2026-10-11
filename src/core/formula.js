// Formulecompiler voor eigen metingen (zonder DOM).
import { sim } from "./state.js";

export const normAl = s => s.toLowerCase().replace(/_/g, ".");
export const alias = nm => sim.ALIAS.get(nm) || sim.ALIASN.get(normAl(nm));

/* ---- kleine formule-taal over de meetkanalen ----
   C.x - C.y, hypot(C.vx, C.vy), N_BC/1000, abs(T_AB) ... */
const FN = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos,
  atan: Math.atan, atan2: Math.atan2, abs: Math.abs, sqrt: Math.sqrt, exp: Math.exp,
  log: Math.log, min: Math.min, max: Math.max, hypot: Math.hypot, sign: Math.sign,
  rad: d => d * Math.PI / 180, deg: r => r * 180 / Math.PI
};
export function compile(src) {
  let i = 0;
  const used = [];
  const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  const eat = c => { ws(); if (src.startsWith(c, i)) { i += c.length; return true; } return false; };
  function expr() {
    let f = term();
    for (;;) {
      ws();
      if (eat("+")) { const a = f, b = term(); f = g => a(g) + b(g); }
      else if (eat("-")) { const a = f, b = term(); f = g => a(g) - b(g); }
      else return f;
    }
  }
  function term() {
    let f = unary();
    for (;;) {
      ws();
      if (eat("*")) { const a = f, b = unary(); f = g => a(g) * b(g); }
      else if (eat("/")) { const a = f, b = unary(); f = g => a(g) / b(g); }
      else return f;
    }
  }
  function unary() {
    ws();
    if (eat("-")) { const a = unary(); return g => -a(g); }
    if (eat("+")) return unary();
    return power();
  }
  function power() {
    const a = atom();
    ws();
    if (eat("^")) { const b = unary(); return g => Math.pow(a(g), b(g)); }
    return a;
  }
  function atom() {
    ws();
    if (eat("(")) { const e = expr(); if (!eat(")")) throw new Error("sluithaakje ontbreekt"); return e; }
    const num = /^\d+(\.\d+)?([eE][+-]?\d+)?/.exec(src.slice(i));
    if (num) { i += num[0].length; const v = parseFloat(num[0]); return () => v; }
    const id = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(i));
    if (!id) throw new Error("onbegrijpelijk bij teken " + (i + 1));
    i += id[0].length;
    const nm = id[0];
    ws();
    if (src[i] === "(") {
      i++;
      const args = [];
      if (!eat(")")) {
        for (;;) { args.push(expr()); if (eat(")")) break; if (!eat(",")) throw new Error("komma of ) verwacht"); }
      }
      const fn = FN[nm];
      if (!fn) throw new Error("onbekende functie " + nm);
      return g => fn.apply(null, args.map(a => a(g)));
    }
    if (nm === "pi") return () => Math.PI;
    if (nm !== "t" && !alias(nm)) throw new Error("onbekende grootheid " + nm);
    used.push(nm);
    return g => g(nm);
  }
  const f = expr();
  ws();
  if (i < src.length) throw new Error("onverwacht teken bij " + (i + 1));
  return { f, used };
}

export function exprUnit(used, src) {
  if (/[*/^]/.test(src)) return "";
  const us = new Set(used.filter(u => u !== "t").map(u => (alias(u) || {}).u));
  return us.size === 1 ? [...us][0] : "";
}
