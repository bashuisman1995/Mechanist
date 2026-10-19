import test from "node:test";
import assert from "node:assert/strict";
import { thermalCentre } from "../../src/calc/thermal.js";
import { kelvinCoupling, effModulus, hertzSphere, kinCoupling } from "../../src/calc/contact.js";
import { material } from "../../src/calc/materials.js";
import { close } from "./helpers.mjs";

const DEG = Math.PI / 180;
// drie steunen op een cirkel met straal r; vrije richting = hoek van de steun zelf (radiale sleuven)
const radial = (r, phis, ths) => phis.map((f, i) => ({ x: r * Math.cos(f * DEG), y: r * Math.sin(f * DEG), th: ths ? ths[i] : f }));

test("thermisch centrum: drie radiale sleuven onder 120° geven het midden, zonder draaiing", () => {
  const c = thermalCentre(radial(50, [90, 210, 330]));
  assert.ok(!c.singular && c.concurrent);
  close(c.c.x, 0, { atol: 1e-9 }); close(c.c.y, 0, { atol: 1e-9 });
  close(c.theta, 0, { atol: 1e-12 });
  // een steunpunt schuift radiaal over δ·r (de sleuf neemt de uitzetting op); zijwaarts niets
  c.slide.forEach(s => close(s, 50, { rtol: 1e-9 }));
  c.side.forEach(s => close(s, 0, { atol: 1e-9 }));
});
test("thermisch centrum: een probe op afstand r van het centrum drijft Δα·r·ΔT", () => {
  const c = thermalCentre(radial(50, [90, 210, 330]));
  const dalpha = (23.6 - 11.5) * 1e-6, dT = 5, delta = dalpha * dT, probe = { x: 60, y: 0 };
  const d = c.disp(probe);
  close(Math.hypot(d.x, d.y) * delta * 1000, dalpha * 60 * dT * 1000, { rtol: 1e-9 });     // µm
  close(Math.hypot(d.x, d.y) * delta * 1000, 3.63, { atol: 0.01 });                         // 12,1e-6·60·5 = 3,63 µm
});
test("thermisch centrum: andere hoeken en een verschoven patroon, het centrum volgt de snijding van de vrije lijnen", () => {
  // drie vrije lijnen door het punt (10, -5): steunen op willekeurige plekken, richting naar dat punt
  const P = { x: 10, y: -5 }, pts = [[60, 20], [-30, 40], [-20, -50]];
  const sup = pts.map(q => ({ x: q[0], y: q[1], th: Math.atan2(q[1] - P.y, q[0] - P.x) / DEG }));
  const c = thermalCentre(sup);
  assert.ok(c.concurrent && !c.singular);
  close(c.c.x, 10, { atol: 1e-9 }); close(c.c.y, -5, { atol: 1e-9 });
  close(c.theta, 0, { atol: 1e-12 });
  const d = c.disp(P); close(Math.hypot(d.x, d.y), 0, { atol: 1e-9 });
});
test("thermisch centrum: lijnen die niet in één punt snijden: plaat draait, nulverplaatsing in c, steunen houden zijwaarts vast", () => {
  const c = thermalCentre(radial(50, [90, 210, 330], [90, 30, 160]));        // laatste steun 10° uit de straal
  assert.ok(!c.singular && !c.concurrent && c.resid > 0.1);
  assert.ok(Math.abs(c.theta) > 1e-4);
  c.side.forEach(s => close(s, 0, { atol: 1e-9 }));
  const d0 = c.disp(c.c); close(Math.hypot(d0.x, d0.y), 0, { atol: 1e-9 });
});
test("thermisch centrum: singulier bij evenwijdige of samenvallende stijve lijnen", () => {
  assert.ok(thermalCentre([{ x: 0, y: 0, th: 0 }, { x: 50, y: 10, th: 0 }, { x: -30, y: 40, th: 0 }]).singular);       // alle sleuven evenwijdig
  // drie stijve lijnen (loodrecht op de sleuven) door één punt (0, 0): sleuven loodrecht op de straal = tangentieel
  assert.ok(thermalCentre(radial(50, [90, 210, 330], [0, 120, 240])).singular);
});

test("Kelvin-koppeling: handberekening F = 60 N, γ = 90°, γk = 90°, R = 6 mm staal", () => {
  const st = material("staal"), p = { F: 60, R: 6, gamma: 90, gammaC: 90, mu: 0.15, E1: st.E, nu1: st.nu, E2: st.E, nu2: st.nu };
  const k = kelvinCoupling(p), s = Math.SQRT1_2;
  const [cone, groove, flat] = k.contacts;
  close(flat.N, 20, { rtol: 1e-12 });
  close(groove.N, 60 / (6 * s), { rtol: 1e-12 });                  // 14,142 N per flank
  close(cone.N, 60 / (9 * s), { rtol: 1e-12 });                    //  9,428 N per tetraëderflank
  // evenwicht met expliciete 3D-richtingen: som van krachten = (0, 0, F), momenten om het zwaartepunt = 0
  const r = 100, bal = [90, 210, 330].map(f => ({ x: r * Math.cos(f * DEG), y: r * Math.sin(f * DEG) }));
  const F = [0, 0, 0], M = [0, 0, 0], add = (pos, n, N) => {
    const f = [n[0] * N, n[1] * N, n[2] * N];
    for (let i = 0; i < 3; i++) F[i] += f[i];
    M[0] += pos.y * f[2]; M[1] += -pos.x * f[2]; M[2] += pos.x * f[1] - pos.y * f[0];       // z-component van de arm = 0
  };
  [0, 120, 240].forEach(a => add(bal[0], [-s * Math.cos(a * DEG), -s * Math.sin(a * DEG), s], cone.N));       // horizontale component wijst naar de as van de tetraëder
  const ax = { x: bal[1].x - bal[0].x, y: bal[1].y - bal[0].y }, la = Math.hypot(ax.x, ax.y), px = -ax.y / la, py = ax.x / la;     // dwars op de groefas B→A
  [1, -1].forEach(sg => add(bal[1], [sg * s * px, sg * s * py, s], groove.N));
  add(bal[2], [0, 0, 1], flat.N);
  close(F[0], 0, { atol: 1e-9 }); close(F[1], 0, { atol: 1e-9 }); close(F[2], 60, { rtol: 1e-12 });
  close(M[0], 0, { atol: 1e-9 }); close(M[1], 0, { atol: 1e-9 }); close(M[2], 0, { atol: 1e-9 });
  // Hertz per contact, onafhankelijk: E* = 115 384,6 MPa; a = (3·N·R/(4E*))^(1/3)
  const Es = effModulus(210000, 0.3, 210000, 0.3);
  [cone, groove, flat].forEach(c => {
    const a = Math.cbrt(3 * c.N * 6 / (4 * Es));
    close(c.a, a, { rtol: 1e-12 }); close(c.p0, 3 * c.N / (2 * Math.PI * a * a), { rtol: 1e-12 });
  });
  close(flat.a, 0.09205, { atol: 2e-5 }); close(flat.p0, 1127, { atol: 3 });          // handberekening: a = 0,0920 mm, p₀ ≈ 1127 MPa
  // het vlak draagt het meest (F/3 > 0,236·F > 0,157·F) en bepaalt
  assert.equal(k.gov.id, "flat"); close(k.p0, flat.p0, { rtol: 1e-12 });
  close(k.kAx, 3 * cone.kn * 0.5 + 2 * groove.kn * 0.5 + flat.kn, { rtol: 1e-12 });
  // een smallere groef (γ = 40°) verhoogt de flankkracht boven die van het vlak: de groef bepaalt
  const k2 = kelvinCoupling(Object.assign({}, p, { gamma: 40 }));
  assert.equal(k2.gov.id, "groove");
  // Maxwell blijft: zes gelijke contacten van 14,14 N
  close(kinCoupling(p).N, 14.142, { atol: 1e-3 });
});
