// Voorbeelden.
import { contactDefaults, deltaFor } from "../core/contact.js";
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
const G0 = 9.81;
function addContact(nodeId, ax, ay, ang, c0) {
  const e = { id: eid(), type: "contact", node: nodeId, ...c0, ax, ay, ang };
  model.elems.push(e);
  return e;
}
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
   Metadata voor de bibliotheek: titel, categorie, rekenmodus(sen),
   korte beschrijving en de uitleg die na het laden verschijnt.
   cat: mech | dyn | frf | fric | empty;  modes: kin | dyn | equil | frf
   ============================================================ */
export const CATEGORIES = [
  { id: "all", nm: "Alles" },
  { id: "mech", nm: "Mechanismen" },
  { id: "dyn", nm: "Dynamica" },
  { id: "frf", nm: "Frequentie (FRF)" },
  { id: "fric", nm: "Wrijving & speling" },
  { id: "flex", nm: "Flexures" },
  { id: "empty", nm: "Leeg" }
];
export const MODE_NAMES = { kin: "Kinematisch", dyn: "Dynamisch", equil: "Evenwicht", frf: "FRF" };
export const EXAMPLE_META = {
  fourbar: {
    title: "Vierstangenmechanisme", cat: "mech", modes: ["kin"],
    desc: "Kruk, koppelstang en tuimelaar met een koppelpunt dat een kromme volgt.",
    text: "Eén kruk drijft het hele mechanisme aan; het koppelpunt E beschrijft een gesloten kromme. Druk op Afspelen of sleep de schuif onderin. Sleep daarna punt E of een scharnier en kijk hoe de baan verandert."
  },
  slidercrank: {
    title: "Slinger-krukmechanisme", cat: "mech", modes: ["kin"],
    desc: "Draaiende kruk die een glijder heen en weer beweegt, zoals in een motor.",
    text: "De draaiende kruk maakt van een cirkelbeweging een rechte heen-en-weerbeweging van de glijder. Kijk in Metingen naar de versnelling van de glijder: die is niet symmetrisch. Maak de drijfstang korter en zie hoe dat verschil groter wordt."
  },
  compressor: {
    title: "Slinger-kruk met veer", cat: "mech", modes: ["kin"],
    desc: "Slinger-krukmechanisme met een veer tegen de glijder, als in een compressor.",
    text: "De glijder duwt tegen een veer, dus het koppel dat de kruk nodig heeft wisselt sterk per stand. Bekijk de grafiek van het krukkoppel en de veerkracht. Probeer een stijvere veer en kijk hoe de koppelpiek groeit."
  },
  fivebar: {
    title: "Vijfstang, twee motoren", cat: "mech", modes: ["kin"],
    desc: "Twee aangedreven krukken sturen één punt door het vlak.",
    text: "Met twee motoren heeft dit mechanisme twee vrijheidsgraden, beide ingevuld door een kruk. Punt C volgt een baan die van beide hoeken afhangt. Pas het toerental van een kruk aan bij Eigenschappen en zie hoe de baan van vorm wisselt."
  },
  hoeken: {
    title: "Hoeken-rechtgeleiding", cat: "mech", modes: ["kin"],
    desc: "Koppelpunt dat een stuk bijna rechtlijnig beweegt.",
    text: "Het koppelpunt E volgt een baan met een bijna rechte lijn, zonder dat er een glijder aan te pas komt. Kijk in Metingen naar de hoogte y en snelheid vx van E. Sleep een scharnier een beetje en zie hoe snel de rechte lijn verdwijnt."
  },
  jansen: {
    title: "Jansen-poot (Strandbeest)", cat: "mech", modes: ["kin"],
    desc: "Loopmechanisme van Theo Jansen met een voet die een platte baan volgt.",
    text: "De voet H loopt onderlangs een bijna vlak stuk en zwaait daarna omhoog, als een stap. De grafiek toont de baan van de voet: y tegen x. Verander een staaflengte en kijk hoe de stap slechter of beter wordt."
  },
  liftarm: {
    title: "Hefarm met actuator", cat: "mech", modes: ["kin"],
    desc: "Arm met een last, opgetild door een lineaire actuator.",
    text: "De actuator wordt langer en korter en tilt zo de arm met de last op. In Metingen zie je de actuatorkracht en de hoogte van de last. Verplaats het onderste scharnier van de actuator en kijk hoeveel kracht je daarmee bespaart."
  },
  springload: {
    title: "Veerslinger", cat: "dyn", modes: ["dyn"],
    desc: "Slinger met een veer en zwaartekracht die vanzelf gaat zwaaien.",
    text: "Hier bepalen de veer en de zwaartekracht de beweging, niet een kruk. Speel de uitkomst af en bekijk de hoogte van punt B in Metingen. Maak de veer zwakker of stijver bij Eigenschappen en zie hoe de zwaaitijd verandert."
  },
  doublependulum: {
    title: "Dubbele slinger", cat: "dyn", modes: ["dyn"],
    desc: "Twee gekoppelde slingers waarvan de beweging chaotisch wordt.",
    text: "Een kleine verandering in de beginstand geeft na enkele seconden een heel andere beweging. De spoorlijn van het onderste punt laat dat goed zien. Sleep het mechanisme op t = 0 een tikje anders en bereken opnieuw."
  },
  settle: {
    title: "Arm die tot rust komt", cat: "dyn", modes: ["dyn", "equil"],
    desc: "Arm met veer en demping, doorgerekend tot hij stilhangt.",
    text: "Met demping in de scharnieren zwaait de arm uit tot hij in evenwicht hangt. De rekenduur volgt vanzelf uit het moment waarop hij tot rust komt. Zet de demping lager bij Instellingen en kijk hoeveel langer het duurt."
  },
  shaker: {
    title: "Massa-veer met actuator", cat: "dyn", modes: ["dyn"],
    desc: "Massa op een veer en demper, aangestoten door een actuator.",
    text: "De actuator schudt het ene uiteinde en de massa volgt via veer en demper. Staat de frequentie dicht bij de eigenfrequentie van massa en veer, dan wordt de uitslag veel groter. Pas de frequentie van de actuator aan en vergelijk de uitslag van de massa."
  },
  steamL: {
    title: "Stoommachine", cat: "dyn", modes: ["dyn"],
    desc: "Actuator en veer sturen via een kruiskop een kruk met vliegwielmassa.",
    text: "De actuator speelt de stoomdruk en de veer geeft die kracht door aan kruiskop en drijfstang. De kruk met zware massa werkt als vliegwiel. Kijk in Metingen naar de x-positie van de krukpen en probeer een andere massa."
  },
  frictionslide: {
    title: "Blok op helling met wrijving", cat: "fric", modes: ["dyn"],
    desc: "Blok op een schuine baan: blijft het plakken of glijdt het?",
    text: "De wrijving heeft een statische en een dynamische waarde, dus het blok kan blijven plakken en daarna losschieten. Kijk naar de normaalkracht en de snelheid in Metingen. Zet de statische wrijving hoger of lager bij het punt en zie waar het omslaat."
  },
  gaplimit: {
    title: "Slinger met speling en aanslag", cat: "fric", modes: ["dyn"],
    desc: "Slinger die vrij beweegt tot hij tegen een aanslag klapt.",
    text: "Binnen de speling is de slinger vrij; daarbuiten klapt hij tegen de aanslag en wordt de veerkracht groot. De grafiek van de aanslagkracht toont dat als scherpe pieken. Maak de speling groter of kleiner bij Eigenschappen en vergelijk het effect."
  },
  shakerfrf: {
    title: "Massa-veer: overdracht", cat: "frf", modes: ["frf"],
    desc: "Frequentieresponsie van actuator naar massa met een duidelijke resonantie.",
    text: "In plaats van in de tijd zie je hier hoe sterk de massa reageert per frequentie. De piek ligt bij de eigenfrequentie, ongeveer 3,6 Hz. Maak de massa zwaarder of de veer zwakker en zie de piek naar links schuiven."
  },
  pendfrf: {
    title: "Slinger aan een kracht", cat: "frf", modes: ["frf"],
    desc: "Frequentieresponsie van een slinger met zwaartekracht als stijfheid.",
    text: "Een horizontale kracht stoot de slinger aan; de zwaartekracht werkt als veer. De resonantie ligt bij de slingerfrequentie, die alleen van de lengte afhangt. Verleng de slinger en kijk hoe de piek omlaag in frequentie gaat."
  },
  virtualplay: {
    title: "Virtuele speling", cat: "fric", modes: ["dyn"],
    desc: "Stalen bal in een V-groef, heen en weer getrokken: plakken en slippen geeft een hysteresislus.",
    text: "De bal ligt met zo'n 100 N per flank in de groef, dus er is geen echte speling. Toch wijkt de bal een paar micrometer op de heenweg anders af dan op de terugweg, doordat de contacten eerst plakken en dan slippen. Plot de x-positie tegen de trekkracht: de lus is de virtuele speling. Maak \u03bc of de voorspanning kleiner en zie hoe de lus verandert."
  },
  preload: {
    title: "Voorspanning en stijfheid", cat: "fric", modes: ["dyn"],
    desc: "Bal op een hard vlak, voorgespannen door een zachte veer en weggetrokken met een oplopende kracht.",
    text: "Zolang de trekkracht kleiner is dan de voorspanning (50 N) beweegt de bal nauwelijks: het harde contact en de veer werken samen. Bij F = F\u209a komt de bal los en blijft alleen de zachte veer over, dus de grafiek van verplaatsing tegen kracht knikt. De voorspanning bepaalt dus het krachtbereik waarin de hoge stijfheid geldt. Pas de veerstijfheid of voorspanning aan en zie de knik schuiven."
  },
  parallelguide: {
    title: "Parallelgeleiding met bladveren", cat: "flex", modes: ["frf", "dyn"],
    desc: "Tafel op twee parallelle bladveren, aangestoten door een kracht; de FRF geeft de eerste eigenfrequentie.",
    text: "Twee bladveren van 50 \u00d7 20 \u00d7 0,5 mm (staal) geleiden de tafel; elk blad is getekend als twee halve bladen met een draaiveer (Howell, PRBM). Analytisch is c\u2093 = 2\u00b712EI/L\u00b3 = 8,40 N/mm; het PRBM geeft 8,71 N/mm, ongeveer 4 % stijver (K\u0398/(3\u03b3) = 1,039 in de theorie). De FRF vindt de eerste eigenfrequentie op 46,8 Hz, tegen 46,1 Hz analytisch voor 0,1 kg. Verklein de dikte t en kijk hoe de spanning \u03c3 bij de flexure meegroeit."
  },
  empty: {
    title: "Leeg canvas", cat: "empty", modes: ["kin"],
    desc: "Begin helemaal opnieuw met een leeg canvas.",
    text: "Kies links een gereedschap en teken punten en schakels. Zet een punt vast met Scharnier en maak een schakel tot kruk met Aandrijving. Kies bovenin de modus waarmee je wilt rekenen."
  }
};
