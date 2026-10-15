// Rekenblad van de schets: tekening, model (punten, elementen, materialen), belastingen, uitkomsten van de
// huidige modus en de formules, aannamen en bronnen uit "Hoe rekent dit?". Alles uit de actuele toestand.
import { MATERIAL_SOURCE, material } from "../calc/materials.js";
import { axialA, beamSect, dTOf, isAxial, isBeam, matOf } from "../core/axial.js";
import { chLab, chU } from "../core/channels.js";
import { mat as contactMat } from "../core/contact.js";
import { N } from "../core/elements.js";
import { FLEX_KINDS, flexMat } from "../core/flexure.js";
import { jointFor } from "../core/stiffness.js";
import { model, sim, ui } from "../core/state.js";
import { draw } from "./draw.js";
import { MODE_NAMES } from "./examples.js";
import { fmtHz, fmtLen, fmtStress, fmtTime, sg } from "./format.js";
import { howHtml } from "./how.js";
import { buildPdata, drawPlot, plotCv, serieLab } from "./plot.js";
import { esc, showReport } from "./report.js";
import { stiffKeyHtml, tablesHtml } from "./stiff.js";
import { cv } from "./view.js";

const nm = id => { const n = N(id); return n ? n.name : "?"; };
const ve = (v, u, d) => sg(v, d || 4) + (u ? " " + u : "");           // waarde met eenheid (4 cijfers: invoer wordt niet afgerond tot 3)
const pair = id => nm(id.a) + nm(id.b);
function tbl(head, rows, cls) {
  return '<table class="rep-tbl ' + (cls || "") + '"><thead><tr>' + head.map(h => "<th>" + h + "</th>").join("") + "</tr></thead><tbody>" +
    rows.map(r => "<tr>" + r.map(c => "<td>" + c + "</td>").join("") + "</tr>").join("") + "</tbody></table>";
}

/* ---------- momentopnamen van de canvassen, altijd in het lichte thema ---------- */
function snapshot(canvas, redraw) {
  const root = document.documentElement, prev = root.getAttribute("data-theme"), sel = ui.sel, hov = ui.hover, pend = ui.pending;
  let url = "";
  try {
    root.setAttribute("data-theme", "light"); ui.colorsDirty = true;
    ui.sel = null; ui.hover = null; ui.pending = null;
    redraw();
    url = canvas.toDataURL("image/png");
  } catch (err) { console.error(err); }
  finally {
    if (prev === null) root.removeAttribute("data-theme"); else root.setAttribute("data-theme", prev);
    ui.sel = sel; ui.hover = hov; ui.pending = pend; ui.colorsDirty = true;
    redraw();
  }
  return url;
}
function figure(url, cap, alt) {
  return url ? '<figure class="rep-fig"><img src="' + url + '" alt="' + esc(alt) + '"><figcaption>' + esc(cap) + "</figcaption></figure>" : "";
}

/* ---------- model ---------- */
const SUPPORT = { free: "vrij", pin: "scharnier", slider: "glijder" };
function nodeRows() {
  const stiff = model.mode === "stiff";
  const head = ["Punt", "x (mm)", "y (mm)", "Oplegging", "Massa (kg)", stiff ? "Verbinding" : "Overig"];
  const rows = model.nodes.map(n => {
    const o = [];
    if (n.support === "slider") o.push("richting " + sg(n.dir || 0) + "°");
    if (n.support !== "free" && n.clamp) o.push("ingeklemd");
    if (n.mus > 0 || n.muk > 0) o.push("μ<sub>s</sub> " + sg(n.mus || 0) + ", μ<sub>k</sub> " + sg(n.muk || 0) + (n.rj > 0 ? ", penstraal " + ve(n.rj, "mm") : ""));
    if (n.trace) o.push("spoor");
    let j = "";
    if (stiff) {
      const jf = jointFor(n);
      j = jf.type === "star" ? "star" : jf.type === "pin" ? "scharnier" : "torsieveer k<sub>θ</sub> " + ve(jf.k, "N·mm/rad") + (jf.auto ? " (auto)" : "");
      if (jf.auto && jf.type !== "spring") j += " (auto)";
    }
    return [esc(n.name), sg(n.x, 5), sg(n.y, 5), esc(SUPPORT[n.support] || n.support) + (n.support === "slider" ? ", " + sg(n.dir || 0) + "°" : "") + (n.support !== "free" && n.clamp ? ", ingeklemd" : ""),
      n.m > 0 ? sg(n.m) : "–", stiff ? j : o.filter(x => !/^richting|^ingeklemd/.test(x)).join("; ") || "–"];
  });
  return tbl(head, rows);
}

function linkParams(e) {
  const p = [];
  p.push("L = " + ve(e.len, "mm"));
  if (e.driver) {
    p.push("kruk: θ<sub>0</sub> = " + ve(e.theta0 || 0, "°"), "toerental " + ve(e.rpm || 0, "rpm") + ", " + (e.cw ? "rechtsom" : "linksom"));
    return p;
  }
  if (isBeam(e)) {
    const s = beamSect(e), pr = s.prof;
    p.push("balk Volledig (EA + EI), profiel " + ({ rect: "rechthoek", round: "rond", tube: "buis", custom: "eigen A en I" }[pr] || pr));
    if (pr === "round") p.push("Ø " + ve(e.pd > 0 ? e.pd : 4, "mm"));
    else if (pr === "tube") p.push("D × d = " + sg(e.pD > 0 ? e.pD : 10, 4) + " × " + sg(e.pdi >= 0 ? e.pdi : 8, 4) + " mm");
    else if (pr === "custom") p.push("A = " + ve(s.A, "mm²") + ", I = " + ve(s.I, "mm⁴"));
    else p.push("b × h = " + sg(e.pb > 0 ? e.pb : 10, 4) + " × " + sg(e.ph > 0 ? e.ph : 2, 4) + " mm");
    p.push("A = " + ve(s.A, "mm²") + ", I = " + ve(s.I, "mm⁴") + " (afgeleid)");
  } else if (isAxial(e)) {
    p.push("axiale staaf (EA/L), A = " + ve(axialA(e), "mm²"));
  } else p.push("stijve staaf");
  if (isBeam(e) || isAxial(e) || typeof e.dT === "number") p.push("materiaal " + esc(matOf(e).naam));
  if (e.sig > 0) p.push("σ<sub>toel</sub> = " + ve(e.sig, "MPa") + " (eigen)");
  if (typeof e.dT === "number") p.push("ΔT = " + ve(e.dT, "K") + " (eigen)");
  return p;
}
function elemRow(e) {
  const a = N(e.a), b = N(e.b), ln = a && b ? esc(pair(e)) : e.node ? esc(nm(e.node)) : "";
  let type = e.type, p = [];
  switch (e.type) {
    case "link": type = e.driver ? "Kruk" : isBeam(e) ? "Balk" : isAxial(e) ? "Axiale staaf" : "Stang"; p = linkParams(e); break;
    case "spring": type = "Veer"; p = ["k = " + ve(e.k, "N/mm"), "rustlengte L<sub>0</sub> = " + ve(e.L0, "mm")]; break;
    case "damper": type = "Demper"; p = ["c = " + ve(e.c, "N·s/mm")]; break;
    case "actuator": type = "Actuator"; p = ["lengte " + ve(e.len, "mm") + " (getekend)", "bereik " + sg(Math.min(e.min, e.max), 4) + "–" + sg(Math.max(e.min, e.max), 4) + " mm", "f = " + ve(e.freq || 0, "Hz")]; break;
    case "gap": type = "Speling"; p = ["vrij tussen " + sg(Math.min(e.min, e.max), 4) + " en " + sg(Math.max(e.min, e.max), 4) + " mm", "aanslag k = " + ve(e.kc, "N/mm") + ", c = " + ve(e.cc, "N·s/mm")]; break;
    case "force": type = "Kracht"; p = ["F = " + ve(e.mag, "N") + " onder " + ve(e.ang, "°") + " vanaf +x"]; break;
    case "contact": {
      type = "Contact"; const m1 = contactMat(e.m1), m2 = contactMat(e.m2);
      p = ["bal R = " + ve(e.R, "mm") + " (" + esc(m1.nm) + ", E = " + ve(m1.E / 1000, "GPa", 3) + ", ν = " + sg(m1.nu) + ")", "vlak " + esc(m2.nm) + " (E = " + ve(m2.E / 1000, "GPa", 3) + ", ν = " + sg(m2.nu) + "), hoek " + ve(e.ang || 0, "°"),
        "μ = " + sg(e.mu) + ", χ = " + sg(e.chi)];
      break;
    }
    case "flexure": {
      type = "Flexure"; const m = flexMat(e);
      p = [esc(FLEX_KINDS[e.kind] || e.kind), "L = " + ve(e.L, "mm") + ", breedte " + ve(e.wd, "mm") + ", dikte t = " + ve(e.t, "mm") + (e.kind !== "cantilever" ? ", R = " + ve(e.R, "mm") + (e.kind === "notch" ? ", K<sub>t</sub> = " + sg(e.Kt) : "") : ""),
        "materiaal " + esc(m.naam) + ", σ<sub>toel</sub> = " + ve(m.sigma, "MPa") + (e.pre ? ", voorspanning " + ve(e.pre, "°") : "")];
      break;
    }
    case "loadcell": type = "Krachtopnemer"; p = [esc(e.name || ""), "k<sub>s</sub> = " + ve(e.ks, "N/µm"), "massa " + ve(e.m || 0, "kg")]; break;
    case "dsens": type = "Verplaatsingssensor"; p = [esc(e.name || ""), "richting " + ve(e.ang || 0, "°"), "bereik ±" + ve(e.range, "µm") + ", resolutie " + ve(e.res, "µm")]; break;
    case "encoder": type = "Hoekencoder"; p = [esc(e.name || ""), sg(e.cpr) + " counts per omwenteling"]; break;
    case "accel": type = "Versnellingsopnemer"; p = [esc(e.name || ""), "richting " + ve(e.ang || 0, "°"), "massa " + ve(e.m >= 0 ? e.m : 0.01, "kg")]; break;
  }
  return [esc(type), ln, p.join("<br>")];
}
function elemTable() {
  if (!model.elems.length) return '<p class="rep-note">Geen elementen.</p>';
  return tbl(["Element", "Tussen", "Parameters"], model.elems.map(elemRow), "rep-elem");
}

function materialTable() {
  const used = [], seen = {};
  const add = id => { id = id || "staal"; if (!seen[id]) { seen[id] = 1; used.push(material(id)); } };
  model.elems.forEach(e => {
    if (e.type === "link" && (isBeam(e) || isAxial(e) || typeof e.dT === "number")) add(e.mat);
    if (e.type === "flexure") add(e.mat);
  });
  const cm = {};
  model.elems.forEach(e => { if (e.type === "contact") { cm[e.m1 || "staal"] = 1; cm[e.m2 || "staal"] = 1; } });
  let h = "";
  if (used.length) {
    h += tbl(["Materiaal", "E (GPa)", "ν", "σ<sub>toel</sub> (MPa)", "α (µm/(m·K))", "ρ (kg/m³)", "Bron"],
      used.map(m => [esc(m.naam), sg(m.E / 1000), sg(m.nu), sg(m.sigma), sg(m.alpha), sg(m.rho), esc(m.bron)]));
  }
  const ck = Object.keys(cm);
  if (ck.length) {
    h += tbl(["Contactmateriaal", "E (GPa)", "ν"], ck.map(k => { const m = contactMat(k); return [esc(m.nm), sg(m.E / 1000), sg(m.nu)]; }));
  }
  if (!h) return '<p class="rep-note">Geen materiaalafhankelijke elementen; stangen zijn stijf.</p>';
  return h + '<p class="rep-note">' + esc(MATERIAL_SOURCE) + "</p>";
}

function settingsTable() {
  const r = [["Modus", MODE_NAMES[model.mode] || model.mode]];
  r.push(["Zwaartekracht", model.gravity ? "aan (9,81 m/s²)" : "uit"]);
  if (model.dT) r.push(["Temperatuurverschil ΔT", ve(model.dT, "K")]);
  if (model.mode === "dyn" || model.mode === "equil") {
    r.push(model.durMode === "equil" ? ["Duur", "tot evenwicht, hoogstens " + ve(model.maxT, "s")] : ["Duur", ve(model.simDur, "s")]);
    r.push(["Tijdstap", ve(model.dtStep, "ms")]);
  }
  if (model.mode !== "kin" && model.mode !== "stiff") r.push(["Standaardmassa", ve(model.defMass, "kg")]);
  if (model.jointDamp && model.mode !== "kin") r.push(["Demping in scharnieren", ve(model.cJoint, "N·m·s/rad")]);
  if (model.cVisc > 0 && model.mode !== "kin") r.push(["Luchtweerstand per punt", ve(model.cVisc, "N·s/mm")]);
  if (model.nodes.some(n => n.mus > 0 || n.muk > 0)) r.push(["Wrijving", "Stribeck-snelheid " + ve(model.fricVs, "mm/s") + ", plakgrens " + ve(model.fricVe, "mm/s")]);
  if (model.mode === "frf" && sim.sweep && sim.sweep.frf) r.push(["FRF-ingang", sim.sweep.inLab || model.frfIn]);
  if (model.mode === "stiff") {
    const nd = N(model.stiffNode);
    r.push(["Vergroting vervorming", model.stiffScale > 0 ? "×" + sg(model.stiffScale) + " (vast)" : "automatisch"]);
    if (nd) r.push(["Stijfheid in punt", esc(nd.name) + ", richting " + ve(isFinite(model.stiffAng) ? model.stiffAng : 90, "°")]);
  }
  r.push(["Eenheden", "mm · N · N/mm · kg"]);
  return tbl(["Instelling", "Waarde"], r.map(x => [esc(x[0]), /<|&/.test(x[1]) ? x[1] : esc(x[1])]), "rep-kvt");
}

function loadsHtml() {
  const f = model.elems.filter(e => e.type === "force" && N(e.node));
  let h = "";
  if (f.length) {
    h += tbl(["Kracht op", "F (N)", "Hoek (°)", "F<sub>x</sub> (N)", "F<sub>y</sub> (N)"], f.map(e => {
      const t = e.ang * Math.PI / 180;
      return [esc(nm(e.node)), sg(e.mag, 4), sg(e.ang, 4), sg(e.mag * Math.cos(t), 4, e.mag), sg(e.mag * Math.sin(t), 4, e.mag)];
    }));
  } else h += '<p class="rep-note">Geen uitwendige krachten getekend.</p>';
  const ms = model.nodes.filter(n => n.m > 0);
  const extra = [];
  extra.push("Zwaartekracht: " + (model.gravity ? "aan (g = 9,81 m/s²)" : "uit"));
  if (ms.length) extra.push("Puntmassa’s: " + ms.map(n => esc(n.name) + " " + sg(n.m, 4) + " kg").join(", "));
  const act = model.elems.filter(e => e.type === "actuator" && N(e.a));
  const dr = model.elems.filter(e => e.type === "link" && e.driver && N(e.a));
  if (dr.length) extra.push("Aandrijving: " + dr.map(e => "kruk " + esc(pair(e)) + " " + sg(e.rpm || 0) + " rpm").join(", "));
  if (act.length) extra.push("Actuatoren: " + act.map(e => esc(pair(e)) + " " + sg(e.freq || 0) + " Hz").join(", "));
  if (model.dT) extra.push("Temperatuurverschil: ΔT = " + sg(model.dT) + " K");
  return h + "<ul class=\"rep-list\">" + extra.map(x => "<li>" + x + "</li>").join("") + "</ul>";
}

/* ---------- uitkomsten van de huidige modus ---------- */
const txt = id => { const el = document.getElementById(id); return el ? el.textContent.replace(/\s+/g, " ").trim() : ""; };
function statusHtml() {
  const a = [txt("dofVal") + " " + txt("dofOf"), txt("resState")].filter(Boolean);
  const th = document.getElementById("thRes");
  if (th && !document.getElementById("thermBox").hidden) a.push("Thermische verschuiving: " + th.textContent.replace(/\s+/g, " ").trim());
  return a.length ? '<p class="rep-key">' + a.map(esc).join("<br>") + "</p>" : "";
}
function seriesHtml() {
  if (!sim.sweep) return '<p class="rep-note">Nog geen oplossing: er zijn geen meetwaarden.</p>';
  if (!model.series.length) return '<p class="rep-note">Geen metingen gekozen.</p>';
  if (!ui.pdata) buildPdata();
  const ss = (ui.pdata && ui.pdata.ss) || [], frf = ui.pdata && ui.pdata.frf;
  const i = Math.max(0, Math.min(360, Math.round(ui.frame || 0)));
  if (frf) {
    return tbl(["Meting", "Eenheid", "Piek (amplitude)", "bij frequentie"], model.series.map((sr, k) => {
      const d = ss[k];
      return [esc(serieLab(sr)), esc(d ? d.u : ""), d && d.ok ? sg(d.peak) : "–", d && d.ok ? fmtHz(sim.sweep.f[d.pk]) : esc(d && d.err || "–")];
    }));
  }
  const when = sim.sweep.dyn ? "t = " + fmtTime(sim.sweep.t[i]) : "stand " + sg(i) + "° van de cyclus";
  return tbl(["Meting", "Eenheid", "Waarde (" + when + ")", "Min", "Max", "RMS"], model.series.map((sr, k) => {
    const d = ss[k];
    if (!d || !d.ok) return [esc(serieLab(sr)), esc(d ? d.u : ""), esc(d && d.err || "–"), "", "", ""];
    const sc = Math.max(Math.abs(d.mn), Math.abs(d.mx));
    return [esc(serieLab(sr)), esc(d.u), sg(d.a[i], 3, sc), sg(d.mn, 3, sc), sg(d.mx, 3, sc), sg(d.rms, 3, sc)];
  }));
}
function modesHtml() {
  const ms = sim.sweep && sim.sweep.modes;
  if (!ms || !ms.length) return "";
  return "<h3>Eigenfrequenties</h3>" + tbl(["Nr", "f", "ζ (demping)", "Opmerking"], ms.map((m, k) => [String(k + 1), m.f < 1e-6 ? "0" : fmtHz(m.f),
    isFinite(m.zeta) ? sg(m.zeta * 100, 3) + " %" : "–", m.unstable ? "instabiel" : m.f < 1e-6 ? "vrije beweging" : ""]));
}
function stiffResults() {
  const R = sim.stiff;
  if (!R) return '<p class="rep-note">Nog niet doorgerekend.</p>';
  if (R.empty || !R.ok) return statusHtml() + '<div class="rep-box">' + stiffKeyHtml(R) + "</div>";
  let h = statusHtml() + '<div class="rep-box">' + stiffKeyHtml(R) + "</div>";
  if (R.modes && R.modes.length) h += "<h3>Eigenfrequenties (ongedempt)</h3>" + tbl(["Mode", "f"], R.modes.map((m, k) => [String(k + 1), fmtHz(m.f)]));
  return h + '<div class="rep-twin">' + tablesHtml(R) + "</div>";
}
function resultsHtml() {
  if (model.mode === "stiff") return stiffResults();
  let h = statusHtml();
  if (model.mode === "frf") h += modesHtml();
  if (sim.sweep && sim.sweep.dyn) {
    h += '<p class="rep-key">' + (sim.sweep.settled ? "Tot rust na " + fmtTime(sim.sweep.settled) : "Doorgerekend over " + fmtTime(sim.sweep.dur)) + ".</p>";
  }
  h += seriesHtml();
  if (sim.sweep && model.series.length && plotCv.offsetParent !== null && ui.plotBox) {
    const url = snapshot(plotCv, () => { drawPlot(); });
    h += figure(url, "De grafieken van de gekozen metingen.", "Grafieken");
  }
  return h;
}

export function openSketchReport() {
  const bi = MODE_NAMES[model.mode] || model.mode;
  const url = snapshot(cv, draw);
  let how = "";
  try { how = howHtml(); } catch (err) { console.error(err); }
  const empty = !model.nodes.length;
  const stand = model.mode === "kin" ? "stand " + sg(Math.round(ui.frame || 0)) + "° van de cyclus" : model.mode === "stiff" ? (ui.stiffMode >= 0 ? "eigenvorm " + (ui.stiffMode + 1) : "statische vervorming") : sim.sweep && sim.sweep.t ? "t = " + fmtTime(sim.sweep.t[Math.round(ui.frame || 0)]) : "";
  showReport({
    title: model.name && model.name !== "Naamloos" ? model.name : "Mechanismeschets",
    sub: "Rekenblad · modus " + bi,
    meta: [["Modus", bi], ["Eenheden", "mm · N · N/mm · kg"]],
    sections: [
      { h: "Tekening", html: figure(url, "Momentopname van het canvas (" + bi + (stand ? ", " + stand : "") + ").", "Tekening van het model") },
      { h: "Model", html: empty ? '<p class="rep-note">Het canvas is leeg.</p>' :
        "<h3>Punten</h3>" + nodeRows() + "<h3>Elementen</h3>" + elemTable() + "<h3>Materialen</h3>" + materialTable() + "<h3>Instellingen</h3>" + settingsTable() },
      { h: "Belastingen", html: empty ? "" : loadsHtml() },
      { h: "Uitkomsten · " + bi, html: empty ? "" : resultsHtml() },
      { h: "Formules, aannamen en bronnen", html: how ? '<div class="rep-how">' + how + "</div>" : "" }
    ]
  });
}
