# E2E-tests (Playwright)

Browsertests voor `index.html`. De runner start zelf een statische server (willekeurige vrije poort) en Chromium; er is geen build nodig.

```
NODE_PATH=/pad/naar/node_modules node tests/e2e/run.mjs
```

- `NODE_PATH` moet naar een `node_modules` met `playwright` wijzen (of installeer playwright lokaal).
- `PW_CHROMIUM` = pad naar Chromium (standaard `/opt/pw-browsers/chromium`).
- `VERBOSE=1` toont ook details bij geslaagde checks.
- Exitcode 1 bij één of meer mislukte checks.

Elk bestand in `scenarios/*.mjs` exporteert `default async ({browser, url, check})`; `check(naam, voorwaarde, detail)`. Hulpfuncties staan in `lib.mjs`.
