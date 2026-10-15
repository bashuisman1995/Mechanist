// Roept renderHow(#howPanel) aan bij tabwissel, modus-, selectie- en rekenwijzigingen.
import { renderHow } from "./how.js";

let queued = false;
export function renderHowNow() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {      // bundel meerdere aanroepen in één frame
    queued = false;
    const el = document.getElementById("howPanel");
    if (!el) return;
    try { renderHow(el); } catch (err) { console.error(err); }
  });
}
