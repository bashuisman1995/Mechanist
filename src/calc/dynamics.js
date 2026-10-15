// Massa-veer-demper, trillingsisolatie en servo-vuistregels. Puur, zonder DOM. Eenheden: kg, N/mm, N·s/m, Hz, s.
const PI = Math.PI;

/** Massa m [kg], veer k [N/mm]; demping via ζ [%], c [N·s/m] of Q. */
export function msd({ m, k, dmode, dval }) {
  const ks = k * 1000, wn = Math.sqrt(ks / m), cc = 2 * Math.sqrt(ks * m);   // k in N/m
  const zeta = dmode === "c" ? dval / cc : dmode === "Q" ? 1 / (2 * dval) : dval / 100;
  return { ks, wn, fn: wn / (2 * PI), cc, zeta, c: zeta * cc, Q: 1 / (2 * zeta),
    fd: zeta < 1 ? wn * Math.sqrt(1 - zeta * zeta) / (2 * PI) : NaN };
}
/** Dynamische meegeefbaarheid |x/F| ten opzichte van de statische: 1/√((1−r²)²+(2ζr)²), r = f/f_n. */
export const dynAmp = (r, zeta) => 1 / Math.sqrt((1 - r * r) ** 2 + (2 * zeta * r) ** 2);
/** Transmissibiliteit (grondexcitatie of krachttransmissie): √(1+(2ζr)²)·dynAmp. */
export const transmissibility = (r, zeta) => Math.sqrt(1 + (2 * zeta * r) ** 2) * dynAmp(r, zeta);
/** Maximale versterking van de meegeefbaarheid t.o.v. statisch: 1/(2ζ√(1−ζ²)) voor ζ < 1/√2, anders 1. */
export const peakAmp = zeta => (zeta < Math.SQRT1_2 ? 1 / (2 * zeta * Math.sqrt(1 - zeta * zeta)) : 1);

/** Stapresponsie y(t) (eindwaarde 1) van ω²/(s²+2ζωs+ω²). */
export function step(zeta, wn, t) {
  if (zeta < 1) {
    const wd = wn * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * wn * t) * (Math.cos(wd * t) + zeta / Math.sqrt(1 - zeta * zeta) * Math.sin(wd * t));
  }
  if (zeta === 1) return 1 - Math.exp(-wn * t) * (1 + wn * t);
  const q = Math.sqrt(zeta * zeta - 1), s1 = wn * (-zeta + q), s2 = wn * (-zeta - q);
  return 1 - (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s2 - s1);
}
/** Overshoot (fractie) van de stapresponsie. */
export const overshoot = zeta => (zeta < 1 ? Math.exp(-PI * zeta / Math.sqrt(1 - zeta * zeta)) : 0);
/** Insteltijd [s] tot de respons blijvend binnen ±band van de eindwaarde blijft. */
export function settleTime(zeta, wn, band = 0.02) {
  if (zeta < 1) {
    const sg = zeta * wn, wd = wn * Math.sqrt(1 - zeta * zeta);
    const tEnv = Math.log(1 / (band * Math.sqrt(1 - zeta * zeta))) / sg;       // omhullende < band: bovengrens
    const dt = 2 * PI / wd / 200;
    const tMin = Math.max(0, tEnv - 3 * 2 * PI / wd);                           // de laatste doorgang ligt binnen enkele perioden onder de omhullende
    for (let t = tEnv; t > tMin; t -= dt) if (Math.abs(step(zeta, wn, t) - 1) > band) return t + dt;
    return tMin;
  }
  let lo = 0, hi = 1 / wn;                                                       // monotoon stijgend: bisectie op y = 1 − band
  while (1 - step(zeta, wn, hi) > band) hi *= 2;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (1 - step(zeta, wn, mid) > band) lo = mid; else hi = mid; }
  return hi;
}

/** Insteltijd voor weergave: ζ < 1 de vuistregel 4/(ζ·ω_n) (omhullende op ≈ 2 %); ζ ≥ 1 numeriek uit de exacte stapresponsie tot de ±band. */
export function settleInfo(zeta, wn, band = 0.02) {
  if (zeta < 1) return { t: (band === 0.02 ? 4 : Math.log(1 / band)) / (zeta * wn), method: "approx" };   // vuistregel 4/(ζ·ω_n); ln(50) = 3,91
  return { t: settleTime(zeta, wn, band), method: "numeric" };
}

/** Trillingsisolator: massa m [kg], stijfheid k [N/mm] (totaal, verticaal), ζ [%], storingsfrequentie f [Hz]. */
export function isolator({ m, k, zeta, f, g = 9.81 }) {
  const ks = k * 1000, fn = Math.sqrt(ks / m) / (2 * PI), z = zeta / 100, r = f / fn;
  const T = transmissibility(r, z);
  let Tmax = 1;                                                                  // piek van T(r), numeriek rond r ≈ 1
  for (let i = 0; i <= 2000; i++) Tmax = Math.max(Tmax, transmissibility(0.3 + i * 0.001, z));
  return { ks, fn, z, r, T, dB: -20 * Math.log10(T), Tmax, dSt: m * g / ks * 1000,   // dSt in mm
    isolating: r > Math.SQRT2 };
}
/** Benodigde f_n [Hz] voor transmissibiliteit Tt bij storing f, ongedempt: T = 1/(r²−1) → r = √(1+1/T). */
export const fnForT = (f, Tt) => f / Math.sqrt(1 + 1 / Tt);

/** Servo-vuistregels. div = f_n/f_bw, Fd [N] storingskracht, xMax [mm] toegestane fout, m [kg]. */
export function servo({ fn, div, m, Fd, xMax }) {
  const fbw = fn / div, w = 2 * PI * fbw, kServo = m * w * w / 1000;              // N/mm
  const x = Fd / kServo, kReq = Fd / xMax;                                        // fout [mm], vereiste servostijfheid [N/mm]
  const fbwReq = Math.sqrt(kReq * 1000 / m) / (2 * PI);
  return { fbw, kServo, x, kReq, fbwReq, fnReq: fbwReq * div, kStruct: m * (2 * PI * fn) ** 2 / 1000,
    kStructReq: m * (2 * PI * fbwReq * div) ** 2 / 1000, tRise: 0.35 / fbw };
}
