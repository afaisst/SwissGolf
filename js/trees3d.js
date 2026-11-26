// SwissGolf – detailed procedural trees: a Norway spruce (Jura / Swiss forests) and a broadleaf tree (beech-like).
// Wood = tapered cylinders, foliage = alpha-tested cards with canvas-painted textures (needle sprigs / leaf clusters).
// TREES3D.build(kind, seed) → { wood: BufferGeometry, leaves: BufferGeometry, height, crownR } in metres, base at 0.
// TREES3D.materials() → { bark, needles, leaves, needlesDepth, leavesDepth } (shared, create once).
const TREES3D = (() => {
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  /* ---------------- textures ---------------- */
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function texture(c, repeat) {
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    return t;
  }
  // spruce sprig: a twig across the card with dense, forward-swept needles and hanging side shoots
  function needleTexture() {
    const c = canvas(256, 256), g = c.getContext('2d'), r = rng(7);
    const twig = (x0, y0, x1, y1, len, n, w) => {
      g.strokeStyle = '#4a3a26'; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
      for (let i = 0; i < n; i++) {
        const t = i / n, px = x0 + dx * t, py = y0 + dy * t, l = len * (0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, t * 1.15)));
        for (const side of [-1, 1]) {
          const a = Math.atan2(uy, ux) + side * (0.75 + r() * 0.35);
          const h = 112 + r() * 30, sat = 30 + r() * 22, lit = 28 + r() * 22;
          g.strokeStyle = `hsl(${h},${sat}%,${lit}%)`; g.lineWidth = 2.2 + r() * 1.4;
          g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); g.stroke();
        }
      }
    };
    twig(8, 128, 250, 120, 22, 80, 3.5);
    for (let k = 0; k < 14; k++) {         // side shoots filling the card
      const t = 0.06 + k * 0.065, x = 8 + 242 * t, y = 128 - 8 * t, side = k % 2 ? 1 : -1;
      twig(x, y, x + 55 * (1 - t * 0.5), y + side * (55 + r() * 35) * (1 - t * 0.45), 14, 30, 1.8);
    }
    return texture(c);
  }
  // beech-like leaf cluster: overlapping oval leaves on a few twigs
  function leafTexture() {
    const c = canvas(256, 256), g = c.getContext('2d'), r = rng(11);
    g.strokeStyle = '#4b3b2a'; g.lineWidth = 2.5;
    const twigs = [];
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k - 2) * 0.55 + (r() - 0.5) * 0.3, L = 70 + r() * 40;
      const x1 = 128 + Math.cos(a) * L, y1 = 230 + Math.sin(a) * L * 1.6;
      g.beginPath(); g.moveTo(128, 250); g.quadraticCurveTo(128 + Math.cos(a) * L * 0.4, 240 + Math.sin(a) * L * 0.6, x1, y1); g.stroke();
      twigs.push([128, 250, x1, y1]);
    }
    for (let i = 0; i < 150; i++) {
      const tw = twigs[i % twigs.length], t = 0.25 + r() * 0.8;
      const x = tw[0] + (tw[2] - tw[0]) * t + (r() - 0.5) * 90, y = tw[1] + (tw[3] - tw[1]) * t + (r() - 0.5) * 80;
      if (Math.hypot(x - 128, y - 125) > 118) continue;
      const a = r() * Math.PI * 2, lw = 13 + r() * 7, lh = 24 + r() * 10;
      const h = 78 + r() * 28, sat = 36 + r() * 25, lit = 32 + r() * 24;
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = `hsl(${h},${sat}%,${lit}%)`; g.beginPath(); g.ellipse(0, 0, lw / 2, lh / 2, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = `hsla(${h},${sat}%,${lit + 14}%,0.7)`; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -lh / 2); g.lineTo(0, lh / 2); g.stroke();
      g.restore();
    }
    return texture(c);
  }
  function barkTexture(conifer) {
    const c = canvas(64, 256), g = c.getContext('2d'), r = rng(conifer ? 3 : 5);
    g.fillStyle = conifer ? '#5a4030' : '#7d7a72'; g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 260; i++) {
      const x = r() * 64, y = r() * 256, l = conifer ? 6 + r() * 14 : 20 + r() * 60, d = r() < 0.5;
      g.strokeStyle = d ? (conifer ? 'rgba(40,26,18,0.55)' : 'rgba(80,78,72,0.5)') : (conifer ? 'rgba(130,95,70,0.35)' : 'rgba(160,158,150,0.35)');
      g.lineWidth = conifer ? 2 + r() * 3 : 1 + r() * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y + l); g.stroke();
    }
    return texture(c, true);
  }
  let MATS = null;
  function materials() {
    if (MATS) return MATS;
    const needleMap = needleTexture(), leafMap = leafTexture();
    const foliage = (map) => new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, vertexColors: true, envMapIntensity: 0.3 });
    MATS = {
      barkC: new THREE.MeshStandardMaterial({ map: barkTexture(true), roughness: 0.95, vertexColors: true }),
      barkD: new THREE.MeshStandardMaterial({ map: barkTexture(false), roughness: 0.9, vertexColors: true }),
      needles: foliage(needleMap), leaves: foliage(leafMap),
      needlesDepth: new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: needleMap, alphaTest: 0.45, side: THREE.DoubleSide }),
      leavesDepth: new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafMap, alphaTest: 0.45, side: THREE.DoubleSide })
    };
    return MATS;
  }

  /* ---------------- geometry builders ---------------- */
  class Builder {
    constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; }
    get count() { return this.p.length / 3; }
    vert(p, n, u, v, shade) { this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.uv.push(u, v); this.c.push(shade, shade, shade); return this.count - 1; }
    // tapered tube from a to b, radii ra / rb, `sides` facets; bark u around, v along (metres / 2)
    tube(a, b, ra, rb, sides, shadeA = 1, shadeB = 1, v0 = 0) {
      const d = b.clone().sub(a), L = d.length(); d.normalize();
      const t1 = Math.abs(d.y) < 0.9 ? V(0, 1, 0).cross(d).normalize() : V(1, 0, 0).cross(d).normalize(), t2 = d.clone().cross(t1);
      const base = this.count;
      for (let k = 0; k <= sides; k++) {
        const ang = (k / sides) * Math.PI * 2, n = t1.clone().multiplyScalar(Math.cos(ang)).addScaledVector(t2, Math.sin(ang));
        this.vert(a.clone().addScaledVector(n, ra), n, k / sides, v0, shadeA);
        this.vert(b.clone().addScaledVector(n, rb), n, k / sides, v0 + L / 2, shadeB);
      }
      for (let k = 0; k < sides; k++) { const q = base + k * 2; this.i.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      return v0 + L / 2;
    }
    // foliage card: centre c, axis along the card `u` (length w), across `v` (height h), normal for lighting `nrm`
    card(c, u, v, w, h, nrm, shade, flip = false) {
      const base = this.count, hu = u.clone().multiplyScalar(w / 2), hv = v.clone().multiplyScalar(h / 2);
      const P = [c.clone().sub(hu).sub(hv), c.clone().add(hu).sub(hv), c.clone().add(hu).add(hv), c.clone().sub(hu).add(hv)];
      const U = flip ? [[1, 0], [0, 0], [0, 1], [1, 1]] : [[0, 0], [1, 0], [1, 1], [0, 1]];
      P.forEach((p, k) => this.vert(p, nrm, U[k][0], U[k][1], shade));
      this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.setIndex(this.i); g.computeBoundingSphere(); return g;
    }
  }
  const perp = d => (Math.abs(d.y) < 0.95 ? V(0, 1, 0) : V(1, 0, 0)).cross(d).normalize();
  // foliage normal: mostly "away from the crown's core" with a lift, so the canopy shades like a soft volume
  const crownNormal = (p, core, lift = 0.35) => p.clone().sub(core).normalize().add(V(0, lift, 0)).normalize();

  /* ---------------- Norway spruce ---------------- */
  function spruce(seed, lite) {
    const r = rng(seed), W = new Builder(), F = new Builder();
    const H = 17 + r() * 6, R = H * (0.24 + r() * 0.04), clear = 1.6 + r() * 1.2, lean = V((r() - 0.5) * 0.04, 1, (r() - 0.5) * 0.04).normalize();
    const axis = t => lean.clone().multiplyScalar(t * H);
    // trunk in segments (slight taper) up to the leader
    let v = 0; const segs = 6;
    for (let k = 0; k < segs; k++) {
      const t0 = k / segs, t1 = (k + 1) / segs;
      v = W.tube(axis(t0), axis(t1), 0.024 * H * (1 - t0 * 0.92) + 0.02, 0.024 * H * (1 - t1 * 0.92) + 0.02, k < 3 ? 7 : 5, 0.75, 0.75, v);
    }
    // branch whorls: long and drooping below, short and swept up near the top
    for (let y = clear; y < H - 0.4; y += (0.36 + r() * 0.14) * (lite ? 1.7 : 1)) {
      const t = y / H, nB = 5 + Math.floor(r() * 3), phase = r() * 6.28;
      const len = R * Math.pow(1 - t, 0.85) * (0.85 + r() * 0.3) + 0.25;
      const droop = 0.55 - 0.85 * t;                       // radians below horizontal (negative = upwards)
      for (let b = 0; b < nB; b++) {
        const az = phase + (b / nB) * 6.28 + (r() - 0.5) * 0.4;
        const out = V(Math.cos(az), 0, Math.sin(az)), start = axis(t);
        const dir = out.clone().multiplyScalar(Math.cos(droop)).add(V(0, -Math.sin(droop), 0)).normalize();
        const mid = start.clone().addScaledVector(dir, len * 0.55);
        const tipDir = out.clone().multiplyScalar(Math.cos(droop * 0.4 - 0.25)).add(V(0, -Math.sin(droop * 0.4 - 0.25), 0)).normalize();
        const tip = mid.clone().addScaledVector(tipDir, len * 0.45);
        const shadeIn = 0.45 + 0.35 * t;
        if (lite) W.tube(start, tip, 0.035 + 0.02 * (1 - t), 0.01, 3, shadeIn, 0.8);
        else { W.tube(start, mid, 0.035 + 0.02 * (1 - t), 0.022, 3, shadeIn, 0.7); W.tube(mid, tip, 0.022, 0.008, 3, 0.7, 0.85); }
        // sprig cards along the branch: one lying flat, one hanging; the cards overlap towards the tip
        const nC = lite ? Math.max(1, Math.round(len / 1.0)) : Math.max(2, Math.round(len / 0.55)), big = lite ? 1.35 : 1;
        for (let k = 0; k < nC; k++) {
          const f = (k + 0.5) / nC, p = f < 0.55 ? start.clone().lerp(mid, f / 0.55) : mid.clone().lerp(tip, (f - 0.55) / 0.45);
          const d = (f < 0.55 ? dir : tipDir).clone(), side = perp(d), w = (Math.min(1.7, len * 0.8) + 0.35) * big, h = w * 0.95;
          const c = p.clone().addScaledVector(d, w * 0.12), shade = clampN(0.8 + 0.45 * f + 0.2 * t);
          const n = crownNormal(c, axis(t * 0.92), 0.45);
          const up = side.clone().applyAxisAngle(d, 0.35), hang = side.clone().applyAxisAngle(d, -1.15), tilt = side.clone().applyAxisAngle(d, 0.95 + r() * 0.3);
          F.card(c, d, up, w, h, n, shade);                                                        // spray, slightly raised
          F.card(c.clone().add(V(0, -h * 0.22, 0)), d, hang, w * 0.92, h * 0.7, n, shade * 0.88, true);   // hanging shoots
          if (!lite && k % 2 === 0) F.card(c, d, tilt, w * 0.85, h * 0.7, n, shade * 0.95);                     // fill from the side
        }
      }
    }
    // leader shoot with a few small cards
    for (let k = 0; k < 3; k++) {
      const c = axis(1).add(V(0, -0.3 - k * 0.35, 0)), az = r() * 6.28, u = V(0, 1, 0), s = V(Math.cos(az), 0, Math.sin(az));
      F.card(c, u, s, 0.9, 0.7, s.clone().add(V(0, 0.6, 0)).normalize(), 1);
    }
    return { wood: W.geometry(), leaves: F.geometry(), height: H, crownR: R, kind: 'spruce' };
  }
  const clampN = v => Math.max(0.45, Math.min(1.35, v));

  /* ---------------- broadleaf (beech-like) ---------------- */
  function broadleaf(seed, lite) {
    const r = rng(seed), W = new Builder(), F = new Builder();
    const H = 13 + r() * 5, R = H * (0.34 + r() * 0.08), trunkH = 2.6 + r() * 1.2;
    const core = V(0, trunkH + (H - trunkH) * 0.52, 0), tips = [];
    function branch(a, dir, len, rad, level, v0) {
      // a gently curved limb in two pieces
      const bend = V((r() - 0.5) * 0.35, 0.22 + (r() - 0.3) * 0.15, (r() - 0.5) * 0.35);
      const m = a.clone().addScaledVector(dir, len * 0.5), d2 = dir.clone().add(bend).normalize(), b = m.clone().addScaledVector(d2, len * 0.5);
      const sides = level === 0 ? 8 : level === 1 ? 6 : level === 2 ? 4 : 3;
      const shade = l => 0.55 + 0.12 * l;
      let v = W.tube(a, m, rad, rad * 0.82, sides, shade(level), shade(level), v0);
      v = W.tube(m, b, rad * 0.82, rad * 0.62, sides, shade(level), shade(level + 0.5), v);
      if (level >= 3 || rad < 0.025) { tips.push({ p: b, d: d2, level }); return; }
      const n = level === 0 ? 5 + Math.floor(r() * 2) : 3 + Math.floor(r() * 2);
      for (let k = 0; k < n; k++) {
        const along = level === 0 ? 1 : 0.45 + r() * 0.55;
        const s = along < 0.5 ? a.clone().lerp(m, along * 2) : m.clone().lerp(b, (along - 0.5) * 2);
        const az = (k / n) * 6.28 + r() * 1.2, sp = level === 0 ? 0.4 + r() * 0.35 : 0.45 + r() * 0.4;
        const out = perp(d2).applyAxisAngle(d2, az);
        // children spread out and up, steering towards the crown's ellipsoid
        let nd = d2.clone().multiplyScalar(Math.cos(sp)).addScaledVector(out, Math.sin(sp)).normalize();
        const toEdge = s.clone().sub(core); toEdge.y *= 0.7; nd.addScaledVector(toEdge.normalize(), 0.35).normalize();
        const room = Math.max(0.5, R * 1.05 - Math.hypot(s.x - core.x, (s.y - core.y) * 0.8, s.z - core.z));
        branch(s, nd, Math.min(len * (0.62 + r() * 0.15), room + 0.6), rad * (level === 0 ? 0.55 : 0.6), level + 1, v);
      }
    }
    // trunk with a slight lean and root flare
    const lean = V((r() - 0.5) * 0.12, 1, (r() - 0.5) * 0.12).normalize();
    const base = 0.022 * H + 0.12;
    W.tube(V(0, -0.2, 0), V(0, 0.5, 0), base * 1.45, base, 8, 0.6, 0.65);
    const top = lean.clone().multiplyScalar(trunkH);
    let v = W.tube(V(0, 0.5, 0), top, base, base * 0.82, 8, 0.65, 0.65, 0.35);
    branch(top, lean.clone().add(V(0, 0.4, 0)).normalize(), (H - trunkH) * 0.42, base * 0.82, 0, v);
    // leaf clusters: several cards around every twig tip, plus a sprinkle inside the crown so it is not hollow
    const addCluster = (p, d, size, shadeBase) => {
      const n = crownNormal(p, core, 0.3);
      for (let k = 0; k < (lite ? 2 : 4); k++) {
        // cards face out of the crown (with some jitter), so the dome reads full from every side and from above
        const fn = n.clone().add(V(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.9)).normalize();
        const az = r() * 6.28, u = perp(fn).applyAxisAngle(fn, az), w = size * (0.8 + r() * 0.4) * (lite ? 1.4 : 1);
        const vv = fn.clone().cross(u).normalize();
        const c = p.clone().addScaledVector(d, w * 0.2).add(V((r() - 0.5) * 0.4, (r() - 0.5) * 0.3, (r() - 0.5) * 0.4));
        const dist = Math.hypot(c.x - core.x, (c.y - core.y) * 1.2, c.z - core.z) / R;
        F.card(c, u, vv, w, w, n, clampN(shadeBase + 0.45 * dist + 0.15 * (c.y - core.y) / R), r() < 0.5);
      }
    };
    for (const t of tips) addCluster(t.p, t.d, 2.1 + 0.3 * (3 - t.level), 0.8);
    for (let k = 0; k < (lite ? 45 : 90); k++) {
      const a = r() * 6.28, e = -0.45 + r() * 1.9, rr = R * (0.55 + r() * 0.4);
      const p = core.clone().add(V(Math.cos(a) * Math.cos(e) * rr, Math.sin(e) * rr * 0.75, Math.sin(a) * Math.cos(e) * rr));
      addCluster(p, p.clone().sub(core).normalize(), 2.0, 0.65);
    }
    return { wood: W.geometry(), leaves: F.geometry(), height: H, crownR: R, kind: 'broadleaf' };
  }

  function build(kind, seed = 1, lite = false) { return kind === 'spruce' ? spruce(seed, lite) : broadleaf(seed, lite); }
  // a ready-to-show tree (for previews): Group with wood + foliage meshes
  function mesh(kind, seed = 1) {
    const t = build(kind, seed), M = materials(), conifer = kind === 'spruce';
    const g = new THREE.Group();
    const w = new THREE.Mesh(t.wood, conifer ? M.barkC : M.barkD); w.castShadow = w.receiveShadow = true;
    const f = new THREE.Mesh(t.leaves, conifer ? M.needles : M.leaves); f.castShadow = f.receiveShadow = true;
    f.customDepthMaterial = conifer ? M.needlesDepth : M.leavesDepth;
    g.add(w, f); g.userData.tree = t; return g;
  }
  return { build, mesh, materials };
})();
