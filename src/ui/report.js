// Rekenblad: een schone A4-afdrukweergave (eigen printstijl) met Afdrukken/PDF en Kopieer als tekst.
// Gedeeld door de schets en de Calculators; de inhoud komt als secties van HTML binnen.
export const FOOT = "Thalomex Precision Toolbox — controleer kritische waarden altijd onafhankelijk";

export const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// versie van de app en (indien bij het bouwen bekend) de git-hash
export function buildInfo() {
  const ver = (document.querySelector(".brand .ver") || {}).textContent || "";
  const m = document.querySelector('meta[name="mech-build"]');
  const hash = m && /^[0-9a-f]{4,40}$/i.test(m.content) ? m.content : "";
  return { ver, hash, text: (ver || "onbekende versie") + (hash ? " · " + hash : "") };
}
export function dateText() {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

let root = null, prevTitle = "", prevFocus = null;
function ensure() {
  if (root) return root;
  root = document.createElement("div");
  root.id = "report"; root.hidden = true;
  root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", "Rekenblad");
  root.innerHTML = '<div class="rep-bar"><b>Rekenblad</b><span class="rep-grow"></span><span id="repMsg" role="status" aria-live="polite"></span>' +
    '<button type="button" class="btn primary" id="repPrint" title="Afdrukken of bewaren als PDF (A4)">Afdrukken / PDF</button>' +
    '<button type="button" class="btn" id="repCopy" title="Het hele rekenblad als platte tekst naar het klembord">Kopieer als tekst</button>' +
    '<button type="button" class="btn" id="repClose" title="Sluiten (Esc)">Sluiten</button></div>' +
    '<article class="rep-page" id="repPage"></article>';
  document.body.appendChild(root);
  root.querySelector("#repClose").addEventListener("click", closeReport);
  root.querySelector("#repPrint").addEventListener("click", () => { window.print(); });
  root.querySelector("#repCopy").addEventListener("click", () => {
    const t = textOf();
    toClipboard(t).then(ok => msg(ok ? "Gekopieerd (" + t.split("\n").length + " regels)." : "Kopiëren geweigerd door de browser."));
  });
  document.addEventListener("keydown", ev => { if (ev.key === "Escape" && !root.hidden) { ev.stopPropagation(); closeReport(); } }, true);
  return root;
}
let customText = "";
function msg(t) { const m = document.getElementById("repMsg"); m.textContent = t; setTimeout(() => { if (m.textContent === t) m.textContent = ""; }, 2500); }
function toClipboard(t) {
  const fallback = () => {
    try {
      const ta = document.createElement("textarea"); ta.value = t; ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok;
    } catch (_) { return false; }
  };
  try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(() => true, () => fallback()); } catch (_) { /* terugval */ }
  return Promise.resolve(fallback());
}
// platte tekst: op maat (de calculators hebben die al) of door de weergegeven pagina te lezen
const INLINE = /^(SPAN|B|I|EM|STRONG|SUB|SUP|CODE|A|SMALL|BR|LABEL)$/;
function inl(n) {
  if (n.nodeType === 3) return n.textContent;
  if (n.nodeType !== 1) return "";
  if (n.tagName === "BR") return "; ";
  const t = Array.prototype.map.call(n.childNodes, inl).join("");
  return n.tagName === "SUB" ? "_" + t : n.tagName === "SUP" ? "^" + t : t;
}
const clean = t => t.replace(/\s+/g, " ").trim();
function walk(node, out) {
  let buf = "";
  const flush = () => { const t = clean(buf); if (t) out.push(t); buf = ""; };
  Array.prototype.forEach.call(node.childNodes, ch => {
    if (ch.nodeType === 3) { buf += ch.textContent; return; }
    if (ch.nodeType !== 1 || ch.hidden) return;
    const tag = ch.tagName;
    if (INLINE.test(tag) && !ch.querySelector("table, div, p, ul")) { buf += inl(ch); return; }
    flush();
    if (tag === "IMG" || tag === "SVG" || tag === "svg" || tag === "CANVAS") return;
    if (/^H[12]$/.test(tag)) { out.push("", tag === "H1" ? clean(ch.textContent) : clean(ch.textContent).toUpperCase()); return; }
    if (/^H[3-6]$/.test(tag)) { out.push("", clean(ch.textContent)); return; }
    if (tag === "TABLE") {
      Array.prototype.forEach.call(ch.rows, r => out.push(Array.prototype.map.call(r.cells, c => clean(inl(c))).join("\t")));
      return;
    }
    if (tag === "UL" || tag === "OL") { Array.prototype.forEach.call(ch.children, li => { const t = clean(inl(li)); if (t) out.push("  - " + t); }); return; }
    if (tag === "DL") {
      if (ch.classList.contains("rep-meta")) { Array.prototype.forEach.call(ch.children, kv => out.push(clean(inl(kv.children[0])) + ": " + clean(inl(kv.children[1])))); return; }
      const kids = Array.prototype.slice.call(ch.children);
      for (let i = 0; i < kids.length; i++) if (kids[i].tagName === "DT") out.push("  " + clean(inl(kids[i])) + (kids[i + 1] && kids[i + 1].tagName === "DD" ? ": " + clean(inl(kids[i + 1])) : ""));
      return;
    }
    walk(ch, out);
  });
  flush();
}
function textOf() {
  if (customText) return customText;
  const out = [];
  walk(document.getElementById("repPage"), out);
  return out.join("\n").replace(/^\n+/, "");
}

// spec: { title, sub, meta: [[sleutel, waarde]], sections: [{ h, html }], text? }
export function showReport(spec) {
  ensure();
  const bi = buildInfo();
  const meta = [["Datum", dateText()], ["App", "Mechanismeschets " + bi.text]].concat(spec.meta || []);
  const h = ['<header class="rep-head"><h1>' + esc(spec.title) + "</h1>" + (spec.sub ? '<p class="rep-sub">' + esc(spec.sub) + "</p>" : "") +
    '<dl class="rep-meta">' + meta.map(m => '<div class="rep-kv"><dt>' + esc(m[0]) + "</dt><dd>" + esc(m[1]) + "</dd></div>").join("") + "</dl></header>"];
  spec.sections.forEach(s => { if (s && s.html) h.push('<section class="rep-sec"><h2>' + esc(s.h) + "</h2>" + s.html + "</section>"); });
  h.push('<footer class="rep-foot">' + esc(FOOT) + "</footer>");
  const page = document.getElementById("repPage");
  page.innerHTML = h.join("");
  page.querySelectorAll(".hw-copy").forEach(b => b.remove());
  customText = spec.text || "";
  prevTitle = document.title; prevFocus = document.activeElement;
  document.title = "Rekenblad – " + spec.title;
  root.hidden = false; root.scrollTop = 0;
  document.getElementById("repPrint").focus();
  return root;
}
export function closeReport() {
  if (!root || root.hidden) return;
  root.hidden = true; document.title = prevTitle;
  if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (_) { /* weg */ } }
}
export const reportOpen = () => !!root && !root.hidden;
