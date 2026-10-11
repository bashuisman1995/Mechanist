// Menu.
import { EXAMPLES } from "./examples.js";
import { markClean, openFile, openPaste, openSave, setName, whenDiscarded } from "./files.js";
import { copyLink, copyModel, hasPrevSession, restoreSession } from "./persist.js";

/* ---------- top-bar menu ---------- */
const menu = document.getElementById("menu"), menuBtn = document.getElementById("menuBtn");
function closeMenu() { menu.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); }

export function initMenu() {
  menuBtn.addEventListener("click", ev => {
    ev.stopPropagation();
    document.querySelector('#menu [data-a="restore"]').hidden = !hasPrevSession();
    menu.hidden = !menu.hidden;
    menuBtn.setAttribute("aria-expanded", String(!menu.hidden));
  });
  document.addEventListener("click", ev => { if (!menu.hidden && !menu.contains(ev.target)) closeMenu(); });
  document.addEventListener("keydown", ev => { if (ev.key === "Escape") closeMenu(); });
  menu.addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    closeMenu();
    if (b.dataset.ex) {
      const f = EXAMPLES[b.dataset.ex];
      if (f) whenDiscarded(() => { f(); setName(b.dataset.ex === "empty" ? "Naamloos" : b.textContent.trim()); markClean(); });
      return;
    }
    if (b.dataset.a === "open") openFile();
    if (b.dataset.a === "save") openSave();
    if (b.dataset.a === "restore") restoreSession();
    if (b.dataset.a === "copy") copyModel();
    if (b.dataset.a === "paste") openPaste();
    if (b.dataset.a === "link") copyLink();
  });
}
