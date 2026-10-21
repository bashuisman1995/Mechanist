// "How is this calculated?" tab: formulas, symbols and "with your numbers" for the current mode.
// Only HTML strings (sub/sup, CSS fractions); recomputes only when the input has changed.
// All text lives in lang/how.js (keys how.*); the formulas themselves stay language-neutral.
import { frame as cFrame, hertz, liveContact, mat as material } from "../core/contact.js";
import { alphaOf, axialA, axialE, axialK, dTOf, isAxial, isThermal, matOf, thermDL, thermLen } from "../core/axial.js";
import { actLen, E, N, curLen, isBar } from "../core/elements.js";
import { flexI, flexK, flexLivePhi, flexMat, flexStress, FLEX_KINDS, GAMMA, KTHETA } from "../core/flexure.js";
import { mobility } from "../core/kinematics.js";
import { encRes, loadcellDt, sensorLive, sensorMass, springK } from "../core/sensors.js";
import { thermalNode, thermalShift } from "../core/thermal.js";
import { beamSect, isBeam } from "../core/axial.js";
import { RIGID_FACTOR } from "../core/stiffness.js";
import { model, sim, ui } from "../core/state.js";
import { decimal, fmtHz, fmtLen, fmtStress, sg } from "./format.js";
import { lang, onLang, t } from "./i18n.js";

const T = (k, p) => t("how." + k, p);

// Sources: literature, not file names (edition notes are translated)
const REF = {
  nik: "Nikravesh, <i>Computer-Aided Analysis of Mechanical Systems</i> (Prentice Hall, 1988)",
  baum: "Baumgarte, <i>Stabilization of constraints and integrals of motion in dynamical systems</i>, Comput. Methods Appl. Mech. Eng. 1 (1972) 1–16",
  get ewins() { return T("ref.ewins"); },
  john: "Johnson, <i>Contact Mechanics</i> (Cambridge University Press, 1985)",
  howell: "Howell, <i>Compliant Mechanisms</i> (Wiley, 2001)",
  olsson: "Olsson, Åström, Canudas de Wit, Gäfvert, Lischinsky, <i>Friction models and friction compensation</i>, Eur. J. Control 4 (1998) 176–195",
  soem: "Soemers, <i>Design Principles for Precision Mechanisms</i> (T-Pointprint, 2010)",
  slocum: "Slocum, <i>Precision Machine Design</i> (Prentice Hall, 1992)",
  hunt: "Hunt &amp; Crossley, <i>Coefficient of restitution interpreted as damping in vibroimpact</i>, J. Appl. Mech. 42 (1975) 440–445",
  prz: "Przemieniecki, <i>Theory of Matrix Structural Analysis</i> (McGraw-Hill, 1968; Dover, 1985)",
  get roark() { return T("ref.roark"); },
  paros: "Paros &amp; Weisbord, <i>How to design flexure hinges</i>, Machine Design 37 (1965) 151–156"
};
const BA = 20, BB = 20;          // Baumgarte constants, equal to dynamics.js (1/s)
const VTOL = 0.5, ATOL = 50, CALM = 0.1;   // equilibrium criteria from dynamics.js (mm/s, mm/s², s)

/* ---------- small helpers ---------- */
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = (v, d = 3) => (v === undefined || v === null || !isFinite(v)) ? "–" : sg(v, d);
const hz = f => f === undefined || !isFinite(f) ? "–" : fmtHz(f);
const s_ = (b, i) => b + "<sub>" + i + "</sub>";
const sup = (b, i) => b + "<sup>" + i + "</sup>";
const fr = (n, d) => '<span class="fr"><span>' + n + "</span><span>" + d + "</span></span>";
const mat = rows => '<span class="mat">' + rows.map(r => "<span>" + r.map(c => "<i>" + c + "</i>").join("") + "</span>").join("") + "</span>";
const c = s => "<code>" + s + "</code>";
const dot = s => s + "̇", ddot = s => s + "̈";
const name = id => { const n = N(id); return n ? n.name || id : "?"; };
const onOff = b => T(b ? "on" : "off");
const kv = (k, v) => "<span>" + k + "</span> <b>" + v + "</b>";
const dampLive = () => [kv(T("v.visc"), num(model.cVisc || 0) + " Ns/mm"), kv(T("v.jd"), model.jointDamp ? num(model.cJoint) + " N·m·s" : onOff(false))];

// plain text for the copy button: convert fractions, sub and sup, strip the rest
function plain(h) {
  return h
    .replace(/<span class="fr"><span>(.*?)<\/span><span>(.*?)<\/span><\/span>/g, "($1)/($2)")
    .replace(/<sub>(.*?)<\/sub>/g, "_$1").replace(/<sup>(.*?)<\/sup>/g, "^$1")
    .replace(/<span class="mat">(.*?)<\/span><\/span>/g, m => m)   // matrix: cells with spaces
    .replace(/<\/i><i>/g, "  ").replace(/<\/span><span>/g, " ; ")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

let copies = [];                 // plain text per block, for the Copy buttons
function block(b) {
  const i = copies.length;
  const sec = (head, items, cls) => items && items.length
    ? '<div class="hw-h">' + head + "</div>" + (cls === "ul"
      ? "<ul>" + items.map(x => "<li>" + x + "</li>").join("") + "</ul>"
      : items.map(x => '<div class="hw-' + cls + '">' + x + "</div>").join(""))
    : "";
  const txt = [b.title, ""];
  const add = (head, items, f) => { if (items && items.length) { txt.push(head + ":"); items.forEach(x => txt.push("  " + (f ? f(x) : plain(x)))); txt.push(""); } };
  add(T("h.eq"), b.eq); add(T("h.sym"), b.sym, x => plain(x[0]) + " = " + plain(x[1]));
  add(T("h.live"), b.live); add(T("h.ass"), b.ass);
  if (b.src) txt.push(T("src") + plain(b.src));
  copies.push(txt.join("\n").replace(/\n{3,}/g, "\n\n").trim());
  return '<section class="hw-block"><div class="hw-top"><h3>' + b.title + "</h3>" +
    '<button type="button" class="hw-copy" data-i="' + i + '">' + T("copy") + "</button></div>" +
    sec(T("h.eq"), b.eq, "eq") +
    (b.sym && b.sym.length ? '<div class="hw-h">' + T("h.sym") + '</div><dl class="hw-sym">' +
      b.sym.map(x => "<dt>" + x[0] + "</dt><dd>" + x[1] + "</dd>").join("") + "</dl>" : "") +
    sec(T("h.live"), b.live, "live") + sec(T("h.ass"), b.ass, "ul") +
    (b.src ? '<div class="hw-src">' + T("src") + b.src + "</div>" : "") + "</section>";
}

/* ---------- content per mode ---------- */
function kinBlock() {
  const m = mobility();
  const v = m.drive ? m.dofDriven : m.dof;
  let res = 0;
  for (const e of model.elems) {
    if (!isBar(e) || !N(e.a) || !N(e.b)) continue;
    const A = N(e.a), B = N(e.b);
    res = Math.max(res, Math.abs(Math.hypot(A.x - B.x, A.y - B.y) - curLen(e)));
  }
  for (const n of model.nodes) if (n.support === "slider") {
    const th = n.dir * Math.PI / 180;
    res = Math.max(res, Math.abs((n.x - n.ax) * -Math.sin(th) + (n.y - n.ay) * Math.cos(th)));
  }
  const live = [
    kv(T("kin.l.points"), T("kin.l.pointsv", { n: m.nNodes, p: m.nPinned, f: m.nNodes - m.nPinned })),
    kv(T("kin.l.unknowns"), "2·" + (m.nNodes - m.nPinned) + " = " + m.unknowns),
    kv(T("kin.l.eqs"), T("kin.l.eqsv", { b: m.nLinks - m.nDead, s: m.nSliders, c: m.cons })),
    kv(T("v.dof"), m.unknowns + " − " + m.cons + " = " + m.dof),
  ];
  if (m.drive) live.push(kv(T("kin.l.driven"), T("kin.l.drivenv", { d: m.driver, a: m.acts, r: m.dofDriven })));
  live.push(kv(T("v.status"), v === 0 ? T("determinate") : v > 0 ? T("kin.l.under", { v }) : T("kin.l.over", { v: -v })));
  live.push(kv(T("kin.l.res"), num(res) + " mm" + (sim.solveOK === false ? T("kin.l.nosolve") : "")));
  live.push(kv(T("v.gravity"), model.gravity ? T("kin.l.gon", { g: decimal("9.81") }) : onOff(false)));
  return block({
    title: T("kin.title"),
    eq: [
      T("kin.eq.bar") + c("Φ<sub>i</sub> = |p − q|² − L<sub>i</sub>² = 0"),
      T("kin.eq.slider") + c("n·(p − a) = 0") + ", " + c("n = (−sin θ, cos θ)"),
      T("kin.eq.crank") + c("p = A + L·(cos θ, sin θ)") + ", " + c("θ = θ<sub>0</sub> + ωt"),
      T("kin.eq.pos") + c("J·Δq = −Φ") + ", " + c("Δq = Jᵀ(JJᵀ)⁻¹(−Φ)"),
      T("kin.eq.vel") + c("J·q̇ = −Φ<sub>t</sub>") + T("with") + c("2(p−q)·(v<sub>p</sub>−v<sub>q</sub>) = 0"),
      T("kin.eq.acc") + c("J·q̈ = γ") + T("with") + c("γ = −2|v<sub>p</sub>−v<sub>q</sub>|²"),
      T("kin.eq.force", { f: c("ΣF = m·a") }),
      T("kin.eq.grub") + c("DOF = 2·n<sub>" + T("kin.f.free") + "</sub> − (" + T("kin.f.bars") + " + " + T("kin.f.sliders") + ")")
    ],
    sym: [
      [c("q"), T("kin.sym.q")],
      [c("Φ"), T("kin.sym.phi")],
      [c("J"), T("kin.sym.j")],
      [c("L"), T("kin.sym.l")],
      [c("m, a"), T("kin.sym.ma")]
    ],
    live,
    ass: [T("kin.ass1"), T("kin.ass2"), T("kin.ass3")],
    src: T("kin.src", { ref: REF.nik })
  });
}

function dynBlocks() {
  const sw = sim.sweep && sim.sweep.dyn ? sim.sweep : null;
  const eq = model.durMode === "equil";
  const free = model.nodes.filter(n => n.support !== "pin").length, nq = 2 * free;
  const drv = model.elems.filter(e => e.type === "link" && e.driver && N(e.a) && N(e.b) && N(e.a).support === "pin" && N(e.b).support !== "pin").length;
  const bars = model.elems.filter(e => isBar(e) && !e.driver && N(e.a) && N(e.b) && !(N(e.a).support === "pin" && N(e.b).support === "pin")).length;
  const sl = model.nodes.filter(n => n.support === "slider").length;
  const nm = bars + sl + 2 * drv;
  const h0 = Math.max(1e-6, (model.dtStep || 0.2) / 1000);
  const dur = sw ? sw.dur : eq ? null : Math.max(0.01, model.simDur || 2);
  let sub = null, h = null;
  if (dur) { sub = Math.min(2000, Math.max(1, Math.ceil(dur / 360 / h0))); h = dur / 360 / sub; }
  const live = [
    kv(T("dyn.l.unk"), "2·" + free + " = " + nq),
    kv(T("dyn.l.cons"), T("dyn.l.consv", { b: bars, s: sl, d: drv, n: nm })),
    kv(T("v.dof"), nq + " − " + nm + " = " + (nq - nm) + (nq - nm < 0 ? T("dyn.l.over") : "")),
    kv(T("dyn.l.step"), sg(h0 * 1000) + " ms"),
    kv("Baumgarte α = β", BA + " 1/s"),
    kv(T("v.gravity"), onOff(model.gravity))
  ].concat(dampLive());
  if (dur) live.push(kv(T("dyn.l.dur"), T("dyn.l.durv", { d: num(dur, 3), m: eq && !sw ? T("max") : "", sub, h: num(h * 1000) })));
  if (sim.job) live.push(kv(T("v.status"), T("running")));
  else if (ui.dynStale) live.push(kv(T("v.status"), T("stale")));
  else if (!sw) live.push(kv(T("v.status"), T("notyet")));
  else {
    live.push(kv(T("dyn.l.rmax"), num(sw.Rmax) + " N"));
    live.push(kv(T("dyn.l.nmax"), num(sw.Nmax) + " N"));
  }
  const out = [block({
    title: eq ? T("dyn.title.eq") : T("dyn.title"),
    eq: [
      mat([["M", "Φ<sub>q</sub>ᵀ"], ["Φ<sub>q</sub>", "0"]]) + mat([["q̈"], ["λ"]]) + " = " +
        mat([["Q"], ["γ − 2α·Φ̇ − β²·Φ"]]),
      T("dyn.eq.cons", { f: c("Φ(q, t) = |p−q|² − L² = 0") }),
      T("dyn.eq.nforce") + c("N = 2L·λ"),
      T("dyn.eq.rk4", { f: c("y′ = (q̇, q̈)") }),
      T("dyn.eq.proj", { a: c("Φ = 0"), b: c("Φ<sub>q</sub>·q̇ = −Φ<sub>t</sub>") })
    ],
    sym: [
      [c("M"), T("dyn.sym.m")],
      [c("Q"), T("dyn.sym.q")],
      [c("Φ<sub>q</sub>"), T("dyn.sym.pq")],
      [c("λ"), T("dyn.sym.lam")],
      [c("γ"), T("dyn.sym.gam")],
      [c("α, β"), T("dyn.sym.ab", { a: BA, b: BB })]
    ],
    live,
    ass: [T("dyn.ass1"), T("dyn.ass2"), T("dyn.ass3")],
    src: T("dyn.src", { a: REF.nik, b: REF.baum })
  })];
  if (eq) {
    out.push(block({
      title: T("eqc.title"),
      eq: [
        T("eqc.eq1", { a: c("max|q̇| < " + decimal(VTOL) + " mm/s"), b: c("max|q̈| < " + ATOL + " mm/s²") }),
        T("eqc.eq2", { t: c("> " + decimal(CALM) + " s") }),
        T("eqc.eq3", { a: c("q̇ = 0, q̈ = 0"), b: c("Φ<sub>q</sub>ᵀλ = Q, Φ = 0") })
      ],
      sym: [[c("max|q̇|"), T("eqc.sym1")], [c("max|q̈|"), T("eqc.sym2")]],
      live: [
        kv(T("eqc.l.maxt"), num(model.maxT || 30) + " s"),
        kv(T("eqc.l.res"), sw && sw.settled ? T("eqc.l.settled", { t: num(sw.settled, 3) }) : sw ? T("eqc.l.nosettle") : T("notyet"))
      ],
      ass: [T("eqc.ass1"), T("eqc.ass2")],
      src: T("eqc.src", { ref: REF.nik, f: c("q̇ = 0, q̈ = 0") })
    }));
  }
  return out;
}

function frfBlock() {
  const sw = sim.sweep && sim.sweep.frf ? sim.sweep : null;
  const live = [];
  if (sim.job) live.push(kv(T("v.status"), T("running")));
  else if (ui.dynStale) live.push(kv(T("v.status"), T("stale")));
  else if (!sw) live.push(kv(T("v.status"), sim.frfMsg ? esc(sim.frfMsg) : T("notyet")));
  if (sw) {
    live.push(kv(T("frf.l.input"), esc(sw.inLab || "") + " (" + sw.inUnit + ")"));
    live.push(kv(T("frf.l.k"), String(sw.k)));
    live.push(kv(T("frf.l.eq"), sw.eqOK ? T("frf.l.eqok") : T("frf.l.eqbad")));
    live.push(kv(T("frf.l.range"), T("frf.l.rangev", { a: hz(sw.f[0]), b: hz(sw.f[360]) })));
    const ms = (sw.modes || []).filter(x => x.f > 1e-6 || x.unstable).slice(0, 3);
    ms.forEach((x, i) => live.push(kv(T("frf.l.mode", { i: i + 1 }),
      x.unstable ? T("frf.l.unstable") : hz(x.f) + ", ζ = " + (isFinite(x.zeta) ? num(x.zeta, 2) : "–"))));
    if (!ms.length) live.push(kv(T("frf.l.modes"), T("frf.l.nomodes")));
  }
  live.push(kv(T("v.gravity"), model.gravity ? T("frf.l.gon") : onOff(false)));
  dampLive().forEach(x => live.push(x));
  return block({
    title: T("frf.title"),
    eq: [
      T("frf.eq.eq", { f: c("min V(q)") }),
      T("frf.eq.small") + c("q = q<sub>0</sub> + Z·η + p·u"),
      c("M = ZᵀMZ") + ", " + c("C = ZᵀCZ") + ", " + c("K = ∂²V/∂η²") + T("frf.eq.num"),
      T("frf.eq.freq", { f: c("(K − ω²M + iωC)·η = F"), a: "F = Zᵀf", b: "F = −(K<sub>u</sub> − ω²M<sub>u</sub> + iωC<sub>u</sub>)·u" }),
      T("frf.eq.nat", { a: c("f = √λ(K,M) / 2π"), b: c("ζ = " + "yᵀCy" + " / 2ω") })
    ],
    sym: [
      [c("Z"), T("frf.sym.z")],
      [c("η"), T("frf.sym.eta")],
      [c("p·u"), T("frf.sym.pu")],
      [c("V"), T("frf.sym.v")],
      [c("M, C, K"), T("frf.sym.mck")],
      [c("ω, ζ"), T("frf.sym.wz")]
    ],
    live,
    ass: [T("frf.ass1"), T("frf.ass2"), T("frf.ass3")],
    src: T("frf.src", { ref: REF.ewins })
  });
}

/* ---------- axial bars and temperature ---------- */
function axialBlock(e, L) {
  const k = axialK(e), A = axialA(e), E_ = axialE(e), S = sim.sweep, i = Math.round(ui.frame);
  const F = S && !S.frf && S.EF && S.EF[e.id] ? S.EF[e.id][i] : NaN;
  const nm = esc(name(e.a) + name(e.b)), m = matOf(e);
  const dt = loadcellDt(e, model.defMass);
  const live = [kv(T("v.material"), esc(m.naam) + ", E = " + num(E_) + " MPa"), kv("A", num(A) + " mm²" + (e.sect === "bh" ? " (" + num(e.sb) + " × " + num(e.sh) + " mm)" : "")),
    kv("L", num(e.len) + " mm"), kv("k = E·A/L", num(k) + " N/mm = " + num(k / 1000) + " N/µm"),
    kv("L<sub>0</sub>(ΔT)", num(thermLen(e)) + " mm (ΔT = " + num(dTOf(e)) + " K)"),
    kv(T("v.lnow"), num(L) + " mm"), kv("N", isFinite(F) ? num(F) + " N" : "–"),
    kv("ΔL = N/k", isFinite(F) ? num(F / k * 1000) + " µm" : "–"), kv("σ = N/A", isFinite(F) ? num(F / A) + " MPa" : "–"),
    kv(T("ax.l.clamp"), num(-E_ * A * alphaOf(e) * dTOf(e)) + " N"),
    kv(T("v.maxdt"), isFinite(dt) ? T("ax.l.maxdtv", { a: num(dt * 1000), b: num(model.dtStep || 0.2) }) : "–")];
  const w = decimal("2.8") + "/ω";
  return block({
    title: T("ax.title", { nm }),
    eq: [c("k = E·A / L") + T("ax.eq.k"),
         c("N = k·(L − L<sub>0</sub>(1 + α·ΔT))") + T("ax.eq.n"),
         c("ΔL = N/k") + ", " + c("σ = N/A"),
         T("ax.eq.clamp", { f: c("N = −E·A·α·ΔT") }),
         T("ax.eq.dt", { a: c("h ≲ " + w), b: c("ω = √(k/m<sub>eff</sub>)") })],
    sym: [[c("E, A"), T("ax.sym.ea")], [c("L<sub>0</sub>"), T("ax.sym.l0")],
          [c("α, ΔT"), T("ax.sym.at")], [c("m<sub>eff</sub>"), T("ax.sym.meff")]],
    live,
    ass: [T("ax.ass1"), T("ax.ass2"), T("ax.ass3", { w })],
    src: T("ax.src", { a: REF.soem, b: REF.slocum })
  });
}
function thermBlock(e, L) {
  if (!isThermal(e)) return "";
  const m = matOf(e), dT = dTOf(e), nm = esc(name(e.a) + name(e.b));
  if (!dT && !isAxial(e) && typeof e.dT !== "number") return "";
  return block({
    title: T("th.title", { nm }),
    eq: [c("ΔL = α·L·ΔT"), c("L(ΔT) = L<sub>0</sub>·(1 + α·ΔT)") + T("th.eq2", { f: c("|p − q| = L(ΔT)") })],
    sym: [[c("α"), T("th.sym.a")], [c("ΔT"), T("th.sym.dt")],
          [c("L<sub>0</sub>"), T("th.sym.l0")]],
    live: [kv(T("v.material"), esc(m.naam)), kv("α", num(m.alpha) + " µm/(m·K)"), kv("ΔT", num(dT) + " K" + (typeof e.dT === "number" ? T("th.own") : T("th.model"))),
           kv("L<sub>0</sub>", num(e.len) + " mm"), kv("ΔL", num(thermDL(e) * 1000) + " µm"), kv("L(ΔT)", num(thermLen(e)) + " mm")],
    ass: [T("th.ass1"), T("th.ass2"), T("th.ass3")],
    src: T("th.src", { a: REF.soem, b: REF.slocum })
  });
}
function stiffBlock() {
  const R = sim.stiff, live = [];
  const beams = model.elems.filter(e => isBeam(e) && N(e.a) && N(e.b));
  live.push(kv(T("stiff.l.beams"), String(beams.length)));
  if (R && R.sys) {
    live.push(kv(T("v.dof"), T("stiff.l.dofv", { nd: R.sys.nd, nf: R.nfree })));
    live.push(kv(T("v.gravity"), model.gravity ? T("stiff.l.gon") : onOff(false)));
    if (R.sys.mem.some(m => m.rigid)) live.push(kv(T("stiff.l.rigid"), T("stiff.l.rigidv", { k: num(R.sys.kref) })));
    if (R.ok) {
      live.push(kv(T("stiff.l.resid") + " ‖K·u − F‖/‖F‖", R.resid < 1e-9 ? "< 10⁻⁹" : num(R.resid)));
      live.push(kv(T("stiff.l.eq") + " ΣR + ΣF", sg(R.eq, 3, R.reactions.reduce((m, r) => Math.max(m, Math.abs(r.Rx), Math.abs(r.Ry)), 0)) + " N"));
      if (R.sigMax) live.push(kv("Max σ", T("stiff.l.sig", { s: fmtStress(R.sigMax.val), p: num(R.sigMax.ratio * 100) })));
      live.push(kv(T("stiff.l.disp"), fmtLen(R.maxDisp)));
      if (R.modes && R.modes.length) live.push(kv(T("stiff.l.modes"), R.modes.map(m => hz(m.f)).join(", ")));
      (R.analytic || []).forEach(a => a.rows.forEach(r => live.push(kv(esc(a.title), T("stiff.l.an", { k: esc(r.k), an: num(r.an * r.f, 4), fe: num(r.fe * r.f, 4), u: r.unit })))));
    } else if (R.mech) live.push(kv(T("v.status"), esc(R.mech.text)));
  }
  const b0 = beams[0];
  if (b0) {
    const s = beamSect(b0), m = matOf(b0), L = Math.hypot(N(b0.a).x - N(b0.b).x, N(b0.a).y - N(b0.b).y);
    live.push(kv(T("stiff.l.beam", { nm: esc(name(b0.a) + name(b0.b)) }), "A = " + num(s.A) + " mm², I = " + num(s.I) + " mm⁴, E = " + num(m.E) + " MPa, L = " + num(L) + " mm; EA/L = " + num(m.E * s.A / L) + " N/mm, 12EI/L³ = " + num(12 * m.E * s.I / L ** 3) + " N/mm"));
  }
  return block({
    title: T("stiff.title"),
    eq: [
      T("stiff.eq.beam", {
        d: c("[u<sub>1</sub> v<sub>1</sub> θ<sub>1</sub> u<sub>2</sub> v<sub>2</sub> θ<sub>2</sub>]"), a: c("EA/L·[1 −1; −1 1]"),
        b: c("EI/L³·") + mat([["12", "6L", "−12", "6L"], ["6L", "4L²", "−6L", "2L²"], ["−12", "−6L", "12", "−6L"], ["6L", "2L²", "−6L", "4L²"]])
      }),
      T("stiff.eq.asm", { k: c("K = Σ T<sup>T</sup>·k<sub>e</sub>·T"), tt: c("T"), d: c("(u, v, θ)") }),
      T("stiff.eq.solve", { a: c("K·u = F"), b: c("K = L·L<sup>T</sup>") }),
      T("stiff.eq.curve", {
        v: c("v(ξ) = N<sub>1</sub>v<sub>1</sub> + N<sub>2</sub>θ<sub>1</sub> + N<sub>3</sub>v<sub>2</sub> + N<sub>4</sub>θ<sub>2</sub>"),
        n: [c("N<sub>1</sub> = 1 − 3ξ² + 2ξ³"), c("N<sub>2</sub> = L(ξ − 2ξ² + ξ³)"), c("N<sub>3</sub> = 3ξ² − 2ξ³"), c("N<sub>4</sub> = L(−ξ² + ξ³)")].join(", ")
      }),
      T("stiff.eq.stress", { s: c("σ(x) = |N|/A + |M(x)|·c/I"), m: c("M(x) = −f<sub>3</sub> + f<sub>2</sub>·x + q·x²/2"), r: c("σ/σ<sub>" + T("sub.allow") + "</sub>") }),
      T("stiff.eq.pt", { d: c("d"), k: c("k = 1/(d<sup>T</sup>K<sup>−1</sup>d)") }),
      T("stiff.eq.modes", { a: c("(K − ω²M)·φ = 0"), b: c("ρAL/420·[140 156 22L …]") }),
      T("stiff.eq.chk", { a: c("δ = FL³/(3EI)"), b: c("δ = FL³/(12EI)"), c: c("δ = FL³/(48EI)"), d: c("f<sub>1</sub> = " + decimal("1.875") + "²/(2π)·√(EI/(ρAL⁴))") })
    ],
    sym: [
      [c("E, A, I"), T("stiff.sym.eai")],
      [c("c"), T("stiff.sym.c")],
      [c("u, v, θ"), T("stiff.sym.uvt")],
      [c("f<sub>1..3</sub>"), T("stiff.sym.f")],
      [c("ρ"), T("stiff.sym.rho", { f: c("ρA") })]
    ],
    live,
    ass: [T("stiff.ass1"), T("stiff.ass2"), T("stiff.ass3"), T("stiff.ass4"), T("stiff.ass5"), T("stiff.ass6")],
    src: REF.prz + "; " + REF.roark + "; " + REF.soem
  });
}

function shiftBlock() {
  const nd = thermalNode();
  if (!nd || !model.elems.some(e => isThermal(e) && dTOf(e) !== 0)) return "";
  const r = thermalShift(nd.id);
  const live = [kv(T("sh.l.point"), esc(nd.name)), kv("ΔT", num(model.dT || 0) + " K"), kv(T("v.status"), r.ok ? T("determinate") : T("sh.l.notunique"))];
  if (r.ok) {
    live.push(kv("Δx, Δy", num(r.dx * 1000) + ", " + num(r.dy * 1000) + " µm"));
    r.parts.forEach(p => live.push(kv(T("sh.l.bar", { nm: esc(name(p.e.a) + name(p.e.b)) }), T("sh.l.barv", { sx: num(p.sx), sy: num(p.sy), cx: num(p.cx * 1000), cy: num(p.cy * 1000) }))));
  }
  return block({
    title: T("sh.title", { nm: esc(nd.name) }),
    eq: [T("sh.eq1", { f: c("J·dq = −(∂Φ/∂L<sub>i</sub>)·dL<sub>i</sub> = dL<sub>i</sub>"), g: c("Φ<sub>i</sub> = |p − q| − L<sub>i</sub>") }),
         T("sh.eq2", { f: c("s<sub>i</sub> = ∂q/∂L<sub>i</sub>"), g: c("J·s<sub>i</sub> = e<sub>i</sub>") }),
         c("Δq = Σ s<sub>i</sub>·α<sub>i</sub>·L<sub>i</sub>·ΔT<sub>i</sub>"),
         T("sh.eq4", { f: c("N = EA·(ΔL<sub>geom</sub> − α·L·ΔT)/L") })],
    sym: [[c("J"), T("sh.sym.j")], [c("s<sub>i</sub>"), T("sh.sym.s")],
          [c("e<sub>i</sub>"), T("sh.sym.e")]],
    live,
    ass: [T("sh.ass1"), T("sh.ass2"), T("sh.ass3")],
    src: T("sh.src", { a: REF.nik, b: REF.soem, c: REF.slocum })
  });
}

/* ---------- law of the selected element ---------- */
function selBlock() {
  const s = ui.sel;
  if (!s) return "";
  if (s.kind === "node") {
    const n = N(s.id);
    if (!n) return "";
    const nm = n.name || n.id, parts = [];
    const sm = sensorMass(n.id), dm = (n.m > 0 ? n.m : (model.defMass || 0.1)) + sm;
    parts.push(block({
      title: T("mass.title", { nm: esc(nm) }),
      eq: [T("mass.eq", { a: c("ΣF = m·a"), b: c("F<sub>" + T("mass.sub.grav") + "</sub> = −m·g") })],
      sym: [[c("m"), T("mass.sym.m")], [c("g"), T("mass.sym.g", { g: decimal("9.81") })]],
      live: [kv("m", num(dm) + " kg" + (n.m > 0 ? "" : T("mass.l.def")) + (sm > 0 ? T("mass.l.sens", { m: num(sm) }) : "")),
             kv("m·g", num(dm * 9.81) + " N" + (model.gravity ? "" : T("mass.l.goff"))),
             kv(T("mass.l.support"), n.support === "pin" ? T("mass.l.pin") : n.support === "slider" ? T("mass.l.slider", { a: num(n.dir) }) : T("mass.l.free"))],
      src: T("mass.src", { ref: REF.nik })
    }));
    if (n.mus > 0 || n.muk > 0) {
      const vS = model.fricVs || 5, ve = model.fricVe || 2, r = n.rj > 0 ? n.rj : 5;
      parts.push(block({
        title: T("fric.title", { nm: esc(nm) }),
        eq: [
          c("μ(v) = [μ<sub>k</sub> + (μ<sub>s</sub> − μ<sub>k</sub>)·e<sup>−(v/v<sub>S</sub>)²</sup>]·tanh(v/v<sub>ε</sub>)"),
          n.support === "slider" ? T("fric.eq.slider", { f: c("F = −μ(v)·N") }) : "",
          T("fric.eq.pin", { a: c("τ = −μ(r·Δω)·r·N"), b: c("v = r·Δω") }),
          T("fric.eq.stick", { a: c("|v| < v<sub>ε</sub>"), b: c("c·a = −2α·c·v"), c: c("≤ μ<sub>s</sub>·N") })
        ].filter(Boolean),
        sym: [[c("μ<sub>s</sub>, μ<sub>k</sub>"), T("fric.sym.mu")],
              [c("v<sub>S</sub>"), T("fric.sym.vs")], [c("v<sub>ε</sub>"), T("fric.sym.ve")],
              [c("N"), T("fric.sym.n")], [c("r"), T("fric.sym.r")]],
        live: [kv("μ<sub>s</sub> / μ<sub>k</sub>", num(n.mus || 0) + " / " + num(n.muk || 0)),
               kv("v<sub>S</sub>, v<sub>ε</sub>", num(vS) + ", " + num(ve) + " mm/s"), kv("r", num(r) + " mm")],
        ass: [T("fric.ass1"), T("fric.ass2")],
        src: T("fric.src", { ref: REF.olsson })
      }));
    }
    if (model.jointDamp) {
      parts.push(block({
        title: T("jd.title") + (n.support !== "free" ? T("jd.world") : ""),
        eq: [T("jd.eq1", { f: c("τ = −c·Δω") }), T("jd.eq2", { f: c("F = τ/L²") })],
        sym: [[c("c"), T("jd.sym.c")], [c("Δω"), T("jd.sym.dw")]],
        live: [kv("c", num(model.cJoint) + " N·m·s")],
        src: T("jd.src", { ref: REF.nik })
      }));
    }
    return parts.join("");
  }
  const e = E(s.id);
  if (!e) return "";
  const A = N(e.a), B = N(e.b), L = A && B ? Math.hypot(B.x - A.x, B.y - A.y) : NaN;
  const nm = A && B ? esc(name(e.a) + name(e.b)) : "";
  switch (e.type) {
    case "loadcell": {
      const ks = springK(e), live = sensorLive(e), dt = loadcellDt(e, model.defMass), k10 = 10;
      return block({
        title: T("lc.title", { name: esc(e.name || ""), nm }),
        eq: [c("F = k<sub>s</sub>·Δ") + "  " + T("and").trim() + "  " + c("Δ = F/k<sub>s</sub>"),
             c("1/k<sub>tot</sub> = 1/k + 1/k<sub>s</sub>") + T("lc.eq.series"),
             c("f = (1/2π)·√(k<sub>tot</sub>/m)") + T("lc.eq.f", { f: c("√(k<sub>tot</sub>/k)") }),
             T("lc.eq.mass", { f: c("m<sub>" + T("lc.sub.tr") + "</sub>/2") })],
        sym: [[c("k<sub>s</sub>"), T("lc.sym.ks")], [c("Δ"), T("lc.sym.d")],
              [c("k<sub>tot</sub>"), T("lc.sym.kt")]],
        live: [kv("k<sub>s</sub>", num(ks) + " N/mm = " + num(ks / 1000) + " N/µm"), kv(T("lc.l.mass"), num(e.m || 0) + " kg"),
               kv(T("lc.l.atk"), "k<sub>tot</sub> = " + num(1 / (1 / k10 + 1 / ks)) + " N/mm (" + num((1 / (1 / k10 + 1 / ks) / k10 - 1) * 100) + " %)"),
               kv("F", live ? num(live.F) + " N" : "–"), kv("Δ = F/k<sub>s</sub>", live ? num(live.d) + " µm" : "–"),
               kv(T("v.maxdt"), isFinite(dt) ? num(dt * 1000) + " ms" : "–")],
        ass: [T("lc.ass1"), T("lc.ass2"), T("lc.ass3")],
        src: T("lc.src", { a: REF.slocum, b: REF.soem })
      });
    }
    case "dsens": {
      const live = sensorLive(e), between = e.b && N(e.b);
      return block({
        title: T("ds.title", { name: esc(e.name || "") }),
        eq: [between ? c("x = [(q<sub>b</sub> − q<sub>a</sub>) − (q<sub>b0</sub> − q<sub>a0</sub>)]·n") : c("x = (q<sub>a</sub> − q<sub>a0</sub>)·n"),
             c("n = (cos α, sin α)"), T("ds.eq3", { a: c("x<sub>" + T("ds.sub.out") + "</sub> = round(x/res)·res"), b: c("|x| > " + T("rng")) })],
        sym: [[c("q<sub>0</sub>"), T("ds.sym.q0")], [c("α"), T("ds.sym.a")], [c("res, " + T("rng")), T("ds.sym.res")]],
        live: [kv(T("ds.l.dir"), num(e.ang || 0) + "°"), kv(T("ds.l.range"), "±" + num(e.range) + " µm"), kv(T("ds.l.res"), num(e.res) + " µm"),
               kv("x", live ? num(live.x) + " µm" : "–"), kv(T("v.status"), live ? (live.oor ? T("ds.l.oor") : T("ds.l.inr")) : "–")],
        ass: [T("ds.ass1"), T("ds.ass2")],
        src: T("ds.src", { ref: REF.slocum })
      });
    }
    case "encoder": {
      const live = sensorLive(e), res = encRes(e);
      return block({
        title: T("enc.title", { name: esc(e.name || "") }),
        eq: [c("θ = (θ<sub>1</sub> − θ<sub>2</sub>) − (θ<sub>1</sub> − θ<sub>2</sub>)<sub>0</sub>"), c("res = 2π / " + T("cpr")),
             T("enc.eq3", { a: c("θ<sub>" + T("sub.counted") + "</sub> = round(θ/res)·res"), b: c("≤ res/2") })],
        sym: [[c("θ<sub>1</sub>, θ<sub>2</sub>"), T("enc.sym.th")], [c("res"), T("enc.sym.res")]],
        live: [kv(T("enc.l.cpr"), num(e.cpr)), kv("res", num(res * 180 / Math.PI) + "° = " + num(res * 1e6) + " µrad"),
               kv("θ", live ? num(live.th) + "° = " + num(live.thu) + " µrad" : "–"), kv(T("enc.l.counted"), live ? num(live.thq) + "°" : "–")],
        ass: [T("enc.ass")],
        src: T("enc.src", { ref: REF.slocum })
      });
    }
    case "accel": {
      const live = sensorLive(e), ms = e.m >= 0 ? e.m : 0.01, n = N(e.node);
      const m0 = n ? (n.m > 0 ? n.m : (model.defMass || 0.1)) + sensorMass(e.node) - ms : 0;
      return block({
        title: T("acc.title", { name: esc(e.name || ""), node: esc(name(e.node)) }),
        eq: [c("a = a<sub>" + T("sub.point") + "</sub>·n") + ", " + c("n = (cos α, sin α)") + ";  " + c("1 g = " + decimal("9.80665") + " m/s²"),
             c("m<sub>" + T("sub.point") + "</sub> = m + m<sub>s</sub>"),
             T("acc.eq3", { f: c("f<sub>" + T("sub.with") + "</sub> = f·√(m/(m + m<sub>s</sub>))") })],
        sym: [[c("m<sub>s</sub>"), T("acc.sym.ms", { d: decimal("0.01") })], [c("m"), T("acc.sym.m")]],
        live: [kv("m<sub>s</sub>", num(ms) + " kg"), kv(T("acc.l.m"), num(m0) + " kg"),
               kv(T("acc.l.f"), num(Math.sqrt(m0 / (m0 + ms)))), kv("a", live ? num(live.a) + " m/s² = " + num(live.g) + " g" : "–")],
        ass: [T("acc.ass1"), T("acc.ass2")],
        src: T("acc.src", { ref: REF.ewins })
      });
    }
    case "spring":
      return block({
        title: T("spring.title", { nm }),
        eq: [c("F = k·(L − L<sub>0</sub>)"), T("spring.eq2")],
        sym: [[c("k"), T("spring.sym.k")], [c("L"), T("spring.sym.l")], [c("L<sub>0</sub>"), T("spring.sym.l0")]],
        live: [kv("k", num(e.k) + " N/mm"), kv("L<sub>0</sub>", num(e.L0) + " mm"), kv(T("v.lnow"), num(L) + " mm"), kv(T("v.fnow"), num(e.k * (L - e.L0)) + " N")],
        ass: [T("spring.ass")], src: T("fe.src", { ref: REF.nik })
      });
    case "damper":
      return block({
        title: T("damper.title", { nm }),
        eq: [c("F = c·L̇"), T("damper.eq2", { f: c("L̇ = (v<sub>b</sub> − v<sub>a</sub>)·u") })],
        sym: [[c("c"), T("damper.sym.c")], [c("L̇"), T("damper.sym.ld")]],
        live: [kv("c", num(e.c) + " Ns/mm"), kv(T("v.lnow"), num(L) + " mm")],
        ass: [T("damper.ass")], src: T("fe.src", { ref: REF.nik })
      });
    case "gap": {
      const lo = Math.min(e.min, e.max), hi = Math.max(e.min, e.max);
      return block({
        title: T("gap.title", { nm }),
        eq: [T("gap.eq1", { a: c("F = 0"), b: c("L<sub>min</sub> ≤ L ≤ L<sub>max</sub>") }),
             T("gap.eq2", { f: c("F = min(0, k<sub>c</sub>(L − L<sub>min</sub>) + c<sub>c</sub>L̇)") }),
             T("gap.eq3", { f: c("F = max(0, k<sub>c</sub>(L − L<sub>max</sub>) + c<sub>c</sub>L̇)") })],
        sym: [[c("k<sub>c</sub>, c<sub>c</sub>"), T("gap.sym.kc")], [c("L<sub>min</sub>, L<sub>max</sub>"), T("gap.sym.lm")]],
        live: [kv(T("gap.l.stroke"), num(lo) + " – " + num(hi) + " mm"), kv(T("v.lnow"), num(L) + " mm"),
               kv("k<sub>c</sub>, c<sub>c</sub>", num(e.kc || 0) + " N/mm, " + num(e.cc || 0) + " Ns/mm")],
        ass: [T("gap.ass")], src: T("gap.src", { ref: REF.nik })
      });
    }
    case "flexure": {
      const m = flexMat(e), K = flexK(e), I = flexI(e), phi = flexLivePhi(e, sim.sweep, Math.round(ui.frame)), st = flexStress(e, phi);
      const kind = e.kind, cant = kind === "cantilever", Kt = e.Kt || 1;
      const eq = cant
        ? [c(T("flex.eq.cant")), c("K = γ·K<sub>Θ</sub>·E·I / L") + T("with") + c("I = b·t³/12"),
           c("M = −K·φ") + ", " + c("σ = M<sub>" + T("flex.sub.clamp") + "</sub>·t/(2I) = K<sub>Θ</sub>·E·t·|φ| / (2L)")]
        : kind === "cross"
        ? [T("flex.eq.cross", { f: c("K = 2·E·I / L") }), c("M = −K·φ") + ", " + c("σ = E·t·|φ| / (2L)")]
        : [c("K = 2·E·b·t<sup>5/2</sup> / (9π·√R)") + " (Paros–Weisbord)", c("M = −K·φ") + ", " + c("σ = K<sub>t</sub>·(4/(3π))·E·√(t/R)·|φ|")];
      const sym = [[c("φ"), T("flex.sym.phi")],
                   [c("K"), T("flex.sym.k")], [c("E, I"), T("flex.sym.ei")]]
        .concat(cant ? [[c("γ, K<sub>Θ</sub>"), T("flex.sym.gk", { g: decimal("0.85"), k: decimal("2.65") })]] : [])
        .concat(kind === "notch" ? [[c("K<sub>t</sub>"), T("flex.sym.kt")]] : []);
      const allow = "σ<sub>" + T("sub.allow") + "</sub>";
      const live = [kv(T("flex.l.type"), esc(FLEX_KINDS[kind] || kind)), kv(T("v.material"), esc(m.naam) + ", E = " + num(m.E) + " MPa"),
        kv("b · t · L", num(e.wd) + " · " + num(e.t) + " · " + num(e.L) + " mm"), kv("I", num(I) + " mm⁴"),
        kv("E·I", num(m.E * I) + " N·mm²"),
        kv("K", num(K) + " N·mm/rad = " + num(K / 1000) + " N·m/rad"),
        kv(T("flex.l.phinow"), num(phi * 180 / Math.PI) + "° (" + num(phi) + " rad)"), kv("M", num(-K * phi / 1000) + " N·m"),
        kv("σ", num(st.sigma) + " MPa (" + allow + " = " + num(st.allow) + " MPa, " + num(st.ratio * 100) + " %)"),
        kv("φ<sub>max</sub>", num(st.phiMax * 180 / Math.PI) + "°")];
      if (cant) live.splice(4, 0, kv("γ·K<sub>Θ</sub>/L", num(GAMMA * KTHETA / e.L) + " mm⁻¹"), kv("L<sub>eff</sub> = L/K<sub>Θ</sub>", num(st.Leff) + " mm"),
        kv(T("flex.l.link"), T("flex.l.linkv", { a: num(GAMMA * e.L), b: num(e.len) })));
      return block({
        title: T("flex.title", { nm, kind: esc(FLEX_KINDS[kind] || kind) }),
        eq, sym, live,
        ass: [T("flex.ass1", { r: decimal("1.039") }), T("flex.ass2"), T("flex.ass3")],
        src: T("flex.src", { a: REF.howell, b: REF.soem, c: REF.paros })
      });
    }
    case "contact": {
      const P = N(e.node); if (!P) return "";
      const f = cFrame(e, P), h = hertz(e, f.delta), st = liveContact(e), mu = e.mu === undefined ? 0.15 : e.mu;
      const Fn = st ? st.Fn : h.Fn;
      const live = [kv("R", num(e.R) + " mm"), kv(T("ct.l.mats"), T("ct.l.matsv", { a: esc(material(e.m1).nm), b: esc(material(e.m2).nm) })),
        kv("E*", num(h.Es) + " N/mm²"), kv("G*", num(h.Gs) + " N/mm²"),
        kv("δ", num(Math.max(0, f.delta) * 1000) + " µm"), kv("F<sub>n</sub>", num(Fn) + " N"),
        kv("a = √(R·δ)", num(h.a) + " mm"), kv("k<sub>n</sub> = 2E*·a", num(h.kn) + " N/mm"),
        kv("k<sub>t</sub> = 8G*·a", num(h.kt) + " N/mm"), kv("μ·F<sub>n</sub>", num(mu * Fn) + " N")];
      if (st) live.push(kv(T("ct.l.state"), st.open ? T("ct.l.open") : st.slip ? T("ct.l.slip") : T("ct.l.stick")), kv("F<sub>t</sub>", num(st.Ft) + " N"), kv(T("ct.l.z"), num(st.z) + " µm"));
      return block({
        title: T("ct.title", { node: esc(name(e.node)) }),
        eq: [c("δ = R − (p − p<sub>0</sub>)·n") + ", " + c("n = (−sin α, cos α)"),
             T("ct.eq.fn", { f: c("F<sub>n</sub> = 4/3·E*·√R·δ<sup>3/2</sup>·(1 − χ·v<sub>n</sub>)") }),
             c("1/E* = (1−ν<sub>1</sub>²)/E<sub>1</sub> + (1−ν<sub>2</sub>²)/E<sub>2</sub>"),
             c("a = √(R·δ)") + ", " + c("k<sub>n</sub> = dF<sub>n</sub>/dδ = 2E*·a"),
             c("1/G* = (2−ν<sub>1</sub>)/G<sub>1</sub> + (2−ν<sub>2</sub>)/G<sub>2</sub>") + ", " + c("k<sub>t</sub> = 8·G*·a"),
             T("ct.eq.brist", { a: c("ż = v<sub>t</sub>"), b: c("|k<sub>t</sub>z| < μF<sub>n</sub>"), c: c("ż = 0"), d: c("z = ±μF<sub>n</sub>/k<sub>t</sub>") }),
             T("ct.eq.ft", { a: c("F<sub>t</sub> = −(k<sub>t</sub>z + χF<sub>n</sub>v<sub>t</sub>)"), b: c("±μF<sub>n</sub>") })],
        sym: [[c("R"), T("ct.sym.r")], [c("E*, G*"), T("ct.sym.eg")],
              [c("δ, a"), T("ct.sym.da")], [c("z"), T("ct.sym.z")],
              [c("χ"), T("ct.sym.chi")]],
        live,
        ass: [T("ct.ass1"), T("ct.ass2"), T("ct.ass3")],
        src: T("ct.src", { a: REF.john, b: REF.hunt, c: REF.olsson })
      });
    }
    case "force": {
      const th = e.ang * Math.PI / 180;
      return block({
        title: T("force.title", { node: esc(name(e.node)) }),
        eq: [c("F = (F·cos α, F·sin α)")],
        sym: [[c("F"), T("force.sym.f")], [c("α"), T("force.sym.a")]],
        live: [kv("F", num(e.mag) + " N"), kv("α", num(e.ang) + "°"), kv("F<sub>x</sub>, F<sub>y</sub>", num(e.mag * Math.cos(th)) + ", " + num(e.mag * Math.sin(th)) + " N")],
        ass: [T("force.ass")], src: T("force.src", { ref: REF.nik })
      });
    }
    case "actuator": {
      const lo = Math.min(e.min, e.max), hi = Math.max(e.min, e.max), f = e.freq || 0;
      const a = actLen(e, sim.simT);
      return block({
        title: T("act.title", { nm }),
        eq: [c("L(t) = L<sub>m</sub> + L<sub>a</sub>·sin(φ<sub>0</sub> + 2πft)"),
             c("L<sub>m</sub> = (max+min)/2") + ", " + c("L<sub>a</sub> = (max−min)/2"),
             T("act.eq3", { f: c("φ<sub>0</sub> = asin((L<sub>0</sub> − L<sub>m</sub>)/L<sub>a</sub>)") }),
             T("act.eq4", { a: c("|p−q|² = L(t)²"), b: c("L̇"), c: c("L̈") })],
        sym: [[c("min, max"), T("act.sym.mm")], [c("f"), T("act.sym.f")], [c("L<sub>0</sub>"), T("act.sym.l0")]],
        live: [kv("min – max", num(lo) + " – " + num(hi) + " mm"), kv("f", num(f) + " Hz"),
               kv("L<sub>m</sub>, L<sub>a</sub>", num((hi + lo) / 2) + ", " + num((hi - lo) / 2) + " mm"),
               kv(T("act.l.at", { t: num(sim.simT, 2) }), num(a.L) + " mm")],
        ass: [T("act.ass")], src: T("act.src", { ref: REF.nik })
      });
    }
    case "link":
      if (isAxial(e)) return axialBlock(e, L) + thermBlock(e, L);
      if (e.driver) {
        const om = (e.cw ? -1 : 1) * (e.rpm || 0) * Math.PI / 30;
        return block({
          title: T("crank.title", { nm }),
          eq: [c("θ = θ<sub>0</sub> + ωt"), c("p = A + L·(cos θ, sin θ)"), c("v = ω·(−r<sub>y</sub>, r<sub>x</sub>)") + ", " + c("a = −ω²r")],
          sym: [[c("ω"), T("crank.sym.w")], [c("r"), T("crank.sym.r")]],
          live: [kv("L", num(e.len) + " mm"), kv("θ<sub>0</sub>", num(e.theta0 || 0) + "°"), kv("ω", num(om) + " rad/s (" + num(e.rpm || 0) + " rpm, " + (e.cw ? T("crank.cw") : T("crank.ccw")) + ")")],
          ass: [T("crank.ass")], src: T("act.src", { ref: REF.nik })
        });
      }
      return block({
        title: T("bar.title", { nm }),
        eq: [c("|p − q|² = L²"), T("bar.eq2")],
        sym: [[c("L"), T("bar.sym.l")], [c("N"), T("bar.sym.n")]],
        live: [kv("L", num(e.len) + " mm"), kv(T("v.lnow"), num(L) + " mm")],
        src: T("bar.src", { ref: REF.nik })
      }) + thermBlock(e, L);
  }
  return "";
}

/* ---------- rendering ---------- */
let lastKey = "", sweepIds = new WeakMap(), sweepN = 0, wired = false, lastEl = null;
const sweepId = s => { if (!s) return 0; let i = sweepIds.get(s); if (!i) sweepIds.set(s, i = ++sweepN); return i; };

function keyOf() {
  const sel = ui.sel ? E(ui.sel.id) || N(ui.sel.id) : null;
  return [lang(), model.mode, sim.stiffGen, model.stiffNode, model.stiffAng, model.stiffScale, ui.stiffMode, sim.stiff && sim.stiff.modes ? 1 : 0, model.durMode, ui.sel ? ui.sel.kind + ui.sel.id : "", sweepId(sim.sweep), !!sim.job, ui.dynStale, sim.solveOK,
    model.nodes.length, model.elems.length, model.gravity, model.dtStep, model.simDur, model.defMass, model.cVisc, model.maxT,
    model.jointDamp, model.cJoint, model.fricVs, model.fricVe, model.dT, model.thermNode, model.frfIn, model.mode === "kin" ? ui.frame : 0,
    sel ? JSON.stringify(sel) : "", sel && (sel.type === "contact" || sel.type === "flexure" || sel.type === "loadcell" || sel.type === "dsens" || sel.type === "encoder" || sel.type === "accel") ? ui.frame : 0, model.mode === "kin" ? model.nodes.map(n => n.x + "," + n.y).join(";") : ""].join("|");
}

export function renderHow(el) {
  if (!el || el.offsetParent === null) return;         // tab not visible
  lastEl = el;
  if (!wired) {
    wired = true;
    el.addEventListener("click", ev => {
      const b = ev.target.closest(".hw-copy");
      if (!b) return;
      const text = copies[+b.dataset.i];
      const done = ok => { b.textContent = ok ? T("copied") : T("copyfail"); setTimeout(() => { b.textContent = T("copy"); }, 1400); };
      try {
        navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
      } catch (_) { done(false); }
    });
  }
  const key = keyOf();
  if (key === lastKey && el.firstChild) return;
  lastKey = key;
  el.innerHTML = howHtml();
}

// re-render the panel when the language changes (the key includes the language; numbers follow the decimal separator)
onLang(() => { lastKey = ""; if (lastEl) renderHow(lastEl); });

// the formulas, assumptions and sources of the current mode (and the selected component) as HTML, also for the worksheet
export function howHtml() {
  const keep = copies;
  copies = [];
  let h;
  if (model.mode === "stiff") h = [stiffBlock()];
  else if (model.mode === "frf") h = [frfBlock()];
  else if (model.mode === "dyn") h = dynBlocks();
  else h = [kinBlock(), shiftBlock()];
  const extra = selBlock();
  const out = h.join("") + (extra ? '<div class="hw-sel">' + T("sel") + "</div>" + extra : "");
  copies = keep;
  return out;
}
