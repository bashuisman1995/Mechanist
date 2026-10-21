// Gedeelde toestand: het model en alle veranderlijke waarden die meerdere modules delen (zonder DOM).
export const nid = () => "n" + (sim.uid++);
export const eid = () => "e" + (sim.uid++);

export const model = {
  nodes: [],     // {id,x,y,support:'free'|'pin'|'slider', dir:deg, m:kg, name}
  elems: [],     // link | spring | damper | force
  snap: true,
  grid: 10,
  rigidDrag: false,
  series: [], gravity: false, showForces: true,
  mode: "kin", simDur: 2, dtStep: 0.2, defMass: 0.1, xAxis: "time",
  railSlim: false, drawerOpen: true, drawerH: 232, tab: "props",
  autoSolve: false, durMode: "fixed", cVisc: 0, maxT: 30,
  jointDamp: false, cJoint: 0.05, frfIn: "", frfMin: 0, frfMax: 0, fricVs: 5, fricVe: 2,
  stiffPath: [], stiffQ: ["ux", "uy"],           // Stijfheid: balken van het pad (volgorde) en de uitgezette grootheden
  stiffNode: "", stiffAng: 90, stiffScale: 0,   // Stijfheid: punt en richting voor "stijfheid in punt", vergroting (0 = auto)
  dT: 0, thermNode: "",     // temperatuurverschil (K) voor alle staven en het punt waarvan we de thermische verschuiving tonen
  name: "Untitled"
};

/* ---------- view ---------- */
export const view = { s: 2.2, ox: 0, oy: 0 };   // screen = world*s + o  (y flipped)

export const sim = {
  uid: 1,
  simT: 0,
  lenOv: null,
  solveOK: true,
  sweep: null,
  frfMsg: "",
  CH: [],
  CHM: new Map(),
  ALIAS: new Map(),
  ALIASN: new Map(),
  job: null,
  solved: null,
  stiff: null,       // uitkomst van de modus Stijfheid (src/core/stiffness.js)
  stiffGen: 0,
};

export const ui = {
  sel: null,  // {kind:'node'|'elem', id}
  tool: "select",
  pending: null,  // first node id while drawing a 2-node element
  hover: null,
  frame: 0,
  playing: false,
  raf: 0,
  lastT: 0,
  W: 0,
  H: 0,
  DPR: 1,
  nameCounter: 0,
  C: {},
  colorsDirty: true,
  colorGen: 0,
  pdata: null,
  hoverI: null,
  plotBox: null,
  dynStale: false,
  fitAfterSolve: false,
  lastSnap: null,
  unsaved: false,
  userEdited: false,
  stiffView: "tab",   // Stijfheid: lade toont tabellen ("tab") of het verloop langs een pad ("pad")
  stiffMode: -1,      // Stijfheid: -1 = statische vervorming, k = eigenvorm k
  stiffAmp: 1,        // momentane factor (-1..1) tijdens de animatie
};
