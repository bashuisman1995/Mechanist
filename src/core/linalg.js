// Lineaire algebra: Gauss, kleinste kwadraten, Cholesky, Jacobi (zonder DOM).
export function gauss(A, n) {
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    const t = A[c]; A[c] = A[p]; A[p] = t;
    const pv = A[c][c];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / pv;
      if (!f) continue;
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = A[i][n] / A[i][i];
  return x;
}

/* ---- minimum-norm solve of  A x = rhs ---- */
export function lsq(rows, rhs, nv) {
  const m = rows.length;
  if (!m) return new Float64Array(nv);
  const A = [];
  for (let i = 0; i < m; i++) {
    const r = new Float64Array(m + 1), ri = rows[i];
    for (let j = 0; j < m; j++) {
      const rj = rows[j];
      let s = 0;
      for (let k = 0; k < nv; k++) s += ri[k] * rj[k];
      r[j] = s + (i === j ? 1e-9 : 0);
    }
    r[m] = rhs[i];
    A.push(r);
  }
  const lam = gauss(A, m);
  if (!lam) return null;
  const x = new Float64Array(nv);
  for (let k = 0; k < nv; k++) {
    let s = 0;
    for (let i = 0; i < m; i++) s += rows[i][k] * lam[i];
    x[k] = s;
  }
  return x;
}

// kleine lineaire algebra voor de FRF
export function cholesky(A) {
  const n = A.length, L = [];
  for (let i = 0; i < n; i++) L.push(new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = A[i][j];
    for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    if (i === j) { if (!(s > 0)) return null; L[i][i] = Math.sqrt(s); }
    else L[i][j] = s / L[j][j];
  }
  return L;
}
export function congruence(L, K) {          // L⁻¹ K L⁻ᵀ
  const n = L.length, fwd = b => { const x = new Float64Array(n);
    for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * x[k]; x[i] = s / L[i][i]; } return x; };
  const Y = [];                        // Y = L⁻¹ K (kolomsgewijs)
  for (let j = 0; j < n; j++) Y.push(fwd(K.map(r => r[j])));
  const A = [];
  for (let i = 0; i < n; i++) A.push(new Float64Array(n));
  for (let i = 0; i < n; i++) {        // A = L⁻¹ (L⁻¹ K)ᵀ
    const row = fwd(Y.map(c => c[i]));
    for (let j = 0; j < n; j++) A[j][i] = row[j];
  }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) A[i][j] = A[j][i] = (A[i][j] + A[j][i]) / 2;
  return A;
}
export function backSubT(L, v) {            // L⁻ᵀ v
  const n = L.length, x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = v[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
  return x;
}
export function jacobiEig(A0) {
  const n = A0.length, A = A0.map(r => Float64Array.from(r)), V = [];
  for (let i = 0; i < n; i++) { V.push(new Float64Array(n)); V[i][i] = 1; }
  for (let sweepN = 0; sweepN < 60; sweepN++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {
        const akp = A[k][p], akq = A[k][q];
        A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = A[p][k], aqk = A[q][k];
        A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < n; k++) {
        const vkp = V[k][p], vkq = V[k][q];
        V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
      }
    }
  }
  return A.map((r, i) => ({ val: A[i][i], vec: V.map(row => row[i]) }));
}
