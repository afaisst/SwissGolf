// SwissGolf – user interface: front page, HUD, club bag, power gauge, hole-out card, pause menu, help
'use strict';

const ICON = {
  help: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 16.2a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Zm1.6-6.1c-.8.5-1 .8-1 1.6v.4h-2v-.5c0-1.5.6-2.2 1.6-2.9.8-.5 1.1-.9 1.1-1.5 0-.8-.6-1.3-1.4-1.3-.9 0-1.5.6-1.6 1.5H8.2C8.3 7.3 9.8 6 12.2 6c2.2 0 3.7 1.2 3.7 3.1 0 1.3-.7 2.2-2.3 3Z"/></svg>',
  soundOn: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4Zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4Zm-2.5-8.8v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6Z"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4Zm16.6 3 2.2-2.2-1.4-1.4-2.2 2.2-2.2-2.2-1.4 1.4 2.2 2.2-2.2 2.2 1.4 1.4 2.2-2.2 2.2 2.2 1.4-1.4-2.2-2.2Z"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><path d="M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z"/></svg>',
};

const ui = (() => {
  const $ = id => document.getElementById(id);
  let readyFlag = false, bagOpen = false, lastBag = '';

  function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  function show(id, on = true) { $(id).classList.toggle('hidden', !on); }
  function overlayOpen() { return ['card', 'helpOverlay', 'pause', 'setOverlay'].some(id => !$(id).classList.contains('hidden')); }

  /* ---------- set-up (the front page itself lives in menu.js) ---------- */
  function initMenu() {
    $('helpBody').innerHTML = CONTROLS_HTML;
    $('btnHelp').innerHTML = ICON.help; $('btnMenu').innerHTML = ICON.menu;
    $('btnHelp').onclick = () => toggleHelp();
    $('btnMenu').onclick = () => togglePause();
    $('btnSound').onclick = () => sfx.setMuted(!sfx.muted);
    $('helpClose').onclick = () => toggleHelp(false);
    $('pResume').onclick = () => togglePause(false);
    $('pSave').onclick = () => saveGame();
    $('pRestart').onclick = () => { togglePause(false); confirmRestart(); };
    $('pScore').onclick = () => { togglePause(false); scorecard('Scorecard', false); };
    $('pHelp').onclick = () => { togglePause(false); toggleHelp(true); };
    $('pSettings').onclick = () => { togglePause(false); toggleSettings(true); };
    $('setBack').onclick = () => { toggleSettings(false); togglePause(true); };
    $('pMenu').onclick = () => { togglePause(false); toMainMenu(); };
    soundIcon();
  }
  function soundIcon() { $('btnSound').innerHTML = sfx.muted ? ICON.soundOff : ICON.soundOn; }
  function loading(text, f) { menu.progress(text, 0.3 + 0.7 * f); }
  function ready() { readyFlag = true; menu.engineReady(); }
  function startRound(st) {
    if (!readyFlag) return;
    sfx.init();
    if (st.weather) setWeather(st.weather);
    if (st.wind) setWindLevel(st.wind);
    const sv = st.restore;
    // players and carts (old single-player saves become one player)
    const defs = (sv ? (sv.players || [{ name: 'Player', color: 'red', sex: 'm' }]) : st.players || []).map(d => Object.assign({}, d, { tee: d.tee || (sv && sv.tee) || undefined }));
    setupPlayers(defs, sv ? (sv.nCarts || 1) : st.carts);
    clearSandMarks();                                   // (the tee is per player – set by setupPlayers)
    show('hud', true);
    game.mode = 'walk';
    setHole(st.hole && COURSE.holes[st.hole] ? st.hole : HOLE_NOS[0]);
    startHole(st.tee, 'tee');
    if (sv) restoreGame(sv);
    lastBar = '';
  }
  function newRound() { // same players, scores and statistics cleared
    for (const p of PLAYERS) { for (const k in p.scores) delete p.scores[k]; p.stats = newStats(); }
    goToHole(HOLE_NOS[0], 'tee');
  }

  /* ---------- save / load ---------- */
  function saveGame() {
    if (!['walk', 'cart', 'aim'].includes(game.mode)) { showMsg('Wait until the ball has stopped', 1.6); return; }
    if (game.mode === 'aim') exitAim();
    const r2 = v => Math.round(v * 100) / 100;
    const players = playersSaveData();
    const data = {
      v: 2, course: SWISSGOLF.current, date: Date.now(), tee: game.tee, hole: COURSE.number, cur: CUR, players, nCarts: CARTS.length,
      carts: CARTS.map(c => ({ x: r2(c.x), z: r2(c.z), yaw: c.yaw })),
      scores: players[0].scores, strokes: players[CUR].strokes,       // (for the load card)
      weather: WEATHER.preset, windLevel: WEATHER.wind, wind: { x: r2(wind.base.x), z: r2(wind.base.z) },
    };
    const ok = menu.writeSave(data);
    togglePause(false);
    showMsg(ok ? `Game saved<small>Hole ${data.hole} · continue any time with “Load game” on the start page</small>` : 'Could not save – browser storage is full or blocked', 2.4);
  }
  function restoreGame(sv) {
    if (sv.wind) { wind.base.x = wind.x = sv.wind.x; wind.base.z = wind.z = sv.wind.z; }
    if (sv.players) {
      (sv.carts || []).forEach((c, i) => { const k = CARTS[i]; if (!k) return; const keep = CART; CART = k; k.x = c.x; k.z = c.z; k.yaw = c.yaw; k.speed = 0; placeCart(0); CART = keep; });
      playersRestore(sv.players, sv.cur || 0);
    } else { // version 1: one player
      const p = PLAYERS[0];
      Object.assign(p.scores, sv.scores || {}); p.strokes = sv.strokes || 0; p.prev = sv.prev || null; p.ballOnTee = !!sv.ballOnTee;
      p.ball.set(sv.ball.x, 0, sv.ball.z); p.pos.set(sv.player.x, 0, sv.player.z); p.yaw = sv.yaw || 0;
      if (sv.cart) { CART.x = sv.cart.x; CART.z = sv.cart.z; CART.yaw = sv.cart.yaw; CART.speed = 0; placeCart(0); }
      p.inCart = !!sv.inCart; CARTS[0].occ = p.inCart ? [0] : [];
      playersRestore([], 0); activate(p);
      golfer.root.position.set(game.player.x, Hw(game.player.x, game.player.z), game.player.z); golfer.root.rotation.set(0, game.yaw + Math.PI, 0);
    }
    if (game.mode === 'cart') CART.prevYaw = CART.yaw;
    placeBallMesh(); camSnap = true; buildMapBase(); updateHUD();
    const P = activePlayer();
    showMsg(`Welcome back<small>Hole ${sv.hole}${multi() ? ` · ${P.name} to play` : game.strokes ? ` · ${game.strokes} stroke${game.strokes > 1 ? 's' : ''} so far` : ''}</small>`, 2.6);
  }
  function toMainMenu() {
    if (game.mode === 'cart') exitCart();
    if (document.pointerLockElement) document.exitPointerLock();
    hideCard(); show('hud', false);
    game.mode = 'intro'; golfer.root.visible = true;
    menu.showMenu();
  }

  /* ---------- overlays ---------- */
  function toggleHelp(on) { const h = $('helpOverlay'); on = on ?? h.classList.contains('hidden'); show('helpOverlay', on); if (on && document.pointerLockElement) document.exitPointerLock(); }
  function togglePause(on) {
    const p = $('pause'); on = on ?? p.classList.contains('hidden'); show('pause', on);
    if (on && document.pointerLockElement) document.exitPointerLock();
  }
  // in-game settings: the front page's settings pane is moved into this overlay while it is open (same controls,
  // same handlers: weather, wind and tree distance apply at once)
  let setHome = null;
  function toggleSettings(on) {
    const pane = $('paneSettings'); on = on ?? $('setOverlay').classList.contains('hidden');
    if (on) {
      if (!setHome) setHome = { parent: pane.parentNode, next: pane.nextSibling, hidden: pane.classList.contains('hidden') };
      $('setHolder').appendChild(pane); pane.classList.remove('hidden');
      if (document.pointerLockElement) document.exitPointerLock();
    } else if (setHome) {
      setHome.parent.insertBefore(pane, setHome.next); pane.classList.toggle('hidden', setHome.hidden); setHome = null;
    }
    show('setOverlay', on);
  }
  function hideCard() { show('card', false); }
  function scoreTable() {
    const list = PLAYERS.length ? PLAYERS : [{ name: 'Score', scores: game.scores, col: { css: '#fff' }, i: 0 }];
    const totPar = HOLE_NOS.reduce((a, n) => a + COURSE_DEF.holes[n].par, 0);
    let r1 = '<th>Hole</th>', r2 = '<th>Par</th>';
    for (const n of HOLE_NOS) { r1 += `<th class="${n === COURSE.number ? 'cur' : ''}">${n}</th>`; r2 += `<td>${COURSE_DEF.holes[n].par}</td>`; }
    const rows = list.map(p => {
      let parT = 0, strT = 0, r = `<th class="pl" style="--pc:${p.col.css}"><i></i>${p.name}${p.tee && PLAYERS.length > 1 ? `<u title="${p.tee} tee" style="background:${TEE_COLORS[p.tee] || '#fff'}"></u>` : ''}</th>`;
      for (const n of HOLE_NOS) {
        const par = COURSE_DEF.holes[n].par, st = p.scores[n];
        const cls = st === undefined ? '' : st <= par - 2 ? 'eagle' : st === par - 1 ? 'birdie' : st === par ? 'par' : st === par + 1 ? 'bogey' : 'dbl';
        r += `<td><span class="sc-${cls}">${st ?? ''}</span></td>`;
        if (st !== undefined) { parT += par; strT += st; }
      }
      const played = Object.keys(p.scores).length;
      return { p, html: r + `<td><b>${strT || ''}</b></td><td class="rel">${played ? relPar(strT - parT) : ''}</td>`, diff: strT - parT, played, strT };
    });
    const me = rows[PLAYERS.length ? CUR : 0];
    const html = `<table class="sc"><tr>${r1}<th>Tot</th><th>±</th></tr><tr>${r2}<td><b>${totPar}</b></td><td></td></tr>${rows.map(r => `<tr class="${PLAYERS.length > 1 && r.p.i === CUR ? 'me' : ''}">${r.html}</tr>`).join('')}</table>`;
    return { html, diff: me.diff, played: me.played, rows };
  }
  function relPar(d) { return d === 0 ? 'E' : d > 0 ? '+' + d : String(d); }
  function scorecard(title, holeOut) {
    const t = scoreTable(), next = nextHoleNo();
    $('cardTitle').innerHTML = title;
    let sum;
    if (t.rows.length > 1) {
      const done = t.rows.filter(r => r.played);
      if (!done.length) sum = 'No holes played yet';
      else { const best = Math.min(...done.map(r => r.diff)), lead = done.filter(r => r.diff === best).map(r => r.p.name);
        sum = `${lead.length > 1 ? 'Tied lead' : 'Leader'}: <b>${lead.join(' & ')}</b> (${relPar(best)})`; }
    } else sum = t.played ? `${relPar(t.diff)} after ${t.played} hole${t.played > 1 ? 's' : ''}` : 'No holes played yet';
    $('cardBody').innerHTML = t.html + `<p class="sc-sum">${sum}${multi() ? '' : ` · ${game.tee} tees`}</p>`;
    const btns = $('cardBtns'); btns.innerHTML = '';
    const add = (label, key, fn, cls = '') => { const b = el(`<button class="${cls}">${label}${key ? ` <kbd>${key}</kbd>` : ''}</button>`); b.onclick = fn; btns.appendChild(b); };
    if (holeOut && next) {
      add(`Jump to hole ${next}`, 'Enter', () => goToHole(next, 'tee'), 'primary');
      add(`Walk / drive to hole ${next}`, 'W', () => goToHole(next, 'walk'));
      add('Replay this hole', 'R', () => startHole(game.tee));
    } else if (holeOut) {
      add('Play another round', 'Enter', newRound, 'primary');
      add('Main menu', '', toMainMenu);
    } else add('Close', 'Esc', hideCard, 'primary');
    card.mode = holeOut ? (next ? 'next' : 'done') : 'view';
    show('card', true);
  }
  const card = { mode: '' };
  function penalty(p) {
    const o = reliefOptions(p); card.opts = [];
    const water = p.kind === 'water';
    $('cardTitle').innerHTML = water ? '<div class="ho-name pen">Penalty area</div><div class="ho-sub">Red penalty area (Rule 17) – one penalty stroke</div>'
      : '<div class="ho-name pen">Out of bounds</div><div class="ho-sub">Rule 18.2 – stroke and distance</div>';
    $('cardBody').innerHTML = `<p class="rule-note">${water
      ? 'Your ball is in the water. Choose a relief option – each costs <b>one penalty stroke</b>.'
      : 'Your ball is out of bounds. The Rules require <b>stroke and distance</b> (one penalty stroke, play again from where you hit). Many clubs also allow Model Local Rule E-5 for casual play: drop on the fairway for <b>two</b> penalty strokes.'}</p>`;
    const btns = $('cardBtns'); btns.innerHTML = '';
    const add = (key, label, sub, opt, ruleLabel) => {
      if (!opt) return;
      const b = el(`<button class="${card.opts.length ? '' : 'primary'}"><kbd>${key}</kbd> ${label}<small>${sub}</small></button>`);
      const fn = () => takeRelief(opt, ruleLabel); b.onclick = fn; card.opts.push(fn); btns.appendChild(b);
    };
    add(1, 'Replay from the previous spot', `stroke and distance · +1${o.sd.onTee ? ' · you may tee it up again' : ''}`, o.sd, 'Stroke and distance');
    if (water) {
      add(2, 'Drop back on the line', 'keep the crossing point between you and the hole · +1', o.line, 'Back-on-the-line relief');
      add(3, 'Lateral drop', 'within two club-lengths of where it crossed, not nearer the hole · +1', o.lateral, 'Lateral relief');
    } else add(2, 'Drop on the fairway (Local Rule E-5)', 'near where it went out, not nearer the hole · +2', o.e5, 'Local Rule E-5');
    card.mode = 'penalty';
    show('card', true);
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function holeOut(name) {
    const next = nextHoleNo();
    if (!next) { const t = scoreTable(); if (t.played === HOLE_COUNT) { const key = 'best.' + (SWISSGOLF.current || ''), old = menu.store.get(key, null), mine = relPar(t.diff);
      if (old === null || t.diff < (old === 'E' ? 0 : +old)) menu.store.set(key, mine); } }
    if (multi()) {
      const nm = st => { const d = st - COURSE.par; return st === 1 ? 'Hole in one!' : ({ '-3': 'Albatross', '-2': 'Eagle', '-1': 'Birdie', '0': 'Par', '1': 'Bogey', '2': 'Double bogey', '3': 'Triple bogey' })[d] || (d > 0 ? '+' + d : String(d)); };
      const res = PLAYERS.map(p => `<span class="ho-p" style="--pc:${p.col.css}"><i></i>${p.name} <b>${p.scores[COURSE.number]}</b> ${nm(p.scores[COURSE.number])}</span>`).join('');
      scorecard(`<div class="ho-name">Hole ${COURSE.number} complete</div><div class="ho-sub">Par ${COURSE.par}${next ? '' : ' · Round complete!'}</div><div class="ho-res">${res}</div>`, true);
      return;
    }
    scorecard(`<div class="ho-name">${name}</div><div class="ho-sub">Hole ${COURSE.number} · ${game.strokes} stroke${game.strokes > 1 ? 's' : ''} · Par ${COURSE.par}</div>${next ? '' : '<div class="ho-sub">Round complete!</div>'}`, true);
  }
  // R / pause menu: ask first – a restart sends everybody back to the tee and loses the strokes on this hole
  function confirmRestart() {
    if (document.pointerLockElement) document.exitPointerLock();
    $('cardTitle').innerHTML = `<div class="ho-name">Restart hole ${COURSE.number}?</div>`;
    $('cardBody').innerHTML = `<p class="rule-note">${multi() ? 'All players go' : 'You go'} back to the tee and the strokes played on this hole are lost. The carts are parked at the tee again.</p>`;
    const btns = $('cardBtns'); btns.innerHTML = '';
    const yes = el('<button>Yes, restart <kbd>Enter</kbd></button>'), no = el('<button class="primary">Cancel <kbd>Esc</kbd></button>');
    yes.onclick = () => { hideCard(); startHole(game.tee); }; no.onclick = hideCard;
    btns.append(no, yes);
    card.mode = 'confirm'; card.confirm = yes.onclick;
    show('card', true);
  }
  function holeBanner(len) {
    showMsg(`Hole ${COURSE.number} · Par ${COURSE.par}<small>${len} m from the ${game.tee} tee · wind ${Math.hypot(wind.x, wind.z).toFixed(1)} m/s</small>`, 3.2);
  }
  // keys while overlays are open; returns true when the key was used
  function key(e) {
    if (game.mode === 'intro') return true;
    if (e.code === 'Escape') {
      if (!$('setOverlay').classList.contains('hidden')) { toggleSettings(false); togglePause(true); }
      else if (!$('helpOverlay').classList.contains('hidden')) toggleHelp(false);
      else if (!$('card').classList.contains('hidden') && (card.mode === 'view' || card.mode === 'confirm')) hideCard();
      else if (!$('card').classList.contains('hidden') && card.mode === 'penalty') return true;
      else togglePause();
      return true;
    }
    if (e.code === 'KeyH') { toggleHelp(); return true; }
    if (!$('card').classList.contains('hidden')) {
      if (card.mode === 'penalty') { const m = /^Digit([1-3])$/.exec(e.code); if (m && card.opts[+m[1] - 1]) card.opts[+m[1] - 1](); return true; }
      if (card.mode === 'confirm') { if (e.code === 'Enter') card.confirm(); return true; }
      const next = nextHoleNo();
      if (card.mode === 'next') {
        if (e.code === 'Enter') goToHole(next, 'tee'); else if (e.code === 'KeyW') goToHole(next, 'walk'); else if (e.code === 'KeyR') startHole(game.tee);
      } else if (card.mode === 'done' && e.code === 'Enter') newRound();
      return true;
    }
    return overlayOpen();
  }

  /* ---------- bag ---------- */
  function buildBag(lie) {
    const rec = game.recClub, list = $('bagList');
    const sig = [lie, rec, game.club, bagOpen].join();
    if (sig === lastBag) return; lastBag = sig;
    list.innerHTML = '';
    CLUBS.forEach((c, i) => {
      const carry = c.putter ? '' : fmt(CARRY[i] * SURF[lie].spd);
      const row = el(`<div class="club ${i === game.club ? 'sel' : ''} ${i === rec ? 'rec' : ''}"><span class="cid">${c.id}</span><span class="cname">${c.name}</span><span class="ccarry">${carry}</span>${i === rec ? '<span class="badge">★</span>' : ''}</div>`);
      row.onclick = ev => { ev.stopPropagation(); selectClub(i); };
      list.appendChild(row);
    });
    const sel = list.children[game.club]; if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
  function toggleBag() { bagOpen = !bagOpen; $('bag').classList.toggle('open', bagOpen); if (bagOpen && document.pointerLockElement) document.exitPointerLock(); lastBag = ''; }
  function closeBag() { if (bagOpen) { bagOpen = false; $('bag').classList.remove('open'); lastBag = ''; } }

  /* ---------- power gauge ---------- */
  const ARC_R = 78, ARC_LEN = Math.PI * ARC_R;
  function arcPoint(f, r = ARC_R) { const a = Math.PI * (1 - f); return [100 + Math.cos(a) * r, 96 - Math.sin(a) * r]; }
  function recommendedPower(lie) {
    const b = game.ball, d = distToPin(b.x, b.z), c = CLUBS[game.club];
    if (c.putter) {
      const dh = Hw(pin.x, pin.z) - Hw(b.x, b.z);                         // a bit more uphill, less downhill
      const v = Math.sqrt(2 * SURF[S_GREEN].roll * (d + 0.4) + 2 * (5 / 7) * GRAV * dh * 0.9);
      return clamp(v / c.speed, 0.02, 1);
    }
    let lo = 0.05, hi = 1;
    if (predict(b, game.club, 1, game.aimYaw, lie).carry < d) return 1;
    for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (predict(b, game.club, m, game.aimYaw, lie).carry < d) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  function gauge(full, lie) {
    const c = CLUBS[game.club], p = game.power, charging = game.mode === 'charge' || game.mode === 'down';
    $('gFill').style.strokeDasharray = `${ARC_LEN * p} ${ARC_LEN}`;
    $('gFill').style.stroke = p > 0.92 ? '#ff5a4a' : p > 0.75 ? '#ffd24a' : '#7be07b';
    const rp = recommendedPower(lie), [tx, ty] = arcPoint(rp, ARC_R + 14), [ix, iy] = arcPoint(rp, ARC_R - 14);
    $('gTarget').setAttribute('x1', ix); $('gTarget').setAttribute('y1', iy); $('gTarget').setAttribute('x2', tx); $('gTarget').setAttribute('y2', ty);
    const [lx, ly] = arcPoint(rp, ARC_R + 24); $('gTargetLbl').setAttribute('x', lx); $('gTargetLbl').setAttribute('y', ly);
    $('gTargetLbl').textContent = 'pin';
    $('gPct').textContent = charging ? Math.round(p * 100) + '%' : '';
    $('gClub').textContent = c.name;
    const d = distToPin(game.ball.x, game.ball.z);
    if (charging) $('gInfo').textContent = c.putter ? `rolls ≈ ${fmt(game.predCur ? game.predCur.carry : 0)} · hole ${fmt(d)}` : `carry ≈ ${fmt(game.predCur ? game.predCur.carry : 0)} · pin ${fmt(d)}`;
    else $('gInfo').innerHTML = c.putter ? `${fmt(d)} to the hole · ${slopeInfo()}` : `full carry ${fmt(full.carry)} · pin ${fmt(d)}`;
    $('gHint').textContent = charging ? (p < 0.02 ? 'pull the mouse back…' : 'release to hit') : 'hold left button & pull the mouse back' + (greenReadAvailable() ? ` · G ${GREENREAD.on ? 'hide' : 'show'} slope` : '');
  }

  /* ---------- HUD ---------- */
  function update() {
    if (game.mode === 'intro') return;
    const lie = game.ballOnTee ? S_TEE : lieAt(game.ball.x, game.ball.z);
    const ts = COURSE.teeSpots[game.tee];
    $('hcNo').textContent = COURSE.number; $('hcPar').textContent = 'Par ' + COURSE.par;
    $('hcLen').textContent = ts ? `${ts.len} m · ${game.tee} tee` : '';
    $('stroke').textContent = game.mode === 'holed' ? game.strokes : game.strokes + 1;
    $('toPin').textContent = fmt(distToPin(game.ball.x, game.ball.z));
    $('lie').textContent = SURF[lie].name;
    $('pinInfo').textContent = `${pin.pos}, ${pin.pos === 'front' ? 'red' : pin.pos === 'middle' ? 'yellow' : 'blue'} flag`;
    const t = scoreTable(); $('roundScore').textContent = t.played ? `${relPar(t.diff)} (${t.played})` : '–';
    const aiming = ['aim', 'charge', 'down'].includes(game.mode);
    show('shotPanel', aiming); show('bag', aiming);
    if (aiming) buildBag(lie); else closeBag();
    if (!aiming) $('prompt').style.display = game.mode === 'walk' || game.mode === 'cart' ? 'block' : 'none';
    soundIcon();
    playersBar();
  }

  /* ---------- player chips: click (or 1–4) to switch, hover for statistics ---------- */
  let lastBar = '', tipFor = -1;
  function playersBar() {
    const bar = $('playersBar'); if (!bar || !PLAYERS.length) return;
    storeActive();
    const chip = p => {
      const live = p.i === CUR ? game : p, played = HOLE_NOS.filter(n => p.scores[n] !== undefined && n !== COURSE.number || (p.holed && n === COURSE.number));
      const rel = played.reduce((a, n) => a + p.scores[n] - COURSE_DEF.holes[n].par, 0);
      const now = p.holed ? `✓ ${p.scores[COURSE.number]}` : live.strokes;
      return { sig: [p.i === CUR, now, rel, played.length, p.inCart].join(), html: `<div class="pchip ${p.i === CUR ? 'on' : ''} ${p.holed ? 'done' : ''}" data-i="${p.i}" style="--pc:${p.col.css}">
        ${PLAYERS.length > 1 ? `<kbd>${p.i + 1}</kbd>` : ''}<span class="pdot"></span><span class="pname">${p.name}</span>
        <span class="pnow" title="strokes on this hole">${now}</span><span class="prel">${played.length ? relPar(rel) : 'E'}</span></div>` };
    };
    const chips = PLAYERS.map(chip), sig = chips.map(c => c.sig).join('|') + COURSE.number;
    if (sig === lastBar) return; lastBar = sig;
    bar.innerHTML = chips.map(c => c.html).join('');
    bar.querySelectorAll('.pchip').forEach(el => {
      const i = +el.dataset.i;
      el.onclick = () => switchPlayer(i);
      el.onmouseenter = () => { tipFor = i; const tip = $('playerTip'); tip.innerHTML = statsHTML(PLAYERS[i]); tip.classList.remove('hidden');
        const r = el.getBoundingClientRect(); tip.style.left = Math.max(8, r.left) + 'px'; tip.style.top = (r.bottom + 8) + 'px'; };
      el.onmouseleave = () => { tipFor = -1; $('playerTip').classList.add('hidden'); };
    });
  }
  return { initMenu, toggleSettings, confirmRestart, loading, ready, startRound, penalty, update, gauge, toggleBag, closeBag, hideCard, holeOut, holeBanner, scorecard, toggleHelp, togglePause, key, soundIcon };
})();
function uiKey(e) { return ui.key(e); }
function compassName(a) { // a = heading the wind blows towards (rad, clockwise from north) -> "from NW"
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return 'from ' + names[((Math.round(((a + Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) % 8) + 8) % 8];
}
