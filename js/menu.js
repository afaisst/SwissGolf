// SwissGolf – front page: abstract background, course selector, round set-up, settings, and the engine loader.
// Runs before (and without) the 3D engine; the engine scripts are loaded when a round starts.
'use strict';

const CONTROLS_HTML = `
  <div class="ctl-grid">
    <div><h4>Walking</h4>
      <p><kbd>↑</kbd><kbd>↓</kbd> walk · <kbd>←</kbd><kbd>→</kbd> turn</p>
      <p>hold <kbd>Space</kbd> + <kbd>↑</kbd> run – watch your stamina</p>
      <p><kbd>Space</kbd> at your ball: take your stance</p>
      <p><kbd>E</kbd> interact: ball machines, fill a range tee, drop / pick up practice balls, the cart</p></div>
    <div><h4>Shot</h4>
      <p>move the mouse sideways or <kbd>←</kbd><kbd>→</kbd> to aim (<kbd>Shift</kbd> = fine)</p>
      <p>pick a club in the bag: click it, mouse wheel, or <kbd>↑</kbd><kbd>↓</kbd></p>
      <p><b>hold the left button and pull the mouse back</b> for power – push forward for less – <b>release to hit</b></p>
      <p><kbd>Space</kbd> step away · hold <kbd>Space</kbd> while the ball rolls to fast-forward</p>
      <p><kbd>G</kbd> read the green: arrows flow downhill (on or near the green)</p></div>
    <div><h4>Golf cart</h4>
      <p><kbd>E</kbd> hop on / off · <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> drive · <kbd>Space</kbd> brake</p>
      <p><kbd>V</kbd> first / third person · drag with the mouse to look around (360°) · <kbd>C</kbd> look ahead</p></div>
    <div><h4>Game</h4>
      <p><kbd>M</kbd> big map · <kbd>R</kbd> restart hole · <kbd>N</kbd> sound</p>
      <p><kbd>H</kbd> controls · <kbd>Esc</kbd> menu</p>
      <p><kbd>1</kbd>–<kbd>4</kbd> or click a player chip: switch player · hover a chip for statistics</p></div>
  </div>`;

const menu = (() => {
  const $ = id => document.getElementById(id);
  const WEATHER_LABELS = { sunny: 'Sunny', fair: 'Fair', cloudy: 'Cloudy', overcast: 'Overcast', fog: 'Fog', rain: 'Rain' };
  const WIND_LABELS = { calm: 'No wind', medium: 'Medium', strong: 'Strong' };
  const TEE_NAMES = [['white', 'White'], ['yellow', 'Yellow'], ['blue', 'Blue'], ['red', 'Red']];
  const store = {
    get(k, d) { try { return localStorage.getItem('swissgolf.' + k) ?? d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('swissgolf.' + k, v); } catch (e) { } },
  };
  const loaded = new Set();
  let current = null, engineCourse = null, engineState = 'none', pending = null;   // engineState: none | loading | ready

  function loadScript(src) {
    if (loaded.has(src)) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src;
      s.onload = () => { loaded.add(src); res(); }; s.onerror = () => rej(new Error('could not load ' + src));
      document.body.appendChild(s);
    });
  }
  function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  function show(id, on = true) { $(id).classList.toggle('hidden', !on); }
  function pane(name) {
    for (const p of ['paneLoad', 'paneCourses', 'paneRound', 'paneControls', 'paneSettings']) show(p, p === name);
    const nav = { paneLoad: 'mLoad', paneCourses: 'mCourses', paneRound: 'mCourses', paneControls: 'mControls', paneSettings: 'mSettings' }[name];
    for (const b of ['mLoad', 'mCourses', 'mControls', 'mSettings']) $(b).classList.toggle('active', b === nav);
    if (name === 'paneLoad') renderSave();
  }

  /* ---------- abstract background: topographic contour lines ---------- */
  function drawBackground() {
    const c = $('menuBg'), dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    c.width = W * dpr; c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px';
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
    const g = ctx.createRadialGradient(W * 0.72, H * 0.35, 50, W * 0.6, H * 0.5, Math.max(W, H) * 0.9);
    g.addColorStop(0, '#1d4a2c'); g.addColorStop(0.55, '#10301d'); g.addColorStop(1, '#071a10');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // height field: a few smooth hills + noise
    const f = (x, y) => fbm(x * 0.0032 + 11, y * 0.0032 + 4, 4) + 0.35 * Math.exp(-((x - W * 0.93) ** 2 + (y - H * 0.88) ** 2) / (2 * (W * 0.12) ** 2));
    const S = 7, nx = Math.ceil(W / S) + 1, ny = Math.ceil(H / S) + 1, v = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = f(i * S, j * S);
    const STEP = 0.022;
    const lines = [[], []];  // minor, major
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = v[j * nx + i], b = v[j * nx + i + 1], cc = v[(j + 1) * nx + i + 1], d = v[(j + 1) * nx + i];
      const lo = Math.min(a, b, cc, d), hi = Math.max(a, b, cc, d);
      for (let L = Math.ceil(lo / STEP) * STEP; L < hi; L += STEP) {
        const pts = [], x0 = i * S, y0 = j * S, e = (p, q) => (L - p) / (q - p);
        if ((a < L) !== (b < L)) pts.push([x0 + e(a, b) * S, y0]);
        if ((b < L) !== (cc < L)) pts.push([x0 + S, y0 + e(b, cc) * S]);
        if ((d < L) !== (cc < L)) pts.push([x0 + e(d, cc) * S, y0 + S]);
        if ((a < L) !== (d < L)) pts.push([x0, y0 + e(a, d) * S]);
        const major = Math.round(L / STEP) % 5 === 0 ? 1 : 0;
        for (let k = 0; k + 1 < pts.length; k += 2) lines[major].push(pts[k], pts[k + 1]);
      }
    }
    for (const [k, style, w] of [[0, 'rgba(180,230,190,0.075)', 1], [1, 'rgba(200,240,205,0.16)', 1.3]]) {
      ctx.strokeStyle = style; ctx.lineWidth = w; ctx.beginPath();
      const L = lines[k]; for (let i = 0; i < L.length; i += 2) { ctx.moveTo(L[i][0], L[i][1]); ctx.lineTo(L[i + 1][0], L[i + 1][1]); }
      ctx.stroke();
    }
    // a dashed line of play with a flag on the summit, and a few dimple dots
    ctx.setLineDash([2, 9]); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(W * 0.36, H * 1.02); ctx.bezierCurveTo(W * 0.55, H * 0.86, W * 0.8, H * 1.0, W * 0.93, H * 0.88); ctx.stroke(); ctx.setLineDash([]);
    const fx = W * 0.93, fy = H * 0.88;
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.ellipse(fx, fy, 46, 30, -0.3, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 70); ctx.stroke();
    ctx.fillStyle = '#d52b1e'; ctx.beginPath(); ctx.moveTo(fx, fy - 70); ctx.lineTo(fx + 34, fy - 60); ctx.lineTo(fx, fy - 50); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(W * 0.55, H * 0.915, 5, 0, 7); ctx.fill();
    const vg = ctx.createLinearGradient(0, 0, W, 0);
    vg.addColorStop(0, 'rgba(4,14,8,0.85)'); vg.addColorStop(0.35, 'rgba(4,14,8,0.35)'); vg.addColorStop(1, 'rgba(4,14,8,0)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  /* ---------- course thumbnails, drawn from the OpenStreetMap layout ---------- */
  function courseSvg(def, w = 300, h = 190) {
    const o = SWISSGOLF.osm && SWISSGOLF.osm[def.osm];
    if (!o) return `<svg viewBox="0 0 ${w} ${h}"></svg>`;
    const feats = o.features.map(([t, enc]) => [t, enc.map(L => { const P = []; let x = 0, y = 0; for (let i = 0; i < L.length; i += 2) { x += L[i]; y += L[i + 1]; P.push([x * o.scale, y * o.scale]); } return P; })]);
    const course = feats.find(([t]) => t.l === 'golf_course'); if (!course) return '';
    let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const L of course[1]) for (const [x, y] of L) { a = Math.min(a, x); c = Math.max(c, x); b = Math.min(b, y); d = Math.max(d, y); }
    const k = Math.min((w - 16) / (c - a), (h - 16) / (d - b)), ox = (w - (c - a) * k) / 2, oy = (h - (d - b) * k) / 2;
    const P = L => L.map(([x, y]) => `${(ox + (x - a) * k).toFixed(1)},${(h - oy - (y - b) * k).toFixed(1)}`).join(' ');
    const out = [];
    const poly = (filter, fill, extra = '') => { for (const [t, Ls] of feats) if (filter(t)) for (const L of Ls) out.push(`<polygon points="${P(L)}" fill="${fill}" ${extra}/>`); };
    poly(t => t.l === 'golf_course', 'rgba(120,180,110,.18)', 'stroke="rgba(255,255,255,.35)" stroke-dasharray="3 3" stroke-width="1"');
    poly(t => t.lu === 'forest', 'rgba(20,60,30,.55)');
    poly(t => t.g === 'fairway', 'rgba(140,205,110,.55)');
    poly(t => t.g === 'tee', 'rgba(170,220,130,.8)');
    poly(t => t.n === 'water' || t.g === 'water_hazard', 'rgba(70,150,220,.85)');
    poly(t => t.g === 'green', '#b9f08c');
    poly(t => t.g === 'bunker', '#ecdcb0');
    poly(t => t.g === 'clubhouse', 'rgba(255,255,255,.75)');
    for (const [t, Ls] of feats) if (t.rw) for (const L of Ls) out.push(`<polyline points="${P(L)}" fill="none" stroke="rgba(20,20,20,.75)" stroke-width="2.2"/><polyline points="${P(L)}" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="0.8" stroke-dasharray="3 3"/>`);
    for (const [t, Ls] of feats) if (t.g === 'hole') for (const L of Ls) {
      out.push(`<polyline points="${P(L)}" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="1.2" stroke-dasharray="2 3"/>`);
      const [x, y] = P([L[0]]).split(',');
      out.push(`<circle cx="${x}" cy="${y}" r="6.5" fill="#fff"/><text x="${x}" y="${+y + 3.2}" text-anchor="middle" font-size="8.5" font-weight="800" fill="#173c25">${t.r}</text>`);
    }
    return `<svg viewBox="0 0 ${w} ${h}" class="thumb">${out.join('')}</svg>`;
  }
  function facts(def) {
    const nos = Object.keys(def.holes).map(Number), par = nos.reduce((s, n) => s + def.holes[n].par, 0), tot = {};
    for (const n of nos) for (const [c, l] of Object.entries(def.holes[n].tees)) tot[c] = (tot[c] || 0) + l;
    return { holes: nos.length, par, tot, nos };
  }

  /* ---------- panes ---------- */
  function renderCourses() {
    const grid = $('courseGrid'); grid.innerHTML = '';
    for (const r of SWISSGOLF.registry) {
      const def = SWISSGOLF.courses[r.id]; if (!def) continue;
      const f = facts(def), best = store.get('best.' + r.id, null);
      const card = el(`<div class="course-card" style="--acc:${def.accent || '#ffd24a'}">
        ${courseSvg(def)}
        <div class="cc-body"><div class="cc-name">${def.name}</div><div class="cc-loc">${def.location || ''}</div>
        <div class="cc-facts"><span><b>${f.holes}</b> holes</span><span>Par <b>${f.par}</b></span><span><b>${(f.tot.white || Object.values(f.tot)[0]).toLocaleString('de-CH')}</b> m</span>${best !== null ? `<span>Best <b>${best}</b></span>` : ''}</div></div></div>`);
      card.onclick = () => selectCourse(r.id);
      grid.appendChild(card);
    }
    grid.appendChild(el(`<div class="course-card add"><div class="add-plus">+</div><div class="cc-name">Your course here</div>
      <div class="cc-loc">Add a folder under <code>maps/</code> and one line in <code>maps/courses.js</code> – the tools in <code>tools/</code> build terrain, layout and trees from swisstopo and OpenStreetMap.</div></div>`));
  }
  function selectCourse(id) {
    current = id; store.set('course', id);
    const def = SWISSGOLF.courses[id], f = facts(def);
    $('rcName').textContent = def.name; $('rcLoc').textContent = def.location || '';
    $('rcBlurb').textContent = def.blurb || '';
    $('rcThumb').innerHTML = courseSvg(def, 420, 260);
    $('rcFacts').innerHTML = `<span><b>${f.holes}</b> holes</span><span>Par <b>${f.par}</b></span>`;
    renderPlayers();                                    // tee lengths depend on the course
    const sel = $('startHole'); sel.innerHTML = '';
    for (const n of f.nos) sel.appendChild(el(`<option value="${n}">Hole ${n} · Par ${def.holes[n].par}</option>`));
    teeOffLabel();
    pane('paneRound');
  }
  function teeOffLabel() {
    const b = $('teeOff');
    if (engineState === 'loading') { b.disabled = true; b.textContent = 'Loading course…'; }
    else { b.disabled = false; b.textContent = engineState === 'ready' && engineCourse === current ? 'Tee off' : 'Load course & tee off'; }
  }

  /* ---------- loading the engine for a course ---------- */
  function progress(text, f) { show('loadWrap', true); $('loadText').textContent = text; $('loadBar').style.width = (f * 100).toFixed(0) + '%'; }
  async function teeOff() {
    if (!current || engineState === 'loading') return;
    const settings = { tee: roster[0].tee, hole: +$('startHole').value, weather: $('weatherSel').value, wind: $('windSel').value,
      players: roster.map(p => ({ name: (p.name || '').trim().toUpperCase() || 'P' + (roster.indexOf(p) + 1), color: p.color, sex: p.sex, cart: p.cart, tee: p.tee })) };
    saveRoster();
    store.set('weather', settings.weather); store.set('wind', settings.wind);
    startEngine(settings, '&go=1');
  }
  // start a round (or restore a saved game) – loads the 3D engine for the current course first if needed
  async function startEngine(settings, reloadFlag) {
    if (engineState === 'ready') {
      if (engineCourse === current) { hide(); ui.startRound(settings); return; }
      // another course is loaded – start fresh with this one
      location.href = location.pathname + '?course=' + encodeURIComponent(current) + reloadFlag + (/lq/.test(location.search) ? '&lq' : '');
      return;
    }
    pending = settings; engineState = 'loading'; engineCourse = current; teeOffLabel();
    const r = SWISSGOLF.registry.find(x => x.id === current);
    SWISSGOLF.current = current;
    const files = r.files.map(f => r.dir + '/' + f).concat(['models/golfcart/cart_model.js', 'lib/three.min.js', 'js/people.js', 'js/trees3d.js', 'js/clubhouse.js', 'js/range.js', 'js/solids.js', 'js/terrain.js', 'js/course.js', 'js/physics.js', 'js/main.js', 'js/sky.js',
      'js/paths.js', 'js/vegetation.js', 'js/buildings.js', 'js/bunker.js', 'js/effects.js', 'js/greenread.js', 'js/players.js', 'js/cart.js', 'js/ui.js']);
    try {
      for (let i = 0; i < files.length; i++) { progress('Loading ' + files[i].split('/').pop() + '…', 0.3 * i / files.length); await loadScript(files[i]); }
      window.SWISSGOLF_BOOT();
    } catch (e) { progress('Error: ' + e.message, 0); engineState = 'none'; teeOffLabel(); }
  }

  /* ---------- players (1–4): name (6 letters), colour, male / female; number of carts ---------- */
  const COLS = [['red', '#d52b1e'], ['blue', '#1f6fd6'], ['yellow', '#f2c230'], ['purple', '#8a3fd1']];
  let roster = (() => { try { const r = JSON.parse(localStorage.getItem('swissgolf.players')); if (Array.isArray(r) && r.length) return r.slice(0, 4); } catch (e) { } return [{ name: 'PLAYER', color: 'red', sex: 'm', cart: 1 }]; })();
  function saveRoster() { try { localStorage.setItem('swissgolf.players', JSON.stringify(roster)); } catch (e) { } }
  function freeColor() { return COLS.map(c => c[0]).find(c => !roster.some(p => p.color === c)) || 'red'; }
  const inCart = (c, except) => roster.filter(q => q !== except && q.cart === c).length;
  // every player picks a cart (1–4); two players on the same number share it – never more than two
  function fixCarts() {
    roster.forEach((p, i) => { if (!(p.cart >= 1 && p.cart <= 4) || roster.slice(0, i).filter(q => q.cart === p.cart).length >= 2) p.cart = [1, 2, 3, 4].find(c => roster.slice(0, i).filter(q => q.cart === c).length < 2); });
  }
  // tees: men play from white / yellow, women from blue / red (as on the scorecards)
  const TEES = { m: [['white', 'White'], ['yellow', 'Yellow']], f: [['blue', 'Blue'], ['red', 'Red']] };
  const TEE_CSS = { white: '#f5f5f5', yellow: '#fdd835', blue: '#1e88e5', red: '#e53935' };
  function fixTee(p) { const ok = TEES[p.sex === 'f' ? 'f' : 'm'].map(t => t[0]); if (!ok.includes(p.tee)) p.tee = ok[ok.length - 1]; }
  function renderPlayers() {
    fixCarts();
    const tot = current && SWISSGOLF.courses[current] ? facts(SWISSGOLF.courses[current]).tot : {};
    const box = $('playerList'); box.innerHTML = '';
    roster.forEach((p, i) => {
      fixTee(p);
      const teeOpts = TEES[p.sex === 'f' ? 'f' : 'm'].map(([c, l]) => `<option value="${c}" ${c === p.tee ? 'selected' : ''}>${l} tee${tot[c] ? ' · ' + tot[c].toLocaleString('de-CH') + ' m' : ''}</option>`).join('');
      const row = el(`<div class="pl-row">
        <div class="pl-cols">${COLS.map(([id, css]) => `<button class="pl-col ${p.color === id ? 'sel' : ''}" data-c="${id}" style="--c:${css}" title="${id}"></button>`).join('')}</div>
        <input maxlength="6" value="${(p.name || '').replace(/"/g, '')}" placeholder="NAME" spellcheck="false">
        <div class="pl-sex"><button data-s="m" class="${p.sex !== 'f' ? 'sel' : ''}" title="male">♂</button><button data-s="f" class="${p.sex === 'f' ? 'sel' : ''}" title="female">♀</button></div>
        <select class="pl-cart" title="Golf cart – two players on the same cart share it">${[1, 2, 3, 4].map(c => `<option value="${c}" ${c === p.cart ? 'selected' : ''} ${c !== p.cart && inCart(c, p) >= 2 ? 'disabled' : ''}>Cart ${c}${c !== p.cart && inCart(c, p) >= 2 ? ' (full)' : ''}</option>`).join('')}</select>
        <button class="pl-del" title="Remove player" ${roster.length < 2 ? 'disabled' : ''}>−</button>
        <div class="pl-sub"><span class="pl-teedot" style="background:${TEE_CSS[p.tee]}"></span><select class="pl-tee" title="Tee markers this player plays from">${teeOpts}</select></div></div>`);
      row.querySelectorAll('.pl-col').forEach(b => b.onclick = () => {   // colours are unique: swap with whoever had it
        const other = roster.find(q => q !== p && q.color === b.dataset.c); if (other) other.color = p.color;
        p.color = b.dataset.c; saveRoster(); renderPlayers();
      });
      const inp = row.querySelector('input');
      inp.oninput = () => { inp.value = inp.value.replace(/[^A-Za-zÀ-ÿ0-9 .-]/g, '').slice(0, 6); p.name = inp.value.toUpperCase(); saveRoster(); };
      inp.onkeydown = e => e.stopPropagation();
      row.querySelectorAll('.pl-sex button').forEach(b => b.onclick = () => { if (p.sex !== b.dataset.s) { p.sex = b.dataset.s; p.tee = null; } saveRoster(); renderPlayers(); });
      row.querySelector('.pl-tee').onchange = e => { p.tee = e.target.value; saveRoster(); renderPlayers(); };
      row.querySelector('.pl-cart').onchange = e => { p.cart = +e.target.value; saveRoster(); renderPlayers(); };
      row.querySelector('.pl-del').onclick = () => { if (roster.length > 1) { roster.splice(i, 1); saveRoster(); renderPlayers(); } };
      box.appendChild(row);
    });
    $('plAdd').disabled = roster.length >= 4;
    $('plCount').textContent = `(${roster.length})`;
  }
  function addPlayer() {
    if (roster.length >= 4) return;
    roster.push({ name: 'P' + (roster.length + 1), color: freeColor(), sex: 'm', tee: 'yellow', cart: [1, 2, 3, 4].find(c => inCart(c) < 2) }); saveRoster(); renderPlayers();
    const ins = $('playerList').querySelectorAll('input'); ins[ins.length - 1]?.select();
  }

  /* ---------- saved game (one slot in localStorage) ---------- */
  const SAVE_KEY = 'swissgolf.save';
  function readSave() { try { const v = JSON.parse(localStorage.getItem(SAVE_KEY)); return v && v.course ? v : null; } catch (e) { return null; } }
  function writeSave(data) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); updateLoadButton(); return true; } catch (e) { return false; } }
  function deleteSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } updateLoadButton(); }
  function updateLoadButton() { show('mLoad', !!readSave()); }
  function renderSave() {
    const sv = readSave(), box = $('saveSlot');
    if (!sv) { box.innerHTML = '<p class="hint">No saved game yet. During a round, open the menu (Esc) and choose <b>Save game</b>.</p>'; return; }
    const def = SWISSGOLF.courses[sv.course];
    const played = Object.keys(sv.scores || {}), parT = played.reduce((a, n) => a + (def?.holes[n]?.par || 0), 0), strT = played.reduce((a, n) => a + sv.scores[n], 0);
    const rel = d => d === 0 ? 'E' : d > 0 ? '+' + d : String(d);
    const date = new Date(sv.date).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' });
    const TEE = Object.fromEntries(TEE_NAMES);
    box.innerHTML = `<div class="save-card"><div class="sv-thumb">${def ? courseSvg(def, 300, 190) : ''}</div><div>
      <div class="sv-name">${def ? def.name : sv.course}</div>
      <div class="sv-info">${sv.players && sv.players.length > 1 ? sv.players.map(p => `<span style="color:${(COLS.find(c => c[0] === p.color) || COLS[0])[1]}">●</span> ${p.name}`).join(' &nbsp;') + '<br>' : ''}Hole <b>${sv.hole}</b> · ${sv.strokes ? `<b>${sv.strokes}</b> stroke${sv.strokes > 1 ? 's' : ''} played` : 'on the tee'}<br>
      ${played.length ? `<b>${rel(strT - parT)}</b> after ${played.length} hole${played.length > 1 ? 's' : ''}` : 'No holes completed yet'} · ${TEE[sv.tee] || sv.tee} tees<br>
      ${WEATHER_LABELS[sv.weather] || ''}${sv.windLevel ? ' · ' + (WIND_LABELS[sv.windLevel] || '') : ''}<br>Saved ${date}</div></div></div>
      <div class="save-btns"><button id="svContinue" class="big">Continue round</button><button id="svDelete" class="del">Delete</button></div>`;
    $('svContinue').onclick = () => loadGame();
    $('svDelete').onclick = () => { deleteSave(); renderSave(); pane('paneCourses'); };
  }
  function loadGame() {
    const sv = readSave(); if (!sv || !SWISSGOLF.courses[sv.course] || engineState === 'loading') return;
    if (current !== sv.course) selectCourse(sv.course);
    pane('paneLoad');
    startEngine({ tee: sv.tee, hole: sv.hole, weather: sv.weather, wind: sv.windLevel, restore: sv, players: sv.players }, '&load=1');
  }

  function engineReady() {
    engineState = 'ready'; teeOffLabel();
    progress('Ready', 1); setTimeout(() => show('loadWrap', false), 600);
    if (pending) { const s = pending; pending = null; hide(); ui.startRound(s); }
  }
  function hide() { show('menu', false); }
  function showMenu() { show('menu', true); pane(current ? 'paneRound' : 'paneCourses'); teeOffLabel(); renderCourses(); }

  /* ---------- settings ---------- */
  function initSettings() {
    const ws = $('weatherSel'), ws2 = $('weatherSel2');
    for (const s of [ws, ws2]) for (const [k, l] of Object.entries(WEATHER_LABELS)) s.appendChild(el(`<option value="${k}">${l}</option>`));
    ws.value = ws2.value = store.get('weather', 'fair');
    const setW = v => { ws.value = ws2.value = v; store.set('weather', v); if (typeof setWeather === 'function') setWeather(v); };
    ws.onchange = () => setW(ws.value); ws2.onchange = () => setW(ws2.value);
    const wd = $('windSel'), wd2 = $('windSel2');
    for (const s of [wd, wd2]) for (const [k, l] of Object.entries(WIND_LABELS)) s.appendChild(el(`<option value="${k}">${l}</option>`));
    wd.value = wd2.value = store.get('wind', 'medium');
    const setWd = v => { wd.value = wd2.value = v; store.set('wind', v); if (typeof setWindLevel === 'function') setWindLevel(v); };
    wd.onchange = () => setWd(wd.value); wd2.onchange = () => setWd(wd2.value);
    const note = () => { if (engineState !== 'none') $('settingsNote').textContent = 'Graphics changes take effect after reloading the page.'; };
    $('grassSel').value = store.get('grass', '1'); $('grassSel').onchange = () => { store.set('grass', $('grassSel').value); note(); };
    // detailed trees out to this distance (applies at once, also during a round)
    const td = $('treeDist'), tdv = () => { $('treeDistVal').textContent = td.value >= 1000 ? '1 km' : td.value + ' m'; };
    td.value = store.get('treeDist', '500'); tdv();
    td.oninput = () => { tdv(); store.set('treeDist', td.value); if (typeof setTreeDistance === 'function') setTreeDistance(+td.value); };
    $('shadowSel').value = store.get('shadows', '1'); $('shadowSel').onchange = () => { store.set('shadows', $('shadowSel').value); note(); };
    const snd = () => { const m = store.get('muted', '0') === '1'; $('soundToggle').textContent = m ? 'Off' : 'On'; $('soundToggle').classList.toggle('off', m); };
    $('soundToggle').onclick = () => { const m = store.get('muted', '0') !== '1'; store.set('muted', m ? '1' : '0'); if (typeof sfx !== 'undefined') sfx.setMuted(m); snd(); };
    snd();
  }

  async function init() {
    drawBackground(); addEventListener('resize', drawBackground);
    $('controlsBody').innerHTML = CONTROLS_HTML;
    $('mCourses').onclick = () => pane('paneCourses');
    $('mLoad').onclick = () => pane('paneLoad');
    updateLoadButton();
    $('mControls').onclick = () => pane('paneControls');
    $('mSettings').onclick = () => pane('paneSettings');
    $('backToCourses').onclick = () => pane('paneCourses');
    $('teeOff').onclick = teeOff;
    $('plAdd').onclick = addPlayer;
    renderPlayers();
    initSettings();
    addEventListener('keydown', e => { if (!$('menu').classList.contains('hidden') && e.code === 'Enter' && !$('paneRound').classList.contains('hidden')) teeOff(); });
    // course metadata + layouts for the thumbnails
    for (const r of SWISSGOLF.registry) { try { await loadScript(r.dir + '/course.js'); await loadScript(r.dir + '/osm.js'); } catch (e) { console.warn(e); } }
    renderCourses();
    const q = new URLSearchParams(location.search), want = q.get('course') || store.get('course', null);
    if (q.get('load') && readSave()) loadGame();
    else if (want && SWISSGOLF.courses[want] && q.get('course')) { selectCourse(want); if (q.get('go')) teeOff(); }
    else pane('paneCourses');
  }
  return { init, progress, engineReady, showMenu, hide, store, readSave, writeSave };
})();
window.addEventListener('DOMContentLoaded', () => menu.init());
