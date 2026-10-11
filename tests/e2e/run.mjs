// E2E-runner: eigen statische server + Chromium + alle scenario's in scenarios/*.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const require = createRequire(import.meta.url);

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* probeer NODE_PATH-achtige fallback */ }
  for (const dir of (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)) {
    try { return createRequire(path.join(dir, 'x.js'))('playwright'); } catch (e) { /* volgende */ }
  }
  console.error('playwright niet gevonden. Gebruik: NODE_PATH=<dir>/node_modules node tests/e2e/run.mjs');
  process.exit(2);
}
const { chromium } = loadPlaywright();

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.normalize(path.join(root, p === '/' ? 'index.html' : p));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const t0 = Date.now();
let pass = 0, fail = 0;
const failures = [];
let current = '';
function check(name, cond, detail) {
  const ok = !!cond;
  if (ok) pass++; else { fail++; failures.push(`${current}: ${name}`); }
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${current}] ${name}${detail !== undefined && (!ok || process.env.VERBOSE) ? '  -> ' + detail : ''}`);
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
const files = fs.readdirSync(path.join(here, 'scenarios')).filter(f => f.endsWith('.mjs')).sort();
for (const f of files) {
  current = f.replace(/\.mjs$/, '');
  const ts = Date.now();
  try {
    const mod = await import(pathToFileURL(path.join(here, 'scenarios', f)).href);
    await mod.default({ browser, url, check });
  } catch (e) {
    check('scenario zonder uitzondering', false, e.message.split('\n')[0]);
  }
  console.log(`      (${current}: ${((Date.now() - ts) / 1000).toFixed(1)} s)`);
}
await browser.close();
server.close();
console.log(`\nSamenvatting: ${pass} geslaagd, ${fail} mislukt, ${pass + fail} checks, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (fail) console.log('Mislukt:\n  ' + failures.join('\n  '));
process.exit(fail ? 1 : 0);
