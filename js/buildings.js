// SwissGolf – buildings from OpenStreetMap footprints (club house, sheds, neighbourhood), extruded on the terrain
'use strict';

const BUILDING_STYLE = {
  // wall height (m), roof type, wall colour, roof colour
  clubhouse: { h: 4.4, roof: 'hip', wall: 0xdcd6cc, top: 0x555b64 },
  apartments: { h: 12, roof: 'flat', wall: 0xe8e2d6, top: 0x6b6f75 },
  commercial: { h: 7, roof: 'flat', wall: 0xd7d9dc, top: 0x777b80 },
  industrial: { h: 8, roof: 'flat', wall: 0xc9ccd0, top: 0x8a8e93 },
  hotel: { h: 4.5, roof: 'flat', wall: 0xece6da, top: 0x6b6f75 },
  detached: { h: 6, roof: 'hip', wall: 0xf0ebe0, top: 0x8c4a35 },
  semidetached_house: { h: 6, roof: 'hip', wall: 0xf0ebe0, top: 0x8c4a35 },
  garages: { h: 2.8, roof: 'flat', wall: 0xd8d3c8, top: 0x777b80 },
  garage: { h: 2.8, roof: 'flat', wall: 0xd8d3c8, top: 0x777b80 },
  shed: { h: 2.5, roof: 'hip', wall: 0x8a6a4a, top: 0x5a4a3a },
  roof: { h: 3.4, roof: 'canopy', wall: 0x9a9a9a, top: 0x5c6168 },
  yes: { h: 4.5, roof: 'hip', wall: 0xe6e0d4, top: 0x5c6168 },
};

// The Unterengstringen club house is a detailed model (js/clubhouse.js), placed on its OSM footprint: the long axis
// of the footprint's minimum-area rectangle is the model's x (towards the east), the course side its z = 0 wall.
let CLUB = null, CLUB_PAD = null;
// Frame of the club house model on its OSM footprint, and the level pad the terrain is graded to (cut & fill with
// gentle banks, so neither the floor floats nor the grass pokes through the terraces). Runs before the terrain is built.
function clubhouseFrame() {
  if (typeof CLUBHOUSE === 'undefined' || COURSE_DEF.terrain !== 'Unterengstringen') return null;
  const f = FEAT.buildings.find(b => b.t.g === 'clubhouse'); if (!f) return null;
  const P = f.pts;
  let best = null;
  for (let i = 0; i < P.length - 1; i++) {
    let ux = P[i + 1][0] - P[i][0], us = P[i + 1][1] - P[i][1]; const l = Math.hypot(ux, us); if (l < 1) continue; ux /= l; us /= l;
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
    for (const [x, s] of P) { const a = x * ux + s * us, b = -x * us + s * ux; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
    const area = (a1 - a0) * (b1 - b0);
    if (!best || area < best.area) best = { area, ux, us, a0, a1, b0, b1 };
  }
  let { ux, us, a0, a1, b0, b1 } = best;
  if (b1 - b0 > a1 - a0) { [ux, us] = [-us, ux]; const A0 = a0, A1 = a1; a0 = b0; a1 = b1; b0 = -A1; b1 = -A0; }   // u = long side
  if (ux < 0) { ux = -ux; us = -us; [a0, a1] = [-a1, -a0]; [b0, b1] = [-b1, -b0]; }                                      // u towards the east
  const nx = -us, ns = ux;                               // n: across, towards the car park (north)
  const C = { ux, us, nx, ns, ox: a0 * ux + b0 * nx, os: a0 * us + b0 * ns };
  C.local = (x, s) => [(x - C.ox) * ux + (s - C.os) * us, (x - C.ox) * nx + (s - C.os) * ns];
  C.covers = (x, s, m = 0) => { const [a, b] = C.local(x, s); return a > -26 - m && a < 120 + m && b > -10 - m && b < 30 + m; };
  // the model's paved / built area (along a, across b): main building + terraces + north apron, pavilion, road sign
  const boxes = [[-1.6, 60.5, -7.6, 0], [57, 90.5, -7.6, 0], [-0.1, 89.6, -0.1, 18.1], [-2, 90.5, 18, 28],   // terrace, east strip, hall, north apron
    [95.9, 114.1, -3.6, 15.1], [-23, -16, 21.5, 27.5]];                                                    // pavilion, road sign
  C.boxDist = (x, s) => { const [a, b] = C.local(x, s); let d = 1e9;
    for (const [A0, A1, B0, B1] of boxes) { const da = Math.max(A0 - a, a - A1, 0), db = Math.max(B0 - b, b - B1, 0); d = Math.min(d, Math.hypot(da, db)); } return d; };
  C.inModel = (x, s, m = 0) => C.boxDist(x, s) <= m;
  // pad level: the median ground height under the model
  const hs = [];
  for (let a = -23; a <= 115; a += 2) for (let b = -7.6; b <= 28; b += 2) { const x = C.ox + a * ux + b * nx, s = C.os + a * us + b * ns; if (C.inModel(x, s)) hs.push(baseHeight(x, s)); }
  hs.sort((p, q) => p - q); C.y = hs[Math.floor(hs.length / 2)]; C.hRange = [hs[0], hs[hs.length - 1]];
  return C;
}
// terrain grading around the club house (used by heightRaw): flat 5 cm below the floor under the model, banks of 8 m
const CLUB_BANK = 8;
function clubPad(x, s, h) {
  const C = CLUB_PAD; if (!C || !C.covers(x, s, CLUB_BANK + 2)) return h;
  const d = C.boxDist(x, s); if (d > CLUB_BANK) return h;
  return lerp(C.y - 0.05, h, smoothstep(0.3, CLUB_BANK, d));
}
function prepClubhouse() { CLUB_PAD = CLUB_PAD || clubhouseFrame(); }
function placeClubhouse() {
  const C = CLUB_PAD; if (!C) return null;
  const g = CLUBHOUSE.build();
  g.position.set(C.ox, C.y, -C.os); g.rotation.y = Math.atan2(C.us, C.ux);    // local x → (ux, −us) in the world, local z (terrace) → south
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  world.add(g); C.group = g;
  // collisions (js/solids.js): the model's solids are laid out before the z mirror of the batch
  if (typeof addSolidBox === 'function') {
    g.updateMatrixWorld(true);
    const mir = new THREE.Matrix4().makeScale(1, 1, -1);
    for (const [x0, x1, z0, z1, y0, y1, kind, T] of g.userData.solids) {
      const m = g.matrixWorld.clone().multiply(mir); if (T) m.multiply(T);
      // a mirror flips the frame's handedness: rebuild a proper rotation from the mirrored axes
      const c = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2).applyMatrix4(m);
      const u = new THREE.Vector3(1, 0, 0).transformDirection(m);
      const ul = Math.hypot(u.x, u.z) || 1;
      addSolid({ cx: c.x, cz: c.z, ux: u.x / ul, uz: u.z / ul, hl: Math.abs(x1 - x0) / 2, hw: Math.abs(z1 - z0) / 2, y0: c.y - (y1 - y0) / 2, y1: c.y + (y1 - y0) / 2, kind });
    }
  }
  // guests on the terrace, watching the golfers
  if (typeof PEOPLE !== 'undefined' && g.userData.chairs.length) {
    g.updateMatrixWorld(true);
    const m = g.matrixWorld.clone().multiply(new THREE.Matrix4().makeScale(1, 1, -1));
    let sd = 4242; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const chairs = g.userData.chairs.slice(), shirts = [0xffffff, 0x1f3b6e, 0xd8c7a3, 0x8fb3d9, 0x2e7d32, 0xe57373, 0x424242, 0xf0e2c8, 0x6a4c93, 0xffb74d];
    C.guests = [];
    for (let n = 0; n < 14 && chairs.length; n++) {
      const [x, z, rot] = chairs.splice(Math.floor(r() * chairs.length), 1)[0];
      const fig = makeGolfer({ shirt: shirts[Math.floor(r() * shirts.length)], sex: r() < 0.45 ? 'f' : 'm', name: '', cap: r() < 0.35 ? 0xffffff : false });
      const p = new THREE.Vector3(x, 0, z).applyMatrix4(m), d = new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot)).transformDirection(m);
      fig.root.position.set(p.x, p.y - 0.28, p.z); fig.root.rotation.y = Math.atan2(d.x, d.z);
      const ps = { mode: 'sit', chair: true, look: null, lookK: 0, idle: r() * 6 };
      PEOPLE.update(fig, ps, 0); C.guests.push({ fig, ps });
    }
  }
  return C;
}

function buildBuildings() {
  CLUB = placeClubhouse();
  const batches = new Map(); // colour -> positions
  const push = (color, ...tri) => { if (!batches.has(color)) batches.set(color, []); const a = batches.get(color); for (const v of tri) a.push(v[0], v[1], v[2]); };
  const W = (x, y, s) => [x, y, -s]; // hole frame -> world
  for (const f of FEAT.buildings) {
    if (f.bb[0] < X0 + 2 || f.bb[2] > X1 - 2 || f.bb[1] < S0 + 2 || f.bb[3] > S1 - 2) continue;
    if (CLUB && CLUB.covers((f.bb[0] + f.bb[2]) / 2, (f.bb[1] + f.bb[3]) / 2)) continue;   // replaced by the model
    if (RANGE_PAD && RANGE_PAD.inModel((f.bb[0] + f.bb[2]) / 2, (f.bb[1] + f.bb[3]) / 2, 2)) continue;   // the range's hitting bays
    let P = f.pts.slice(); if (P.length > 2 && P[0][0] === P[P.length - 1][0] && P[0][1] === P[P.length - 1][1]) P.pop();
    if (P.length < 3) continue;
    let A = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) A += P[j][0] * P[i][1] - P[i][0] * P[j][1];
    if (A < 0) P.reverse();                                          // counter-clockwise in (x, s)
    const st = f.t.g === 'clubhouse' ? BUILDING_STYLE.clubhouse : (BUILDING_STYLE[f.t.b] || BUILDING_STYLE.yes);
    let wallH = f.t.lv ? +f.t.lv * 3 + 0.6 : st.h;
    if (st === BUILDING_STYLE.yes) wallH = f.area < 40 ? 2.6 : f.area < 200 ? 3.6 : f.area < 600 ? 5 : 7;
    let roof = st.roof;
    if (roof === 'hip' && f.area > 1500 && f.t.g !== 'clubhouse') roof = 'flat';
    const isCanopy = roof === 'canopy' || (f.t.b === 'roof');
    let base = 1e9, top = -1e9;
    for (const [x, s] of P) { const h = heightAt(x, s); base = Math.min(base, h); top = Math.max(top, h); }
    base -= 0.3;
    const y1 = (isCanopy ? top + 3.2 : base + 0.3 + wallH);
    const n = P.length;
    if (isCanopy) {
      // a roof on posts (parking canopies, driving-range shelter)
      const tris = THREE.ShapeUtils.triangulateShape(P.map(p => new THREE.Vector2(p[0], p[1])), []);
      for (const [a, b, c] of tris) { push(st.top, W(P[a][0], y1 + 0.25, P[a][1]), W(P[b][0], y1 + 0.25, P[b][1]), W(P[c][0], y1 + 0.25, P[c][1])); push(st.top, W(P[a][0], y1, P[a][1]), W(P[c][0], y1, P[c][1]), W(P[b][0], y1, P[b][1])); }
      for (const [x, s] of P) for (const [dx, ds] of [[-0.12, -0.12], [0.12, -0.12], [0.12, 0.12], [-0.12, 0.12]].slice(0, 1)) {
        const h0 = heightAt(x, s) - 0.2, r = 0.12;
        const q = [[x - r, s - r], [x + r, s - r], [x + r, s + r], [x - r, s + r]];
        for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; push(0x9a9a9a, W(a[0], h0, a[1]), W(b[0], h0, b[1]), W(b[0], y1, b[1])); push(0x9a9a9a, W(a[0], h0, a[1]), W(b[0], y1, b[1]), W(a[0], y1, a[1])); }
      }
      continue;
    }
    // walls
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      push(st.wall, W(a[0], base, a[1]), W(b[0], base, b[1]), W(b[0], y1, b[1]));
      push(st.wall, W(a[0], base, a[1]), W(b[0], y1, b[1]), W(a[0], y1, a[1]));
    }
    // roof
    let perim = 0; for (let i = 0; i < n; i++) perim += Math.hypot(P[(i + 1) % n][0] - P[i][0], P[(i + 1) % n][1] - P[i][1]);
    const minW = 2 * f.area / perim;                                  // ≈ width of a long, narrow building
    const tri = Q => THREE.ShapeUtils.triangulateShape(Q.map(p => new THREE.Vector2(p[0], p[1])), []);
    if (roof === 'hip') for (let inset = Math.min(minW * 0.42, 6); inset >= 0.8; inset *= 0.7) {
      const rh = Math.min(3.2, inset * 0.6 + 0.4);
      const I = P.map((p, i) => { // miter offset of each corner towards the inside
        const a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
        let e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
        const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1; e1 = [e1[0] / l1, e1[1] / l1]; e2 = [e2[0] / l2, e2[1] / l2];
        const n1 = [-e1[1], e1[0]], n2 = [-e2[1], e2[0]], k = 1 + n1[0] * n2[0] + n1[1] * n2[1];
        const m = k > 0.2 ? inset / k : inset / 0.2;
        return [p[0] + (n1[0] + n2[0]) * m, p[1] + (n1[1] + n2[1]) * m];
      });
      let ok = true; for (const q of I) if (!pointInPoly(q[0], q[1], P) || lineDist(q[0], q[1], P) < inset * 0.7) ok = false;
      for (let i = 0; i < n && ok; i++) { const a = P[i], b = P[(i + 1) % n], c = I[i], d = I[(i + 1) % n]; if ((b[0] - a[0]) * (d[0] - c[0]) + (b[1] - a[1]) * (d[1] - c[1]) <= 0) ok = false; }
      if (ok) {
        for (let i = 0; i < n; i++) {
          const a = P[i], b = P[(i + 1) % n], c = I[(i + 1) % n], d = I[i];
          push(st.top, W(a[0], y1, a[1]), W(b[0], y1, b[1]), W(c[0], y1 + rh, c[1]));
          push(st.top, W(a[0], y1, a[1]), W(c[0], y1 + rh, c[1]), W(d[0], y1 + rh, d[1]));
        }
        for (const [a, b, c] of tri(I)) push(st.top, W(I[a][0], y1 + rh, I[a][1]), W(I[b][0], y1 + rh, I[b][1]), W(I[c][0], y1 + rh, I[c][1]));
        roof = 'done'; break;
      }
    }
    if (roof === 'done') continue;
    for (const [a, b, c] of tri(P)) push(st.top, W(P[a][0], y1, P[a][1]), W(P[b][0], y1, P[b][1]), W(P[c][0], y1, P[c][1]));
  }
  for (const [color, arr] of batches) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide, envMapIntensity: 0.5 }));
    mesh.castShadow = mesh.receiveShadow = true;
    world.add(mesh);
  }
}

// terrace guests look at the golfer playing nearby (or chat with each other when nobody is around); now and then
// one of them waves at a golfer walking past and calls out a greeting (speech bubble)
const _gHead = new THREE.Vector3(), _gP = new THREE.Vector3();
// GUEST_PLURAL only when two or more golfers walk by together (multiplayer)
const GUEST_PLURAL = ['Hoi zäme!', 'Grüezi mitenand!'];
const GUEST_PHRASES = ['Grüezi!', 'Sali!', 'Gutes Spiel!', 'Schönen Tag!', 'Schöne Schlag!', 'Viel Glück!', 'Bravo!', 'Hopp, hopp!',
  'Super Wetter hüt!', 'Uf de Fairway blibe!', 'En schöne Tag no!', 'Gönd Sie s ruhig a!', 'Merci, gliichfalls!', 'Händ Sie Hunger?'];
function updateGuests(dt) {
  if (!CLUB || !CLUB.guests || !golfer || game.mode === 'intro') return;
  const g0 = CLUB.guests[0].fig.root.position;
  if (camera.position.distanceToSquared(g0) > 140 * 140) { for (const G of CLUB.guests) if (G.bubble) G.bubble.style.display = 'none'; return; }
  _gHead.copy(golfer.root.position); _gHead.y += 1.5;
  const near = golfer.root.visible && _gHead.distanceTo(g0) < 90;
  const tgt = game.mode === 'flight' || game.mode === 'result' ? ballMesh.position : _gHead;
  const walking = game.mode === 'walk' && golfer.root.visible;
  let active = CLUB.guests.filter(G => G.ps.wave > 0).length;
  for (const G of CLUB.guests) {
    const { fig, ps } = G;
    ps.idle += dt; G.cool = (G.cool ?? 4 + Math.random() * 10) - dt;
    // greet a golfer walking by (within 14 m), at most two at a time, each guest every 25–60 s
    const d = fig.root.position.distanceTo(golfer.root.position);
    if (walking && !(ps.wave > 0) && G.cool <= 0 && d < 14 && active < 2 && Math.random() < dt * 0.6) {
      ps.waveDur = ps.wave = 2.6; G.cool = 25 + Math.random() * 35; active++;
      if (!G.bubble) { G.bubble = document.createElement('div'); G.bubble.className = 'speech'; document.body.appendChild(G.bubble); }
      // how many golfers are close to this guest (players in a cart count at the cart's position)
      const close = PLAYERS.length ? PLAYERS.filter(q => { const inC = q.i === CUR ? game.mode === 'cart' : q.inCart, cart = CARTS[q.cart]; const P = inC && cart ? cart.group.position : q.fig.root.position; return P.distanceTo(fig.root.position) < 16; }).length : 1;
      const pool = close > 1 ? GUEST_PHRASES.concat(GUEST_PLURAL, GUEST_PLURAL) : GUEST_PHRASES;
      G.bubble.textContent = pool[Math.floor(Math.random() * pool.length)];
    }
    if (ps.wave > 0) ps.wave = Math.max(0, ps.wave - dt);
    const want = near ? 1 : 0;
    ps.lookK = clamp((ps.lookK || 0) + (want ? dt : -dt) * 1.5, 0, 1);
    if (!ps.look) ps.look = new THREE.Vector3();
    if (ps.wave > 0) { ps.look.copy(_gHead); ps.lookK = 1; }
    else if (near) ps.look.copy(tgt);
    else { ps.look.set(fig.root.position.x + Math.sin(ps.idle * 0.3) * 3, fig.root.position.y + 1.2, fig.root.position.z + Math.cos(ps.idle * 0.21) * 3); ps.lookK = 0.6; }
    PEOPLE.update(fig, ps, 0);
    // speech bubble above the head while waving
    if (G.bubble) {
      const show = ps.wave > 0.3;
      if (show) {
        _gP.copy(fig.root.position); _gP.y += 2.0; _gP.project(camera);
        if (_gP.z > 1 || Math.abs(_gP.x) > 1.1 || Math.abs(_gP.y) > 1.1) G.bubble.style.display = 'none';
        else { G.bubble.style.display = 'block'; G.bubble.style.left = ((_gP.x + 1) / 2 * innerWidth) + 'px'; G.bubble.style.top = ((1 - _gP.y) / 2 * innerHeight) + 'px'; G.bubble.style.opacity = Math.min(1, (ps.wave - 0.3) * 4); }
      } else G.bubble.style.display = 'none';
    }
  }
}
