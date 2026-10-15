// Tabblad "Hoe rekent dit?": formules, symbolen en "met jouw getallen" voor de huidige modus.
// Alleen HTML-strings (sub/sup, CSS-breuken); herberekent alleen als de invoer veranderd is.
import { frame as cFrame, hertz, liveContact, mat as material } from "../core/contact.js";
import { actLen, E, N, curLen, isBar } from "../core/elements.js";
import { mobility } from "../core/kinematics.js";
import { model, sim, ui } from "../core/state.js";

const BA = 20, BB = 20;          // Baumgarte-constanten, gelijk aan dynamics.js (1/s)
const VTOL = 0.5, ATOL = 50, CALM = 0.1;   // evenwichtscriteria uit dynamics.js (mm/s, mm/s², s)

/* ---------- kleine hulpjes ---------- */
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const nl = x => String(x).replace(".", ",");
const num = (v, d = 3) => {
  if (v === undefined || v === null || !isFinite(v)) return "–";
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return nl(v.toExponential(2));
  return nl(+v.toPrecision(d));
};
const hz = f => f === undefined || !isFinite(f) ? "–" : nl(f < 10 ? f.toPrecision(3) : f < 1000 ? f.toFixed(1) : f.toFixed(0)) + " Hz";
const s_ = (b, i) => b + "<sub>" + i + "</sub>";
const sup = (b, i) => b + "<sup>" + i + "</sup>";
const fr = (n, d) => '<span class="fr"><span>' + n + "</span><span>" + d + "</span></span>";
const mat = rows => '<span class="mat">' + rows.map(r => "<span>" + r.map(c => "<i>" + c + "</i>").join("") + "</span>").join("") + "</span>";
const c = s => "<code>" + s + "</code>";
const dot = s => s + "̇", ddot = s => s + "̈";
const name = id => { const n = N(id); return n ? n.name || id : "?"; };

// platte tekst voor de kopieerknop: breuken, sub en sup omzetten, de rest strippen
function plain(h) {
  return h
    .replace(/<span class="fr"><span>(.*?)<\/span><span>(.*?)<\/span><\/span>/g, "($1)/($2)")
    .replace(/<sub>(.*?)<\/sub>/g, "_$1").replace(/<sup>(.*?)<\/sup>/g, "^$1")
    .replace(/<span class="mat">(.*?)<\/span><\/span>/g, m => m)   // matrix: cellen met spaties
    .replace(/<\/i><i>/g, "  ").replace(/<\/span><span>/g, " ; ")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

let copies = [];                 // platte tekst per blok, voor de Kopieer-knoppen
function block(b) {
  const i = copies.length;
  const sec = (t, items, cls) => items && items.length
    ? '<div class="hw-h">' + t + "</div>" + (cls === "ul"
      ? "<ul>" + items.map(x => "<li>" + x + "</li>").join("") + "</ul>"
      : items.map(x => '<div class="hw-' + cls + '">' + x + "</div>").join(""))
    : "";
  const txt = [b.title, ""];
  const add = (t, items, f) => { if (items && items.length) { txt.push(t + ":"); items.forEach(x => txt.push("  " + (f ? f(x) : plain(x)))); txt.push(""); } };
  add("Vergelijkingen", b.eq); add("Betekenis", b.sym, x => plain(x[0]) + " = " + plain(x[1]));
  add("Met jouw getallen", b.live); add("Aannames", b.ass);
  if (b.src) txt.push("Bron: " + plain(b.src));
  copies.push(txt.join("\n").replace(/\n{3,}/g, "\n\n").trim());
  return '<section class="hw-block"><div class="hw-top"><h3>' + b.title + "</h3>" +
    '<button type="button" class="hw-copy" data-i="' + i + '">Kopieer</button></div>' +
    sec("Vergelijkingen", b.eq, "eq") +
    (b.sym && b.sym.length ? '<div class="hw-h">Betekenis</div><dl class="hw-sym">' +
      b.sym.map(x => "<dt>" + x[0] + "</dt><dd>" + x[1] + "</dd>").join("") + "</dl>" : "") +
    sec("Met jouw getallen", b.live, "live") + sec("Aannames", b.ass, "ul") +
    (b.src ? '<div class="hw-src">Bron: ' + b.src + "</div>" : "") + "</section>";
}

/* ---------- inhoud per modus ---------- */
const kv = (k, v) => "<span>" + k + "</span> <b>" + v + "</b>";

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
    kv("Punten", m.nNodes + " (" + m.nPinned + " vast, " + (m.nNodes - m.nPinned) + " vrij)"),
    kv("Onbekenden", "2·" + (m.nNodes - m.nPinned) + " = " + m.unknowns),
    kv("Vergelijkingen", (m.nLinks - m.nDead) + " stangen + " + m.nSliders + " glijders = " + m.cons),
    kv("Vrijheidsgraden", m.unknowns + " − " + m.cons + " = " + m.dof),
  ];
  if (m.drive) live.push(kv("Aangedreven", m.driver + " kruk(ken), " + m.acts + " actuator(en) → " + m.dofDriven + " over"));
  live.push(kv("Status", v === 0 ? "bepaald" : v > 0 ? "onderbepaald (" + v + " te veel vrij)" : "overbepaald (" + (-v) + " te veel)"));
  live.push(kv("Restfout max |Φ|", num(res) + " mm" + (sim.solveOK === false ? " (niet samen te stellen)" : "")));
  live.push(kv("Zwaartekracht", model.gravity ? "aan (g = 9,81 m/s²)" : "uit"));
  return block({
    title: "Kinematica: positie, snelheid, versnelling en krachten",
    eq: [
      "Stang: " + c("Φ<sub>i</sub> = |p − q|² − L<sub>i</sub>² = 0"),
      "Glijder: " + c("n·(p − a) = 0") + ", " + c("n = (−sin θ, cos θ)"),
      "Kruk: " + c("p = A + L·(cos θ, sin θ)") + ", " + c("θ = θ<sub>0</sub> + ωt"),
      "Positie (Gauss-Newton, kleinste stap): " + c("J·Δq = −Φ") + ", " + c("Δq = Jᵀ(JJᵀ)⁻¹(−Φ)"),
      "Snelheid: " + c("J·q̇ = −Φ<sub>t</sub>") + " met " + c("2(p−q)·(v<sub>p</sub>−v<sub>q</sub>) = 0"),
      "Versnelling: " + c("J·q̈ = γ") + " met " + c("γ = −2|v<sub>p</sub>−v<sub>q</sub>|²"),
      "Krachten (quasi-statisch): " + c("ΣF = m·a") + " in elk punt, onbekend: stangkrachten N, reacties, krukkracht",
      "Grübler: " + c("DOF = 2·n<sub>vrij</sub> − (stangen + glijders)")
    ],
    sym: [
      [c("q"), "coördinaten (x, y) van alle vrije punten, in mm"],
      [c("Φ"), "afwijking van de randvoorwaarden; 0 als alles klopt"],
      [c("J"), "Jacobiaan ∂Φ/∂q (rij per stang of glijder)"],
      [c("L"), "stanglengte (bij een actuator: de lengte op dat moment)"],
      [c("m, a"), "massa in kg en versnelling van het punt in mm/s² (×10<sup>−3</sup> geeft N)"]
    ],
    live,
    ass: ["Stangen zijn stijf en massaloos; massa zit in de punten.", "Geen tijdstappen: elke stand volgt uit de vorige met de kleinste verplaatsing.", "Krachten alleen als het stelsel vierkant is (DOF = 0 met aandrijving)."],
    src: "src/core/kinematics.js (relax, kinAt, forcesAt, mobility)"
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
    kv("Onbekenden q", "2·" + free + " = " + nq),
    kv("Randvoorwaarden Φ", bars + " stangen + " + sl + " glijders + 2·" + drv + " kruk = " + nm),
    kv("Vrijheidsgraden", nq + " − " + nm + " = " + (nq - nm) + (nq - nm < 0 ? " (overbepaald, niet te rekenen)" : "")),
    kv("Stap h<sub>0</sub> (instelling)", nl(+(h0 * 1000).toPrecision(3)) + " ms"),
    kv("Baumgarte α = β", BA + " 1/s"),
    kv("Zwaartekracht", model.gravity ? "aan" : "uit"),
    kv("Demping per punt c<sub>v</sub>", num(model.cVisc || 0) + " Ns/mm"),
    kv("Scharnierdemping", model.jointDamp ? num(model.cJoint) + " N·m·s" : "uit")
  ];
  if (dur) live.push(kv("Looptijd", num(dur, 3) + " s" + (eq && !sw ? " (max)" : "") + " → 360 beelden, " + sub + " RK4-stap(pen) per beeld, h = " + num(h * 1000) + " ms"));
  if (sim.job) live.push(kv("Status", "bezig met rekenen…"));
  else if (ui.dynStale) live.push(kv("Status", "model gewijzigd, druk op Bereken"));
  else if (!sw) live.push(kv("Status", "nog niet doorgerekend"));
  else {
    live.push(kv("Grootste reactie", num(sw.Rmax) + " N"));
    live.push(kv("Grootste stangkracht", num(sw.Nmax) + " N"));
  }
  const out = [block({
    title: eq ? "Evenwicht: bewegen tot het stil ligt" : "Dynamica: beweging in de tijd",
    eq: [
      mat([["M", "Φ<sub>q</sub>ᵀ"], ["Φ<sub>q</sub>", "0"]]) + mat([["q̈"], ["λ"]]) + " = " +
        mat([["Q"], ["γ − 2α·Φ̇ − β²·Φ"]]),
      "Randvoorwaarden: " + c("Φ(q, t) = |p−q|² − L² = 0") + " (stang, glijder, kruk als in kinematica)",
      "Stangkracht: " + c("N = 2L·λ"),
      "Tijdstap RK4: " + c("y′ = (q̇, q̈)") + ", vier KKT-stelsels per stap",
      "Projectie na elk beeld: " + c("Φ = 0") + " (positie) en " + c("Φ<sub>q</sub>·q̇ = −Φ<sub>t</sub>") + " (snelheid)"
    ],
    sym: [
      [c("M"), "massamatrix (diagonaal, kg·mm → N via 10<sup>−3</sup>)"],
      [c("Q"), "uitwendige krachten: veer, demper, speling, kracht, zwaartekracht, wrijving, demping"],
      [c("Φ<sub>q</sub>"), "Jacobiaan van de randvoorwaarden"],
      [c("λ"), "Lagrange-multiplicatoren: de krachten die de verbindingen leveren"],
      [c("γ"), "kwadratische snelheidsterm uit de tweede afgeleide van Φ"],
      [c("α, β"), "Baumgarte: dempen van afwijkingen, " + BA + " en " + BB + " 1/s"]
    ],
    live,
    ass: ["Stangen zijn stijf; massa zit in de punten (standaardmassa als er geen is ingevuld).", "Wrijving: Stribeck-vorm met echt plakken onder de snelheidsdrempel.", "Draait ook met vrijheidsgraden over: veren en dempers sturen dan de beweging."],
    src: "src/core/dynamics.js (computeDyn: jac, kkt, rk4, project)"
  })];
  if (eq) {
    out.push(block({
      title: "Evenwichtscriteria",
      eq: [
        "Stil als: " + c("max|q̇| < " + nl(VTOL) + " mm/s") + " en " + c("max|q̈| < " + ATOL + " mm/s²"),
        "...gedurende " + c("> " + nl(CALM) + " s") + " aaneen; gecontroleerd elke 10 stappen",
        "Evenwicht zelf: " + c("q̇ = 0, q̈ = 0") + " → " + c("Φ<sub>q</sub>ᵀλ = Q, Φ = 0")
      ],
      sym: [[c("max|q̇|"), "grootste puntsnelheid"], [c("max|q̈|"), "grootste puntversnelling, uit het KKT-stelsel"]],
      live: [
        kv("Maximale rekentijd", num(model.maxT || 30) + " s"),
        kv("Resultaat", sw && sw.settled ? "tot rust na " + num(sw.settled, 3) + " s" : sw ? "niet tot rust binnen de maximale tijd" : "nog niet doorgerekend")
      ],
      ass: ["Daarna wordt de beweging vanaf het begin opnieuw opgeslagen tot die tijd.", "Dempers of wrijving zijn nodig om echt tot rust te komen."],
      src: "src/core/dynamics.js (durMode = equil)"
    }));
  }
  return out;
}

function frfBlock() {
  const sw = sim.sweep && sim.sweep.frf ? sim.sweep : null;
  const live = [];
  if (sim.job) live.push(kv("Status", "bezig met rekenen…"));
  else if (ui.dynStale) live.push(kv("Status", "model gewijzigd, druk op Bereken"));
  else if (!sw) live.push(kv("Status", sim.frfMsg ? esc(sim.frfMsg) : "nog niet doorgerekend"));
  if (sw) {
    live.push(kv("Ingang", esc(sw.inLab || "") + " (" + sw.inUnit + ")"));
    live.push(kv("Vrijheidsgraden k (dim Z)", String(sw.k)));
    live.push(kv("Evenwicht", sw.eqOK ? "gevonden (∇V = 0)" : "niet nauwkeurig gevonden"));
    live.push(kv("Frequentiebereik", hz(sw.f[0]) + " – " + hz(sw.f[360]) + ", 361 punten log"));
    const ms = (sw.modes || []).filter(x => x.f > 1e-6 || x.unstable).slice(0, 3);
    ms.forEach((x, i) => live.push(kv("Eigenfrequentie f<sub>" + (i + 1) + "</sub>",
      x.unstable ? "onstabiel (K niet positief)" : hz(x.f) + ", ζ = " + (isFinite(x.zeta) ? num(x.zeta, 2) : "–"))));
    if (!ms.length) live.push(kv("Eigenfrequenties", "geen (k = 0 of geen massa)"));
  }
  live.push(kv("Zwaartekracht", model.gravity ? "aan (geeft K een slingerstijfheid)" : "uit"));
  live.push(kv("Demping per punt c<sub>v</sub>", num(model.cVisc || 0) + " Ns/mm"));
  live.push(kv("Scharnierdemping", model.jointDamp ? num(model.cJoint) + " N·m·s" : "uit"));
  return block({
    title: "FRF: frequentieresponsie rond het evenwicht",
    eq: [
      "Evenwicht: " + c("min V(q)") + " onder de randvoorwaarden, aandrijvingen vast",
      "Kleine bewegingen: " + c("q = q<sub>0</sub> + Z·η + p·u"),
      c("M = ZᵀMZ") + ", " + c("C = ZᵀCZ") + ", " + c("K = ∂²V/∂η²") + " (numeriek)",
      "Per frequentie: " + c("(K − ω²M + iωC)·η = F") + " (kracht: F = Zᵀf; beweging: F = −(K<sub>u</sub> − ω²M<sub>u</sub> + iωC<sub>u</sub>)·u)",
      "Eigenfrequentie: " + c("f = √λ(K,M) / 2π") + ", " + c("ζ = " + "yᵀCy" + " / 2ω") + " (y massa-genormeerd)"
    ],
    sym: [
      [c("Z"), "orthonormale basis van wat de randvoorwaarden toelaten (k kolommen)"],
      [c("η"), "coördinaten in die basis (k vrijheidsgraden)"],
      [c("p·u"), "vaste vorm bij de ingang u (actuatorlengte, krukhoek)"],
      [c("V"), "potentiële energie: veren, aanslag, zwaartekracht, krachten"],
      [c("M, C, K"), "gereduceerde massa-, dempings- en stijfheidsmatrix"],
      [c("ω, ζ"), "hoekfrequentie (rad/s) en dempingsfactor per eigenvorm"]
    ],
    live,
    ass: ["Lineair rond één evenwicht: alleen kleine uitslagen.", "Wrijving en gesloten speling-aanslagen tellen alleen als stijfheid/demping mee als de aanslag raakt.", "Demping: demper, aanslag, demping per punt en scharnierdemping."],
    src: "src/core/frf.js (computeFrf)"
  });
}

/* ---------- wet van het geselecteerde element ---------- */
function selBlock() {
  const s = ui.sel;
  if (!s) return "";
  if (s.kind === "node") {
    const n = N(s.id);
    if (!n) return "";
    const nm = n.name || n.id, parts = [];
    const dm = n.m > 0 ? n.m : (model.defMass || 0.1);
    parts.push(block({
      title: "Massa in punt " + esc(nm),
      eq: [c("ΣF = m·a") + " ; " + c("F<sub>zwaarte</sub> = −m·g") + " (alleen als zwaartekracht aan staat)"],
      sym: [[c("m"), "massa van het punt in kg"], [c("g"), "9,81 m/s²"]],
      live: [kv("m", num(dm) + " kg" + (n.m > 0 ? "" : " (standaard)")),
             kv("m·g", num(dm * 9.81) + " N" + (model.gravity ? "" : " (zwaartekracht uit)")),
             kv("Steun", n.support === "pin" ? "scharnier (vast)" : n.support === "slider" ? "glijder, hoek " + num(n.dir) + "°" : "vrij")],
      src: "src/core/dynamics.js (loads, mA)"
    }));
    if (n.mus > 0 || n.muk > 0) {
      const vS = model.fricVs || 5, ve = model.fricVe || 2, r = n.rj > 0 ? n.rj : 5;
      parts.push(block({
        title: "Wrijving in punt " + esc(nm),
        eq: [
          c("μ(v) = [μ<sub>k</sub> + (μ<sub>s</sub> − μ<sub>k</sub>)·e<sup>−(v/v<sub>S</sub>)²</sup>]·tanh(v/v<sub>ε</sub>)"),
          n.support === "slider" ? "Glijder: " + c("F = −μ(v)·N") + " langs de rail" : "",
          "Scharnier: " + c("τ = −μ(r·Δω)·r·N") + ", " + c("v = r·Δω"),
          "Stilstand: als " + c("|v| < v<sub>ε</sub>") + " plakt het contact (extra voorwaarde " + c("c·a = −2α·c·v") + ") zolang de benodigde kracht " + c("≤ μ<sub>s</sub>·N") + "; anders schiet het los"
        ].filter(Boolean),
        sym: [[c("μ<sub>s</sub>, μ<sub>k</sub>"), "wrijvingscoëfficiënt in rust en tijdens glijden"],
              [c("v<sub>S</sub>"), "Stribeck-snelheid"], [c("v<sub>ε</sub>"), "afvlakking rond v = 0"],
              [c("N"), "normaalkracht of lagerkracht uit de multiplicatoren"], [c("r"), "penstraal"]],
        live: [kv("μ<sub>s</sub> / μ<sub>k</sub>", num(n.mus || 0) + " / " + num(n.muk || 0)),
               kv("v<sub>S</sub>, v<sub>ε</sub>", num(vS) + ", " + num(ve) + " mm/s"), kv("r", num(r) + " mm")],
        ass: ["Een door de klok gedraaide kruk kan niet plakken.", "In de kinematische modus volgt de wrijving uit dezelfde formule."],
        src: "src/core/elements.js (frictionLoads), src/core/dynamics.js (contacts)"
      }));
    }
    if (model.jointDamp) {
      parts.push(block({
        title: "Scharnierdemping" + (n.support !== "free" ? " (met de vaste wereld)" : ""),
        eq: [c("τ = −c·Δω") + " tussen elk paar lichamen in het punt", "Moment τ op een stang wordt een krachtenkoppel op zijn uiteinden: " + c("F = τ/L²")],
        sym: [[c("c"), "dempingsconstante in N·m·s"], [c("Δω"), "relatieve hoeksnelheid van de twee lichamen"]],
        live: [kv("c", num(model.cJoint) + " N·m·s")],
        src: "src/core/elements.js (jointDamper)"
      }));
    }
    return parts.join("");
  }
  const e = E(s.id);
  if (!e) return "";
  const A = N(e.a), B = N(e.b), L = A && B ? Math.hypot(B.x - A.x, B.y - A.y) : NaN;
  const nm = A && B ? esc(name(e.a) + name(e.b)) : "";
  switch (e.type) {
    case "spring":
      return block({
        title: "Veer " + nm,
        eq: [c("F = k·(L − L<sub>0</sub>)"), "Kracht werkt langs de veer: positief = trekt de punten naar elkaar"],
        sym: [[c("k"), "stijfheid in N/mm"], [c("L"), "huidige lengte tussen de punten"], [c("L<sub>0</sub>"), "lengte zonder kracht"]],
        live: [kv("k", num(e.k) + " N/mm"), kv("L<sub>0</sub>", num(e.L0) + " mm"), kv("L nu", num(L) + " mm"), kv("F nu", num(e.k * (L - e.L0)) + " N")],
        ass: ["Lineaire veer, geen massa."], src: "src/core/dynamics.js (loads)"
      });
    case "damper":
      return block({
        title: "Demper " + nm,
        eq: [c("F = c·L̇"), c("L̇ = (v<sub>b</sub> − v<sub>a</sub>)·u") + ", u = eenheidsvector van a naar b"],
        sym: [[c("c"), "dempingsconstante in Ns/mm"], [c("L̇"), "lengtesnelheid, mm/s"]],
        live: [kv("c", num(e.c) + " Ns/mm"), kv("L nu", num(L) + " mm")],
        ass: ["Werkt alleen met beweging; in rust is de kracht 0. In FRF gaat c in de matrix C."], src: "src/core/dynamics.js (loads)"
      });
    case "gap": {
      const lo = Math.min(e.min, e.max), hi = Math.max(e.min, e.max);
      return block({
        title: "Speling " + nm,
        eq: [c("F = 0") + "  voor " + c("L<sub>min</sub> ≤ L ≤ L<sub>max</sub>"),
             c("F = min(0, k<sub>c</sub>(L − L<sub>min</sub>) + c<sub>c</sub>L̇)") + "  als L < L<sub>min</sub>",
             c("F = max(0, k<sub>c</sub>(L − L<sub>max</sub>) + c<sub>c</sub>L̇)") + "  als L > L<sub>max</sub>"],
        sym: [[c("k<sub>c</sub>, c<sub>c</sub>"), "stijfheid en demping van de aanslag"], [c("L<sub>min</sub>, L<sub>max</sub>"), "vrije slag"]],
        live: [kv("Vrije slag", num(lo) + " – " + num(hi) + " mm"), kv("L nu", num(L) + " mm"),
               kv("k<sub>c</sub>, c<sub>c</sub>", num(e.kc || 0) + " N/mm, " + num(e.cc || 0) + " Ns/mm")],
        ass: ["De aanslag trekt nooit: de kracht duwt alleen terug."], src: "src/core/elements.js (gapForce)"
      });
    }
    case "contact": {
      const P = N(e.node); if (!P) return "";
      const f = cFrame(e, P), h = hertz(e, f.delta), st = liveContact(e), mu = e.mu === undefined ? 0.15 : e.mu;
      const Fn = st ? st.Fn : h.Fn;
      const live = [kv("R", num(e.R) + " mm"), kv("Materialen", esc(material(e.m1).nm) + " op " + esc(material(e.m2).nm)),
        kv("E*", num(h.Es) + " N/mm²"), kv("G*", num(h.Gs) + " N/mm²"),
        kv("δ", num(Math.max(0, f.delta) * 1000) + " µm"), kv("F<sub>n</sub>", num(Fn) + " N"),
        kv("a = √(R·δ)", num(h.a) + " mm"), kv("k<sub>n</sub> = 2E*·a", num(h.kn) + " N/mm"),
        kv("k<sub>t</sub> = 8G*·a", num(h.kt) + " N/mm"), kv("μ·F<sub>n</sub>", num(mu * Fn) + " N")];
      if (st) live.push(kv("Toestand", st.open ? "los" : st.slip ? "slip" : "plakt"), kv("F<sub>t</sub>", num(st.Ft) + " N"), kv("z (borstel)", num(st.z) + " µm"));
      return block({
        title: "Contact bal – vlak " + esc(name(e.node)),
        eq: [c("δ = R − (p − p<sub>0</sub>)·n") + ", " + c("n = (−sin α, cos α)"),
             c("F<sub>n</sub> = 4/3·E*·√R·δ<sup>3/2</sup>·(1 − χ·v<sub>n</sub>)") + "  voor δ > 0, anders 0",
             c("1/E* = (1−ν<sub>1</sub>²)/E<sub>1</sub> + (1−ν<sub>2</sub>²)/E<sub>2</sub>"),
             c("a = √(R·δ)") + ", " + c("k<sub>n</sub> = dF<sub>n</sub>/dδ = 2E*·a"),
             c("1/G* = (2−ν<sub>1</sub>)/G<sub>1</sub> + (2−ν<sub>2</sub>)/G<sub>2</sub>") + ", " + c("k<sub>t</sub> = 8·G*·a"),
             "Borstel: " + c("ż = v<sub>t</sub>") + " zolang " + c("|k<sub>t</sub>z| < μF<sub>n</sub>") + " (plakt), anders " + c("ż = 0") + " en " + c("z = ±μF<sub>n</sub>/k<sub>t</sub>") + " (slip)",
             c("F<sub>t</sub> = −(k<sub>t</sub>z + χF<sub>n</sub>v<sub>t</sub>)") + ", begrensd op " + c("±μF<sub>n</sub>")],
        sym: [[c("R"), "straal van de bal, mm"], [c("E*, G*"), "gecombineerde elasticiteits- en glijdingsmodulus, N/mm²"],
              [c("δ, a"), "indringing en contactstraal, mm"], [c("z"), "tangentiële verplaatsing van het plakpunt (borstel)"],
              [c("χ"), "kleine normale demping (Hunt-Crossley), s/mm"]],
        live,
        ass: ["Het vlak is star en vast; de bal duwt alleen (geen kracht bij loslaten).", "Hysterese ontstaat doordat z bij slip blijft staan: heen en terug geeft een verschuiving.",
              "FRF: alleen Hertz-stijfheid (potentiële energie), geen tangentiële veer. Kinematisch: alleen F<sub>n</sub>."],
        src: "src/core/contact.js (contactForce), src/core/dynamics.js (loads, rk4)"
      });
    }
    case "force": {
      const th = e.ang * Math.PI / 180;
      return block({
        title: "Kracht op " + esc(name(e.node)),
        eq: [c("F = (F·cos α, F·sin α)")],
        sym: [[c("F"), "grootte in N"], [c("α"), "hoek vanaf de x-as, tegen de klok in"]],
        live: [kv("F", num(e.mag) + " N"), kv("α", num(e.ang) + "°"), kv("F<sub>x</sub>, F<sub>y</sub>", num(e.mag * Math.cos(th)) + ", " + num(e.mag * Math.sin(th)) + " N")],
        ass: ["Constant, onafhankelijk van tijd en stand."], src: "src/core/dynamics.js (loads)"
      });
    }
    case "actuator": {
      const lo = Math.min(e.min, e.max), hi = Math.max(e.min, e.max), f = e.freq || 0;
      const a = actLen(e, sim.simT);
      return block({
        title: "Actuator " + nm,
        eq: [c("L(t) = L<sub>m</sub> + L<sub>a</sub>·sin(φ<sub>0</sub> + 2πft)"),
             c("L<sub>m</sub> = (max+min)/2") + ", " + c("L<sub>a</sub> = (max−min)/2"),
             c("φ<sub>0</sub> = asin((L<sub>0</sub> − L<sub>m</sub>)/L<sub>a</sub>)") + ": op t = 0 de getekende lengte",
             "Randvoorwaarde: " + c("|p−q|² = L(t)²") + ", met " + c("L̇") + " en " + c("L̈") + " in γ"],
        sym: [[c("min, max"), "kortste en langste lengte"], [c("f"), "frequentie in Hz"], [c("L<sub>0</sub>"), "getekende lengte"]],
        live: [kv("min – max", num(lo) + " – " + num(hi) + " mm"), kv("f", num(f) + " Hz"),
               kv("L<sub>m</sub>, L<sub>a</sub>", num((hi + lo) / 2) + ", " + num((hi - lo) / 2) + " mm"),
               kv("L bij t = " + num(sim.simT, 2) + " s", num(a.L) + " mm")],
        ass: ["Sinus; bij f = 0 of min = max staat hij stil op de getekende lengte."], src: "src/core/elements.js (actLen)"
      });
    }
    case "link":
      if (e.driver) {
        const om = (e.cw ? -1 : 1) * (e.rpm || 0) * Math.PI / 30;
        return block({
          title: "Kruk " + nm,
          eq: [c("θ = θ<sub>0</sub> + ωt"), c("p = A + L·(cos θ, sin θ)"), c("v = ω·(−r<sub>y</sub>, r<sub>x</sub>)") + ", " + c("a = −ω²r")],
          sym: [[c("ω"), "hoeksnelheid = toerental·π/30, rad/s"], [c("r"), "vector van het draaipunt naar de tip"]],
          live: [kv("L", num(e.len) + " mm"), kv("θ<sub>0</sub>", num(e.theta0 || 0) + "°"), kv("ω", num(om) + " rad/s (" + num(e.rpm || 0) + " rpm, " + (e.cw ? "rechtsom" : "linksom") + ")")],
          ass: ["Constant toerental."], src: "src/core/elements.js (omega), src/core/kinematics.js"
        });
      }
      return block({
        title: "Stang " + nm,
        eq: [c("|p − q|² = L²"), "Tweekrachtenstaaf: alleen axiale kracht N"],
        sym: [[c("L"), "stanglengte"], [c("N"), "stangkracht (trek positief)"]],
        live: [kv("L", num(e.len) + " mm"), kv("L nu", num(L) + " mm")],
        src: "src/core/kinematics.js"
      });
  }
  return "";
}

/* ---------- renderen ---------- */
let lastKey = "", sweepIds = new WeakMap(), sweepN = 0, wired = false;
const sweepId = s => { if (!s) return 0; let i = sweepIds.get(s); if (!i) sweepIds.set(s, i = ++sweepN); return i; };

function keyOf() {
  const sel = ui.sel ? E(ui.sel.id) || N(ui.sel.id) : null;
  return [model.mode, model.durMode, ui.sel ? ui.sel.kind + ui.sel.id : "", sweepId(sim.sweep), !!sim.job, ui.dynStale, sim.solveOK,
    model.nodes.length, model.elems.length, model.gravity, model.dtStep, model.simDur, model.defMass, model.cVisc, model.maxT,
    model.jointDamp, model.cJoint, model.fricVs, model.fricVe, model.frfIn, model.mode === "kin" ? ui.frame : 0,
    sel ? JSON.stringify(sel) : "", sel && sel.type === "contact" ? ui.frame : 0, model.mode === "kin" ? model.nodes.map(n => n.x + "," + n.y).join(";") : ""].join("|");
}

export function renderHow(el) {
  if (!el || el.offsetParent === null) return;         // tabblad niet zichtbaar
  const ph = document.getElementById("howPlaceholder");
  if (ph) ph.hidden = true;
  if (!wired) {
    wired = true;
    el.addEventListener("click", ev => {
      const b = ev.target.closest(".hw-copy");
      if (!b) return;
      const t = copies[+b.dataset.i];
      const done = ok => { b.textContent = ok ? "Gekopieerd" : "Mislukt"; setTimeout(() => { b.textContent = "Kopieer"; }, 1400); };
      try {
        navigator.clipboard.writeText(t).then(() => done(true), () => done(false));
      } catch (_) { done(false); }
    });
  }
  const key = keyOf();
  if (key === lastKey && el.firstChild) return;
  lastKey = key;
  copies = [];
  let h;
  if (model.mode === "frf") h = [frfBlock()];
  else if (model.mode === "dyn") h = dynBlocks();
  else h = [kinBlock()];
  const extra = selBlock();
  el.innerHTML = h.join("") + (extra ? '<div class="hw-sel">Geselecteerd onderdeel</div>' + extra : "");
}
