// Modus Stijfheid: oplossen bij een wijziging, uitleesblok, lade met tabellen, vergroting en eigenvormen.
import { isBeam } from "../core/axial.js";
import { N } from "../core/elements.js";
import { analyticChecks, computeModes, effectiveScale, solveStiffness } from "../core/stiffness.js";
import { model, sim, ui } from "../core/state.js";
import { draw } from "./draw.js";
import { REL_FE, colUnit, fmtAngle, fmtHz, fmtLen, fmtMoment, fmtQ, fmtStiff, fmtStress, numStr, scaleOf, sg } from "./format.js";
import { save } from "./persist.js";
import { touched } from "./solver.js";
import { drawPathPlot, pathSelect, renderPathCtl } from "./stiffpath.js";
import { t } from "./i18n.js";

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const fscale = v => "×" + sg(v, v >= 100 ? 3 : 2);

let eigenTimer = 0;
export function solveStiff() {
  clearTimeout(eigenTimer);
  const res = solveStiffness();
  res.modes = null; res.modesMsg = ""; res.analytic = analyticChecks(res, null);
  sim.stiff = res; sim.stiffGen++;
  ui.stiffMode = -1;
  if (res.ok) {
    const gen = sim.stiffGen;
    eigenTimer = setTimeout(() => {                   // eigenfrequenties pas als de statica staat: niet tijdens het slepen
      if (sim.stiffGen !== gen || sim.stiff !== res) return;
      try {
        const r = computeModes(res, 6);
        res.modes = r.modes; res.modesMsg = r.msg;
        res.analytic = analyticChecks(res, r.modes);
      } catch (err) { console.error(err); res.modes = []; res.modesMsg = t("sf.modesfail"); }
      renderStiffUI(); draw();
    }, 60);
  }
  renderStiffUI();
  return res;
}

export function stiffMessage() {
  const R = sim.stiff;
  if (!R) return "";
  if (R.empty) return t("sf.empty");
  if (!R.ok) return R.mech.text;
  if (ui.stiffMode >= 0 && R.modes && R.modes[ui.stiffMode]) return t("sf.msg.mode", { n: ui.stiffMode + 1, f: fmtHz(R.modes[ui.stiffMode].f) });
  return t("sf.msg.static") + (R.modes && R.modes.length ? " · " + t("sf.msg.pick") : "") + " · " + t("sf.msg.space");
}

/* ---------- uitleesblok in het Resultaat ---------- */
function nodeName(id) { const n = N(id); return n ? n.name : "?"; }
function elemName(e) { return N(e.a) && N(e.b) ? N(e.a).name + N(e.b).name : "?"; }
function pointNode() {
  const ok = model.nodes.find(n => n.id === model.stiffNode);
  if (ok) return ok;
  const f = model.elems.find(e => e.type === "force" && N(e.node));
  return (f && N(f.node)) || model.nodes[model.nodes.length - 1] || null;
}
function boxHtml(res) {
  if (res.empty) return "<h2>" + t("tab.stiffsect") + "</h2><p class=\"ana\">" + esc(stiffMessage()) + "</p>";
  if (!res.ok) {
    return "<h2>" + t("tab.stiffsect") + "</h2><div class=\"bad\">" + esc(res.mech.text) + "</div>" +
      "<p class=\"ana\">" + t("sf.singular") + "</p>";
  }
  let h = "<h2>" + t("tab.stiffsect") + "</h2>";
  const ms = res.sigMax;
  if (ms) {
    const e = ms.e, bm = isBeam(e), rec = res.members.find(m => m.e === e), L = rec ? rec.L : 0;
    h += '<div class="thres">' + t("sf.maxstress") + " <b>" + fmtStress(ms.val) + "</b> = <b>" + sg(ms.ratio * 100, 2) + " %</b> " + t("sf.of") + " σ<sub>" + t("sf.allow") + "</sub>" +
      (ms.ratio > 1 ? ' <span class="warn">' + t("sf.above") + "</span>" : "") +
      "<br>" + t(bm ? "sf.in.beam" : e.type === "flexure" ? "sf.in.flex" : "sf.in.bar", { p: esc(elemName(e)) }) + (bm ? " " + t("sf.at", { len: fmtLen(ms.frac * L), n: esc(nodeName(e.a)) }) : "") + "</div>";
  } else h += '<div class="thres">' + t("sf.nostress") + "</div>";
  let big = null;
  res.nodes.forEach(d => { const m = Math.hypot(d.ux, d.uy); if (!big || m > big.m) big = { m, d }; });
  h += '<div class="thres">' + t("sf.maxdisp") + " <b>" + fmtLen(big ? big.m : 0) + "</b>" + (big && big.m > 0 ? " " + t("sf.atpoint", { n: esc(big.d.name) }) : "") + "</div>";
  // stijfheid in een punt
  const nd = pointNode(), ang = isFinite(model.stiffAng) ? model.stiffAng : 90;
  if (nd) {
    const pk = res.pointK(nd.id, ang);
    h += "<h3>" + t("sf.kpoint") + "</h3>" +
      '<div class="row"><label for="skNode">' + t("th.point") + '</label><select id="skNode">' + model.nodes.map(n => '<option value="' + n.id + '"' + (n.id === nd.id ? " selected" : "") + ">" + esc(n.name) + "</option>").join("") + "</select></div>" +
      '<div class="row"><label for="skAng">' + t("sf.dir") + ' <span class="unit">' + t("sf.dir.unit") + '</span></label><input type="text" inputmode="decimal" autocomplete="off" id="skAng" step="15" value="' + (Math.round(ang * 100) / 100) + '"></div>' +
      (pk && isFinite(pk.k)
        ? '<div class="big" id="skVal">k = ' + fmtStiff(pk.k) + '</div><div class="ana" id="skCmp">' + t("sf.compl") + " 1/k = " + fmtQ(pk.compliance, "len") + "/N</div>"
        : '<div class="big" id="skVal">k = ∞</div><div class="ana" id="skCmp">' + t("sf.fixed") + "</div>");
  }
  // analytische controle
  if (res.analytic && res.analytic.length) {
    h += "<h3>" + t("sf.analytic") + "</h3>";
    for (const a of res.analytic) {
      h += '<div class="ana"><b>' + esc(a.title) + "</b>";
      for (const r of a.rows) {
        const an = r.an * r.f, fe = r.fe * r.f, d = Math.abs(an) > 0 ? (fe - an) / an * 100 : 0, ad = Math.abs(d);
        h += "<br>" + esc(r.k) + ": " + t("sf.analytical") + " <b>" + sg(an, 4) + "</b> " + r.unit + " · FE <b>" + sg(fe, 4) + "</b> " + r.unit +
          " <span class=\"" + (ad < 1 ? "ok" : "warn") + '">(' + (ad < 5e-5 ? t("sf.diff0") : (d >= 0 ? "+" : "−") + sg(ad, 3)) + " %)</span>";
      }
      h += "</div>";
    }
  }
  // waarschuwingen
  const span = (() => { let mn = Infinity, mx = -Infinity; model.nodes.forEach(n => { mn = Math.min(mn, n.x, n.y); mx = Math.max(mx, n.x, n.y); }); return Math.max(mx - mn, 20); })();
  if (res.maxDisp > 0.1 * span) h += '<div class="ana warn">' + t("sf.bigdisp") + "</div>";
  if (res.sys.mem.some(m => m.rigid)) h += '<div class="ana">' + t("sf.penalty") + "</div>";
  return h;
}

function renderBox(res) {
  const box = document.getElementById("stiffBox"); if (!box) return;
  box.innerHTML = boxHtml(res);
  const sel = document.getElementById("skNode"), ang = document.getElementById("skAng");
  if (sel) sel.addEventListener("change", () => { model.stiffNode = sel.value; touched(); renderStiffUI(); });
  if (ang) {
    const commit = () => {
      const v = parseFloat(String(ang.value).replace(",", "."));
      if (!isFinite(v)) { ang.value = model.stiffAng; return; }
      model.stiffAng = v; touched(); renderStiffUI();
    };
    ang.addEventListener("change", commit);
    ang.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); commit(); ang.blur(); } });
  }
}

/* ---------- lade: verplaatsingen, reacties en balken ---------- */
function renderTab(res) {
  const tab = document.getElementById("stiffTab"); if (!tab) return;
  if (!res || !res.ok) { tab.innerHTML = '<div><h3>' + t("sf.disp") + '</h3><p class="empty">' + esc(res ? stiffMessage() : t("sf.nosol")) + "</p></div>"; return; }
  tab.innerHTML = tablesHtml(res);
}
// de tabellen met verplaatsingen, reacties en balken (ook voor het rekenblad)
export function tablesHtml(res) {
  const nds = Array.from(res.nodes.values());
  const lu = colUnit(nds.map(d => d.ux).concat(nds.map(d => d.uy)), "len");      // één lengte-eenheid voor ux en uy
  const ct = colUnit(nds.map(d => d.th).filter(v => !Number.isNaN(v)), "angle");
  const disp = ['<h3>' + t("sf.disp") + '</h3><table><tr><th>' + t("th.point") + '</th><th>u<sub>x</sub> (' + lu.u + ')</th><th>u<sub>y</sub> (' + lu.u + ')</th><th>φ (' + ct.u + ')</th></tr>'];
  res.nodes.forEach(d => { disp.push("<tr><td>" + esc(d.name) + "</td><td>" + lu.s(d.ux) + "</td><td>" + lu.s(d.uy) + "</td><td>" + (Number.isNaN(d.th) ? "–" : ct.s(d.th)) + "</td></tr>"); });
  disp.push("</table>");
  let reac = "";
  if (res.reactions.length) {
    const rf = colUnit(res.reactions.reduce((a, r) => a.concat([r.Rx, r.Ry]), []), "force", REL_FE);
    const rm = colUnit(res.reactions.filter(r => r.clamp).map(r => r.Mz / 1000), "moment", REL_FE);
    reac = '<h3>' + t("sf.reactions") + '</h3><table><tr><th>' + t("th.point") + '</th><th>R<sub>x</sub> (' + rf.u + ')</th><th>R<sub>y</sub> (' + rf.u + ')</th><th>M (' + rm.u + ')</th></tr>' +
      res.reactions.map(r => "<tr><td>" + esc(r.name) + "</td><td>" + rf.s(r.Rx) + "</td><td>" + rf.s(r.Ry) + "</td><td>" + (r.clamp ? rm.s(r.Mz / 1000) : "–") + "</td></tr>").join("") + "</table>";
  }
  const rows = res.members.filter(m => m.kind === "beam" || m.kind === "axial" || m.kind === "flex");
  let bars = "";
  if (rows.length) {
    const bN = colUnit(rows.filter(m => m.kind !== "flex").map(m => m.NN), "force");
    const bM = colUnit(rows.map(m => m.kind === "beam" ? m.Mmax / 1000 : m.kind === "flex" ? m.Mf / 1000 : NaN), "moment");
    const bS = colUnit(rows.map(m => m.sigMax), "stress");
    bars = '<h3>' + t("sf.bars") + '</h3><table><tr><th>' + t("sf.element") + '</th><th>N (' + bN.u + ')</th><th>M<sub>max</sub> (' + bM.u + ')</th><th>σ<sub>max</sub> (' + bS.u + ')</th><th>σ/σ<sub>' + t("sf.allow") + '</sub></th></tr>' +
      rows.map(m => "<tr><td>" + esc(elemName(m.e)) + "</td><td>" + (m.kind === "flex" ? "–" : bN.s(m.NN)) + "</td><td>" +
        (m.kind === "beam" ? bM.s(m.Mmax / 1000) : m.kind === "flex" ? bM.s(m.Mf / 1000) : "–") + "</td><td>" + bS.s(m.sigMax) + "</td><td>" + sg(m.ratio * 100, 2) + " %</td></tr>").join("") + "</table>";
  }
  return "<div>" + disp.join("") + "</div><div>" + reac + bars + "</div>";
}
// het uitleesblok als vaste tekst (zonder keuzelijst en invoerveld), voor het rekenblad
export function stiffKeyHtml(res) {
  const d = document.createElement("div");
  d.innerHTML = boxHtml(res);
  const sel = d.querySelector("#skNode"), ang = d.querySelector("#skAng");
  if (sel) { const r = sel.closest(".row"); const n = model.nodes.find(x => x.id === sel.value); r.outerHTML = "<div>" + t("th.point") + ": <b>" + esc(n ? n.name : "?") + "</b></div>"; }
  if (ang) { const r = ang.closest(".row"); r.outerHTML = "<div>" + t("sf.dir") + ": <b>" + sg(parseFloat(ang.value)) + "\u00b0</b> (0 = +x, 90 = +y)</div>"; }
  return d.innerHTML;
}

/* ---------- balk onder het canvas: vergroting en modes ---------- */
function renderBar(res) {
  const bar = document.getElementById("stiffBar"); if (!bar) return;
  const on = model.mode === "stiff" && res && res.ok;
  bar.hidden = !on;
  if (!on) return;
  const sc = document.getElementById("stiffSc"), auto = document.getElementById("stiffAuto"), mag = document.getElementById("stiffMag");
  const eff = effectiveScale(res), inMode = ui.stiffMode >= 0;
  if (document.activeElement !== sc) sc.value = Math.log10(Math.max(1, eff));
  auto.checked = !(model.stiffScale > 0);
  sc.disabled = inMode; auto.disabled = inMode;
  mag.textContent = inMode ? t("sf.shape") : fscale(eff);
  const ms = res.modes || [];
  const chips = ['<button class="chip' + (ui.stiffMode < 0 ? " on" : "") + '" data-m="-1" title="' + t("sf.static.tip") + '">' + t("sf.static") + '</button>']
    .concat(ms.map((m, i) => '<button class="chip' + (ui.stiffMode === i ? " on" : "") + '" data-m="' + i + '" title="' + t("sf.msg.modeshort", { n: i + 1 }) + '">' + t("pb.mode") + " " + (i + 1) + " · " +
      fmtHz(m.f) + "</button>")).join("");
  const key = chips + "|" + (res.modes ? 1 : 0);
  const ce = document.getElementById("stiffChips");
  if (ce.__k !== key) { ce.__k = key; ce.innerHTML = chips; }
  document.getElementById("stiffOut").textContent = !res.modes ? t("sf.calcmodes") : !ms.length ? (res.modesMsg || t("sf.nomodes")) : inMode ? t("sf.norm") : "";
  const tm = document.getElementById("tmsg"); if (tm) { tm.textContent = stiffMessage(); tm.hidden = true; }
  document.getElementById("stiffSum").textContent = inMode && ms[ui.stiffMode] ? t("pb.mode") + " " + (ui.stiffMode + 1) + " \u00b7 " + fmtHz(ms[ui.stiffMode].f) + " \u00b7 " + t("sf.shapemag") : t("sf.static") + " \u00b7 " + fscale(eff);
  document.getElementById("playBtn").title = stiffMessage();
}

export function renderStiffUI() {
  const on = model.mode === "stiff", res = sim.stiff;
  const drawer = document.getElementById("drawer"), box = document.getElementById("stiffBox"), sect = document.getElementById("stiffSect"), tab = document.getElementById("stiffTab");
  if (!box) return;
  drawer.classList.toggle("stiffmode", on);
  const h2 = drawer.querySelector(".drawer-head h2"); if (h2) h2.textContent = on ? t("sf.dispreac") : t("drawer.title");
  sect.hidden = !on; tab.hidden = !on; box.hidden = !on;
  const th = document.getElementById("thermSect"); if (th) th.hidden = on;
  const pad = on && ui.stiffView === "pad";
  drawer.classList.toggle("pathview", pad);
  const sv = document.getElementById("stiffView");
  if (sv) { sv.hidden = !on; sv.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === (pad ? "pad" : "tab")))); }
  tab.hidden = !on || pad;
  if (!on) { renderBar(null); renderPathCtl(); return; }
  if (res) { renderBox(res); renderTab(res); }
  renderBar(res);
  renderPathCtl();
  if (pad) requestAnimationFrame(drawPathPlot);
}

// selectie van een punt wordt het punt voor "stijfheid in punt"
export function stiffSelect() {
  pathSelect();
  if (model.mode !== "stiff" || !ui.sel || ui.sel.kind !== "node" || model.stiffNode === ui.sel.id) return;
  model.stiffNode = ui.sel.id; renderStiffUI();
}

export function initStiff() {
  const sc = document.getElementById("stiffSc"), auto = document.getElementById("stiffAuto"), chips = document.getElementById("stiffChips");
  sc.addEventListener("input", () => {
    const v = Math.pow(10, parseFloat(sc.value));
    model.stiffScale = Math.max(1, +v.toPrecision(3));
    document.getElementById("stiffMag").textContent = fscale(model.stiffScale);
    auto.checked = false; draw(); save();
  });
  auto.addEventListener("change", () => {
    model.stiffScale = auto.checked ? 0 : Math.max(1, effectiveScale(sim.stiff));
    renderStiffUI(); draw(); save();
  });
  document.getElementById("stiffView").addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    ui.stiffView = b.dataset.v === "pad" ? "pad" : "tab";
    renderStiffUI(); draw();
  });
  const fold = document.getElementById("stiffFold"), bar = document.getElementById("stiffBar");
  fold.addEventListener("click", () => {
    const f = bar.classList.toggle("fold");
    fold.setAttribute("aria-expanded", String(!f));
  });
  chips.addEventListener("click", ev => {
    const b = ev.target.closest(".chip"); if (!b) return;
    ui.stiffMode = +b.dataset.m; ui.stiffAmp = 1;
    renderStiffUI(); draw();
  });
}
