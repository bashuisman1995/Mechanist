import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { newPage, store } from '../lib.mjs';
export default async ({ browser, url, check }) => {
  const p = await newPage(browser, url);
  const dialogs = [];
  p.removeAllListeners('dialog');
  p.on('dialog', d => { dialogs.push(d.type()); d.accept(); });
  check('verse start: Vierstangenmechanisme', /Vierstangenmechanisme/.test(await p.$eval('#docName', e => e.textContent)));
  const n0 = (await store(p)).nodes.length;
  await p.keyboard.press('n'); await p.mouse.click(300, 130); await p.waitForTimeout(200);
  const nEdited = (await store(p)).nodes.length;
  check('bewerking voegt knoop toe', nEdited === n0 + 1, `${n0}->${nEdited}`);
  await p.reload(); await p.waitForTimeout(700);
  check('beforeunload-dialoog bij onopgeslagen wijzigingen', dialogs.includes('beforeunload'), dialogs.join(','));
  check('na herladen: verse vierstang', /Vierstangenmechanisme/.test(await p.$eval('#docName', e => e.textContent)) && (await store(p)).nodes.length === n0);
  await p.click('#menuBtn');
  check('"Vorige sessie herstellen" zichtbaar', await p.$eval('[data-a="restore"]', e => !e.hidden));
  await p.click('[data-a="restore"]'); await p.waitForTimeout(300);
  check('vorige sessie hersteld (bewerkt model)', (await store(p)).nodes.length === nEdited, (await store(p)).nodes.length);

  // opslaan
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mech-e2e-'));
  await p.keyboard.press('Control+s'); await p.waitForTimeout(150);
  await p.fill('#saveName', 'Mijn grijper v2');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#saveOk')]);
  const file = path.join(dir, dl.suggestedFilename()); await dl.saveAs(file);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  check('bestandsnaam "Mijn grijper v2.mech.json"', dl.suggestedFilename() === 'Mijn grijper v2.mech.json', dl.suggestedFilename());
  check('bestand: app "mechanismeschets"', saved.app === 'mechanismeschets', saved.app);
  check('bestand: knopen aantal klopt', saved.model.nodes.length === nEdited);

  // voorbeeld na opslaan: geen vraag
  await p.click('#menuBtn'); await p.click('[data-ex="slidercrank"]'); await p.waitForTimeout(300);
  check('na opslaan geen vraag-dialoog bij ander voorbeeld', !(await p.$eval('#askModal', e => !e.hidden)));
  await p.keyboard.press('n'); await p.mouse.click(300, 130); await p.waitForTimeout(150);
  await p.click('#menuBtn'); await p.click('[data-ex="fourbar"]'); await p.waitForTimeout(200);
  check('bij onopgeslagen bewerking: vraag-dialoog', await p.$eval('#askModal', e => !e.hidden));
  await p.click('#askDrop'); await p.waitForTimeout(300);

  // openen
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.keyboard.press('Control+o')]);
  await fc.setFiles(file); await p.waitForTimeout(500);
  check('openen: naam hersteld', (await p.$eval('#docName', e => e.textContent)) === 'Mijn grijper v2', await p.$eval('#docName', e => e.textContent));
  check('openen: aantal knopen hersteld', (await store(p)).nodes.length === nEdited);

  // slepen
  await p.click('#menuBtn'); await p.click('[data-ex="empty"]'); await p.waitForTimeout(200);
  const txt = fs.readFileSync(file, 'utf8');
  await p.evaluate(t => {
    const dt = new DataTransfer(); dt.items.add(new File([t], 'sleep.mech.json', { type: 'application/json' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, txt);
  await p.waitForTimeout(400);
  check('slepen: model geladen', (await store(p)).nodes.length === nEdited, (await store(p)).nodes.length);
  check('geen page errors', p.errs.length === 0, p.errs.join('|'));
  fs.rmSync(dir, { recursive: true, force: true });
  await p.context().close();
};
