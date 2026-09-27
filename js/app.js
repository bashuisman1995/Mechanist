(function () {
  "use strict";

  /* ============================================================
     Model
     ============================================================ */
  let uid = 1;
  const nid = () => "n" + (uid++);
  const eid = () => "e" + (uid++);

  const model = {
    nodes: [],     // {id,x,y,support:'free'|'pin'|'slider', dir:deg, m:kg, name}
    elems: [],     // link | spring | damper | force
    snap: true,
    grid: 10,
    rigidDrag: false,
    series: [], gravity: false, showForces: true,
    mode: "kin", simDur: 2, dtStep: 0.2, defMass: 0.1, xAxis: "time",
    railSlim: false, drawerOpen: true, drawerH: 232, tab: "props",
    autoSolve: false, durMode: "fixed", cVisc: 0, maxT: 30,
    jointDamp: false, cJoint: 0.05
  };

  const N = id => model.nodes.find(n => n.id === id);
  const E = id => model.elems.find(e => e.id === id);

  let sel = null;            // {kind:'node'|'elem', id}
  let tool = "select";
  let pending = null;        // first node id while drawing a 2-node element
  let hover = null;
  let frame = 0, playing = false, raf = 0, lastT = 0;
  const SERIES_LIGHT = ["#1F5FD8", "#D95F02", "#00897B", "#8E44C7", "#A6861F", "#C2185B"];
  const SERIES_DARK  = ["#5B90F0", "#D0701C", "#28A794", "#A06CD6", "#A88C1E", "#E4527F"];
  const isDark = () => {
    const a = document.documentElement.getAttribute("data-theme");
    return a ? a === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  };
  const serieColor = i => (isDark() ? SERIES_DARK : SERIES_LIGHT)[i % 6];

  /* ---------- view ---------- */
  const view = { s: 2.2, ox: 0, oy: 0 };   // screen = world*s + o  (y flipped)
  const cv = document.getElementById("cv");
  const ctx = cv.getContext("2d");
  let W = 0, H = 0, DPR = 1;

  const toScr = p => ({ x: p.x * view.s + view.ox, y: -p.y * view.s + view.oy });
  const toWld = p => ({ x: (p.x - view.ox) / view.s, y: -(p.y - view.oy) / view.s });

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2.5);
    const r = cv.getBoundingClientRect();
    const W0 = W, H0 = H;
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    // bij groter of kleiner worden blijft het midden van het beeld op zijn plaats
    if (W0 > 1 && H0 > 1) { view.ox += (W - W0) / 2; view.oy += (H - H0) / 2; }
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    draw();
    if (typeof drawPlot === "function") drawPlot();
  }

  function bounds() {
    if (!model.nodes.length) return null;
    let a = { x: Infinity, y: Infinity }, b = { x: -Infinity, y: -Infinity };
    for (const n of model.nodes) {
      a.x = Math.min(a.x, n.x); a.y = Math.min(a.y, n.y);
      b.x = Math.max(b.x, n.x); b.y = Math.max(b.y, n.y);
    }
    return { a, b };
  }

  function fit() {
    const bb = bounds();
    if (!bb) { view.s = 2.2; view.ox = W / 2; view.oy = H / 2; draw(); return; }
    const w = Math.max(bb.b.x - bb.a.x, 40), h = Math.max(bb.b.y - bb.a.y, 40);
    const padX = 80, padTop = 62, padBot = 96;          // de transportbalk hoort vrij te blijven
    view.s = Math.min((W - padX * 2) / w, (H - padTop - padBot) / h);
    view.s = Math.max(0.15, Math.min(view.s, 14));
    const cx = (bb.a.x + bb.b.x) / 2, cy = (bb.a.y + bb.b.y) / 2;
    view.ox = W / 2 - cx * view.s;
    view.oy = padTop + (H - padTop - padBot) / 2 + cy * view.s;
    draw();
  }

  function zoomAt(sx, sy, f) {
    const before = toWld({ x: sx, y: sy });
    view.s = Math.max(0.15, Math.min(view.s * f, 14));
    const after = toWld({ x: sx, y: sy });
    view.ox += (after.x - before.x) * view.s;
    view.oy -= (after.y - before.y) * view.s;
    draw();
  }

  /* ============================================================
     Tools
     ============================================================ */
  const ICON = {
    select: '<path d="M5 3l12 8-5.2 1.1L14 18l-2.3.9-2.1-5.6L5 17z" fill="currentColor"/>',
    node:   '<circle cx="10" cy="10" r="4.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10 1.5v3.2M10 15.3v3.2M1.5 10h3.2M15.3 10h3.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    link:   '<path d="M5 14L15 6" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><circle cx="5" cy="14" r="2.6" fill="var(--panel)" stroke="currentColor" stroke-width="1.5"/><circle cx="15" cy="6" r="2.6" fill="var(--panel)" stroke="currentColor" stroke-width="1.5"/>',
    pin:    '<circle cx="10" cy="6.2" r="2.6" fill="var(--panel)" stroke="currentColor" stroke-width="1.5"/><path d="M10 8.8L4.6 15.4h10.8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M3 17.2h14M4.4 17.2l-1.6 2M8 17.2l-1.6 2M11.6 17.2L10 19.2M15.2 17.2l-1.6 2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>',
    slider: '<circle cx="10" cy="7" r="2.4" fill="var(--panel)" stroke="currentColor" stroke-width="1.5"/><rect x="5.6" y="4.4" width="8.8" height="5.2" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2.6 12.6h14.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M3.4 14.6l-1.4 2M7 14.6l-1.4 2M10.6 14.6l-1.4 2M14.2 14.6l-1.4 2M17.8 14.6l-1.4 2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>',
    driver: '<circle cx="7" cy="13" r="2.4" fill="var(--panel)" stroke="currentColor" stroke-width="1.5"/><path d="M7 13L14 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M3.4 9.4a5 5 0 016-3.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M9.8 4.6l0 3.2-3-1.1z" fill="currentColor"/>',
    spring: '<path d="M2.5 10h2.6l1.5-4 2.4 8 2.4-8 1.5 4h2.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
    damper: '<path d="M2.4 10h3.4M14.2 10h3.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M5.8 6.2h5.6v7.6H5.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M10 6.9v6.2M10 10h4.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    force:  '<path d="M10 17V4.6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M10 2.4l3.4 4.2H6.6z" fill="currentColor"/>',
    mass:   '<circle cx="10" cy="10" r="4.6" fill="currentColor"/><path d="M4 16.6h12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    trace:  '<path d="M2.5 13.5c3-9 12-9 15 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.4 2.2" stroke-linecap="round"/><circle cx="10" cy="7.6" r="2.8" fill="var(--panel)" stroke="currentColor" stroke-width="1.7"/>',
    del:    '<path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
  };

  const TOOLS = [
    { g: "Geometrie" },
    { id: "select", nm: "Selecteren", kb: "V", ic: "select", hint: "Sleep punten om het mechanisme te vervormen. Sleep het canvas om te pannen." },
    { id: "node",   nm: "Punt",       kb: "N", ic: "node",   hint: "Klik om een <b>punt</b> te plaatsen." },
    { id: "link",   nm: "Schakel",    kb: "L", ic: "link",   hint: "Klik het <b>eerste</b> punt, dan het tweede. Klik in het lege vlak om meteen een nieuw punt te maken." },
    { g: "Opleggingen" },
    { id: "pin",    nm: "Scharnier",  kb: "P", ic: "pin",    hint: "Klik een punt om het <b>vast te zetten</b>, of klik in het lege vlak voor een nieuw scharnier." },
    { id: "slider", nm: "Glijder",    kb: "S", ic: "slider", hint: "Klik een punt of het lege vlak voor een <b>glijder</b>. Richting instelbaar bij Eigenschappen." },
    { id: "driver", nm: "Aandrijving", kb: "D", ic: "driver", hint: "Klik een schakel met één vast scharnier om er de <b>kruk</b> van te maken." },
    { g: "Krachtelementen" },
    { id: "spring", nm: "Veer",       kb: "R", ic: "spring", hint: "Klik twee punten om er een <b>veer</b> tussen te zetten." },
    { id: "damper", nm: "Demper",     kb: "C", ic: "damper", hint: "Klik twee punten om er een <b>demper</b> tussen te zetten." },
    { id: "force",  nm: "Kracht",     kb: "F", ic: "force",  hint: "Klik een punt om er een <b>kracht</b> op te zetten." },
    { id: "mass",   nm: "Massa",      kb: "M", ic: "mass",   hint: "Klik een punt om er een <b>puntmassa</b> aan toe te kennen." },
    { id: "trace", nm: "Spoor", kb: "T", ic: "trace", hint: "Klik een punt om zijn <b>baan</b> te tonen of te verbergen." },
    { g: "Bewerken" },
    { id: "del",    nm: "Verwijderen", kb: "X", ic: "del",   hint: "Klik een punt of element om het te <b>verwijderen</b>." }
  ];

  const rail = document.getElementById("rail");
  const railTop = document.createElement("div");
  railTop.className = "railtop";
  railTop.innerHTML = '<button class="btn ghost ico" id="railBtn" title="Gereedschapsbalk smal of breed" aria-label="Gereedschapsbalk smal of breed">&#8676;</button>';
  rail.appendChild(railTop);
  TOOLS.forEach(t => {
    if (t.g) {
      const h = document.createElement("div");
      h.className = "rail-label"; h.textContent = t.g;
      rail.appendChild(h); return;
    }
    const b = document.createElement("button");
    b.className = "tool"; b.type = "button"; b.dataset.tool = t.id;
    b.setAttribute("aria-pressed", String(t.id === tool));
    b.title = t.nm + " (" + t.kb + ")";
    b.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true">' + ICON[t.ic] + '</svg>' +
                  '<span class="nm">' + t.nm + '</span><span class="kb">' + t.kb + '</span>';
    b.addEventListener("click", () => setTool(t.id));
    rail.appendChild(b);
  });

  let hintT = 0;
  function hintShow() {
    const h = document.getElementById("hint");
    h.classList.remove("dim");
    clearTimeout(hintT);
    hintT = setTimeout(() => h.classList.add("dim"), 4500);
  }

  function setTool(id) {
    tool = id; pending = null;
    rail.querySelectorAll(".tool").forEach(b =>
      b.setAttribute("aria-pressed", String(b.dataset.tool === id)));
    const t = TOOLS.find(x => x.id === id);
    document.getElementById("hint").innerHTML = t ? t.hint : "";
    document.getElementById("stTool").textContent = t ? t.nm : "—";
    hintShow();
    cv.style.cursor = cursorFor(id);
    draw();
  }

  // A system crosshair is drawn by XOR on Windows and disappears on a light
  // canvas. Ship our own: dark cross with a white halo, readable on both themes.
  const CROSS_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26">' +
    '<g fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round">' +
    '<path d="M13 2.5v7.2M13 16.3v7.2M2.5 13h7.2M16.3 13h7.2"/></g>' +
    '<g fill="none" stroke="#16191b" stroke-width="1.7" stroke-linecap="round">' +
    '<path d="M13 2.5v7.2M13 16.3v7.2M2.5 13h7.2M16.3 13h7.2"/></g>' +
    '<circle cx="13" cy="13" r="1.5" fill="#16191b" stroke="#ffffff" stroke-width="1.2"/></svg>';
  const CROSS = 'url("data:image/svg+xml;utf8,' + encodeURIComponent(CROSS_SVG) + '") 13 13, crosshair';
  function cursorFor(id) { return id === "select" ? "default" : CROSS; }

  document.addEventListener("keydown", e => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    const map = { v: "select", n: "node", l: "link", p: "pin", s: "slider", d: "driver", r: "spring", c: "damper", f: "force", m: "mass", t: "trace", x: "del" };
    if (map[k]) { setTool(map[k]); e.preventDefault(); return; }
    if (e.key === " ") {
      // een knop met focus zou anders zelf nog eens "klikken" en het afspelen meteen weer stoppen
      if (e.target.tagName === "BUTTON") e.target.blur();
      togglePlay(); e.preventDefault(); return;
    }
    if (e.key === "Escape") { pending = null; sel = null; syncInspector(); draw(); }
    if (e.key === "Home") { toT0(); e.preventDefault(); return; }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (sel) { e.preventDefault(); if (atT0()) { cancelJob(); removeSel(); } else lockNudge(); }
    }
  });

  /* ============================================================
     Model edits
     ============================================================ */
  function snapPt(p) {
    if (!model.snap) return { x: round2(p.x), y: round2(p.y) };
    const g = model.grid || 1;
    return { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
  }
  const round2 = v => Math.round(v * 100) / 100;

  let nameCounter = 0;
  const NAMES = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  function nextName() {
    const i = nameCounter++;
    return i < 24 ? NAMES[i] : NAMES[i % 24] + Math.floor(i / 24);
  }

  function addNode(p) {
    const n = {
      id: nid(), x: round2(p.x), y: round2(p.y),
      support: "free", dir: 0, m: 0, name: nextName(),
      ax: round2(p.x), ay: round2(p.y)     // anchor of the slider rail
    };
    model.nodes.push(n);
    return n;
  }

  function anchorHere(n) { n.ax = n.x; n.ay = n.y; }

  function addTwoNode(type, a, b) {
    if (a === b) return null;
    const dup = model.elems.find(e => e.type === type &&
      ((e.a === a && e.b === b) || (e.a === b && e.b === a)));
    if (dup) return dup;
    const L = dist(N(a), N(b));
    const e = { id: eid(), type, a, b };
    if (type === "link") { e.len = round2(L); e.driver = false; }
    if (type === "spring") { e.k = 1.0; e.L0 = round2(L); }
    if (type === "damper") { e.c = 0.05; }
    model.elems.push(e);
    return e;
  }

  function removeNode(id) {
    model.nodes = model.nodes.filter(n => n.id !== id);
    model.elems = model.elems.filter(e => e.a !== id && e.b !== id && e.node !== id);
  }
  function removeElem(id) { model.elems = model.elems.filter(e => e.id !== id); }
  function removeSel() {
    if (!sel) return;
    if (sel.kind === "node") removeNode(sel.id); else removeElem(sel.id);
    sel = null; pending = null; changed();
  }

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  /* ============================================================
     Constraint solver — least-norm Gauss-Newton
     Keeps every bar at its own length and every glijder on its rail,
     moving the sketch as little as possible. No time stepping.
     ============================================================ */
  function constraintRows(vars) {
    const idx = new Map(); vars.forEach((n, i) => idx.set(n.id, i));
    const rows = [], res = [];
    for (const e of model.elems) {
      if (e.type !== "link") continue;
      const A = N(e.a), B = N(e.b);
      if (!A || !B) continue;
      const dx = A.x - B.x, dy = A.y - B.y;
      const d = Math.hypot(dx, dy) || 1e-9;
      const ux = dx / d, uy = dy / d;
      const row = new Float64Array(vars.length * 2);
      let touched = false;
      if (idx.has(A.id)) { const i = idx.get(A.id); row[2 * i] = ux; row[2 * i + 1] = uy; touched = true; }
      if (idx.has(B.id)) { const i = idx.get(B.id); row[2 * i] = -ux; row[2 * i + 1] = -uy; touched = true; }
      if (!touched) continue;
      rows.push(row); res.push(d - e.len);
    }
    for (const n of model.nodes) {
      if (n.support !== "slider" || !idx.has(n.id)) continue;
      const th = n.dir * Math.PI / 180;
      const nx = -Math.sin(th), ny = Math.cos(th);
      const row = new Float64Array(vars.length * 2);
      const i = idx.get(n.id); row[2 * i] = nx; row[2 * i + 1] = ny;
      rows.push(row); res.push((n.x - n.ax) * nx + (n.y - n.ay) * ny);
    }
    return { rows, res };
  }

  function gauss(A, n) {
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-12) return null;
      const t = A[c]; A[c] = A[p]; A[p] = t;
      const pv = A[c][c];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = A[r][c] / pv;
        if (!f) continue;
        for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
      }
    }
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = A[i][n] / A[i][i];
    return x;
  }

  let solveOK = true;
  function relax(fixed) {
    fixed = fixed || new Set();
    const vars = model.nodes.filter(n => n.support !== "pin" && !fixed.has(n.id));
    if (!vars.length) { solveOK = true; return true; }
    const nv = vars.length * 2;
    for (let it = 0; it < 80; it++) {
      const { rows, res } = constraintRows(vars);
      if (!rows.length) { solveOK = true; return true; }
      let worst = 0;
      for (const c of res) worst = Math.max(worst, Math.abs(c));
      if (worst < 1e-8) { snapCoords(vars); solveOK = true; return true; }
      const m = rows.length;
      const mu = 1e-8 + worst * 1e-6;
      const A = [];
      for (let i = 0; i < m; i++) {
        const r = new Float64Array(m + 1), ri = rows[i];
        for (let j = 0; j < m; j++) {
          const rj = rows[j];
          let s = 0;
          for (let k = 0; k < nv; k++) s += ri[k] * rj[k];
          r[j] = s + (i === j ? mu : 0);
        }
        r[m] = -res[i];
        A.push(r);
      }
      const lam = gauss(A, m);
      if (!lam) { solveOK = false; return false; }
      for (let k = 0; k < nv; k++) {
        let d = 0;
        for (let i = 0; i < m; i++) d += rows[i][k] * lam[i];
        const n = vars[k >> 1];
        if (k % 2 === 0) n.x += d; else n.y += d;
      }
    }
    snapCoords(vars);
    solveOK = false;
    return false;
  }

  function snapCoords(vars) {
    for (const n of vars) {
      n.x = Math.round(n.x * 1e7) / 1e7;
      n.y = Math.round(n.y * 1e7) / 1e7;
      if (n.support === "slider") { /* rail anchor stays put */ }
    }
  }

  /* ---- minimum-norm solve of  A x = rhs ---- */
  function lsq(rows, rhs, nv) {
    const m = rows.length;
    if (!m) return new Float64Array(nv);
    const A = [];
    for (let i = 0; i < m; i++) {
      const r = new Float64Array(m + 1), ri = rows[i];
      for (let j = 0; j < m; j++) {
        const rj = rows[j];
        let s = 0;
        for (let k = 0; k < nv; k++) s += ri[k] * rj[k];
        r[j] = s + (i === j ? 1e-9 : 0);
      }
      r[m] = rhs[i];
      A.push(r);
    }
    const lam = gauss(A, m);
    if (!lam) return null;
    const x = new Float64Array(nv);
    for (let k = 0; k < nv; k++) {
      let s = 0;
      for (let i = 0; i < m; i++) s += rows[i][k] * lam[i];
      x[k] = s;
    }
    return x;
  }

  /* ============================================================
     Velocity & acceleration — analytic, from the same Jacobian.
     Squared-length form:  |p-q|² - L² = 0
       first  derivative:  2(p-q)·(vp-vq) = 0
       second derivative:  2(p-q)·(ap-aq) + 2|vp-vq|² = 0
     ============================================================ */
  function kinAt() {
    const all = model.nodes, ai = new Map(all.map((n, i) => [n.id, i]));
    const nAll = all.length * 2;

    const vel = new Map(), acc = new Map();
    for (const n of all) if (n.support === "pin") { vel.set(n.id, { x: 0, y: 0 }); acc.set(n.id, { x: 0, y: 0 }); }
    const tips = new Set();
    for (const d of drivers()) {
      const A = N(d.a), B = N(d.b);
      if (!A || !B) continue;
      const om = omega(d), rx = B.x - A.x, ry = B.y - A.y;
      vel.set(B.id, { x: -om * ry, y: om * rx });
      acc.set(B.id, { x: -om * om * rx, y: -om * om * ry });
      tips.add(B.id);
    }

    const vars = all.filter(n => n.support !== "pin" && !tips.has(n.id));
    const vi = new Map(vars.map((n, i) => [n.id, i]));
    const nv = vars.length * 2;

    const full = [], pair = [];
    for (const e of model.elems) {
      if (e.type !== "link") continue;
      const P = N(e.a), Q = N(e.b);
      const dx = 2 * (P.x - Q.x), dy = 2 * (P.y - Q.y);
      const f = new Float64Array(nAll);
      const p = ai.get(P.id), q = ai.get(Q.id);
      f[2 * p] += dx; f[2 * p + 1] += dy;
      f[2 * q] -= dx; f[2 * q + 1] -= dy;
      full.push(f); pair.push([P, Q]);
    }
    for (const n of all) {
      if (n.support !== "slider") continue;
      const th = n.dir * Math.PI / 180;
      const f = new Float64Array(nAll);
      const i = ai.get(n.id);
      f[2 * i] = -Math.sin(th); f[2 * i + 1] = Math.cos(th);
      full.push(f); pair.push(null);
    }

    function split(known, extra) {
      const rows = [], rhs = [];
      for (let r = 0; r < full.length; r++) {
        const f = full[r], row = new Float64Array(nv);
        let b = extra ? extra(r) : 0, touched = false;
        for (const n of all) {
          const i = ai.get(n.id);
          const cx = f[2 * i], cy = f[2 * i + 1];
          if (!cx && !cy) continue;
          if (vi.has(n.id)) {
            const j = vi.get(n.id);
            row[2 * j] += cx; row[2 * j + 1] += cy; touched = true;
          } else {
            const k = known.get(n.id) || { x: 0, y: 0 };
            b -= cx * k.x + cy * k.y;
          }
        }
        if (!touched) continue;
        rows.push(row); rhs.push(b);
      }
      return { rows, rhs };
    }

    const sv = split(vel, null);
    const xv = lsq(sv.rows, sv.rhs, nv);
    if (!xv) return null;
    vars.forEach((n, i) => vel.set(n.id, { x: xv[2 * i], y: xv[2 * i + 1] }));

    const sa = split(acc, r => {
      const pr = pair[r];
      if (!pr) return 0;
      const vp = vel.get(pr[0].id) || { x: 0, y: 0 }, vq = vel.get(pr[1].id) || { x: 0, y: 0 };
      const dvx = vp.x - vq.x, dvy = vp.y - vq.y;
      return -2 * (dvx * dvx + dvy * dvy);
    });
    const xa = lsq(sa.rows, sa.rhs, nv);
    if (!xa) return null;
    vars.forEach((n, i) => acc.set(n.id, { x: xa[2 * i], y: xa[2 * i + 1] }));

    return { vel, acc };
  }

  /* ============================================================
     Sweep: solve every crank angle 0…360° exactly
     ============================================================ */
  let sweep = null;

  /* ============================================================
     Dynamische modus — tijdintegratie van het beperkte stelsel
        M q̈ + Φ_qᵀ λ = F(q, q̇, t),    Φ(q, t) = 0
     Eén KKT-stelsel per RK4-stap, met Baumgarte-stabilisatie en na
     elke beeldstap een positie- en snelheidsprojectie. Hier sturen
     veren en dempers de beweging in plaats van alleen kracht te
     dragen, dus deze modus draait óók met vrijheidsgraden over.
     ============================================================ */
  const BA = 20, BB = 20;   // Baumgarte, 1/s

  function* computeDyn() {
    const fr = model.nodes.filter(n => n.support !== "pin");
    const nq = fr.length * 2;
    if (!nq) return null;
    const fi = new Map(fr.map((n, i) => [n.id, i]));
    const ds = drivers().filter(d => N(d.a) && N(d.b) && N(d.a).support === "pin" && fi.has(d.b));
    const bars = model.elems.filter(e => e.type === "link" && !e.driver && N(e.a) && N(e.b) &&
      !(N(e.a).support === "pin" && N(e.b).support === "pin"));
    const slis = model.nodes.filter(n => n.support === "slider");
    const nm = bars.length + slis.length + 2 * ds.length;
    if (nm > nq) return null;                       // overbepaald

    const fixed = {};
    for (const n of model.nodes) if (n.support === "pin") fixed[n.id] = { x: n.x, y: n.y };
    const dm = n => (n.m > 0 ? n.m : (model.defMass || 0.1));
    const mA = new Float64Array(nq);
    fr.forEach((n, i) => { mA[2 * i] = mA[2 * i + 1] = dm(n) * MM; });

    const pos = (q, id) => fi.has(id) ? { x: q[2 * fi.get(id)], y: q[2 * fi.get(id) + 1] } : fixed[id];
    const vel = (v, id) => fi.has(id) ? { x: v[2 * fi.get(id)], y: v[2 * fi.get(id) + 1] } : { x: 0, y: 0 };

    // Demping in scharnieren: een rotatiedemper tussen elk paar lichamen dat in
    // een knooppunt samenkomt (stangen, en de vaste wereld bij een oplegging).
    // Een moment τ op een stang wordt een krachtenkoppel op zijn uiteinden.
    const cj = model.jointDamp ? Math.max(0, model.cJoint || 0) * 1000 : 0;   // N·m·s -> N·mm·s
    const joints = [];
    if (cj > 0) for (const n of model.nodes) {
      const ls = model.elems.filter(e => e.type === "link" && (e.a === n.id || e.b === n.id) && N(e.a) && N(e.b));
      const ground = n.support !== "free";
      if (ls.length + (ground ? 1 : 0) >= 2) joints.push({ ls, ground });
    }
    function jointLoads(q, v, add) {
      for (const j of joints) {
        const bodies = j.ls.map(e => {
          const P = pos(q, e.a), Q = pos(q, e.b), vP = vel(v, e.a), vQ = vel(v, e.b);
          const rx = Q.x - P.x, ry = Q.y - P.y, L2 = rx * rx + ry * ry || 1;
          return { e, rx, ry, L2, w: (rx * (vQ.y - vP.y) - ry * (vQ.x - vP.x)) / L2 };
        });
        if (j.ground) bodies.push({ e: null, w: 0 });
        for (let a = 0; a < bodies.length; a++)
          for (let b = a + 1; b < bodies.length; b++) {
            const tau = -cj * (bodies[a].w - bodies[b].w);
            torque(bodies[a], tau); torque(bodies[b], -tau);
          }
      }
      function torque(B, tau) {
        if (!B.e) return;
        const k = tau / B.L2;
        add(B.e.b, -k * B.ry, k * B.rx);
        add(B.e.a, k * B.ry, -k * B.rx);
      }
    }

    // crank pose prescribed by the clock
    function crankAt(d, t) {
      const A = fixed[d.a], om = omega(d);
      const th = (d.theta0 || 0) * Math.PI / 180 + om * t;
      return { x: A.x + d.len * Math.cos(th), y: A.y + d.len * Math.sin(th),
               vx: -om * d.len * Math.sin(th), vy: om * d.len * Math.cos(th),
               ax: -om * om * d.len * Math.cos(th), ay: -om * om * d.len * Math.sin(th), th };
    }

    // Φ_q, Φ, Φ_t and the acceleration right-hand side
    function jac(t, q, v) {
      const rows = [], phi = [], gam = [], phit = [], kind = [];
      for (const e of bars) {
        const P = pos(q, e.a), Q = pos(q, e.b);
        const vP = vel(v, e.a), vQ = vel(v, e.b);
        const dx = P.x - Q.x, dy = P.y - Q.y;
        const row = new Float64Array(nq);
        if (fi.has(e.a)) { const i = fi.get(e.a); row[2 * i] += 2 * dx; row[2 * i + 1] += 2 * dy; }
        if (fi.has(e.b)) { const i = fi.get(e.b); row[2 * i] -= 2 * dx; row[2 * i + 1] -= 2 * dy; }
        const dvx = vP.x - vQ.x, dvy = vP.y - vQ.y;
        rows.push(row); phi.push(dx * dx + dy * dy - e.len * e.len);
        gam.push(-2 * (dvx * dvx + dvy * dvy)); phit.push(0); kind.push({ t: "bar", e });
      }
      for (const n of slis) {
        const th = n.dir * Math.PI / 180, nx = -Math.sin(th), ny = Math.cos(th);
        const row = new Float64Array(nq), i = fi.get(n.id);
        row[2 * i] = nx; row[2 * i + 1] = ny;
        const p = pos(q, n.id);
        rows.push(row); phi.push((p.x - n.ax) * nx + (p.y - n.ay) * ny);
        gam.push(0); phit.push(0); kind.push({ t: "sli", n });
      }
      for (const d of ds) {
        const c = crankAt(d, t), i = fi.get(d.b), B = pos(q, d.b);
        let r = new Float64Array(nq); r[2 * i] = 1;
        rows.push(r); phi.push(B.x - c.x); gam.push(c.ax); phit.push(-c.vx); kind.push({ t: "drv", d, c });
        r = new Float64Array(nq); r[2 * i + 1] = 1;
        rows.push(r); phi.push(B.y - c.y); gam.push(c.ay); phit.push(-c.vy); kind.push({ t: "drv", d, c });
      }
      return { rows, phi, gam, phit, kind };
    }

    function loads(q, v) {
      const F = new Float64Array(nq), EF = {};
      if (model.gravity) fr.forEach((n, i) => { F[2 * i + 1] -= dm(n) * G; });
      const cv = model.cVisc || 0;
      if (cv) for (let i = 0; i < nq; i++) F[i] -= cv * v[i];   // demping op elk vrij punt
      for (const e of model.elems) {
        if (e.type === "spring" || e.type === "damper") {
          const P = pos(q, e.a), Q = pos(q, e.b);
          const dx = Q.x - P.x, dy = Q.y - P.y, L = Math.hypot(dx, dy) || 1;
          const ux = dx / L, uy = dy / L;
          let Fv;
          if (e.type === "spring") Fv = e.k * (L - e.L0);
          else {
            const vP = vel(v, e.a), vQ = vel(v, e.b);
            Fv = e.c * ((vQ.x - vP.x) * ux + (vQ.y - vP.y) * uy);
          }
          EF[e.id] = Fv;
          if (fi.has(e.a)) { const i = fi.get(e.a); F[2 * i] += Fv * ux; F[2 * i + 1] += Fv * uy; }
          if (fi.has(e.b)) { const i = fi.get(e.b); F[2 * i] -= Fv * ux; F[2 * i + 1] -= Fv * uy; }
        } else if (e.type === "force" && fi.has(e.node)) {
          const i = fi.get(e.node), th = e.ang * Math.PI / 180;
          F[2 * i] += e.mag * Math.cos(th); F[2 * i + 1] += e.mag * Math.sin(th);
        }
      }
      if (cj > 0) jointLoads(q, v, (id, fx, fy) => {
        if (!fi.has(id)) return;
        const i = fi.get(id); F[2 * i] += fx; F[2 * i + 1] += fy;
      });
      return { F, EF };
    }

    function deriv(t, q, v) {
      const J = jac(t, q, v), { F, EF } = loads(q, v);
      const m = J.rows.length, n = nq + m;
      const A = [];
      for (let i = 0; i < n; i++) A.push(new Float64Array(n + 1));
      for (let i = 0; i < nq; i++) { A[i][i] = mA[i]; A[i][n] = F[i]; }
      for (let j = 0; j < m; j++) {
        const r = J.rows[j];
        let rv = 0;
        for (let k = 0; k < nq; k++) if (r[k]) { A[k][nq + j] = r[k]; A[nq + j][k] = r[k]; rv += r[k] * v[k]; }
        const pdot = rv + J.phit[j];
        A[nq + j][n] = J.gam[j] - 2 * BA * pdot - BB * BB * J.phi[j];
      }
      const x = gauss(A, n);
      if (!x) return null;
      return { a: x.subarray(0, nq), lam: x.subarray(nq), J, EF };
    }

    /* ---- time march ---- */
    const keep = model.nodes.map(n => ({ n, x: n.x, y: n.y }));
    const h0 = Math.max(1e-6, (model.dtStep || 0.2) / 1000);
    const q = new Float64Array(nq), v = new Float64Array(nq);
    fr.forEach((n, i) => { q[2 * i] = n.x; q[2 * i + 1] = n.y; });
    project(0, q, v);

    // "tot evenwicht": loop eerst zonder op te slaan tot het stil ligt
    let dur = Math.max(0.01, model.simDur || 2);
    let settled = null;
    if (model.durMode === "equil") {
      const q0 = q.slice(), v0 = v.slice();
      const maxT = Math.max(0.2, model.maxT || 30);
      const VTOL = 0.5, ATOL = 50;       // mm/s en mm/s²
      let t = 0, calm = 0, k = 0;
      while (t < maxT) {
        if (!rk4(t, q, v, h0)) break;
        t += h0;
        if ((k % 250) === 0) yield { phase: "equil", t, maxT };
        if ((++k % 10) === 0) {
          project(t, q, v);
          let mv = 0;
          for (let i = 0; i < nq; i++) mv = Math.max(mv, Math.abs(v[i]));
          const d = deriv(t, q, v);
          let ma = 0;
          if (d) for (let i = 0; i < nq; i++) ma = Math.max(ma, Math.abs(d.a[i]));
          if (mv < VTOL && ma < ATOL) { calm += 10 * h0; if (calm > 0.1) break; } else calm = 0;
        }
      }
      settled = Math.min(maxT, Math.max(0.05, t));
      dur = settled;
      q.set(q0); v.set(v0);
    }
    const dtF = dur / 360;
    let sub = Math.max(1, Math.ceil(dtF / h0));
    if (sub > 2000) sub = 2000;
    const h = dtF / sub;

    const S = { ok: new Array(361).fill(false), pos: {}, vel: {}, acc: {},
                N: {}, EF: {}, R: {}, T: {}, E: new Array(361).fill(NaN),
                t: new Array(361), dur, settled, stat: true, dyn: true };
    for (const n of model.nodes) {
      S.pos[n.id] = new Array(361); S.vel[n.id] = new Array(361); S.acc[n.id] = new Array(361);
      if (n.support !== "free") S.R[n.id] = new Array(361);
    }
    for (const e of model.elems) {
      if (e.type === "link") S.N[e.id] = new Array(361);
      if (e.type === "spring" || e.type === "damper") S.EF[e.id] = new Array(361);
    }
    for (const d of ds) S.T[d.id] = new Array(361).fill(NaN);

    let Rmax = 0, Nmax = 0, bad = false;
    for (let f = 0; f <= 360; f++) {
      const t = f * dtF;
      yield { phase: "rec", f };
      const d0 = deriv(t, q, v);
      if (!d0) { bad = true; break; }
      record(f, t, q, v, d0);
      Rmax = Math.max(Rmax, S._rmax || 0); Nmax = Math.max(Nmax, S._nmax || 0);
      if (f === 360) break;
      for (let s = 0; s < sub; s++) {
        if (!rk4(t + s * h, q, v, h)) { bad = true; break; }
      }
      if (bad) break;
      project(t + dtF, q, v);
      if (!isFinite(q[0])) { bad = true; break; }
    }
    keep.forEach(r => { r.n.x = r.x; r.n.y = r.y; });
    S.Rmax = Rmax; S.Nmax = Nmax;
    solveOK = S.ok.some(Boolean);
    return S.ok.some(Boolean) ? S : null;

    function rk4(t, q, v, h) {
      const n = nq;
      const k1 = deriv(t, q, v); if (!k1) return false;
      const q2 = add(q, v, h / 2), v2 = add(v, k1.a, h / 2);
      const k2 = deriv(t + h / 2, q2, v2); if (!k2) return false;
      const q3 = add(q, v2, h / 2), v3 = add(v, k2.a, h / 2);
      const k3 = deriv(t + h / 2, q3, v3); if (!k3) return false;
      const q4 = add(q, v3, h), v4 = add(v, k3.a, h);
      const k4 = deriv(t + h, q4, v4); if (!k4) return false;
      for (let i = 0; i < n; i++) {
        q[i] += h / 6 * (v[i] + 2 * v2[i] + 2 * v3[i] + v4[i]);
        v[i] += h / 6 * (k1.a[i] + 2 * k2.a[i] + 2 * k3.a[i] + k4.a[i]);
      }
      return true;
    }
    function add(a, b, s) {
      const o = new Float64Array(a.length);
      for (let i = 0; i < a.length; i++) o[i] = a[i] + b[i] * s;
      return o;
    }

    // pull the state back onto the constraint manifold
    function project(t, q, v) {
      fr.forEach((n, i) => { n.x = q[2 * i]; n.y = q[2 * i + 1]; });
      const tips = new Set();
      for (const d of ds) {
        const c = crankAt(d, t), B = N(d.b);
        B.x = c.x; B.y = c.y; tips.add(B.id);
      }
      relax(tips);
      fr.forEach((n, i) => { q[2 * i] = n.x; q[2 * i + 1] = n.y; });
      const J = jac(t, q, v);
      const err = J.rows.map((r, j) => {
        let s = J.phit[j];
        for (let k = 0; k < nq; k++) s += r[k] * v[k];
        return -s;
      });
      const dv = lsq(J.rows, err, nq);
      if (dv) for (let i = 0; i < nq; i++) v[i] += dv[i];
    }

    function record(f, t, q, v, D) {
      S.ok[f] = true; S.t[f] = t;
      fr.forEach((n, i) => { n.x = q[2 * i]; n.y = q[2 * i + 1]; });
      for (const n of model.nodes) {
        const p = n.support === "pin" ? fixed[n.id] : { x: q[2 * fi.get(n.id)], y: q[2 * fi.get(n.id) + 1] };
        S.pos[n.id][f] = { x: p.x, y: p.y };
        S.vel[n.id][f] = vel(v, n.id);
        S.acc[n.id][f] = fi.has(n.id)
          ? { x: D.a[2 * fi.get(n.id)], y: D.a[2 * fi.get(n.id) + 1] } : { x: 0, y: 0 };
      }
      for (const id in S.EF) S.EF[id][f] = D.EF[id];

      // constraint multipliers -> bar forces, reactions, torques
      const onPin = {}, jPin = {};
      for (const n of model.nodes) if (n.support === "pin") { onPin[n.id] = { x: 0, y: 0 }; jPin[n.id] = { x: 0, y: 0 }; }
      if (cj > 0) jointLoads(q, v, (id, fx, fy) => { if (jPin[id]) { jPin[id].x += fx; jPin[id].y += fy; } });
      let rm = 0, nm2 = 0;
      D.J.kind.forEach((k, j) => {
        const lam = D.lam[j];
        if (k.t === "bar") {
          const P = pos(q, k.e.a), Q = pos(q, k.e.b);
          const dx = P.x - Q.x, dy = P.y - Q.y, L = Math.hypot(dx, dy) || 1;
          S.N[k.e.id][f] = 2 * L * lam;
          nm2 = Math.max(nm2, Math.abs(2 * L * lam));
          if (onPin[k.e.a]) { onPin[k.e.a].x += -2 * dx * lam; onPin[k.e.a].y += -2 * dy * lam; }
          if (onPin[k.e.b]) { onPin[k.e.b].x += 2 * dx * lam; onPin[k.e.b].y += 2 * dy * lam; }
        } else if (k.t === "sli") {
          const th = k.n.dir * Math.PI / 180, nx = -Math.sin(th), ny = Math.cos(th);
          S.R[k.n.id][f] = { x: -nx * lam, y: -ny * lam, n: -lam };
          rm = Math.max(rm, Math.abs(lam));
        }
      });
      // drivers come in pairs of rows
      let j = bars.length + slis.length;
      for (const d of ds) {
        const lx = D.lam[j], ly = D.lam[j + 1]; j += 2;
        const A = fixed[d.a], B = S.pos[d.b][f];
        const rx = B.x - A.x, ry = B.y - A.y;
        S.T[d.id][f] = (ry * lx - rx * ly) * MM;
        S.N[d.id][f] = (-lx * rx - ly * ry) / (Math.hypot(rx, ry) || 1);
        if (onPin[d.a]) { onPin[d.a].x += lx; onPin[d.a].y += ly; }
      }
      for (const n of model.nodes) {
        if (n.support !== "pin") continue;
        const o = onPin[n.id];
        let fx = o.x + jPin[n.id].x, fy = o.y + jPin[n.id].y;
        for (const e of model.elems) {
          if (e.type === "spring" || e.type === "damper") {
            const sgn = e.a === n.id ? 1 : e.b === n.id ? -1 : 0;
            if (!sgn) continue;
            const P = pos(q, e.a), Q = pos(q, e.b);
            const dx = Q.x - P.x, dy = Q.y - P.y, L = Math.hypot(dx, dy) || 1;
            fx += sgn * D.EF[e.id] * dx / L; fy += sgn * D.EF[e.id] * dy / L;
          } else if (e.type === "force" && e.node === n.id) {
            const th = e.ang * Math.PI / 180;
            fx += e.mag * Math.cos(th); fy += e.mag * Math.sin(th);
          }
        }
        if (model.gravity) fy -= (n.m || 0) * G;
        S.R[n.id][f] = { x: -fx, y: -fy };
        rm = Math.max(rm, Math.hypot(fx, fy));
      }
      S._rmax = rm; S._nmax = nm2;

      // energy bookkeeping, so drift is visible rather than hidden
      let E = 0;
      for (const n of model.nodes) {
        const vv = S.vel[n.id][f], m = n.support === "pin" ? (n.m || 0) : dm(n);
        E += 0.5 * m * (vv.x * vv.x + vv.y * vv.y) * 1e-6;
        if (model.gravity) E += m * G * S.pos[n.id][f].y * 1e-3;
      }
      for (const e of model.elems) {
        if (e.type !== "spring") continue;
        const P = S.pos[e.a][f], Q = S.pos[e.b][f];
        const L = Math.hypot(Q.x - P.x, Q.y - P.y);
        E += 0.5 * e.k * (L - e.L0) * (L - e.L0) * 1e-3;
      }
      S.E[f] = E;
    }
  }

  function computeSweep() {
    sweep = null;
    const ds = drivers();
    if (!ds.length) return;
    if (mobility().dofDriven !== 0) return;
    if (ds.some(d => !N(d.a) || !N(d.b) || N(d.a).support !== "pin")) return;

    const keep = model.nodes.map(n => ({ n, x: n.x, y: n.y }));
    // One full turn of the slowest crank: the whole motion repeats only if the
    // speeds are commensurable, so this window is what we show.
    const rp = ds.map(d => Math.abs(d.rpm || 0)).filter(r => r > 0);
    const dur = rp.length ? 60 / Math.min(...rp) : 1;
    const S = { ok: new Array(361).fill(false), pos: {}, vel: {}, acc: {},
                N: {}, EF: {}, R: {}, T: {}, t: new Array(361), dur, stat: false };
    for (const d of ds) S.T[d.id] = new Array(361).fill(NaN);
    for (const n of model.nodes) {
      S.pos[n.id] = new Array(361); S.vel[n.id] = new Array(361); S.acc[n.id] = new Array(361);
      if (n.support !== "free") S.R[n.id] = new Array(361);
    }
    for (const e of model.elems) {
      if (e.type === "link") S.N[e.id] = new Array(361);
      if (e.type === "spring" || e.type === "damper") S.EF[e.id] = new Array(361);
    }

    let Rmax = 0, Nmax = 0;
    for (let i = 0; i <= 360; i++) {
      const t = dur * i / 360;
      S.t[i] = t;
      const ok = placeAt(t);
      S.ok[i] = ok;
      const kin = ok ? kinAt() : null;
      for (const n of model.nodes) {
        S.pos[n.id][i] = { x: n.x, y: n.y };
        S.vel[n.id][i] = kin ? kin.vel.get(n.id) || { x: 0, y: 0 } : { x: 0, y: 0 };
        S.acc[n.id][i] = kin ? kin.acc.get(n.id) || { x: 0, y: 0 } : { x: 0, y: 0 };
      }
      const fr = kin ? forcesAt(kin.vel, kin.acc) : null;
      if (fr) {
        S.stat = true;
        for (const id in S.T) S.T[id][i] = fr.T[id];
        for (const id in S.N) S.N[id][i] = fr.N[id];
        for (const id in S.EF) S.EF[id][i] = fr.EF[id];
        for (const id in S.R) { S.R[id][i] = fr.R[id]; Rmax = Math.max(Rmax, Math.hypot(fr.R[id].x, fr.R[id].y)); }
        for (const id in S.N) Nmax = Math.max(Nmax, Math.abs(fr.N[id] || 0));
      }
    }
    S.Rmax = Rmax; S.Nmax = Nmax;
    keep.forEach(r => { r.n.x = r.x; r.n.y = r.y; });
    solveOK = S.ok.some(Boolean);
    sweep = S.ok.some(Boolean) ? S : null;
  }

  // k mag een gebroken beeldnummer zijn: de standen worden dan lineair
  // tussen twee opgeslagen beelden geïnterpoleerd, zodat afspelen vloeiend blijft.
  function applyFrame(k) {
    if (!sweep) return;
    const kk = Math.max(0, Math.min(360, k));
    const i = Math.round(kk);
    frame = i;                       // de klok loopt door, ook over een blokkade heen
    if (!sweep.ok[i]) return;
    const i0 = Math.floor(kk), i1 = Math.min(360, i0 + 1), f = kk - i0;
    const mix = f > 1e-9 && sweep.ok[i0] && sweep.ok[i1];
    for (const n of model.nodes) {
      const P = sweep.pos[n.id];
      if (!P) continue;
      const p = mix ? P[i0] : P[i];
      if (!p) continue;
      if (mix) { n.x = p.x + (P[i1].x - p.x) * f; n.y = p.y + (P[i1].y - p.y) * f; }
      else { n.x = p.x; n.y = p.y; }
    }
    const t = mix ? sweep.t[i0] + (sweep.t[i1] - sweep.t[i0]) * f : sweep.t[i];
    for (const d of drivers())
      d.theta = ((((d.theta0 || 0) + omega(d) * t * 180 / Math.PI) % 360) + 360) % 360;
  }

  /* ============================================================
     Inverse dynamics — one linear system per crank angle.
     Bars are two-force members (axial N). The crank is not: it carries
     a motor torque, so it transmits a full force vector at its tip.
     Unknowns: N per bar, Fx/Fy at the crank tip, reaction per scharnier
     (2) and per glijder (1, normal to the rail). Equations: ΣF = m·a
     at every point. Square by construction when DOF = 0.
     ============================================================ */
  const G = 9.81;         // m/s²
  const MM = 1e-3;        // kg·mm/s²  ->  N

  function forcesAt(vel, acc) {
    const nd = model.nodes, ri = new Map(nd.map((n, i) => [n.id, i]));
    const links = model.elems.filter(e => e.type === "link");
    const pins = nd.filter(n => n.support === "pin");
    const slis = nd.filter(n => n.support === "slider");

    let nc = 0;
    const cL = new Map(), cP = new Map(), cS = new Map(), cD = new Map();
    for (const e of links) { if (e.driver) { cD.set(e.id, nc); nc += 2; } else cL.set(e.id, nc++); }
    for (const n of pins) { cP.set(n.id, nc); nc += 2; }
    for (const n of slis) cS.set(n.id, nc++);
    const neq = 2 * nd.length;
    if (nc !== neq) return null;

    const A = [];
    for (let i = 0; i < neq; i++) A.push(new Float64Array(nc + 1));

    for (const e of links) {
      const P = N(e.a), Q = N(e.b);
      const dx = Q.x - P.x, dy = Q.y - P.y, L = Math.hypot(dx, dy) || 1;
      const ux = dx / L, uy = dy / L;
      const p = 2 * ri.get(P.id), q = 2 * ri.get(Q.id);
      if (e.driver) {
        const c = cD.get(e.id);
        A[q][c] += 1; A[q + 1][c + 1] += 1;   // crank pushes its tip
        A[p][c] -= 1; A[p + 1][c + 1] -= 1;   // and the pivot the other way
      } else {
        const c = cL.get(e.id);
        A[p][c] += ux; A[p + 1][c] += uy;
        A[q][c] -= ux; A[q + 1][c] -= uy;
      }
    }
    for (const n of pins) { const i = 2 * ri.get(n.id), c = cP.get(n.id); A[i][c] += 1; A[i + 1][c + 1] += 1; }
    for (const n of slis) {
      const th = n.dir * Math.PI / 180, i = 2 * ri.get(n.id), c = cS.get(n.id);
      A[i][c] += -Math.sin(th); A[i + 1][c] += Math.cos(th);
    }

    // known loads
    const kn = nd.map(() => ({ x: 0, y: 0 })), EF = {};
    for (const e of model.elems) {
      if (e.type === "spring" || e.type === "damper") {
        const P = N(e.a), Q = N(e.b);
        const dx = Q.x - P.x, dy = Q.y - P.y, L = Math.hypot(dx, dy) || 1;
        const ux = dx / L, uy = dy / L;
        let F;
        if (e.type === "spring") F = e.k * (L - e.L0);
        else {
          const vP = vel.get(P.id) || { x: 0, y: 0 }, vQ = vel.get(Q.id) || { x: 0, y: 0 };
          F = e.c * ((vQ.x - vP.x) * ux + (vQ.y - vP.y) * uy);
        }
        EF[e.id] = F;
        const p = ri.get(P.id), q = ri.get(Q.id);
        kn[p].x += F * ux; kn[p].y += F * uy;
        kn[q].x -= F * ux; kn[q].y -= F * uy;
      } else if (e.type === "force") {
        const i = ri.get(e.node);
        if (i === undefined) continue;
        const t = e.ang * Math.PI / 180;
        kn[i].x += e.mag * Math.cos(t); kn[i].y += e.mag * Math.sin(t);
      }
    }
    nd.forEach((n, i) => {
      const a = acc.get(n.id) || { x: 0, y: 0 }, m = n.m || 0;
      if (model.gravity) kn[i].y -= m * G;
      A[2 * i][nc] = m * a.x * MM - kn[i].x;
      A[2 * i + 1][nc] = m * a.y * MM - kn[i].y;
    });

    const x = gauss(A, nc);
    if (!x) return null;

    const out = { N: {}, EF, R: {}, T: {} };
    for (const e of links) if (!e.driver) out.N[e.id] = x[cL.get(e.id)];
    for (const n of pins) out.R[n.id] = { x: x[cP.get(n.id)], y: x[cP.get(n.id) + 1] };
    for (const n of slis) {
      const th = n.dir * Math.PI / 180, Rn = x[cS.get(n.id)];
      out.R[n.id] = { x: -Math.sin(th) * Rn, y: Math.cos(th) * Rn, n: Rn };
    }
    for (const e of links) {
      if (!e.driver) continue;
      const c = cD.get(e.id), P = N(e.a), Q = N(e.b);
      const rx = Q.x - P.x, ry = Q.y - P.y, L = Math.hypot(rx, ry) || 1;
      out.T[e.id] = (rx * x[c + 1] - ry * x[c]) * MM;       // N·mm -> N·m
      out.N[e.id] = (x[c] * rx + x[c + 1] * ry) / L;        // axial part of the crank load
    }
    return out;
  }

  /* ---- measurable channels ---- */
  const QLAB = { x: "x", y: "y", vx: "vₓ", vy: "v_y", v: "|v|", ax: "aₓ", ay: "a_y", a: "|a|" };
  const QU = { x: "mm", y: "mm", vx: "mm/s", vy: "mm/s", v: "mm/s", ax: "mm/s²", ay: "mm/s²", a: "mm/s²" };

  // Elk kanaal hoort bij één onderdeel (o, obj) en heeft een korte naam (q),
  // zodat de keuzelijst per onderdeel één regel met knopjes kan tonen.
  function channels() {
    const out = [];
    const pair = e => (N(e.a) ? N(e.a).name : "?") + (N(e.b) ? N(e.b).name : "?");
    for (const n of model.nodes) {
      const o = (n.support === "pin" ? "Scharnier " : n.support === "slider" ? "Glijder " : "Punt ") + n.name;
      // een scharnier beweegt niet: zijn x, v en a blijven bruikbaar in formules, maar niet in de lijst
      for (const k in QLAB) out.push({ key: "n|" + n.id + "|" + k, lab: n.name + " · " + QLAB[k], q: QLAB[k],
                                       u: QU[k], al: n.name + "." + k, g: "Punten", o, obj: n.id, hide: n.support === "pin" });
      if (n.support === "pin") [["Rx", "Rₓ"], ["Ry", "R_y"], ["R", "|R|"]].forEach(([k, q]) =>
        out.push({ key: "r|" + n.id + "|" + k, lab: "reactie " + n.name + " · " + q, q, u: "N",
                   al: k + "_" + n.name, g: "Punten", o, obj: n.id }));
      if (n.support === "slider")
        out.push({ key: "r|" + n.id + "|Rn", lab: "reactie " + n.name + " · Rₙ", q: "Rₙ", u: "N",
                   al: "Rn_" + n.name, g: "Punten", o, obj: n.id });
    }
    for (const e of model.elems) {
      if (e.type === "link") {
        const o = (e.driver ? "Kruk " : "Stang ") + pair(e);
        out.push({ key: "l|" + e.id + "|N", lab: (e.driver ? "kruk " : "stang ") + pair(e) + " · N", q: "N", u: "N",
                   al: "N_" + pair(e), g: "Stangen", o, obj: e.id });
        if (e.driver) out.push({ key: "t|" + e.id + "|T", lab: "krukmoment " + pair(e) + " · T", q: "T", u: "N·m",
                                 al: "T_" + pair(e), g: "Stangen", o, obj: e.id });
      }
      if (e.type === "spring") out.push({ key: "s|" + e.id + "|F", lab: "veer " + pair(e) + " · F", q: "F", u: "N",
                                          al: "F_" + pair(e), g: "Krachtelementen", o: "Veer " + pair(e), obj: e.id });
      if (e.type === "damper") out.push({ key: "s|" + e.id + "|F", lab: "demper " + pair(e) + " · F", q: "F", u: "N",
                                          al: "Fd_" + pair(e), g: "Krachtelementen", o: "Demper " + pair(e), obj: e.id });
    }
    if (model.mode === "dyn") out.push({ key: "e||E", lab: "totale energie E", q: "E", u: "J", al: "E",
                                         g: "Systeem", o: "Systeem", obj: "" });
    return out;
  }

  function chVal(S, key, i) {
    const [t, id, k] = key.split("|");
    if (t === "n") {
      if (!S.pos[id]) return NaN;
      const p = S.pos[id][i], v = S.vel[id][i], a = S.acc[id][i];
      return { x: p.x, y: p.y, vx: v.x, vy: v.y, v: Math.hypot(v.x, v.y),
               ax: a.x, ay: a.y, a: Math.hypot(a.x, a.y) }[k];
    }
    if (t === "l") return S.N[id] ? S.N[id][i] : NaN;
    if (t === "s") return S.EF[id] ? S.EF[id][i] : NaN;
    if (t === "r") {
      const R = S.R[id] ? S.R[id][i] : null;
      if (!R) return NaN;
      return k === "Rx" ? R.x : k === "Ry" ? R.y : k === "Rn" ? R.n : Math.hypot(R.x, R.y);
    }
    if (t === "t") return S.T[id] ? S.T[id][i] : NaN;
    if (t === "e") return S.E ? S.E[i] : NaN;
    return NaN;
  }
  function chU(key) { const c = CHM.get(key); return c ? c.u : ""; }
  function chLab(key) { const c = CHM.get(key); return c ? c.lab : "?"; }
  const chUnit = chU;

  function crankAngle(l) {
    const A = N(l.a), B = N(l.b);
    let a = Math.atan2(B.y - A.y, B.x - A.x) * 180 / Math.PI;
    return Math.round(((a % 360) + 360) % 360 * 100) / 100;
  }

  function drivers() { return model.elems.filter(e => e.type === "link" && e.driver); }
  const omega = d => (d.cw ? -1 : 1) * (d.rpm || 0) * Math.PI / 30;   // rad/s

  // Put every crank where it is at time t and solve the rest around them.
  function placeAt(t) {
    const fix = new Set();
    for (const d of drivers()) {
      const A = N(d.a), B = N(d.b);
      if (!A || !B) continue;
      const th = (d.theta0 || 0) * Math.PI / 180 + omega(d) * t;
      B.x = A.x + d.len * Math.cos(th);
      B.y = A.y + d.len * Math.sin(th);
      d.theta = (((th * 180 / Math.PI) % 360) + 360) % 360;
      fix.add(B.id);
    }
    return relax(fix);
  }

  // Lengths / rest lengths follow the sketch while you drag.
  function reharvest(nodeId) {
    for (const e of model.elems) {
      if (e.a === nodeId || e.b === nodeId) {
        const L = dist(N(e.a), N(e.b));
        if (e.type === "link") e.len = round2(L);
        if (e.type === "spring") e.L0 = round2(L);
      }
    }
  }

  function setDriver(linkId) {
    const l = E(linkId);
    if (!l || l.type !== "link") return;
    const pinned = N(l.a).support === "pin" || N(l.b).support === "pin";
    if (!pinned) { flash("De kruk moet één vast scharnier hebben. Zet eerst een scharnier op een van de uiteinden."); return; }
    const on = !l.driver;
    if (on) {
      if (N(l.a).support !== "pin") { const t = l.a; l.a = l.b; l.b = t; }
      if (drivers().some(d => d.id !== l.id && d.b === l.b)) {
        flash("Dat punt wordt al door een andere kruk aangedreven."); return;
      }
      l.theta0 = crankAngle(l);
      l.theta = l.theta0;
      if (l.rpm === undefined) l.rpm = 60;
      if (l.cw === undefined) l.cw = false;
    }
    l.driver = on;
    changed();
  }

  let flashMsg = "", flashT = 0;
  function flash(m) {
    flashMsg = m; flashT = Date.now();
    document.getElementById("hint").innerHTML = '<b style="color:var(--bad)">' + m + '</b>';
    hintShow();
    setTimeout(() => { if (Date.now() - flashT >= 2600) setTool(tool); }, 2700);
  }

  /* ============================================================
     Mobility (Gruebler on the point/bar model)
     ============================================================ */
  function mobility() {
    const free = model.nodes.filter(n => n.support !== "pin");
    const unknowns = 2 * free.length;
    const links = model.elems.filter(e => e.type === "link");
    const sliders = model.nodes.filter(n => n.support === "slider");
    // a bar between two pinned nodes constrains nothing
    const activeLinks = links.filter(e => !(N(e.a).support === "pin" && N(e.b).support === "pin"));
    const cons = activeLinks.length + sliders.length;
    const driver = links.filter(e => e.driver).length;
    return {
      unknowns, cons, driver,
      dof: unknowns - cons,
      dofDriven: unknowns - cons - driver,
      nNodes: model.nodes.length,
      nPinned: model.nodes.length - free.length,
      nSliders: sliders.length,
      nLinks: links.length,
      nDead: links.length - activeLinks.length
    };
  }

  function syncDynInputs() {
    const a = document.getElementById("autoChk"); if (!a) return;
    a.checked = !!model.autoSolve;
    const eq = model.durMode === "equil";
    document.getElementById("durMode").value = eq ? "equil" : "fixed";
    document.getElementById("cvInp").value = model.cVisc || 0;
    document.getElementById("jdChk").checked = !!model.jointDamp;
    document.getElementById("cjInp").value = model.cJoint || 0;
    document.getElementById("cjInp").disabled = !model.jointDamp;
    document.getElementById("durInp").value = model.simDur;
    document.getElementById("maxInp").value = model.maxT || 30;
    document.getElementById("durRow").hidden = eq;
    document.getElementById("maxRow").hidden = !eq;
  }

  function syncDof() {
    const m = mobility();
    const el = document.getElementById("dofVal");
    const of = document.getElementById("dofOf");
    const note = document.getElementById("dofNote");
    if (!model.nodes.length) {
      el.textContent = "–"; el.className = "big"; of.textContent = "";
      note.textContent = "Nog geen model. Plaats punten en verbind ze met schakels.";
      document.getElementById("tally").innerHTML = ""; return;
    }
    const v = m.driver ? m.dofDriven : m.dof;
    el.textContent = (v > 0 ? "+" : "") + v;
    of.textContent = m.driver ? "met aandrijving" : "zonder aandrijving";
    el.className = "big " + (v === 0 ? "ok" : v > 0 ? "warn" : "bad");
    if (v === 0) {
      note.innerHTML = m.driver
        ? "Bepaald. Elke krukstand legt het hele mechanisme vast — precies wat de exacte oplosser nodig heeft."
        : "Star raamwerk. Voeg een aandrijving toe om het te laten bewegen.";
    } else if (v > 0) {
      note.textContent = v === 1 && !m.driver
        ? "Eén vrijheidsgraad over. Wijs een schakel aan als kruk en het mechanisme is bepaald."
        : "Onderbepaald: " + v + " vrijheidsgraden te veel. Voeg schakels of opleggingen toe.";
    } else {
      note.textContent = "Overbepaald met " + (-v) + ". Er zijn te veel schakels of opleggingen — de lengtes kunnen elkaar tegenspreken.";
    }
    if (model.mode === "dyn") {
      const dn = document.getElementById("dynNote");
      if (v > 0 || m.dof > 0) {
        note.innerHTML = "Dynamisch: " + Math.max(v, 0) +
          " vrijheidsgra" + (Math.max(v, 0) === 1 ? "ad" : "den") +
          " die door veren, dempers, krachten en massa worden gestuurd.";
      } else if (m.dof === 0) {
        note.textContent = "Bepaald — de beweging ligt al vast; tijdintegratie voegt hier niets toe.";
      }
      if (dn && sweep && sweep.settled)
        dn.innerHTML = "Evenwicht na <b>" + sweep.settled.toFixed(2) + " s</b>. " +
          "Punten zonder massa rekenen met " + fmt(model.defMass) + " kg.";
      else if (dn) dn.innerHTML = sweep
        ? "Punten zonder eigen massa rekenen met " + fmt(model.defMass) + " kg. " +
          "Kleinere tijdstap = nauwkeuriger en trager. Plot <b>totale energie E</b> om drift te zien."
        : "Nog geen oplossing — het stelsel is overbepaald of de integratie liep vast.";
    }
    if (!solveOK) {
      note.innerHTML = '<b style="color:var(--bad)">Deze stand is niet samen te stellen.</b> ' +
        'De stangen halen elkaar niet — draai de kruk terug of pas een lengte aan.';
    }
    document.getElementById("tally").innerHTML =
      row("punten", m.nNodes) + row("scharnieren", m.nPinned) + row("glijders", m.nSliders) +
      row("schakels", m.nLinks + (m.nDead ? " (" + m.nDead + " star)" : "")) +
      row("onbekenden", m.unknowns) + row("vergelijkingen", m.cons + m.driver);
    function row(k, v) { return "<span>" + k + "</span><b>" + v + "</b>"; }
  }

  /* ============================================================
     Picking
     ============================================================ */
  const HIT = window.matchMedia("(pointer: coarse)").matches ? 18 : 11;
  function pickNode(sp) {
    let best = null, bd = HIT;
    for (const n of model.nodes) {
      const s = toScr(n), d = Math.hypot(s.x - sp.x, s.y - sp.y);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  function pickElem(sp) {
    let best = null, bd = 9;
    for (const e of model.elems) {
      let d = Infinity;
      if (e.type === "force") {
        const n = N(e.node); if (!n) continue;
        const s = toScr(n), th = e.ang * Math.PI / 180;
        const tip = { x: s.x + Math.cos(th) * 58, y: s.y - Math.sin(th) * 58 };
        d = segDist(sp, s, tip);
      } else {
        const A = toScr(N(e.a)), B = toScr(N(e.b));
        d = segDist(sp, A, B);
      }
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  function segDist(p, a, b) {
    const vx = b.x - a.x, vy = b.y - a.y;
    const L2 = vx * vx + vy * vy;
    let t = L2 ? ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
  }

  /* ============================================================
     Pointer interaction
     ============================================================ */
  let drag = null;  // {mode:'node'|'pan', ...}

  function localPt(ev) {
    const r = cv.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  const ptrs = new Map();
  let pinch = null;
  function pinchNow() {
    const a = [...ptrs.values()];
    return { d: Math.max(1, Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y)),
             mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2 };
  }

  cv.addEventListener("pointerdown", ev => {
    cv.setPointerCapture(ev.pointerId);
    ptrs.set(ev.pointerId, localPt(ev));
    if (ptrs.size === 2) {
      drag = null;
      const q = pinchNow();
      pinch = { d: q.d, mx: q.mx, my: q.my, s: view.s, ox: view.ox, oy: view.oy };
      return;
    }
    if (ptrs.size > 2) return;
    const sp = localPt(ev);
    const wp = toWld(sp);
    const hitN = pickNode(sp), hitE = hitN ? null : pickElem(sp);

    if (ev.button === 1 || ev.shiftKey || (tool === "select" && !hitN && !hitE)) {
      drag = { mode: "pan", sx: sp.x, sy: sp.y, ox: view.ox, oy: view.oy };
      cv.style.cursor = "grabbing";
      return;
    }

    // Buiten t = 0 is het model alleen te bekijken: selecteren en sporen mag,
    // al het andere wacht tot je terug bent op t = 0.
    const editing = tool !== "select" && tool !== "trace";
    if (editing && !atT0()) {
      if (hitN) sel = { kind: "node", id: hitN.id };
      else if (hitE) sel = { kind: "elem", id: hitE.id };
      syncInspector(); draw(); lockNudge();
      return;
    }
    if (editing) cancelJob();

    let edited = false;          // alleen echte modelwijzigingen rekenen opnieuw
    switch (tool) {
      case "select":
        if (hitN) {
          sel = { kind: "node", id: hitN.id };
          if (atT0()) { cancelJob(); drag = { mode: "node", id: hitN.id, dx: hitN.x - wp.x, dy: hitN.y - wp.y, moved: false }; }
          else lockNudge();
        } else if (hitE) {
          sel = { kind: "elem", id: hitE.id };
        }
        break;

      case "node": {
        const n = addNode(snapPt(wp));
        sel = { kind: "node", id: n.id };
        edited = true;
        break;
      }

      case "link": case "spring": case "damper": {
        const n = hitN || addNode(snapPt(wp));
        edited = !hitN;
        if (!pending) { pending = n.id; }
        else if (pending === n.id) { pending = null; }
        else {
          const e = addTwoNode(tool, pending, n.id);
          pending = null;
          if (e) { sel = { kind: "elem", id: e.id }; edited = true; }
        }
        break;
      }

      case "pin": {
        const n = hitN || addNode(snapPt(wp));
        n.support = n.support === "pin" ? "free" : "pin";
        anchorHere(n);
        sel = { kind: "node", id: n.id };
        edited = true;
        break;
      }

      case "slider": {
        const n = hitN || addNode(snapPt(wp));
        n.support = n.support === "slider" ? "free" : "slider";
        anchorHere(n);
        sel = { kind: "node", id: n.id };
        edited = true;
        break;
      }

      case "driver":
        // setDriver rekent zelf door
        if (hitE && hitE.type === "link") { sel = { kind: "elem", id: hitE.id }; setDriver(hitE.id); }
        else flash("Klik op een schakel, niet op een punt.");
        break;

      case "force":
        if (hitN) {
          const e = { id: eid(), type: "force", node: hitN.id, mag: 100, ang: -90 };
          model.elems.push(e); sel = { kind: "elem", id: e.id };
          edited = true;
        }
        break;

      case "mass":
        if (hitN) { if (!hitN.m) hitN.m = 1; sel = { kind: "node", id: hitN.id }; edited = true; }
        break;

      case "trace":
        if (hitN) { hitN.trace = !hitN.trace; sel = { kind: "node", id: hitN.id }; touched(); }
        break;

      case "del":
        if (hitN) { removeNode(hitN.id); edited = true; }
        else if (hitE) { removeElem(hitE.id); edited = true; }
        sel = null;
        break;
    }
    if (edited) changed();
    else { syncInspector(); draw(); }
  });

  cv.addEventListener("pointermove", ev => {
    if (ptrs.has(ev.pointerId)) ptrs.set(ev.pointerId, localPt(ev));
    if (pinch && ptrs.size >= 2) {
      const q = pinchNow();
      const f = q.d / pinch.d;
      const ns = Math.max(0.15, Math.min(pinch.s * f, 14));
      // keep the world point under the first midpoint pinned to the new one
      const wx = (pinch.mx - pinch.ox) / pinch.s, wy = -(pinch.my - pinch.oy) / pinch.s;
      view.s = ns;
      view.ox = q.mx - wx * ns;
      view.oy = q.my + wy * ns;
      draw();
      return;
    }
    const sp = localPt(ev);
    const wp = toWld(sp);
    document.getElementById("stPos").textContent =
      wp.x.toFixed(1).padStart(7) + " , " + wp.y.toFixed(1).padStart(7) + " mm";

    if (drag && drag.mode === "pan") {
      view.ox = drag.ox + (sp.x - drag.sx);
      view.oy = drag.oy + (sp.y - drag.sy);
      draw(); return;
    }
    if (drag && drag.mode === "node") {
      const n = N(drag.id);
      const p = snapPt({ x: wp.x + drag.dx, y: wp.y + drag.dy });
      if (p.x === n.x && p.y === n.y) return;
      n.x = p.x; n.y = p.y; drag.moved = true;
      if (model.rigidDrag) {
        relax(new Set([n.id]));
        for (const d of drivers()) { d.theta = crankAngle(d); d.theta0 = d.theta; }
        frame = 0;
      } else {
        anchorHere(n);
        reharvest(n.id);
      }
      syncDof(); syncInspector(); draw(); return;
    }
    const h = pickNode(sp) || pickElem(sp);
    const hid = h ? h.id : null;
    if (hid !== hover) { hover = hid; draw(); }
  });

  function endDrag(ev) {
    if (ev && ev.pointerId !== undefined) ptrs.delete(ev.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (drag) {
      const moved = drag.mode === "node" && drag.moved;
      drag = null; cv.style.cursor = cursorFor(tool);
      if (moved) changed();
    }
  }
  cv.addEventListener("pointerup", endDrag);
  cv.addEventListener("pointercancel", endDrag);

  cv.addEventListener("wheel", ev => {
    ev.preventDefault();
    const sp = localPt(ev);
    zoomAt(sp.x, sp.y, ev.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });

  document.getElementById("rewBtn").addEventListener("click", toT0);
  document.getElementById("lockBtn").addEventListener("click", toT0);
  document.getElementById("solveBtn").addEventListener("click", solveNow);
  document.getElementById("stopBtn").addEventListener("click", () => { cancelJob(); dynStale = true; syncTransport(); });

  /* ---- het model is alleen op t = 0 te bewerken ---- */
  function atT0() { return !sweep || (!playing && frame === 0); }
  function toT0() {
    if (playing) togglePlay();
    if (sweep && frame !== 0) goto(0);
    syncLock();
  }
  function lockNudge() {
    flash("Bewerken kan alleen op t = 0. Klik op \u23EE om terug te gaan.");
    const b = document.getElementById("lockBar");
    b.classList.remove("pulse"); void b.offsetWidth; b.classList.add("pulse");
  }
  let lockedShown = null;
  function syncLock() {
    const locked = !atT0();
    if (locked === lockedShown) return;
    lockedShown = locked;
    document.getElementById("lockBar").hidden = !locked;
    document.getElementById("rewBtn").classList.toggle("hot", locked);
    syncInspector();
  }

  document.getElementById("zin").onclick = () => zoomAt(W / 2, H / 2, 1.25);
  document.getElementById("zout").onclick = () => zoomAt(W / 2, H / 2, 1 / 1.25);
  document.getElementById("fitBtn").onclick = fit;

  /* ============================================================
     Drawing — engineering symbols
     ============================================================ */
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  let C = {};
  function readColors() {
    C = {
      ink: css("--ink"), ink2: css("--ink-2"), ink3: css("--ink-3"),
      line: css("--line"), grid: css("--grid"), gridM: css("--grid-major"),
      accent: css("--accent"), driver: css("--driver"), spring: css("--spring"),
      force: css("--force"), panel: css("--panel"), ground: css("--ground"),
      hatch: css("--hatch"), bad: css("--bad")
    };
  }

  function draw() {
    if (!W) return;
    readColors();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.ground; ctx.fillRect(0, 0, W, H);
    drawGrid();
    drawTraces();

    // order: force elements behind bars, joints on top
    for (const e of model.elems) if (e.type === "spring") drawSpring(e);
    for (const e of model.elems) if (e.type === "damper") drawDamper(e);
    for (const e of model.elems) if (e.type === "link" && !e.driver) drawLink(e);
    for (const e of model.elems) if (e.type === "link" && e.driver) drawLink(e);
    for (const n of model.nodes) drawSupport(n);
    for (const e of model.elems) if (e.type === "force") drawForce(e);
    for (const n of model.nodes) drawNode(n);
    for (const n of model.nodes) drawNodeLabel(n);
    if (model.showForces) drawLiveForces();

    if (pending) drawRubber();
    flushLabels();
  }

  /* ---- labels ----
     Eerst verzamelen, dan tekenen op volgorde van belang (0 = puntnaam,
     1 = krachten en momenten, 2 = maten en veerwaarden, 3 = bijzaken).
     Een label dat een eerder label raakt valt weg, en hoe verder je
     uitzoomt hoe minder soorten er getekend worden. */
  let LBL = [];
  function labelDetail() {
    // typische schermlengte van een schakel; zonder schakels de zoomfactor
    const L = [];
    for (const e of model.elems) {
      if (e.type !== "link" && e.type !== "spring" && e.type !== "damper") continue;
      const A = N(e.a), B = N(e.b);
      if (A && B) L.push(dist(A, B) * view.s);
    }
    if (!L.length) return view.s < 0.3 ? 0 : 3;
    L.sort((a, b) => a - b);
    const m = L[L.length >> 1];
    return m < 22 ? -1 : m < 45 ? 0 : m < 80 ? 1 : 3;
  }
  function flushLabels() {
    const maxPri = labelDetail();
    const placed = [];
    ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textBaseline = "middle";
    const list = LBL.map((l, i) => Object.assign(l, { i })).sort((a, b) => a.pri - b.pri || a.i - b.i);
    LBL = [];
    for (const l of list) {
      if (l.pri > maxPri && !l.force) continue;
      const w = ctx.measureText(l.text).width;
      const r = { x0: l.left ? l.x - 2 : l.x - w / 2 - 3, y0: l.y - 7 };
      r.x1 = r.x0 + w + 6; r.y1 = r.y0 + 14;
      if (placed.some(q => r.x0 < q.x1 + 2 && r.x1 > q.x0 - 2 && r.y0 < q.y1 + 1 && r.y1 > q.y0 - 1)) continue;
      placed.push(r);
      ctx.textAlign = l.left ? "left" : "center";
      ctx.fillStyle = C.ground;
      ctx.globalAlpha = .85;
      ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, 14);
      ctx.globalAlpha = 1;
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, l.x, l.y);
    }
  }

  function drawGrid() {
    const g = model.grid || 10;
    let step = g * view.s;
    let mult = 1;
    while (step < 9) { mult *= 5; step = g * mult * view.s; }
    const tl = toWld({ x: 0, y: 0 }), br = toWld({ x: W, y: H });
    const gx = g * mult;
    const x0 = Math.floor(tl.x / gx) * gx, x1 = Math.ceil(br.x / gx) * gx;
    const y0 = Math.floor(br.y / gx) * gx, y1 = Math.ceil(tl.y / gx) * gx;

    ctx.lineWidth = 1;
    for (let x = x0; x <= x1 + 1e-6; x += gx) {
      const s = toScr({ x, y: 0 });
      const major = Math.abs(x / (gx * 5) - Math.round(x / (gx * 5))) < 1e-6;
      ctx.strokeStyle = major ? C.gridM : C.grid;
      ctx.beginPath(); ctx.moveTo(Math.round(s.x) + .5, 0); ctx.lineTo(Math.round(s.x) + .5, H); ctx.stroke();
    }
    for (let y = y0; y <= y1 + 1e-6; y += gx) {
      const s = toScr({ x: 0, y });
      const major = Math.abs(y / (gx * 5) - Math.round(y / (gx * 5))) < 1e-6;
      ctx.strokeStyle = major ? C.gridM : C.grid;
      ctx.beginPath(); ctx.moveTo(0, Math.round(s.y) + .5); ctx.lineTo(W, Math.round(s.y) + .5); ctx.stroke();
    }
    // origin cross
    const o = toScr({ x: 0, y: 0 });
    ctx.strokeStyle = C.line; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(o.x - 9, o.y); ctx.lineTo(o.x + 9, o.y);
    ctx.moveTo(o.x, o.y - 9); ctx.lineTo(o.x, o.y + 9);
    ctx.stroke();
  }

  function drawTraces() {
    if (!sweep) return;
    for (const n of model.nodes) {
      if (!n.trace) continue;
      const path = sweep.pos[n.id];
      if (!path) continue;
      ctx.strokeStyle = C.spring; ctx.lineWidth = 1.6;
      ctx.setLineDash([]); ctx.beginPath();
      let pen = false;
      for (let i = 0; i <= 360; i++) {
        if (!sweep.ok[i]) { pen = false; continue; }
        const s = toScr(path[i]);
        if (!pen) { ctx.moveTo(s.x, s.y); pen = true; } else ctx.lineTo(s.x, s.y);
      }
      ctx.stroke();
    }
  }

  // Reaction vectors, bar forces and crank torques at the frame on screen.
  function drawLiveForces() {
    if (!sweep || !sweep.stat) return;
    const i = Math.max(0, Math.min(360, Math.round(frame)));
    if (!sweep.ok[i]) return;
    const Rs = sweep.Rmax || 1;

    for (const n of model.nodes) {
      const R = sweep.R[n.id] ? sweep.R[n.id][i] : null;
      if (!R) continue;
      const mag = Math.hypot(R.x, R.y);
      if (mag < Rs * 0.004) continue;
      const s = toScr(n);
      const len = 22 + 46 * (mag / Rs);
      const ux = R.x / mag, uy = -R.y / mag;
      const tip = { x: s.x + ux * len, y: s.y + uy * len };
      ctx.strokeStyle = C.accent; ctx.lineWidth = 2.6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
      const px = -uy, py = ux;
      ctx.fillStyle = C.accent;
      ctx.beginPath();
      ctx.moveTo(tip.x + ux * 3, tip.y + uy * 3);
      ctx.lineTo(tip.x - ux * 9 + px * 4.8, tip.y - uy * 9 + py * 4.8);
      ctx.lineTo(tip.x - ux * 9 - px * 4.8, tip.y - uy * 9 - py * 4.8);
      ctx.closePath(); ctx.fill();
      label(tip.x + ux * 14, tip.y + uy * 14, fmt(mag) + " N", C.accent, false, 1);
    }

    for (const e of model.elems) {
      if (e.type !== "link") continue;
      const v = sweep.N[e.id] ? sweep.N[e.id][i] : NaN;
      if (!isFinite(v)) continue;
      const A = toScr(N(e.a)), B = toScr(N(e.b));
      label((A.x + B.x) / 2, (A.y + B.y) / 2 + 13,
        (v >= 0 ? "+" : "") + fmt(v) + " N", v >= 0 ? C.spring : C.force, false, 1);
    }

    for (const d of drivers()) {
      const T = sweep.T[d.id] ? sweep.T[d.id][i] : NaN;
      if (!isFinite(T)) continue;
      const p = toScr(N(d.a));
      label(p.x, p.y - 34, "T = " + T.toFixed(3) + " N·m", C.driver, false, 1);
    }
  }

  function isSel(id) { return sel && sel.id === id; }
  function isHov(id) { return hover === id; }

  function drawLink(e) {
    const A = toScr(N(e.a)), B = toScr(N(e.b));
    const col = e.driver ? C.driver : C.ink;
    ctx.lineCap = "round";
    if (isSel(e.id) || isHov(e.id)) {
      ctx.strokeStyle = C.accent; ctx.lineWidth = isSel(e.id) ? 11 : 9;
      ctx.globalAlpha = isSel(e.id) ? .28 : .15;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = col; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    ctx.strokeStyle = C.ground; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();

    if (e.driver) drawCrankArrow(A, B);

    // the length label steps aside for the force overlay
    if (!(model.showForces && sweep && sweep.stat)) {
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      label(mx, my - 12, fmt(e.len) + " mm", e.driver ? C.driver : C.ink3);
    }
  }

  function drawCrankArrow(pivot, tip) {
    const r = 26;
    const a0 = Math.atan2(tip.y - pivot.y, tip.x - pivot.x);
    ctx.strokeStyle = C.driver; ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, r, a0 - 1.15, a0 - 0.12);
    ctx.stroke();
    const ae = a0 - 0.12;
    const px = pivot.x + Math.cos(ae) * r, py = pivot.y + Math.sin(ae) * r;
    const tx = Math.cos(ae + Math.PI / 2), ty = Math.sin(ae + Math.PI / 2);
    ctx.fillStyle = C.driver;
    ctx.beginPath();
    ctx.moveTo(px + tx * 6.5, py + ty * 6.5);
    ctx.lineTo(px - tx * 2.5 + Math.cos(ae) * 2, py - ty * 2.5 + Math.sin(ae) * 2);
    ctx.lineTo(px - tx * 2.5 - Math.cos(ae) * 5, py - ty * 2.5 - Math.sin(ae) * 5);
    ctx.closePath(); ctx.fill();
    label(pivot.x + Math.cos(a0 - .65) * (r + 13), pivot.y + Math.sin(a0 - .65) * (r + 13), "ω", C.driver, true, 3);
  }

  function drawSpring(e) {
    const A = toScr(N(e.a)), B = toScr(N(e.b));
    const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L, px = -uy, py = ux;
    const lead = Math.min(16, L * 0.22);
    const coilL = Math.max(0, L - 2 * lead);
    const nC = Math.max(4, Math.min(10, Math.round(coilL / 30))), amp = 8;
    const hl = (isSel(e.id) || isHov(e.id));
    if (hl) {
      ctx.strokeStyle = C.accent; ctx.lineWidth = 8; ctx.globalAlpha = isSel(e.id) ? .25 : .13;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = C.spring; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(A.x + ux * lead, A.y + uy * lead);
    for (let i = 0; i < nC; i++) {
      const t = (i + 0.5) / nC, sg = (i % 2 === 0) ? 1 : -1;
      ctx.lineTo(A.x + ux * (lead + coilL * t) + px * amp * sg,
                 A.y + uy * (lead + coilL * t) + py * amp * sg);
    }
    ctx.lineTo(A.x + ux * (lead + coilL), A.y + uy * (lead + coilL));
    ctx.lineTo(B.x, B.y);
    ctx.stroke();
    label((A.x + B.x) / 2, (A.y + B.y) / 2 + 20, "k = " + fmt(e.k) + " N/mm", C.spring);
  }

  function drawDamper(e) {
    const A = toScr(N(e.a)), B = toScr(N(e.b));
    const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L, px = -uy, py = ux;
    const hl = (isSel(e.id) || isHov(e.id));
    if (hl) {
      ctx.strokeStyle = C.accent; ctx.lineWidth = 8; ctx.globalAlpha = isSel(e.id) ? .25 : .13;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); ctx.globalAlpha = 1;
    }
    const cW = Math.min(26, L * 0.4), h = 8;
    const c0 = { x: A.x + ux * (L / 2 - cW / 2), y: A.y + uy * (L / 2 - cW / 2) };
    const c1 = { x: A.x + ux * (L / 2 + cW / 2), y: A.y + uy * (L / 2 + cW / 2) };
    ctx.strokeStyle = C.ink2; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
    // rods
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(c0.x, c0.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(B.x, B.y); ctx.lineTo(c1.x, c1.y); ctx.stroke();
    // cylinder: open on the B side
    ctx.beginPath();
    ctx.moveTo(c1.x + px * h, c1.y + py * h);
    ctx.lineTo(c0.x + px * h, c0.y + py * h);
    ctx.lineTo(c0.x - px * h, c0.y - py * h);
    ctx.lineTo(c1.x - px * h, c1.y - py * h);
    ctx.stroke();
    // piston plate
    const pp = { x: A.x + ux * (L / 2 + cW * 0.18), y: A.y + uy * (L / 2 + cW * 0.18) };
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(pp.x + px * (h - 1.4), pp.y + py * (h - 1.4));
    ctx.lineTo(pp.x - px * (h - 1.4), pp.y - py * (h - 1.4));
    ctx.stroke();
    label((A.x + B.x) / 2, (A.y + B.y) / 2 + 22, "c = " + fmt(e.c) + " Ns/mm", C.ink3);
  }

  function drawForce(e) {
    const n = N(e.node); if (!n) return;
    const s = toScr(n);
    const th = e.ang * Math.PI / 180;
    const ux = Math.cos(th), uy = -Math.sin(th);
    const len = 56;
    const tip = { x: s.x + ux * len, y: s.y + uy * len };
    const tail = { x: s.x + ux * 9, y: s.y + uy * 9 };
    const hl = (isSel(e.id) || isHov(e.id));
    ctx.strokeStyle = C.force; ctx.lineWidth = hl ? 3.4 : 2.4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(tail.x, tail.y); ctx.stroke();
    // arrowhead points AT the node (load applied to the point)
    const pxv = -uy, pyv = ux;
    ctx.fillStyle = C.force;
    ctx.beginPath();
    ctx.moveTo(tail.x - ux * 1, tail.y - uy * 1);
    ctx.lineTo(tail.x + ux * 11 + pxv * 4.6, tail.y + uy * 11 + pyv * 4.6);
    ctx.lineTo(tail.x + ux * 11 - pxv * 4.6, tail.y + uy * 11 - pyv * 4.6);
    ctx.closePath(); ctx.fill();
    label(tip.x + ux * 12, tip.y + uy * 12, fmt(e.mag) + " N", C.force, false, 1);
  }

  function drawSupport(n) {
    const s = toScr(n);
    if (n.support === "pin") {
      const w = 11, h = 15;
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.8; ctx.lineJoin = "round";
      ctx.fillStyle = C.ground;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - w, s.y + h); ctx.lineTo(s.x + w, s.y + h);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      hatchLine(s.x - w - 3, s.y + h, s.x + w + 3, s.y + h);
    } else if (n.support === "slider") {
      const th = n.dir * Math.PI / 180;
      const ux = Math.cos(th), uy = -Math.sin(th);
      const px = -uy, py = ux;
      const R = 46, h = 9;
      // rail
      ctx.strokeStyle = C.ink2; ctx.lineWidth = 1.6;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(s.x - ux * R + px * h, s.y - uy * R + py * h);
      ctx.lineTo(s.x + ux * R + px * h, s.y + uy * R + py * h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x - ux * R - px * h, s.y - uy * R - py * h);
      ctx.lineTo(s.x + ux * R - px * h, s.y + uy * R - py * h);
      ctx.stroke();
      // hatching outside both rails
      hatchAlong(s, ux, uy, px, py, R, h + 0.5, 1);
      hatchAlong(s, ux, uy, px, py, R, -h - 0.5, -1);
      // block
      const bw = 15, bh = 8;
      ctx.fillStyle = C.ground; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(s.x - ux * bw + px * bh, s.y - uy * bw + py * bh);
      ctx.lineTo(s.x + ux * bw + px * bh, s.y + uy * bw + py * bh);
      ctx.lineTo(s.x + ux * bw - px * bh, s.y + uy * bw - py * bh);
      ctx.lineTo(s.x - ux * bw - px * bh, s.y - uy * bw - py * bh);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (n.m > 0) {
      ctx.fillStyle = C.ink2;
      ctx.beginPath(); ctx.arc(s.x, s.y, 8.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  function hatchAlong(s, ux, uy, px, py, R, off, side) {
    ctx.strokeStyle = C.hatch; ctx.lineWidth = 1;
    for (let t = -R; t <= R; t += 9) {
      const bx = s.x + ux * t + px * off, by = s.y + uy * t + py * off;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + (ux * -5 + px * side * 6), by + (uy * -5 + py * side * 6));
      ctx.stroke();
    }
  }

  function hatchLine(x0, y, x1, yy) {
    ctx.strokeStyle = C.hatch; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    for (let x = x0 + 2; x < x1; x += 6) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 6); ctx.stroke();
    }
  }

  function drawNode(n) {
    const s = toScr(n);
    const selected = isSel(n.id), hovd = isHov(n.id), pend = pending === n.id;
    if (selected || hovd || pend) {
      ctx.fillStyle = C.accent; ctx.globalAlpha = selected || pend ? .25 : .13;
      ctx.beginPath(); ctx.arc(s.x, s.y, 13, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = C.panel;
    ctx.strokeStyle = selected || pend ? C.accent : C.ink;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, 5.2, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }

  function drawNodeLabel(n) {
    const s = toScr(n);
    label(s.x + 11, s.y - 11, n.name + (n.m > 0 ? "  " + fmt(n.m) + " kg" : ""), C.ink2, true, 0);
  }

  // pri: 0 = puntnaam, 1 = kracht/moment, 2 = maat/veerwaarde, 3 = bijzaak
  function label(x, y, text, color, left, pri) {
    LBL.push({ x, y, text, color, left: !!left, pri: pri === undefined ? 2 : pri });
  }

  function drawRubber() {
    const n = N(pending); if (!n) return;
    const s = toScr(n);
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = C.accent; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(s.x, s.y, 16, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }

  function fmt(v) {
    if (v === undefined || v === null) return "–";
    const a = Math.abs(v);
    if (a >= 100) return v.toFixed(0);
    if (a >= 10) return v.toFixed(1);
    return v.toFixed(2).replace(/0$/, "");
  }

  /* ============================================================
     Inspector
     ============================================================ */
  const props = document.getElementById("props");

  function syncInspector() {
    buildInspector();
    if (!sel) return;
    // snelknoppen: grootheden van dit onderdeel direct in de grafiek zetten
    refreshChannels();
    const cs = CH.filter(c => c.obj === sel.id && !c.hide);
    if (cs.length) {
      const box = document.createElement("div");
      box.className = "measq";
      box.innerHTML = '<div class="lab">In de grafiek</div><div class="pq">' +
        cs.map(c => chip(c, plotted(c.key))).join("") + "</div>";
      box.addEventListener("click", ev => {
        const b = ev.target.closest("button.chip"); if (!b) return;
        toggleSerie(b.dataset.k);
        b.setAttribute("aria-pressed", String(plotted(b.dataset.k)));
      });
      props.appendChild(box);
    }
    if (!atT0()) {
      props.querySelectorAll("input, select, .seg button, #drvBtn").forEach(el => { el.disabled = true; });
      const note = document.createElement("div");
      note.className = "locknote";
      note.innerHTML = "<span>Je kijkt naar t = " + fmtTime(sweep.t[frame]) + ". Waarden aanpassen kan op t = 0.</span>" +
        '<button class="btn" type="button">\u23EE Naar t = 0</button>';
      note.querySelector("button").addEventListener("click", toT0);
      props.prepend(note);
    }
  }

  function buildInspector() {
    const stSel = document.getElementById("stSel");
    if (!sel) {
      props.innerHTML = '<p class="empty">Selecteer een punt of element op het canvas.</p>';
      stSel.textContent = "geen"; return;
    }
    if (sel.kind === "node") {
      const n = N(sel.id);
      if (!n) { sel = null; return buildInspector(); }
      stSel.textContent = "punt " + n.name;
      props.innerHTML =
        kind(C.ink, "Punt " + n.name) +
        '<div class="row"><label for="pnm">Naam <span class="unit">in formules</span></label>' +
        '<input type="text" id="pnm" maxlength="8" value="' + n.name + '"></div>' +
        numRow("px", "x", n.x, "mm", .1) +
        numRow("py", "y", n.y, "mm", .1) +
        '<div class="row" style="grid-template-columns:1fr;margin-top:10px"><label>Oplegging</label></div>' +
        '<div class="seg" id="supSeg">' +
          segBtn("free", "Vrij", n.support) +
          segBtn("pin", "Scharnier", n.support) +
          segBtn("slider", "Glijder", n.support) +
        '</div>' +
        (n.support === "slider" ? numRow("pdir", "Richting glijbaan", n.dir, "°", 1) : "") +
        numRow("pm", "Puntmassa", n.m, "kg", .1);
      const nmEl = document.getElementById("pnm");
      const nmCommit = () => {
        const v = nmEl.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 8);
        if (!v || /^[0-9]/.test(v)) { nmEl.value = n.name; return; }
        if (model.nodes.some(o => o !== n && o.name === v)) { flash("Die naam is al in gebruik."); nmEl.value = n.name; return; }
        n.name = v; changed();
      };
      nmEl.addEventListener("change", nmCommit);
      nmEl.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); nmCommit(); nmEl.blur(); } });
      bindNum("px", v => { n.x = v; anchorHere(n); relax(new Set([n.id])); });
      bindNum("py", v => { n.y = v; anchorHere(n); relax(new Set([n.id])); });
      bindNum("pdir", v => { n.dir = v; anchorHere(n); relax(); });
      bindNum("pm", v => { n.m = Math.max(0, v); });
      document.getElementById("supSeg").addEventListener("click", ev => {
        const b = ev.target.closest("button"); if (!b) return;
        n.support = b.dataset.v; anchorHere(n); relax(); changed();
      });
      return;
    }

    const e = E(sel.id);
    if (!e) { sel = null; return buildInspector(); }

    if (e.type === "link") {
      stSel.textContent = "schakel";
      if (e.driver && e.theta0 === undefined) e.theta0 = crankAngle(e);
      if (e.driver && e.rpm === undefined) e.rpm = 60;
      props.innerHTML =
        kind(e.driver ? C.driver : C.ink, e.driver ? "Kruk (aandrijving)" : "Stijve schakel") +
        '<p class="empty" style="margin:-4px 0 10px">' + N(e.a).name + " → " + N(e.b).name + '</p>' +
        numRow("el", "Lengte", e.len, "mm", .1) +
        (e.driver ? (
          numRow("eth", "Beginhoek θ₀", e.theta0, "°", 5) +
          '<div class="row"><label>Hoek nu</label><span class="val" id="ethNow" data-e="' + e.id +
            '" style="font-family:\'IBM Plex Mono\',monospace;font-size:12.5px">' +
            Math.round(e.theta || 0) + '°</span></div>' +
          numRow("erpm", "Toerental", e.rpm, "rpm", 5) +
          '<div class="row" style="grid-template-columns:1fr;margin-top:4px"><label>Draairichting</label></div>' +
          '<div class="seg" id="dirSeg">' +
            '<button type="button" data-v="ccw" aria-pressed="' + (e.cw !== true) + '">Linksom</button>' +
            '<button type="button" data-v="cw" aria-pressed="' + (e.cw === true) + '">Rechtsom</button>' +
          '</div>'
        ) : "") +
        '<button class="btn" id="drvBtn" style="width:100%;margin-top:10px">' +
          (e.driver ? "Aandrijving verwijderen" : "Maak dit de kruk") + '</button>' +
        (e.driver ? '<p class="empty" style="margin-top:8px">Draaipunt ' + N(e.a).name +
          '. ω = ' + fmt(Math.abs(e.rpm) * 6) + ' °/s. Meerdere krukken mogen — ' +
          'de tijdas beslaat één omwenteling van de langzaamste.</p>' : "");

      bindNum("el", v => {
        e.len = Math.max(.1, v);
        if (e.driver) placeAt(sweep ? sweep.t[frame] : 0);
        else relax();                      // andere stangen houden hun lengte
      });
      bindNum("eth", v => { e.theta0 = v; });
      bindNum("erpm", v => { e.rpm = v; });
      const ds = document.getElementById("dirSeg");
      if (ds) ds.addEventListener("click", ev => {
        const b = ev.target.closest("button"); if (!b) return;
        e.cw = b.dataset.v === "cw"; changed();
      });
      document.getElementById("drvBtn").onclick = () => setDriver(e.id);
      return;
    }

    if (e.type === "spring") {
      stSel.textContent = "veer";
      props.innerHTML =
        kind(C.spring, "Veer") +
        '<p class="empty" style="margin:-4px 0 10px">' + N(e.a).name + " – " + N(e.b).name + '</p>' +
        numRow("sk", "Stijfheid k", e.k, "N/mm", .1) +
        numRow("sl", "Rustlengte L₀", e.L0, "mm", .5) +
        '<p class="empty" style="margin-top:8px">Huidige lengte ' + fmt(dist(N(e.a), N(e.b))) +
        ' mm. Veerkracht volgt straks uit de kinematica — geen tijdsintegratie nodig.</p>';
      bindNum("sk", v => { e.k = Math.max(0, v); });
      bindNum("sl", v => { e.L0 = Math.max(0, v); });
      return;
    }

    if (e.type === "damper") {
      stSel.textContent = "demper";
      props.innerHTML =
        kind(C.ink2, "Demper") +
        '<p class="empty" style="margin:-4px 0 10px">' + N(e.a).name + " – " + N(e.b).name + '</p>' +
        numRow("dc", "Dempingsconstante c", e.c, "Ns/mm", .01) +
        '<p class="empty" style="margin-top:8px">Dempkracht volgt uit de exacte snelheid van beide punten.</p>';
      bindNum("dc", v => { e.c = Math.max(0, v); });
      return;
    }

    if (e.type === "force") {
      stSel.textContent = "kracht";
      props.innerHTML =
        kind(C.force, "Kracht op " + N(e.node).name) +
        numRow("fm", "Grootte", e.mag, "N", 1) +
        numRow("fa", "Richting", e.ang, "°", 5) +
        '<p class="empty" style="margin-top:8px">0° is +x, 90° is +y. De pijl wijst naar het aangrijpingspunt.</p>';
      bindNum("fm", v => { e.mag = v; });
      bindNum("fa", v => { e.ang = v; });
    }
  }

  function kind(color, text) {
    return '<span class="kind"><span class="dot" style="background:' + color + '"></span>' + text + '</span>';
  }
  function segBtn(v, nm, cur) {
    return '<button type="button" data-v="' + v + '" aria-pressed="' + (cur === v) + '">' + nm + '</button>';
  }
  function numRow(id, lab, val, unit, step) {
    return '<div class="row"><label for="' + id + '">' + lab + ' <span class="unit">' + unit + '</span></label>' +
      '<input type="number" id="' + id + '" step="' + step + '" value="' + (Math.round(val * 1000) / 1000) + '"></div>';
  }
  // Commit on Enter or when the field loses focus — not on every keystroke,
  // so a half-typed number never triggers a recompute.
  function bindNum(id, fn) {
    const el = document.getElementById(id); if (!el) return;
    const commit = () => {
      const v = parseFloat(el.value);
      if (!isFinite(v)) { el.value = el.dataset.last || el.value; return; }
      if (!atT0()) { el.value = el.dataset.last; lockNudge(); return; }
      el.dataset.last = v;
      cancelJob();
      fn(v); if (model.mode !== "dyn") frame = 0;
      rebuild(); syncDof(); draw(); save(); pushHistory();
    };
    el.dataset.last = el.value;
    el.addEventListener("change", commit);
    el.addEventListener("keydown", ev => {
      if (ev.key === "Enter") { ev.preventDefault(); commit(); el.blur(); }
    });
  }

  /* ============================================================
     Playback
     ============================================================ */
  const playBtn = document.getElementById("playBtn");
  const playIco = document.getElementById("playIco");
  const scrub = document.getElementById("scrub");
  const angOut = document.getElementById("angOut");
  const speedSel = document.getElementById("speedSel");

  // De afspeelkop loopt als gebroken getal door. Vroeger werd hij elk beeld
  // afgerond, waardoor hij bij lage snelheid of een lange simulatie op 0 bleef staan.
  let playPos = 0;
  function togglePlay() {
    if (!sweep && !playing) return;
    playing = !playing;
    playIco.setAttribute("d", playing ? "M3 1.5h3.4v11H3zM7.6 1.5H11v11H7.6z" : "M3 1.5l9 5.5-9 5.5z");
    playBtn.title = playing ? "Pauzeren (spatie)" : "Afspelen (spatie)";
    if (playing) {
      if (sweep.dyn && frame >= 360) frame = 0;      // aan het eind: opnieuw vanaf het begin
      playPos = frame; lastT = performance.now(); raf = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(raf);
      if (sweep) goto(frame);                          // op een echt beeld stilstaan
    }
    syncLock();
  }
  playBtn.addEventListener("click", togglePlay);

  function tick(t) {
    if (!playing || !sweep) return;
    const fps = (360 / sweep.dur) * parseFloat(speedSel.value);   // beelden per seconde
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    playPos += fps * dt;
    if (playPos >= 360) {
      if (sweep.dyn) { playPos = 360; goto(360); togglePlay(); return; }   // niet periodiek: stoppen
      playPos %= 360;
    }
    goto(playPos);
    raf = requestAnimationFrame(tick);
  }

  function goto(deg) {
    if (!sweep) return;
    applyFrame(deg);
    scrub.value = Math.round(frame);
    angOut.textContent = fmtTime(sweep.t[Math.round(frame)]);
    const f1 = document.getElementById("ethNow");
    if (f1) { const d = E(f1.dataset.e); if (d) f1.textContent = Math.round(d.theta) + "°"; }
    hoverI = null;
    syncSeriesValues();
    drawPlot();
    draw();
  }

  scrub.addEventListener("input", () => {
    if (playing) togglePlay();
    goto(parseFloat(scrub.value));
    syncLock();
  });

  function syncTransport() {
    const on = !!sweep, busy = !!job;
    playBtn.disabled = !on;
    scrub.disabled = !on;
    document.getElementById("rewBtn").disabled = !on;
    const sb = document.getElementById("solveBtn");
    sb.hidden = busy || !(dynStale || (model.mode === "dyn" && !on && model.nodes.length));
    document.getElementById("stopBtn").hidden = !busy;
    document.getElementById("tprog").hidden = !busy;
    if (!on && playing) togglePlay();
    const msg = document.getElementById("tmsg");
    scrub.hidden = !on; angOut.hidden = !on; speedSel.hidden = !on;
    msg.hidden = on;
    if (on) angOut.textContent = fmtTime(sweep.t[Math.round(frame)]);
    else if (busy) showProgress(job.p);
    else msg.textContent = sweepReason();
    syncLock();
  }

  function showProgress(p) {
    const msg = document.getElementById("tmsg"), bar = document.getElementById("tprog");
    if (!p) { msg.textContent = "Rekenen…"; bar.removeAttribute("value"); return; }
    if (p.phase === "equil") {
      msg.textContent = "Evenwicht zoeken… t = " + p.t.toFixed(2) + " s";
      bar.value = model.durMode === "equil" ? 0.5 * p.t / p.maxT : p.t / p.maxT;
    } else {
      msg.textContent = "Rekenen… " + Math.round(p.f / 3.6) + " %";
      bar.value = model.durMode === "equil" ? 0.5 + 0.5 * p.f / 360 : p.f / 360;
    }
  }

  function sweepReason() {
    const m = mobility();
    if (!model.nodes.length) return "Leeg canvas — plaats punten en verbind ze.";
    if (dynStale) return "Model gewijzigd — druk op Bereken (F5) als je klaar bent.";
    if (model.mode === "dyn") {
      if (m.dof < 0) return "Overbepaald met " + (-m.dof) + " — haal een schakel of oplegging weg.";
      return "Integratie liep vast — probeer een kleinere tijdstap.";
    }
    if (!drivers().length) return "Kinematisch: nog geen kruk. Kies gereedschap Aandrijving (D) en klik een schakel.";
    if (drivers().some(d => !N(d.a) || N(d.a).support !== "pin")) return "De kruk heeft geen vast scharnier.";
    if (m.dofDriven > 0) return "Nog " + m.dofDriven + " vrijheidsgraad" + (m.dofDriven === 1 ? "" : "en") +
      " over — voeg een schakel, oplegging of tweede kruk toe.";
    if (m.dofDriven < 0) return "Overbepaald met " + (-m.dofDriven) + " — te veel schakels of opleggingen.";
    return "In geen enkele stand samen te stellen — controleer de lengtes.";
  }

  function fmtTime(s) {
    if (s === undefined) return "–";
    return s < 1 ? (s * 1000).toFixed(0) + " ms" : s.toFixed(2) + " s";
  }

  /* ============================================================
     Metingen & grafiek
     Eén deelgrafiek per eenheid (nooit twee y-assen op elkaar),
     gedeelde x-as, crosshair met waarden, en min/max/RMS per meting.
     ============================================================ */
  const plotCv = document.getElementById("plot");
  const pctx = plotCv.getContext("2d");
  const seriesBox = document.getElementById("series");
  const xSel = document.getElementById("xSel");
  let CH = [], CHM = new Map(), pdata = null, hoverI = null;

  // Formulenamen: exact (C.x, N_BC) of los geschreven (c_x, n.bc)
  let ALIAS = new Map(), ALIASN = new Map();
  const normAl = s => s.toLowerCase().replace(/_/g, ".");
  const alias = nm => ALIAS.get(nm) || ALIASN.get(normAl(nm));
  function refreshChannels() {
    CH = channels();
    CHM = new Map(CH.map(c => [c.key, c]));
    ALIAS = new Map(); ALIASN = new Map();
    for (const c of CH) if (c.al && !ALIAS.has(c.al)) ALIAS.set(c.al, c);
    for (const c of CH) if (c.al && !ALIASN.has(normAl(c.al))) ALIASN.set(normAl(c.al), c);
    const opts = [{ v: "time", lab: "tijd (s)" }];
    for (const d of drivers())
      opts.push({ v: "ang|" + d.id, lab: "krukhoek " + (N(d.a) ? N(d.a).name : "") + (N(d.b) ? N(d.b).name : "") + " (°)" });
    for (const c of CH) if (!c.hide) opts.push({ v: "ch|" + c.key, lab: c.lab + " (" + c.u + ")" });
    if (!opts.some(o => o.v === model.xAxis)) model.xAxis = "time";
    xSel.innerHTML = opts.map(o =>
      '<option value="' + o.v + '"' + (o.v === model.xAxis ? " selected" : "") + ">" + o.lab + "</option>").join("");
  }
  xSel.addEventListener("change", () => {
    model.xAxis = xSel.value; pdata = null; drawPlot(); save();
  });

  function xValue(i) {
    const m = model.xAxis || "time";
    if (m === "time") return sweep.t[i];
    if (m.slice(0, 4) === "ang|") {
      const d = E(m.slice(4));
      if (!d) return sweep.t[i];
      return ((((d.theta0 || 0) + omega(d) * sweep.t[i] * 180 / Math.PI) % 360) + 360) % 360;
    }
    return chVal(sweep, m.slice(3), i);
  }
  let xUnit = "s";
  function fmtX(v) {
    if ((model.xAxis || "time") !== "time") return fmtTick(v);
    return xUnit === "ms" ? (v * 1000).toFixed(0) : v.toFixed(2);
  }

  /* ---- kleine formule-taal over de meetkanalen ----
     C.x - C.y, hypot(C.vx, C.vy), N_BC/1000, abs(T_AB) ... */
  const FN = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos,
    atan: Math.atan, atan2: Math.atan2, abs: Math.abs, sqrt: Math.sqrt, exp: Math.exp,
    log: Math.log, min: Math.min, max: Math.max, hypot: Math.hypot, sign: Math.sign,
    rad: d => d * Math.PI / 180, deg: r => r * 180 / Math.PI
  };
  function compile(src) {
    let i = 0;
    const used = [];
    const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
    const eat = c => { ws(); if (src.startsWith(c, i)) { i += c.length; return true; } return false; };
    function expr() {
      let f = term();
      for (;;) {
        ws();
        if (eat("+")) { const a = f, b = term(); f = g => a(g) + b(g); }
        else if (eat("-")) { const a = f, b = term(); f = g => a(g) - b(g); }
        else return f;
      }
    }
    function term() {
      let f = unary();
      for (;;) {
        ws();
        if (eat("*")) { const a = f, b = unary(); f = g => a(g) * b(g); }
        else if (eat("/")) { const a = f, b = unary(); f = g => a(g) / b(g); }
        else return f;
      }
    }
    function unary() {
      ws();
      if (eat("-")) { const a = unary(); return g => -a(g); }
      if (eat("+")) return unary();
      return power();
    }
    function power() {
      const a = atom();
      ws();
      if (eat("^")) { const b = unary(); return g => Math.pow(a(g), b(g)); }
      return a;
    }
    function atom() {
      ws();
      if (eat("(")) { const e = expr(); if (!eat(")")) throw new Error("sluithaakje ontbreekt"); return e; }
      const num = /^\d+(\.\d+)?([eE][+-]?\d+)?/.exec(src.slice(i));
      if (num) { i += num[0].length; const v = parseFloat(num[0]); return () => v; }
      const id = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(i));
      if (!id) throw new Error("onbegrijpelijk bij teken " + (i + 1));
      i += id[0].length;
      const nm = id[0];
      ws();
      if (src[i] === "(") {
        i++;
        const args = [];
        if (!eat(")")) {
          for (;;) { args.push(expr()); if (eat(")")) break; if (!eat(",")) throw new Error("komma of ) verwacht"); }
        }
        const fn = FN[nm];
        if (!fn) throw new Error("onbekende functie " + nm);
        return g => fn.apply(null, args.map(a => a(g)));
      }
      if (nm === "pi") return () => Math.PI;
      if (nm !== "t" && !alias(nm)) throw new Error("onbekende grootheid " + nm);
      used.push(nm);
      return g => g(nm);
    }
    const f = expr();
    ws();
    if (i < src.length) throw new Error("onverwacht teken bij " + (i + 1));
    return { f, used };
  }

  function exprUnit(used, src) {
    if (/[*/^]/.test(src)) return "";
    const us = new Set(used.filter(u => u !== "t").map(u => (alias(u) || {}).u));
    return us.size === 1 ? [...us][0] : "";
  }
  const serieLab = sr => sr.expr ? sr.expr : chLab(sr.key);

  /* ---------- meting kiezen ----------
     Eén regel per onderdeel met knopjes voor de grootheden. In de stand
     "Grootheid" zet een klik de meting aan of uit; in de stand "Formule"
     komt de naam in de formule te staan. */
  const pick = document.getElementById("pick"), pickQ = document.getElementById("pickQ"),
        pickList = document.getElementById("pickList"), pickFxInp = document.getElementById("pickFxInp"),
        pickMsg = document.getElementById("pickMsg"), pickOk = document.getElementById("pickOk");
  let pickFor = -1, pickMode = "q";
  function openPick(idx, mode) {
    refreshChannels();
    pickFor = idx;
    pickQ.value = "";
    setPickMode(mode || "q");
    pick.hidden = false;
    (pickMode === "f" ? pickFxInp : pickQ).focus();
  }
  function closePick() { pick.hidden = true; }
  function setPickMode(m) {
    pickMode = m;
    document.querySelectorAll("#pickMode button").forEach(b =>
      b.setAttribute("aria-pressed", String(b.dataset.v === m)));
    document.getElementById("pickFxBox").hidden = m !== "f";
    document.getElementById("pickTitle").textContent = pickFor >= 0 ? "Meting vervangen" : "Metingen kiezen";
    pickOk.textContent = m === "f" ? "Formule toevoegen" : "Klaar";
    renderPick(); checkFx();
  }
  document.getElementById("pickMode").addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (b) setPickMode(b.dataset.v);
  });

  function plotted(key) { return model.series.some(s => s.key === key); }
  function chip(c, on) {
    return '<button type="button" class="chip" data-k="' + c.key + '" aria-pressed="' + !!on + '" title="' +
      c.lab + " [" + c.u + "] \u2014 in formules: " + c.al + '">' + c.q + "</button>";
  }
  function renderPick() {
    const words = pickQ.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const rows = new Map();
    for (const c of CH) {
      if (c.hide) continue;
      const hay = (c.o + " " + c.q + " " + c.al + " " + c.lab).toLowerCase();
      if (!words.every(w => hay.includes(w))) continue;
      if (!rows.has(c.o)) rows.set(c.o, { o: c.o, g: c.g, obj: c.obj, cs: [] });
      rows.get(c.o).cs.push(c);
    }
    const sid = sel ? sel.id : null;
    const list = [...rows.values()];
    if (!list.length) { pickList.innerHTML = '<div class="g">niets gevonden</div>'; return; }
    let html = "", g = null;
    const mark = pickMode === "q" && pickFor < 0;
    const rowHtml = r => '<div class="prow' + (r.obj === sid ? " sel" : "") + '"><span class="po">' + r.o +
      '</span><span class="pq">' + r.cs.map(c => chip(c, mark && plotted(c.key))).join("") + "</span></div>";
    const selRow = list.find(r => r.obj === sid);
    if (selRow) html += '<div class="g">Selectie</div>' + rowHtml(selRow);
    for (const r of list) {
      if (r === selRow) continue;
      if (r.g !== g) { g = r.g; html += '<div class="g">' + g + "</div>"; }
      html += rowHtml(r);
    }
    pickList.innerHTML = html;
  }
  pickQ.addEventListener("input", renderPick);
  pickList.addEventListener("click", ev => {
    const b = ev.target.closest("button.chip"); if (!b) return;
    const c = CHM.get(b.dataset.k); if (!c) return;
    if (pickMode === "f") { insertFx(c.al); return; }
    if (pickFor >= 0) { setSerie(pickFor, { key: c.key }); closePick(); return; }
    toggleSerie(c.key);
    b.setAttribute("aria-pressed", String(plotted(c.key)));
  });

  function insertFx(txt) {
    const el = pickFxInp, a = el.selectionStart ?? el.value.length, b = el.selectionEnd ?? a;
    const before = el.value.slice(0, a), after = el.value.slice(b);
    const pad = before && !/[\s(+\-*/^,]$/.test(before) ? " " : "";
    el.value = before + pad + txt + after;
    const p = (before + pad + txt).length;
    el.focus(); el.setSelectionRange(p, p);
    checkFx();
  }
  function checkFx() {
    if (pickMode !== "f") { pickMsg.textContent = pickFor < 0 ? "Klik een grootheid om hem aan of uit te zetten." : ""; return true; }
    const src = pickFxInp.value.trim();
    if (!src) { pickMsg.textContent = "Typ een formule, of klik hieronder grootheden aan."; return false; }
    try {
      const c = compile(src);
      const u = exprUnit(c.used, src);
      pickMsg.innerHTML = '<span style="color:var(--spring)">\u2713 geldig</span>' + (u ? " \u00b7 eenheid " + u : "");
      return true;
    } catch (e) {
      pickMsg.innerHTML = '<span style="color:var(--bad)">' + e.message + "</span>";
      return false;
    }
  }
  pickFxInp.addEventListener("input", checkFx);
  pickFxInp.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); pickOk.click(); } });
  pickOk.addEventListener("click", () => {
    if (pickMode === "f") {
      if (!checkFx()) return;
      setSerie(pickFor, { expr: pickFxInp.value.trim() });
      pickFxInp.value = "";
    }
    closePick();
  });
  document.getElementById("pickCancel").addEventListener("click", closePick);
  pick.addEventListener("click", ev => { if (ev.target === pick) closePick(); });
  pick.addEventListener("keydown", ev => { if (ev.key === "Escape") closePick(); });

  function setSerie(idx, sr) {
    if (idx < 0) model.series.push(sr); else model.series[idx] = sr;
    pdata = null; renderSeries(); drawPlot(); save();
  }
  function toggleSerie(key) {
    const i = model.series.findIndex(s => s.key === key);
    if (i >= 0) model.series.splice(i, 1); else model.series.push({ key });
    pdata = null; renderSeries(); drawPlot(); save();
  }

  document.getElementById("addSerie").addEventListener("click", () => openPick(-1, "q"));
  document.getElementById("addFx").addEventListener("click", () => openPick(-1, "f"));

  function renderSeries() {
    refreshChannels();
    const note = document.getElementById("serieNote");
    if (!model.series.length) {
      seriesBox.innerHTML = "";
      note.textContent = sweep
        ? "Klik op Metingen\u2026, of selecteer een onderdeel en kies hoe je het meet."
        : "Nog geen oplossing \u2014 zie de melding onder het canvas.";
      return;
    }
    note.textContent = sweep && !sweep.stat
      ? "Krachten zijn niet bepaald: het stelsel is niet vierkant." : "";
    seriesBox.innerHTML = model.series.map((sr, i) =>
      '<div class="serie">' +
        '<span class="sw" style="background:' + serieColor(i) + '"></span>' +
        (sr.expr
          ? '<input class="fx" data-f="' + i + '" value="' + String(sr.expr).replace(/"/g, "&quot;") + '">'
          : '<button class="lab" data-i="' + i + '">' + serieLab(sr) + '</button>') +
        '<button class="rm" data-r="' + i + '" title="Verwijderen" aria-label="Meting verwijderen">\u00d7</button>' +
        '<span class="meta"><span data-v="' + i + '">\u2013</span><span data-s="' + i + '"></span></span>' +
      '</div>').join("");
    seriesBox.querySelectorAll(".lab").forEach(el =>
      el.addEventListener("click", () => openPick(+el.dataset.i)));
    seriesBox.querySelectorAll(".fx").forEach(el => {
      const commit = () => {
        model.series[+el.dataset.f] = { expr: el.value };
        pdata = null; syncSeriesValues(); drawPlot(); save();
      };
      el.addEventListener("change", commit);
      el.addEventListener("keydown", ev => {
        if (ev.key === "Enter") { ev.preventDefault(); commit(); el.blur(); }
      });
    });
    seriesBox.querySelectorAll(".rm").forEach(b =>
      b.addEventListener("click", () => {
        model.series.splice(+b.dataset.r, 1);
        pdata = null; renderSeries(); drawPlot(); save();
      }));
    syncSeriesValues();
  }

  const num = (v, u) => !isFinite(v) ? "–"
    : (Math.abs(v) >= 1e4 || (v !== 0 && Math.abs(v) < 1e-2) ? v.toExponential(2) : v.toFixed(2)) + (u ? " " + u : "");

  function syncSeriesValues() {
    if (!sweep) return;
    if (!pdata) buildPdata();
    const i = Math.max(0, Math.min(360, hoverI !== null ? hoverI : Math.round(frame)));
    seriesBox.querySelectorAll("[data-v]").forEach(el => {
      const d = pdata && pdata.ss[+el.dataset.v];
      el.innerHTML = !d ? "–"
        : d.err ? '<b style="color:var(--bad)">' + d.err + "</b>"
        : "<b>" + num(d.a[i], d.u) + "</b>";
    });
    seriesBox.querySelectorAll("[data-s]").forEach(el => {
      const d = pdata && pdata.ss[+el.dataset.s];
      el.textContent = d && d.ok
        ? "min " + num(d.mn) + " · max " + num(d.mx) + " · rms " + num(d.rms) : "";
    });
  }

  function buildPdata() {
    pdata = null;
    if (!sweep || !model.series.length) return;
    const xs = new Float64Array(361);
    for (let i = 0; i <= 360; i++) xs[i] = sweep.ok[i] ? xValue(i) : NaN;
    const ss = model.series.map((sr, si) => {
      const a = new Float64Array(361);
      let u = "", err = "", get = null;
      if (sr.expr) {
        try {
          const c = compile(sr.expr);
          u = exprUnit(c.used, sr.expr);
          get = i => c.f(nm => nm === "t" ? sweep.t[i] : chVal(sweep, alias(nm).key, i));
        } catch (e) { err = e.message; }
      } else { u = chU(sr.key); get = i => chVal(sweep, sr.key, i); }
      let mn = Infinity, mx = -Infinity, sq = 0, n = 0;
      for (let i = 0; i <= 360; i++) {
        let v = NaN;
        if (get && sweep.ok[i]) { try { v = get(i); } catch (_) { v = NaN; } }
        a[i] = v;
        if (isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; sq += v * v; n++; }
      }
      return { key: sr.key, expr: sr.expr, si, a, ok: n > 0, err,
               u: u || (sr.expr ? "\u0192" : ""),
               mn: n ? mn : NaN, mx: n ? mx : NaN, rms: n ? Math.sqrt(sq / n) : NaN };
    });
    pdata = { xs, ss };
  }

  // Eén deelgrafiek per eenheid. Elke deelgrafiek heeft een kopregel met de
  // eenheid en de namen van de metingen, zodat niets over de assen heen valt.
  const PAD = { L: 46, R: 12, T: 20, B: 22 };
  function xRange() {
    let lo = Infinity, hi = -Infinity;
    if (pdata) for (const v of pdata.xs) if (isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!(hi > lo)) { lo = 0; hi = 1; }
    return [lo, hi];
  }

  function drawPlot() {
    readColors();
    if (!pdata) buildPdata();
    const live = pdata ? pdata.ss.filter(s => s.ok) : [];
    const units = [];
    for (const s of live) if (units.indexOf(s.u) < 0) units.push(s.u);
    const nF = Math.max(1, units.length);

    // de lade groeit mee met het aantal deelgrafieken, tot de helft van het scherm;
    // wie de lade zelf versleept houdt zijn eigen hoogte
    if (model.drawerAuto !== false && !narrow.matches && !drawer.classList.contains("closed")) {
      const want = Math.round(Math.max(210, Math.min(window.innerHeight * 0.5, 64 + nF * 92 + PAD.B)));
      const cur = parseFloat(drawer.style.getPropertyValue("--drawerH")) || 0;
      if (Math.abs(cur - want) > 2) { drawer.style.setProperty("--drawerH", want + "px"); return; }
    }

    const wrap = plotCv.parentElement, cs = getComputedStyle(wrap);
    const innerW = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const innerH = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    // eerlijk verdelen; pas als het echt niet past groeit het canvas en scrolt de houder
    const hF = Math.max(64, (innerH - PAD.B) / nF);
    const h = Math.max(80, Math.floor(hF * nF + PAD.B));
    const w = Math.max(1, Math.floor(innerW));
    plotCv.style.height = h + "px";
    plotCv.style.width = w + "px";
    plotCv.width = Math.round(w * DPR); plotCv.height = Math.round(h * DPR);
    pctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    pctx.clearRect(0, 0, w, h);
    pctx.font = '400 10px "IBM Plex Mono", ui-monospace, monospace';
    pctx.fillStyle = C.ink3;
    if (!live.length || w < 90) {
      pctx.textAlign = "center"; pctx.textBaseline = "middle";
      pctx.font = '400 12px "IBM Plex Sans", ui-sans-serif, sans-serif';
      pctx.fillText(job ? "rekenen…" : !sweep ? (dynStale ? "druk op Bereken om de grafieken te vullen" : "geen oplossing")
        : "nog geen metingen \u2014 klik op Metingen\u2026", w / 2, Math.min(h, innerH) / 2);
      return;
    }

    // bereik en maatstreepjes per deelgrafiek, dan de linkermarge op de breedste waarde
    const subs = units.map(u => {
      const set = live.filter(s => s.u === u);
      let lo = Infinity, hi = -Infinity;
      for (const s of set) { if (s.mn < lo) lo = s.mn; if (s.mx > hi) hi = s.mx; }
      const mid = (lo + hi) / 2;
      if (!(hi - lo > Math.max(1e-12, Math.abs(mid) * 1e-6))) {
        const e = Math.max(Math.abs(mid) * 0.05, 1e-9);   // constant: toon hem vlak
        lo = mid - e; hi = mid + e;
      }
      const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
      const tk = niceTicks(lo, hi, hF > 110 ? 4 : 3).filter(v => v >= lo && v <= hi);
      const tstep = tk.length > 1 ? tk[1] - tk[0] : (hi - lo) / 3;
      return { u, set, lo, hi, tk, labs: tk.map(v => fmtTick(v, tstep)) };
    });
    let tw = 0;
    for (const sb of subs) for (const t of sb.labs) tw = Math.max(tw, pctx.measureText(t).width);
    PAD.L = Math.max(34, Math.ceil(tw) + 12);

    const pw = w - PAD.L - PAD.R;
    const [xlo, xhi] = xRange();
    const X = v => PAD.L + ((v - xlo) / (xhi - xlo)) * pw;
    const idx = Math.max(0, Math.min(360, hoverI !== null ? hoverI : Math.round(frame)));

    subs.forEach((sb, f) => {
      const top = f * hF, pt = top + PAD.T, ph = hF - PAD.T - 8;
      const Y = v => pt + ph - ((v - sb.lo) / (sb.hi - sb.lo)) * ph;

      // kopregel: eenheid, dan de metingen in hun kleur
      pctx.textBaseline = "middle"; pctx.textAlign = "left";
      let hx = PAD.L;
      pctx.font = '600 10px "IBM Plex Mono", ui-monospace, monospace';
      pctx.fillStyle = C.ink2; pctx.fillText("[" + (sb.u || "\u2013") + "]", hx, top + 9);
      hx += pctx.measureText("[" + (sb.u || "\u2013") + "]").width + 10;
      pctx.font = '400 10.5px "IBM Plex Sans", ui-sans-serif, sans-serif';
      for (const s of sb.set) {
        const nm = serieLab(model.series[s.si]);
        const nw = pctx.measureText(nm).width;
        if (hx + 14 + nw > w - PAD.R) { pctx.fillStyle = C.ink3; pctx.fillText("\u2026", hx, top + 9); break; }
        pctx.fillStyle = serieColor(s.si); pctx.fillRect(hx, top + 8, 9, 2.5);
        pctx.fillStyle = C.ink2; pctx.fillText(nm, hx + 13, top + 9);
        hx += 13 + nw + 12;
      }

      // raster en y-as
      pctx.font = '400 10px "IBM Plex Mono", ui-monospace, monospace';
      pctx.strokeStyle = C.line; pctx.lineWidth = 1;
      pctx.textAlign = "right"; pctx.textBaseline = "middle";
      sb.tk.forEach((tv, k) => {
        const y = Math.round(Y(tv)) + .5;
        pctx.beginPath(); pctx.moveTo(PAD.L, y); pctx.lineTo(PAD.L + pw, y); pctx.stroke();
        pctx.fillStyle = C.ink3; pctx.fillText(sb.labs[k], PAD.L - 6, y);
      });
      if (sb.lo < 0 && sb.hi > 0) {
        pctx.strokeStyle = C.ink3; pctx.lineWidth = 1;
        const y = Math.round(Y(0)) + .5;
        pctx.beginPath(); pctx.moveTo(PAD.L, y); pctx.lineTo(PAD.L + pw, y); pctx.stroke();
      }
      pctx.strokeStyle = C.line; pctx.lineWidth = 1;
      pctx.strokeRect(PAD.L + .5, Math.round(pt) + .5, Math.round(pw) - 1, Math.round(ph));

      pctx.save();
      pctx.beginPath(); pctx.rect(PAD.L, pt - 2, pw, ph + 4); pctx.clip();
      for (const s of sb.set) {
        const col = serieColor(s.si);
        pctx.strokeStyle = col; pctx.lineWidth = 2;
        pctx.lineJoin = "round"; pctx.lineCap = "round";
        pctx.beginPath();
        let pen = false, px = 0;
        for (let i = 0; i <= 360; i++) {
          const xv = pdata.xs[i], yv = s.a[i];
          if (!isFinite(xv) || !isFinite(yv)) { pen = false; continue; }
          const x = X(xv), y = Y(yv);
          if (pen && Math.abs(x - px) > pw * 0.5) pen = false;   // hoekas springt bij 360°
          if (!pen) { pctx.moveTo(x, y); pen = true; } else pctx.lineTo(x, y);
          px = x;
        }
        pctx.stroke();
        const xv = pdata.xs[idx], yv = s.a[idx];
        if (isFinite(xv) && isFinite(yv)) {
          pctx.fillStyle = col;
          pctx.beginPath(); pctx.arc(X(xv), Y(yv), 3.4, 0, Math.PI * 2); pctx.fill();
          pctx.strokeStyle = C.panel; pctx.lineWidth = 1.5; pctx.stroke();
        }
      }
      pctx.restore();
    });

    // x-as: één eenheid, en nooit twee getallen over elkaar
    xUnit = (model.xAxis || "time") === "time" && xhi < 1 ? "ms" : "s";
    pctx.font = '400 10px "IBM Plex Mono", ui-monospace, monospace';
    pctx.textBaseline = "top"; pctx.fillStyle = C.ink3;
    const axU = (model.xAxis || "time") === "time" ? xUnit
      : (model.xAxis.slice(0, 4) === "ang|" ? "°" : chU(model.xAxis.slice(3)));
    const ty = nF * hF + 5;
    pctx.textAlign = "right";
    const uw = pctx.measureText(axU).width;
    pctx.fillText(axU, w - PAD.R, ty);
    pctx.textAlign = "center";
    let lastR = -1e9;
    const nx = pw > 420 ? 6 : 4;
    for (let k = 0; k <= nx; k++) {
      const v = xlo + (xhi - xlo) * k / nx;
      const t = fmtX(v), tw2 = pctx.measureText(t).width;
      const x = Math.max(PAD.L + tw2 / 2, Math.min(w - PAD.R - uw - 8 - tw2 / 2, X(v)));
      if (x - tw2 / 2 < lastR + 8) continue;
      pctx.fillText(t, x, ty);
      lastR = x + tw2 / 2;
    }
    const xv = pdata.xs[idx];
    if (isFinite(xv)) {
      pctx.strokeStyle = hoverI !== null ? C.accent : C.driver;
      pctx.lineWidth = 1.2;
      const cx = Math.round(X(xv)) + .5;
      pctx.beginPath(); pctx.moveTo(cx, PAD.T - 4); pctx.lineTo(cx, nF * hF); pctx.stroke();
    }
  }

  function nearestSample(clientX) {
    if (!pdata) return null;
    const r = plotCv.getBoundingClientRect();
    const px = clientX - r.left;
    const pw = r.width - PAD.L - PAD.R;
    const [xlo, xhi] = xRange();
    let best = null, bd = Infinity;
    for (let i = 0; i <= 360; i++) {
      const v = pdata.xs[i];
      if (!isFinite(v)) continue;
      const d = Math.abs(PAD.L + ((v - xlo) / (xhi - xlo)) * pw - px);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  plotCv.addEventListener("pointermove", ev => {
    const i = nearestSample(ev.clientX);
    if (i !== null && i !== hoverI) { hoverI = i; syncSeriesValues(); drawPlot(); }
  });
  plotCv.addEventListener("pointerleave", () => {
    if (hoverI !== null) { hoverI = null; syncSeriesValues(); drawPlot(); }
  });
  plotCv.addEventListener("click", ev => {
    const i = nearestSample(ev.clientX);
    if (i === null) return;
    if (playing) togglePlay();
    hoverI = null; goto(i);
  });

  function niceTicks(lo, hi, n) {
    const raw = (hi - lo) / n;
    if (!(raw > 0)) return [lo];
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = ([1, 2, 2.5, 5, 10].find(m => m * mag >= raw) || 10) * mag;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
    return out;
  }
  function fmtTick(v, step) {
    const a = Math.abs(v);
    if (step > 0) {
      if (a >= 1e5) return v.toExponential(1);
      const d = Math.max(0, Math.min(6, Math.ceil(-Math.log10(step)) + 1));
      return v.toFixed(d);
    }
    if (a >= 1e5 || (a > 0 && a < 1e-2)) return v.toExponential(0);
    if (a >= 100) return v.toFixed(0);
    if (a >= 10) return v.toFixed(1);
    return v.toFixed(2);
  }

  document.getElementById("csvBtn").addEventListener("click", () => {
    if (!sweep || !model.series.length) { flash("Nog geen metingen om te exporteren."); return; }
    if (!pdata) buildPdata();
    const xname = (xSel.options[xSel.selectedIndex] || {}).text || "x";
    const head = [xname].concat(pdata.ss.map(d =>
      serieLab(model.series[d.si]) + " [" + d.u + "]")).map(h => '"' + h.replace(/"/g, "'") + '"');
    const lines = [head.join(",")];
    for (let i = 0; i <= 360; i++) {
      if (!sweep.ok[i]) continue;
      const r = [pdata.xs[i].toFixed(6)];
      for (const d of pdata.ss) r.push(isFinite(d.a[i]) ? d.a[i].toFixed(6) : "");
      lines.push(r.join(","));
    }
    const txt = lines.join("\n");
    navigator.clipboard.writeText(txt).then(
      () => { document.getElementById("hint").innerHTML = "<b>CSV naar klembord</b> — " + (lines.length - 1) + " regels."; },
      () => flash("Kopiëren geweigerd door de browser.")
    );
  });

  /* ============================================================
     Herberekenen
     Kinematisch is snel en gebeurt meteen. Dynamisch rekent in stukjes op
     de achtergrond (met voortgangsbalk en Stop), en standaard pas als je op
     Bereken drukt. Alleen echte modelwijzigingen maken de oplossing ongeldig;
     selecteren, pannen of zoomen niet.
     ============================================================ */
  let dynStale = false, job = null, solved = null;

  // alles wat de dynamische uitkomst bepaalt — niet de weergave (namen, sporen)
  function physSig() {
    return JSON.stringify([
      model.nodes.map(n => [n.id, n.x, n.y, n.support, n.dir, n.m, n.ax, n.ay]),
      model.elems, model.gravity, model.simDur, model.dtStep, model.defMass,
      model.durMode, model.cVisc, model.maxT, model.jointDamp, model.cJoint
    ], (k, v) => k === "theta" ? undefined : v);
  }

  function refreshAfterSolve() {
    pdata = null; hoverI = null;
    syncTransport();
    if (sweep) applyFrame(frame);
    renderSeries(); drawPlot(); syncDof(); syncInspector(); draw();
  }

  function rebuild(force) {
    if (model.mode === "dyn") {
      if (playing) togglePlay();
      frame = 0; pdata = null; hoverI = null;
      const sig = physSig();
      if (!force && solved && solved.sigs.indexOf(sig) >= 0) {        // niets wezenlijks veranderd
        cancelJob(); sweep = solved.sweep; dynStale = false;
        refreshAfterSolve(); return;
      }
      cancelJob();
      sweep = null;
      if (mobility().dof < 0) { dynStale = false; solveOK = true; }
      else if (force || model.autoSolve) { dynStale = false; startDyn(); }
      else dynStale = true;
      syncTransport(); renderSeries(); drawPlot();
      return;
    }
    cancelJob();
    dynStale = false;
    computeSweep();
    refreshAfterSolve();
  }

  function startDyn() {
    const gen = computeDyn();
    job = { gen, p: null, to: 0, sig: physSig() };
    const step = () => {
      if (!job || job.gen !== gen) return;
      // de rekenstap verschuift punten tijdelijk; tussen de stukjes door staat
      // het model weer precies zoals je het getekend hebt
      const keep = model.nodes.map(n => [n, n.x, n.y]);
      const t0 = performance.now();
      let r;
      try {
        do { r = gen.next(); } while (!r.done && performance.now() - t0 < 30);
      } catch (err) { console.error(err); r = { done: true, value: null }; }
      keep.forEach(([n, x, y]) => { n.x = x; n.y = y; });
      if (!r.done) { job.p = r.value; showProgress(r.value); job.to = setTimeout(step, 0); return; }
      const done = job; job = null;
      sweep = r.value || null;
      frame = 0;
      if (sweep) applyFrame(0);
      // de getekende stand én de (geprojecteerde) stand op t = 0 horen bij deze oplossing
      solved = sweep ? { sigs: [done.sig, physSig()], sweep } : null;
      refreshAfterSolve();
    };
    syncTransport();
    job.to = setTimeout(step, 0);
  }

  function cancelJob() {
    if (!job) return;
    clearTimeout(job.to);
    try { job.gen.return(); } catch (_) {}
    job = null;
  }

  function solveNow() {
    if (model.mode !== "dyn") return;
    toT0();
    rebuild(true);
  }

  function changed() {
    if (playing) togglePlay();
    if (model.mode !== "dyn") frame = 0;
    if (sel && narrow && narrow.matches && model.tab === "meas") setTab("props");
    rebuild(); syncDof(); syncInspector(); draw(); save(); pushHistory();
  }
  // alleen weergave veranderd (bijv. een spoor aan of uit): niet herberekenen
  function touched() { draw(); save(); pushHistory(); }

  /* ============================================================
     Grid controls / theme
     ============================================================ */
  document.getElementById("dragSeg").addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    model.rigidDrag = b.dataset.v === "rigid";
    document.querySelectorAll("#dragSeg button").forEach(x =>
      x.setAttribute("aria-pressed", String((x.dataset.v === "rigid") === model.rigidDrag)));
    save();
  });
  document.getElementById("snapChk").addEventListener("change", e => { model.snap = e.target.checked; save(); });
  document.getElementById("gravChk").addEventListener("change", e => { toT0(); model.gravity = e.target.checked; changed(); });
  document.getElementById("fChk").addEventListener("change", e => { model.showForces = e.target.checked; draw(); save(); });

  document.getElementById("modeSeg").addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    setMode(b.dataset.v);
  });
  // De knoppen Kinematisch / Dynamisch / Evenwicht. "Evenwicht" is dynamisch
  // rekenen waarbij de duur volgt uit het moment dat alles stil ligt.
  function setModeUI(m) {
    model.mode = m;
    syncModeSeg();
  }
  function syncModeSeg() {
    const v = model.mode !== "dyn" ? "kin" : model.durMode === "equil" ? "equil" : "dyn";
    document.querySelectorAll("#modeSeg button").forEach(x =>
      x.setAttribute("aria-pressed", String(x.dataset.v === v)));
    document.getElementById("dynSect").hidden = model.mode !== "dyn";
    syncDynInputs();
  }
  function setMode(v) {
    toT0();
    if (v === "kin") model.mode = "kin";
    else { model.mode = "dyn"; model.durMode = v === "equil" ? "equil" : "fixed"; }
    syncModeSeg();
    frame = 0; changed();
  }
  const bindOpt = (id, key, min, fn) => {
    const el = document.getElementById(id);
    el.addEventListener("change", () => {
      const v = parseFloat(el.value);
      if (isFinite(v) && v >= min) { toT0(); model[key] = fn ? fn(v) : v; frame = 0; changed(); }
      else el.value = model[key];
    });
  };
  document.getElementById("autoChk").addEventListener("change", e => {
    toT0(); model.autoSolve = e.target.checked; changed();
  });
  document.getElementById("durMode").addEventListener("change", e => {
    toT0(); model.durMode = e.target.value;
    syncModeSeg();
    frame = 0; changed();
  });
  document.getElementById("jdChk").addEventListener("change", e => {
    toT0(); model.jointDamp = e.target.checked; syncDynInputs(); changed();
  });
  bindOpt("cvInp", "cVisc", 0);
  bindOpt("cjInp", "cJoint", 0);
  bindOpt("durInp", "simDur", 0.05);
  bindOpt("maxInp", "maxT", 0.2);
  bindOpt("dtInp", "dtStep", 0.001);
  bindOpt("mInp", "defMass", 0.001);
  document.getElementById("gridInp").addEventListener("input", e => {
    const v = parseFloat(e.target.value);
    if (isFinite(v) && v > 0) { model.grid = v; draw(); save(); }
  });

  document.getElementById("themeBtn").addEventListener("click", () => {
    const r = document.documentElement;
    const cur = r.getAttribute("data-theme");
    const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = cur ? (cur === "dark" ? "light" : "dark") : (sysDark ? "light" : "dark");
    r.setAttribute("data-theme", next);
    draw(); renderSeries(); drawPlot();
  });

  /* ============================================================
     Examples
     ============================================================ */
  function build(nodes, elems, after) {
    if (playing) togglePlay();
    cancelJob(); solved = null;
    model.nodes = []; model.elems = []; model.series = []; uid = 1; nameCounter = 0;
    model.durMode = "fixed";
    frame = 0; setModeUI("kin");
    const map = {};
    nodes.forEach(spec => {
      const n = addNode({ x: spec[1], y: spec[2] });
      n.support = spec[3] || "free";
      if (spec[4] !== undefined) n.dir = spec[4];
      map[spec[0]] = n.id;
    });
    elems.forEach(spec => {
      const [type, a, b, extra] = spec;
      if (type === "force") {
        model.elems.push({ id: eid(), type: "force", node: map[a], mag: b, ang: extra });
        return;
      }
      const e = addTwoNode(type, map[a], map[b]);
      if (e && extra) Object.assign(e, extra);
    });
    for (const e of model.elems) {
      if (e.type !== "link" || !e.driver) continue;
      if (N(e.a).support !== "pin" && N(e.b).support === "pin") { const t = e.a; e.a = e.b; e.b = t; }
      if (e.theta0 === undefined) e.theta0 = crankAngle(e);
    }
    sel = null; pending = null;
    if (after) after(nm => model.nodes.find(n => n.name === nm));
    fit(); changed();
    if (model.mode === "dyn") solveNow();
  }

  const EXAMPLES = {
    fourbar: () => build(
      [["A", 0, 0, "pin"], ["B", 20, 34.64], ["C", 124.2, 69.88], ["D", 120, 0, "pin"], ["E", 57.69, 94.89]],
      [["link", "A", "B", { driver: true, theta0: 60, rpm: 60, cw: false }], ["link", "B", "C"], ["link", "C", "D"],
       ["link", "B", "E"], ["link", "C", "E"]],
      g => {
        g("E").trace = true; g("C").trace = true;
        g("E").m = 0.5;
        model.series.push({ key: "n|" + g("E").id + "|v" },
                          { key: "t|" + model.elems.find(e => e.driver).id + "|T" });
      }
    ),
    slidercrank: () => build(
      [["A", 0, 0, "pin"], ["B", 25.71, 30.64], ["C", 141.73, 0, "slider", 0]],
      [["link", "A", "B", { driver: true, theta0: 50, rpm: 60, cw: false }], ["link", "B", "C"]],
      g => {
        g("C").m = 1;
        model.series.push({ key: "n|" + g("C").id + "|ax" }, { key: "r|" + g("C").id + "|Rn" });
      }
    ),
    fivebar: () => build(
      [["A", 0, 0, "pin"], ["B", 17.101, 46.985], ["C", 80, 177.632], ["D", 142.899, 46.985], ["E", 160, 0, "pin"]],
      [["link", "A", "B", { driver: true, theta0: 70, rpm: 60, cw: false }], ["link", "B", "C"],
       ["link", "C", "D"], ["link", "E", "D", { driver: true, theta0: 110, rpm: 45, cw: true }]],
      g => {
        g("C").trace = true; g("C").m = 0.8;
        const ds = model.elems.filter(e => e.driver);
        model.series.push({ key: "t|" + ds[0].id + "|T" }, { key: "t|" + ds[1].id + "|T" });
      }
    ),
    springload: () => build(
      [["A", 0, 0, "pin"], ["B", 120, 0], ["C", 0, 90, "pin"]],
      [["link", "A", "B"], ["spring", "C", "B", { k: 0.4, L0: 90 }]],
      g => {
        g("B").m = 1.5; g("B").trace = true;
        model.gravity = true; model.simDur = 3; model.dtStep = 0.2;
        setModeUI("dyn");
        document.getElementById("gravChk").checked = true;
        document.getElementById("durInp").value = 3;
        model.series.push({ key: "n|" + g("B").id + "|y" }, { key: "e||E" });
      }
    ),
    empty: () => build([], [])
  };

  /* ---------- top-bar menu ---------- */
  const menu = document.getElementById("menu"), menuBtn = document.getElementById("menuBtn");
  function closeMenu() { menu.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); }
  menuBtn.addEventListener("click", ev => {
    ev.stopPropagation();
    menu.hidden = !menu.hidden;
    menuBtn.setAttribute("aria-expanded", String(!menu.hidden));
  });
  document.addEventListener("click", ev => { if (!menu.hidden && !menu.contains(ev.target)) closeMenu(); });
  document.addEventListener("keydown", ev => { if (ev.key === "Escape") closeMenu(); });
  menu.addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    closeMenu();
    if (b.dataset.ex) { const f = EXAMPLES[b.dataset.ex]; if (f) f(); return; }
    if (b.dataset.a === "copy") copyModel();
    if (b.dataset.a === "paste") openPaste();
    if (b.dataset.a === "link") copyLink();
  });

  /* ============================================================
     Persistence (per-viewer convenience only)
     ============================================================ */
  const KEY = "mechschets.r1";
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        nodes: model.nodes, elems: model.elems, snap: model.snap, grid: model.grid,
        rigidDrag: model.rigidDrag, series: model.series, gravity: model.gravity, showForces: model.showForces, mode: model.mode,
        simDur: model.simDur, dtStep: model.dtStep, defMass: model.defMass,
        xAxis: model.xAxis, railSlim: model.railSlim, drawerOpen: model.drawerOpen,
        drawerH: model.drawerH, drawerAuto: model.drawerAuto, tab: model.tab, autoSolve: model.autoSolve,
        durMode: model.durMode, cVisc: model.cVisc, maxT: model.maxT,
        jointDamp: model.jointDamp, cJoint: model.cJoint, uid, nameCounter
      }));
    } catch (_) {}
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d || !Array.isArray(d.nodes) || !d.nodes.length) return false;
      model.nodes = d.nodes; model.elems = d.elems || [];
      model.snap = d.snap !== false; model.grid = d.grid || 10;
      model.rigidDrag = !!d.rigidDrag;
      model.series = Array.isArray(d.series) ? d.series.filter(s => s && (s.key || s.expr)) : [];
      model.gravity = !!d.gravity;
      model.showForces = d.showForces !== false;
      document.getElementById("gravChk").checked = model.gravity;
      document.getElementById("fChk").checked = model.showForces;
      model.simDur = d.simDur || 2; model.dtStep = d.dtStep || 0.2; model.defMass = d.defMass || 0.1;
      document.getElementById("durInp").value = model.simDur;
      document.getElementById("dtInp").value = model.dtStep;
      document.getElementById("mInp").value = model.defMass;
      model.xAxis = d.xAxis || "time";
      model.railSlim = !!d.railSlim;
      model.drawerOpen = d.drawerOpen !== false;
      model.drawerH = d.drawerH || 232;
      model.drawerAuto = d.drawerAuto !== false;
      model.tab = d.tab || "props";
      model.autoSolve = !!d.autoSolve;
      model.durMode = d.durMode || "fixed";
      model.cVisc = d.cVisc || 0;
      model.maxT = d.maxT || 30;
      model.jointDamp = !!d.jointDamp;
      model.cJoint = d.cJoint !== undefined ? d.cJoint : 0.05;
      setModeUI(d.mode === "dyn" ? "dyn" : "kin");
      for (const e of model.elems) if (e.driver && e.theta0 === undefined) e.theta0 = e.theta || 0;
      uid = d.uid || 1; nameCounter = d.nameCounter || 0;
      for (const n of model.nodes) { if (n.ax === undefined) { n.ax = n.x; n.ay = n.y; } }
      document.getElementById("snapChk").checked = model.snap;
      document.getElementById("gridInp").value = model.grid;
      document.querySelectorAll("#dragSeg button").forEach(x =>
        x.setAttribute("aria-pressed", String((x.dataset.v === "rigid") === model.rigidDrag)));
      return true;
    } catch (_) { return false; }
  }

  /* ============================================================
     Geschiedenis, opslaan en delen
     ============================================================ */
  const DOC_KEYS = ["nodes", "elems", "series", "mode", "gravity", "showForces",
                    "simDur", "dtStep", "defMass", "xAxis", "grid", "snap", "rigidDrag",
                    "autoSolve", "durMode", "cVisc", "maxT", "jointDamp", "cJoint"];
  function doc() {
    const o = {};
    for (const k of DOC_KEYS) o[k] = model[k];
    return o;
  }
  function loadDoc(d) {
    if (!d || !Array.isArray(d.nodes)) throw new Error("geen geldig model");
    for (const k of DOC_KEYS) if (d[k] !== undefined) model[k] = d[k];
    for (const n of model.nodes) if (n.ax === undefined) { n.ax = n.x; n.ay = n.y; }
    for (const e of model.elems) if (e.driver && e.theta0 === undefined) e.theta0 = e.theta || 0;
    model.series = (model.series || []).filter(x => x && (x.key || x.expr));
    for (const e of model.elems) {
      if (e.type !== "link" || !e.driver) continue;
      const A = model.nodes.find(n => n.id === e.a), B = model.nodes.find(n => n.id === e.b);
      if (A && B && A.support !== "pin" && B.support === "pin") { const t = e.a; e.a = e.b; e.b = t; }
    }
    uid = 1; nameCounter = 0;
    for (const n of model.nodes) { const m = /^n(\d+)$/.exec(n.id); if (m) uid = Math.max(uid, +m[1] + 1); }
    for (const e of model.elems) { const m = /^e(\d+)$/.exec(e.id); if (m) uid = Math.max(uid, +m[1] + 1); }
    nameCounter = model.nodes.length;
    sel = null; pending = null; frame = 0;
    setModeUI(model.mode === "dyn" ? "dyn" : "kin");
    document.getElementById("snapChk").checked = model.snap !== false;
    document.getElementById("gridInp").value = model.grid;
    document.getElementById("gravChk").checked = !!model.gravity;
    document.getElementById("fChk").checked = model.showForces !== false;
    document.getElementById("durInp").value = model.simDur;
    document.getElementById("dtInp").value = model.dtStep;
    document.getElementById("mInp").value = model.defMass;
    syncDynInputs();
    document.querySelectorAll("#dragSeg button").forEach(x =>
      x.setAttribute("aria-pressed", String((x.dataset.v === "rigid") === !!model.rigidDrag)));
  }

  let undoStack = [], redoStack = [], lastSnap = null, restoring = false;
  function pushHistory() {
    if (restoring) return;
    const snap = JSON.stringify(doc());
    if (snap === lastSnap) return;
    if (lastSnap !== null) {
      undoStack.push(lastSnap);
      if (undoStack.length > 80) undoStack.shift();
      redoStack.length = 0;
    }
    lastSnap = snap;
    syncHistoryBtns();
  }
  function syncHistoryBtns() {
    document.getElementById("undoBtn").disabled = !undoStack.length;
    document.getElementById("redoBtn").disabled = !redoStack.length;
  }
  function restore(snap) {
    if (playing) togglePlay();
    cancelJob();
    restoring = true;
    try { loadDoc(JSON.parse(snap)); lastSnap = snap; changed(); }
    catch (_) { flash("Kon die stap niet herstellen."); }
    restoring = false;
    syncHistoryBtns();
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(lastSnap);
    restore(undoStack.pop());
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(lastSnap);
    restore(redoStack.pop());
  }
  document.getElementById("undoBtn").addEventListener("click", undo);
  document.getElementById("redoBtn").addEventListener("click", redo);

  const b64 = {
    enc: o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))),
    dec: t => JSON.parse(decodeURIComponent(escape(atob(t))))
  };
  function toast(t) { document.getElementById("hint").innerHTML = "<b>" + t + "</b>"; hintShow(); }

  function copyModel() {
    navigator.clipboard.writeText(JSON.stringify(doc(), null, 1)).then(
      () => toast("Model naar klembord gekopieerd."), () => flash("Kopiëren geweigerd."));
  }
  function copyLink() {
    let url;
    try {
      url = location.origin + location.pathname + location.search + "#m=" + b64.enc(doc());
      location.hash = "m=" + b64.enc(doc());
    } catch (_) { flash("Model te groot voor een link."); return; }
    navigator.clipboard.writeText(url).then(
      () => toast("Deelbare link naar klembord (" + url.length + " tekens)."),
      () => toast("Link staat in de adresbalk."));
  }

  const modal = document.getElementById("modal"), modalTa = document.getElementById("modalTa");
  function openPaste() { modalTa.value = ""; modal.hidden = false; modalTa.focus(); }
  document.getElementById("modalCancel").addEventListener("click", () => { modal.hidden = true; });
  modal.addEventListener("click", ev => { if (ev.target === modal) modal.hidden = true; });
  document.getElementById("modalOk").addEventListener("click", () => {
    const t = modalTa.value.trim();
    try {
      loadDoc(t.charAt(0) === "{" ? JSON.parse(t) : b64.dec(t.replace(/^.*#m=/, "")));
      modal.hidden = true; fit(); changed();
      toast("Model geladen.");
    } catch (err) { flash("Kon dit niet lezen: " + err.message); }
  });

  // arrow keys nudge the selected point by one grid step
  document.addEventListener("keydown", ev => {
    if (ev.key === "F5" && model.mode === "dyn") { ev.preventDefault(); solveNow(); return; }
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName)) return;
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && ev.key.toLowerCase() === "z") {
      ev.preventDefault(); ev.shiftKey ? redo() : undo(); return;
    }
    if (mod && ev.key.toLowerCase() === "y") { ev.preventDefault(); redo(); return; }
    if (!sel || sel.kind !== "node") return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[ev.key];
    if (!d) return;
    ev.preventDefault();
    if (!atT0()) { lockNudge(); return; }
    cancelJob();
    const n = N(sel.id), st = (model.grid || 1) * (ev.shiftKey ? 5 : 1);
    n.x = round2(n.x + d[0] * st); n.y = round2(n.y + d[1] * st);
    anchorHere(n);
    if (model.rigidDrag) relax(new Set([n.id])); else reharvest(n.id);
    changed();
  });

  /* ============================================================
     Indeling: tabbladen, lade, smalle balk, mobiel
     ============================================================ */
  const drawer = document.getElementById("drawer");
  const paneMeas = document.getElementById("paneMeas");
  const centre = document.querySelector(".centre");
  const tabs = document.getElementById("tabs");
  const narrow = window.matchMedia("(max-width: 900px)");

  function setTab(t) {
    tabs.querySelectorAll("button").forEach(b =>
      b.setAttribute("aria-selected", String(b.dataset.t === t)));
    document.querySelectorAll(".pane").forEach(p => { p.hidden = p.dataset.p !== t; });
    model.tab = t;
    if (t === "meas") requestAnimationFrame(drawPlot);
    try { localStorage.setItem("mechschets.tab", t); } catch (_) {}
  }
  tabs.addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    setTab(b.dataset.t);
  });

  // on a phone the measurement drawer becomes the third tab
  function relayout() {
    const measTab = tabs.querySelector('[data-t="meas"]');
    if (narrow.matches) {
      if (drawer.parentElement !== paneMeas) paneMeas.appendChild(drawer);
      measTab.hidden = false;
      drawer.classList.remove("closed");
    } else {
      if (drawer.parentElement !== centre) centre.appendChild(drawer);
      measTab.hidden = true;
      if (model.tab === "meas") setTab("props");
    }
    requestAnimationFrame(() => { resize(); drawPlot(); });
  }
  narrow.addEventListener("change", relayout);

  document.getElementById("statusBtn").addEventListener("click", ev => {
    const on = ev.currentTarget.getAttribute("aria-expanded") === "true";
    ev.currentTarget.setAttribute("aria-expanded", String(!on));
    document.getElementById("statusDetail").hidden = on;
  });

  document.getElementById("drawerBtn").addEventListener("click", () => {
    drawer.classList.toggle("closed");
    model.drawerOpen = !drawer.classList.contains("closed");
    requestAnimationFrame(() => { resize(); drawPlot(); });
    save();
  });

  // drag the top edge of the drawer to resize it
  (function () {
    const grip = document.getElementById("grip");
    let g = null;
    grip.addEventListener("pointerdown", ev => {
      if (narrow.matches) return;
      grip.setPointerCapture(ev.pointerId);
      g = { y: ev.clientY, h: drawer.getBoundingClientRect().height };
      drawer.classList.remove("closed");
    });
    grip.addEventListener("pointermove", ev => {
      if (!g) return;
      const h = Math.max(120, Math.min(window.innerHeight * 0.62, g.h - (ev.clientY - g.y)));
      model.drawerH = Math.round(h); model.drawerAuto = false;
      drawer.style.setProperty("--drawerH", h + "px");
      resize(); drawPlot();
    });
    const stop = () => { if (g) { g = null; save(); } };
    grip.addEventListener("pointerup", stop);
    grip.addEventListener("dblclick", () => { model.drawerAuto = true; drawPlot(); save(); });
    grip.addEventListener("pointercancel", stop);
  })();

  document.getElementById("railBtn").addEventListener("click", () => {
    rail.classList.toggle("slim");
    model.railSlim = rail.classList.contains("slim");
    requestAnimationFrame(resize);
    save();
  });

  function applyLayout() {
    rail.classList.toggle("slim", !!model.railSlim);
    drawer.classList.toggle("closed", model.drawerOpen === false);
    if (model.drawerH && model.drawerAuto === false) drawer.style.setProperty("--drawerH", model.drawerH + "px");
    let t = model.tab;
    try { t = t || localStorage.getItem("mechschets.tab") || "props"; } catch (_) { t = t || "props"; }
    if (t === "meas" && !narrow.matches) t = "props";
    setTab(t);
    relayout();
  }

  /* ============================================================
     Boot
     ============================================================ */
  const ro = new ResizeObserver(resize);
  ro.observe(cv.parentElement);
  let plotRaf = 0;
  new ResizeObserver(() => { cancelAnimationFrame(plotRaf); plotRaf = requestAnimationFrame(drawPlot); })
    .observe(plotCv.parentElement);
  window.addEventListener("resize", resize);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", draw);

  setTool("select");
  requestAnimationFrame(() => {
    resize();
    let done = false;
    const h = location.hash || "";
    if (h.indexOf("#m=") === 0) {
      try { loadDoc(b64.dec(h.slice(3))); fit(); changed(); done = true; }
      catch (_) { /* onleesbare link — val terug op de laatste sessie */ }
    }
    if (!done) { if (!load()) EXAMPLES.fourbar(); else { fit(); changed(); } }
    applyLayout();
    lastSnap = JSON.stringify(doc());
    syncHistoryBtns();
  });
})();
