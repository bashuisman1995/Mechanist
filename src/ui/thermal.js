// Resultaat "Thermische verschuiving": Δx, Δy van een gekozen punt door ΔT, met een gevoeligheidsgrafiek per staaf.
import { dTOf, isThermal, matOf } from "../core/axial.js";
import { N } from "../core/elements.js";
import { thermalNode, thermalShift } from "../core/thermal.js";
import { model } from "../core/state.js";
import { save } from "./persist.js";

const nl = s => String(s).replace(".", ",");
const um = v => { const x = v * 1000; return (x >= 0 ? "+" : "−") + nl(Math.abs(x) >= 100 ? Math.abs(x).toFixed(0) : Math.abs(x) >= 10 ? Math.abs(x).toFixed(1) : Math.abs(x).toFixed(2)); };
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// is er een temperatuurverschil dat iets doet?
export const thermalOn = () => model.elems.some(e => isThermal(e) && dTOf(e) !== 0);

let skel = "";
export function renderThermal() {
  const box = document.getElementById("thermBox"); if (!box) return;
  const nd = thermalNode();
  if (model.mode !== "kin" || !nd || !thermalOn()) { box.hidden = true; return; }
  box.hidden = false;
  const free = model.nodes.filter(n => n.support !== "pin");
  const key = free.map(n => n.id + n.name).join(",") + "|" + nd.id;
  if (key !== skel || !document.getElementById("thNode")) {
    skel = key;
    box.innerHTML = '<h2>Thermische verschuiving</h2>' +
      '<div class="row"><label for="thNode">Punt</label><select id="thNode">' +
      free.map(n => '<option value="' + n.id + '"' + (n.id === nd.id ? " selected" : "") + ">" + esc(n.name) + "</option>").join("") + "</select></div>" +
      '<div class="thres" id="thRes"></div><div id="thChart"></div>';
    document.getElementById("thNode").addEventListener("change", ev => { model.thermNode = ev.target.value; save(); renderThermal(); });
  }
  const r = thermalShift(nd.id);
  const res = document.getElementById("thRes");
  if (!r.ok) {
    res.innerHTML = '<span class="thbad">Niet eenduidig te berekenen: het mechanisme moet bepaald zijn (vrijheidsgraden = 0). Overbepaald? Gebruik axiale staven en Evenwicht voor thermische spanning.</span>';
    document.getElementById("thChart").innerHTML = ""; return;
  }
  res.innerHTML = "Δx <b id=\"thDx\">" + um(r.dx) + "</b> µm · Δy <b id=\"thDy\">" + um(r.dy) + "</b> µm · |Δ| <b id=\"thD\">" +
    nl((Math.hypot(r.dx, r.dy) * 1000).toPrecision(3)) + "</b> µm";
  document.getElementById("thChart").innerHTML = chart(r);
}

// horizontale staafgrafiek: per staaf de bijdrage ∂x/∂L·α·L·ΔT (µm) aan Δx en Δy
function chart(r) {
  if (!r.parts.length) return "";
  const W = 264, rowH = 34, top = 18, mid = 138, scaleW = 96;
  const max = Math.max(1e-9, ...r.parts.map(p => Math.max(Math.abs(p.cx), Math.abs(p.cy)))) * 1000;
  const H = top + r.parts.length * rowH + 6;
  const bar = (v, y, col) => {
    const w = Math.abs(v) * 1000 / max * scaleW, x = v >= 0 ? mid : mid - w;
    return '<rect x="' + x.toFixed(1) + '" y="' + y + '" width="' + Math.max(w, 0.6).toFixed(1) + '" height="7" rx="1.5" style="fill:' + col + '"></rect>' +
      '<text x="' + (v >= 0 ? mid + w + 4 : mid - w - 4) + '" y="' + (y + 6.5) + '" text-anchor="' + (v >= 0 ? "start" : "end") + '" class="thv">' + um(v) + "</text>";
  };
  let g = '<text x="' + mid + '" y="10" text-anchor="middle" class="thl">bijdrage in µm</text>' +
    '<line x1="' + mid + '" y1="' + (top - 4) + '" x2="' + mid + '" y2="' + (H - 4) + '" style="stroke:var(--line-2)"></line>';
  r.parts.forEach((p, i) => {
    const y = top + i * rowH, e = p.e, A = N(e.a), B = N(e.b), nm = (A ? A.name : "?") + (B ? B.name : "?");
    g += '<g><title>' + esc(nm) + ': ∂x/∂L = ' + nl(p.sx.toFixed(3)) + ', ∂y/∂L = ' + nl(p.sy.toFixed(3)) + ', ΔL = ' + nl((p.dL * 1000).toFixed(2)) + ' µm</title>' +
      '<text x="0" y="' + (y + 8) + '" class="thl thn">' + esc(nm) + " · " + esc(matOf(e).naam.split(" ")[0]) + "</text>" +
      bar(p.cx, y + 12, "var(--spring)") + bar(p.cy, y + 21, "var(--driver)") + "</g>";
  });
  return '<svg class="thsvg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Bijdrage per staaf aan de thermische verschuiving">' + g + "</svg>" +
    '<div class="thleg"><span><i style="background:var(--spring)"></i>x</span><span><i style="background:var(--driver)"></i>y</span> ' +
    "∂x/∂L·α·L·ΔT per staaf</div>";
}
