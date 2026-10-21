// Eigenschappenpaneel.
import { frame as cFrame, hertz, liveContact, MATERIALS } from "../core/contact.js";
import { A_DEFAULT, axialA, axialE, axialK, axialSigma, alphaOf, beamSect, dTOf, isAxial, isBeam, matOf, PROFILES, sigAllow, thermDL } from "../core/axial.js";
import { asyncMode, dist, E, hasFriction, isBar, N } from "../core/elements.js";
import { FLEX_KINDS, flexK, flexLivePhi, flexRefs, flexStress, GAMMA } from "../core/flexure.js";
import { chLab } from "../core/channels.js";
import { frfInputs } from "../core/frf.js";
import { mobility, placeAt, relax } from "../core/kinematics.js";
import { barsAt, encRes, loadcellDt, sensorLive, SENSORS, springK } from "../core/sensors.js";
import { jointFor } from "../core/stiffness.js";
import { model, sim, ui } from "../core/state.js";
import { draw } from "./draw.js";
import { anchorHere, crankAngle, setDriver, splitBeam } from "./edit.js";
import { fmt, fmtAngle, fmtHz, fmtLen, fmtStiff, fmtStress, fmtTime, sg, decimal } from "./format.js";
import { t, onLang, parseNum } from "./i18n.js";
import { pushHistory, save } from "./persist.js";
import { chip, plotted, toggleSerie } from "./picker.js";
import { atT0, lockNudge, toT0 } from "./playback.js";
import { refreshChannels } from "./plot.js";
import { cancelJob, changed, rebuild } from "./solver.js";
import { flash } from "./tools.js";
import { renderHowNow } from "./howhook.js";
import { renderThermal } from "./thermal.js";
import { stiffSelect } from "./stiff.js";
import { MATERIALS as CALC_MATERIALS } from "../calc/materials.js";

export function syncDynInputs() {
  const a = document.getElementById("autoChk"); if (!a) return;
  a.checked = !!model.autoSolve;
  const eq = model.durMode === "equil";
  document.getElementById("durMode").value = eq ? "equil" : "fixed";
  document.getElementById("cvInp").value = model.cVisc || 0;
  document.getElementById("jdChk").checked = !!model.jointDamp;
  document.getElementById("cjInp").value = model.cJoint || 0;
  document.getElementById("cjInp").disabled = !model.jointDamp;
  document.getElementById("durInp").value = model.simDur;
  document.getElementById("maxInp").value = model.maxT || 30;
  document.getElementById("durRow").hidden = eq || model.mode === "frf";
  document.getElementById("maxRow").hidden = !eq || model.mode === "frf";
  // FRF: keuze van de ingang en het frequentiebereik
  const ins = frfInputs(), fs = document.getElementById("frfIn");
  if (!ins.some(x => x.id === model.frfIn)) model.frfIn = ins.length ? ins[0].id : "";
  fs.innerHTML = ins.length ? ins.map(x => '<option value="' + x.id + '"' + (x.id === model.frfIn ? " selected" : "") +
    ">" + x.lab + " [" + x.u + "]</option>").join("") : '<option value="">\u2013 ' + t("insp.frf.noin") + ' \u2013</option>';
  document.getElementById("frfMinInp").value = model.frfMin || 0;
  document.getElementById("fvsInp").value = model.fricVs || 5;
  document.getElementById("fveInp").value = model.fricVe || 2;
  document.getElementById("frfMaxInp").value = model.frfMax || 0;
  document.getElementById("dTInp").value = model.dT || 0;
}

// getallen komen al taalbewust uit format.js; nl() blijft als identiteit zodat de tekstopbouw gelijk blijft
const nl = x => String(x);

// Eén regel in de kaart Resultaat: waar staan we, in de huidige modus.
export function syncResult() {
  const el = document.getElementById("resState"); if (!el) return;
  const sw = sim.sweep;
  let txt;
  if (!model.nodes.length) txt = t("insp.res.empty");
  else if (sim.job) txt = t("insp.res.busy");
  else if (ui.dynStale) txt = t("insp.res.stale");
  else {
    const m = mobility(), v = m.drive ? m.dofDriven : m.dof;
    const st = v === 0 ? t("insp.res.det") : v > 0 ? t("insp.res.under") : t("insp.res.over");
    if (model.mode === "stiff") {
      const R = sim.stiff;
      txt = !R ? t("insp.res.stiff.none") : R.empty ? t("insp.res.stiff.nothing") : !R.ok ? t("insp.res.stiff.mech")
        : t("insp.res.stiff") + " \u00b7 " + (R.sigMax ? t("insp.res.stiff.sig", { p: sg(R.sigMax.ratio * 100, 2) }) : t("insp.res.calc"));
    } else if (model.mode === "frf") {
      if (!sw || !sw.frf) txt = "FRF \u00b7 " + (sim.frfMsg || t("insp.res.notyet"));
      else {
        const sr = model.series.find(x => !x.expr);
        txt = t("insp.res.frf.io", { i: sw.inLab || "\u2013", o: sr ? chLab(sr.key) : t("insp.res.frf.pick") });
      }
    } else if (model.mode === "dyn") {
      const eq = model.durMode === "equil";
      txt = (eq ? t("insp.res.equil") : t("insp.res.dyn")) + " \u00b7 " +
        (sw ? (eq && sw.settled ? t("insp.res.rest") : "") + fmtTime(sw.dur) + (eq && sw.settled ? "" : " " + t("insp.res.calc")) : t("insp.res.notyet"));
    } else txt = t("insp.res.kin") + " \u00b7 " + (sim.solveOK === false ? t("insp.res.noasm") : st);
  }
  el.textContent = txt;
  renderThermal();
}

export function syncDof() {
  syncResult(); renderHowNow();
  const el = document.getElementById("dofVal");
  const of = document.getElementById("dofOf");
  const note = document.getElementById("dofNote");
  if (model.mode === "stiff") { stiffDof(el, of, note); return; }
  const m = mobility();
  if (!model.nodes.length) {
    el.textContent = "–"; el.className = "big"; of.textContent = "";
    note.textContent = t("insp.dof.nomodel");
    document.getElementById("tally").innerHTML = ""; return;
  }
  const v = m.drive ? m.dofDriven : m.dof;
  el.textContent = (v > 0 ? "+" : "") + v;
  of.textContent = m.drive ? t("insp.dof.withdrive") : t("insp.dof.nodrive");
  el.className = "big " + (v === 0 ? "ok" : v > 0 ? "warn" : "bad");
  if (v === 0) {
    note.innerHTML = m.drive
      ? t("insp.dof.det")
      : t("insp.dof.rigid");
  } else if (v > 0) {
    note.textContent = v === 1 && !m.drive
      ? t("insp.dof.one")
      : t("insp.dof.under", { n: v });
  } else {
    note.textContent = t("insp.dof.over", { n: -v });
  }
  if (model.mode === "dyn") {
    const dn = document.getElementById("dynNote");
    if (v > 0 || m.dof > 0) {
      note.innerHTML = Math.max(v, 0) === 1
        ? t("insp.dyn.dof1")
        : t("insp.dyn.dofn", { n: Math.max(v, 0) });
    } else if (m.dof === 0) {
      note.textContent = t("insp.dyn.det");
    }
    if (dn && sim.sweep && sim.sweep.settled)
      dn.innerHTML = t("insp.dyn.settled", { t: fmtTime(sim.sweep.settled), m: fmt(model.defMass) });
    else if (dn) dn.innerHTML = sim.sweep
      ? t("insp.dyn.note", { m: fmt(model.defMass) })
      : t("insp.dyn.nosol");
  }
  if (model.mode === "frf") {
    const fn = document.getElementById("frfNote");
    if (sim.sweep && sim.sweep.frf) {
      const ms = sim.sweep.modes;
      fn.innerHTML = (hasFriction() ? '<b style="color:var(--driver)">' + t("insp.frf.fric") + '</b> ' + t("insp.frf.nonlin") + ' ' : "") +
      (sim.sweep.eqOK ? t("insp.frf.lin") :
          '<b style="color:var(--driver)">' + t("insp.frf.noeq") + '</b>; ' + t("insp.frf.lin0")) +
        " \u2014 " + (sim.sweep.k === 1 ? t("insp.frf.dof1") : t("insp.frf.dofn", { n: sim.sweep.k })) + "." +
        (ms.length ? "<br>" + t("insp.frf.modes") + ": " + ms.map(m => m.unstable ? '<b style="color:var(--bad)">' + t("insp.frf.unstable") + '</b>'
          : m.f < 1e-6 ? t("insp.frf.free") : "<b>" + fmtHz(m.f) + "</b>" + (isFinite(m.zeta) ? " (\u03b6 " + sg(m.zeta * 100, 2) + " %)" : "")).join(", ") : "");
    } else fn.textContent = sim.frfMsg || t("insp.frf.pick");
    note.innerHTML = t("insp.frf.note");
  }
  if (!sim.solveOK) {
    note.innerHTML = '<b style="color:var(--bad)">' + t("insp.noasm") + '</b> ' + t("insp.noasm2");
  }
  if (model.mode === "frf") frfDof(el, of);
  document.getElementById("tally").innerHTML =
    row(t("insp.tally.pts"), m.nNodes) + row(t("insp.tally.pins"), m.nPinned) + row(t("insp.tally.sliders"), m.nSliders) +
    row(t("insp.tally.links"), m.nLinks + (m.nDead ? " (" + t("insp.tally.rigid", { n: m.nDead }) + ")" : "")) +
    row(t("insp.tally.unk"), m.unknowns) + row(t("insp.tally.eq"), m.cons + m.driver);
  function row(k, v) { return "<span>" + k + "</span><b>" + v + "</b>"; }
}

// FRF: de vrijheidsgraden zeggen hier weinig; de kaart toont de eerste eigenfrequentie en de demping
function frfDof(el, of) {
  const sw = sim.sweep;
  if (!sw || !sw.frf) { el.textContent = "\u2013"; el.className = "big"; of.textContent = sim.frfMsg ? t("insp.fd.nofrf") : t("insp.res.notyet"); return; }
  if ((sw.modes || []).some(x => x.unstable)) { el.textContent = t("insp.frf.unstable"); el.className = "big bad"; of.textContent = t("insp.fd.neg"); return; }
  const md = (sw.modes || []).find(x => x.f > 1e-6);
  if (!md) { el.textContent = "\u2013"; el.className = "big"; of.textContent = t("insp.fd.nof"); return; }
  el.textContent = fmtHz(md.f); el.className = "big ok";
  of.textContent = t("insp.fd.first") + (isFinite(md.zeta) ? " \u00b7 \u03b6 " + nl(sg(md.zeta * 100, 2)) + " %" : "");
}

// Stijfheid: het getal is het aantal vrije bewegingen (0 = stijf genoeg)
function stiffDof(el, of, note) {
  const R = sim.stiff, tally = document.getElementById("tally");
  if (!model.nodes.length || !R || R.empty) {
    el.textContent = "\u2013"; el.className = "big"; of.textContent = "";
    note.textContent = t("insp.sd.empty");
    tally.innerHTML = ""; return;
  }
  const free = R.ok ? 0 : R.mech.count;
  if (free) { el.textContent = "+" + free; el.className = "big bad"; of.textContent = t("insp.sd.free"); }
  else if (R.sigMax) {                                   // wat telt: de grootste spanning en de grootste verplaatsing
    const r = R.sigMax.ratio;
    el.textContent = fmtStress(R.sigMax.val); el.className = "big " + (r > 1 ? "bad" : r > 0.7 ? "warn" : "ok");
    of.textContent = t("insp.sd.max", { d: fmtLen(R.maxDisp) });
  } else { el.textContent = fmtLen(R.maxDisp); el.className = "big ok"; of.textContent = t("insp.sd.maxd"); }
  note.innerHTML = free ? "<b style=\"color:var(--bad)\">" + R.mech.text + "</b>"
    : t("insp.sd.ok", { n: R.nfree });
  const rowk = (k, v) => "<span>" + k + "</span><b>" + v + "</b>";
  tally.innerHTML = rowk(t("insp.tally.pts"), model.nodes.length) + rowk(t("insp.tally.beams"), R.sys.mem.filter(x => x.kind === "beam").length) +
    rowk(t("insp.tally.rigidl"), R.sys.mem.filter(x => x.kind === "rigid").length) + rowk(t("insp.tally.bars"), R.sys.spr.length) +
    rowk(t("insp.tally.dof"), R.sys.nd) + rowk(t("insp.tally.free"), R.nfree);
}

/* ============================================================
   Inspector
   ============================================================ */
const props = document.getElementById("props");

export function syncInspector() {
  stiffSelect();
  buildInspector();
  renderHowNow();
  if (!ui.sel || model.mode === "stiff") return;
  // snelknoppen: grootheden van dit onderdeel direct in de grafiek zetten
  refreshChannels();
  const cs = sim.CH.filter(c => c.obj === ui.sel.id && !c.hide);
  if (cs.length) {
    const box = document.createElement("div");
    box.className = "measq";
    box.innerHTML = '<div class="lab">' + t("insp.inplot") + '</div><div class="pq">' +
      cs.map(c => chip(c, plotted(c.key))).join("") + "</div>";
    box.addEventListener("click", ev => {
      const b = ev.target.closest("button.chip"); if (!b) return;
      toggleSerie(b.dataset.k);
      b.setAttribute("aria-pressed", String(plotted(b.dataset.k)));
    });
    props.appendChild(box);
  }
  if (!atT0()) {
    props.querySelectorAll("input, select, .seg button, #drvBtn").forEach(el => { el.disabled = true; });
    const note = document.createElement("div");
    note.className = "locknote";
    note.innerHTML = "<span>" + (sim.sweep.frf ? t("insp.lock.frf")
      : t("insp.lock.t", { t: fmtTime(sim.sweep.t[ui.frame]) })) + "</span>" +
      '<button class="btn" type="button">\u23EE ' + t("insp.lock.btn") + '</button>';
    note.querySelector("button").addEventListener("click", toT0);
    props.prepend(note);
  }
}

function buildInspector() {
  const stSel = document.getElementById("stSel");
  if (!ui.sel) {
    props.innerHTML = '<p class="empty">' + t("insp.empty") + '</p>';
    stSel.textContent = t("insp.sel.none"); return;
  }
  if (ui.sel.kind === "node") {
    const n = N(ui.sel.id);
    if (!n) { ui.sel = null; return buildInspector(); }
    stSel.textContent = t("insp.sel.pt", { n: n.name });
    props.innerHTML =
      kind(ui.C.ink, t("insp.pt.title", { n: n.name })) +
      '<div class="row"><label for="pnm">' + t("insp.f.name") + ' <span class="unit">' + t("insp.u.informulas") + '</span></label>' +
      '<input type="text" id="pnm" maxlength="8" value="' + n.name + '"></div>' +
      numRow("px", "x", n.x, "mm", .1) +
      numRow("py", "y", n.y, "mm", .1) +
      '<div class="row" style="grid-template-columns:1fr;margin-top:10px"><label>' + t("insp.pt.support") + '</label></div>' +
      '<div class="seg" id="supSeg">' +
        segBtn("free", t("insp.sup.free"), n.support) +
        segBtn("pin", t("insp.sup.pin"), n.support) +
        segBtn("slider", t("insp.sup.slider"), n.support) +
      '</div>' +
      (n.support === "slider" ? numRow("pdir", t("insp.pt.dir"), n.dir, "°", 1) : "") +
      numRow("pm", t("insp.pt.mass"), n.m, "kg", .1) +
      jointHtml(n) + nodeStiffLive(n) +
      (fricApplies(n) ? '<div class="row" style="grid-template-columns:1fr;margin-top:12px"><label><b>' + t("insp.fr.title") + '</b> ' +
        '<span class="unit">' + (n.support === "slider" ? t("insp.fr.slider") : t("insp.fr.pin")) + '</span></label></div>' +
        numRow("pmus", t("insp.fr.mus"), n.mus || 0, "\u2013", .01) +
        numRow("pmuk", t("insp.fr.muk"), n.muk || 0, "\u2013", .01) +
        numRow("prj", t("insp.fr.rj"), n.rj > 0 ? n.rj : 5, "mm", .5) +
        '<p class="empty" style="margin:2px 0 0">' + t("insp.fr.note") + '</p>' : "");
    const nmEl = document.getElementById("pnm");
    const nmCommit = () => {
      const v = nmEl.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 8);
      if (!v || /^[0-9]/.test(v)) { nmEl.value = n.name; return; }
      if (model.nodes.some(o => o !== n && o.name === v)) { flash(t("insp.pt.nametaken")); nmEl.value = n.name; return; }
      n.name = v; changed();
    };
    nmEl.addEventListener("change", nmCommit);
    nmEl.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); nmCommit(); nmEl.blur(); } });
    bindNum("px", v => { n.x = v; anchorHere(n); relax(new Set([n.id])); });
    bindNum("py", v => { n.y = v; anchorHere(n); relax(new Set([n.id])); });
    bindNum("pdir", v => { n.dir = v; anchorHere(n); relax(); });
    bindNum("pm", v => { n.m = Math.max(0, v); });
    bindNum("pmus", v => { n.mus = Math.max(0, v); });
    bindNum("pmuk", v => { n.muk = Math.max(0, v); });
    bindNum("prj", v => { n.rj = Math.max(0.01, v); });
    document.getElementById("supSeg").addEventListener("click", ev => {
      const b = ev.target.closest("button"); if (!b) return;
      n.support = b.dataset.v; anchorHere(n); relax(); changed();
    });
    bindJoint(n);
    return;
  }

  const e = E(ui.sel.id);
  if (!e) { ui.sel = null; return buildInspector(); }

  if (e.type === "link") {
    stSel.textContent = t("insp.sel.link");
    if (e.driver && e.theta0 === undefined) e.theta0 = crankAngle(e);
    if (e.driver && e.rpm === undefined) e.rpm = 60;
    props.innerHTML =
      kind(e.driver ? ui.C.driver : ui.C.ink, e.driver ? t("insp.link.crank") : isBeam(e) ? t("insp.link.beam") : t("insp.link.rigid")) +
      '<p class="empty" style="margin:-4px 0 10px">' + N(e.a).name + " → " + N(e.b).name + '</p>' +
      numRow("el", t("insp.f.len"), e.len, "mm", .1) +
      (e.driver ? "" : linkThermHtml(e)) +
      (e.driver ? (
        numRow("eth", t("insp.link.th0"), e.theta0, "°", 5) +
        '<div class="row"><label>' + t("insp.link.thnow") + '</label><span class="val" id="ethNow" data-e="' + e.id +
          '" style="font-family:\'IBM Plex Mono\',monospace;font-size:12.5px">' +
          Math.round(e.theta || 0) + '°</span></div>' +
        numRow("erpm", t("insp.link.rpm"), e.rpm, "rpm", 5) +
        '<div class="row" style="grid-template-columns:1fr;margin-top:4px"><label>' + t("insp.link.dir") + '</label></div>' +
        '<div class="seg" id="dirSeg">' +
          '<button type="button" data-v="ccw" aria-pressed="' + (e.cw !== true) + '">' + t("insp.link.ccw") + '</button>' +
          '<button type="button" data-v="cw" aria-pressed="' + (e.cw === true) + '">' + t("insp.link.cw") + '</button>' +
        '</div>'
      ) : "") +
      (isBeam(e) ? beamTail(e) : "") +
      '<button class="btn" id="drvBtn" style="width:100%;margin-top:10px">' +
        (e.driver ? t("insp.link.rmdrive") : t("insp.link.mkcrank")) + '</button>' +
      (e.driver ? '<p class="empty" style="margin-top:8px">' + t("insp.link.drvnote", { n: N(e.a).name, w: fmt(Math.abs(e.rpm) * 6) }) + '</p>' : "");

    bindNum("el", v => {
      e.len = Math.max(.1, v);
      if (e.driver) placeAt(sim.sweep ? sim.sweep.t[ui.frame] : 0);
      else relax();                      // andere stangen houden hun lengte
    });
    if (!e.driver) bindLinkTherm(e);
    if (isBeam(e)) bindBeamTail(e);
    bindNum("eth", v => { e.theta0 = v; });
    bindNum("erpm", v => { e.rpm = v; });
    const ds = document.getElementById("dirSeg");
    if (ds) ds.addEventListener("click", ev => {
      const b = ev.target.closest("button"); if (!b) return;
      e.cw = b.dataset.v === "cw"; changed();
    });
    document.getElementById("drvBtn").onclick = () => setDriver(e.id);
    return;
  }

  if (e.type === "actuator") {
    stSel.textContent = t("insp.sel.act");
    const lo = Math.min(e.min, e.max), hi = Math.max(e.min, e.max);
    props.innerHTML =
      kind(ui.C.driver, t("insp.act.title")) +
      '<p class="empty" style="margin:-4px 0 10px">' + N(e.a).name + " \u2194 " + N(e.b).name + '</p>' +
      numRow("al", t("insp.act.len0"), e.len, "mm", .5) +
      numRow("amin", t("insp.f.shortest"), e.min, "mm", 1) +
      numRow("amax", t("insp.f.longest"), e.max, "mm", 1) +
      numRow("af", t("insp.f.freq"), e.freq, "Hz", .1) +
      '<p class="empty" style="margin-top:8px">' + t("insp.act.note", { s: fmt(hi - lo), p: e.freq > 0 ? fmt(1 / e.freq) + " s" : "\u2013" }) +
      (e.len < lo - 1e-6 || e.len > hi + 1e-6 ? ' <b style="color:var(--bad)">' + t("insp.act.out") + '</b>' : "") + '</p>';
    bindNum("al", v => { e.len = Math.max(.1, v); relax(); });
    bindNum("amin", v => { e.min = Math.max(.1, v); });
    bindNum("amax", v => { e.max = Math.max(.1, v); });
    bindNum("af", v => { e.freq = Math.max(0, v); });
    return;
  }

  if (e.type === "gap") {
    stSel.textContent = t("insp.sel.gap");
    const lo = Math.min(e.min, e.max), hi = Math.max(e.min, e.max), Lnow = dist(N(e.a), N(e.b));
    props.innerHTML =
      kind(ui.C.ink2, t("insp.gap.title")) +
      '<p class="empty" style="margin:-4px 0 10px">' + N(e.a).name + " \u2194 " + N(e.b).name + '</p>' +
      numRow("gmin", t("insp.f.shortest"), e.min, "mm", .5) +
      numRow("gmax", t("insp.f.longest"), e.max, "mm", .5) +
      numRow("gk", t("insp.gap.k"), e.kc, "N/mm", 5) +
      numRow("gc", t("insp.gap.c"), e.cc, "Ns/mm", .01) +
      '<p class="empty" style="margin-top:8px">' + t("insp.gap.now", { l: fmt(Lnow), s: Lnow < lo ? t("insp.gap.short") : Lnow > hi ? t("insp.gap.long") : t("insp.gap.free", { g: fmt(hi - lo) }) }) + ' ' +
      t("insp.gap.note") + '</p>';
    bindNum("gmin", v => { e.min = Math.max(0, v); });
    bindNum("gmax", v => { e.max = Math.max(0, v); });
    bindNum("gk", v => { e.kc = Math.max(0, v); });
    bindNum("gc", v => { e.cc = Math.max(0, v); });
    return;
  }

  if (e.type === "contact") {
    stSel.textContent = t("insp.sel.contact");
    const P = N(e.node);
    const opts = cur => Object.keys(MATERIALS).map(k => '<option value="' + k + '"' + (k === cur ? " selected" : "") + ">" + MATERIALS[k].nm + "</option>").join("");
    const selRow = (id, lab, cur) => '<div class="row"><label for="' + id + '">' + lab + '</label><select id="' + id + '">' + opts(cur) + "</select></div>";
    props.innerHTML =
      kind(ui.C.ink2, t("insp.ct.title")) +
      '<p class="empty" style="margin:-4px 0 10px">' + t("insp.ct.on", { n: P.name }) + '</p>' +
      numRow("cr", t("insp.ct.R"), e.R, "mm", .5) +
      selRow("cm1", t("insp.ct.m1"), e.m1) + selRow("cm2", t("insp.ct.m2"), e.m2) +
      numRow("cmu", t("insp.ct.mu"), e.mu, "", .01) +
      numRow("cchi", t("insp.ct.chi"), e.chi, "s/mm", .005) +
      numRow("cang", t("insp.ct.ang"), e.ang, "\u00b0", 5) +
      numRow("cax", t("insp.ct.ax"), e.ax, "mm", 1) + numRow("cay", t("insp.ct.ay"), e.ay, "mm", 1) +
      '<p class="empty" style="margin:10px 0 0"><b>' + t("insp.now") + '</b></p>' +
      '<p class="empty" id="ctLive" data-e="' + e.id + '" style="margin-top:2px">' + contactLive(e) + '</p>' +
      '<p class="empty" style="margin-top:8px">' + t("insp.ct.note") + '</p>';
    bindNum("cr", v => { e.R = Math.max(.01, v); });
    bindNum("cmu", v => { e.mu = Math.max(0, v); });
    bindNum("cchi", v => { e.chi = Math.max(0, v); });
    bindNum("cang", v => { e.ang = v; });
    bindNum("cax", v => { e.ax = v; });
    bindNum("cay", v => { e.ay = v; });
    for (const [id, key] of [["cm1", "m1"], ["cm2", "m2"]]) {
      const el = document.getElementById(id);
      el.addEventListener("change", () => {
        if (!atT0()) { el.value = e[key]; lockNudge(); return; }
        cancelJob(); e[key] = el.value; if (!asyncMode()) ui.frame = 0;
        rebuild(); syncDof(); draw(); pushHistory(); save(); buildInspector();
      });
    }
    return;
  }

  if (e.type === "flexure") {
    stSel.textContent = t("insp.sel.flex");
    const sel = (id, lab, opts, cur) => '<div class="row"><label for="' + id + '">' + lab + '</label><select id="' + id + '">' +
      opts.map(o => '<option value="' + o[0] + '"' + (o[0] === cur ? " selected" : "") + ">" + o[1] + "</option>").join("") + "</select></div>";
    const refs = flexRefs(e), cant = e.kind === "cantilever";
    props.innerHTML =
      kind(ui.C.ink2, t("insp.fx.title")) +
      '<p class="empty" style="margin:-4px 0 10px">' + t("insp.fx.sub", { a: N(e.a).name, b: N(e.b).name }) + '</p>' +
      sel("fk", t("insp.f.type"), Object.keys(FLEX_KINDS).map(k => [k, FLEX_KINDS[k]]), e.kind) +
      numRow("fL", cant ? t("insp.fx.Lc") : t("insp.fx.Ls"), e.L, "mm", 1) +
      numRow("fwd", t("insp.f.width"), e.wd, "mm", .5) +
      numRow("ft", t("insp.fx.t"), e.t, "mm", .01) +
      (e.kind === "notch" ? numRow("fR", t("insp.fx.R"), e.R, "mm", .1) + numRow("fKt", t("insp.fx.Kt"), e.Kt, "\u2013", .1) : "") +
      sel("fm", t("insp.f.material"), CALC_MATERIALS.map(m => [m.id, m.naam]), e.mat) +
      numRow("fsig", t("insp.fx.sig"), e.sig || 0, "MPa", 10) +
      numRow("fpre", t("insp.fx.pre"), e.pre || 0, "\u00b0", .1) +
      sel("fref", t("insp.fx.ref"), [["", t("insp.ground")]].concat(refs.map(r => [r.id, t("insp.linkname", { n: N(r.a).name + N(r.b).name })])), e.ref || "") +
      '<p class="empty" style="margin:10px 0 0"><b>' + t("insp.now") + '</b></p>' +
      '<p class="empty" id="fxLive" data-e="' + e.id + '" style="margin-top:2px">' + flexLive(e) + '</p>' +
      '<p class="empty" style="margin-top:8px">' + (cant
        ? t("insp.fx.cant", { a: fmt((1 - GAMMA) * e.L), b: fmt(GAMMA * e.L) })
        : t("insp.fx.other") + " ") +
      t("insp.fx.note") + "</p>";
    bindNum("fL", v => { e.L = Math.max(.01, v); if (cant) { e.len = Math.round(GAMMA * e.L * 100) / 100; relax(); } });
    bindNum("fwd", v => { e.wd = Math.max(.01, v); });
    bindNum("ft", v => { e.t = Math.max(.001, v); });
    bindNum("fR", v => { e.R = Math.max(.01, v); });
    bindNum("fKt", v => { e.Kt = Math.max(1, v); });
    bindNum("fsig", v => { e.sig = Math.max(0, v); });
    bindNum("fpre", v => { e.pre = v; });
    for (const [id, key] of [["fk", "kind"], ["fm", "mat"], ["fref", "ref"]]) {
      const el = document.getElementById(id);
      el.addEventListener("change", () => {
        if (!atT0()) { el.value = e[key] || ""; lockNudge(); return; }
        cancelJob(); e[key] = el.value;
        if (key === "kind" && el.value === "cantilever") e.L = Math.round(e.len / GAMMA * 100) / 100;
        if (!asyncMode()) ui.frame = 0;
        rebuild(); syncDof(); draw(); pushHistory(); save(); buildInspector();
      });
    }
    return;
  }

  if (SENSORS[e.type]) { sensorInspector(e); return; }

  if (e.type === "spring") {
    stSel.textContent = t("insp.sel.spring");
    props.innerHTML =
      kind(ui.C.spring, t("insp.sp.title")) +
      '<p class="empty" style="margin:-4px 0 10px">' + N(e.a).name + " – " + N(e.b).name + '</p>' +
      numRow("sk", t("insp.sp.k"), e.k, "N/mm", .1) +
      numRow("sl", t("insp.sp.L0"), e.L0, "mm", .5) +
      '<p class="empty" style="margin-top:8px">' + t("insp.sp.note", { l: fmt(dist(N(e.a), N(e.b))) }) + '</p>';
    bindNum("sk", v => { e.k = Math.max(0, v); });
    bindNum("sl", v => { e.L0 = Math.max(0, v); });
    return;
  }

  if (e.type === "damper") {
    stSel.textContent = t("insp.sel.damper");
    props.innerHTML =
      kind(ui.C.ink2, t("insp.dm.title")) +
      '<p class="empty" style="margin:-4px 0 10px">' + N(e.a).name + " – " + N(e.b).name + '</p>' +
      numRow("dc", t("insp.dm.c"), e.c, "Ns/mm", .01) +
      '<p class="empty" style="margin-top:8px">' + t("insp.dm.note") + '</p>';
    bindNum("dc", v => { e.c = Math.max(0, v); });
    return;
  }

  if (e.type === "force") {
    stSel.textContent = t("insp.sel.force");
    props.innerHTML =
      kind(ui.C.force, t("insp.fo.title", { n: N(e.node).name })) +
      numRow("fm", t("insp.fo.mag"), e.mag, "N", 1) +
      numRow("fa", t("insp.fo.dir"), e.ang, "°", 5) +
      '<p class="empty" style="margin-top:8px">' + t("insp.fo.note") + '</p>';
    bindNum("fm", v => { e.mag = v; });
    bindNum("fa", v => { e.ang = v; });
  }
}

/* ---- materiaal, temperatuur en axiale stijfheid van een schakel ---- */
const selH = (id, lab, opts, cur) => '<div class="row"><label for="' + id + '">' + lab + '</label><select id="' + id + '">' +
  opts.map(o => '<option value="' + o[0] + '"' + (o[0] === cur ? " selected" : "") + ">" + o[1] + "</option>").join("") + "</select></div>";
function linkThermHtml(e) {
  const ax = isAxial(e), bm = isBeam(e);
  return selH("lmat", t("insp.f.material"), CALC_MATERIALS.map(m => [m.id, m.naam]), e.mat || "staal") +
    '<div class="row"><label for="ldt">' + t("insp.th.dT") + ' <span class="unit">' + t("insp.th.dTu") + '</span></label>' +
    '<input type="text" inputmode="decimal" id="ldt" placeholder="' + nlf(model.dT || 0) + '" value="' + (typeof e.dT === "number" ? decimal(e.dT) : "") + '"></div>' +
    selH("lst", t("insp.th.stiff"), [["inf", t("insp.th.inf")], ["axial", t("insp.th.axial")], ["beam", t("insp.th.beam")]], bm ? "beam" : ax ? "axial" : "inf") +
    (ax ? selH("lsect", t("insp.th.sect"), [["A", t("insp.th.areaA")], ["bh", t("insp.th.bh")]], e.sect === "bh" ? "bh" : "A") +
      (e.sect === "bh" ? numRow("lsb", t("insp.f.width"), e.sb > 0 ? e.sb : 5, "mm", .5) + numRow("lsh", t("insp.th.h"), e.sh > 0 ? e.sh : 4, "mm", .5)
                       : numRow("lA", t("insp.th.areaA"), axialA(e), "mm\u00b2", 1)) : "") +
    (bm ? beamProfileHtml(e) : "") +
    '<p class="empty" id="axLive" data-e="' + e.id + '" style="margin-top:6px">' + axialLiveHtml(e) + "</p>" +
    '<p class="empty" style="margin-top:6px">' + (bm
      ? t("insp.th.nbeam")
      : ax
      ? t("insp.th.naxial")
      : t("insp.th.ninf")) + "</p>";
}
// profiel van een balk: rechthoek, rond, buis of eigen A en I
function beamProfileHtml(e) {
  const p = beamSect(e).prof;
  return selH("lprof", t("insp.pr.prof"), Object.keys(PROFILES).map(k => [k, PROFILES[k]]), p) +
    (p === "rect" ? numRow("lpb", t("insp.f.width") + " <span class=\"unit\">" + t("insp.pr.bu") + "</span>", e.pb > 0 ? e.pb : 10, "mm", .5) + numRow("lph", t("insp.th.h") + " <span class=\"unit\">" + t("insp.pr.hu") + "</span>", e.ph > 0 ? e.ph : 2, "mm", .1)
      : p === "round" ? numRow("lpd", t("insp.pr.d"), e.pd > 0 ? e.pd : 4, "mm", .5)
      : p === "tube" ? numRow("lpD", t("insp.pr.D"), e.pD > 0 ? e.pD : 10, "mm", .5) + numRow("lpdi", t("insp.pr.di"), e.pdi >= 0 ? e.pdi : 8, "mm", .5)
      : numRow("lpA", t("insp.th.areaA"), e.A > 0 ? e.A : A_DEFAULT, "mm\u00b2", 1) + numRow("lpI", t("insp.pr.I"), e.I > 0 ? e.I : 50, "mm\u2074", 5)) +
    numRow("lsig", t("insp.pr.sig") + " <span class=\"unit\">" + t("insp.pr.sigu") + "</span>", e.sig || 0, "MPa", 10);
}
function axialLiveHtml(e) {
  const m = matOf(e), dth = thermDL(e) * 1000;
  let h = "\u03b1 <b>" + nlf(m.alpha) + "</b> \u00b5m/(m\u00b7K) \u00b7 \u0394T <b>" + nlf(dTOf(e)) + "</b> K \u2192 " + t("insp.ax.therm") + " \u0394L = \u03b1\u00b7L\u00b7\u0394T = <b>" + nlf(dth) + "</b> \u00b5m";
  if (isBeam(e)) return h + "<br>" + beamLiveHtml(e);
  if (!isAxial(e)) return h;
  const k = axialK(e), S = sim.sweep, i = Math.round(ui.frame);
  const F = S && !S.frf && S.EF && S.EF[e.id] ? S.EF[e.id][i] : NaN;
  h += "<br>E <b>" + nlf(axialE(e)) + "</b> MPa \u00b7 A <b>" + nlf(axialA(e)) + "</b> mm\u00b2 \u00b7 k = EA/L <b>" + nlf(k) + "</b> N/mm = <b>" + fmtStiff(k) + "</b><br>" +
    (isFinite(F) ? "N <b>" + nlf(F) + "</b> N \u00b7 \u0394L = N/k <b>" + nlf(F / k * 1000) + "</b> \u00b5m \u00b7 \u03c3 <b>" + nlf(axialSigma(e, F)) + "</b> MPa"
                 : "N \u2013 \u00b7 \u0394L \u2013 \u00b7 \u03c3 \u2013 \u00b7 " + t("insp.ax.nopose"));
  if (model.mode === "dyn" && N(e.a) && N(e.b)) {
    const dt = loadcellDt(e, model.defMass), now = (model.dtStep || 0.2) / 1000;
    h += '<br><span style="' + (now > dt ? "color:var(--driver);font-weight:600" : "") + '">' + t("insp.ts", { a: nlf(dt * 1000), b: nlf(now * 1000), w: now > dt ? " \u2014 " + t("insp.ts.warn") : "" }) + "</span>";
  }
  return h;
}
function bindLinkTherm(e) {
  const redo = () => { if (!asyncMode()) ui.frame = 0; rebuild(); syncDof(); draw(); pushHistory(); save(); buildInspector(); };
  const guard = (el, restore) => { if (!atT0()) { restore(); lockNudge(); return false; } cancelJob(); return true; };
  const onSel = (id, fn, cur) => {
    const el = document.getElementById(id); if (!el) return;
    el.addEventListener("change", () => { if (guard(el, () => { el.value = cur(); })) { fn(el.value); redo(); } });
  };
  onSel("lmat", v => { e.mat = v; }, () => e.mat || "staal");
  onSel("lst", v => { e.axial = v === "axial"; e.beam = v === "beam"; if (e.axial && !(e.A > 0)) e.A = A_DEFAULT; if (e.beam && !e.prof) e.prof = "rect"; }, () => isBeam(e) ? "beam" : isAxial(e) ? "axial" : "inf");
  onSel("lprof", v => { e.prof = v; }, () => beamSect(e).prof);
  bindNum("lpb", v => { e.pb = Math.max(1e-3, v); });
  bindNum("lph", v => { e.ph = Math.max(1e-3, v); });
  bindNum("lpd", v => { e.pd = Math.max(1e-3, v); });
  bindNum("lpD", v => { e.pD = Math.max(1e-3, v); });
  bindNum("lpdi", v => { e.pdi = Math.max(0, v); });
  bindNum("lpA", v => { e.A = Math.max(1e-3, v); });
  bindNum("lpI", v => { e.I = Math.max(1e-6, v); });
  bindNum("lsig", v => { e.sig = Math.max(0, v); });
  onSel("lsect", v => { e.sect = v; if (v === "bh") { if (!(e.sb > 0)) e.sb = 5; if (!(e.sh > 0)) e.sh = Math.max(.1, Math.round(axialA(e) / e.sb * 100) / 100); } else e.A = axialA(e); }, () => e.sect === "bh" ? "bh" : "A");
  bindNum("lA", v => { e.A = Math.max(1e-3, v); });
  bindNum("lsb", v => { e.sb = Math.max(1e-3, v); });
  bindNum("lsh", v => { e.sh = Math.max(1e-3, v); });
  const dt = document.getElementById("ldt");
  const commit = () => {
    const v = parseNum(dt.value);
    if (!guard(dt, () => { dt.value = typeof e.dT === "number" ? decimal(e.dT) : ""; })) return;
    if (isFinite(v)) e.dT = v; else delete e.dT;
    redo();
  };
  dt.addEventListener("change", commit);
  dt.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); commit(); dt.blur(); } });
}

/* ---- Stijfheid: verbinding in een punt, balkresultaten ---- */
function jointHtml(n) {
  const nb = model.elems.filter(e => isBeam(e) && (e.a === n.id || e.b === n.id)).length, sup = n.support !== "free";
  if (!nb && !(sup && n.clamp)) return "";
  const j = jointFor(n), cur = n.joint === "star" || n.joint === "pin" || n.joint === "spring" ? n.joint : "auto";
  const sym = { star: "\u25a0 " + t("insp.j.star"), pin: "\u25cb " + t("insp.j.pin"), spring: "\u27f2 " + t("insp.j.spring") };
  return '<div class="row" style="grid-template-columns:1fr;margin-top:12px"><label><b>' + t("insp.j.title") + '</b> <span class="unit">' + t("insp.j.mode") + '</span></label></div>' +
    '<div class="seg joint-seg" id="jointSeg">' + segBtn("auto", t("insp.j.auto"), cur) + segBtn("star", sym.star, cur) + segBtn("pin", sym.pin, cur) + segBtn("spring", sym.spring, cur) + "</div>" +
    (j.type === "spring" ? numRow("pkth", t("insp.j.kth"), n.kth > 0 ? n.kth : 0, "N\u00b7mm/rad", 100) : "") +
    (sup ? '<div class="chk" style="margin-top:6px"><input type="checkbox" id="pclamp"' + (n.clamp ? " checked" : "") + '><label for="pclamp">' + t("insp.j.clamp") + '</label></div>' : "") +
    '<p class="empty" style="margin:4px 0 0">' + t("insp.now") + ': <b>' + sym[j.type] + "</b>" + (j.auto ? " (" + t("insp.j.autol") + ")" : "") + ". " +
    (j.type === "star" ? t("insp.j.n.star") : j.type === "pin" ? t("insp.j.n.pin") : t("insp.j.n.spring")) + " " +
    t("insp.j.n.auto") + "</p>";
}
function bindJoint(n) {
  const go = fn => () => { if (!atT0()) { lockNudge(); buildInspector(); return; } cancelJob(); fn(); changed(); };
  const seg = document.getElementById("jointSeg");
  if (seg) seg.addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    go(() => { if (b.dataset.v === "auto") delete n.joint; else n.joint = b.dataset.v; if (n.joint === "spring" && !(n.kth > 0)) n.kth = 1000; })();
  });
  bindNum("pkth", v => { n.kth = Math.max(0, v); });
  const cl = document.getElementById("pclamp");
  if (cl) cl.addEventListener("change", go(() => { n.clamp = cl.checked; }));
}
function nodeStiffLive(n) {
  const R = sim.stiff, d = model.mode === "stiff" && R && R.ok ? R.nodes.get(n.id) : null;
  if (!d) return "";
  return '<p class="empty" style="margin:10px 0 0"><b>' + t("insp.disp") + '</b></p><p class="empty" style="margin-top:2px">u\u2093 <b>' + fmtLen(d.ux) + "</b> \u00b7 u<sub>y</sub> <b>" + fmtLen(d.uy) +
    "</b>" + (Number.isNaN(d.th) ? "" : " \u00b7 \u03c6 <b>" + fmtAngle(d.th) + "</b>") + "</p>";
}
function beamLiveHtml(e) {
  if (!N(e.a) || !N(e.b)) return "";
  const s = beamSect(e), m = matOf(e), L = dist(N(e.a), N(e.b));
  let h = "A <b>" + nlf(s.A) + "</b> mm\u00b2 \u00b7 I <b>" + nlf(s.I) + "</b> mm\u2074 \u00b7 EI <b>" + nlf(m.E * s.I) + "</b> N\u00b7mm\u00b2<br>" +
    "EA/L <b>" + nlf(m.E * s.A / L) + "</b> N/mm \u00b7 12EI/L\u00b3 <b>" + nlf(12 * m.E * s.I / L ** 3) + "</b> N/mm \u00b7 3EI/L\u00b3 <b>" + nlf(3 * m.E * s.I / L ** 3) + "</b> N/mm";
  const R = sim.stiff, rec = model.mode === "stiff" && R && R.ok ? R.members.find(x => x.e === e) : null;
  if (rec && rec.kind === "beam") {
    const warn = rec.ratio > 1;
    h += '<br><span style="' + (warn ? "color:var(--driver);font-weight:600" : "") + '">N <b>' + nlf(rec.NN) + "</b> N \u00b7 M<sub>max</sub> <b>" + nlf(rec.Mmax / 1000) + "</b> N\u00b7m \u00b7 \u03c3<sub>max</sub> <b>" +
      nlf(rec.sigMax) + "</b> MPa = <b>" + nlf(rec.ratio * 100) + " %</b> " + t("insp.bm.of") + " " + nlf(rec.allow) + " MPa" + (warn ? " \u2014 " + t("insp.overstress") : "") + "</span>";
  }
  return h;
}
function beamTail(e) {
  return '<div class="row" style="margin-top:10px"><label for="splitPct">' + t("insp.bt.node") + ' <span class="unit">' + t("insp.bt.u") + '</span></label>' +
    '<span style="display:flex;gap:6px"><input type="text" inputmode="decimal" id="splitPct" value="50" style="width:64px">' +
    '<button class="btn" id="splitBtn" type="button" title="' + t("insp.bt.tip") + '">' + t("insp.bt.split") + '</button></span></div>' +
    '<p class="empty" style="margin-top:2px">' + t("insp.bt.note") + '</p>';
}
function bindBeamTail(e) {
  const b = document.getElementById("splitBtn"); if (!b) return;
  b.addEventListener("click", () => {
    if (!atT0()) { lockNudge(); return; }
    const p = parseNum(document.getElementById("splitPct").value);
    cancelJob();
    const n = splitBeam(e.id, (isFinite(p) ? Math.max(5, Math.min(95, p)) : 50) / 100);
    if (n) { ui.sel = { kind: "node", id: n.id }; changed(); }
  });
}

/* ---- sensoren ---- */
function sensorInspector(e) {
  const props = document.getElementById("props"), stSel = document.getElementById("stSel");
  const nmOf = id => (N(id) ? N(id).name : "?");
  const sel = (id, lab, opts, cur) => '<div class="row"><label for="' + id + '">' + lab + '</label><select id="' + id + '">' +
    opts.map(o => '<option value="' + o[0] + '"' + (o[0] === cur ? " selected" : "") + ">" + o[1] + "</option>").join("") + "</select></div>";
  const head = (txt, sub) => kind(ui.C.ink2, sensorNm(e.type) + " " + (e.name || "")) + '<p class="empty" style="margin:-4px 0 10px">' + sub + "</p>";
  const tail = '<p class="empty" style="margin:10px 0 0"><b>' + t("insp.now") + '</b></p><p class="empty" id="snLive" data-e="' + e.id + '" style="margin-top:2px">' + sensorLiveHtml(e) + "</p>";
  stSel.textContent = SENSORS[e.type].short;
  if (e.type === "loadcell") {
    props.innerHTML = head("", nmOf(e.a) + " \u2013 " + nmOf(e.b)) +
      numRow("lcks", t("insp.lc.ks"), springK(e) / 1000, "N/\u00b5m", 10) +
      numRow("lcm", t("insp.lc.m"), e.m || 0, "kg", .001) + tail +
      '<p class="empty" style="margin-top:8px">' + t("insp.lc.note") + '</p>';
    bindNum("lcks", v => { e.ks = Math.max(1e-9, v) * 1000; });
    bindNum("lcm", v => { e.m = Math.max(0, v); });
  } else if (e.type === "dsens") {
    const between = e.b && N(e.b);
    props.innerHTML = head("", between ? nmOf(e.a) + " \u2194 " + nmOf(e.b) : t("insp.ds.ground", { n: nmOf(e.a) })) +
      numRow("dsa", t("insp.f.mdir"), e.ang || 0, "\u00b0", 5) +
      numRow("dsr", t("insp.ds.range"), e.range, "\u00b5m", 10) +
      numRow("dsres", t("insp.f.res"), e.res, "\u00b5m", .01) + tail +
      '<p class="empty" style="margin-top:8px">' + (between ? t("insp.ds.note.b") : t("insp.ds.note.p")) + '</p>';
    bindNum("dsa", v => { e.ang = v; });
    bindNum("dsr", v => { e.range = Math.max(0, v); });
    bindNum("dsres", v => { e.res = Math.max(0, v); });
  } else if (e.type === "encoder") {
    const here = barsAt(e.node), nm = b => t("insp.linkname", { n: nmOf(b.a) + nmOf(b.b) });
    props.innerHTML = head("", t("insp.en.at", { n: nmOf(e.node) })) +
      sel("ene1", t("insp.en.angof"), here.map(b => [b.id, nm(b)]), e.e1) +
      sel("ene2", t("insp.en.rel"), [["", t("insp.ground")]].concat(here.filter(b => b.id !== e.e1).map(b => [b.id, nm(b)])), e.e2 || "") +
      numRow("encpr", t("insp.f.res"), e.cpr, t("insp.en.cpr"), 256) + tail +
      '<p class="empty" style="margin-top:8px">' + t("insp.en.note", { c: fmt(e.cpr), d: fmt(encRes(e) * 180 / Math.PI), u: fmt(encRes(e) * 1e6) }) + '</p>';
    bindNum("encpr", v => { e.cpr = Math.max(1, Math.round(v)); });
    for (const [id, key] of [["ene1", "e1"], ["ene2", "e2"]]) {
      const el = document.getElementById(id);
      el.addEventListener("change", () => {
        if (!atT0()) { el.value = e[key] || ""; lockNudge(); return; }
        cancelJob(); e[key] = el.value;
        if (e.e2 === e.e1) e.e2 = "";
        if (!asyncMode()) ui.frame = 0;
        rebuild(); syncDof(); draw(); pushHistory(); save(); buildInspector();
      });
    }
  } else if (e.type === "accel") {
    const m = e.m >= 0 ? e.m : 0.01;
    props.innerHTML = head("", t("insp.ac.at", { n: nmOf(e.node) })) +
      numRow("aca", t("insp.f.mdir"), e.ang || 0, "\u00b0", 5) +
      numRow("acm", t("insp.ac.m"), m, "kg", .001) + tail +
      '<p class="empty" style="margin-top:8px">' + t("insp.ac.note") + '</p>';
    bindNum("aca", v => { e.ang = v; });
    bindNum("acm", v => { e.m = Math.max(0, v); });
  }
}
const nlf = v => fmt(v);
// sensornamen komen uit de kern; vertaal via de woordenboeksleutel als die bestaat, anders de oorspronkelijke tekst
const sensorNm = type => SENSORS[type].nm;
function sensorLiveHtml(e) {
  if (sim.sweep && sim.sweep.frf) return t("insp.sl.frf");
  const L = sensorLive(e), none = " \u00b7 " + t("insp.sl.none");
  let h = "";
  if (e.type === "loadcell") {
    h = "k\u209b <b>" + nlf(springK(e)) + "</b> N/mm = <b>" + fmtStiff(springK(e)) + "</b><br>" +
      (L ? "F <b>" + nlf(L.F) + "</b> N \u00b7 \u03b4 = F/k\u209b <b>" + nlf(L.d) + "</b> \u00b5m" : "F \u2013 \u00b7 \u03b4 \u2013" + none);
    if (model.mode === "dyn" && N(e.a) && N(e.b)) {
      const dt = loadcellDt(e, model.defMass), now = (model.dtStep || 0.2) / 1000;
      h += '<br><span style="' + (now > dt ? "color:var(--driver);font-weight:600" : "") + '">' + t("insp.ts", { a: nlf(dt * 1000), b: nlf(now * 1000), w: now > dt ? " \u2014 " + t("insp.ts.warn") : "" }) + "</span>";
    }
  } else if (e.type === "dsens") {
    h = L ? 'x <b style="' + (L.oor ? "color:var(--bad)" : "") + '">' + nlf(L.x) + "</b> \u00b5m \u00b7 " + t("insp.sl.rounded") + " <b>" + nlf(L.q) + "</b> \u00b5m<br>" +
      (L.oor ? '<span style="color:var(--bad);font-weight:600">' + t("insp.sl.oor") + ' (\u00b1' + nlf(e.range) + " \u00b5m)</span>" : t("insp.sl.in") + " (\u00b1" + nlf(e.range) + " \u00b5m)") : "x \u2013" + none;
  } else if (e.type === "encoder") {
    h = L ? "\u03b8 <b>" + sg(L.th, 5) + "</b>\u00b0 = <b>" + nlf(L.thu) + "</b> \u00b5rad<br>" + t("insp.sl.counted") + " <b>" + sg(L.thq, 5) + "</b>\u00b0 (" + t("insp.sl.qerr") + " " + nlf((L.thq - L.th) * Math.PI / 180 * 1e6) + " \u00b5rad)" : "\u03b8 \u2013" + none;
  } else if (e.type === "accel") {
    h = L ? "a <b>" + nlf(L.a) + "</b> m/s\u00b2 = <b>" + sg(L.g) + "</b> g" : "a \u2013" + none;
  }
  return h;
}

// live uitlezing van een contact: statisch uit de stand, plak/slip uit de laatste dynamica
function contactLive(e) {
  const P = N(e.node), f = cFrame(e, P), h = hertz(e, f.delta), st = liveContact(e);
  const Fn = st ? st.Fn : h.Fn;
  const state = st ? (st.open ? t("insp.cl.open") : st.slip ? t("insp.cl.slip") : t("insp.cl.stick")) : f.delta > 0 ? t("insp.cl.static") : t("insp.cl.open");
  return "F\u2099 <b>" + fmt(Fn) + "</b> N \u00b7 \u03b4 <b>" + fmt(Math.max(0, f.delta) * 1000) + "</b> \u00b5m \u00b7 a <b>" +
    fmt(h.a) + "</b> mm<br>k\u2099 <b>" + fmt(h.kn) + "</b> N/mm \u00b7 k\u209c <b>" + fmt(h.kt) + "</b> N/mm<br>" + t("insp.cl.state") + ": <b>" + state +
    "</b>" + (st && !st.open ? " \u00b7 F\u209c " + fmt(st.Ft) + " N" : "");
}
export function syncContactLive() {
  const el = document.getElementById("ctLive");
  if (el) { const e = E(el.dataset.e); if (e && e.type === "contact" && N(e.node)) el.innerHTML = contactLive(e); }
  renderThermal();
  const ax = document.getElementById("axLive");
  if (ax) { const e = E(ax.dataset.e); if (e && e.type === "link") ax.innerHTML = axialLiveHtml(e); }
  const sn = document.getElementById("snLive");
  if (sn) { const e = E(sn.dataset.e); if (e && SENSORS[e.type]) sn.innerHTML = sensorLiveHtml(e); }
  const fx = document.getElementById("fxLive");
  if (fx) { const e = E(fx.dataset.e); if (e && e.type === "flexure") fx.innerHTML = flexLive(e); }
  renderHowNow();
}
// live uitlezing van een flexure: draaistijfheid, hoek, moment en spanning tegen de toelaatbare waarde
function flexLive(e) {
  const K = flexK(e), phi = flexLivePhi(e, sim.sweep, Math.round(ui.frame)), st = flexStress(e, phi);
  const warn = st.ratio > 1;
  return "K <b>" + fmt(K) + "</b> N\u00b7mm/rad (" + fmt(K / 1000) + " N\u00b7m/rad)<br>\u03c6 <b>" + fmt(phi * 180 / Math.PI) + "</b>\u00b0 \u00b7 M <b>" +
    fmt(-K * phi / 1000) + "</b> N\u00b7m<br>" +
    '<span style="' + (warn ? "color:var(--driver);font-weight:600" : "") + '">\u03c3 <b>' + fmt(st.sigma) + "</b> MPa " + t("insp.bm.of") + " " + fmt(st.allow) + " MPa (" + fmt(st.ratio * 100) + " %)" +
    (warn ? " \u2014 " + t("insp.overstress") : "") + "</span><br>\u03c6 " + t("insp.fx.phimax") + " <b>" + fmt(st.phiMax * 180 / Math.PI) + "</b>\u00b0 " + t("insp.fx.atallow") +
    (sim.sweep && sim.sweep.FX ? "" : " \u00b7 " + t("insp.sl.none"));
}

// wrijving heeft zin bij een glijder, een oplegging met een stang, of een punt waar twee stangen samenkomen
function fricApplies(n) {
  const k = model.elems.filter(e => isBar(e) && (e.a === n.id || e.b === n.id)).length;
  return n.support === "slider" || k + (n.support === "pin" ? 1 : 0) >= 2;
}

function kind(color, text) {
  return '<span class="kind"><span class="dot" style="background:' + color + '"></span>' + text + '</span>';
}
function segBtn(v, nm, cur) {
  return '<button type="button" data-v="' + v + '" aria-pressed="' + (cur === v) + '">' + nm + '</button>';
}
// invoer als tekst met decimaal-toetsenbord: komma en punt werken allebei (parseNum); step is alleen de pijltjesstap
function numRow(id, lab, val, unit, step) {
  return '<div class="row"><label for="' + id + '">' + lab + ' <span class="unit">' + unit + '</span></label>' +
    '<input type="text" inputmode="decimal" id="' + id + '" value="' + decimal(Math.round(val * 1000) / 1000) + '"></div>';
}
// Commit on Enter or when the field loses focus — not on every keystroke,
// so a half-typed number never triggers a recompute.
function bindNum(id, fn) {
  const el = document.getElementById(id); if (!el) return;
  const commit = () => {
    const v = parseNum(el.value);
    if (!isFinite(v)) { el.value = el.dataset.last || el.value; return; }
    if (!atT0()) { el.value = el.dataset.last; lockNudge(); return; }
    el.value = decimal(v); el.dataset.last = el.value;
    cancelJob();
    fn(v); if (!asyncMode()) ui.frame = 0;
    rebuild(); syncDof(); draw(); pushHistory(); save();
  };
  el.dataset.last = el.value;
  el.addEventListener("change", commit);
  el.addEventListener("keydown", ev => {
    if (ev.key === "Enter") { ev.preventDefault(); commit(); el.blur(); }
  });
}

// taalwissel: het paneel en de resultaatkaart opnieuw opbouwen
onLang(() => { syncInspector(); syncDof(); });
