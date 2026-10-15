// Menu.
import { EXAMPLES } from "./examples.js";
import { markClean, openFile, openPaste, openSave, setName, whenDiscarded } from "./files.js";
import { copyLink, copyModel, hasPrevSession, restoreSession } from "./persist.js";

/* ---------- top-bar menus: Bestand en Bibliotheek ---------- */
const menus = [
  { btn: document.getElementById("menuBtn"), menu: document.getElementById("menu") },
  { btn: document.getElementById("libBtn"), menu: document.getElementById("libMenu") }
];
function closeMenus(except) {
  menus.forEach(m => { if (m !== except) { m.menu.hidden = true; m.btn.setAttribute("aria-expanded", "false"); } });
}

export function initMenu() {
  menus.forEach(m => {
    m.btn.addEventListener("click", ev => {
      ev.stopPropagation();
      closeMenus(m);
      if (m.menu.id === "menu") document.querySelector('#menu [data-a="restore"]').hidden = !hasPrevSession();
      m.menu.hidden = !m.menu.hidden;
      m.btn.setAttribute("aria-expanded", String(!m.menu.hidden));
    });
    m.menu.addEventListener("click", ev => {
      const b = ev.target.closest("button"); if (!b) return;
      closeMenus();
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
  });
  document.addEventListener("click", ev => { if (!menus.some(m => m.menu.contains(ev.target))) closeMenus(); });
  document.addEventListener("keydown", ev => { if (ev.key === "Escape") closeMenus(); });
}
