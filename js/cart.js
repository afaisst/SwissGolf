// SwissGolf – Golf cart (electric, silent): model, driving physics, first-/third-person camera
'use strict';

// One object per cart; CART is the cart the active player uses (swapped by players.js)
function newCart(idx = 0, bags = 1, num = idx + 1) {
  return {
    idx, bags, num, occ: [], group: null, wheels: [], frontPivots: [], steeringWheel: null,
    x: 0, z: 0, yaw: 0, speed: 0, steer: 0, pitch: 0, roll: 0, y: 0,
    view: 'first', // 'first' | 'third'
    WHEELBASE: 1.65, TRACK: 1.1, MAX_FWD: 7.0, MAX_REV: 2.8, WHEEL_R: 0.24, HALF_LEN: 1.35,
    PARK: { x: -2.5, s: -4, yaw: 0 },
    SEAT: new THREE.Vector3(-0.27, 1.58, 0.32), // driver eye position (cart-local; forward = -Z)
    head: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, pitch: 0, roll: 0, aLon: 0, aLat: 0, t: 0 },
  };
}
let CARTS = [newCart(0, 1)], CART = CARTS[0], CART_MODEL = null;

// ---------- 3D model (models/golfcart/cart_model.js, built by tools/build_cart.py) ----------
// "Golf Cart (various)" by Ian Gibb, CC-BY-4.0 – the variant with one golf bag
async function loadCartModel() {
  const m = SWISSGOLF.models && SWISSGOLF.models.golfcart;
  if (!m || typeof DecompressionStream === 'undefined') return;
  try {
    const raw = await inflateB64(m.data), buf = raw instanceof ArrayBuffer ? raw : raw.buffer;
    let nv = 0, nt = 0; for (const p of m.parts) { nv += p.nv; nt += p.nt; }
    const pos = new Uint16Array(buf, 0, nv * 3), idx = new Uint16Array(buf, nv * 6, nt * 3), nrm = new Int8Array(buf, nv * 6 + nt * 6, nv * 3);
    let ov = 0, ot = 0;
    const parts = m.parts.map(p => {
      const P = new Float32Array(p.nv * 3), N = new Float32Array(p.nv * 3);
      for (let i = 0; i < p.nv * 3; i++) { const k = i % 3; P[i] = m.lo[k] + pos[ov * 3 + i] / 65535 * m.span[k]; N[i] = nrm[ov * 3 + i] / 127; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      geo.setIndex(new THREE.BufferAttribute(idx.slice(ot * 3, (ot + p.nt) * 3), 1));
      geo.computeBoundingSphere();
      ov += p.nv; ot += p.nt;
      return Object.assign({ geo }, p);
    });
    CART_MODEL = Object.assign({}, m, { parts, data: null });
  } catch (e) { console.warn('golf cart model failed to load – using the simple cart', e); }
}

function buildCart() { setupCarts([1]); }
// bags[i] = number of golf bags on cart i (1 or 2 – two players share a cart)
function setupCarts(bags, nums) {
  for (const c of CARTS) if (c.group) { scene.remove(c.group); c.group.traverse(o => { if (o.isMesh && o.userData.own) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); } }); }
  CARTS = bags.map((b, i) => newCart(i, b, nums ? nums[i] : i + 1));
  for (const c of CARTS) { CART = c; if (CART_MODEL) buildCartModel(); else buildCartSimple(); addCartNumbers(c); scene.add(c.group); }
  CART = CARTS[0];
  resetCarts();
}

function buildCartModel() {
  const m = CART_MODEL, g = new THREE.Group();
  const mats = {};
  // golf bag in white / black (the model ships it in pink / magenta / green)
  const BAG_COLOURS = { 'colour 2': [0.78, 0.78, 0.76], 'colour 3': [0.012, 0.012, 0.012], 'Bag Colour': [0.012, 0.012, 0.012], golf_bag: [0.42, 0.42, 0.42] };
  for (const p of m.parts) if (BAG_COLOURS[p.name]) p.color = BAG_COLOURS[p.name];
  const SWISS_RED = new THREE.Color(0xd52b1e).convertSRGBToLinear();   // painted body in Swiss red
  for (const p of m.parts) if (p.name === 'Material') p.color = [SWISS_RED.r, SWISS_RED.g, SWISS_RED.b];
  const matFor = p => {
    const key = p.color.join() + '|' + p.rough;
    if (!mats[key]) {
      const c = p.color.map(v => Math.max(v, 0.012)); // nothing is pitch black in daylight
      mats[key] = new THREE.MeshStandardMaterial({ roughness: p.name === 'Tire' ? 0.92 : Math.min(p.rough, 0.85), metalness: p.name.includes('Metal') || p.name.includes('metal') ? 0.6 : 0, side: THREE.DoubleSide });
      mats[key].color.setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace);
      if (p.name === 'Material') { mats[key].roughness = 0.35; CART.paintMat = mats[key]; } // glossy painted body
    }
    return mats[key];
  };
  const mesh = p => { const o = new THREE.Mesh(p.geo, matFor(p)); o.castShadow = true; o.receiveShadow = true; return o; };
  // wheels: pivot (steering, front only) -> spinning group
  const wg = m.wheels.map(w => {
    const pivot = new THREE.Group(); pivot.position.fromArray(w.c); g.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin);
    CART.wheels.push(spin); if (w.front) CART.frontPivots.push(pivot);
    return spin;
  });
  // steering wheel: pivot whose local Y is the steering column axis
  const st = m.steer, sw = new THREE.Group(); sw.position.fromArray(st.c);
  sw.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().fromArray(st.axis).normalize());
  const swSpin = new THREE.Group(); sw.add(swSpin); g.add(sw);
  const inv = sw.quaternion.clone().invert();
  const bagGroup = 'bag' + Math.min(2, Math.max(1, CART.bags));
  for (const p of m.parts) {
    if (p.group === 'body' || p.group === bagGroup) g.add(mesh(p));
    else if (p.group.startsWith('bag')) continue;
    else if (p.group === 'steer') { if (!p.steerReady) { p.geo.applyQuaternion(inv); p.steerReady = true; } swSpin.add(mesh(p)); }
    else wg[+p.group.slice(5)].add(mesh(p));
  }
  CART.steeringWheel = swSpin;
  addSwissCross(g);
  // windscreen (the model has a frame but no glass)
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 0.72), new THREE.MeshStandardMaterial({ color: 0xd8ecff, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false }));
  ws.position.set(0, m.wsY || 1.25, m.wsZ || -0.66); ws.rotation.x = 0.06; ws.renderOrder = 2; g.add(ws);
  CART.windscreen = ws;
  const fw = m.wheels.filter(w => w.front), bw = m.wheels.filter(w => !w.front);
  CART.WHEELBASE = Math.abs(bw[0].c[2] - fw[0].c[2]);
  CART.TRACK = Math.abs(fw[1].c[0] - fw[0].c[0]);
  CART.WHEEL_R = m.wheelRadius;
  CART.HALF_LEN = m.size[2] / 2;
  CART.SEAT.set(st.c[0], 1.36, 0.38);
  CART.group = g;
}

// white Swiss cross on the front cowl: find the cowl surface by casting a ray at it from the front
function addSwissCross(g) {
  g.updateMatrixWorld(true);
  const body = g.children.filter(o => o.isMesh && o.material === CART.paintMat);
  const ray = new THREE.Raycaster();
  const hits = [];                                           // scan up the nose; keep hits on the forward-facing panel
  for (let y = 0.3; y <= 0.9; y += 0.01) {
    ray.set(new THREE.Vector3(0, y, -4), new THREE.Vector3(0, 0, 1));
    const h = ray.intersectObjects(body, false)[0];
    if (!h || !h.face) continue;
    const nn = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    if (Math.abs(nn.z) > 0.6) hits.push({ h, n: nn.z > 0 ? nn.negate() : nn });
  }
  if (!hits.length) return;
  const zFront = Math.min(...hits.map(o => o.h.point.z));
  const front = hits.filter(o => o.h.point.z < zFront + 0.08);   // the nose panel, not the body behind the bumper
  const { h: hit, n } = front[front.length >> 1];           // middle of the front panel
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x3a3a3a, roughness: 0.35, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const cross = new THREE.Group();
  const L = 0.16, a = L * 6 / 20;                           // Swiss cross: arms 6 wide, 20 across
  for (const [w, h] of [[L, a], [a, L]]) cross.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat));
  cross.position.copy(hit.point).addScaledVector(n, 0.006); cross.position.y += 0.012;
  cross.lookAt(cross.position.clone().add(n));               // plane faces along the surface normal
  g.add(cross);
  CART.swissCross = cross;
}

// cart numbers: white discs with a black number – one on each side, two on the back next to the bag holder
function numberTexture(n) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill();
  g.lineWidth = 6; g.strokeStyle = '#1b1b1b'; g.beginPath(); g.arc(64, 64, 54, 0, 7); g.stroke();
  g.fillStyle = '#1b1b1b'; g.font = '900 82px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function addCartNumbers(c) {
  const g = c.group; if (!g || !c.paintMat) return;
  g.updateMatrixWorld(true);
  const body = g.children.filter(o => o.isMesh && o.material === c.paintMat), ray = new THREE.Raycaster();
  const mat = new THREE.MeshStandardMaterial({ map: numberTexture(c.num), transparent: true, roughness: 0.4, emissive: 0x2a2a2a, emissiveMap: null, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  // cast rays along `dir` from points along y; keep hits on panels facing back along the ray, on the outermost surface
  const scan = (ox, oz, dir, axis) => {
    const hits = [];
    for (let y = 0.3; y <= 0.95; y += 0.01) {
      ray.set(new THREE.Vector3(ox, y, oz), dir);
      const h = ray.intersectObjects(body, false)[0]; if (!h || !h.face) continue;
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
      if (n.dot(dir) < -0.6) hits.push({ h, n });
    }
    if (!hits.length) return null;
    const outer = axis === 'x' ? (dir.x < 0 ? Math.max(...hits.map(o => o.h.point.x)) : Math.min(...hits.map(o => o.h.point.x))) : Math.max(...hits.map(o => o.h.point.z));
    const ok = hits.filter(o => Math.abs((axis === 'x' ? o.h.point.x : o.h.point.z) - outer) < 0.06);
    return ok[ok.length >> 1];
  };
  const put = (hit, size) => {
    if (!hit) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat); m.userData.own = true;
    m.position.copy(hit.h.point).addScaledVector(hit.n, 0.006);
    m.lookAt(m.position.clone().add(hit.n)); g.add(m);
  };
  put(scan(4, 0.62, new THREE.Vector3(-1, 0, 0), 'x'), 0.2);      // right side, rear body
  put(scan(-4, 0.62, new THREE.Vector3(1, 0, 0), 'x'), 0.2);      // left side
  put(scan(0.36, 4, new THREE.Vector3(0, 0, -1), 'z'), 0.14);     // back, right of the bag holder
  put(scan(-0.36, 4, new THREE.Vector3(0, 0, -1), 'z'), 0.14);    // back, left
}

function buildCartSimple() {
  const g = new THREE.Group();
  const M = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.55 }, o));
  const white = M(0xf4f4f2), red = M(0xc8102e), dark = M(0x222428, { roughness: 0.8 }), seatM = M(0xd8c7a4, { roughness: 0.9 }),
    metal = M(0x9aa0a6, { metalness: 0.8, roughness: 0.3 }), tire = M(0x151515, { roughness: 0.95 });
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  // chassis & body
  box(1.2, 0.18, 2.35, dark, 0, 0.36, 0);            // floor pan
  box(1.22, 0.32, 0.75, white, 0, 0.6, 0.78);         // rear body under the seat
  box(1.18, 0.5, 0.62, red, 0, 0.66, -0.9);           // front cowl (Swiss red)
  box(1.0, 0.22, 0.4, white, 0, 0.98, -0.95);         // dashboard
  { // white cross on the cowl
    const wm = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const c1 = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.07), wm), c2 = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.22), wm);
    for (const c of [c1, c2]) { c.position.set(0, 0.7, -1.215); c.rotation.y = Math.PI; g.add(c); }
  }
  box(1.02, 0.14, 0.5, seatM, 0, 0.84, 0.32);         // seat cushion
  box(1.02, 0.5, 0.1, seatM, 0, 1.12, 0.6);           // backrest
  box(1.22, 0.08, 0.5, metal, 0, 0.8, 1.32);          // bag rack
  // roof on four posts
  for (const [x, z] of [[-0.56, -0.62], [0.56, -0.62], [-0.56, 0.62], [0.56, 0.62]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.3, 8), metal); p.position.set(x, 1.55, z); p.castShadow = true; g.add(p);
  }
  box(1.3, 0.06, 1.75, white, 0, 2.21, 0.05);
  // windshield
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.95), new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.18, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }));
  ws.position.set(0, 1.62, -0.66); ws.rotation.x = 0.08; g.add(ws);
  // steering column + wheel (driver on the left)
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.43, 8), dark); col.position.set(-0.27, 1.11, -0.56); col.rotation.x = 0.72; g.add(col);
  const sw = new THREE.Group(); sw.position.set(-0.27, 1.27, -0.42); sw.rotation.x = 0.95; g.add(sw); // wheel faces the driver; it spins about its local Y axis
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 8, 24), dark); rim.rotation.x = Math.PI / 2; sw.add(rim);
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.015, 0.03), dark); sw.add(spoke);
  CART.steeringWheel = sw;
  // golf bag with clubs on the back
  const bag = new THREE.Group(); bag.position.set(0, 0.85, 1.38); bag.rotation.x = -0.25; g.add(bag);
  const bagBody = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.85, 14), red); bagBody.position.y = 0.42; bagBody.castShadow = true; bag.add(bagBody);
  for (let i = 0; i < 7; i++) {
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.35, 5), metal); const a = i / 7 * Math.PI * 2;
    sh.position.set(Math.cos(a) * 0.07, 0.98, Math.sin(a) * 0.07); bag.add(sh);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(i < 3 ? 0.05 : 0.03, 8, 6), i < 3 ? dark : metal); hd.position.set(Math.cos(a) * 0.07, 1.17, Math.sin(a) * 0.07); bag.add(hd);
  }
  // wheels
  const wg = new THREE.CylinderGeometry(0.24, 0.24, 0.17, 18); wg.rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(0.12, 0.12, 0.18, 12); hub.rotateZ(Math.PI / 2);
  for (const [x, z, front] of [[-0.6, -0.82, 1], [0.6, -0.82, 1], [-0.6, 0.83, 0], [0.6, 0.83, 0]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.24, z); g.add(pivot);
    const w = new THREE.Group(); pivot.add(w);
    const t = new THREE.Mesh(wg, tire); t.castShadow = true; w.add(t);
    const h = new THREE.Mesh(hub, metal); w.add(h);
    CART.wheels.push(w); if (front) CART.frontPivots.push(pivot);
  }
  CART.group = g;
}

function findCartPark(tee = 'white') {
  // park on a cart path / track near the white tee, facing along it; widen the search if there is none,
  // and as a last resort park on the grass beside the tee – the cart must always be somewhere sensible
  const t = COURSE.teeSpots[tee] || COURSE.teeSpots.white || Object.values(COURSE.teeSpots)[0]; if (!t) return;
  const ok = (x, s) => x > X0 + 6 && x < X1 - 6 && s > S0 + 6 && s < S1 - 6 && teeDist(x, s) > 2 && greenDist(x, s) > 4 && waterDist(x, s) > 2.5
    && !buildingAt(x, s) && !cartBlocked(x, -s, CART, true) && !isRail(x, s);
  const yawH = yawTo(t.x, -t.s, pin ? pin.x : t.x, pin ? pin.z : -t.s - 1);
  const hx = -Math.sin(yawH), hs = Math.cos(yawH);                  // direction tee -> hole (course frame)
  // where is a spot relative to the line of play? beside the tee is best: visible from the tee, never in the way
  const where = (x, s, d) => { const c = ((x - t.x) * hx + (s - t.s) * hs) / Math.max(d, 1e-6); return c > 0.82 ? 25 : c < -0.5 ? 12 : c < 0 ? 6 : 0; };   // ahead-beside (35–90°) is best: in view, not in the way
  const cands = (lo, hi, grass) => {
    const out = [];
    if (!grass) {
      for (const f of FEAT.paths.concat(FEAT.roads)) for (let i = 0; i < f.pts.length - 1; i++) {
        const a = f.pts[i], b = f.pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let d = 0; d <= L; d += 1) {
          const x = lerp(a[0], b[0], d / L), s = lerp(a[1], b[1], d / L), dist = Math.hypot(x - t.x, s - t.s);
          if (dist < lo || dist > hi || !ok(x, s)) continue;
          let dx = b[0] - a[0], ds = b[1] - a[1]; if (dx * hx + ds * hs < 0) { dx = -dx; ds = -ds; }   // point it towards the hole
          out.push({ x, s, yaw: Math.atan2(-dx, ds), score: dist + where(x, s, dist) });
        }
      }
    } else {
      for (let r = lo; r <= hi; r += 2) for (let a = 0; a < 6.283; a += 0.25) {
        const x = t.x + Math.cos(a) * r, s = t.s + Math.sin(a) * r;
        if (!ok(x, s) || isOB(x, s) || bunkerDist(x, s) < 2 || fairwayDist(x, s) < 1 || walkBlockedByTree(x, -s)) continue;
        out.push({ x, s, yaw: yawH, score: r * 1.4 + where(x, s, r) });
      }
    }
    return out;
  };
  const best = list => list.reduce((m, c) => !m || c.score < m.score ? c : m, null);
  // close to the tee first (a path within 20 m or the grass beside the tee), else further away
  CART.PARK = best(cands(6, 20, false).concat(cands(7, 16, true))) || best(cands(20, 70, false).concat(cands(16, 40, true))) || CART.PARK;
}
function isRail(x, s) { for (const f of FEAT.rails) if (lineDist(x, s, f.pts) < (typeof RAIL_OB === 'number' ? RAIL_OB : 3) + 1.5) return true; return false; }
function resetCart() { resetCarts(); }
// all carts park in a row on the path next to the tee (the first one closest)
// carts park next to the tee their players play from; carts going to the same tee line up behind each other
function resetCarts() {
  const keep = CART;
  for (const c of CARTS) { c.x = 1e6; c.z = 1e6; }        // not parked yet
  const teeOf = c => (typeof PLAYERS !== 'undefined' && PLAYERS.find(p => p.cart === c.idx)?.tee) || 'white';
  const groups = {};
  for (const c of CARTS) (groups[teeOf(c)] = groups[teeOf(c)] || []).push(c);
  for (const [tee, list] of Object.entries(groups)) {
    const c0 = list[0]; CART = c0;
    findCartPark(tee);
    const P = c0.PARK, fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = -fz, rz = fx;
    list.forEach((c, i) => {
      CART = c;
      let x = P.x, z = -P.s;
      if (i) { // behind the first cart; if that spot is blocked, beside it
        const tries = [[-3.4 * i, 0], [-3.4 * i, 1.6], [-3.4 * i, -1.6], [3.4 * i, 0], [0, 1.7 * i], [0, -1.7 * i]];
        for (const [a, b] of tries) { const tx = P.x + fx * a + rx * b, tz = -P.s + fz * a + rz * b; if (!cartBlocked(tx, tz, c, true)) { x = tx; z = tz; break; } }
      }
      c.x = x; c.z = z; c.yaw = P.yaw; c.speed = 0; c.steer = 0; c.pitch = c.roll = 0; c.y = 0;
      placeCart(0);
    });
  }
  CART = keep;
}

function cartHeightAt(x, z) {
  let h = Hw(x, z);
  const br = onBridge(x, -z); if (br) h = Math.max(h, br.h);
  return h;
}

const BUMPINESS = { [S_ROUGH]: 1, [S_DEEP]: 1, [S_FOREST]: 1, [S_SEMI]: 0.55, [S_FAIR]: 0.18, [S_RANGE]: 0.25, [S_FRINGE]: 0.15, [S_TEE]: 0.15, [S_GREEN]: 0.1, [S_PATH]: 0.12, [S_ROAD]: 0.06, [S_BUNKER]: 0.6 };
function surfaceBumpiness(x, z) { const b = BUMPINESS[Sw(x, z)]; return b ?? 0.5; }
function placeCart(dt) {
  const fx = -Math.sin(CART.yaw), fz = -Math.cos(CART.yaw), rx = -fz, rz = fx; // forward and right
  const hb = CART.WHEELBASE / 2, ht = CART.TRACK / 2;
  const hF = cartHeightAt(CART.x + fx * hb, CART.z + fz * hb), hB = cartHeightAt(CART.x - fx * hb, CART.z - fz * hb);
  const hR = cartHeightAt(CART.x + rx * ht, CART.z + rz * ht), hL = cartHeightAt(CART.x - rx * ht, CART.z - rz * ht);
  // how bumpy the ground is: rough = full bumps, fairway and paths ride smoothly (suspension soaks up the small stuff)
  const R = CART.ride = dt > 0 ? lerp(CART.ride ?? 1, surfaceBumpiness(CART.x, CART.z), 1 - Math.exp(-dt * 4)) : surfaceBumpiness(CART.x, CART.z);
  const k = dt > 0 ? 1 - Math.exp(-dt * lerp(2.5, 10, R)) : 1, ky = dt > 0 ? 1 - Math.exp(-dt * lerp(5, 30, R)) : 1;
  CART.pitch = lerp(CART.pitch, Math.atan2(hF - hB, CART.WHEELBASE), k);
  CART.roll = lerp(CART.roll, Math.atan2(hR - hL, CART.TRACK), k);
  const yT = (hF + hB + hR + hL) / 4;
  CART.y = clamp(lerp(CART.y || yT, yT, ky), yT - 0.03, yT + 0.03); // filter small bumps, but never sink into a slope
  CART.group.position.set(CART.x, CART.y, CART.z);
  CART.group.rotation.set(CART.pitch, CART.yaw, CART.roll, 'YXZ');
}

function cartBlocked(x, z, self = CART, park = false) {
  for (const o of CARTS) {
    if (o === self || !o.group) continue;
    if (park ? Math.hypot(x - o.x, z - o.z) < 2.6 : cartDist(o, x, z) < 0.15) return 'cart';   // driving: bumper / centre must stay out of the other cart
  }
  if (x < X0 + 3 || x > X1 - 3 || -z < S0 + 3 || -z > S1 - 3) return 'edge';
  const s = -z;
  if (Sw(x, z) === S_WATER && !onBridge(x, s)) return 'water';
  for (const t of treesNear(x, z)) if (Math.hypot(x - t.x, z - t.z) < 0.9) return 'tree';
  if (buildingAt(x, s)) return 'building';
  if (typeof solidAt === 'function' && solidAt(x, z, 0.7)) return 'building';
  const gd = greenDist(x, s);
  if (gd < 1.5) return 'green';
  if (bunkerDist(x, s) < 0.3) return 'bunker';
  if (teeDist(x, s) < 0) return 'tee';
  return null;
}
const CART_RULE_MSG = { green: 'Carts are not allowed on the green', bunker: 'Keep the cart out of the bunker', tee: 'Please keep carts off the tee box', water: 'That would end in a splash…' };

function updateCart(dt) {
  const up = keys.ArrowUp, down = keys.ArrowDown, hand = keys.Space;
  let v = CART.speed;
  if (up) v += (v < 0 ? 5 : 2.4 * (1 - Math.max(0, v) / CART.MAX_FWD * 0.6)) * dt;
  else if (down) v -= (v > 0.1 ? 5 : 1.6) * dt;
  else v -= Math.sign(v) * Math.min(Math.abs(v), 0.9 * dt);
  if (hand) v -= Math.sign(v) * Math.min(Math.abs(v), 7 * dt);
  v -= GRAV * Math.sin(CART.pitch) * 0.35 * dt; // hills slow you down / speed you up
  v = clamp(v, -CART.MAX_REV, CART.MAX_FWD);
  // steering (less lock at speed)
  const target = ((keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0)) * lerp(0.55, 0.28, clamp(Math.abs(v) / CART.MAX_FWD, 0, 1));
  CART.steer += clamp(target - CART.steer, -2.2 * dt, 2.2 * dt);
  const yaw = CART.yaw + v / CART.WHEELBASE * Math.tan(CART.steer) * dt;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const nx = CART.x + fx * v * dt, nz = CART.z + fz * v * dt;
  const bump = Math.sign(v) * CART.HALF_LEN; // check the bumper
  const hitP = Math.abs(v) > 0.01 ? cartHitsGolfer(CART, nx, nz, yaw) : null;
  const rx = -fz * 0.6, rz = fx * 0.6;          // bumper corners
  const why = Math.abs(v) > 0.01 ? (cartBlocked(nx + fx * bump, nz + fz * bump) || cartBlocked(nx, nz) || (hitP ? 'golfer' : null)
    || CARTS.some(o => o !== CART && o.group && [1, -1].some(sd => cartDist(o, nx + fx * bump + rx * sd, nz + fz * bump + rz * sd) < 0.1)) && 'cart') : null;
  if (why) {
    if (Math.abs(v) > 1.5) sfx.thock();
    const msg = why === 'golfer' ? `Watch out – ${hitP.name} is in the way` : why === 'cart' ? 'Careful – another cart' : CART_RULE_MSG[why];
    if (msg && performance.now() - (CART.lastMsg || 0) > 2500) { showMsg(msg, 1.8); CART.lastMsg = performance.now(); }
    v = 0;
  } else { CART.x = nx; CART.z = nz; CART.yaw = yaw; }
  const yawRate = dt > 0 ? (CART.yaw - (CART.prevYaw ?? CART.yaw)) / dt : 0; CART.prevYaw = CART.yaw;
  if (dt > 0) cartHeadMotion(dt, (v - CART.speed) / dt, v * yawRate);
  CART.speed = v;
  placeCart(dt);
  // wheels & steering wheel
  for (const w of CART.wheels) w.rotation.x -= v / CART.WHEEL_R * dt;
  for (const p of CART.frontPivots) p.rotation.y = CART.steer;
  CART.steeringWheel.rotation.y = CART.steer * 2.2; // left = counter-clockwise, as seen by the driver
  // camera
  if (CART.view === 'first') {
    CART.group.updateMatrixWorld();
    const H = CART.head, look = CART.look || 0, pitch = clamp(-0.16 + (CART.lookPitch || 0), -1.2, 0.9);
    // the eyes sit a little in front of the neck, so turning the head moves them on a small circle
    const neck = CART.SEAT.clone().add(new THREE.Vector3(H.x, H.y, H.z));
    const eyeL = neck.add(new THREE.Vector3(-Math.sin(look) * 0.09, 0, 0.09 - Math.cos(look) * 0.09));
    const eye = eyeL.applyMatrix4(CART.group.matrixWorld);
    const q = CART.group.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch + H.pitch, look, H.roll, 'YXZ')));
    camera.position.copy(eye); camera.quaternion.copy(q);
    camPos.copy(eye); camLook.copy(eye).add(new THREE.Vector3(0, 0, -10).applyQuaternion(q));
  } else { // chase camera; the mouse orbits it around the cart
    const a = CART.yaw + (CART.look || 0), bx = -Math.sin(a), bz = -Math.cos(a), el = clamp(0.42 - (CART.lookPitch || 0), 0.1, 1.2);
    const cp = new THREE.Vector3(CART.x - bx * 7 * Math.cos(el), CART.y + 1 + 7 * Math.sin(el), CART.z - bz * 7 * Math.cos(el));
    const lk = new THREE.Vector3(CART.x + bx * 4, CART.y + 1.0, CART.z + bz * 4);
    setCam(cp, lk, 1 - Math.exp(-dt * 4));
  }
  // HUD prompt
  const d = Math.hypot(CART.x - game.ball.x, CART.z - game.ball.z);
  const pr = $('prompt'); pr.style.display = 'block';
  pr.innerHTML = `<b>${(Math.abs(v) * 3.6).toFixed(0)} km/h</b> &nbsp;·&nbsp; Ball: <b>${fmt(d)}</b> &nbsp;·&nbsp; <b>E</b> get out · <b>V</b> view · Drag the mouse to look around (<b>C</b> centre) · Space brake`;
}

// ---------- driver's head: mouse look + inertia ----------
function cartMouseLook(e) {
  if (document.pointerLockElement !== canvas && !(e.buttons & 1)) return; // not grabbed: drag with the left button
  if (Math.abs(e.movementX) > 150 || Math.abs(e.movementY) > 150) return;   // pointer-lock jumps
  const k = document.pointerLockElement === canvas ? -0.0028 : 0.0032;   // dragging moves the scenery (like Street View)
  let l = (CART.look || 0) + e.movementX * k;
  l = ((l + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;  // wrap: 360° around
  CART.look = l;
  CART.lookPitch = clamp((CART.lookPitch || 0) + e.movementY * k, -1.0, 1.0);
}
// The body is pushed opposite to the cart's acceleration: braking -> head forward, accelerating -> back,
// curves -> outwards. A slightly under-damped spring gives the little rebound when the cart stops.
function cartHeadMotion(dt, aLon, aLat) {
  const H = CART.head, k = 1 - Math.exp(-dt / 0.08);
  H.aLon += (clamp(aLon, -12, 8) - H.aLon) * k; H.aLat += (clamp(aLat, -6, 6) - H.aLat) * k;
  const tz = clamp(H.aLon * 0.028, -0.16, 0.09);   // +z = backwards in the cart frame
  const tx = clamp(H.aLat * 0.03, -0.11, 0.11);    // left turn (aLat > 0) pushes the head to the right (+x)
  const K = 70, C = 10, n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
  for (let i = 0; i < n; i++) {
    H.vx += (K * (tx - H.x) - C * H.vx) * h; H.x += H.vx * h;
    H.vz += (K * (tz - H.z) - C * H.vz) * h; H.z += H.vz * h;
  }
  // a little road feel: faster = more vibration, bumpy terrain = more nodding
  H.t += dt * (8 + Math.abs(CART.speed) * 2);
  const vib = Math.min(1, Math.abs(CART.speed) / CART.MAX_FWD) * lerp(0.15, 1, CART.ride ?? 1);
  H.y = Math.sin(H.t * 2.3) * 0.004 * vib + Math.sin(H.t * 0.9) * 0.006 * vib;
  H.pitch = H.z * 0.6 + Math.sin(H.t * 1.7) * 0.004 * vib; // nod forward when braking
  H.roll = -H.x * 0.5;                                     // lean with the head
}

function nearCart() { return Math.hypot(game.player.x - CART.x, game.player.z - CART.z) < 2.6 && Math.abs(CART.speed) < 0.1; }
function nearOtherCart() { return CARTS.find(c => c !== CART && Math.hypot(game.player.x - c.x, game.player.z - c.z) < 2.6) || null; }

function enterCart() {
  if (!CART.occ.includes(CUR)) { if (CART.occ.length >= 2) { showMsg('The cart is full', 1.4); return; } CART.occ.push(CUR); }
  game.mode = 'cart'; CART.speed = 0; CART.look = 0; CART.lookPitch = 0; CART.prevYaw = CART.yaw;
  Object.assign(CART.head, { x: 0, y: 0, z: 0, vx: 0, vz: 0, aLon: 0, aLat: 0 });
  if (document.pointerLockElement) document.exitPointerLock(); // cursor stays free: drag with the left button to look around
  golfer.root.visible = false;
  camSnap = true;
  showMsg('Hop in!<small>Drive with the arrow keys · E to get out</small>', 2);
  updateHUD();
}

function exitCart() {
  if (Math.abs(CART.speed) > 0.5) { showMsg('Stop the cart first', 1.2); return; }
  CART.speed = 0;
  CART.occ = CART.occ.filter(i => i !== CUR);
  if (document.pointerLockElement) document.exitPointerLock();
  const fx = -Math.sin(CART.yaw), fz = -Math.cos(CART.yaw), lx = fz, lz = -fx; // left of the cart
  const spots = [[lx * 1.3, lz * 1.3], [-lx * 1.3, -lz * 1.3], [fx * 2.2, fz * 2.2], [-fx * 2.3, -fz * 2.3]];
  let ok = spots[0];
  for (const s of spots) { const x = CART.x + s[0], z = CART.z + s[1]; if (Sw(x, z) !== S_WATER && !walkBlockedByTree(x, z)) { ok = s; break; } }
  game.player.set(CART.x + ok[0], 0, CART.z + ok[1]);
  game.yaw = CART.yaw;
  game.mode = 'walk'; pose.mode = 'walk';
  golfer.root.visible = true;
  camSnap = true;
  updateHUD();
}

function drawCartOnMap(ctx, P) {
  const [x, y] = P(CART.x, CART.z);
  ctx.save(); ctx.translate(x, y); ctx.rotate(-CART.yaw);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#c8102e'; ctx.lineWidth = 1.5;
  ctx.fillRect(-3, -5, 6, 10); ctx.strokeRect(-3, -5, 6, 10);
  ctx.restore();
}
