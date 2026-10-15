// Ingang: koppelt alle modules en start de app.
import { model, ui } from "./core/state.js";
import { EXAMPLES } from "./ui/examples.js";
import { initFiles, markClean, setName } from "./ui/files.js";
import { initInteract } from "./ui/interact.js";
import { applyLayout, initLayout } from "./ui/layout.js";
import { initLibrary } from "./ui/library.js";
import { initMenu } from "./ui/menu.js";
import { initOptions } from "./ui/options.js";
import { b64, doc, initPersist, KEY, loadDoc, PREV, syncHistoryBtns } from "./ui/persist.js";
import { initPicker } from "./ui/picker.js";
import { initPlayback } from "./ui/playback.js";
import { initPlot } from "./ui/plot.js";
import { changed } from "./ui/solver.js";
import { startTour } from "./ui/tour.js";
import { initTools, setTool } from "./ui/tools.js";
import { fit, initView, resize } from "./ui/view.js";

initTools();
initInteract();
initPlayback();
initView();
initPlot();
initPicker();
initOptions();
initMenu();
initLibrary();
initPersist();
initFiles();
initLayout();

setTool("select");
requestAnimationFrame(() => {
  resize();
  let done = false;
  const h = location.hash || "";
  if (h.indexOf("#m=") === 0) {
    try { loadDoc(b64.dec(h.slice(3))); fit(); changed(); done = true; }
    catch (_) { /* onleesbare link — val terug op de laatste sessie */ }
  }
  if (done) setName(model.name && model.name !== "Naamloos" ? model.name : "Gedeeld model");
  if (!done) {
    // De app begint altijd schoon. Het werk van de vorige keer gaat niet
    // verloren: het staat klaar onder Bestand → Vorige sessie herstellen.
    try {
      const raw = localStorage.getItem(KEY);
      if (raw && JSON.parse(raw).edited) localStorage.setItem(PREV, raw);
    } catch (_) {}
    EXAMPLES.fourbar();
    setName("Vierstangenmechanisme");
  }
  markClean(); ui.userEdited = false;
  try { applyLayout(); } catch (err) { console.error(err); }
  ui.lastSnap = JSON.stringify(doc());
  syncHistoryBtns();
  setTimeout(() => startTour(false), 500);
});
