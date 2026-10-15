// Korte rondleiding bij het eerste bezoek (3 stappen). Opnieuw te starten via Bestand -> Rondleiding.
const FLAG = "mechschets.tour1";
const STEPS = [
  { sel: "#rail", title: "Teken met deze gereedschappen", text: "Kies een gereedschap en klik op het canvas om punten, schakels en veren te plaatsen.", side: "right" },
  { sel: "#modeSeg", title: "Kies hoe je rekent", text: "Kinematisch laat het mechanisme draaien. Dynamisch en Evenwicht gebruiken krachten, FRF kijkt naar trillingen.", side: "below" },
  { sel: ".inspector", title: "Resultaat en uitleg", text: "Hier staat of je model klopt, wat je geselecteerd hebt en hoe er gerekend wordt.", side: "left" }
];
let box = null, ring = null, idx = 0, prevFocus = null;

function seen() { try { return !!localStorage.getItem(FLAG); } catch (_) { return false; } }
function markSeen() { try { localStorage.setItem(FLAG, "1"); } catch (_) { /* opslag geblokkeerd: dan is de rondleiding gewoon niet te onthouden */ } }

function visibleEl(sel) {
  const e = document.querySelector(sel);
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? e : null;
}

function place() {
  if (!box) return;
  const st = STEPS[idx], el = visibleEl(st.sel);
  if (!el) { ring.hidden = true; return; }
  const r = el.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, pad = 3, gap = 12, m = 8;
  ring.hidden = false;
  ring.style.left = r.left - pad + "px"; ring.style.top = r.top - pad + "px";
  ring.style.width = r.width + 2 * pad + "px"; ring.style.height = r.height + 2 * pad + "px";
  const bw = box.offsetWidth, bh = box.offsetHeight;
  const cx = x => Math.max(m, Math.min(x, vw - bw - m));
  const cands = {
    right: [r.right + gap, r.top], below: [cx(r.left), r.bottom + gap],
    left: [r.left - gap - bw, r.top], above: [cx(r.left), r.top - gap - bh]
  };
  const fits = ([x, y]) => x >= m && y >= m && x + bw <= vw - m && y + bh <= vh - m;
  let pos = null;
  for (const k of [st.side, "below", "above", "right", "left"]) if (fits(cands[k])) { pos = cands[k]; break; }
  if (!pos) pos = cands[st.side];
  box.style.left = Math.max(m, Math.min(pos[0], vw - bw - m)) + "px";
  box.style.top = Math.max(m, Math.min(pos[1], vh - bh - m)) + "px";
}

function render() {
  const st = STEPS[idx], last = idx === STEPS.length - 1;
  box.querySelector(".tn").textContent = (idx + 1) + " van " + STEPS.length;
  box.querySelector("h3").textContent = st.title;
  box.querySelector("p").textContent = st.text;
  box.querySelector(".tnext").textContent = last ? "Klaar" : "Volgende";
  box.querySelector(".tskip").hidden = last;
  place();
  box.querySelector(".tnext").focus({ preventScroll: true });
}

export function endTour() {
  if (!box) return;
  window.removeEventListener("resize", place);
  document.removeEventListener("keydown", onKey, true);
  box.remove(); ring.remove(); box = ring = null;
  markSeen();
  if (prevFocus && prevFocus.focus) { try { prevFocus.focus({ preventScroll: true }); } catch (_) {} }
}
function onKey(ev) {
  if (ev.key === "Escape") { ev.stopPropagation(); endTour(); }
}
function next() { if (idx >= STEPS.length - 1) endTour(); else { idx++; render(); } }

// force: opnieuw afspelen via het menu; anders alleen als dit het eerste bezoek is.
export function startTour(force) {
  if (box) return;
  if (!force && seen()) return;
  if (document.querySelector(".modal:not([hidden])")) return;
  prevFocus = document.activeElement;
  ring = document.createElement("div"); ring.className = "tour-ring"; ring.setAttribute("aria-hidden", "true");
  box = document.createElement("div"); box.className = "tour-bubble"; box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "Rondleiding");
  box.innerHTML = '<div class="tn"></div><h3></h3><p></p><div class="tacts"><button type="button" class="btn tskip">Overslaan</button>' +
    '<button type="button" class="btn primary tnext">Volgende</button></div>';
  document.body.appendChild(ring); document.body.appendChild(box);
  box.querySelector(".tskip").addEventListener("click", endTour);
  box.querySelector(".tnext").addEventListener("click", next);
  window.addEventListener("resize", place);
  document.addEventListener("keydown", onKey, true);
  idx = 0; markSeen(); render();
}
