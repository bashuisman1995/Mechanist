// Meetkanalen (grootheden per knoop en element) (zonder DOM).
import { E, N } from "./elements.js";
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
    if (e.type === "link") {
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
  if (model.mode === "dyn") out.push({ key: "e||E", lab: "totale energie E", q: "E", u: "J", al: "E",
                                       g: "Systeem", o: "Systeem", obj: "" });
  return out;
}

export function chVal(S, key, i) {
  const [t, id, k] = key.split("|");
  if (t === "n") {
    if (!S.pos[id]) return NaN;
    const p = S.pos[id][i], v = S.vel[id][i], a = S.acc[id][i];
    return { x: p.x, y: p.y, vx: v.x, vy: v.y, v: Math.hypot(v.x, v.y),
             ax: a.x, ay: a.y, a: Math.hypot(a.x, a.y) }[k];
  }
  if (t === "l") return S.N[id] ? S.N[id][i] : NaN;
  if (t === "s") return S.EF[id] ? S.EF[id][i] : NaN;
  if (t === "c") {
    const c = S.C && S.C[id] ? S.C[id][i] : null;
    return c ? c[k] : NaN;
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
