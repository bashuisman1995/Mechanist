// Getalnotatie.
export const fmtHz = f => f === undefined ? "\u2013" : (f < 10 ? f.toPrecision(3) : f < 1000 ? f.toFixed(1) : f.toFixed(0)) + " Hz";

export function fmt(v) {
  if (v === undefined || v === null) return "–";
  const a = Math.abs(v);
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  return v.toFixed(2).replace(/0$/, "");
}

export function fmtTime(s) {
  if (s === undefined) return "–";
  return s < 1 ? (s * 1000).toFixed(0) + " ms" : s.toFixed(2) + " s";
}

// drie geldige cijfers met een decimale komma, zonder machtsnotatie waar dat leesbaar blijft
export function sg(v, d = 3) {
  if (v === undefined || v === null || Number.isNaN(v)) return "\u2013";
  if (!isFinite(v)) return v > 0 ? "\u221e" : "\u2212\u221e";
  const a = Math.abs(v);
  if (a === 0 || a < 1e-12) return "0";
  if (a < 1e-3 || a >= 1e7) return String(v.toExponential(d - 1)).replace(".", ",");
  const s = String(+v.toPrecision(d));
  return (s.indexOf("e") >= 0 ? v.toFixed(0) : s).replace(".", ",");
}
