// SwissGolf – the Unterengstringen driving range: an outdoor tee line (concrete strip, turf mats, clipped hedges)
// and the covered hitting bays (two staggered blocks with green roofs) on the east side of the range, nets, target
// greens with flags, distance boards and old balls lying in the field. Every mat has a ball on a rubber tee:
// walk up and press Space to hit it (practice – no strokes). A new ball appears on the mat after each shot, and
// the balls you hit stay where they come to rest for the rest of the game.
//
// Frame (course metres): a along the tee line (0 = north end, growing to the south-south-west), b across it
// (+ = into the range, westwards). Model local axes: X = a, Y = up, Z = b (right-handed).
const RANGE_A = [77.5, -34.3], RANGE_B = [61.5, -95.8];
let RANGE = null;          // { frame…, mats[], group, … } once built

function rangeFrame() {
  if (COURSE_DEF.terrain !== 'Unterengstringen' || !FEAT.range.length) return null;
  let tx = RANGE_B[0] - RANGE_A[0], ts = RANGE_B[1] - RANGE_A[1]; const L = Math.hypot(tx, ts); tx /= L; ts /= L;
  const rx = ts, rs = -tx;                                   // into the range (west)
  const F = { ox: RANGE_A[0], os: RANGE_A[1], tx, ts, rx, rs };
  F.local = (x, s) => { const dx = x - F.ox, ds = s - F.os; return [dx * tx + ds * ts, dx * rx + ds * rs]; };
  F.course = (a, b) => [F.ox + a * tx + b * rx, F.os + a * ts + b * rs];
  F.boxes = [[-1.5, 63.6, -6.2, 0.6], [63, 86.2, -5.6, 4.6], [84.4, 102.6, -4.6, 13.8]];   // tee strip, block 1, block 2
  F.boxDist = (x, s) => { const [a, b] = F.local(x, s); let d = 1e9;
    for (const [A0, A1, B0, B1] of F.boxes) { const da = Math.max(A0 - a, a - A1, 0), db = Math.max(B0 - b, b - B1, 0); d = Math.min(d, Math.hypot(da, db)); } return d; };
  F.inModel = (x, s, m = 0) => F.boxDist(x, s) <= m;
  // floor: a straight slope along the tee line fitted to the ground (least squares)
  let n = 0, sa = 0, sh = 0, saa = 0, sah = 0;
  for (let a = -1; a <= 102; a += 2) for (let b = -5; b <= 12; b += 2.5) {
    const [x, s] = F.course(a, b); if (!F.inModel(x, s)) continue;
    const h = baseHeight(x, s); n++; sa += a; sh += h; saa += a * a; sah += a * h;
  }
  F.k = (n * sah - sa * sh) / (n * saa - sa * sa || 1); F.y0 = (sh - F.k * sa) / n;
  F.floor = a => F.y0 + F.k * clamp(a, -2, 103);
  return F;
}
let RANGE_PAD = null;
const RANGE_BANK = 5;
function rangePad(x, s, h) {
  const F = RANGE_PAD; if (!F) return h;
  const [a, b] = F.local(x, s); if (a < -8 || a > 110 || b < -13 || b > 20) return h;
  const d = F.boxDist(x, s); if (d > RANGE_BANK) return h;
  return lerp(F.floor(a) - 0.02, h, smoothstep(0.2, RANGE_BANK, d));
}
function prepRange() { RANGE_PAD = RANGE_PAD || rangeFrame(); }
// surface raster: the tee strip and the bays are hard, walkable ground (the OSM building there is the bays)
function rangeRaster() {
  const F = RANGE_PAD = RANGE_PAD || rangeFrame(); if (!F) return;
  for (let r = 0; r < TH; r++) for (let c = 0; c < TW; c++) {
    const x = X0 + (c + 0.5) * RES, s = S1 - (r + 0.5) * RES;
    if (x < 30 || x > 90 || s < -145 || s > -25) continue;
    if (F.inModel(x, s)) { CLS[r * TW + c] = S_PATH; INCOURSE[r * TW + c] = 1; }
  }
}

/* ---------------- model ---------------- */
function rangeTextures() {
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const tx = (c, rep) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
  let seed = 5; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // turf mat: green fibres, darker border
  const m = cv(128, 128), g = m.getContext('2d');
  g.fillStyle = '#2f6d3a'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#3f8a4a'; g.fillRect(8, 8, 112, 112);
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '90,160,95' : '30,80,40'},0.35)`; g.fillRect(8 + r() * 112, 8 + r() * 112, 1, 2); }
  // artificial turf carpet (repeating, 1 m)
  const c2 = cv(128, 128), g2 = c2.getContext('2d');
  g2.fillStyle = '#3a8045'; g2.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2200; i++) { g2.fillStyle = `rgba(${r() < 0.5 ? '95,165,100' : '28,78,38'},0.35)`; g2.fillRect(r() * 128, r() * 128, 1, 2); }
  const turf = tx(c2, true); turf.userData.mu = turf.userData.mv = 1;
  // green (sedum) roof
  const s = cv(256, 256), q = s.getContext('2d');
  q.fillStyle = '#5d5a3a'; q.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) { const h = 60 + r() * 50; q.fillStyle = `hsl(${h},${30 + r() * 30}%,${25 + r() * 25}%)`; q.beginPath(); q.ellipse(r() * 256, r() * 256, 4 + r() * 14, 3 + r() * 10, r() * 3, 0, 7); q.fill(); }
  const sedum = tx(s, true); sedum.repeat.set(1, 1);
  // net: fine dark mesh with transparency
  const n = cv(64, 64), w = n.getContext('2d');
  w.strokeStyle = 'rgba(30,50,40,0.9)'; w.lineWidth = 2;
  for (let i = 0; i <= 64; i += 8) { w.beginPath(); w.moveTo(i, 0); w.lineTo(i, 64); w.stroke(); w.beginPath(); w.moveTo(0, i); w.lineTo(64, i); w.stroke(); }
  const net = tx(n, true);
  sedum.userData.mu = sedum.userData.mv = 6;
  return { mat: tx(m), sedum, net, turf };
}
function boardTexture(text) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#f4f4f2'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#b3261e'; g.fillRect(6, 6, 116, 116);
  g.fillStyle = '#fff'; g.font = '800 58px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function buildRange() {
  const F = RANGE_PAD; if (!F) return;
  const T = rangeTextures();
  const std = o => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85 }, o));
  const M = {
    concrete: std({ color: 0xb8b5ae, roughness: 0.95 }), mat: std({ map: T.mat, roughness: 1 }), turf: std({ map: T.turf, roughness: 1 }), tee: std({ color: 0x222222 }),
    hedge: (typeof CLUBHOUSE !== 'undefined') ? CLUBHOUSE.materials().hedge : std({ color: 0x3d6324 }),
    red: (typeof CLUBHOUSE !== 'undefined') ? CLUBHOUSE.materials().clad : std({ color: 0x9c2a22 }),
    slab: std({ color: 0x8c8f92, roughness: 0.8 }), sedum: std({ map: T.sedum, roughness: 1 }), steel: std({ color: 0x5b5f63, roughness: 0.5, metalness: 0.5 }),
    soffit: std({ color: 0x6d7073, roughness: 0.9 }), dark: std({ color: 0x2a2c2e }), white: std({ color: 0xf2f2f0, roughness: 0.6 }),
    net: new THREE.MeshStandardMaterial({ map: T.net, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1 }),
    machine: std({ color: 0xc62828, roughness: 0.5 })
  };
  // ---- the hitting area (local frame, sheared so the floor follows the fitted slope) ----
  const parts = new Map();
  const add = (mat, geo, m) => { const g = geo.index ? geo.toNonIndexed() : geo; if (m) g.applyMatrix4(m); if (!parts.has(mat)) parts.set(mat, []); parts.get(mat).push(g); };
  const box = (mat, a0, y0, b0, a1, y1, b1) => {
    const W = a1 - a0, H = y1 - y0, D = b1 - b0, g = new THREE.BoxGeometry(W, H, D);
    if (mat.map) { const mu = mat.map.userData.mu || 6, mv = mat.map.userData.mv || 6, uv = g.attributes.uv, dims = [[D, H], [D, H], [W, D], [W, D], [W, H], [W, H]]; for (let i = 0; i < uv.count; i++) { const [du, dv] = dims[i >> 2]; uv.setXY(i, uv.getX(i) * du / mu, uv.getY(i) * dv / mv); } }
    add(mat, g, new THREE.Matrix4().makeTranslation((a0 + a1) / 2, (y0 + y1) / 2, (b0 + b1) / 2));
  };
  // tee strip with mats and hedges
  box(M.concrete, -1.5, -1.5, -6.2, 63.6, 0, 0.6);
  const mats = [];
  for (let i = 0; i < 16; i++) mats.push({ a: 3 + i * 3.8, b: -1.6, cover: false });
  // block 1: five covered bays; block 2: store room at the back, four covered bays in front
  for (let i = 0; i < 5; i++) mats.push({ a: 66.2 + i * 4.3, b: 1.4, cover: true });
  for (let i = 0; i < 4; i++) mats.push({ a: 87.4 + i * 4.2, b: 9.6, cover: true });
  for (const m of mats) {
    m.y0 = m.cover ? 0.065 : 0;
    const g = new THREE.BoxGeometry(1.6, 0.025, 1.6); g.translate(m.a, m.y0 + 0.0125, m.b); add(M.mat, g);
    const tee = new THREE.CylinderGeometry(0.012, 0.016, 0.03, 8); tee.translate(m.a, m.y0 + 0.04, m.b + 0.35); add(M.tee, tee);
    m.ball = [m.a, m.b + 0.35];
  }
  for (let a = 0; a < 62; a += 12.6) box(M.hedge, a, 0, -6.1, Math.min(a + 11.6, 62.5), 1.35, -4.9);
  // block 1
  box(M.concrete, 63, -1.5, -5.6, 86.2, 0.04, 4.6);
  box(M.red, 63, 0, -5.6, 86.2, 3.0, -5.2);                         // back wall
  box(M.red, 63, 0, -5.6, 63.4, 3.0, 3.2);                          // north end wall
  box(M.slab, 62.6, 3.0, -5.9, 86.4, 3.35, 4.9);                    // roof slab
  box(M.sedum, 62.7, 3.35, -5.8, 86.3, 3.45, 4.8);                  // green roof
  box(M.soffit, 62.65, 2.95, -5.85, 86.35, 3.0, 4.85);
  for (let a = 64.2; a <= 86; a += 4.3) box(M.steel, a - 0.1, 0.04, 3.9, a + 0.1, 3.0, 4.1);          // front pillars
  box(M.turf, 63.5, 0.04, -1.2, 86.1, 0.065, 4.0);                    // turf carpet under the covered bays
  // block 2 (further out into the range)
  box(M.concrete, 84.4, -1.5, -4.6, 102.6, 0.04, 13.8);
  box(M.red, 84.4, 0, -4.6, 102.6, 2.9, 4.6);                       // store room (closed)
  box(M.dark, 92, 0.04, 4.6, 94.2, 2.3, 4.66);                       // its door
  box(M.red, 102.2, 0, 4.6, 102.6, 2.9, 12.6);                       // south end wall
  box(M.turf, 84.5, 0.04, 4.7, 102.2, 0.065, 13.4);
  box(M.slab, 84.1, 2.9, -4.9, 102.9, 3.2, 14.4);
  box(M.sedum, 84.2, 3.2, -4.8, 102.8, 3.3, 14.3);
  box(M.soffit, 84.15, 2.85, -4.85, 102.85, 2.9, 14.35);
  for (let a = 85.3; a <= 102.3; a += 4.2) box(M.steel, a - 0.1, 0.04, 13.4, a + 0.1, 2.9, 13.6);

  // shear (floor slope along a) and place
  const group = new THREE.Group();
  const shear = new THREE.Matrix4().set(1, 0, 0, 0, F.k, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);    // y += k·a
  for (const [mat, list] of parts) {
    let n = 0; for (const g of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
    for (const g of list) { g.applyMatrix4(shear); pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; g.dispose(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = !mat.transparent; mesh.receiveShadow = true; group.add(mesh);
  }
  // local X = a → world (tx, 0, −ts); local Z = b → world (rx, 0, −rs)
  group.position.set(F.ox, F.y0, -F.os); group.rotation.y = Math.atan2(F.ts, F.tx);
  world.add(group);

  // ---- nets on poles along both sides near the tee line ----
  const netLine = (p0, p1, H) => {
    const [x0, s0] = F.course(...p0), [x1, s1] = F.course(...p1), L = Math.hypot(x1 - x0, s1 - s0), nP = Math.max(2, Math.ceil(L / 9));
    const pos = [], uv = [];
    for (let i = 0; i <= nP; i++) {
      const t = i / nP, x = lerp(x0, x1, t), s = lerp(s0, s1, t), h = heightAt(x, s);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, H, 6), M.steel); pole.position.set(x, h + H / 2, -s); pole.castShadow = true; world.add(pole);
      pos.push(x, h + 0.2, -s, x, h + H, -s); uv.push(t * L / 1.2, 0, t * L / 1.2, (H - 0.2) / 1.2);
    }
    const idx = []; for (let i = 0; i < nP; i++) { const q = i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const net = new THREE.Mesh(g, M.net); net.renderOrder = 3; world.add(net);
    if (typeof addSolidSegment === 'function') addSolidSegment(x0, -s0, x1, -s1, 0.4, Math.min(heightAt(x0, s0), heightAt(x1, s1)) - 0.5, Math.max(heightAt(x0, s0), heightAt(x1, s1)) + H, 'net');
  };
  // solids of the hitting area (js/solids.js), in the range frame
  if (typeof addSolidBox === 'function') {
    const rot = new THREE.Matrix4().makeRotationY(Math.atan2(F.ts, F.tx));
    const rs = (a0, a1, b0, b1, y0, y1, kind) => addSolidBox(new THREE.Matrix4().makeTranslation(F.ox, F.floor((a0 + a1) / 2), -F.os).multiply(rot), a0, a1, b0, b1, y0, y1, kind);
    for (let a = 0; a < 62; a += 12.6) rs(a, Math.min(a + 11.6, 62.5), -6.1, -4.9, 0, 1.35, 'hedge');
    rs(63, 86.2, -5.6, -5.2, 0, 3, 'wall'); rs(63, 63.4, -5.6, 3.2, 0, 3, 'wall'); rs(62.6, 86.4, -5.9, 4.9, 2.95, 3.45, 'roof');
    for (let a = 64.2; a <= 86; a += 4.3) rs(a - 0.1, a + 0.1, 3.9, 4.1, 0, 3, 'post');
    rs(84.4, 102.6, -4.6, 4.6, 0, 2.9, 'wall'); rs(102.2, 102.6, 4.6, 12.6, 0, 2.9, 'wall'); rs(84.1, 102.9, -4.9, 14.4, 2.85, 3.3, 'roof');
    for (let a = 85.3; a <= 102.3; a += 4.2) rs(a - 0.1, a + 0.1, 13.4, 13.6, 0, 2.9, 'post');
  }
  netLine([0, 0.8], [19.8, 76.5], 11);
  netLine([102.8, 14.5], [99.3, 68.4], 11);
  netLine([99.3, 68.4], [104, 130], 8);

  // ---- target greens with flags, distance boards ----
  const targets = [[24, 45, 5, 0xffd400], [48, 95, 7, 0xd52b1e], [70, 140, 8, 0x1f6fd6], [42, 185, 9, 0xffffff]];
  for (const [a, b, R, col] of targets) {
    const [cx, cs] = F.course(a, b), seg = 40, pos = [], idx = [];
    pos.push(cx, heightAt(cx, cs) + 0.03, -cs);
    for (let i = 0; i <= seg; i++) { const t = i / seg * Math.PI * 2, x = cx + Math.cos(t) * R, s = cs + Math.sin(t) * R; pos.push(x, heightAt(x, s) + 0.03, -s); }
    for (let i = 1; i <= seg; i++) idx.push(0, i + 1, i);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const green = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x6fae45, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 })); green.receiveShadow = true; world.add(green);
    const h = heightAt(cx, cs);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.3, 6), M.white); pole.position.set(cx, h + 1.15, -cs); world.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide })); flag.position.set(cx + 0.25, h + 2.1, -cs); world.add(flag);
  }
  for (const d of [50, 100, 150, 200]) {
    const [x, s] = F.course(52, d), h = heightAt(x, s);
    // board (front = local +z) turned to face the tee line, printed on both sides
    const face = new THREE.MeshStandardMaterial({ map: boardTexture(String(d)) });
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 0.05), [M.white, M.white, M.white, M.white, face, face]);
    board.position.set(x, h + 1.3, -s); board.rotation.y = Math.atan2(F.ts, F.tx) + Math.PI; board.castShadow = true; world.add(board);
    for (const o of [-0.55, 0.55]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 0.06), M.white); p.position.set(x + F.tx * o, h + 0.65, -(s + F.ts * o)); world.add(p); }
  }

  // ---- balls: one on each mat (playable), old balls in the field, and the ones the players hit ----
  const ballGeo = new THREE.SphereGeometry(BR * 1.35, 12, 8), ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  const matBalls = new THREE.InstancedMesh(ballGeo, ballMat, mats.length); matBalls.castShadow = true; matBalls.frustumCulled = false;
  const piles = new THREE.InstancedMesh(ballGeo, ballMat, mats.length * 9); piles.castShadow = true; piles.frustumCulled = false;
  const field = new THREE.InstancedMesh(ballGeo, ballMat, 900); field.count = 0; field.frustumCulled = false; field.castShadow = false;
  world.add(matBalls, piles, field);
  const m4 = new THREE.Matrix4();
  for (const m of mats) {
    const [x, s] = F.course(...m.ball); m.x = x; m.z = -s; m.y = F.floor(m.a) + m.y0 + 0.025 + 0.03 + BR;
    // pile of up to 9 balls on the mat (bottom 2 × 3, then 2, then 1), on the golfer's right, behind the trail foot
    m.pileAt = [];
    const R = BR * 1.35, base = F.floor(m.a) + m.y0 + 0.025 + R;
    const spots = [[-1, 0, 0], [0, 0, 0], [1, 0, 0], [-1, 1, 0], [0, 1, 0], [1, 1, 0], [-0.5, 0.5, 1], [0.5, 0.5, 1], [0, 0.5, 2]];
    for (const [i, j, k] of spots) {
      const [px, ps] = F.course(m.a + 0.75 + i * 2.05 * R, m.b - 0.5 - j * 2.05 * R);   // golfer's right, behind the trail foot – out of the swing
      m.pileAt.push([px, base + k * 1.6 * R, -ps]);
    }
    m.on = false; m.pile = 0;
  }
  let sd = 11; const rr = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 400; i++) {
    const a = 10 + rr() * 95, b = 25 + Math.pow(rr(), 0.8) * 180, [x, s] = F.course(a, b), k = cell(x, s);
    if (k < 0 || CLS[k] !== S_RANGE) continue;
    m4.makeTranslation(x, heightAt(x, s) + BR * 0.6, -s); field.setMatrixAt(field.count++, m4);
  }
  field.instanceMatrix.needsUpdate = true;
  // ball machine outside the north end of the bays, facing the tee line
  const [mx, ms] = F.course(62.35, -3.95), mach = makeBallMachine(M, '10 BALLS');
  mach.position.set(mx, F.floor(62.35), -ms); mach.rotation.y = Math.atan2(F.ts, F.tx); world.add(mach);
  if (typeof addSolidBox === 'function') { mach.updateMatrixWorld(true); addSolidBox(mach.matrixWorld, -0.43, 0.43, -0.3, 0.3, 0, 1.8, 'wall'); }
  const [fx, fs] = F.course(62.35, -2.9);
  RANGE = { F, mats, matBalls, piles, field, group, machine: { x: fx, z: -fs } };
  for (let i = 0; i < mats.length; i++) { setMatBall(i, false); refreshPile(i); }
  buildPracticeGreen(M);
}
// ball machine: red cabinet with a dark front panel, a coin slot, a ball chute and a sign (front = local +z)
function makeBallMachine(M, label) {
  const g = new THREE.Group(), b = (mat, w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  b(M.machine, 0.85, 1.75, 0.6, 0, 0.875, 0);
  b(M.dark, 0.6, 0.55, 0.02, 0, 1.25, 0.305);
  b(M.steel, 0.12, 0.05, 0.03, 0.15, 1.05, 0.31);                       // coin slot
  b(M.steel, 0.3, 0.1, 0.28, 0, 0.55, 0.42);                            // chute
  b(M.dark, 0.26, 0.04, 0.24, 0, 0.6, 0.44);
  b(M.steel, 0.95, 0.05, 0.7, 0, 1.78, 0);
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const q = c.getContext('2d');
  q.fillStyle = '#fff'; q.fillRect(0, 0, 256, 64); q.fillStyle = '#b3261e'; q.font = '800 38px Arial, Helvetica, sans-serif'; q.textAlign = 'center'; q.fillText(label, 128, 46);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.15), new THREE.MeshStandardMaterial({ map: t })); sign.position.set(0, 1.62, 0.305); g.add(sign);
  return g;
}
function setMatBall(i, on) {
  const m = RANGE.mats[i]; m.on = on;
  RANGE.matBalls.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(m.x, m.y, m.z), new THREE.Quaternion(), new THREE.Vector3().setScalar(on ? 1 : 0)));
  RANGE.matBalls.instanceMatrix.needsUpdate = true;
}
function refreshPile(i) {
  const m = RANGE.mats[i], m4 = new THREE.Matrix4();
  for (let k = 0; k < 9; k++) {
    if (k < m.pile) m4.makeTranslation(...m.pileAt[k]); else m4.makeScale(0, 0, 0);
    RANGE.piles.setMatrixAt(i * 9 + k, m4);
  }
  RANGE.piles.instanceMatrix.needsUpdate = true;
}

/* ---------------- practice putting green (in front of the restaurant terrace) ---------------- */
let PUTT = null;
function buildPracticeGreen(M) {
  if (typeof CLUB === 'undefined' || !CLUB) return;
  const holeGreens = new Set(Object.values(COURSE.holes).map(h => h.green));
  let green = null, bd = 1e9;
  for (const g of FEAT.greens) {
    if (holeGreens.has(g)) continue;
    const [a, b] = CLUB.local(g.cx, g.cs); if (a < -5 || a > 95 || b > 0 || b < -70) continue;
    if (-b < bd) { bd = -b; green = g; }
  }
  if (!green) return;
  // nine cups, spread over the green (seeded, so they are the same every game)
  let sd = 77; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const cups = [];
  for (let k = 0; k < 4000 && cups.length < 9; k++) {
    const x = lerp(green.bb[0], green.bb[2], r()), s = lerp(green.bb[1], green.bb[3], r());
    if (polyDist(x, s, green.pts) > -1.4) continue;
    if (cups.some(c => Math.hypot(c.x - x, -c.z - s) < 4)) continue;
    cups.push({ x, z: -s, y: heightAt(x, s) });
  }
  const black = new THREE.MeshBasicMaterial({ color: 0x050505 }), white = new THREE.MeshBasicMaterial({ color: 0xffffff }), flags = [];
  cups.forEach((c, i) => {
    const g = new THREE.Group();
    const hole = new THREE.Mesh(new THREE.CircleGeometry(CUP_R, 24), black); hole.rotation.x = -Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.RingGeometry(CUP_R, CUP_R + 0.01, 24), white); rim.rotation.x = -Math.PI / 2;
    g.add(hole, rim);
    const n = terrainNormal(c.x, c.z); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...n));
    g.position.set(c.x, c.y + 0.004, c.z); world.add(g);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.6, 6), white); pole.position.set(c.x, c.y + 0.3, c.z); world.add(pole);
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 40; const q = cv.getContext('2d');
    q.fillStyle = '#ffd400'; q.fillRect(0, 0, 64, 40); q.fillStyle = '#1b1b1b'; q.font = '800 30px Arial'; q.textAlign = 'center'; q.fillText(String(i + 1), 32, 31);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const fg = new THREE.PlaneGeometry(0.16, 0.1, 8, 2); fg.translate(0.08, 0, 0);
    const flag = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
    flag.position.set(c.x, c.y + 0.55, c.z); flag.userData.base = Float32Array.from(fg.attributes.position.array); world.add(flag); flags.push(flag);
  });
  // ball machine between the terrace and the green, facing the green
  let edge = null, eb = -1e9;
  for (const [x, s] of green.pts) { const b = CLUB.local(x, s)[1]; if (b > eb) { eb = b; edge = [x, s]; } }
  const mx = edge[0] + CLUB.nx * 1.8, ms = edge[1] + CLUB.ns * 1.8, h = heightAt(mx, ms);
  const mach = makeBallMachine(M, 'PUTTING');
  mach.position.set(mx, h, -ms); mach.rotation.y = Math.atan2(-CLUB.nx, CLUB.ns); world.add(mach);   // front faces south (the green)
  if (typeof addSolidBox === 'function') { mach.updateMatrixWorld(true); addSolidBox(mach.matrixWorld, -0.43, 0.43, -0.3, 0.3, 0, 1.8, 'wall'); }
  PUTT = { green, cups, flags, machine: { x: mx - CLUB.nx * 0.8, z: -(ms - CLUB.ns * 0.8) }, meshes: [] };
}
function onPracticeGreen(x, z, m = 0.3) { return PUTT && polyDist(x, -z, PUTT.green.pts) < m; }
function practiceCup(st) {           // the nearest of the nine cups (the physics checks one cup at a time)
  let best = null, bd = 1e9;
  for (const c of PUTT.cups) { const d = Math.hypot(st.x - c.x, st.z - c.z); if (d < bd) { bd = d; best = c; } }
  return best;
}

/* ---------------- practice shots (range mats and the putting green) ---------------- */
// game.carry: null | { kind: 'range', n } (basket) | { kind: 'putt', n: 1 } (one ball in the hand)
// game.pball: the player's practice putting ball lying on the green ({ x, z }) or null
function nearRangeBall() {
  if (!RANGE) return -1;
  let best = -1, bd = ADDRESS_R;
  RANGE.mats.forEach((m, i) => { if (!m.on) return; const d = Math.hypot(game.player.x - m.x, game.player.z - m.z); if (d < bd) { bd = d; best = i; } });
  return best;
}
function nearEmptyMat() {
  if (!RANGE) return -1;
  let best = -1, bd = 1.8;
  RANGE.mats.forEach((m, i) => { if (m.on || m.pile) return; const d = Math.hypot(game.player.x - m.x, game.player.z - m.z); if (d < bd) { bd = d; best = i; } });
  return best;
}
const nearRangeMachine = () => RANGE && Math.hypot(game.player.x - RANGE.machine.x, game.player.z - RANGE.machine.z) < 1.8;
const nearPuttMachine = () => PUTT && Math.hypot(game.player.x - PUTT.machine.x, game.player.z - PUTT.machine.z) < 1.8;
const nearPuttBall = () => game.pball && Math.hypot(game.player.x - game.pball.x, game.player.z - game.pball.z) < ADDRESS_R;
const carryWord = () => game.carry && game.carry.n > 1 ? `the basket (${game.carry.n} balls)` : 'the ball';

const BASKETS = [];        // baskets of range balls put down somewhere: { x, z, n, mesh }
const nearBasket = () => BASKETS.find(k => Math.hypot(game.player.x - k.x, game.player.z - k.z) < 1.6) || null;
function putDownCarry() {           // E with balls in hand: they go on the ground where you stand
  const c = game.carry; game.carry = null;
  const fx = -Math.sin(game.yaw), fz = -Math.cos(game.yaw), x = game.player.x + fx * 0.6, z = game.player.z + fz * 0.6;
  if (c.kind === 'putt') { game.pball = { x, z }; sfx.thud(1.5); showMsg('Ball dropped<small>Space – hit it · E – pick it up</small>', 1.6); return; }
  const mesh = carryMesh('range'); mesh.position.set(x, Hw(x, z) + 0.31, z); scene.add(mesh);
  BASKETS.push({ x, z, n: c.n, mesh }); showMsg(`Basket put down<small>${c.n} balls · E to pick it up again</small>`, 1.6);
}
// the E key while walking: returns true when it did something here (otherwise E goes to the cart)
function practiceInteract() {
  if (nearRangeMachine()) { game.carry = { kind: 'range', n: 10 }; sfx.thock(); showMsg('10 balls<small>walk to a free tee and press E</small>', 1.8); return true; }
  if (nearPuttMachine()) { game.carry = { kind: 'putt', n: 1 }; game.pball = null; sfx.thock(); showMsg('A practice ball<small>press E anywhere to drop it (on the putting green for putting)</small>', 2); return true; }
  const c = game.carry;
  if (c && c.kind === 'range') {
    const i = nearEmptyMat();
    if (i >= 0) { const m = RANGE.mats[i]; m.pile = c.n - 1; setMatBall(i, true); refreshPile(i); game.carry = null; showMsg('Balls on the tee<small>Space – hit</small>', 1.4); return true; }
  }
  if (c) { putDownCarry(); return true; }
  const k = nearBasket();
  if (k) { BASKETS.splice(BASKETS.indexOf(k), 1); scene.remove(k.mesh); game.carry = { kind: 'range', n: k.n }; return true; }
  if (nearPuttBall()) { game.pball = null; game.carry = { kind: 'putt', n: 1 }; return true; }
  return false;
}
// prompt line while walking (null = nothing special here)
function practiceHint() {
  const c = game.carry;
  if (nearRangeMachine()) return '<b>E</b> – get 10 balls';
  if (nearPuttMachine()) return '<b>E</b> – get a practice ball';
  if (c && c.kind === 'range' && nearEmptyMat() >= 0) return `<b>E</b> – put the balls on this tee (${c.n})`;
  if (c && c.kind === 'putt' && onPracticeGreen(game.player.x, game.player.z)) return '<b>E</b> – drop the ball here';
  if (nearRangeBall() >= 0) { const m = RANGE.mats[nearRangeBall()]; return `<b>Space</b> – hit a practice ball (${m.pile + 1} left)` + (c ? ` · <b>E</b> put down ${carryWord()}` : ''); }
  if (nearPuttBall()) return '<b>Space</b> – hit the practice ball · <b>E</b> – pick it up';
  if (!c && nearBasket()) return `<b>E</b> – pick up the basket (${nearBasket().n} balls)`;
  if (c && nearBall()) return `<b>E</b> – put down ${carryWord()} first, then <b>Space</b> for your ball`;
  if (c && nearCart()) return `<b>E</b> – put down ${carryWord()} (then <b>E</b> for the cart)`;
  return null;
}

function startPractice(spec) {
  game.practice = Object.assign({ ball: game.ball.clone(), onTee: game.ballOnTee, prev: game.prev, strokes: game.strokes, peg: teePeg.visible, ballMeshPos: ballMesh.position.clone() }, spec);
  if (spec.kind === 'range') setMatBall(spec.mat, false);
  game.ball.set(spec.x, spec.y, spec.z); game.ballOnTee = spec.kind === 'range';
  ballMesh.position.set(spec.x, spec.y, spec.z); ballMesh.visible = true;
  enterAim();                          // aims at the hole with a fitting club – kept for a ball dropped on the course
  if (spec.dx !== undefined) game.aimYaw = Math.atan2(-spec.dx, -spec.dz);
  if (spec.club !== undefined) game.club = game.recClub = spec.club;
  positionGolferAtBall(); updateHUD();
}
function startRangePractice(i) {
  const m = RANGE.mats[i], F = RANGE.F;
  startPractice({ kind: 'range', mat: i, x: m.x, y: m.y, z: m.z, dx: F.rx, dz: -F.rs, club: game.rangeClub ?? 6 });
  if (game.rangeClub === undefined) showMsg('Driving range<small>practice shot – does not count</small>', 1.4);
}
function startPuttPractice() {           // the dropped practice ball – on the putting green or anywhere else
  const p = game.pball, y = Hw(p.x, p.z) + BR;
  game.pball = null;
  const spec = { kind: 'putt', x: p.x, y, z: p.z, from: { x: p.x, z: p.z } };
  if (onPracticeGreen(p.x, p.z, 1)) { const c = practiceCup(p); Object.assign(spec, { dx: c.x - p.x, dz: c.z - p.z, club: PUTTER }); }
  startPractice(spec);
}
function cancelPractice() {           // stepped away without hitting: the ball stays where it was
  const P = game.practice; if (!P) return;
  if (P.kind === 'range') setMatBall(P.mat, true); else game.pball = P.from;
  restorePractice();
}
function restorePractice() {
  const P = game.practice; if (!P) return;
  game.practice = null;
  game.ball.copy(P.ball); game.ballOnTee = P.onTee; game.prev = P.prev; game.strokes = P.strokes;
  teePeg.visible = P.peg; ballMesh.position.copy(P.ballMeshPos);
  placeBallMesh();
  updateHUD();
}
// a practice shot came to rest (or was holed / lost)
function practiceFinished(ev) {
  const st = game.shot, P = game.practice;
  const from = st.start, total = Math.hypot(st.x - from.x, st.z - from.z), carry = st.carry ? Math.hypot(st.carry.x - from.x, st.carry.z - from.z) : total;
  if (P.kind === 'putt') {
    if (ev.type === 'holed') { sfx.cup(); game.carry = { kind: 'putt', n: 1 }; showMsg('In the hole!<small>the ball is back in your hand – pick a new spot and press E</small>', 3); }
    else if (ev.type === 'water' || ev.type === 'ob') { if (ev.type === 'water') { sfx.splash(); spawnSplash(st.x, st.z, Math.hypot(st.vx, st.vy, st.vz)); } showMsg('Ball lost<small>get a new one at the machine</small>', 2.5); }
    else { game.pball = { x: st.x, z: st.z }; showMsg(CLUBS[game.club].putter ? `Putt rolled ${fmt(total)}<small>Space – again · E – pick up the ball</small>` : `Carry ${fmt(carry)} · Total ${fmt(total)}<small>Space – hit it again · E – pick it up</small>`, 2.5); }
  } else {
    if (ev.type === 'water') { sfx.splash(); spawnSplash(st.x, st.z, Math.hypot(st.vx, st.vy, st.vz)); }
    else if (RANGE.field.count < RANGE.field.instanceMatrix.count) {
      RANGE.field.setMatrixAt(RANGE.field.count++, new THREE.Matrix4().makeTranslation(st.x, Hw(st.x, st.z) + BR * 1.1, st.z));
      RANGE.field.instanceMatrix.needsUpdate = true;
    }
    // the next ball from the pile goes on the tee now that this one has stopped
    const m = RANGE.mats[P.mat];
    if (m.pile > 0) { m.pile--; refreshPile(P.mat); setMatBall(P.mat, true); }
    game.reaim = m.on ? P.mat : -1; game.rangeClub = game.club;      // next ball: straight back into the address position
    const left = m.on ? ` · ${m.pile + 1} left` : ' · no balls left – get more at the machine';
    showMsg(`${ev.type === 'water' ? 'In the water' : CLUBS[game.club].name}<small>Carry ${fmt(carry)} · Total ${fmt(total)}${left}</small>`, 3);
  }
  restorePractice();
  game.mode = 'result'; game.resultT = 0;
}
function practiceLaunched() { }

// carried basket / ball in the left hand, practice putting balls on the green
const _carryGeo = {};
function carryMesh(kind) {
  const g = new THREE.Group();
  const ball = _carryGeo.ball || (_carryGeo.ball = new THREE.SphereGeometry(BR * 1.35, 10, 8));
  const white = _carryGeo.white || (_carryGeo.white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
  if (kind === 'range') {
    const wire = new THREE.MeshStandardMaterial({ color: 0x1f3a2a, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.17, 12, 1, true), wire); body.position.y = -0.22; g.add(body);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), wire); bottom.rotation.x = Math.PI / 2; bottom.position.y = -0.305; g.add(bottom);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.008, 6, 16, Math.PI), wire); handle.position.y = -0.135; g.add(handle);
    for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28, b = new THREE.Mesh(ball, white); b.position.set(Math.cos(a) * 0.06 * (k ? 1 : 0), -0.16, Math.sin(a) * 0.06 * (k ? 1 : 0)); g.add(b); }
  } else { const b = new THREE.Mesh(ball, white); b.position.set(0, -0.085, 0.025); g.add(b); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function updatePracticeVisuals() {
  if (PUTT && camera.position.distanceToSquared(PUTT.cups[0] ? new THREE.Vector3(PUTT.cups[0].x, PUTT.cups[0].y, PUTT.cups[0].z) : camera.position) < 150 * 150) {
    const ws = Math.hypot(wind.x, wind.z), yaw = Math.atan2(-wind.z, wind.x), ph = performance.now() / 1000 * (3 + ws), droop = 1 - Math.min(1, ws / 4);
    for (const f of PUTT.flags) {
      f.rotation.y = ws > 0.2 ? yaw : 0.5;
      const p = f.geometry.attributes.position, b = f.userData.base;
      for (let i = 0; i < p.count; i++) { const x = b[i * 3], y = b[i * 3 + 1], k = x / 0.16; p.setXYZ(i, x * (1 - 0.4 * droop * k), y - droop * x * 0.5, Math.sin(x * 40 - ph) * (0.004 + 0.002 * ws) * k); }
      p.needsUpdate = true;
    }
  }
  const list = PLAYERS.length ? PLAYERS.map(p => p.i === CUR ? { fig: p.fig, carry: game.carry, pball: game.pball, walk: game.mode === 'walk', i: p.i }
    : { fig: p.fig, carry: p.carry, pball: p.pball, walk: !p.inCart && p.pose.mode === 'walk', i: p.i })
    : [{ fig: golfer, carry: game.carry, pball: game.pball, walk: game.mode === 'walk', i: 0 }];
  for (const e of list) {
    const g = e.fig; if (!g || !g.bones) continue;
    const kind = e.carry ? e.carry.kind : null;
    if (g.carryKind !== kind) {
      if (g.carryObj) { g.carryObj.parent.remove(g.carryObj); g.carryObj = null; }
      if (kind) { g.carryObj = carryMesh(kind); g.bones[15].add(g.carryObj); }
      g.carryKind = kind;
    }
    if (g.carryObj) g.carryObj.visible = e.walk && g.root.visible;
    if (PUTT) {
      let m = PUTT.meshes[e.i];
      if (!m) { m = PUTT.meshes[e.i] = new THREE.Mesh(_carryGeo.ball || (_carryGeo.ball = new THREE.SphereGeometry(BR * 1.35, 10, 8)), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })); m.castShadow = true; scene.add(m); }
      m.visible = !!e.pball;
      if (e.pball) m.position.set(e.pball.x, Hw(e.pball.x, e.pball.z) + BR * 1.35, e.pball.z);
    }
  }
}
