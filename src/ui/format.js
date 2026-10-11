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
