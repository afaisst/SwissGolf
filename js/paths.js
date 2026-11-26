// SwissGolf – paths and roads as draped ribbons with their own textures (gravel / asphalt) and crisp edges
'use strict';

function makeGravelTexture(asphalt) {
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
  const ctx = c.getContext('2d');
  const r = mulberry32(asphalt ? 77 : 42);
  ctx.fillStyle = asphalt ? '#5e6166' : '#b9ad97'; ctx.fillRect(0, 0, N, N);
  // grain
  const img = ctx.getImageData(0, 0, N, N), d = img.data;
  for (let i = 0; i < N * N; i++) { const k = (r() - 0.5) * (asphalt ? 26 : 34); d[i * 4] += k; d[i * 4 + 1] += k; d[i * 4 + 2] += k * 0.9; }
  ctx.putImageData(img, 0, 0);
  // stones (wrap around in u so the texture tiles along the path)
  const n = asphalt ? 2600 : 5200;
  for (let i = 0; i < n; i++) {
    const x = r() * N, y = r() * N, rad = asphalt ? 0.6 + r() * 1.2 : 1.0 + r() * r() * 5.5;
    const g = asphalt ? 70 + r() * 70 : 120 + r() * 110, tint = asphalt ? 0 : (r() - 0.5) * 30;
    ctx.fillStyle = `rgb(${g + tint},${g + tint * 0.6},${g - tint * 0.4})`;
    for (const ox of [-N, 0, N]) { ctx.beginPath(); ctx.ellipse(x + ox, y, rad, rad * (0.6 + r() * 0.4), r() * 3, 0, 7); ctx.fill(); }
    if (!asphalt && rad > 2.5) { ctx.fillStyle = 'rgba(40,30,20,0.25)'; ctx.beginPath(); ctx.ellipse(x + 0.8, y + 0.8, rad, rad * 0.7, 0, 0, 7); ctx.fill(); }
  }
  // edges: v = 0 / 1 are the borders of the ribbon – a darker trampled rim with a few blades of grass
  const edge = ctx.createLinearGradient(0, 0, 0, N);
  if (asphalt) {
    edge.addColorStop(0, 'rgba(30,30,30,0.6)'); edge.addColorStop(0.04, 'rgba(0,0,0,0)'); edge.addColorStop(0.96, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(30,30,30,0.6)');
  } else {
    edge.addColorStop(0, 'rgba(70,80,40,0.85)'); edge.addColorStop(0.07, 'rgba(90,80,60,0.35)'); edge.addColorStop(0.16, 'rgba(0,0,0,0)');
    edge.addColorStop(0.84, 'rgba(0,0,0,0)'); edge.addColorStop(0.93, 'rgba(90,80,60,0.35)'); edge.addColorStop(1, 'rgba(70,80,40,0.85)');
  }
  ctx.fillStyle = edge; ctx.fillRect(0, 0, N, N);
  if (!asphalt) for (let i = 0; i < 900; i++) {
    const x = r() * N, top = r() < 0.5, y = top ? r() * N * 0.07 : N - r() * N * 0.07;
    ctx.strokeStyle = `rgba(${60 + r() * 50},${100 + r() * 50},${30 + r() * 30},0.9)`; ctx.lineWidth = 1 + r();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 6, y + (top ? 1 : -1) * (4 + r() * 10)); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

function ribbonGeometry(list, step = 0.5) {
  const pos = [], uv = [], idx = [], cut = [];      // cut: vertex under the club house model's paving
  let n = 0;
  for (const f of list) {
    const P = f.pts, w = f.w / 2;
    // resample the polyline
    const S = [];
    for (let i = 0; i < P.length - 1; i++) {
      const L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]), k = Math.max(1, Math.ceil(L / step));
      for (let j = 0; j < k; j++) S.push([lerp(P[i][0], P[i + 1][0], j / k), lerp(P[i][1], P[i + 1][1], j / k)]);
    }
    S.push(P[P.length - 1]);
    let u = 0, prev = null, started = false;
    for (let i = 0; i < S.length; i++) {
      const [x, s] = S[i];
      if (x < X0 + 2 || x > X1 - 2 || s < S0 + 2 || s > S1 - 2 || waterDist(x, s) < 0.4) { started = false; prev = null; continue; }  // bridges cover water
      const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)];
      let tx = b[0] - a[0], ts = b[1] - a[1]; const tl = Math.hypot(tx, ts) || 1; tx /= tl; ts /= tl;
      const nx = ts, ns = -tx;                                   // right-hand normal
      if (prev) u += Math.hypot(x - prev[0], s - prev[1]) / (asphaltOf(f) ? 3.0 : 1.6);
      prev = [x, s];
      // several vertices across the width, each on the ground, so the terrain never pokes through the middle
      const nc = Math.max(2, Math.ceil(f.w / 0.8) + 1);
      for (let c = 0; c < nc; c++) {
        const t = c / (nc - 1), side = t * 2 - 1, px = x + nx * w * side, ps = s + ns * w * side;
        const edge = Math.abs(side) > 0.99 ? 0.03 : 0.07;               // edges sit lower so they blend into the grass
        pos.push(px, heightAt(px, ps) + edge, -ps); uv.push(u, t);
        cut.push(CLUB_PAD ? CLUB_PAD.inModel(px, ps, 0.4) : false);
      }
      if (started) { const v = n - nc; for (let c = 0; c < nc - 1; c++) {
        if (cut[v + c] || cut[v + c + 1] || cut[v + nc + c] || cut[v + nc + c + 1]) continue;   // road ends at the club house paving
        idx.push(v + c, v + c + 1, v + nc + c, v + c + 1, v + nc + c + 1, v + nc + c); } }
      started = true; n += nc;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}
function asphaltOf(f) { return f.t.sf === 'asphalt' && !['footway', 'path', 'track'].includes(f.t.hw) || ['primary', 'secondary', 'tertiary', 'unclassified', 'service', 'residential'].includes(f.t.hw); }

function buildPaths() {
  const gravel = [], asphalt = [];
  for (const f of FEAT.paths.concat(FEAT.roads)) (asphaltOf(f) ? asphalt : gravel).push(f);
  const mk = (list, tex, rough, order) => {
    if (!list.length) return;
    const m = new THREE.Mesh(ribbonGeometry(list), new THREE.MeshStandardMaterial({
      map: tex, roughness: rough, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 - order, envMapIntensity: 0.4 }));
    m.receiveShadow = true; m.renderOrder = 1 + order;
    world.add(m);
  };
  mk(gravel, makeGravelTexture(false), 0.95, 0);
  mk(asphalt, makeGravelTexture(true), 0.8, 1);
}

/* ---------- railway: ballast bed, sleepers and two rails (metre gauge) following the OSM centre line ---------- */
function buildRails() {
  if (!FEAT.rails.length) return;
  // ballast: a darker gravel ribbon
  const bed = FEAT.rails.map(f => ({ t: { hw: 'track' }, pts: f.pts, w: 3.0 }));
  const bm = new THREE.Mesh(ribbonGeometry(bed), new THREE.MeshStandardMaterial({ map: makeGravelTexture(false), color: 0x9a938a, roughness: 0.97,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  bm.receiveShadow = true; bm.renderOrder = 2; world.add(bm);
  // sample the centre lines every 0.65 m
  const samples = [];
  for (const f of FEAT.rails) {
    const P = f.pts, line = [];
    for (let i = 0; i < P.length - 1; i++) {
      const L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]), k = Math.max(1, Math.ceil(L / 0.65));
      for (let j = 0; j < k; j++) line.push([lerp(P[i][0], P[i + 1][0], j / k), lerp(P[i][1], P[i + 1][1], j / k)]);
    }
    line.push(P[P.length - 1]);
    samples.push(line);
  }
  // sleepers (concrete)
  const n = samples.reduce((a, l) => a + l.length, 0);
  const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.12, 0.24), new THREE.MeshStandardMaterial({ color: 0x8b8680, roughness: 0.9 }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
  let k = 0;
  // rails: steel profile (top + two sides) as one strip per rail
  const rp = [], ri = []; let rv = 0;
  for (const line of samples) {
    let started = false;
    for (let i = 0; i < line.length; i++) {
      const [x, s] = line[i], a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
      if (x < X0 + 2 || x > X1 - 2 || s < S0 + 2 || s > S1 - 2) { started = false; continue; }   // only on the modelled terrain
      let tx = b[0] - a[0], ts = b[1] - a[1]; const tl = Math.hypot(tx, ts) || 1; tx /= tl; ts /= tl;
      const nx = ts, ns = -tx, h = heightAt(x, s) + 0.1;
      q.setFromAxisAngle(up, Math.atan2(-tx, ts));                      // sleeper square to the rails: local X -> (nx, -ns) in world
      m.compose(pos.set(x, h, -s), q, one); sl.setMatrixAt(k++, m);
      for (const side of [-1, 1]) {
        const cx = x + nx * 0.53 * side, cs = s + ns * 0.53 * side;
        for (const [ox, oy] of [[-0.035, 0], [-0.035, 0.14], [0.035, 0.14], [0.035, 0]]) rp.push(cx + nx * ox, h + 0.06 + oy, -(cs + ns * ox));
      }
      if (started) for (let r = 0; r < 2; r++) {
        const c = rv - 8 + r * 4, d = rv + r * 4;                          // previous / current ring of this rail
        for (let f = 0; f < 3; f++) ri.push(c + f, d + f, c + f + 1, c + f + 1, d + f, d + f + 1);
      }
      started = true; rv += 8;
    }
    rv = rp.length / 3;
  }
  sl.count = k; sl.castShadow = true; sl.receiveShadow = true; world.add(sl);
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setIndex(ri); rg.computeVertexNormals();
  const rails = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0x8e9196, metalness: 0.75, roughness: 0.35, side: THREE.DoubleSide }));
  rails.castShadow = true; world.add(rails);
}
