import test from "node:test";
import assert from "node:assert/strict";
import { effModulus, effShear, shearModulus, effRadius, hertzSphere, kinCoupling } from "../../src/calc/contact.js";
import { msd, dynAmp, transmissibility, peakAmp, step, overshoot, settleTime, settleInfo, isolator, fnForT, servo } from "../../src/calc/dynamics.js";
import { dLength, athermal, lumped } from "../../src/calc/thermal.js";
import { MATERIALS, material } from "../../src/calc/materials.js";
import { close } from "./helpers.mjs";

// ---------- Hertz ----------
// Handberekening: staal/staal (E = 210 GPa, ν = 0,3): E* = 210000/(2·0,91) = 115 384,6 MPa.
// R = 5 mm, F = 10 N: a³ = 3·10·5/(4·115 384,6) = 3,25e-4 mm³ → a = 0,06875 mm.
test("Hertz bol–vlak: handberekening staal/staal, R = 5 mm, F = 10 N", () => {
  const Es = effModulus(210000, 0.3, 210000, 0.3);
  close(Es, 115384.6, { rtol: 1e-6 });
  const h = hertzSphere({ F: 10, R: 5, Es });
  close(h.a ** 3, 3.25e-4, { rtol: 1e-6 });
  close(h.a, 0.06875, { atol: 2e-5 });
  close(h.delta, 0.06875 ** 2 / 5, { rtol: 1e-3 });                       // δ = a²/R = 0,945 µm
  close(h.p0, 3 * 10 / (2 * Math.PI * 0.06875 ** 2), { rtol: 1e-3 });      // 1010 MPa
  close(h.p0, 1010, { atol: 1 });
});
test("Hertz: onafhankelijke gesloten vormen en k = dF/dδ = 1,5·F/δ", () => {
  const F = 37, R = 3.5, Es = effModulus(210000, 0.3, 370000, 0.22);
  const h = hertzSphere({ F, R, Es });
  close(h.p0, Math.cbrt(6 * F * Es * Es / (Math.PI ** 3 * R * R)), { rtol: 1e-12 });
  close(h.delta, Math.cbrt(9 * F * F / (16 * R * Es * Es)), { rtol: 1e-12 });
  close(h.kn, 1.5 * F / h.delta, { rtol: 1e-12 });
  const d = 1e-6, f = x => 4 / 3 * Es * Math.sqrt(R) * x ** 1.5;           // F(δ); numerieke afgeleide
  close(h.kn, (f(h.delta + d) - f(h.delta - d)) / (2 * d), { rtol: 1e-6 });
  close(f(h.delta), F, { rtol: 1e-12 });
  close(h.pMean, 2 / 3 * h.p0, { rtol: 1e-12 });
  close(h.zTau, 0.48 * h.a, { rtol: 1e-12 }); close(h.tauMax, 0.31 * h.p0, { rtol: 1e-12 });
});
test("effectieve straal: vlak, bol–bol, bol in holle bol", () => {
  close(effRadius("flat", 5, 99), 5, { rtol: 1e-12 });
  close(effRadius("convex", 5, 10), 50 / 15, { rtol: 1e-12 });            // 3,333 mm
  close(effRadius("concave", 5, 10), 50 / 5, { rtol: 1e-12 });            // 10 mm
  assert.ok(Number.isNaN(effRadius("concave", 10, 5)));
  // bol in holle bol met R2 → ∞ gaat naar bol–vlak
  close(effRadius("concave", 5, 1e9), 5, { rtol: 1e-6 });
});
test("Hertz: V-groef van 90° via contacthoek: F_n = F/(n cos θ) = F/√2", () => {
  const F = 20, n = 2, th = 45 * Math.PI / 180;
  close(F / (n * Math.cos(th)), 20 / Math.SQRT2, { rtol: 1e-12 });
});

// ---------- Kinematische koppeling ----------
test("Maxwell-koppeling: N = F/(6 sin(γ/2)); k_ax = 6 k_n sin²(γ/2); Mindlin k_t = 8 G* a", () => {
  const st = material("staal"), p = { F: 60, R: 6, gamma: 90, mu: 0.15, E1: st.E, nu1: st.nu, E2: st.E, nu2: st.nu };
  const k = kinCoupling(p);
  close(k.N, 60 / (6 * Math.SQRT1_2), { rtol: 1e-12 });                    // 14,142 N
  close(k.N, 14.142, { atol: 1e-3 });
  // verticaal evenwicht: zes contacten, elk N·sin(γ/2) in de voorspanningsrichting = F
  close(6 * k.N * k.s, 60, { rtol: 1e-12 });
  const Gs = 210000 / 2.6 / (2 * (2 - 0.3));                                   // G*: 1/G* = 2(2−ν)/G
  close(k.Gs, Gs, { rtol: 1e-6 });
  close(k.kt, 8 * Gs * k.a, { rtol: 1e-12 });
  close(k.kAx, 6 * k.kn * 0.5, { rtol: 1e-12 });                           // sin²45° = 0,5
  close(k.QGroove, 2 * 0.15 * k.N, { rtol: 1e-12 });
  close(k.xStick, 0.15 * k.N / k.kt, { rtol: 1e-12 });
  close(k.xSlip, 3 * 0.15 * k.N / (16 * Gs * k.a), { rtol: 1e-9 });        // Mindlin volledig slippen
  // a bij N = 14,142 N, R = 6, E* = 115 384,6: a³ = 3·14,142·6/(4·115 384,6) = 5,516e-4
  close(k.a ** 3, 3 * 14.1421 * 6 / (4 * 115384.6), { rtol: 1e-5 });
  // hogere voorspanning: stijfheid ∝ F^(1/3) (bij constante hoek)
  const k8 = kinCoupling(Object.assign({}, p, { F: 480 }));
  close(k8.kAx / k.kAx, 2, { rtol: 1e-9 });
});
test("effectieve schuifmodulus: gelijke materialen G* = G/(2(2−ν))", () => {
  const G = shearModulus(210000, 0.3);
  close(G, 80769.23, { rtol: 1e-6 });
  close(effShear(G, 0.3, G, 0.3), G / (2 * 1.7), { rtol: 1e-12 });
});

// ---------- Massa-veer-demper ----------
test("massa-veer-demper: m = 1 kg, k = 1 N/mm", () => {
  const a = msd({ m: 1, k: 1, dmode: "zeta", dval: 5 });
  close(a.fn, Math.sqrt(1000) / (2 * Math.PI), { rtol: 1e-12 });          // 5,033 Hz
  close(a.cc, 2 * Math.sqrt(1000), { rtol: 1e-12 });                       // 63,25 N·s/m
  close(a.c, 3.1623, { atol: 1e-3 });
  close(a.Q, 10, { rtol: 1e-12 });
  const b = msd({ m: 1, k: 1, dmode: "c", dval: 3.16228 }), c = msd({ m: 1, k: 1, dmode: "Q", dval: 10 });
  close(b.zeta, 0.05, { rtol: 1e-5 }); close(c.zeta, 0.05, { rtol: 1e-12 });
  close(a.fd, a.fn * Math.sqrt(1 - 0.0025), { rtol: 1e-12 });
  // bij resonantie: meegeefbaarheid = 1/(2ζ) = 10, transmissibiliteit √(1+4ζ²)/(2ζ) = 10,05
  close(dynAmp(1, 0.05), 10, { rtol: 1e-12 });
  close(transmissibility(1, 0.05), Math.sqrt(1.01) * 10, { rtol: 1e-12 });
  close(dynAmp(0, 0.05), 1, { rtol: 1e-12 });
  close(dynAmp(10, 0.05), 1 / Math.sqrt(99 ** 2 + 1), { rtol: 1e-12 });
  close(peakAmp(0.05), 1 / (0.1 * Math.sqrt(0.9975)), { rtol: 1e-12 });
});
test("stapresponsie: overshoot, insteltijd 2 % (ζ = 0,05, 1 en 2)", () => {
  const wn = 31.6228, z = 0.05;
  close(overshoot(z), Math.exp(-Math.PI * 0.05 / Math.sqrt(1 - 0.0025)), { rtol: 1e-12 });
  close(overshoot(z), 0.8545, { atol: 1e-4 });
  // eerste piek van de numerieke respons = 1 + overshoot
  const tp = Math.PI / (wn * Math.sqrt(1 - z * z));
  close(step(z, wn, tp), 1 + overshoot(z), { rtol: 1e-12 });
  close(step(z, wn, 0), 0, { atol: 1e-12 });
  // ts ≈ 4/(ζω) = 2,53 s; exact (laatste doorgang van de 2 %-band) ligt hoogstens één periode onder de omhullende 2,475 s
  const ts = settleTime(z, wn), tEnv = Math.log(50 / Math.sqrt(1 - z * z)) / (z * wn);
  assert.ok(ts <= tEnv + 1e-9 && ts > tEnv - 2 * Math.PI / (wn * Math.sqrt(1 - z * z)), `ts = ${ts}`);
  close(ts, 4 / (z * wn), { rtol: 0.1 });
  // net voor ts buiten de band, net erna erbinnen
  assert.ok(Math.abs(step(z, wn, ts - 1e-3) - 1) > 0.02 - 1e-3);
  assert.ok(Math.abs(step(z, wn, ts + 1e-3) - 1) <= 0.02);
  // kritisch gedempt: y = 1 − e^(−x)(1+x) = 0,98 bij x = 5.8339
  close(settleTime(1, 1), 5.8339, { atol: 1e-4 });
  close(step(1, 1, 5.8339), 0.98, { atol: 1e-5 });
  // overgedempt ζ = 2: bisectie geeft y(ts) = 0,98 en blijft monotoon
  const t2 = settleTime(2, 1);
  close(step(2, 1, t2), 0.98, { atol: 1e-9 });
  assert.ok(step(2, 1, t2 * 0.99) < 0.98);
  close(step(2, 1, 1e-9), 0, { atol: 1e-6 });
});

// ---------- Trillingsisolatie ----------
test("isolator: m = 100 kg, k = 20 N/mm, ζ = 5 %, storing 20 Hz", () => {
  const r = isolator({ m: 100, k: 20, zeta: 5, f: 20 });
  close(r.fn, Math.sqrt(200) / (2 * Math.PI), { rtol: 1e-12 });            // 2,2508 Hz
  close(r.dSt, 100 * 9.81 / 20000 * 1000, { rtol: 1e-12 });                // 49,05 mm
  close(r.fn, 0.5 / Math.sqrt(0.04905), { rtol: 0.01 });                   // vuistregel f_n ≈ 0,5/√δ_st[m]
  close(r.r, 20 / r.fn, { rtol: 1e-12 });
  const r2 = (20 / r.fn) ** 2, num = Math.sqrt(1 + (2 * 0.05 * (20 / r.fn)) ** 2), den = Math.sqrt((1 - r2) ** 2 + (2 * 0.05 * 20 / r.fn) ** 2);
  close(r.T, num / den, { rtol: 1e-12 });
  close(r.T, 0.01717, { atol: 2e-5 });
  close(r.dB, 20 * Math.log10(1 / 0.017166), { atol: 0.01 });              // 35,3 dB
  assert.ok(r.isolating);
  // piek: ongeveer √(1+4ζ²)/(2ζ)·… bij r ≈ 1: groter dan T(1) niet; T(r=1) = 10,05, maximum iets rechts daarvan
  close(r.Tmax, 10.05, { rtol: 0.02 });
  assert.ok(!isolator({ m: 100, k: 20, zeta: 5, f: 2 }).isolating);
  // ongedempt: T = 1/(r²−1) = 0,1 → r = √11
  close(fnForT(33.1662, 0.1), 33.1662 / Math.sqrt(11), { rtol: 1e-12 });
  close(transmissibility(Math.sqrt(11), 0), 0.1, { rtol: 1e-12 });
  // overgang: bij r = √2 is T = 1 voor elke demping
  close(transmissibility(Math.SQRT2, 0.3), 1, { rtol: 1e-12 });
});

// ---------- Servo-vuistregels ----------
test("servo-vuistregel: f_n = 300 Hz, f_n/f_bw = 3, m = 2 kg, F_d = 1 N", () => {
  const s = servo({ fn: 300, div: 3, m: 2, Fd: 1, xMax: 0.001 });
  close(s.fbw, 100, { rtol: 1e-12 });
  close(s.kServo, 2 * (2 * Math.PI * 100) ** 2 / 1000, { rtol: 1e-12 });  // 789,6 N/mm
  close(s.kServo, 789.57, { atol: 0.01 });
  close(s.x, 1 / 789.57, { rtol: 1e-4 });                                  // 1,2665 µm
  close(s.kReq, 1000, { rtol: 1e-12 });                                    // 1 N / 1 µm = 1 N/µm
  close(s.fbwReq, Math.sqrt(1e6 / 2) / (2 * Math.PI), { rtol: 1e-12 });    // 112,5 Hz
  close(s.fnReq, 3 * s.fbwReq, { rtol: 1e-12 });
  close(s.tRise, 0.0035, { rtol: 1e-12 });
});

// ---------- Thermisch ----------
test("uitzetting: aluminium 100 mm, 5 K; athermale lengteverhouding", () => {
  const al = material("alu"), st = material("staal");
  close(dLength(al.alpha, 100, 5), 0.0118, { rtol: 1e-12 });               // 11,8 µm
  const a = athermal({ a1: al.alpha, L1: 100, a2: st.alpha, L2: 100, dT: 5, E1: al.E, E2: st.E });
  close(a.d1, 0.0118, { rtol: 1e-12 }); close(a.d2, 0.00575, { rtol: 1e-12 });
  close(a.dP, 0.00575 - 0.0118, { rtol: 1e-12 });
  close(a.L2ath, 100 * 23.6 / 11.5, { rtol: 1e-12 });                      // 205,2 mm
  // met L2 = L2ath verdwijnt de netto drift: α₁L₁ = α₂L₂
  const b = athermal({ a1: al.alpha, L1: 100, a2: st.alpha, L2: a.L2ath, dT: 5, E1: al.E, E2: st.E });
  close(b.dP, 0, { atol: 1e-15 });
  close(b.Lnet, a.L2ath - 100, { rtol: 1e-12 });
  close(a.s1, 70000 * 23.6e-6 * 5, { rtol: 1e-12 });                       // 8,26 MPa ingeklemd
  // Invar als referentie
  const iv = material("invar");
  close(dLength(iv.alpha, 100, 5), 1.2e-6 * 100 * 5, { rtol: 1e-12 });
});
test("thermische tijdconstante: aluminium blok 100×50×20 mm, h = 10 W/(m²K)", () => {
  const al = material("alu");
  const l = lumped({ L: 100, B: 50, H: 20, rho: al.rho, c: al.c, h: 10, k: al.k, P: 0.5 });
  close(l.V, 1e-4, { rtol: 1e-12 });
  close(l.A, 0.016, { rtol: 1e-12 });
  close(l.m, 0.27, { rtol: 1e-12 });
  close(l.C, 0.27 * 896, { rtol: 1e-12 });                                 // 241,9 J/K
  close(l.tau, 241.92 / (10 * 0.016), { rtol: 1e-9 });                     // 1512 s = 25,2 min
  close(l.Bi, 10 * (1e-4 / 0.016) / 167, { rtol: 1e-12 });                 // 3,7e-4: lumped is geldig
  close(l.dTss, 0.5 / 0.16, { rtol: 1e-12 });                              // 3,125 K
  // 63 % bij t = τ
  close(1 - Math.exp(-1), 0.6321, { atol: 1e-4 });
});
test("materialen: nieuwe velden c, k, sy aanwezig en plausibel; bestaande id's ongewijzigd", () => {
  for (const m of MATERIALS) assert.ok(m.c > 100 && m.c < 1500 && m.k > 1 && m.k < 400 && m.sy > 0, m.id);
  for (const id of ["staal", "rvs", "alu", "titaan", "cube", "fbrons", "invar"]) assert.equal(material(id).id, id);
  for (const id of ["alumina", "wc", "zerodur"]) assert.equal(material(id).id, id);
});

test("settleInfo: ζ < 1 geeft 4/(ζω_n), ζ ≥ 1 numeriek uit de stapresponsie", () => {
  const a = settleInfo(0.1, 2 * Math.PI);
  assert.equal(a.method, "approx");
  close(a.t, 4 / (0.1 * 2 * Math.PI), { rtol: 1e-12 });
  for (const z of [1, 2, 10]) {
    const b = settleInfo(z, 3);
    assert.equal(b.method, "numeric");
    close(step(z, 3, b.t), 0.98, { atol: 1e-8 });
    assert.ok(step(z, 3, b.t * 0.99) < 0.98);
  }
  // ζ = 2: 4/(ζω) zou 0,67/ω geven, exact is 4,9/ω: de formule is hier niet bruikbaar
  assert.ok(settleInfo(2, 1).t > 2 * 4 / (2 * 1));
});

test("Mindlin volledig slippen: 3μN/(16G*a) = 3(2−ν)μN/(8Ga) voor identieke lichamen", () => {
  const nu = 0.3, G = 80000, mu = 0.2, N = 10, a = 0.05, Gs = G / (2 * (2 - nu));
  close(3 * mu * N / (16 * Gs * a), 3 * (2 - nu) * mu * N / (8 * G * a), { rtol: 1e-12 });
});

test("uitzetting: drift per kelvin is onafhankelijk van ΔT, ook bij ΔT = 0", () => {
  const al = material("alu"), st = material("staal");
  const per = dT => athermal({ a1: al.alpha, L1: 100, a2: st.alpha, L2: 205, dT, E1: al.E, E2: st.E });
  const k = (st.alpha * 205 - al.alpha * 100);                                   // µm/K · (mm·1e-3)... in nm/K
  close(per(0).dP, 0, { atol: 1e-15 });
  close(per(5).dP / 5, per(1).dP, { rtol: 1e-9 });
  close(per(1).dP * 1e6, k, { rtol: 1e-9 });
});
