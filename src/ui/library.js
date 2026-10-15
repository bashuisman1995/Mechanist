// Bibliotheek: overlay met voorbeelden, filter, kaarten en de Uitleg-kaart.
import { CATEGORIES, EXAMPLE_META, EXAMPLES, MODE_NAMES } from "./examples.js";
import { markClean, setName, whenDiscarded } from "./files.js";

/* ---------- miniatuurtjes: simpele schema's op 80 x 50 ---------- */
const f1 = n => Math.round(n * 10) / 10;
const ln = (a, b, c, d, cls) => `<path class="${cls || "k"}" d="M${a} ${b}L${c} ${d}"/>`;
const pl = (pts, cls) => `<path class="${cls || "k"}" d="M${pts.map(p => p.join(" ")).join("L")}"/>`;
const pin = (x, y) => `<path class="g" d="M${x - 4} ${y + 6}h8M${x - 3} ${y + 6}l-2 2.5M${x} ${y + 6}l-2 2.5M${x + 3} ${y + 6}l-2 2.5"/>` +
  `<path class="g" d="M${x} ${y}L${x - 3.5} ${y + 6}M${x} ${y}L${x + 3.5} ${y + 6}"/><circle class="n" cx="${x}" cy="${y}" r="2.4"/>`;
const dot = (x, y, r) => `<circle class="n" cx="${x}" cy="${y}" r="${r || 2}"/>`;
const mass = (x, y) => `<circle class="m" cx="${x}" cy="${y}" r="3.6"/>`;
const wall = (x, y1, y2) => `<path class="g" d="M${x} ${y1}V${y2}"/>` +
  Array.from({ length: 4 }, (_, i) => { const y = y1 + (i + .5) * (y2 - y1) / 4; return `<path class="g" d="M${x} ${f1(y)}l${x > 40 ? 3 : -3} -3"/>`; }).join("");
function spring(a, b, c, d) {
  const dx = c - a, dy = d - b, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const lead = 5, n = 6, pts = [[a, b], [a + ux * lead, b + uy * lead]];
  for (let i = 0; i < n; i++) {
    const t = lead + (L - 2 * lead) * (i + .5) / n, s = i % 2 ? -3 : 3;
    pts.push([f1(a + ux * t + nx * s), f1(b + uy * t + ny * s)]);
  }
  pts.push([c - ux * lead, d - uy * lead], [c, d]);
  return pl(pts.map(p => [f1(p[0]), f1(p[1])]), "s");
}
const damper = (a, b, c, d) => {
  const m = (a + c) / 2;
  return ln(a, b, m - 3, b, "d") + `<path class="d" d="M${m - 3} ${b - 3}v6M${m - 3} ${b - 3}h9M${m - 3} ${b + 3}h9M${m + 6} ${b}H${c}"/>` +
    ln(m, b, m + 2, b, "d");
};
const box = (x, y) => `<rect class="m" x="${x - 4.5}" y="${y - 3.5}" width="9" height="7" rx="1"/>`;
const arrow = (a, b, c, d) => `<path class="f" d="M${a} ${b}L${c} ${d}M${c - 4} ${d - 2.5}L${c} ${d}L${c - 4} ${d + 2.5}"/>`;

const THUMB = {
  fourbar: () => ln(14, 40, 20, 22, "dr") + pl([[20, 22], [52, 16], [58, 40]]) + pl([[20, 22], [36, 6], [52, 16]]) + pin(14, 40) + pin(58, 40) + dot(20, 22) + dot(52, 16) + dot(36, 6),
  slidercrank: () => ln(4, 41, 76, 41, "g") + ln(14, 34, 28, 14, "dr") + ln(28, 14, 60, 34) + box(60, 36) + pin(14, 34) + dot(28, 14),
  compressor: () => ln(4, 41, 60, 41, "g") + ln(12, 34, 24, 14, "dr") + ln(24, 14, 46, 34) + box(46, 36) + spring(51, 36, 70, 36) + wall(72, 26, 46) + pin(12, 34) + dot(24, 14),
  fivebar: () => ln(12, 42, 18, 24, "dr") + pl([[18, 24], [37, 6], [56, 24]]) + ln(62, 42, 56, 24, "dr") + pin(12, 42) + pin(62, 42) + dot(18, 24) + dot(56, 24) + dot(37, 6),
  hoeken: () => ln(14, 40, 6, 28, "dr") + pl([[6, 28], [24, 12], [52, 40]]) + pl([[6, 28], [44, 6], [24, 12]]) + pin(14, 40) + pin(52, 40) + dot(6, 28) + dot(24, 12) + dot(44, 6),
  jansen: () => ln(34, 10, 42, 18, "dr") + pl([[42, 18], [14, 14], [30, 32], [42, 18]]) + pl([[14, 14], [8, 28], [18, 40], [30, 32]]) +
    pl([[30, 32], [40, 46], [18, 40]]) + pin(34, 10) + pin(14, 14) + dot(40, 46, 2.6),
  liftarm: () => ln(14, 32, 58, 14) + `<path class="dr" style="stroke-width:3.4" d="M30 44L58 14"/>` + pin(14, 32) + pin(30, 44) + mass(58, 14),
  springload: () => ln(12, 36, 62, 36) + spring(14, 6, 62, 36) + pin(12, 36) + wall(10, 4, 16) + mass(62, 36),
  doublependulum: () => `<path class="t" d="M46 44Q70 30 58 16Q40 4 24 20"/>` + pl([[40, 8], [30, 26], [46, 44]]) + pin(40, 8) + dot(30, 26) + mass(46, 44),
  settle: () => pl([[12, 30], [42, 30], [62, 44]]) + spring(12, 8, 42, 30) + wall(10, 4, 14) + pin(12, 30) + dot(42, 30) + mass(62, 44),
  shaker: () => shakerBase(0),
  steamL: () => ln(4, 41, 76, 41, "g") + ln(14, 36, 20, 24) + ln(20, 24, 40, 36) + box(40, 38) + spring(45, 38, 56, 38) + box(59, 38) +
    `<path class="dr" style="stroke-width:3.4" d="M63 38H74"/>` + pin(14, 36) + pin(76, 38) + mass(20, 24),
  frictionslide: () => {
    const d = [0.93, -0.37], n = [-0.37, -0.93], o = [36, 30], p = (u, v) => [f1(o[0] + d[0] * u + n[0] * v), f1(o[1] + d[1] * u + n[1] * v)];
    const top = p(34, 0);
    return ln(6, 42, 74, 15, "g") + Array.from({ length: 6 }, (_, i) => ln(12 + i * 11, 40 - i * 4.3, 10 + i * 11, 44 - i * 4.3, "g")).join("") +
      pl([p(-9, 0), p(9, 0), p(9, 9), p(-9, 9), p(-9, 0)], "m") + spring(p(9, 4.5)[0], p(9, 4.5)[1], top[0] + n[0] * 4.5, top[1] + n[1] * 4.5) + pin(top[0] + n[0] * 4.5, top[1] + n[1] * 4.5 - 2);
  },
  gaplimit: () => ln(14, 10, 46, 24) + `<path class="d" stroke-dasharray="3 2" d="M70 40L46 24"/>` + `<path class="g" d="M58 28l4-5M62 31l4-5"/>` + pin(14, 10) + pin(70, 40) + mass(46, 24),
  shakerfrf: () => shakerBase(10) + `<path class="f" d="M6 18Q22 17 32 16Q40 4 46 16Q60 18 74 18"/><path class="g" d="M6 20H74"/>`,
  virtualplay: () => `<path class="g" d="M8 14L40 40L72 14"/>` + `<path class="g" d="M10 11l-3 3M16 17l-3 3M22 23l-3 3M28 29l-3 3M72 14l3 3M66 20l3 3M60 26l3 3M54 32l3 3"/>` +
    `<circle class="m" cx="40" cy="30" r="7.5"/>` + arrow(2, 30, 20, 30) + arrow(78, 30, 62, 30),
  preload: () => ln(8, 44, 72, 44, "g") + `<circle class="m" cx="40" cy="36" r="6"/>` + spring(40, 14, 40, 29) + ln(34, 4, 46, 4, "g") + arrow(58, 38, 58, 8),
  pendfrf: () => ln(30, 8, 30, 38) + pin(30, 8) + mass(30, 38) + arrow(38, 38, 70, 38),
  empty: () => `<rect class="dd" x="10" y="8" width="60" height="34" rx="4"/><path class="k" d="M40 20v10M35 25h10"/>`
};
function shakerBase(dy) {
  const y = 25 + dy;
  return wall(8, y - 10, y + 10) + `<path class="dr" style="stroke-width:3.4" d="M8 ${y}H26"/>` + box(30, y) +
    spring(34.5, y - 3, 62, y - 3) + damper(34.5, y + 3, 62, y + 3) + box(66, y) + `<path class="g" d="M4 ${y + 9}H76"/>`;
}
function thumb(id) {
  const f = THUMB[id];
  return `<svg class="thumb" viewBox="0 0 80 50" aria-hidden="true" focusable="false">${f ? f() : ""}</svg>`;
}

/* ---------- overlay ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
let cat = "all";

function applyFilter() {
  $("libChips").querySelectorAll("[data-c]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.c === cat)));
  $("libGrid").querySelectorAll("[data-ex]").forEach(b => { b.hidden = !(cat === "all" || EXAMPLE_META[b.dataset.ex].cat === cat); });
}
export function openLibrary() {
  cat = "all"; applyFilter();
  $("lib").hidden = false; $("libBtn").setAttribute("aria-expanded", "true");
  $("libGrid").scrollTop = 0;
  const first = $("libGrid").querySelector("[data-ex]:not([hidden])"); if (first) first.focus({ preventScroll: true });
}
export function closeLibrary() {
  if ($("lib").hidden) return;
  $("lib").hidden = true; $("libBtn").setAttribute("aria-expanded", "false");
}

/* ---------- Uitleg-kaart ---------- */
export function showUitleg(id) {
  const m = EXAMPLE_META[id], el = $("uitleg"); if (!m) return;
  $("uitTitle").textContent = m.title; $("uitText").textContent = m.text;
  el.hidden = false; el.closest(".stage").classList.add("hasnote");
}
export function hideUitleg() {
  const el = $("uitleg"); el.hidden = true; el.closest(".stage").classList.remove("hasnote");
}

export function initLibrary() {
  $("libChips").innerHTML = CATEGORIES.map(c => `<button type="button" class="chip" data-c="${c.id}" aria-pressed="false">${esc(c.nm)}</button>`).join("");
  $("libGrid").innerHTML = Object.keys(EXAMPLE_META).map(id => {
    const m = EXAMPLE_META[id];
    const tags = m.modes.map(t => `<span class="tag tag-${t}">${MODE_NAMES[t]}</span>`).join("");
    return `<button type="button" class="libcard" data-ex="${id}">${thumb(id)}<span class="lc-body"><span class="lc-t">${esc(m.title)}</span>` +
      `<span class="lc-d">${esc(m.desc)}</span><span class="lc-tags">${tags}</span></span></button>`;
  }).join("");
  $("libBtn").addEventListener("click", ev => { ev.stopPropagation(); if ($("lib").hidden) openLibrary(); else closeLibrary(); });
  $("libClose").addEventListener("click", closeLibrary);
  $("lib").addEventListener("click", ev => { if (ev.target === $("lib")) closeLibrary(); });
  document.addEventListener("keydown", ev => { if (ev.key === "Escape" && !$("lib").hidden) { ev.stopPropagation(); closeLibrary(); } }, true);
  $("libChips").addEventListener("click", ev => {
    const b = ev.target.closest("[data-c]"); if (!b) return;
    cat = b.dataset.c; applyFilter();
  });
  $("libGrid").addEventListener("click", ev => {
    const b = ev.target.closest("[data-ex]"); if (!b) return;
    const id = b.dataset.ex, f = EXAMPLES[id];
    closeLibrary();
    if (f) whenDiscarded(() => {
      f(); setName(id === "empty" ? "Naamloos" : EXAMPLE_META[id].title); markClean(); showUitleg(id);
    });
  });
  $("uitClose").addEventListener("click", hideUitleg);
}
