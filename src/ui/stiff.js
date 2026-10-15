// Modus Stijfheid: oplossen bij een wijziging, uitleesblok, lade met tabellen, vergroting en eigenvormen.
import { isBeam } from "../core/axial.js";
import { N } from "../core/elements.js";
import { analyticChecks, computeModes, effectiveScale, solveStiffness } from "../core/stiffness.js";
import { model, sim, ui } from "../core/state.js";
import { draw } from "./draw.js";
import { sg } from "./format.js";
import { save } from "./persist.js";
import { touched } from "./solver.js";

const nl = s => String(s).replace(".", ",");
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const fscale = v => "×" + (v >= 100 ? nl(String(Math.round(v))) : sg(v, 2));
const um = v => sg(v * 1000);                // mm -> µm
const urad = v => sg(v * 1e6);               // rad -> µrad

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
      } catch (err) { console.error(err); res.modes = []; res.modesMsg = "Eigenfrequenties konden niet berekend worden."; }
      renderStiffUI(); draw();
    }, 60);
  }
  renderStiffUI();
  return res;
}

export function stiffMessage() {
  const R = sim.stiff;
  if (!R) return "";
  if (R.empty) return "Stijfheid: teken balken (stijfheid Volledig), axiale staven of veren, een oplegging en een kracht.";
  if (!R.ok) return R.mech.text;
  if (ui.stiffMode >= 0 && R.modes && R.modes[ui.stiffMode]) return "Eigenvorm " + (ui.stiffMode + 1) + " · " + sg(R.modes[ui.stiffMode].f) + " Hz · spatie animeert";
  return "Statische vervorming" + (R.modes && R.modes.length ? " · kies een mode onder het canvas" : "") + " · spatie animeert";
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
  if (res.empty) return "<h2>Stijfheid</h2><p class=\"ana\">" + esc(stiffMessage()) + "</p>";
  if (!res.ok) {
    return "<h2>Stijfheid</h2><div class=\"bad\">" + esc(res.mech.text) + "</div>" +
      "<p class=\"ana\">De stijfheidsmatrix is singulier: er is een beweging zonder tegenkracht. Controleer opleggingen, de verbinding in de punten " +
      "(Star, Scharnier, Torsieveer) en of elk punt door genoeg balken of staven wordt vastgehouden.</p>";
  }
  let h = "<h2>Stijfheid</h2>";
  const ms = res.sigMax;
  if (ms) {
    const e = ms.e, bm = isBeam(e), rec = res.members.find(m => m.e === e), L = rec ? rec.L : 0;
    h += '<div class="thres">Maximale spanning <b>' + sg(ms.val) + "</b> MPa = <b>" + sg(ms.ratio * 100, 2) + " %</b> van σ<sub>toel</sub>" +
      (ms.ratio > 1 ? ' <span class="warn">— boven de toelaatbare spanning</span>' : "") +
      "<br>in " + (bm ? "balk " : e.type === "flexure" ? "flexure " : "staaf ") + esc(elemName(e)) + (bm ? " op " + sg(ms.frac * L) + " mm van " + esc(nodeName(e.a)) : "") + "</div>";
  } else h += '<div class="thres">Geen spanning te berekenen: geen balken of axiale staven.</div>';
  let big = null;
  res.nodes.forEach(d => { const m = Math.hypot(d.ux, d.uy); if (!big || m > big.m) big = { m, d }; });
  h += '<div class="thres">Grootste verplaatsing <b>' + um(big ? big.m : 0) + "</b> µm" + (big && big.m > 0 ? " in punt " + esc(big.d.name) : "") + "</div>";
  // stijfheid in een punt
  const nd = pointNode(), ang = isFinite(model.stiffAng) ? model.stiffAng : 90;
  if (nd) {
    const pk = res.pointK(nd.id, ang);
    h += "<h3>Stijfheid in punt</h3>" +
      '<div class="row"><label for="skNode">Punt</label><select id="skNode">' + model.nodes.map(n => '<option value="' + n.id + '"' + (n.id === nd.id ? " selected" : "") + ">" + esc(n.name) + "</option>").join("") + "</select></div>" +
      '<div class="row"><label for="skAng">Richting <span class="unit">°, 0 = +x, 90 = +y</span></label><input type="number" id="skAng" step="15" value="' + (Math.round(ang * 100) / 100) + '"></div>' +
      (pk && isFinite(pk.k)
        ? '<div class="big" id="skVal">k = ' + sg(pk.k) + " N/mm = " + sg(pk.kUm) + " N/µm</div><div class=\"ana\" id=\"skCmp\">slapte 1/k = " + sg(pk.compliance * 1000) + " µm/N</div>"
        : '<div class="big" id="skVal">k = ∞</div><div class="ana" id="skCmp">het punt is in deze richting vast</div>');
  }
  // analytische controle
  if (res.analytic && res.analytic.length) {
    h += "<h3>Analytische controle</h3>";
    for (const a of res.analytic) {
      h += '<div class="ana"><b>' + esc(a.title) + "</b>";
      for (const r of a.rows) {
        const an = r.an * r.f, fe = r.fe * r.f, d = Math.abs(an) > 0 ? (fe - an) / an * 100 : 0, ad = Math.abs(d);
        h += "<br>" + esc(r.k) + ": analytisch <b>" + sg(an, 4) + "</b> " + r.unit + " · FE <b>" + sg(fe, 4) + "</b> " + r.unit +
          " <span class=\"" + (ad < 1 ? "ok" : "warn") + '">(' + (ad < 5e-5 ? "verschil 0,00" : (d >= 0 ? "+" : "−") + nl(ad.toFixed(ad < 0.01 ? 4 : 2))) + " %)</span>";
      }
      h += "</div>";
    }
  }
  // waarschuwingen
  const span = (() => { let mn = Infinity, mx = -Infinity; model.nodes.forEach(n => { mn = Math.min(mn, n.x, n.y); mx = Math.max(mx, n.x, n.y); }); return Math.max(mx - mn, 20); })();
  if (res.maxDisp > 0.1 * span) h += '<div class="ana warn">Let op: verplaatsingen groter dan 10 % van de afmeting. Lineaire theorie, dus de uitkomst is dan een schatting.</div>';
  if (res.sys.mem.some(m => m.rigid)) h += '<div class="ana">Stijve schakels rekenen als balk met EA en EI van 10<sup>5</sup>× de grootste elastische stijfheid (penalty).</div>';
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
  if (!res || !res.ok) { tab.innerHTML = '<div><h3>Verplaatsingen</h3><p class="empty">' + esc(res ? stiffMessage() : "Nog geen oplossing.") + "</p></div>"; return; }
  const disp = ['<h3>Verplaatsingen</h3><table><tr><th>Punt</th><th>u<sub>x</sub> (µm)</th><th>u<sub>y</sub> (µm)</th><th>φ (µrad)</th></tr>'];
  res.nodes.forEach(d => { disp.push("<tr><td>" + esc(d.name) + "</td><td>" + um(d.ux) + "</td><td>" + um(d.uy) + "</td><td>" + (Number.isNaN(d.th) ? "–" : urad(d.th)) + "</td></tr>"); });
  disp.push("</table>");
  let reac = "";
  if (res.reactions.length) {
    reac = '<h3>Reacties op de opleggingen</h3><table><tr><th>Punt</th><th>R<sub>x</sub> (N)</th><th>R<sub>y</sub> (N)</th><th>M (N·m)</th></tr>' +
      res.reactions.map(r => "<tr><td>" + esc(r.name) + "</td><td>" + sg(r.Rx) + "</td><td>" + sg(r.Ry) + "</td><td>" + (r.clamp ? sg(r.Mz / 1000) : "–") + "</td></tr>").join("") + "</table>";
  }
  const rows = res.members.filter(m => m.kind === "beam" || m.kind === "axial" || m.kind === "flex");
  let bars = "";
  if (rows.length) {
    bars = '<h3>Balken en staven</h3><table><tr><th>Element</th><th>N (N)</th><th>M<sub>max</sub> (N·m)</th><th>σ<sub>max</sub> (MPa)</th><th>σ/σ<sub>toel</sub></th></tr>' +
      rows.map(m => "<tr><td>" + esc(elemName(m.e)) + "</td><td>" + (m.kind === "flex" ? "–" : sg(m.NN)) + "</td><td>" +
        (m.kind === "beam" ? sg(m.Mmax / 1000) : m.kind === "flex" ? sg(m.Mf / 1000) : "–") + "</td><td>" + sg(m.sigMax) + "</td><td>" + sg(m.ratio * 100, 2) + " %</td></tr>").join("") + "</table>";
  }
  tab.innerHTML = "<div>" + disp.join("") + "</div><div>" + reac + bars + "</div>";
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
  mag.textContent = inMode ? "vorm" : fscale(eff);
  const ms = res.modes || [];
  const chips = ['<button class="chip' + (ui.stiffMode < 0 ? " on" : "") + '" data-m="-1" title="Vervorming door de belasting">Statisch</button>']
    .concat(ms.map((m, i) => '<button class="chip' + (ui.stiffMode === i ? " on" : "") + '" data-m="' + i + '" title="Eigenvorm ' + (i + 1) + '">Mode ' + (i + 1) + " · " +
      nl(m.f < 10 ? m.f.toPrecision(3) : m.f < 1000 ? m.f.toFixed(1) : m.f.toFixed(0)) + " Hz</button>")).join("");
  const key = chips + "|" + (res.modes ? 1 : 0);
  const ce = document.getElementById("stiffChips");
  if (ce.__k !== key) { ce.__k = key; ce.innerHTML = chips; }
  document.getElementById("stiffOut").textContent = !res.modes ? "eigenfrequenties worden berekend…" : !ms.length ? (res.modesMsg || "geen eigenfrequenties") : inMode ? "vorm genormeerd · animatie vertraagd" : "";
  const tm = document.getElementById("tmsg"); if (tm) tm.textContent = stiffMessage();
}

export function renderStiffUI() {
  const on = model.mode === "stiff", res = sim.stiff;
  const drawer = document.getElementById("drawer"), box = document.getElementById("stiffBox"), sect = document.getElementById("stiffSect"), tab = document.getElementById("stiffTab");
  if (!box) return;
  drawer.classList.toggle("stiffmode", on);
  const h2 = drawer.querySelector(".drawer-head h2"); if (h2) h2.textContent = on ? "Verplaatsingen en reacties" : "Metingen";
  sect.hidden = !on; tab.hidden = !on; box.hidden = !on;
  const th = document.getElementById("thermSect"); if (th) th.hidden = on;
  if (!on) { renderBar(null); return; }
  if (res) { renderBox(res); renderTab(res); }
  renderBar(res);
}

// selectie van een punt wordt het punt voor "stijfheid in punt"
export function stiffSelect() {
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
  chips.addEventListener("click", ev => {
    const b = ev.target.closest(".chip"); if (!b) return;
    ui.stiffMode = +b.dataset.m; ui.stiffAmp = 1;
    renderStiffUI(); draw();
  });
}
