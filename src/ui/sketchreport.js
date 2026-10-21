// Rekenblad van de schets: tekening, model (punten, elementen, materialen), belastingen, uitkomsten van de
// huidige modus en de formules, aannamen en bronnen uit "Hoe rekent dit?". Alles uit de actuele toestand.
import { materialSource, material } from "../calc/materials.js";
import { axialA, beamSect, dTOf, isAxial, isBeam, matOf } from "../core/axial.js";
import { chLab, chU } from "../core/channels.js";
import { mat as contactMat } from "../core/contact.js";
import { N } from "../core/elements.js";
import { FLEX_KINDS, flexMat } from "../core/flexure.js";
import { jointFor } from "../core/stiffness.js";
import { model, sim, ui } from "../core/state.js";
import { draw } from "./draw.js";
import { fmtHz, fmtLen, fmtStress, fmtTime, sg } from "./format.js";
import { howHtml } from "./how.js";
import { has, t } from "./i18n.js";
import { buildPdata, drawPlot, plotCv, serieLab } from "./plot.js";
import { esc, showReport } from "./report.js";
import { stiffSeriesRows } from "./picker.js";
import { stiffKeyHtml, tablesHtml } from "./stiff.js";
import { pathPlotImage, pathSummaryHtml } from "./stiffpath.js";
import { cv } from "./view.js";

const modeName = m => (has("mode." + m) ? t("mode." + m) : m);
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
const supportName = k => (has("rep.s.sup." + k) ? t("rep.s.sup." + k) : k);
function nodeRows() {
  const stiff = model.mode === "stiff";
  const head = [t("rep.s.n.point"), "x (mm)", "y (mm)", t("rep.s.n.supp"), t("rep.s.n.mass"), stiff ? t("rep.s.n.joint") : t("rep.s.n.other")];
  const rows = model.nodes.map(n => {
    const o = [];
    if (n.mus > 0 || n.muk > 0) o.push("μ<sub>s</sub> " + sg(n.mus || 0) + ", μ<sub>k</sub> " + sg(n.muk || 0) + (n.rj > 0 ? t("rep.s.n.pinr", { r: ve(n.rj, "mm") }) : ""));
    if (n.trace) o.push(t("rep.s.n.trace"));
    let j = "";
    if (stiff) {
      const jf = jointFor(n);
      j = jf.type === "star" ? t("rep.s.j.rigid") : jf.type === "pin" ? t("rep.s.j.pin") : t("rep.s.j.spring", { k: ve(jf.k, "N·mm/rad") }) + (jf.auto ? " (auto)" : "");
      if (jf.auto && jf.type !== "spring") j += " (auto)";
    }
    return [esc(n.name), sg(n.x, 5), sg(n.y, 5), esc(supportName(n.support)) + (n.support === "slider" ? ", " + sg(n.dir || 0) + "°" : "") + (n.support !== "free" && n.clamp ? ", " + t("rep.s.n.clamped") : ""),
      n.m > 0 ? sg(n.m) : "–", stiff ? j : o.join("; ") || "–"];
  });
  return tbl(head, rows);
}

function linkParams(e) {
  const p = [];
  p.push("L = " + ve(e.len, "mm"));
  if (e.driver) {
    p.push(t("rep.s.l.crank", { v: ve(e.theta0 || 0, "°") }), t("rep.s.l.speed", { v: ve(e.rpm || 0, "rpm"), d: e.cw ? t("rep.s.l.cw") : t("rep.s.l.ccw") }));
    return p;
  }
  if (isBeam(e)) {
    const s = beamSect(e), pr = s.prof;
    p.push(t("rep.s.l.beam", { p: has("rep.s.prof." + pr) ? t("rep.s.prof." + pr) : pr }));
    if (pr === "round") p.push("Ø " + ve(e.pd > 0 ? e.pd : 4, "mm"));
    else if (pr === "tube") p.push("D × d = " + sg(e.pD > 0 ? e.pD : 10, 4) + " × " + sg(e.pdi >= 0 ? e.pdi : 8, 4) + " mm");
    else if (pr === "custom") p.push("A = " + ve(s.A, "mm²") + ", I = " + ve(s.I, "mm⁴"));
    else p.push("b × h = " + sg(e.pb > 0 ? e.pb : 10, 4) + " × " + sg(e.ph > 0 ? e.ph : 2, 4) + " mm");
    p.push("A = " + ve(s.A, "mm²") + ", I = " + ve(s.I, "mm⁴") + " " + t("rep.s.l.derived"));
  } else if (isAxial(e)) {
    p.push(t("rep.s.l.axial", { a: ve(axialA(e), "mm²") }));
  } else p.push(t("rep.s.l.rigid"));
  if (isBeam(e) || isAxial(e) || typeof e.dT === "number") p.push(t("rep.s.l.mat", { m: esc(matOf(e).naam) }));
  if (e.sig > 0) p.push("σ<sub>" + t("rep.s.allow") + "</sub> = " + ve(e.sig, "MPa") + " " + t("rep.s.own"));
  if (typeof e.dT === "number") p.push("ΔT = " + ve(e.dT, "K") + " " + t("rep.s.own"));
  return p;
}
function elemRow(e) {
  const a = N(e.a), b = N(e.b), ln = a && b ? esc(pair(e)) : e.node ? esc(nm(e.node)) : "";
  let type = e.type, p = [];
  switch (e.type) {
    case "link": type = e.driver ? t("rep.s.e.crank") : isBeam(e) ? t("rep.s.e.beam") : isAxial(e) ? t("rep.s.e.axial") : t("rep.s.e.link"); p = linkParams(e); break;
    case "spring": type = t("rep.s.e.spring"); p = ["k = " + ve(e.k, "N/mm"), t("rep.s.e.restlen", { v: ve(e.L0, "mm") })]; break;
    case "damper": type = t("rep.s.e.damper"); p = ["c = " + ve(e.c, "N·s/mm")]; break;
    case "actuator": type = t("rep.s.e.actuator"); p = [t("rep.s.e.act.len", { v: ve(e.len, "mm") }), t("rep.s.e.act.range", { a: sg(Math.min(e.min, e.max), 4), b: sg(Math.max(e.min, e.max), 4) }), "f = " + ve(e.freq || 0, "Hz")]; break;
    case "gap": type = t("rep.s.e.gap"); p = [t("rep.s.e.gap.free", { a: sg(Math.min(e.min, e.max), 4), b: sg(Math.max(e.min, e.max), 4) }), t("rep.s.e.gap.stop", { k: ve(e.kc, "N/mm"), c: ve(e.cc, "N·s/mm") })]; break;
    case "force": type = t("rep.s.e.force"); p = [t("rep.s.e.force.p", { f: ve(e.mag, "N"), a: ve(e.ang, "°") })]; break;
    case "contact": {
      type = t("rep.s.e.contact"); const m1 = contactMat(e.m1), m2 = contactMat(e.m2);
      p = [t("rep.s.e.ball", { r: ve(e.R, "mm"), m: esc(m1.nm), E: ve(m1.E / 1000, "GPa", 3), nu: sg(m1.nu) }), t("rep.s.e.plane", { m: esc(m2.nm), E: ve(m2.E / 1000, "GPa", 3), nu: sg(m2.nu), a: ve(e.ang || 0, "°") }),
        "μ = " + sg(e.mu) + ", χ = " + sg(e.chi)];
      break;
    }
    case "flexure": {
      type = t("rep.s.e.flexure"); const m = flexMat(e);
      p = [esc(FLEX_KINDS[e.kind] || e.kind), "L = " + ve(e.L, "mm") + ", " + t("rep.s.e.fl.width", { v: ve(e.wd, "mm") }) + ", " + t("rep.s.e.fl.thick", { v: ve(e.t, "mm") }) + (e.kind !== "cantilever" ? ", R = " + ve(e.R, "mm") + (e.kind === "notch" ? ", K<sub>t</sub> = " + sg(e.Kt) : "") : ""),
        t("rep.s.l.mat", { m: esc(m.naam) }) + ", σ<sub>" + t("rep.s.allow") + "</sub> = " + ve(m.sigma, "MPa") + (e.pre ? ", " + t("rep.s.e.fl.pre", { v: ve(e.pre, "°") }) : "")];
      break;
    }
    case "loadcell": type = t("rep.s.e.loadcell"); p = [esc(e.name || ""), "k<sub>s</sub> = " + ve(e.ks, "N/µm"), t("rep.s.e.mass", { v: ve(e.m || 0, "kg") })]; break;
    case "dsens": type = t("rep.s.e.dsens"); p = [esc(e.name || ""), t("rep.s.e.dir", { v: ve(e.ang || 0, "°") }), t("rep.s.e.ds.range", { r: ve(e.range, "µm"), s: ve(e.res, "µm") })]; break;
    case "encoder": type = t("rep.s.e.encoder"); p = [esc(e.name || ""), t("rep.s.e.enc.cpr", { n: sg(e.cpr) })]; break;
    case "accel": type = t("rep.s.e.accel"); p = [esc(e.name || ""), t("rep.s.e.dir", { v: ve(e.ang || 0, "°") }), t("rep.s.e.mass", { v: ve(e.m >= 0 ? e.m : 0.01, "kg") })]; break;
  }
  return [esc(type), ln, p.join("<br>")];
}
function elemTable() {
  if (!model.elems.length) return '<p class="rep-note">' + esc(t("rep.s.e.none")) + "</p>";
  return tbl([t("rep.s.e.h.el"), t("rep.s.e.h.between"), t("rep.s.e.h.params")], model.elems.map(elemRow), "rep-elem");
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
    h += tbl([t("rep.s.m.mat"), "E (GPa)", "ν", "σ<sub>" + t("rep.s.allow") + "</sub> (MPa)", "α (µm/(m·K))", "ρ (kg/m³)", t("rep.s.m.src")],
      used.map(m => [esc(m.naam), sg(m.E / 1000), sg(m.nu), sg(m.sigma), sg(m.alpha), sg(m.rho), esc(m.bron)]));
  }
  const ck = Object.keys(cm);
  if (ck.length) {
    h += tbl([t("rep.s.m.contact"), "E (GPa)", "ν"], ck.map(k => { const m = contactMat(k); return [esc(m.nm), sg(m.E / 1000), sg(m.nu)]; }));
  }
  if (!h) return '<p class="rep-note">' + esc(t("rep.s.m.none")) + "</p>";
  return h + '<p class="rep-note">' + esc(materialSource()) + "</p>";
}

function settingsTable() {
  const r = [[t("rep.s.set.mode"), modeName(model.mode)]];
  r.push([t("rep.s.set.grav"), model.gravity ? t("rep.s.set.grav.on") : t("rep.s.set.off")]);
  if (model.dT) r.push([t("rep.s.set.dT"), ve(model.dT, "K")]);
  if (model.mode === "dyn" || model.mode === "equil") {
    r.push(model.durMode === "equil" ? [t("rep.s.set.dur"), t("rep.s.set.dur.eq", { v: ve(model.maxT, "s") })] : [t("rep.s.set.dur"), ve(model.simDur, "s")]);
    r.push([t("rep.s.set.step"), ve(model.dtStep, "ms")]);
  }
  if (model.mode !== "kin" && model.mode !== "stiff") r.push([t("rep.s.set.mass"), ve(model.defMass, "kg")]);
  if (model.jointDamp && model.mode !== "kin") r.push([t("rep.s.set.jd"), ve(model.cJoint, "N·m·s/rad")]);
  if (model.cVisc > 0 && model.mode !== "kin") r.push([t("rep.s.set.air"), ve(model.cVisc, "N·s/mm")]);
  if (model.nodes.some(n => n.mus > 0 || n.muk > 0)) r.push([t("rep.s.set.fric"), t("rep.s.set.fric.v", { a: ve(model.fricVs, "mm/s"), b: ve(model.fricVe, "mm/s") })]);
  if (model.mode === "frf" && sim.sweep && sim.sweep.frf) r.push([t("rep.s.set.frf"), sim.sweep.inLab || model.frfIn]);
  if (model.mode === "stiff") {
    const nd = N(model.stiffNode);
    r.push([t("rep.s.set.mag"), model.stiffScale > 0 ? "×" + sg(model.stiffScale) + " " + t("rep.s.set.fixed") : t("rep.s.set.auto")]);
    if (nd) r.push([t("rep.s.set.stiffpt"), esc(nd.name) + ", " + t("rep.s.e.dir", { v: ve(isFinite(model.stiffAng) ? model.stiffAng : 90, "°") })]);
  }
  r.push([t("rep.s.units"), "mm · N · N/mm · kg"]);
  return tbl([t("rep.s.set.h.set"), t("rep.s.set.h.val")], r.map(x => [esc(x[0]), /<|&/.test(x[1]) ? x[1] : esc(x[1])]), "rep-kvt");
}

function loadsHtml() {
  const f = model.elems.filter(e => e.type === "force" && N(e.node));
  let h = "";
  if (f.length) {
    h += tbl([t("rep.s.ld.on"), "F (N)", t("rep.s.ld.angle"), "F<sub>x</sub> (N)", "F<sub>y</sub> (N)"], f.map(e => {
      const rad = e.ang * Math.PI / 180;
      return [esc(nm(e.node)), sg(e.mag, 4), sg(e.ang, 4), sg(e.mag * Math.cos(rad), 4, e.mag), sg(e.mag * Math.sin(rad), 4, e.mag)];
    }));
  } else h += '<p class="rep-note">' + esc(t("rep.s.ld.none")) + "</p>";
  const ms = model.nodes.filter(n => n.m > 0);
  const extra = [];
  extra.push(t("rep.s.ld.grav") + " " + (model.gravity ? t("rep.s.ld.grav.on") : t("rep.s.set.off")));
  if (ms.length) extra.push(t("rep.s.ld.masses") + " " + ms.map(n => esc(n.name) + " " + sg(n.m, 4) + " kg").join(", "));
  const act = model.elems.filter(e => e.type === "actuator" && N(e.a));
  const dr = model.elems.filter(e => e.type === "link" && e.driver && N(e.a));
  if (dr.length) extra.push(t("rep.s.ld.drive") + " " + dr.map(e => t("rep.s.ld.crank") + " " + esc(pair(e)) + " " + sg(e.rpm || 0) + " rpm").join(", "));
  if (act.length) extra.push(t("rep.s.ld.acts") + " " + act.map(e => esc(pair(e)) + " " + sg(e.freq || 0) + " Hz").join(", "));
  if (model.dT) extra.push(t("rep.s.ld.dT") + " ΔT = " + sg(model.dT) + " K");
  return h + "<ul class=\"rep-list\">" + extra.map(x => "<li>" + x + "</li>").join("") + "</ul>";
}

/* ---------- uitkomsten van de huidige modus ---------- */
const txt = id => { const el = document.getElementById(id); return el ? el.textContent.replace(/\s+/g, " ").trim() : ""; };
function statusHtml() {
  const a = [txt("dofVal") + " " + txt("dofOf"), txt("resState")].filter(Boolean);
  const th = document.getElementById("thRes");
  if (th && !document.getElementById("thermBox").hidden) a.push(t("rep.s.res.therm") + " " + th.textContent.replace(/\s+/g, " ").trim());
  return a.length ? '<p class="rep-key">' + a.map(esc).join("<br>") + "</p>" : "";
}
function seriesHtml() {
  if (!sim.sweep) return '<p class="rep-note">' + esc(t("rep.s.res.nosol")) + "</p>";
  if (!model.series.length) return '<p class="rep-note">' + esc(t("rep.s.res.nomeas")) + "</p>";
  if (!ui.pdata) buildPdata();
  const ss = (ui.pdata && ui.pdata.ss) || [], frf = ui.pdata && ui.pdata.frf;
  const i = Math.max(0, Math.min(360, Math.round(ui.frame || 0)));
  if (frf) {
    return tbl([t("rep.s.res.meas"), t("rep.s.res.unit"), t("rep.s.res.peak"), t("rep.s.res.atf")], model.series.map((sr, k) => {
      const d = ss[k];
      return [esc(serieLab(sr)), esc(d ? d.u : ""), d && d.ok ? sg(d.peak) : "–", d && d.ok ? fmtHz(sim.sweep.f[d.pk]) : esc(d && d.err || "–")];
    }));
  }
  const when = sim.sweep.dyn ? "t = " + fmtTime(sim.sweep.t[i]) : t("rep.s.pos", { a: sg(i) });
  return tbl([t("rep.s.res.meas"), t("rep.s.res.unit"), t("rep.s.res.value", { w: when }), "Min", "Max", "RMS"], model.series.map((sr, k) => {
    const d = ss[k];
    if (!d || !d.ok) return [esc(serieLab(sr)), esc(d ? d.u : ""), esc(d && d.err || "–"), "", "", ""];
    const sc = Math.max(Math.abs(d.mn), Math.abs(d.mx));
    return [esc(serieLab(sr)), esc(d.u), sg(d.a[i], 3, sc), sg(d.mn, 3, sc), sg(d.mx, 3, sc), sg(d.rms, 3, sc)];
  }));
}
function modesHtml() {
  const ms = sim.sweep && sim.sweep.modes;
  if (!ms || !ms.length) return "";
  return "<h3>" + esc(t("rep.s.res.modes")) + "</h3>" + tbl([t("rep.s.res.nr"), "f", t("rep.s.res.zeta"), t("rep.s.res.remark")], ms.map((m, k) => [String(k + 1), m.f < 1e-6 ? "0" : fmtHz(m.f),
    isFinite(m.zeta) ? sg(m.zeta * 100, 3) + " %" : "–", m.unstable ? t("rep.s.res.unstable") : m.f < 1e-6 ? t("rep.s.res.free") : ""]));
}
function stiffResults() {
  const R = sim.stiff;
  if (!R) return '<p class="rep-note">' + esc(t("rep.s.res.notyet")) + "</p>";
  if (R.empty || !R.ok) return statusHtml() + '<div class="rep-box">' + stiffKeyHtml(R) + "</div>";
  let h = statusHtml() + '<div class="rep-box">' + stiffKeyHtml(R) + "</div>";
  if (R.modes && R.modes.length) h += "<h3>" + esc(t("rep.s.res.modes.u")) + "</h3>" + tbl([t("rep.s.res.mode"), "f"], R.modes.map((m, k) => [String(k + 1), fmtHz(m.f)]));
  h += '<div class="rep-twin">' + tablesHtml(R) + "</div>";
  const rows = stiffSeriesRows();
  if (rows.length) h += "<h3>" + esc(t("rep.s.res.meass")) + "</h3>" + tbl([t("rep.s.res.meas"), t("rep.s.res.val"), t("rep.s.res.unit")], rows.map(r => [esc(r.lab), r.err ? esc(r.err) : sg(r.v, 4), esc(r.u || "")]));
  const pu = pathPlotImage(640);
  if (pu) h += "<h3>" + esc(t("rep.s.res.path")) + "</h3>" + figure(pu, pathSummaryHtml().replace(/<[^>]+>/g, "") + " " + t("rep.s.res.path.cap"), t("rep.s.res.path.alt"));
  return h;
}
function resultsHtml() {
  if (model.mode === "stiff") return stiffResults();
  let h = statusHtml();
  if (model.mode === "frf") h += modesHtml();
  if (sim.sweep && sim.sweep.dyn) {
    h += '<p class="rep-key">' + esc(sim.sweep.settled ? t("rep.s.res.settled", { t: fmtTime(sim.sweep.settled) }) : t("rep.s.res.calc", { t: fmtTime(sim.sweep.dur) })) + ".</p>";
  }
  h += seriesHtml();
  if (sim.sweep && model.series.length && plotCv.offsetParent !== null && ui.plotBox) {
    const url = snapshot(plotCv, () => { drawPlot(); });
    h += figure(url, t("rep.s.res.plots"), t("rep.s.res.plots.alt"));
  }
  return h;
}

export function openSketchReport() {
  const bi = modeName(model.mode);
  const url = snapshot(cv, draw);
  let how = "";
  try { how = howHtml(); } catch (err) { console.error(err); }
  const empty = !model.nodes.length;
  const stand = model.mode === "kin" ? t("rep.s.pos", { a: sg(Math.round(ui.frame || 0)) }) : model.mode === "stiff" ? (ui.stiffMode >= 0 ? t("rep.s.eigmode", { n: ui.stiffMode + 1 }) : t("rep.s.static")) : sim.sweep && sim.sweep.t ? "t = " + fmtTime(sim.sweep.t[Math.round(ui.frame || 0)]) : "";
  const units = "mm \u00b7 N \u00b7 N/mm \u00b7 kg";
  showReport({
    title: model.name && model.name !== "Naamloos" && model.name !== "Untitled" ? model.name : t("app.title"),
    sub: t("rep.title") + " \u00b7 " + t("rep.s.mode", { m: bi }),
    meta: [[t("rep.s.set.mode"), bi], [t("rep.s.units"), units]],
    rebuild: openSketchReport,
    sections: [
      { h: t("rep.s.sec.draw"), html: figure(url, t("rep.s.cap", { m: bi, s: stand ? ", " + stand : "" }), t("rep.s.draw.alt")) },
      { h: t("rep.s.sec.model"), html: empty ? '<p class="rep-note">' + esc(t("rep.s.empty")) + "</p>" :
        "<h3>" + esc(t("rep.s.h.points")) + "</h3>" + nodeRows() + "<h3>" + esc(t("rep.s.h.elems")) + "</h3>" + elemTable() + "<h3>" + esc(t("rep.s.h.mats")) + "</h3>" + materialTable() + "<h3>" + esc(t("rep.s.h.settings")) + "</h3>" + settingsTable() },
      { h: t("rep.s.sec.loads"), html: empty ? "" : loadsHtml() },
      { h: t("rep.s.sec.results", { m: bi }), html: empty ? "" : resultsHtml() },
      { h: t("rep.s.sec.how"), html: how ? '<div class="rep-how">' + how + "</div>" : "" }
    ]
  });
}
