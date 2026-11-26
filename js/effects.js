// SwissGolf – small effects: the splash when a ball goes into the water (spray, a little jet, rings)
'use strict';

const FX = { splashes: [] };

function dropTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(235,245,250,0.8)'); gr.addColorStop(1, 'rgba(235,245,250,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// a soft ripple: bright crest with a darker trough just inside it
function ringTexture() {
  const n = 128, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const r = Math.hypot(i - n / 2 + 0.5, j - n / 2 + 0.5) / (n / 2), k = (j * n + i) * 4;
    const crest = Math.exp(-(((r - 0.9) / 0.045) ** 2)), trough = Math.exp(-(((r - 0.78) / 0.06) ** 2));
    const a = Math.max(crest * 0.9, trough * 0.45);
    const bright = crest > trough * 0.5 ? 1 : 0;
    img.data[k] = bright ? 235 : 20; img.data[k + 1] = bright ? 245 : 40; img.data[k + 2] = bright ? 248 : 45; img.data[k + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// x, z: world position; speed: impact speed in m/s (bigger = more spray)
function spawnSplash(x, z, speed = 20) {
  if (!FX.dropTex) {
    FX.dropTex = dropTexture();
    FX.ringTex = ringTexture();
    FX.ringGeo = new THREE.PlaneGeometry(2, 2); FX.ringGeo.rotateX(-Math.PI / 2);
  }
  const wl = (typeof waterLevel === 'function' ? waterLevel(x, -z) : Hw(x, z)) ?? Hw(x, z);
  const y0 = Math.max(wl, Hw(x, z)) + 0.01;
  const k = clamp(speed / 25, 0.45, 1.3);
  // spray: a crown thrown up and out, plus a narrow jet in the middle that comes a moment later
  const N = Math.round(240 * k), pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), born = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const jet = i < N * 0.22, a = Math.random() * Math.PI * 2;
    const h = jet ? (2.6 + Math.random() * 2.2) * k : (1.2 + Math.random() * 2.2) * k, r = jet ? Math.random() * 0.25 : (0.6 + Math.random() * 1.2) * k;
    vel[i * 3] = Math.cos(a) * r; vel[i * 3 + 1] = h; vel[i * 3 + 2] = Math.sin(a) * r;
    pos[i * 3] = x + Math.cos(a) * (jet ? 0.01 : 0.06); pos[i * 3 + 1] = y0; pos[i * 3 + 2] = z + Math.sin(a) * (jet ? 0.01 : 0.06);
    born[i] = jet ? 0.12 + Math.random() * 0.1 : Math.random() * 0.05;
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ size: 0.11, map: FX.dropTex, transparent: true, depthWrite: false, opacity: 0.95, color: 0xf2f8fb });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
  // a white puff of spray at the impact
  const mist = new THREE.Sprite(new THREE.SpriteMaterial({ map: FX.dropTex, color: 0xffffff, transparent: true, depthWrite: false, opacity: 0.9 }));
  mist.position.set(x, y0 + 0.25 * k, z); mist.scale.setScalar(0.3); scene.add(mist);
  // rings spreading over the surface
  const rings = [];
  for (let j = 0; j < 4; j++) {
    const m = new THREE.Mesh(FX.ringGeo, new THREE.MeshBasicMaterial({ map: FX.ringTex, transparent: true, opacity: 0, depthWrite: false }));
    m.position.set(x, y0 + 0.004 + j * 0.001, z); m.scale.setScalar(0.01); m.renderOrder = 3; scene.add(m);
    rings.push({ m, delay: 0.05 + j * 0.32, speed: (0.9 - j * 0.12) * (0.7 + 0.3 * k) });
  }
  FX.splashes.push({ t: 0, mist, k, pts, pos, vel, born, N, y0, rings, x, z });
}

function updateEffects(dt) {
  for (let s = FX.splashes.length - 1; s >= 0; s--) {
    const S = FX.splashes[s]; S.t += dt;
    let alive = 0;
    for (let i = 0; i < S.N; i++) {
      if (S.t < S.born[i]) { alive++; continue; }
      const j = i * 3;
      if (S.pos[j + 1] < S.y0 - 0.05) { S.pos[j + 1] = -1e4; continue; } // fell back in
      S.vel[j + 1] -= 9.81 * dt;
      S.vel[j] += (wind.x * 0.25 - S.vel[j] * 0.4) * dt; S.vel[j + 2] += (wind.z * 0.25 - S.vel[j + 2] * 0.4) * dt;
      S.pos[j] += S.vel[j] * dt; S.pos[j + 1] += S.vel[j + 1] * dt; S.pos[j + 2] += S.vel[j + 2] * dt;
      alive++;
    }
    S.pts.geometry.attributes.position.needsUpdate = true;
    S.pts.material.opacity = 0.95 * (1 - smoothstep(0.9, 1.6, S.t));
    const mt = S.t / 0.7; S.mist.scale.set((0.4 + 1.2 * mt) * S.k, (0.5 + 1.6 * mt) * S.k, 1); S.mist.position.y = S.y0 + (0.25 + 0.5 * mt) * S.k;
    S.mist.material.opacity = 0.8 * Math.max(0, 1 - mt) ** 1.5;
    for (const r of S.rings) {
      const t = S.t - r.delay; if (t < 0) continue;
      const rad = 0.08 + r.speed * Math.sqrt(t) * 1.6;      // fast at first, then slowing down
      r.m.scale.set(rad, 1, rad);
      r.m.material.opacity = 0.85 * smoothstep(0, 0.12, t) * (1 - smoothstep(0.4, 3.2, t)) * (1 / (1 + rad * 0.3));
    }
    if (S.t > 4.2) {
      scene.remove(S.pts); S.pts.geometry.dispose(); S.pts.material.dispose(); scene.remove(S.mist); S.mist.material.dispose();
      for (const r of S.rings) { scene.remove(r.m); r.m.material.dispose(); }
      FX.splashes.splice(s, 1);
    }
  }
}
