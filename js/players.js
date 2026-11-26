// SwissGolf – 1–4 players: figures, balls, beams, switching, cart seats, statistics
'use strict';

const PLAYER_COLORS = [
  { id: 'red', hex: 0xd52b1e, css: '#d52b1e', label: 'Red' },
  { id: 'blue', hex: 0x1f6fd6, css: '#1f6fd6', label: 'Blue' },
  { id: 'yellow', hex: 0xf2c230, css: '#f2c230', label: 'Yellow' },
  { id: 'purple', hex: 0x8a3fd1, css: '#8a3fd1', label: 'Purple' },
];
const colorOf = id => PLAYER_COLORS.find(c => c.id === id) || PLAYER_COLORS[0];
// state that lives in `game` for the active player and is parked in the player object otherwise
const P_SCALARS = ['tee', 'ballOnTee', 'strokes', 'prev', 'yaw', 'stamina', 'exhausted', 'club', 'recClub', 'aimYaw', 'carry', 'pball'];
let PLAYERS = [], CUR = 0;
const activePlayer = () => PLAYERS[CUR];
const multi = () => PLAYERS.length > 1;

function newStats() { return { longest: 0, fwHit: 0, fwTries: 0, putts: 0, penalties: 0, holePutts: 0 }; }
function makePlayer(def, i) {
  const col = colorOf(def.color);
  return {
    i, name: (def.name || `P${i + 1}`).slice(0, 6), color: col.id, col, sex: def.sex === 'f' ? 'f' : 'm',
    tee: def.tee || (def.sex === 'f' ? 'red' : 'yellow'),      // each player tees off from their own markers
    fig: makeGolfer({ shirt: col.hex, sex: def.sex, name: def.name || `P${i + 1}` }),
    pose: { mode: 'walk', phase: 0, theta: 0, cock: 0, speed: 0 },
    ball: new THREE.Vector3(), pos: new THREE.Vector3(), ballMesh: makeBallMesh(), teePeg: makeTeePeg(col.hex), beacon: makeBeacon(col.hex),
    ballOnTee: true, strokes: 0, prev: null, scores: {}, yaw: 0, stamina: 1, exhausted: false, club: 0, recClub: 0, aimYaw: 0,
    holed: false, cart: 0, inCart: false, stats: newStats(),
  };
}
function disposePlayer(p) {
  disposeGolfer(p.fig);
  for (const m of [p.ballMesh, p.teePeg, p.beacon]) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
}

// defs: [{ name, color, sex }], nCarts: number of carts (bags are shared: max two players per cart)
function setupPlayers(defs, nCarts) {
  if (!defs || !defs.length) defs = [{ name: 'Player', color: 'red', sex: 'm' }];
  defs = defs.slice(0, 4);
  // the start-up figure / ball (before any round) are replaced by the players'
  if (!PLAYERS.length) { disposeGolfer(golfer); for (const m of [ballMesh, teePeg, beacon]) scene.remove(m); }
  for (const p of PLAYERS) disposePlayer(p);
  PLAYERS = defs.map(makePlayer); CUR = 0;
  const n = PLAYERS.length;
  // cart numbers chosen by the players (1–4, at most two per cart); old set-ups without: pair players up by nCarts
  let want = defs.map(d => +d.cart || 0);
  if (want.some(c => !c)) {
    nCarts = clamp(nCarts || Math.ceil(n / 2), Math.ceil(n / 2), n);
    const doubles = n - nCarts; want = [];
    for (let c = 1; c <= nCarts; c++) { want.push(c); if (c <= doubles) want.push(c); }
  }
  for (let i = 0; i < n; i++) if (want.slice(0, i).filter(c => c === want[i]).length >= 2) want[i] = [1, 2, 3, 4].find(c => want.filter(w => w === c).length < 2);
  const nums = [...new Set(want)].sort((a, b) => a - b);
  PLAYERS.forEach((p, i) => p.cart = nums.indexOf(want[i]));
  const bags = nums.map((_, c) => PLAYERS.filter(p => p.cart === c).length);
  setupCarts(bags, nums);
  activate(PLAYERS[0]);
}

function storeActive() {
  const p = PLAYERS[CUR]; if (!p) return;
  for (const k of P_SCALARS) p[k] = game[k];
  p.inCart = game.mode === 'cart';
}
function activate(p) {
  CUR = p.i;
  golfer = p.fig; pose = p.pose; ballMesh = p.ballMesh; teePeg = p.teePeg; beacon = p.beacon;
  game.ball = p.ball; game.player = p.pos; game.scores = p.scores;
  for (const k of P_SCALARS) game[k] = p[k];
  CART = CARTS[p.cart] || CARTS[0];
  if (p.inCart) { game.mode = 'cart'; pose.mode = 'sit'; }
  else { game.mode = 'walk'; pose.mode = 'walk'; golfer.root.visible = true; }
  refreshBalls();
}
// a player who is not playing right now just stands there (or sits in the cart)
function parkFigure(p) {
  if (p.inCart) return;                                   // updateOccupants() seats them every frame
  p.pose.mode = 'walk'; p.pose.speed = 0; p.pose.phase = 0;
  const root = p.fig.root;
  if (Math.hypot(root.position.x - p.pos.x, root.position.z - p.pos.z) > 0.01 || !root.visible) {
    root.position.set(p.pos.x, Hw(p.pos.x, p.pos.z), p.pos.z); root.rotation.set(0, p.yaw + Math.PI, 0);
  }
  root.visible = true;
  updateGolfer(p.fig, p.pose, p.club);
}

function placePlayerBall(p) {
  const active = p.i === CUR, onTee = active ? game.ballOnTee : p.ballOnTee;
  const h = Hw(p.ball.x, p.ball.z);
  if (!p.holed) p.ball.y = h + BR + (onTee ? 0.025 : 0);
  p.ballMesh.position.copy(p.ball);
  // before teeing off a ball is still in the player's pocket – only the active player's ball sits on the tee
  p.ballMesh.visible = !p.holed && (active || !onTee);
  p.teePeg.visible = onTee && active;
  p.teePeg.position.set(p.ball.x, h + 0.01, p.ball.z);
}
function refreshBalls() { for (const p of PLAYERS) placePlayerBall(p); }

// light beams over every ball still in play, in the player's colour
function updateBeacons() {
  for (const p of PLAYERS) {
    const active = p.i === CUR, onTee = active ? game.ballOnTee : p.ballOnTee;
    const d = camera.position.distanceTo(p.ball);
    p.beacon.visible = !p.holed && (active || !onTee) && d > 12 && (game.mode === 'walk' || game.mode === 'cart');
    if (!p.beacon.visible) continue;
    p.beacon.position.set(p.ball.x, p.ball.y + 7, p.ball.z);
    const w = Math.max(1, d / 40) * (active ? 1 : 0.75); p.beacon.scale.set(w, 1, w);
    p.beacon.material.opacity = active ? 0.55 : 0.32;
  }
}

/* ---------- switching ---------- */
function switchPlayer(i, auto = false) {
  const p = PLAYERS[i];
  if (!p || i === CUR || game.practice) return;
  if (!auto && ['flight', 'down', 'charge', 'result', 'penalty', 'holed'].includes(game.mode)) { showMsg('Wait until the shot is over', 1.4); return; }
  if (!auto && p.holed) { showMsg(`${p.name} has holed out<small>${p.scores[COURSE.number]} strokes on this hole</small>`, 1.8); return; }
  if (game.mode === 'aim') exitAim();
  if (game.mode === 'cart' && Math.abs(CART.speed) > 0.3) { showMsg('Stop the cart first', 1.2); return; }
  if (game.mode === 'cart') CART.speed = 0;
  storeActive();
  const old = PLAYERS[CUR];
  parkFigure(old);
  activate(p);
  if (!p.inCart) { golfer.root.position.set(p.pos.x, Hw(p.pos.x, p.pos.z), p.pos.z); golfer.root.rotation.set(0, game.yaw + Math.PI, 0); }
  if (document.pointerLockElement) document.exitPointerLock();
  camSnap = true;
  ui.closeBag?.();
  updateHUD();
  const lie = game.ballOnTee ? 'on the tee' : `${fmt(distToPin(game.ball.x, game.ball.z))} to the pin`;
  showMsg(`<span style="color:${p.col.css}">●</span> ${p.name}<small>${p.holed ? 'holed out' : `${ordinal(game.strokes + 1)} shot · ${lie}`}${p.inCart ? ` · in cart ${CARTS[p.cart]?.num}` : ''}</small>`, 1.8);
}
// who plays next: the ball farthest from the hole (balls still on the tee: in order)
function nextToPlay() {
  storeActive();
  const open = PLAYERS.filter(p => !p.holed);
  if (!open.length) return null;
  const onTee = open.filter(p => p.ballOnTee);
  if (onTee.length) return onTee[0];
  return open.reduce((a, b) => distToPin(b.ball.x, b.ball.z) > distToPin(a.ball.x, a.ball.z) ? b : a);
}

/* ---------- new hole ---------- */
function playersStartHole(how) {
  storeActive();
  const any = Object.values(COURSE.teeSpots)[0], byTee = {};
  PLAYERS.forEach(p => {
    const ts = COURSE.teeSpots[p.tee] || any, k = (byTee[p.tee] = (byTee[p.tee] ?? -1) + 1);   // k: place in the queue at this tee
    const yawT = yawTo(ts.x, -ts.s, pin.x, pin.z);
    p.ball.set(ts.x, 0, -ts.s); p.ballOnTee = true; p.strokes = 0; p.prev = null; p.holed = false; p.stats.holePutts = 0;
    if (how === 'tee') {
      // players wait behind their tee markers, side by side
      const back = 2.5 + (k > 0 ? 1.2 : 0), side = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 1.3;
      const fx = -Math.sin(yawT), fz = -Math.cos(yawT), rx = -fz, rz = fx;
      p.pos.set(ts.x - fx * back + rx * side, 0, -ts.s - fz * back + rz * side);
      p.yaw = yawT; p.inCart = false;
    } else if (!p.inCart) p.yaw = yawTo(p.pos.x, p.pos.z, ts.x, -ts.s);
    p.stamina = 1; p.exhausted = false;
  });
  if (how === 'tee') { for (const c of CARTS) c.occ = []; resetCarts(); }
  // honour: best score on the previous hole tees off first
  let first = PLAYERS[0];
  const prev = lastPlayedHole();
  if (prev != null) first = PLAYERS.slice().sort((a, b) => (a.scores[prev] ?? 99) - (b.scores[prev] ?? 99) || a.i - b.i)[0];
  for (const p of PLAYERS) if (p !== first) parkFigure(p);
  activate(first);
  if (!first.inCart) { golfer.root.position.set(game.player.x, Hw(game.player.x, game.player.z), game.player.z); golfer.root.rotation.set(0, game.yaw + Math.PI, 0); }
}
function lastPlayedHole() {
  const idx = HOLE_NOS.indexOf(COURSE.number);
  for (let k = 1; k < HOLE_NOS.length; k++) { const no = HOLE_NOS[(idx - k + HOLE_NOS.length) % HOLE_NOS.length]; if (PLAYERS.every(p => p.scores[no] !== undefined)) return no; }
  return null;
}

/* ---------- cart seats: players in a cart sit in it (and move with it) ---------- */
const _seatM = new THREE.Matrix4(), _seatT = new THREE.Matrix4(), _seatR = new THREE.Matrix4().makeRotationY(Math.PI);
const _sp = new THREE.Vector3(), _sq = new THREE.Quaternion(), _ss = new THREE.Vector3();
function updateOccupants() {
  for (const c of CARTS) {
    if (!c.group || !c.occ) continue;
    const activeHere = game.mode === 'cart' && CART === c && c.occ.includes(CUR);
    let driver = activeHere ? CUR : c.occ[0];
    c.group.updateMatrixWorld();
    for (const idx of c.occ) {
      const p = PLAYERS[idx]; if (!p) continue;
      const isDriver = idx === driver;
      p.pos.set(c.x, 0, c.z);
      if (idx === CUR && activeHere && c.view === 'first') { p.fig.root.visible = false; continue; }
      p.fig.root.visible = true;
      _seatT.makeTranslation(isDriver ? -0.25 : 0.25, -0.12, 0.3);
      _seatM.multiplyMatrices(c.group.matrixWorld, _seatT).multiply(_seatR);
      _seatM.decompose(_sp, _sq, _ss);
      p.fig.root.position.copy(_sp); p.fig.root.quaternion.copy(_sq);
      p.pose.mode = 'sit'; p.pose.drive = isDriver;
      updateGolfer(p.fig, p.pose, p.club);
    }
  }
}

/* ---------- statistics ---------- */
function statsHTML(p) {
  const s = p.stats, played = HOLE_NOS.filter(n => p.scores[n] !== undefined);
  const strokes = played.reduce((a, n) => a + p.scores[n], 0), par = played.reduce((a, n) => a + COURSE_DEF.holes[n].par, 0);
  const rel = strokes - par, relS = !played.length ? '–' : rel === 0 ? 'E' : rel > 0 ? '+' + rel : String(rel);
  const live = p.i === CUR ? game : p, here = p.holed ? `holed out in ${p.scores[COURSE.number]}` : `${live.strokes} stroke${live.strokes === 1 ? '' : 's'} so far · ${live.ballOnTee ? 'on the tee' : fmt(distToPin(p.ball.x, p.ball.z)) + ' to the pin'}`;
  const best = played.length ? played.map(n => p.scores[n] - COURSE_DEF.holes[n].par).sort((a, b) => a - b)[0] : null;
  return `<div class="ps-name" style="--pc:${p.col.css}">${p.name}<span>${p.sex === 'f' ? '♀' : '♂'} · ${p.tee} tee · cart ${CARTS[p.cart]?.num}</span></div>
    <div class="ps-row"><span>Round</span><b>${relS}</b><small>${played.length ? `${strokes} strokes, ${played.length} hole${played.length > 1 ? 's' : ''}` : 'no holes yet'}</small></div>
    <div class="ps-row"><span>Hole ${COURSE.number}</span><b></b><small>${here}</small></div>
    <div class="ps-row"><span>Longest drive</span><b>${s.longest ? fmt(s.longest) : '–'}</b></div>
    <div class="ps-row"><span>Fairways hit</span><b>${s.fwTries ? `${s.fwHit}/${s.fwTries}` : '–'}</b></div>
    <div class="ps-row"><span>Putts</span><b>${s.putts}</b><small>${played.length ? (s.putts / Math.max(1, played.length)).toFixed(1) + ' per hole' : ''}</small></div>
    <div class="ps-row"><span>Penalty strokes</span><b>${s.penalties}</b></div>
    <div class="ps-row"><span>Best hole</span><b>${best === null ? '–' : best === 0 ? 'Par' : best > 0 ? '+' + best : best}</b></div>`;
}

/* ---------- save / load helpers ---------- */
function playersSaveData() {
  storeActive();
  const r2 = v => Math.round(v * 100) / 100;
  return PLAYERS.map(p => ({
    name: p.name, color: p.color, sex: p.sex, tee: p.tee, cart: CARTS[p.cart]?.num, cartIdx: p.cart, inCart: p.inCart, holed: p.holed,
    ball: { x: r2(p.ball.x), z: r2(p.ball.z) }, ballOnTee: p.ballOnTee, strokes: p.strokes, prev: p.prev, scores: p.scores,
    pos: { x: r2(p.pos.x), z: r2(p.pos.z) }, yaw: p.yaw, stats: p.stats,
  }));
}
function playersRestore(list, cur) {
  list.forEach((d, i) => {
    const p = PLAYERS[i]; if (!p) return;
    Object.assign(p, { ballOnTee: !!d.ballOnTee, strokes: d.strokes || 0, prev: d.prev || null, holed: !!d.holed, yaw: d.yaw || 0, inCart: !!d.inCart });
    Object.assign(p.scores, d.scores || {}); Object.assign(p.stats, d.stats || {});
    p.ball.set(d.ball.x, 0, d.ball.z); p.pos.set(d.pos.x, 0, d.pos.z);
    if (p.holed) p.ball.set(pin.x, Hw(pin.x, pin.z) - 0.08, pin.z);
  });
  for (const c of CARTS) c.occ = [];
  for (const p of PLAYERS) if (p.inCart) CARTS[p.cart]?.occ.push(p.i);
  for (const p of PLAYERS) if (p.i !== cur) parkFigure(p);
  activate(PLAYERS[cur] || PLAYERS[0]);
  if (!activePlayer().inCart) { golfer.root.position.set(game.player.x, Hw(game.player.x, game.player.z), game.player.z); golfer.root.rotation.set(0, game.yaw + Math.PI, 0); }
}

/* ---------- collisions: golfers and carts are solid ---------- */
const BODY_R = 0.32;                                  // a golfer's radius
// signed distance from (x, z) to a cart's footprint (oriented box), < 0 = inside
function cartDist(c, x, z) {
  const dx = x - c.x, dz = z - c.z, cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
  const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;           // cart-local (x right, z back)
  const hx = (c.TRACK || 0.95) / 2 + 0.17, hz = c.HALF_LEN || 1.47;
  const qx = Math.abs(lx) - hx, qz = Math.abs(lz) - hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
}
// would a golfer moving from (fx, fz) to (x, z) walk into another golfer or a cart?
// Moves that get you out of an overlap are always allowed, so nobody gets stuck.
function bodyBlocked(x, z, fx, fz) {
  for (const p of PLAYERS) {
    if (p.i === CUR || p.inCart) continue;
    const q = p.fig.root.position, d = Math.hypot(x - q.x, z - q.z);
    if (d < 2 * BODY_R && d < Math.hypot(fx - q.x, fz - q.z)) return true;
  }
  for (const c of CARTS) {
    if (!c.group) continue;
    const d = cartDist(c, x, z);
    if (d < BODY_R && d < cartDist(c, fx, fz)) return true;
  }
  return false;
}
// is a cart at (x, z, yaw) about to run into a golfer standing on the course?
function cartHitsGolfer(c, x, z, yaw) {
  const probe = { x, z, yaw, TRACK: c.TRACK, HALF_LEN: c.HALF_LEN };
  for (const p of PLAYERS) {
    if (p.inCart || (p.i === CUR && game.mode === 'cart')) continue;
    const q = p.fig.root.position;
    if (cartDist(probe, q.x, q.z) < BODY_R && cartDist(probe, q.x, q.z) < cartDist(c, q.x, q.z)) return p;
  }
  return null;
}
