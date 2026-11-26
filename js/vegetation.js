// SwissGolf – tall grass and wildflowers in the rough (instanced, swaying in the wind) and tee markers
'use strict';

const VEG = { grassMat: null, flowerMat: null, uniforms: { uTime: { value: 0 }, uWind: { value: new THREE.Vector2() } }, density: 1 };
try { VEG.density = +(localStorage.getItem('swissgolf.grass') ?? 1); } catch (e) { }

function makeTuftTexture() {
  const W = 256, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'), r = mulberry32(9);
  for (let i = 0; i < 70; i++) {
    const x0 = W * (0.15 + 0.7 * r()), h = H * (0.45 + 0.55 * r()), lean = (r() - 0.5) * 70, w = 2 + r() * 3.5;
    const g = 90 + r() * 70, y = 60 + r() * 50;
    const grad = ctx.createLinearGradient(0, H, 0, H - h);
    grad.addColorStop(0, `rgb(${y * 0.7},${g * 0.8},${35})`); grad.addColorStop(1, `rgb(${y + 70},${g + 60},${45 + r() * 30})`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(x0 - w, H); ctx.quadraticCurveTo(x0 + lean * 0.3, H - h * 0.6, x0 + lean, H - h); ctx.quadraticCurveTo(x0 + lean * 0.3 + w * 0.4, H - h * 0.6, x0 + w, H); ctx.fill();
  }
  return straightAlphaTexture(c, [70, 110, 40]);
}
// canvas -> texture with straight (non-premultiplied) alpha; transparent pixels get a neutral colour so
// mip-mapping does not pull black into the blade edges
function straightAlphaTexture(c, fill) {
  const W = c.width, H = c.height, src = c.getContext('2d').getImageData(0, 0, W, H).data, out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, o = ((H - 1 - y) * W + x) * 4, a = src[i + 3];
    if (a < 250) { const k = a / 255; out[o] = src[i] * k + fill[0] * (1 - k); out[o + 1] = src[i + 1] * k + fill[1] * (1 - k); out[o + 2] = src[i + 2] * k + fill[2] * (1 - k); }
    else { out[o] = src[i]; out[o + 1] = src[i + 1]; out[o + 2] = src[i + 2]; }
    out[o + 3] = a;
  }
  const t = new THREE.DataTexture(out, W, H, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}
function makeFlowerTexture() {
  const W = 256, H = 64, c = document.createElement('canvas'); c.width = W; c.height = H;   // 4 kinds side by side
  const ctx = c.getContext('2d'), r = mulberry32(5);
  const kinds = [['#ffffff', '#f2c21b'], ['#f6d21a', '#e0a000'], ['#b07ad8', '#7a3fa8'], ['#f4f0e6', '#d9b400']];
  kinds.forEach(([petal, eye], k) => {
    const ox = k * 64;
    ctx.strokeStyle = '#4b7a2a'; ctx.lineWidth = 2;
    for (let j = 0; j < 3; j++) {
      const x = ox + 14 + j * 18 + (r() - 0.5) * 6, y = 14 + r() * 14;
      ctx.beginPath(); ctx.moveTo(x, H); ctx.quadraticCurveTo(x + (r() - 0.5) * 8, (y + H) / 2, x, y); ctx.stroke();
      ctx.fillStyle = petal;
      if (k === 2) { for (let a = 0; a < 7; a++) { ctx.beginPath(); ctx.arc(x + (r() - 0.5) * 6, y + (r() - 0.5) * 6, 3, 0, 7); ctx.fill(); } }   // clover heads
      else { for (let a = 0; a < 8; a++) { const t = a / 8 * Math.PI * 2; ctx.beginPath(); ctx.ellipse(x + Math.cos(t) * 5, y + Math.sin(t) * 5, 4, 2, t, 0, 7); ctx.fill(); }
        ctx.fillStyle = eye; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 7); ctx.fill(); }
    }
  });
  return straightAlphaTexture(c, [80, 120, 45]);
}
// sway: the top of every blade moves with the wind; the bottom stays put
function swayMaterial(map, opts = {}) {
  const m = new THREE.MeshLambertMaterial(Object.assign({ map, alphaTest: 0.45, side: THREE.DoubleSide }, opts));
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = VEG.uniforms.uTime; sh.uniforms.uWind = VEG.uniforms.uWind;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec2 uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 iw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float bend = position.y * position.y;
        float ph = iw.x * 0.37 + iw.z * 0.23;
        float gust = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 1.3 + ph * 0.2));
        vec2 sw = uWind * 0.06 * gust + vec2(sin(uTime * 2.1 + ph), cos(uTime * 1.7 + ph)) * (0.05 + length(uWind) * 0.015);
        transformed.x += sw.x * bend; transformed.z += sw.y * bend;`);
    // normals pointing up make the blades light like the ground under them
    sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);');
    // both faces keep the upward normal (no flipping for back faces – otherwise they render black)
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0; vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;');
  };
  return m;
}
function crossedQuads(n, w, h, uvx0 = 0, uvx1 = 1) {
  const pos = [], uv = [], idx = [];
  for (let k = 0; k < n; k++) {
    const a = k / n * Math.PI, cx = Math.cos(a) * w / 2, cz = Math.sin(a) * w / 2, b = pos.length / 3;
    pos.push(-cx, 0, -cz, cx, 0, cz, cx, h, cz, -cx, h, -cz);
    uv.push(uvx0, 0, uvx1, 0, uvx1, 1, uvx0, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildVegetation() {
  if (!VEG.grassMat) { VEG.grassMat = swayMaterial(makeTuftTexture()); VEG.flowerMat = swayMaterial(makeFlowerTexture()); }
  if (VEG.density <= 0) return;
  const r = mulberry32(1234);
  const tufts = [], flowers = [];
  const step = 1.25 / Math.sqrt(VEG.density);
  for (let s = S0 + 2; s < S1 - 2; s += step) for (let x = X0 + 2; x < X1 - 2; x += step) {
    const jx = x + (r() - 0.5) * step, js = s + (r() - 0.5) * step, k = cell(jx, js);
    if (k < 0) continue;
    const c = CLS[k];
    if (c !== S_ROUGH && c !== S_DEEP) continue;
    const inC = INCOURSE[k] === 1;
    const meadow = fbm(jx * 0.045 + 3, js * 0.045 - 7, 3);          // patches of long grass
    const fd = fairwayDist(jx, js);
    let p = c === S_DEEP ? 0.75 : meadow > 0.52 ? 0.6 : 0.12;
    if (!inC) p *= 0.3;
    if (inC) p *= smoothstep(2.5, 7, fd) * smoothstep(4, 9, greenDist(jx, js)) * smoothstep(1.5, 4, teeDist(jx, js));
    if (pathDist(jx, js) < 0.6 || waterDist(jx, js) < 0.3 || buildingAt(jx, js) || (CLUB && CLUB.inModel(jx, js, 1.5)) || (RANGE_PAD && RANGE_PAD.inModel(jx, js, 1.5))) p = 0;
    if (r() > p) continue;
    const tall = (c === S_DEEP ? 0.4 : 0.18) + Math.max(0, meadow - 0.4) * 0.6;
    tufts.push([jx, js, tall * (0.7 + r() * 0.6), r() * 6.28, inC]);
    if (r() < (c === S_DEEP ? 0.16 : meadow > 0.52 ? 0.12 : 0.03)) flowers.push([jx + (r() - 0.5), js + (r() - 0.5), 0.25 + r() * 0.25, r() * 6.28, (r() * 4) | 0]);
  }
  // big courses: keep the budget (~120k tufts) by thinning the long grass outside the course first
  const MAX = 120000 * Math.max(0.5, VEG.density);
  if (tufts.length > MAX) {
    const nIn = tufts.filter(t => t[4]).length, keepOut = Math.max(0, MAX - nIn) / Math.max(1, tufts.length - nIn), keepIn = Math.min(1, MAX / Math.max(1, nIn));
    const kept = tufts.filter(t => r() <= (t[4] ? keepIn : keepOut)); tufts.length = 0; for (const t of kept) tufts.push(t);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const grassGeo = crossedQuads(3, 0.9, 1);
  const gm = new THREE.InstancedMesh(grassGeo, VEG.grassMat, tufts.length);
  tufts.forEach(([x, s, h, a], i) => { q.setFromAxisAngle(up, a); m.compose(p.set(x, heightAt(x, s) - 0.03, -s), q, sc.set(0.45 + h * 1.2, h, 0.45 + h * 1.2)); gm.setMatrixAt(i, m); });
  gm.receiveShadow = true; gm.layers.set(2); world.add(gm);   // not in the ball cam
  // flowers: one geometry per kind (different texture columns)
  for (let kind = 0; kind < 4; kind++) {
    const list = flowers.filter(f => f[4] === kind); if (!list.length) continue;
    const fm = new THREE.InstancedMesh(crossedQuads(2, 0.35, 1, kind / 4 + 0.005, (kind + 1) / 4 - 0.005), VEG.flowerMat, list.length);
    list.forEach(([x, s, h, a], i) => { q.setFromAxisAngle(up, a); m.compose(p.set(x, heightAt(x, s) - 0.02, -s), q, sc.set(1, h, 1)); fm.setMatrixAt(i, m); });
    fm.receiveShadow = true; fm.layers.set(2); world.add(fm);
  }
  console.log('vegetation:', tufts.length, 'tufts,', flowers.length, 'flowers');
}
function updateVegetation(dt) { VEG.uniforms.uTime.value += dt; VEG.uniforms.uWind.value.set(wind.x, -wind.z); }

/* ---------- tee markers: a pair of coloured posts with a ball on top for every tee of every hole ---------- */
function buildTeeMarkers() {
  const list = [];
  for (const no of HOLE_NOS) {
    const h = COURSE.holes[no];
    for (const ts of Object.values(h.teeSpots)) {
      // the markers stand across the line of play, 1 m in front of the tee spot
      const d = h.dir, a0 = pointAlong(h.line, 0), dir = ts.box ? d : d;
      const fx = ts.x + dir[0] * 1.0, fs = ts.s + dir[1] * 1.0, rx = dir[1], rs = -dir[0];
      for (const side of [-1, 1]) list.push([fx + rx * 2.4 * side, fs + rs * 2.4 * side, ts.col]);
    }
  }
  const postGeo = new THREE.CylinderGeometry(0.035, 0.045, 0.32, 10); postGeo.translate(0, 0.16, 0);
  const ballGeo = new THREE.SphereGeometry(0.075, 16, 10); ballGeo.translate(0, 0.38, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
  const posts = new THREE.InstancedMesh(postGeo, mat, list.length), balls = new THREE.InstancedMesh(ballGeo, mat, list.length);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  list.forEach(([x, s, col], i) => {
    m.makeTranslation(x, heightAt(x, s) - 0.03, -s);
    posts.setMatrixAt(i, m); balls.setMatrixAt(i, m);
    c.set(col); posts.setColorAt(i, c.clone().multiplyScalar(0.85)); balls.setColorAt(i, c);
  });
  for (const im of [posts, balls]) { im.castShadow = true; world.add(im); }
}
