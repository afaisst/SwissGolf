// SwissGolf – bunker details: footprints in the sand, ball pitch marks, splash marks and rakes
'use strict';

const SAND = { prints: null, pits: null, blasts: null, n: { prints: 0, pits: 0, blasts: 0 }, lastStep: 0, foot: 0 };
const SAND_MAX = { prints: 700, pits: 60, blasts: 40 };

// ---- decal textures (drawn once on a canvas) ----
function sandTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// soft dark hollow with a light, pushed-up rim on the "sun" side
function hollow(g, cx, cy, rx, ry, depth) {
  g.save(); g.translate(cx, cy);
  let gr = g.createRadialGradient(-rx * 0.15, -ry * 0.12, 0, 0, 0, Math.max(rx, ry));
  gr.addColorStop(0, `rgba(104,86,58,${0.95 * depth})`); gr.addColorStop(0.75, `rgba(140,120,86,${0.8 * depth})`); gr.addColorStop(1, 'rgba(150,130,96,0)');
  g.scale(1, ry / rx); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill();
  g.restore();
  g.save(); g.translate(cx, cy); g.scale(1, ry / rx);
  g.strokeStyle = `rgba(255,248,228,${0.85 * depth})`; g.lineWidth = rx * 0.18; g.beginPath(); g.arc(0, 0, rx * 0.98, Math.PI * 0.6, Math.PI * 1.45); g.stroke();
  g.restore();
}
function shoeTexture() {
  return sandTexture(64, 160, (g, w, h) => {
    hollow(g, 32, 50, 24, 42, 1);   // forefoot
    hollow(g, 33, 124, 19, 26, 1);  // heel
    // spikeless sole pattern: little dimples
    g.fillStyle = 'rgba(100,84,58,0.45)';
    for (let y = 18; y < 150; y += 11) for (let x = 14; x < 54; x += 10) {
      const inF = ((x - 32) / 22) ** 2 + ((y - 50) / 40) ** 2 < 0.8, inH = ((x - 33) / 17) ** 2 + ((y - 124) / 24) ** 2 < 0.8;
      if (inF || inH) { g.beginPath(); g.arc(x + ((y / 11) % 2) * 5 - 2, y, 2.2, 0, Math.PI * 2); g.fill(); }
    }
  });
}
function pitTexture() { return sandTexture(64, 64, g => { hollow(g, 32, 32, 26, 26, 1.1); }); }
function blastTexture() {
  return sandTexture(128, 96, g => {
    hollow(g, 64, 48, 58, 38, 0.8);
    const r = mulberry32(7);
    for (let i = 0; i < 70; i++) { // scattered sand crumbs around the splash
      const a = r() * Math.PI * 2, d = 0.6 + r() * 0.45, x = 64 + Math.cos(a) * 58 * d, y = 48 + Math.sin(a) * 38 * d;
      g.fillStyle = r() < 0.5 ? 'rgba(245,234,204,0.45)' : 'rgba(130,110,80,0.3)'; g.beginPath(); g.arc(x, y, 1 + r() * 2.2, 0, Math.PI * 2); g.fill();
    }
  });
}
function decalMesh(tex, w, l, max) {
  const geo = new THREE.PlaneGeometry(w, l); geo.rotateX(-Math.PI / 2); // lies flat; length along -Z
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const im = new THREE.InstancedMesh(geo, mat, max); im.count = 0; im.receiveShadow = true; im.frustumCulled = false; im.renderOrder = 1;
  world.add(im); return im;
}

// place one decal at (x,z), facing yaw, following the sand surface
const _sdM = new THREE.Matrix4(), _sdQ = new THREE.Quaternion(), _sdQ2 = new THREE.Quaternion(), _sdV = new THREE.Vector3(), _sdS = new THREE.Vector3(), _sdUp = new THREE.Vector3(0, 1, 0);
function addSandDecal(kind, x, z, yaw, scale = 1, mirror = false) {
  const im = SAND[kind]; if (!im) return;
  const i = SAND.n[kind] % SAND_MAX[kind]; SAND.n[kind]++;
  const e = 0.25, nx = Hw(x - e, z) - Hw(x + e, z), nz = Hw(x, z - e) - Hw(x, z + e);
  _sdV.set(nx, 2 * e, nz).normalize();
  _sdQ.setFromUnitVectors(_sdUp, _sdV).multiply(_sdQ2.setFromAxisAngle(_sdUp, yaw));
  _sdS.set(scale, 1, scale); // (no mirroring: a negative scale flips the decal face-down and it gets culled)
  _sdM.compose(new THREE.Vector3(x, Hw(x, z) + 0.012, z), _sdQ, _sdS);
  im.setMatrixAt(i, _sdM); im.count = Math.min(SAND.n[kind], SAND_MAX[kind]); im.instanceMatrix.needsUpdate = true;
}
function clearSandMarks() { for (const k of ['prints', 'pits', 'blasts']) { SAND.n[k] = 0; if (SAND[k]) SAND[k].count = 0; } }

// footprints while walking: one print per footfall (every half gait cycle)
function sandFootsteps(run) {
  const step = Math.floor(pose.phase / Math.PI);
  if (step === SAND.lastStep) return;
  SAND.lastStep = step; SAND.foot ^= 1;
  const fx = -Math.sin(game.yaw), fz = -Math.cos(game.yaw), rx = -fz, rz = fx;   // forward / right
  const side = SAND.foot ? 1 : -1, x = game.player.x + rx * 0.11 * side + fx * 0.1, z = game.player.z + rz * 0.11 * side + fz * 0.1;
  if (Sw(x, z) !== S_BUNKER) return;
  addSandDecal('prints', x, z, game.yaw - side * 0.1 + (Math.random() - 0.5) * 0.06, run ? 1.08 : 1); // toes point slightly outwards
}
// the golfer digs in at address: both feet, toes pointing at the ball line
function sandStance() {
  const p = golfer.root.position, yaw = golfer.root.rotation.y; // golfer-local +X = target, +Z = facing
  const tx = Math.cos(yaw), tz = -Math.sin(yaw);
  for (const side of [-1, 1]) {
    const x = p.x + tx * 0.2 * side, z = p.z + tz * 0.2 * side;
    if (Sw(x, z) !== S_BUNKER) continue;
    // the decal's long axis is local -Z: point it the way the golfer faces, toes slightly flared
    addSandDecal('prints', x, z, yaw + Math.PI + side * 0.25, 1.05, side > 0);
    addSandDecal('prints', x + 0.02, z + 0.02, yaw + Math.PI + side * 0.3, 1.1, side > 0); // shuffled in
  }
}

// ---- rakes: one per bunker (two for big ones), lying in the sand near the edge, away from the green ----
function buildRakes() {
  const spots = [];
  for (const b of FEAT.bunkers) {
    const P = b.pts; let area = 0, cx = 0, cs = 0;
    for (let i = 0; i < P.length; i++) { const a = P[i], c = P[(i + 1) % P.length]; area += a[0] * c[1] - c[0] * a[1]; cx += a[0]; cs += a[1]; }
    area = Math.abs(area) / 2; cx /= P.length; cs /= P.length;
    if (area < 12) continue;
    let gx = cx, gs = cs + 1, gd = 1e9; // nearest green centre
    for (const g of FEAT.greens) { const bb = g.bb, mx = (bb[0] + bb[2]) / 2, ms = (bb[1] + bb[3]) / 2, d = Math.hypot(mx - cx, ms - cs); if (d < gd) { gd = d; gx = mx; gs = ms; } }
    const cand = [];
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], c = P[i + 1], L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L < 0.5) continue;
      for (let d = 0.3; d < L; d += 0.8) {
        const t = d / L, ex = lerp(a[0], c[0], t), es = lerp(a[1], c[1], t), ux = (c[0] - a[0]) / L, us = (c[1] - a[1]) / L;
        for (const sg of [1, -1]) { // step inside
          const ix = ex - us * 0.75 * sg, is = es + ux * 0.75 * sg;
          if (polyDist(ix, is, P) > -0.6) continue;
          // the handle runs along the edge – both ends must be in the sand
          const hx = ix + ux * 1.5, hs = is + us * 1.5;
          if (polyDist(hx, hs, P) > -0.25) continue;
          cand.push({ x: ix, s: is, hx, hs, score: Math.hypot(ix - gx, is - gs) });
        }
      }
    }
    cand.sort((p, q) => q.score - p.score);
    const take = area > 160 ? 2 : 1;
    let got = 0;
    for (const c of cand) { if (spots.some(o => Math.hypot(o.x - c.x, o.s - c.s) < 5)) continue; spots.push(c); if (++got >= take) break; }
  }
  if (!spots.length) return;
  // instanced parts: handle, head bar, teeth
  const handle = new THREE.CylinderGeometry(0.014, 0.014, 1.55, 6); handle.rotateX(Math.PI / 2); handle.translate(0, 0.03, -0.8);  // along -Z from the head
  const head = new THREE.BoxGeometry(0.52, 0.035, 0.045); head.translate(0, 0.045, 0);
  const tooth = new THREE.BoxGeometry(0.012, 0.04, 0.012); tooth.translate(0, 0.02, 0.0);
  const mk = (geo, col, n, rough = 0.6) => { const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: rough }), n); im.castShadow = true; im.receiveShadow = true; world.add(im); return im; };
  const H = mk(handle, 0xe2dccb, spots.length, 0.45), B = mk(head, 0x29402a, spots.length), T = mk(tooth, 0x29402a, spots.length * 13);
  const m = new THREE.Matrix4(), t = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  spots.forEach((p, i) => {
    const z = -p.s, hz = -p.hs, yaw = Math.atan2(-(p.hx - p.x), -(hz - z)); // local -Z points along the handle
    const y0 = Hw(p.x, z), y1 = Hw(p.hx, hz), pitch = Math.atan2(y1 - y0, 1.5);
    e.set(pitch, yaw, 0, 'YXZ'); q.setFromEuler(e);
    m.compose(new THREE.Vector3(p.x, y0 - 0.012, z), q, new THREE.Vector3(1, 1, 1));
    H.setMatrixAt(i, m); B.setMatrixAt(i, m);
    for (let k = 0; k < 13; k++) { t.makeTranslation(-0.24 + k * 0.04, 0, 0); T.setMatrixAt(i * 13 + k, m.clone().multiply(t)); }
  });
  SAND.rakes = spots.map(p => ({ x: p.x, z: -p.s }));
}

function buildBunkers() {
  SAND.prints = decalMesh(shoeTexture(), 0.12, 0.31, SAND_MAX.prints);
  SAND.pits = decalMesh(pitTexture(), 0.14, 0.14, SAND_MAX.pits);
  SAND.blasts = decalMesh(blastTexture(), 0.6, 0.4, SAND_MAX.blasts);
  buildRakes();
}
