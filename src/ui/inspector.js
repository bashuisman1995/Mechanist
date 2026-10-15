// Eigenschappenpaneel.
import { frame as cFrame, hertz, liveContact, MATERIALS } from "../core/contact.js";
import { asyncMode, dist, E, hasFriction, isBar, N } from "../core/elements.js";
import { FLEX_KINDS, flexK, flexLivePhi, flexRefs, flexStress, GAMMA } from "../core/flexure.js";
import { frfInputs } from "../core/frf.js";
import { mobility, placeAt, relax } from "../core/kinematics.js";
import { model, sim, ui } from "../core/state.js";
import { draw } from "./draw.js";
import { anchorHere, crankAngle, setDriver } from "./edit.js";
import { fmt, fmtHz, fmtTime } from "./format.js";
import { pushHistory, save } from "./persist.js";
import { chip, plotted, toggleSerie } from "./picker.js";
import { atT0, lockNudge, toT0 } from "./playback.js";
import { refreshChannels } from "./plot.js";
import { cancelJob, changed, rebuild } from "./solver.js";
import { flash } from "./tools.js";
import { renderHowNow } from "./howhook.js";
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
    ">" + x.lab + " [" + x.u + "]</option>").join("") : '<option value="">\u2013 geen actuator, kruk of kracht \u2013</option>';
  document.getElementById("frfMinInp").value = model.frfMin || 0;
  document.getElementById("fvsInp").value = model.fricVs || 5;
  document.getElementById("fveInp").value = model.fricVe || 2;
  document.getElementById("frfMaxInp").value = model.frfMax || 0;
}

const nl = x => String(x).replace(".", ",");

// Eén regel in de kaart Resultaat: waar staan we, in de huidige modus.
export function syncResult() {
  const el = document.getElementById("resState"); if (!el) return;
  const sw = sim.sweep;
  let t;
  if (!model.nodes.length) t = "Leeg canvas";
  else if (sim.job) t = "Rekenen…";
  else if (ui.dynStale) t = "Model gewijzigd \u2014 druk op Bereken";
  else {
    const m = mobility(), v = m.drive ? m.dofDriven : m.dof;
    const st = v === 0 ? "bepaald" : v > 0 ? "onderbepaald" : "overbepaald";
    if (model.mode === "frf") {
      const md = sw && sw.modes ? sw.modes.find(x => !x.unstable && x.f > 1e-6) : null;
      t = "FRF \u00b7 " + (md ? nl(fmtHz(md.f)) : sw ? "doorgerekend" : "nog niet doorgerekend");
    } else if (model.mode === "dyn") {
      const eq = model.durMode === "equil";
      t = (eq ? "Evenwicht" : "Dynamisch") + " \u00b7 " +
        (sw ? (eq && sw.settled ? "tot rust na " : "") + nl(sw.dur.toFixed(1)) + " s" + (eq && sw.settled ? "" : " doorgerekend") : "nog niet doorgerekend");
    } else t = "Kinematisch \u00b7 " + (sim.solveOK === false ? "niet samen te stellen" : st);
  }
  el.textContent = t;
}

export function syncDof() {
  syncResult(); renderHowNow();
  const m = mobility();
  const el = document.getElementById("dofVal");
  const of = document.getElementById("dofOf");
  const note = document.getElementById("dofNote");
  if (!model.nodes.length) {
    el.textContent = "–"; el.className = "big"; of.textContent = "";
    note.textContent = "Nog geen model. Plaats punten en verbind ze met schakels.";
    document.getElementById("tally").innerHTML = ""; return;
  }
  const v = m.drive ? m.dofDriven : m.dof;
  el.textContent = (v > 0 ? "+" : "") + v;
  of.textContent = m.drive ? "met aandrijving" : "zonder aandrijving";
  el.className = "big " + (v === 0 ? "ok" : v > 0 ? "warn" : "bad");
  if (v === 0) {
    note.innerHTML = m.drive
      ? "Bepaald. Elke krukstand legt het hele mechanisme vast — precies wat de exacte oplosser nodig heeft."
      : "Star raamwerk. Voeg een aandrijving toe om het te laten bewegen.";
  } else if (v > 0) {
    note.textContent = v === 1 && !m.drive
      ? "Eén vrijheidsgraad over. Wijs een schakel aan als kruk en het mechanisme is bepaald."
      : "Onderbepaald: " + v + " vrijheidsgraden te veel. Voeg schakels of opleggingen toe.";
  } else {
    note.textContent = "Overbepaald met " + (-v) + ". Er zijn te veel schakels of opleggingen — de lengtes kunnen elkaar tegenspreken.";
  }
  if (model.mode === "dyn") {
    const dn = document.getElementById("dynNote");
    if (v > 0 || m.dof > 0) {
      note.innerHTML = "Dynamisch: " + Math.max(v, 0) +
        " vrijheidsgra" + (Math.max(v, 0) === 1 ? "ad" : "den") +
        " die door veren, dempers, krachten en massa worden gestuurd.";
    } else if (m.dof === 0) {
      note.textContent = "Bepaald — de beweging ligt al vast; tijdintegratie voegt hier niets toe.";
    }
    if (dn && sim.sweep && sim.sweep.settled)
      dn.innerHTML = "Evenwicht na <b>" + sim.sweep.settled.toFixed(2) + " s</b>. " +
        "Punten zonder massa rekenen met " + fmt(model.defMass) + " kg.";
    else if (dn) dn.innerHTML = sim.sweep
      ? "Punten zonder eigen massa rekenen met " + fmt(model.defMass) + " kg. " +
        "Kleinere tijdstap = nauwkeuriger en trager. Plot <b>totale energie E</b> om drift te zien."
      : "Nog geen oplossing — het stelsel is overbepaald of de integratie liep vast.";
  }
  if (model.mode === "frf") {
    const fn = document.getElementById("frfNote");
    if (sim.sweep && sim.sweep.frf) {
      const ms = sim.sweep.modes;
      fn.innerHTML = (hasFriction() ? '<b style="color:var(--driver)">Wrijving telt in de FRF niet mee</b> (niet lineair). ' : "") +
      (sim.sweep.eqOK ? "Gelineariseerd rond het statische evenwicht" :
          '<b style="color:var(--driver)">Geen evenwicht gevonden</b>; gelineariseerd rond de stand op t = 0') +
        " \u2014 " + sim.sweep.k + " vrijheidsgra" + (sim.sweep.k === 1 ? "ad" : "den") + "." +
        (ms.length ? "<br>Eigenfrequenties: " + ms.map(m => m.unstable ? '<b style="color:var(--bad)">instabiel</b>'
          : m.f < 1e-6 ? "0 (vrij)" : "<b>" + fmtHz(m.f) + "</b>" + (isFinite(m.zeta) ? " (\u03b6 " + (m.zeta * 100).toFixed(1) + "%)" : "")).join(", ") : "");
    } else fn.textContent = sim.frfMsg || "Kies een ingang en druk op Bereken.";
    note.innerHTML = "FRF: hoe een kleine trilling van de ingang doorwerkt, per frequentie. " +
      "Veren, zwaartekracht en krachten bepalen de stijfheid; massa en dempers de rest.";
  }
  if (!sim.solveOK) {
    note.innerHTML = '<b style="color:var(--bad)">Deze stand is niet samen te stellen.</b> ' +
      'De stangen halen elkaar niet — draai de kruk terug of pas een lengte aan.';
  }
  document.getElementById("tally").innerHTML =
    row("punten", m.nNodes) + row("scharnieren", m.nPinned) + row("glijders", m.nSliders) +
    row("schakels", m.nLinks + (m.nDead ? " (" + m.nDead + " star)" : "")) +
    row("onbekenden", m.unknowns) + row("vergelijkingen", m.cons + m.driver);
  function row(k, v) { return "<span>" + k + "</span><b>" + v + "</b>"; }
}

/* ============================================================
   Inspector
   ============================================================ */
const props = document.getElementById("props");

export function syncInspector() {
  buildInspector();
  renderHowNow();
  if (!ui.sel) return;
  // snelknoppen: grootheden van dit onderdeel direct in de grafiek zetten
  refreshChannels();
  const cs = sim.CH.filter(c => c.obj === ui.sel.id && !c.hide);
  if (cs.length) {
    const box = document.createElement("div");
    box.className = "measq";
    box.innerHTML = '<div class="lab">In de grafiek</div><div class="pq">' +
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
    note.innerHTML = "<span>" + (sim.sweep.frf ? "De trillingsanimatie loopt. Pauzeer om waarden aan te passen."
      : "Je kijkt naar t = " + fmtTime(sim.sweep.t[ui.frame]) + ". Waarden aanpassen kan op t = 0.") + "</span>" +
      '<button class="btn" type="button">\u23EE Naar t = 0</button>';
    note.querySelector("button").addEventListener("click", toT0);
    props.prepend(note);
  }
}

function buildInspector() {
  const stSel = document.getElementById("stSel");
  if (!ui.sel) {
    props.innerHTML = '<p class="empty">Selecteer een punt of element op het canvas.</p>';
    stSel.textContent = "geen"; return;
  }
  if (ui.sel.kind === "node") {
    const n = N(ui.sel.id);
    if (!n) { ui.sel = null; return buildInspector(); }
    stSel.textContent = "punt " + n.name;
    props.innerHTML =
      kind(ui.C.ink, "Punt " + n.name) +
      '<div class="row"><label for="pnm">Naam <span class="unit">in formules</span></label>' +
      '<input type="text" id="pnm" maxlength="8" value="' + n.name + '"></div>' +
      numRow("px", "x", n.x, "mm", .1) +
      numRow("py", "y", n.y, "mm", .1) +
      '<div class="row" style="grid-template-columns:1fr;margin-top:10px"><label>Oplegging</label></div>' +
      '<div class="seg" id="supSeg">' +
        segBtn("free", "Vrij", n.support) +
        segBtn("pin", "Scharnier", n.support) +
        segBtn("slider", "Glijder", n.support) +
      '</div>' +
      (n.support === "slider" ? numRow("pdir", "Richting glijbaan", n.dir, "°", 1) : "") +
      numRow("pm", "Puntmassa", n.m, "kg", .1) +
      (fricApplies(n) ? '<div class="row" style="grid-template-columns:1fr;margin-top:12px"><label><b>Wrijving</b> ' +
        '<span class="unit">' + (n.support === "slider" ? "in de glijbaan en het scharnier" : "in het scharnier") + '</span></label></div>' +
        numRow("pmus", "\u03bc statisch", n.mus || 0, "\u2013", .01) +
        numRow("pmuk", "\u03bc dynamisch", n.muk || 0, "\u2013", .01) +
        numRow("prj", "Penstraal", n.rj > 0 ? n.rj : 5, "mm", .5) +
        '<p class="empty" style="margin:2px 0 0">Werkt in Dynamisch en Evenwicht, en als extra kracht in Kinematisch. ' +
        'Instellingen \u2192 Wrijving regelt de overgang tussen plakken en glijden.</p>' : "");
    const nmEl = document.getElementById("pnm");
    const nmCommit = () => {
      const v = nmEl.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 8);
      if (!v || /^[0-9]/.test(v)) { nmEl.value = n.name; return; }
      if (model.nodes.some(o => o !== n && o.name === v)) { flash("Die naam is al in gebruik."); nmEl.value = n.name; return; }
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
    return;
  }

  const e = E(ui.sel.id);
  if (!e) { ui.sel = null; return buildInspector(); }

  if (e.type === "link") {
    stSel.textContent = "schakel";
    if (e.driver && e.theta0 === undefined) e.theta0 = crankAngle(e);
    if (e.driver && e.rpm === undefined) e.rpm = 60;
    props.innerHTML =
      kind(e.driver ? ui.C.driver : ui.C.ink, e.driver ? "Kruk (aandrijving)" : "Stijve schakel") +
      '<p class="empty" style="margin:-4px 0 10px">' + N(e.a).name + " → " + N(e.b).name + '</p>' +
      numRow("el", "Lengte", e.len, "mm", .1) +
      (e.driver ? (
        numRow("eth", "Beginhoek θ₀", e.theta0, "°", 5) +
        '<div class="row"><label>Hoek nu</label><span class="val" id="ethNow" data-e="' + e.id +
          '" style="font-family:\'IBM Plex Mono\',monospace;font-size:12.5px">' +
          Math.round(e.theta || 0) + '°</span></div>' +
        numRow("erpm", "Toerental", e.rpm, "rpm", 5) +
        '<div class="row" style="grid-template-columns:1fr;margin-top:4px"><label>Draairichting</label></div>' +
        '<div class="seg" id="dirSeg">' +
          '<button type="button" data-v="ccw" aria-pressed="' + (e.cw !== true) + '">Linksom</button>' +
          '<button type="button" data-v="cw" aria-pressed="' + (e.cw === true) + '">Rechtsom</button>' +
        '</div>'
      ) : "") +
      '<button class="btn" id="drvBtn" style="width:100%;margin-top:10px">' +
        (e.driver ? "Aandrijving verwijderen" : "Maak dit de kruk") + '</button>' +
      (e.driver ? '<p class="empty" style="margin-top:8px">Draaipunt ' + N(e.a).name +
        '. ω = ' + fmt(Math.abs(e.rpm) * 6) + ' °/s. Meerdere krukken mogen — ' +
        'de tijdas beslaat één omwenteling van de langzaamste.</p>' : "");

    bindNum("el", v => {
      e.len = Math.max(.1, v);
      if (e.driver) placeAt(sim.sweep ? sim.sweep.t[ui.frame] : 0);
      else relax();                      // andere stangen houden hun lengte
    });
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
    stSel.textContent = "actuator";
    const lo = Math.min(e.min, e.max), hi = Math.max(e.min, e.max);
    props.innerHTML =
      kind(ui.C.driver, "Lineaire actuator") +
      '<p class="empty" style="margin:-4px 0 10px">' + N(e.a).name + " \u2194 " + N(e.b).name + '</p>' +
      numRow("al", "Lengte op t = 0", e.len, "mm", .5) +
      numRow("amin", "Kortst", e.min, "mm", 1) +
      numRow("amax", "Langst", e.max, "mm", 1) +
      numRow("af", "Frequentie", e.freq, "Hz", .1) +
      '<p class="empty" style="margin-top:8px">Slag ' + fmt(hi - lo) + ' mm, periode ' +
      (e.freq > 0 ? fmt(1 / e.freq) + " s" : "\u2013") + '. De lengte volgt een sinus tussen kortst en langst; ' +
      'op t = 0 begint hij bij de getekende lengte en schuift hij uit.' +
      (e.len < lo - 1e-6 || e.len > hi + 1e-6 ? ' <b style="color:var(--bad)">De getekende lengte ligt buiten het bereik.</b>' : "") + '</p>';
    bindNum("al", v => { e.len = Math.max(.1, v); relax(); });
    bindNum("amin", v => { e.min = Math.max(.1, v); });
    bindNum("amax", v => { e.max = Math.max(.1, v); });
    bindNum("af", v => { e.freq = Math.max(0, v); });
    return;
  }

  if (e.type === "gap") {
    stSel.textContent = "speling";
    const lo = Math.min(e.min, e.max), hi = Math.max(e.min, e.max), Lnow = dist(N(e.a), N(e.b));
    props.innerHTML =
      kind(ui.C.ink2, "Lineaire speling") +
      '<p class="empty" style="margin:-4px 0 10px">' + N(e.a).name + " \u2194 " + N(e.b).name + '</p>' +
      numRow("gmin", "Kortst", e.min, "mm", .5) +
      numRow("gmax", "Langst", e.max, "mm", .5) +
      numRow("gk", "Stijfheid aanslag", e.kc, "N/mm", 5) +
      numRow("gc", "Demping aanslag", e.cc, "Ns/mm", .01) +
      '<p class="empty" style="margin-top:8px">Nu ' + fmt(Lnow) + ' mm \u2014 ' +
      (Lnow < lo ? "tegen de korte aanslag" : Lnow > hi ? "tegen de lange aanslag" : "vrij, " + fmt(hi - lo) + " mm speling") +
      '. Tussen kortst en langst geeft hij geen kracht; daarbuiten een veer met demping. ' +
      'Een stijvere aanslag vraagt een kleinere tijdstap. In Kinematisch telt hij alleen als kracht mee.</p>';
    bindNum("gmin", v => { e.min = Math.max(0, v); });
    bindNum("gmax", v => { e.max = Math.max(0, v); });
    bindNum("gk", v => { e.kc = Math.max(0, v); });
    bindNum("gc", v => { e.cc = Math.max(0, v); });
    return;
  }

  if (e.type === "contact") {
    stSel.textContent = "contact";
    const P = N(e.node);
    const opts = cur => Object.keys(MATERIALS).map(k => '<option value="' + k + '"' + (k === cur ? " selected" : "") + ">" + MATERIALS[k].nm + "</option>").join("");
    const selRow = (id, lab, cur) => '<div class="row"><label for="' + id + '">' + lab + '</label><select id="' + id + '">' + opts(cur) + "</select></div>";
    props.innerHTML =
      kind(ui.C.ink2, "Contact bal \u2013 vlak") +
      '<p class="empty" style="margin:-4px 0 10px">Bal op punt ' + P.name + '</p>' +
      numRow("cr", "Straal bal R", e.R, "mm", .5) +
      selRow("cm1", "Materiaal bal", e.m1) + selRow("cm2", "Materiaal vlak", e.m2) +
      numRow("cmu", "Wrijving \u03bc", e.mu, "", .01) +
      numRow("cchi", "Normale demping \u03c7", e.chi, "s/mm", .005) +
      numRow("cang", "Hoek vlak", e.ang, "\u00b0", 5) +
      numRow("cax", "Vlak door x", e.ax, "mm", 1) + numRow("cay", "Vlak door y", e.ay, "mm", 1) +
      '<p class="empty" style="margin:10px 0 0"><b>Nu</b></p>' +
      '<p class="empty" id="ctLive" data-e="' + e.id + '" style="margin-top:2px">' + contactLive(e) + '</p>' +
      '<p class="empty" style="margin-top:8px">De bal kan alleen duwen (geen kracht als hij loskomt). Normaal: Hertz, F\u2099 = 4/3\u00b7E*\u00b7\u221aR\u00b7\u03b4<sup>3/2</sup>. ' +
      'Tangentiaal: een veer k\u209c = 8\u00b7G*\u00b7a die plakt tot \u03bc\u00b7F\u2099 en dan slipt (hysterese). ' +
      'Werkt in Dynamisch en Evenwicht; in Kinematisch alleen als normaalkracht. Een stijf contact vraagt een kleine tijdstap (\u2248 0,2 ms of minder).</p>';
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
    stSel.textContent = "flexure";
    const sel = (id, lab, opts, cur) => '<div class="row"><label for="' + id + '">' + lab + '</label><select id="' + id + '">' +
      opts.map(o => '<option value="' + o[0] + '"' + (o[0] === cur ? " selected" : "") + ">" + o[1] + "</option>").join("") + "</select></div>";
    const refs = flexRefs(e), cant = e.kind === "cantilever";
    props.innerHTML =
      kind(ui.C.ink2, "Flexure (PRBM)") +
      '<p class="empty" style="margin:-4px 0 10px">Scharnier in ' + N(e.a).name + ", schakel naar " + N(e.b).name + '</p>' +
      sel("fk", "Type", Object.keys(FLEX_KINDS).map(k => [k, FLEX_KINDS[k]]), e.kind) +
      numRow("fL", cant ? "Bladlengte L" : "Lengte bladen L", e.L, "mm", 1) +
      numRow("fwd", "Breedte b", e.wd, "mm", .5) +
      numRow("ft", "Dikte t", e.t, "mm", .01) +
      (e.kind === "notch" ? numRow("fR", "Inkepingsstraal R", e.R, "mm", .1) + numRow("fKt", "Spanningsconc. K\u209c", e.Kt, "\u2013", .1) : "") +
      sel("fm", "Materiaal", CALC_MATERIALS.map(m => [m.id, m.naam]), e.mat) +
      numRow("fsig", "\u03c3 toelaatbaar (0 = materiaal)", e.sig || 0, "MPa", 10) +
      numRow("fpre", "Voorspanning", e.pre || 0, "\u00b0", .1) +
      sel("fref", "Draait ten opzichte van", [["", "de grond"]].concat(refs.map(r => [r.id, "schakel " + N(r.a).name + N(r.b).name])), e.ref || "") +
      '<p class="empty" style="margin:10px 0 0"><b>Nu</b></p>' +
      '<p class="empty" id="fxLive" data-e="' + e.id + '" style="margin-top:2px">' + flexLive(e) + '</p>' +
      '<p class="empty" style="margin-top:8px">' + (cant
        ? "Pseudo-starre-lichaammodel (Howell): het karakteristieke scharnier ligt op " + nl(fmt((1 - GAMMA) * e.L)) + " mm van de inklemming (a); de getekende schakel is \u03b3\u00b7L = " + nl(fmt(GAMMA * e.L)) + " mm lang. Teken a dus op die plek, niet op de inklemming zelf. "
        : "Het scharnier draait om punt a; de getekende schakel hoeft niet even lang te zijn als het blad. ") +
      "De draaiveer werkt in Dynamisch, Evenwicht en FRF. In Kinematisch telt de stijfheid niet mee (puur scharnier), maar de spanning wel.</p>";
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

  if (e.type === "spring") {
    stSel.textContent = "veer";
    props.innerHTML =
      kind(ui.C.spring, "Veer") +
      '<p class="empty" style="margin:-4px 0 10px">' + N(e.a).name + " – " + N(e.b).name + '</p>' +
      numRow("sk", "Stijfheid k", e.k, "N/mm", .1) +
      numRow("sl", "Rustlengte L₀", e.L0, "mm", .5) +
      '<p class="empty" style="margin-top:8px">Huidige lengte ' + fmt(dist(N(e.a), N(e.b))) +
      ' mm. Veerkracht volgt straks uit de kinematica — geen tijdsintegratie nodig.</p>';
    bindNum("sk", v => { e.k = Math.max(0, v); });
    bindNum("sl", v => { e.L0 = Math.max(0, v); });
    return;
  }

  if (e.type === "damper") {
    stSel.textContent = "demper";
    props.innerHTML =
      kind(ui.C.ink2, "Demper") +
      '<p class="empty" style="margin:-4px 0 10px">' + N(e.a).name + " – " + N(e.b).name + '</p>' +
      numRow("dc", "Dempingsconstante c", e.c, "Ns/mm", .01) +
      '<p class="empty" style="margin-top:8px">Dempkracht volgt uit de exacte snelheid van beide punten.</p>';
    bindNum("dc", v => { e.c = Math.max(0, v); });
    return;
  }

  if (e.type === "force") {
    stSel.textContent = "kracht";
    props.innerHTML =
      kind(ui.C.force, "Kracht op " + N(e.node).name) +
      numRow("fm", "Grootte", e.mag, "N", 1) +
      numRow("fa", "Richting", e.ang, "°", 5) +
      '<p class="empty" style="margin-top:8px">0° is +x, 90° is +y. De pijl wijst naar het aangrijpingspunt.</p>';
    bindNum("fm", v => { e.mag = v; });
    bindNum("fa", v => { e.ang = v; });
  }
}

// live uitlezing van een contact: statisch uit de stand, plak/slip uit de laatste dynamica
function contactLive(e) {
  const P = N(e.node), f = cFrame(e, P), h = hertz(e, f.delta), st = liveContact(e);
  const Fn = st ? st.Fn : h.Fn;
  const state = st ? (st.open ? "los" : st.slip ? "slip" : "plakt") : f.delta > 0 ? "in contact (statisch)" : "los";
  return "F\u2099 <b>" + fmt(Fn) + "</b> N \u00b7 \u03b4 <b>" + fmt(Math.max(0, f.delta) * 1000) + "</b> \u00b5m \u00b7 a <b>" +
    fmt(h.a) + "</b> mm<br>k\u2099 <b>" + fmt(h.kn) + "</b> N/mm \u00b7 k\u209c <b>" + fmt(h.kt) + "</b> N/mm<br>Toestand: <b>" + state +
    "</b>" + (st && !st.open ? " \u00b7 F\u209c " + fmt(st.Ft) + " N" : "");
}
export function syncContactLive() {
  const el = document.getElementById("ctLive");
  if (el) { const e = E(el.dataset.e); if (e && e.type === "contact" && N(e.node)) el.innerHTML = contactLive(e); }
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
    '<span style="' + (warn ? "color:var(--driver);font-weight:600" : "") + '">\u03c3 <b>' + fmt(st.sigma) + "</b> MPa van " + fmt(st.allow) + " MPa (" + fmt(st.ratio * 100) + " %)" +
    (warn ? " \u2014 boven de toelaatbare spanning" : "") + "</span><br>\u03c6 maximaal <b>" + fmt(st.phiMax * 180 / Math.PI) + "</b>\u00b0 bij \u03c3 toelaatbaar" +
    (sim.sweep && sim.sweep.FX ? "" : " \u00b7 nog geen doorgerekende beweging");
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
function numRow(id, lab, val, unit, step) {
  return '<div class="row"><label for="' + id + '">' + lab + ' <span class="unit">' + unit + '</span></label>' +
    '<input type="number" id="' + id + '" step="' + step + '" value="' + (Math.round(val * 1000) / 1000) + '"></div>';
}
// Commit on Enter or when the field loses focus — not on every keystroke,
// so a half-typed number never triggers a recompute.
function bindNum(id, fn) {
  const el = document.getElementById(id); if (!el) return;
  const commit = () => {
    const v = parseFloat(el.value);
    if (!isFinite(v)) { el.value = el.dataset.last || el.value; return; }
    if (!atT0()) { el.value = el.dataset.last; lockNudge(); return; }
    el.dataset.last = v;
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
