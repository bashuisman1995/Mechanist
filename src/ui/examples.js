// Voorbeelden.
import { contactDefaults, deltaFor } from "../core/contact.js";
import { asyncMode, N } from "../core/elements.js";
import { eid, model, sim, ui } from "../core/state.js";
import { addDsens, addNode, addTwoNode, crankAngle } from "./edit.js";
import { setModeUI } from "./options.js";
import { togglePlay } from "./playback.js";
import { cancelJob, changed, solveNow } from "./solver.js";
import { fit } from "./view.js";

/* ============================================================
   Examples
   ============================================================ */
const G0 = 9.81;
const BEAM = { beam: true, prof: "rect", mat: "staal" };          // (materiaal-id "staal" blijft zo in opgeslagen modellen) Volledig (EA + EI), rechthoekig staal
function addContact(nodeId, ax, ay, ang, c0) {
  const e = { id: eid(), type: "contact", node: nodeId, ...c0, ax, ay, ang };
  model.elems.push(e);
  return e;
}
function build(nodes, elems, after) {
  if (ui.playing) togglePlay();
  cancelJob(); sim.solved = null;
  model.nodes = []; model.elems = []; model.series = []; model.stiffPath = []; model.stiffQ = ["ux", "uy"]; sim.uid = 1; ui.nameCounter = 0;
  model.durMode = "fixed"; model.xAxis = "time";
  model.gravity = false; model.jointDamp = false; model.cVisc = 0; model.dT = 0; model.thermNode = "";
  document.getElementById("gravChk").checked = false;
  ui.frame = 0; setModeUI("kin");
  const map = {};
  nodes.forEach(spec => {
    const n = addNode({ x: spec[1], y: spec[2] });
    n.support = spec[3] || "free";
    if (spec[4] !== undefined) n.dir = spec[4];
    map[spec[0]] = n.id;
  });
  elems.forEach(spec => {
    const [type, a, b, extra] = spec;
    if (type === "force") {
      model.elems.push({ id: eid(), type: "force", node: map[a], mag: b, ang: extra });
      return;
    }
    const e = addTwoNode(type, map[a], map[b]);
    if (e && extra) Object.assign(e, extra);
  });
  for (const e of model.elems) {
    if (e.type !== "link" || !e.driver) continue;
    if (N(e.a).support !== "pin" && N(e.b).support === "pin") { const t = e.a; e.a = e.b; e.b = t; }
    if (e.theta0 === undefined) e.theta0 = crankAngle(e);
  }
  ui.sel = null; ui.pending = null;
  if (after) after(nm => model.nodes.find(n => n.name === nm));
  fit(); changed();
  if (asyncMode()) solveNow();
  // nog eens passend maken zodra de lade zijn hoogte en de beweging bekend is
  if (sim.job) ui.fitAfterSolve = true; else setTimeout(fit, 150);
}

export const EXAMPLES = {
  fourbar: () => build(
    [["A", 0, 0, "pin"], ["B", 20, 34.64], ["C", 124.2, 69.88], ["D", 120, 0, "pin"], ["E", 57.69, 94.89]],
    [["link", "A", "B", { driver: true, theta0: 60, rpm: 60, cw: false }], ["link", "B", "C"], ["link", "C", "D"],
     ["link", "B", "E"], ["link", "C", "E"]],
    g => {
      g("E").trace = true; g("C").trace = true;
      g("E").m = 0.5;
      model.series.push({ key: "n|" + g("E").id + "|v" },
                        { key: "t|" + model.elems.find(e => e.driver).id + "|T" });
    }
  ),
  slidercrank: () => build(
    [["A", 0, 0, "pin"], ["B", 25.71, 30.64], ["C", 141.73, 0, "slider", 0]],
    [["link", "A", "B", { driver: true, theta0: 50, rpm: 60, cw: false }], ["link", "B", "C"]],
    g => {
      g("C").m = 1;
      model.series.push({ key: "n|" + g("C").id + "|ax" }, { key: "r|" + g("C").id + "|Rn" });
    }
  ),
  fivebar: () => build(
    [["A", 0, 0, "pin"], ["B", 17.101, 46.985], ["C", 80, 177.632], ["D", 142.899, 46.985], ["E", 160, 0, "pin"]],
    [["link", "A", "B", { driver: true, theta0: 70, rpm: 60, cw: false }], ["link", "B", "C"],
     ["link", "C", "D"], ["link", "E", "D", { driver: true, theta0: 110, rpm: 45, cw: true }]],
    g => {
      g("C").trace = true; g("C").m = 0.8;
      const ds = model.elems.filter(e => e.driver);
      model.series.push({ key: "t|" + ds[0].id + "|T" }, { key: "t|" + ds[1].id + "|T" });
    }
  ),
  springload: () => build(
    [["A", 0, 0, "pin"], ["B", 120, 0], ["C", 0, 90, "pin"]],
    [["link", "A", "B"], ["spring", "C", "B", { k: 0.4, L0: 90 }]],
    g => {
      g("B").m = 1.5; g("B").trace = true;
      model.gravity = true; model.simDur = 3; model.dtStep = 0.2;
      setModeUI("dyn");
      document.getElementById("gravChk").checked = true;
      document.getElementById("durInp").value = 3;
      model.series.push({ key: "n|" + g("B").id + "|y" }, { key: "e||E" });
    }
  ),
  // Theo Jansen: de poot van het Strandbeest. De voet H loopt een platte baan onderlangs.
  jansen: () => build(
    [["O", 0, 0, "pin"], ["K", 15, 25.981], ["P", -76, -15.6, "pin"], ["U", -76.019, 67.4],
     ["L", -39.467, -85.194], ["T", -156.031, -10.399], ["R", -112.281, -75.938], ["V", -36.301, -183.143]],
    [["link", "O", "K", { driver: true, theta0: 60, rpm: 30, cw: true }],
     ["link", "K", "U"], ["link", "P", "U"], ["link", "K", "L"], ["link", "P", "L"],
     ["link", "P", "T"], ["link", "U", "T"], ["link", "T", "R"], ["link", "L", "R"],
     ["link", "L", "V"], ["link", "R", "V"]],
    g => {
      g("H").trace = true;
      model.series.push({ key: "n|" + g("H").id + "|y" });
      model.xAxis = "ch|n|" + g("H").id + "|x";          // de baan van de voet: y tegen x
    }
  ),
  // Hoeken: kruk-balans waarvan het koppelpunt deels een rechte lijn beschrijft
  hoeken: () => build(
    [["A", 0, 0, "pin"], ["B", -37.588, -13.681], ["C", 11.891, 73.22], ["D", 80, 0, "pin"], ["P", 73.253, 152.795]],
    [["link", "A", "B", { driver: true, theta0: 200, rpm: 30, cw: false }], ["link", "B", "C"], ["link", "C", "D"],
     ["link", "B", "P"], ["link", "C", "P"]],
    g => {
      g("E").trace = true;
      model.series.push({ key: "n|" + g("E").id + "|y" }, { key: "n|" + g("E").id + "|vx" });
    }
  ),
  compressor: () => build(
    [["A", 0, 0, "pin"], ["B", 25.71, 30.64], ["C", 141.73, 0, "slider", 0], ["D", 230, 0, "pin"]],
    [["link", "A", "B", { driver: true, theta0: 50, rpm: 120, cw: false }], ["link", "B", "C"],
     ["spring", "C", "D", { k: 2, L0: 110 }]],
    g => {
      g("C").m = 0.5;
      model.series.push({ key: "s|" + model.elems.find(e => e.type === "spring").id + "|F" },
                        { key: "t|" + model.elems.find(e => e.driver).id + "|T" });
    }
  ),
  doublependulum: () => build(
    [["A", 0, 0, "pin"], ["B", 80, 0], ["C", 160, 0]],
    [["link", "A", "B"], ["link", "B", "C"]],
    g => {
      g("B").m = 0.5; g("C").m = 0.5; g("C").trace = true;
      model.gravity = true; model.simDur = 4; model.dtStep = 0.1;
      document.getElementById("gravChk").checked = true;
      setModeUI("dyn");
      model.series.push({ key: "n|" + g("C").id + "|y" }, { key: "e||E" });
    }
  ),
  settle: () => build(
    [["A", 0, 0, "pin"], ["B", 100, 0], ["C", 170, -60], ["D", 0, 110, "pin"]],
    [["link", "A", "B"], ["link", "B", "C"], ["spring", "D", "B", { k: 0.6, L0: 100 }]],
    g => {
      g("C").m = 1; g("B").m = 0.3; g("C").trace = true;
      model.gravity = true; model.jointDamp = true; model.cJoint = 0.3; model.maxT = 30;
      document.getElementById("gravChk").checked = true;
      model.durMode = "equil";
      setModeUI("dyn");
      model.series.push({ key: "n|" + g("C").id + "|y" }, { key: "n|" + g("B").id + "|v" });
    }
  ),
  // een arm met last, opgetild door een hydraulische cilinder
  liftarm: () => build(
    [["A", 0, 0, "pin"], ["B", 140, 60], ["C", 50, -40, "pin"]],
    [["link", "A", "B"], ["actuator", "C", "B", { min: 118, max: 152, freq: 0.5 }]],
    g => {
      g("B").m = 2; g("B").trace = true;
      model.gravity = true; document.getElementById("gravChk").checked = true;
      const a = model.elems.find(e => e.type === "actuator");
      model.series.push({ key: "l|" + a.id + "|N" }, { key: "n|" + g("B").id + "|y" });
    }
  ),
  // een massa op een veer, aangestoten door een actuator: dynamisch én geschikt voor FRF
  shaker: () => build(
    [["A", 0, 0, "pin"], ["B", 80, 0, "slider", 0], ["C", 180, 0, "slider", 0]],
    [["actuator", "A", "B", { min: 76, max: 84, freq: 2 }],
     ["spring", "B", "C", { k: 0.5, L0: 100 }], ["damper", "B", "C", { c: 0.003 }]],
    g => {
      g("C").m = 1;
      model.simDur = 5; model.dtStep = 0.2;
      setModeUI("dyn");
      model.series.push({ key: "n|" + g("C").id + "|x" }, { key: "a|" + model.elems.find(e => e.type === "actuator").id + "|L" });
    }
  ),
  // hetzelfde massa-veersysteem als FRF: resonantie bij √(k/m)/2π ≈ 3,6 Hz
  shakerfrf: () => {
    EXAMPLES.shaker();
    model.mode = "frf"; model.series = [];
    const C = model.nodes.find(n => n.name === "C"), sp = model.elems.find(e => e.type === "spring");
    model.series.push({ key: "n|" + C.id + "|x" }, { key: "s|" + sp.id + "|F" });
    setModeUI("frf"); changed(); solveNow();
  },
  // een slinger (zwaartekracht als stijfheid) aangestoten door een horizontale kracht
  pendfrf: () => build(
    [["A", 0, 0, "pin"], ["B", 0, -120]],
    [["link", "A", "B"], ["force", "B", 1, 0]],
    g => {
      g("B").m = 1; model.gravity = true; model.jointDamp = true; model.cJoint = 0.02;
      document.getElementById("gravChk").checked = true;
      setModeUI("frf");
      model.series.push({ key: "n|" + g("B").id + "|x" });
    }
  ),
  // een blok op een schuine glijbaan: plakt het, of glijdt het?
  frictionslide: () => build(
    [["A", 0, 0, "slider", -25], ["B", 0, 70, "pin"]],
    [["spring", "B", "A", { k: 0.3, L0: 40 }]],
    g => {
      const A = g("A"); A.m = 1; A.mus = 0.35; A.muk = 0.2; A.trace = true;
      model.gravity = true; model.simDur = 3; model.dtStep = 0.1;
      document.getElementById("gravChk").checked = true;
      setModeUI("dyn");
      model.series.push({ key: "n|" + A.id + "|vx" }, { key: "r|" + A.id + "|Rn" });
    }
  ),
  // slinger met een aanslag: de speling laat hem vrij, tot hij er tegenaan klapt
  gaplimit: () => build(
    [["A", 0, 0, "pin"], ["B", 100, 0], ["C", 60, -100, "pin"]],
    [["link", "A", "B"], ["gap", "C", "B", { min: 95, max: 125, kc: 30, cc: 0.05 }]],
    g => {
      g("B").m = 1; g("B").trace = true; g("A").mus = 0.15; g("A").muk = 0.1; g("A").rj = 4;
      model.gravity = true; model.simDur = 3; model.dtStep = 0.1;
      document.getElementById("gravChk").checked = true;
      setModeUI("dyn");
      model.series.push({ key: "n|" + g("B").id + "|y" }, { key: "s|" + model.elems.find(e => e.type === "gap").id + "|F" });
    }
  ),
  // 2D-kinematische koppeling: een stalen bal in een V-groef (twee vlakken van ±45°), horizontaal heen en weer getrokken
  virtualplay: () => {
    const c0 = contactDefaults(), Fn = 100;                       // preload per contact, N
    const y0 = (c0.R - deltaFor(c0, Fn)) / Math.SQRT1_2;           // middelpunt op de as van de groef, met de Hertz-indringing
    build(
      [["A", 0, y0, "free"], ["B", 200, y0, "pin"], ["C", 80, y0, "slider", 0]],
      [["spring", "C", "A", { k: 2, L0: 80 }], ["actuator", "B", "C", { len: 120, min: 70, max: 170, freq: 1 }]],
      g => {
        const A = g("A"), C = g("C");
        A.y = y0; g("B").y = y0; C.y = y0; C.ax = 80; C.ay = y0;
        A.m = 2 * Fn * Math.SQRT1_2 / G0;                          // gewicht = twee flankkrachten (verticaal)
        addContact(A.id, 0, 0, -45, c0); addContact(A.id, 0, 0, 45, c0);
        model.gravity = true; model.simDur = 2; model.dtStep = 0.2;
        document.getElementById("gravChk").checked = true;
        setModeUI("dyn");
        const sp = model.elems.find(e => e.type === "spring");
        model.series.push({ expr: "A.x*1000" }, { key: "c|" + model.elems.find(e => e.type === "contact").id + "|Ft" });
        model.xAxis = "ch|s|" + sp.id + "|F";                      // x tegen de trekkracht: de hysteresislus
      }
    );
  },
  // een zachte voorspanveer drukt een bal op een hard vlak; een kracht trekt hem eraf: knik in de stijfheid
  preload: () => {
    const c0 = contactDefaults(), Fp = 50, ks = 10, R = c0.R;
    build(
      [["A", 0, 0, "slider", 90], ["B", 0, -60, "pin"], ["C", 0, 200, "pin"], ["D", 0, 20, "slider", 90]],
      [["spring", "A", "B", { k: ks, L0: 60 - Fp / ks }], ["spring", "D", "A", { k: 1, L0: 20 }],
       ["actuator", "C", "D", { len: 180, min: 75, max: 180, freq: 0.1 }]],
      g => {
        g("A").m = 5;
        addContact(g("A").id, 0, -R + deltaFor(c0, Fp), 0, c0);
        model.simDur = 5; model.dtStep = 0.25;
        setModeUI("dyn");
        const pull = model.elems.filter(e => e.type === "spring")[1];
        model.series.push({ expr: "A.y*1000" });
        model.xAxis = "ch|s|" + pull.id + "|F";                    // verplaatsing tegen de trekkracht
      }
    );
  },
  // parallelgeleiding op twee bladveren; elk blad (L = 50 mm) is twee halve bladen van 25 mm met het buigpunt (S-vorm) ertussen,
  // dus de PRBM-uitkraging van Howell is exact waar hij voor bedoeld is: een kracht aan de tip, zonder moment
  parallelguide: () => build(
    [["A", 0, 0, "pin"], ["B", 40, 0, "pin"], ["C", 0, 21.25], ["D", 40, 21.25], ["E", 0, 42.5], ["F", 40, 42.5]],
    [["link", "E", "F"],
     ["flexure", "A", "C", { wd: 20, t: 0.5 }], ["flexure", "E", "C", { wd: 20, t: 0.5 }],
     ["flexure", "B", "D", { wd: 20, t: 0.5 }], ["flexure", "F", "D", { wd: 20, t: 0.5 }],
     ["force", "E", 1, 0]],
    g => {
      g("C").m = 0.002; g("D").m = 0.002; g("E").m = 0.05; g("F").m = 0.05;
      setModeUI("frf");
      const fx = model.elems.filter(e => e.type === "flexure")[0];
      model.series.push({ key: "n|" + g("E").id + "|x" }, { key: "f|" + fx.id + "|sig" });
    }
  ),
  // massa-veer op een zachte krachtopnemer: A (wand) - krachtopnemer - B (opspanning) - veer - C (massa)
  loadcell: () => build(
    [["A", 0, 0, "pin"], ["B", 50, 0, "slider", 0], ["C", 100, 0, "slider", 0]],
    [["loadcell", "A", "B", { ks: 50, m: 0 }], ["spring", "B", "C", { k: 10 }], ["damper", "B", "C", { c: 0.02 }],
     ["force", "C", 1, 0]],
    g => {
      g("B").m = 0.001; g("C").m = 1;
      model.dtStep = 0.05; model.simDur = 0.3;
      const lc = model.elems.find(e => e.type === "loadcell");
      addDsens(g("C").id, "");
      setModeUI("frf");
      model.series.push({ key: "n|" + g("C").id + "|x" }, { key: "s|" + lc.id + "|F" }, { key: "m|" + lc.id + "|d" });
    }
  ),
  // meetarm: een aluminium en een stalen staaf dragen de tip van een tastarm; ΔT = 5 K
  thermarm: () => build(
    [["A", 0, 0, "pin"], ["B", 0, 50, "pin"], ["C", 150, 25]],
    [["link", "A", "C", { mat: "alu" }], ["link", "B", "C", { mat: "staal" }]],
    g => { model.dT = 5; model.thermNode = g("C").id; }
  ),
  // athermische meetarm, gevouwen (re-entrant): stalen staaf A->B (300 mm) naar rechts; B glijdt langs de x-as. Daar vouwt de aluminium staaf B->C
  // terug naar links naar de tip C, die 15 mm hoger in een horizontale geleiding glijdt. Tip-drift = (α_staal·L_AB − α_alu·L_BC²/x_BC)·ΔT, met x_BC de
  // horizontale afstand B-C (L_BC·cos φ, φ ~ 5°): nul bij L_BC/L_AB ≈ α_staal/α_alu. Begint bij C op x = 100 mm: drift −13 µm bij 10 K.
  athermarm: () => build(
    [["A", 0, 0, "pin"], ["B", 300, 0, "slider", 0], ["C", 100, 15, "slider", 0]],
    [["link", "A", "B", { mat: "staal" }], ["link", "B", "C", { mat: "alu" }]],
    g => { model.dT = 10; model.thermNode = g("C").id; }
  ),
  // twee axiale stalen staven (100 mm, 2 mm²) tussen twee vaste punten, ΔT = 20 K: thermische drukspanning in Evenwicht
  thermclamp: () => build(
    [["A", 0, 0, "pin"], ["B", 100, 0, "slider", 0], ["C", 200, 0, "pin"]],
    [["link", "A", "B", { axial: true, A: 2, mat: "staal" }], ["link", "B", "C", { axial: true, A: 2, mat: "staal" }]],
    g => {
      g("B").m = 0.5;
      model.dT = 20; model.cVisc = 3; model.dtStep = 0.02; model.simDur = 0.05;
      model.durMode = "equil"; setModeUI("dyn");
      const bs = model.elems.filter(e => e.type === "link");
      model.series.push({ key: "s|" + bs[0].id + "|F" }, { key: "w|" + bs[0].id + "|sig" });
    }
  ),
  // Stijfheid: staalbalk 20 × 3 mm, 200 mm lang, ingeklemd links, kracht 5 N aan de tip; tussenpunt M voor sensoren of lasten
  stiffcant: () => build(
    [["A", 0, 0, "pin"], ["M", 100, 0], ["C", 200, 0]],
    [["link", "A", "M", { ...BEAM, pb: 20, ph: 3 }], ["link", "M", "C", { ...BEAM, pb: 20, ph: 3 }], ["force", "C", 5, -90]],
    g => { g("A").clamp = true; setModeUI("stiff"); model.stiffNode = g("C").id; model.stiffAng = -90; }
  ),
  // geleide bladveer 10 × 0,3 mm, L = 40 mm: één ingeklemd, het andere uiteinde draait niet en glijdt loodrecht; k = 12EI/L³
  stiffleaf: () => build(
    [["A", 0, 0, "pin"], ["B", 40, 0, "slider", 90]],
    [["link", "A", "B", { ...BEAM, pb: 10, ph: 0.3 }], ["force", "B", 0.3, 90]],
    g => { g("A").clamp = true; g("B").clamp = true; setModeUI("stiff"); model.stiffNode = g("B").id; model.stiffAng = 90; }
  ),
  // portaal: twee ingeklemde kolommen en een dwarsbalk, momentvaste hoeken (Star), horizontale kracht op de linkerhoek
  stiffportal: () => build(
    [["A", 0, 0, "pin"], ["B", 0, 100], ["C", 120, 100], ["D", 120, 0, "pin"]],
    [["link", "A", "B", { ...BEAM, pb: 10, ph: 1.5 }], ["link", "B", "C", { ...BEAM, pb: 10, ph: 1.5 }], ["link", "D", "C", { ...BEAM, pb: 10, ph: 1.5 }], ["force", "B", 5, 0]],
    g => { g("A").clamp = true; g("D").clamp = true; setModeUI("stiff"); model.stiffNode = g("B").id; model.stiffAng = 0; }
  ),
  // stijve arm (Oneindig) momentvast aan een elastische balk op een scharnier met torsieveer
  stiffmixed: () => build(
    [["A", 0, 0, "pin"], ["B", 60, 0], ["C", 60, 50]],
    [["link", "A", "B", { ...BEAM, pb: 10, ph: 0.6 }], ["link", "B", "C"], ["force", "C", 0.2, 0]],
    g => { g("A").joint = "spring"; g("A").kth = 500; setModeUI("stiff"); model.stiffNode = g("C").id; model.stiffAng = 0; }
  ),
  // stoommachine: actuator → veer → kruiskop → drijfstang → kruk met vliegwielmassa;
  // de kant van het dode punt waar de krukpen start bepaalt de draairichting
  steamL: () => steam(1),
  empty: () => build([], [])
};
function steam(s) {
  build(
    [["A", 0, 0, "pin"], ["B", -5.21, 29.54 * s], ["C", 90.31, 0, "slider", 0],
     ["E", 150, 0, "slider", 0], ["D", 230, 0, "pin"]],
    [["link", "A", "B"], ["link", "B", "C"], ["spring", "C", "E", { k: 1, L0: 59.69 }],
     ["actuator", "D", "E", { min: 50, max: 110, freq: 1 }]],
    g => {
      g("B").m = 2; g("B").trace = true; g("C").m = 0.2;
      model.simDur = 4; model.dtStep = 0.2;
      setModeUI("dyn");
      model.series.push({ key: "n|" + g("B").id + "|x" }, { key: "s|" + model.elems.find(e => e.type === "spring").id + "|F" });
    }
  );
}

/* ============================================================
   Metadata voor de bibliotheek: categorie en rekenmodus(sen).
   cat: mech | dyn | frf | fric | empty;  modes: kin | dyn | equil | frf
   ============================================================ */
export const CATEGORIES = [
  { id: "all" }, { id: "mech" }, { id: "dyn" }, { id: "frf" }, { id: "fric" }, { id: "flex" },
  { id: "sens" }, { id: "therm" }, { id: "stiff" }, { id: "opt" }, { id: "empty" }
];
// Titel, beschrijving en uitleg staan in lang/examples.js onder ex.<id>.title / .desc / .text
export const EXAMPLE_META = {
  fourbar: { cat: "mech", modes: ["kin"] },
  slidercrank: { cat: "mech", modes: ["kin"] },
  compressor: { cat: "mech", modes: ["kin"] },
  fivebar: { cat: "mech", modes: ["kin"] },
  hoeken: { cat: "mech", modes: ["kin"] },
  jansen: { cat: "mech", modes: ["kin"] },
  liftarm: { cat: "mech", modes: ["kin"] },
  springload: { cat: "dyn", modes: ["dyn"] },
  doublependulum: { cat: "dyn", modes: ["dyn"] },
  settle: { cat: "dyn", modes: ["dyn", "equil"] },
  shaker: { cat: "dyn", modes: ["dyn"] },
  steamL: { cat: "dyn", modes: ["dyn"] },
  frictionslide: { cat: "fric", modes: ["dyn"] },
  gaplimit: { cat: "fric", modes: ["dyn"] },
  shakerfrf: { cat: "frf", modes: ["frf"] },
  pendfrf: { cat: "frf", modes: ["frf"] },
  virtualplay: { cat: "fric", modes: ["dyn"] },
  preload: { cat: "fric", modes: ["dyn"] },
  parallelguide: { cat: "flex", modes: ["frf", "dyn"] },
  loadcell: { cat: "sens", modes: ["frf", "dyn"] },
  thermarm: { cat: "therm", modes: ["kin"] },
  athermarm: { cat: "opt", modes: ["kin"] },
  thermclamp: { cat: "therm", modes: ["dyn", "equil"] },
  stiffcant: { cat: "stiff", modes: ["stiff"] },
  stiffleaf: { cat: "stiff", modes: ["stiff"] },
  stiffportal: { cat: "stiff", modes: ["stiff"] },
  stiffmixed: { cat: "stiff", modes: ["stiff"] },
  empty: { cat: "empty", modes: ["kin"] }
};
