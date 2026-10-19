// Meetkanalen (grootheden per knoop en element) (zonder DOM).
import { axialA, axialK, isAxial, isBeam } from "./axial.js";
import { E, N } from "./elements.js";
import { flexK, flexStress } from "./flexure.js";
import { sensorChannels, sensorVal } from "./sensors.js";
import { model, sim } from "./state.js";

/* ---- measurable channels ---- */
const QLAB = { x: "x", y: "y", vx: "vₓ", vy: "v_y", v: "|v|", ax: "aₓ", ay: "a_y", a: "|a|" };
const QU = { x: "mm", y: "mm", vx: "mm/s", vy: "mm/s", v: "mm/s", ax: "mm/s²", ay: "mm/s²", a: "mm/s²" };

// Elk kanaal hoort bij één onderdeel (o, obj) en heeft een korte naam (q),
// zodat de keuzelijst per onderdeel één regel met knopjes kan tonen.
export function channels() {
  const out = [];
  const pair = e => (N(e.a) ? N(e.a).name : "?") + (N(e.b) ? N(e.b).name : "?");
  for (const n of model.nodes) {
    const o = (n.support === "pin" ? "Scharnier " : n.support === "slider" ? "Glijder " : "Punt ") + n.name;
    // een scharnier beweegt niet: zijn x, v en a blijven bruikbaar in formules, maar niet in de lijst
    for (const k in QLAB) out.push({ key: "n|" + n.id + "|" + k, lab: n.name + " · " + QLAB[k], q: QLAB[k],
                                     u: QU[k], al: n.name + "." + k, g: "Punten", o, obj: n.id, hide: n.support === "pin",
                                     frf: k !== "v" && k !== "a" });
    if (n.support === "pin") [["Rx", "Rₓ"], ["Ry", "R_y"], ["R", "|R|"]].forEach(([k, q]) =>
      out.push({ key: "r|" + n.id + "|" + k, lab: "reactie " + n.name + " · " + q, q, u: "N",
                 al: k + "_" + n.name, g: "Punten", o, obj: n.id }));
    if (n.support === "slider")
      out.push({ key: "r|" + n.id + "|Rn", lab: "reactie " + n.name + " · Rₙ", q: "Rₙ", u: "N",
                 al: "Rn_" + n.name, g: "Punten", o, obj: n.id });
  }
  for (const e of model.elems) {
    if (isAxial(e)) {           // axiale staaf: kracht N, rek ΔL en spanning σ (in alle modi; Kinematisch: stijf, kracht uit de statica)
      const o = "Axiale stang " + pair(e), p = pair(e);
      out.push({ key: "s|" + e.id + "|F", lab: "axiale stang " + p + " · N", q: "N", u: "N", al: "N_" + p, g: "Stangen", o, obj: e.id, frf: true });
      out.push({ key: "w|" + e.id + "|dL", lab: "axiale stang " + p + " · ΔL", q: "ΔL", u: "µm", al: "dL_" + p, g: "Stangen", o, obj: e.id, frf: true });
      out.push({ key: "w|" + e.id + "|sig", lab: "axiale stang " + p + " · σ", q: "σ", u: "MPa", al: "sigA_" + p, g: "Stangen", o, obj: e.id, frf: true });
    } else if (e.type === "link") {
      const o = (e.driver ? "Kruk " : "Stang ") + pair(e);
      out.push({ key: "l|" + e.id + "|N", lab: (e.driver ? "kruk " : "stang ") + pair(e) + " · N", q: "N", u: "N",
                 al: "N_" + pair(e), g: "Stangen", o, obj: e.id });
      if (e.driver) out.push({ key: "t|" + e.id + "|T", lab: "krukmoment " + pair(e) + " · T", q: "T", u: "N·m",
                               al: "T_" + pair(e), g: "Stangen", o, obj: e.id });
    }
    if (e.type === "actuator") {
      const o = "Actuator " + pair(e);
      out.push({ key: "l|" + e.id + "|N", lab: "actuator " + pair(e) + " · F", q: "F", u: "N",
                 al: "F_" + pair(e), g: "Stangen", o, obj: e.id });
      out.push({ key: "a|" + e.id + "|L", lab: "actuator " + pair(e) + " · L", q: "L", u: "mm",
                 al: "L_" + pair(e), g: "Stangen", o, obj: e.id, frf: true });
    }
    if (e.type === "flexure") {
      const o = "Flexure " + pair(e), p = pair(e);
      out.push({ key: "f|" + e.id + "|phi", lab: "flexure " + p + " \u00b7 \u03c6", q: "\u03c6", u: "\u00b0", al: "phi_" + p, g: "Krachtelementen", o, obj: e.id, frf: true });
      out.push({ key: "f|" + e.id + "|sig", lab: "flexure " + p + " \u00b7 \u03c3", q: "\u03c3", u: "MPa", al: "sig_" + p, g: "Krachtelementen", o, obj: e.id, frf: true });
      out.push({ key: "f|" + e.id + "|M", lab: "flexure " + p + " \u00b7 M", q: "M", u: "N\u00b7m", al: "Mf_" + p, g: "Krachtelementen", o, obj: e.id, frf: true });
    }
    if (e.type === "gap") {
      const o = "Speling " + pair(e);
      out.push({ key: "s|" + e.id + "|F", lab: "speling " + pair(e) + " · F", q: "F", u: "N",
                 al: "Fs_" + pair(e), g: "Krachtelementen", o, obj: e.id, frf: true });
      out.push({ key: "a|" + e.id + "|L", lab: "speling " + pair(e) + " · L", q: "L", u: "mm",
                 al: "Ls_" + pair(e), g: "Krachtelementen", o, obj: e.id, frf: true });
    }
    if (e.type === "contact" && N(e.node)) {
      const nm = N(e.node).name, o = "Contact " + nm;
      out.push({ key: "s|" + e.id + "|F", lab: "contact " + nm + " · Fₙ", q: "Fₙ", u: "N", al: "Fn_" + nm, g: "Krachtelementen", o, obj: e.id });
      out.push({ key: "c|" + e.id + "|Ft", lab: "contact " + nm + " · Fₜ", q: "Fₜ", u: "N", al: "Ft_" + nm, g: "Krachtelementen", o, obj: e.id });
      out.push({ key: "c|" + e.id + "|d", lab: "contact " + nm + " · δ", q: "δ", u: "µm", al: "dc_" + nm, g: "Krachtelementen", o, obj: e.id });
      out.push({ key: "c|" + e.id + "|z", lab: "contact " + nm + " · borstel z", q: "z", u: "µm", al: "zc_" + nm, g: "Krachtelementen", o, obj: e.id });
    }
    if (e.type === "spring") out.push({ key: "s|" + e.id + "|F", lab: "veer " + pair(e) + " · F", q: "F", u: "N",
                                        al: "F_" + pair(e), g: "Krachtelementen", o: "Veer " + pair(e), obj: e.id, frf: true });
    if (e.type === "damper") out.push({ key: "s|" + e.id + "|F", lab: "demper " + pair(e) + " · F", q: "F", u: "N",
                                        al: "Fd_" + pair(e), g: "Krachtelementen", o: "Demper " + pair(e), obj: e.id, frf: true });
  }
  if (model.mode === "stiff") for (const n of model.nodes) {          // statische verplaatsingen van de punten (modus Stijfheid)
    const o = "Punt " + n.name;
    [["ux", "u\u2093", "\u00b5m", "ux"], ["uy", "u_y", "\u00b5m", "uy"], ["u", "|u|", "\u00b5m", "u"], ["th", "\u03c6", "\u00b5rad", "phi"]].forEach(([k, q, u, al]) =>
      out.push({ key: "u|" + n.id + "|" + k, lab: n.name + " \u00b7 " + q + " (statisch)", q, u, al: al + "_" + n.name, g: "Verplaatsingen", o, obj: n.id, stiff: true }));
  }
  if (model.mode === "stiff") for (const e of model.elems) {          // grootste waarden per balk of staaf (modus Stijfheid)
    if (!isBeam(e) && !isAxial(e)) continue;
    const p = pair(e), o = (isBeam(e) ? "Balk " : "Axiale staaf ") + p;
    out.push({ key: "k|" + e.id + "|sig", lab: o.toLowerCase() + " \u00b7 \u03c3max", q: "\u03c3max", u: "MPa", al: "smax_" + p, g: "Verplaatsingen", o, obj: e.id, stiff: true });
    out.push({ key: "k|" + e.id + "|N", lab: o.toLowerCase() + " \u00b7 N", q: "N", u: "N", al: "Nbar_" + p, g: "Verplaatsingen", o, obj: e.id, stiff: true });
    if (isBeam(e)) out.push({ key: "k|" + e.id + "|M", lab: o.toLowerCase() + " \u00b7 Mmax", q: "Mmax", u: "N\u00b7m", al: "Mmax_" + p, g: "Verplaatsingen", o, obj: e.id, stiff: true });
  }
  if (model.mode === "dyn") out.push({ key: "e||E", lab: "totale energie E", q: "E", u: "J", al: "E",
                                       g: "Systeem", o: "Systeem", obj: "" });
  return sensorChannels().concat(out);        // sensoren staan bovenaan de keuzelijst
}

export function chVal(S, key, i) {
  const [t, id, k] = key.split("|");
  if (t === "u") {            // statische verplaatsing uit de modus Stijfheid, in µm of µrad
    const d = sim.stiff && sim.stiff.ok ? sim.stiff.nodes.get(id) : null;
    return d ? (k === "ux" ? d.ux * 1000 : k === "uy" ? d.uy * 1000 : k === "u" ? Math.hypot(d.ux, d.uy) * 1000 : d.th * 1e6) : NaN;
  }
  if (t === "k") {            // grootste kracht-, moment- of spanningswaarde van een balk of staaf (modus Stijfheid)
    const r = sim.stiff && sim.stiff.ok ? sim.stiff.members.find(m => m.e && m.e.id === id && (m.kind === "beam" || m.kind === "axial")) : null;
    if (!r) return NaN;
    return k === "sig" ? r.sigMax : k === "N" ? r.NN : r.kind === "beam" ? r.Mmax / 1000 : NaN;
  }
  if (t === "n") {
    if (!S.pos[id]) return NaN;
    const p = S.pos[id][i], v = S.vel[id][i], a = S.acc[id][i];
    return { x: p.x, y: p.y, vx: v.x, vy: v.y, v: Math.hypot(v.x, v.y),
             ax: a.x, ay: a.y, a: Math.hypot(a.x, a.y) }[k];
  }
  if (t === "l") return S.N[id] ? S.N[id][i] : NaN;
  if (t === "s") return S.EF[id] ? S.EF[id][i] : NaN;
  if (t === "m") { const e = E(id); return e ? sensorVal(S, e, k, i) : NaN; }
  if (t === "w") {            // axiale staaf: ΔL = N/k in µm, σ = N/A in MPa
    const e = E(id), F = S.EF && S.EF[id] ? S.EF[id][i] : NaN;
    if (!e || !isAxial(e)) return NaN;
    return k === "dL" ? F / axialK(e) * 1000 : F / axialA(e);
  }
  if (t === "c") {
    const c = S.C && S.C[id] ? S.C[id][i] : null;
    return c ? c[k] : NaN;
  }
  if (t === "f") {
    const e = E(id), a = S.FX && S.FX[id] ? S.FX[id][i] : NaN;
    if (!e || !isFinite(a)) return NaN;
    return k === "phi" ? a * 180 / Math.PI : k === "sig" ? flexStress(e, a).sigma : -flexK(e) * a * 1e-3;
  }
  if (t === "r") {
    const R = S.R[id] ? S.R[id][i] : null;
    if (!R) return NaN;
    return k === "Rx" ? R.x : k === "Ry" ? R.y : k === "Rn" ? R.n : Math.hypot(R.x, R.y);
  }
  if (t === "t") return S.T[id] ? S.T[id][i] : NaN;
  if (t === "e") return S.E ? S.E[i] : NaN;
  if (t === "a") {
    const e = E(id); if (!e || !S.pos[e.a] || !S.pos[e.b]) return NaN;
    const P = S.pos[e.a][i], Q = S.pos[e.b][i];
    return P && Q ? Math.hypot(Q.x - P.x, Q.y - P.y) : NaN;
  }
  return NaN;
}
export function chU(key) { const c = sim.CHM.get(key); return c ? c.u : ""; }
export function chLab(key) { const c = sim.CHM.get(key); return c ? c.lab : "?"; }
const chUnit = chU;
