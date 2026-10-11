// Voorbeelden.
import { asyncMode, N } from "../core/elements.js";
import { eid, model, sim, ui } from "../core/state.js";
import { addNode, addTwoNode, crankAngle } from "./edit.js";
import { setModeUI } from "./options.js";
import { togglePlay } from "./playback.js";
import { cancelJob, changed, solveNow } from "./solver.js";
import { fit } from "./view.js";

/* ============================================================
   Examples
   ============================================================ */
function build(nodes, elems, after) {
  if (ui.playing) togglePlay();
  cancelJob(); sim.solved = null;
  model.nodes = []; model.elems = []; model.series = []; sim.uid = 1; ui.nameCounter = 0;
  model.durMode = "fixed"; model.xAxis = "time";
  model.gravity = false; model.jointDamp = false; model.cVisc = 0;
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
