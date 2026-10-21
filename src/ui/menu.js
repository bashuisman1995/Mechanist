// Menu.
import { openFile, openPaste, openSave } from "./files.js";
import { startTour } from "./tour.js";
import { setLang } from "./i18n.js";
import { openSketchReport } from "./sketchreport.js";
import { openCalcReport } from "./calc.js";
import { copyLink, copyModel, hasPrevSession, restoreSession } from "./persist.js";

/* ---------- top-bar menus: Bestand ---------- */
const menus = [
  { btn: document.getElementById("menuBtn"), menu: document.getElementById("menu") }
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
      if (b.dataset.lang) { setLang(b.dataset.lang); return; }          // taalschakelaar: het menu blijft open
      closeMenus();
      if (b.dataset.a === "open") openFile();
      if (b.dataset.a === "save") openSave();
      if (b.dataset.a === "restore") restoreSession();
      if (b.dataset.a === "copy") copyModel();
      if (b.dataset.a === "paste") openPaste();
      if (b.dataset.a === "link") copyLink();
      if (b.dataset.a === "report") { if (document.getElementById("calcRoot").hidden) openSketchReport(); else openCalcReport(); }
      if (b.dataset.a === "tour") startTour(true);
    });
  });
  document.addEventListener("click", ev => { if (!menus.some(m => m.menu.contains(ev.target))) closeMenus(); });
  document.addEventListener("keydown", ev => { if (ev.key === "Escape") closeMenus(); });
}
