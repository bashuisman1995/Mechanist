// Transport voor de calculator-tekeningen: ▶/❚❚ en een schuifregelaar. Alleen UI; de tekenfuncties staan in calc.js.
// kind "sweep": s loopt 0 -> 1 -> 0 (belasting van nul tot de huidige waarde en terug); kind "time": s loopt 0 -> 1 en begint opnieuw.
// Alleen requestAnimationFrame; respecteert prefers-reduced-motion (dan kan alleen met de regelaar gescrubd worden) en stopt als de calculator verborgen is.
import { t } from "./i18n.js";

const tri = ph => { const x = ph - Math.floor(ph); return x < 0.5 ? 2 * x : 2 - 2 * x; };
export function reducedMotion() {
  try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (_) { return false; }
}
const esc = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** HTML van de balk. modes = [[waarde, tekst], ...] voor een optionele keuzelijst. */
export function transportHtml(modes, mode) {
  return '<div class="calc-tr" id="calcTr" role="group" aria-label="' + esc(t("calc.anim.group")) + '">' +
    '<button type="button" class="calc-tr-b" data-tr="play" aria-pressed="false" aria-label="' + esc(t("calc.anim.play")) + '" title="' + esc(t("calc.anim.play")) + '">▶</button>' +
    '<input type="range" class="sl calc-tr-s" data-tr="scrub" min="0" max="1000" step="1" value="1000" aria-label="' + esc(t("calc.anim.scrub")) + '">' +
    (modes ? '<select class="calc-tr-m" data-tr="mode" aria-label="' + esc(t("calc.anim.mode")) + '">' + modes.map(m => '<option value="' + m[0] + '"' + (m[0] === mode ? " selected" : "") + ">" + esc(m[1]) + "</option>").join("") + "</select>" : "") +
    '<output class="calc-tr-l" data-tr="lab" aria-live="off"></output></div>';
}

/** o: {kind, period [s], mode, visible(), onFrame(T)}; T = {on, s, playing, mode}. */
export function createTransport(el, o) {
  const btn = el.querySelector('[data-tr="play"]'), sl = el.querySelector('[data-tr="scrub"]'), lab = el.querySelector('[data-tr="lab"]'), sel = el.querySelector('[data-tr="mode"]');
  const T = { on: false, s: o.kind === "sweep" ? 1 : 0, playing: false, mode: o.mode || "", dead: false };
  const still = reducedMotion();
  let ph = 0, last = 0, raf = 0;
  if (o.kind !== "sweep") sl.value = 0;
  if (still) { btn.disabled = true; btn.title = t("calc.anim.still"); btn.setAttribute("aria-label", t("calc.anim.still")); }
  const paint = () => {
    btn.textContent = T.playing ? "❚❚" : "▶"; btn.setAttribute("aria-pressed", String(T.playing));
    if (!still) { const k = T.playing ? "calc.anim.pause" : "calc.anim.play"; btn.title = t(k); btn.setAttribute("aria-label", t(k)); }
  };
  function stop() { T.playing = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } paint(); }
  function frame(now) {
    raf = 0;
    if (!T.playing || T.dead) return;
    if (o.visible && !o.visible()) { stop(); return; }
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
    ph += dt / o.period;
    T.s = o.kind === "sweep" ? tri(ph) : ph - Math.floor(ph); T.on = true;
    sl.value = Math.round(T.s * 1000);
    o.onFrame(T);
    raf = requestAnimationFrame(frame);
  }
  function play() {
    if (still || T.dead) return;
    T.playing = true; T.on = true; last = 0;
    ph = o.kind === "sweep" ? T.s / 2 : T.s;
    paint(); raf = requestAnimationFrame(frame);
  }
  btn.addEventListener("click", () => { if (T.playing) stop(); else play(); });
  sl.addEventListener("input", () => { stop(); T.on = true; T.s = +sl.value / 1000; o.onFrame(T); });
  if (sel) sel.addEventListener("change", () => { T.mode = sel.value; T.on = true; o.onFrame(T); });
  const onWork = ev => { if (ev.detail !== "calc") stop(); };
  document.addEventListener("mech-work", onWork);
  paint();
  T.label = txt => { lab.textContent = txt; };
  T.stop = stop;
  T.destroy = () => { T.dead = true; stop(); document.removeEventListener("mech-work", onWork); };
  return T;
}
