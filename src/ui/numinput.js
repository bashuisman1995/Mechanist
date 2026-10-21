// Getalvelden: komma of punt als decimaalteken (in beide talen), en pijltjestoetsen om te stappen.
// Velden zijn gewone tekstvelden met inputmode="decimal"; een komma wordt direct een punt, zodat de rest van de code
// gewoon parseFloat(el.value) kan gebruiken.
export const NUM_ATTR = 'type="text" inputmode="decimal" autocomplete="off"';
export function initNumInputs() {
  const isNum = el => el && el.tagName === "INPUT" && el.getAttribute("inputmode") === "decimal" && el.type === "text";
  document.addEventListener("input", ev => {
    const el = ev.target;
    if (!isNum(el) || !/[,٫\s  ]/.test(el.value)) return;
    let p = null;
    try { p = el.selectionStart; } catch (_) { /* geen selectie */ }
    const v = el.value.replace(/[,٫]/g, ".").replace(/[\s  ]/g, "").replace(/−/g, "-");
    if (v !== el.value) { el.value = v; try { if (p !== null) el.setSelectionRange(p, p); } catch (_) { /* negeren */ } }
  }, true);
  document.addEventListener("keydown", ev => {
    const el = ev.target;
    if (!isNum(el) || (ev.key !== "ArrowUp" && ev.key !== "ArrowDown") || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const st = parseFloat(el.getAttribute("step")) || 1;
    const cur = parseFloat(String(el.value).replace(",", "."));
    const mn = el.getAttribute("min"), mx = el.getAttribute("max");
    let v = (isFinite(cur) ? cur : 0) + (ev.key === "ArrowUp" ? st : -st) * (ev.shiftKey ? 10 : 1);
    v = Math.round(v * 1e9) / 1e9;
    if (mn !== null && mn !== "" && v < +mn) v = +mn;
    if (mx !== null && mx !== "" && v > +mx) v = +mx;
    ev.preventDefault();
    el.value = String(v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, true);
}
