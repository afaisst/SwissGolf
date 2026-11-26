// SwissGolf – the Unterengstringen club house: long red timber building with dark tiled hip roofs, a glazed restaurant
// under a timber cross gable facing the course, a covered terrace with red chairs, the entrance and flag pole on the
// parking side, and the square pavilion (pro shop / carts) with a pyramid roof at the east end.
// Local frame (metres, same handedness as the game world): x along the building to the east (0 = west end, 89.5 = east
// end of the main hall, pavilion beyond), y up (0 = ground), z across: 0 = course-side (south) wall, the terrace at
// +z (south), the parking-side (north) wall at z = −18 with the entrance and flag pole. CLUBHOUSE.build() → Group.
// (The parts below are laid out with the parking side at +z and mirrored to −z when the batch is built.)
const CLUBHOUSE = (() => {
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

  /* ---------------- textures ---------------- */
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function tex(c, metresU, metresV) {
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    t.userData.mu = metresU; t.userData.mv = metresV; return t;
  }
  // horizontal red cladding: 8 boards per tile (tile = 1.6 m tall, 2 m wide), shadow lines under each board
  function cladding() {
    const c = canvas(256, 256), g = c.getContext('2d'), r = rng(4);
    for (let b = 0; b < 8; b++) {
      const y = b * 32;
      const base = [148 + r() * 14, 38 + r() * 6, 30 + r() * 5];
      const grd = g.createLinearGradient(0, y, 0, y + 32);
      grd.addColorStop(0, `rgb(${base[0] + 12},${base[1] + 6},${base[2] + 5})`); grd.addColorStop(1, `rgb(${base[0] - 18},${base[1] - 8},${base[2] - 6})`);
      g.fillStyle = grd; g.fillRect(0, y, 256, 32);
      g.fillStyle = 'rgba(30,6,4,0.55)'; g.fillRect(0, y + 29, 256, 3);              // shadow of the overlap
      for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,220,200' : '40,8,6'},${0.03 + r() * 0.05})`; g.fillRect(r() * 256, y + 2 + r() * 26, 20 + r() * 60, 1); }
      if (r() < 0.6) { g.fillStyle = 'rgba(30,6,4,0.35)'; g.fillRect(Math.floor(r() * 256), y, 2, 29); }   // board joint
    }
    return tex(c, 2, 1.6);
  }
  // dark concrete roof tiles, staggered (tile = 2 m × 2 m)
  function roofTiles() {
    const c = canvas(256, 256), g = c.getContext('2d'), r = rng(9);
    g.fillStyle = '#3f3c3a'; g.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 8; row++) for (let col = 0; col < 7; col++) {
      const x = col * 38 + (row % 2) * 19 - 19, y = row * 32, v = 54 + r() * 16;
      g.fillStyle = `rgb(${v},${v - 3},${v - 6})`; g.fillRect(x + 1, y + 1, 36, 28);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 1, y + 27, 36, 4);
      g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x + 1, y + 1, 36, 3);
    }
    return tex(c, 2, 2);
  }
  // reddish concrete pavers (tile = 1.2 m)
  function pavers() {
    const c = canvas(256, 256), g = c.getContext('2d'), r = rng(13);
    g.fillStyle = '#9c7468'; g.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 8; row++) for (let col = 0; col < 5; col++) {
      const x = col * 64 + (row % 2) * 32 - 32, y = row * 32, v = r() * 18;
      g.fillStyle = `rgb(${178 + v},${132 + v},${118 + v})`; g.fillRect(x + 2, y + 2, 60, 28);
    }
    return tex(c, 1.2, 1.2);
  }
  // terrace decking (wood-look tiles)
  function decking() {
    const c = canvas(256, 256), g = c.getContext('2d'), r = rng(17);
    for (let i = 0; i < 8; i++) { const v = r() * 20; g.fillStyle = `rgb(${120 + v},${100 + v},${84 + v})`; g.fillRect(0, i * 32, 256, 31); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, i * 32 + 31, 256, 1); }
    return tex(c, 2.4, 2.4);
  }
  function timber() {
    const c = canvas(64, 256), g = c.getContext('2d'), r = rng(21);
    g.fillStyle = '#b07a4a'; g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 50; i++) { g.strokeStyle = `rgba(${r() < 0.5 ? '90,55,30' : '210,160,110'},0.35)`; g.lineWidth = 1 + r() * 2; const x = r() * 64; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 6, 256); g.stroke(); }
    return tex(c, 0.3, 1.2);
  }
  function signTexture() {
    const c = canvas(512, 256), g = c.getContext('2d');
    g.fillStyle = '#b3261e'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#f2f2f2'; g.textAlign = 'center'; g.font = '700 118px Arial, Helvetica, sans-serif'; g.fillText('GOLF', 256, 132);
    g.fillRect(70, 158, 372, 4);
    g.font = '500 30px Arial, Helvetica, sans-serif'; g.fillText('U N T E R E N G S T R I N G E N', 256, 206);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }
  function golfLetters() {
    const c = canvas(512, 64), g = c.getContext('2d');
    g.fillStyle = '#f4f4f2'; g.fillRect(0, 0, 512, 64);
    g.fillStyle = '#b3261e'; g.textAlign = 'center'; g.font = '800 52px Arial, Helvetica, sans-serif'; g.fillText('G O L F', 256, 52);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }
  // clipped box hedge: dense small leaves (tile = 0.6 m)
  function hedgeTexture() {
    const c = canvas(128, 128), g = c.getContext('2d'), r = rng(31);
    g.fillStyle = "#3d6324"; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) { const v = r(); g.fillStyle = `hsl(${85 + r() * 20},${42 + r() * 20}%,${24 + v * 24}%)`; g.beginPath(); g.ellipse(r() * 128, r() * 128, 2 + r() * 2, 1.2 + r(), r() * 3, 0, 7); g.fill(); }
    return tex(c, 0.6, 0.6);
  }
  function flagTexture() {
    const c = canvas(128, 128), g = c.getContext('2d');
    g.fillStyle = '#da291c'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#fff';
    g.fillRect(52, 24, 24, 80); g.fillRect(24, 52, 80, 24);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  let MATS = null;
  function materials() {
    if (MATS) return MATS;
    const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85, side: THREE.DoubleSide }, o));   // double sided: planar walls / roofs in any winding
    MATS = {
      clad: std({ map: cladding(), roughness: 0.8 }),
      roof: std({ map: roofTiles(), roughness: 0.9 }),
      pavers: std({ map: pavers(), roughness: 0.95 }),
      concrete: std({ color: 0xb3b0aa, roughness: 0.95 }),
      lawn: std({ color: 0x6f9c44, roughness: 1 }),
      deck: std({ map: decking(), roughness: 0.9 }),
      timber: std({ map: timber(), roughness: 0.75 }),
      redTrim: std({ color: 0xa52a22, roughness: 0.7 }),
      frame: std({ color: 0x3a3d40, roughness: 0.5, metalness: 0.4 }),
      glass: std({ color: 0x23323c, roughness: 0.08, metalness: 0.6, envMapIntensity: 1.2 }),
      steel: std({ color: 0x8d9296, roughness: 0.4, metalness: 0.7 }),
      gutter: std({ color: 0x9a9da0, roughness: 0.45, metalness: 0.5 }),
      awning: std({ color: 0xe9e4d6, roughness: 0.7 }),
      soffit: std({ color: 0x5b3a26, roughness: 0.8 }),
      lamp: std({ color: 0xf1ece2, roughness: 0.6, emissive: 0x2a2620 }),
      chairRed: std({ color: 0xc0181c, roughness: 0.75 }),
      weave: std({ color: 0x1d1c1b, roughness: 0.9 }),
      table: std({ color: 0xe9e6df, roughness: 0.5 }),
      parasol: std({ color: 0x151515, roughness: 0.85, side: THREE.DoubleSide }),
      hedge: std({ map: hedgeTexture(), roughness: 1 }),
      pot: std({ color: 0xb8673e, roughness: 0.9 }),
      herb: std({ color: 0x5f7d4a, roughness: 1 }),
      rock: std({ color: 0x6e6a64, roughness: 1, flatShading: true }),
      dark: std({ color: 0x222426, roughness: 0.7 }),
      white: std({ color: 0xf4f4f2, roughness: 0.6 }),
      sign: std({ map: signTexture(), roughness: 0.6 }),
      golf: std({ map: golfLetters(), roughness: 0.6 }),
      flag: std({ map: flagTexture(), roughness: 0.8, side: THREE.DoubleSide }),
      glassBlue: std({ color: 0x7fa4b8, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.55 })
    };
    return MATS;
  }

  /* ---------------- geometry helpers: everything is batched per material ---------------- */
  const MIRROR = new THREE.Matrix4().makeScale(1, 1, -1);
  class Batch {
    constructor(mirror = false, textMats = []) { this.parts = new Map(); this.mirror = mirror; this.text = new Set(textMats); }
    add(mat, geo, matrix) {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      if (matrix) g.applyMatrix4(matrix);
      if (this.mirror) {
        g.applyMatrix4(MIRROR);
        // a mirror turns every triangle inside out: swap two corners so the faces point outwards again
        for (const name of Object.keys(g.attributes)) {
          const at = g.attributes[name], k = at.itemSize, arr = at.array, tmp = new Float32Array(k);
          for (let t = 0; t + 2 < at.count; t += 3) {
            const i1 = (t + 1) * k, i2 = (t + 2) * k;
            tmp.set(arr.subarray(i1, i1 + k)); arr.copyWithin(i1, i2, i2 + k); arr.set(tmp, i2);
          }
        }
        if (this.text.has(mat) && g.attributes.uv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); }   // keep lettering readable
      }
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!this.parts.has(mat)) this.parts.set(mat, []);
      this.parts.get(mat).push(g);
    }
    // a box from min to max corner (axis aligned in local space) – optional rotation about y around its centre
    box(mat, x0, y0, z0, x1, y1, z1, rotY = 0) {
      const W = Math.abs(x1 - x0), H = Math.abs(y1 - y0), Dz = Math.abs(z1 - z0), g = new THREE.BoxGeometry(W, H, Dz);
      if (mat.map) {             // texture in metres on every face (BoxGeometry gives 0..1 per face)
        const mu = mat.map.userData.mu || 1, mv = mat.map.userData.mv || 1, uv = g.attributes.uv;
        const dims = [[Dz, H], [Dz, H], [W, Dz], [W, Dz], [W, H], [W, H]];
        for (let i = 0; i < uv.count; i++) { const [du, dv] = dims[Math.floor(i / 4)]; uv.setXY(i, uv.getX(i) * du / mu, uv.getY(i) * dv / mv); }
      }
      const m = new THREE.Matrix4().makeRotationY(rotY).setPosition((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      this.add(mat, g, m);
    }
    // planar polygon (convex, ordered) with world-metre UVs projected on its own plane (u along the first edge)
    poly(mat, pts, flip = false) {
      const P = flip ? pts.slice().reverse() : pts;
      const e1 = P[1].clone().sub(P[0]).normalize(), n = P[1].clone().sub(P[0]).cross(P[2].clone().sub(P[0])).normalize(), e2 = n.clone().cross(e1);
      const pos = [], uv = [];
      const mu = mat.map ? mat.map.userData.mu || 1 : 1, mv = mat.map ? mat.map.userData.mv || 1 : 1;
      const put = p => { pos.push(p.x, p.y, p.z); const d = p.clone().sub(P[0]); uv.push(d.dot(e1) / mu, d.dot(e2) / mv); };
      for (let i = 1; i < P.length - 1; i++) { put(P[0]); put(P[i]); put(P[i + 1]); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      this.add(mat, g);
    }
    // vertical wall from (x0,z0) to (x1,z1), facing to the left of the direction, v measured from the ground
    wall(mat, x0, z0, x1, z1, y0, y1) {
      const a = V(x0, y0, z0), b = V(x1, y0, z1), c = V(x1, y1, z1), d = V(x0, y1, z0);
      this.poly(mat, [a, b, c, d]);
    }
    cyl(mat, x, y0, z, r0, r1, h, seg = 10) {
      const g = new THREE.CylinderGeometry(r1, r0, h, seg); this.add(mat, g, new THREE.Matrix4().makeTranslation(x, y0 + h / 2, z));
    }
    build(group, shadows = true) {
      for (const [mat, list] of this.parts) {
        let n = 0; for (const g of list) n += g.attributes.position.count;
        const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
        let o = 0;
        for (const g of list) {
          pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
          o += g.attributes.position.count; g.dispose();
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = shadows && !mat.transparent; mesh.receiveShadow = true;
        group.add(mesh);
      }
    }
  }

  // hip roof over the rectangle [x0,x1]×[z0,z1] (eaves already include the overhang), eave height y, pitch (rad).
  // hipW / hipE: hipped (true) or gable (false) ends; a gable end gets a red-clad triangle down to the wall line.
  function hipRoof(B, M, x0, x1, z0, z1, y, pitch, hipW = true, hipE = true, gableInset = 0.8) {
    const D = z1 - z0, h = (D / 2) * Math.tan(pitch), zr = (z0 + z1) / 2, yr = y + h;
    const rx0 = hipW ? x0 + D / 2 : x0, rx1 = hipE ? x1 - D / 2 : x1;
    const A = V(x0, y, z0), Bq = V(x1, y, z0), C = V(x1, y, z1), Dq = V(x0, y, z1), R0 = V(rx0, yr, zr), R1 = V(rx1, yr, zr);
    B.poly(M.roof, [A, Bq, R1, R0], true);          // course-side slope
    B.poly(M.roof, [C, Dq, R0, R1], true);          // parking-side slope
    if (hipW) B.poly(M.roof, [Dq, A, R0], true); else B.poly(M.clad, [V(x0 + gableInset, y, z0 + gableInset), V(x0 + gableInset, yr - 0.2, zr), V(x0 + gableInset, y, z1 - gableInset)]);
    if (hipE) B.poly(M.roof, [Bq, C, R1], true); else B.poly(M.clad, [V(x1 - gableInset, y, z1 - gableInset), V(x1 - gableInset, yr - 0.2, zr), V(x1 - gableInset, y, z0 + gableInset)]);
    // fascia (red board) and grey gutter along both eaves, dark soffit underneath
    for (const [za, dz] of [[z0, -1], [z1, 1]]) {
      B.box(M.redTrim, x0, y - 0.28, za - 0.02, x1, y + 0.02, za + 0.02 * dz);
      B.box(M.gutter, x0, y - 0.12, za + 0.06 * dz, x1, y + 0.02, za + 0.16 * dz);
    }
    B.poly(M.soffit, [V(x0, y - 0.28, z0), V(x1, y - 0.28, z0), V(x1, y - 0.28, z1), V(x0, y - 0.28, z1)]);
    // ridge cap
    B.box(M.roof, rx0, yr - 0.05, zr - 0.14, rx1, yr + 0.1, zr + 0.14);
    return yr;
  }

  // ribbon window: dark frame with mullions, glass, set into a wall plane at z (facing ±z)
  function windowZ(B, M, x0, x1, y0, y1, z, out, panes = 0) {
    const t = 0.06;
    B.box(M.glass, x0, y0, z - 0.02, x1, y1, z + 0.02);
    B.box(M.frame, x0 - t, y0 - t, z, x1 + t, y0, z + out * 0.1);
    B.box(M.frame, x0 - t, y1, z, x1 + t, y1 + t, z + out * 0.1);
    B.box(M.frame, x0 - t, y0, z, x0, y1, z + out * 0.1);
    B.box(M.frame, x1, y0, z, x1 + t, y1, z + out * 0.1);
    const n = panes || Math.max(1, Math.round((x1 - x0) / 1.3));
    for (let k = 1; k < n; k++) { const x = x0 + (x1 - x0) * k / n; B.box(M.frame, x - 0.03, y0, z, x + 0.03, y1, z + out * 0.08); }
  }

  /* ---------------- terrace furniture ---------------- */
  function chair(B, M, x, z, rot) {
    (B.chairs || (B.chairs = [])).push([x, z, rot]);
    const m = new THREE.Matrix4().makeRotationY(rot + Math.PI).setPosition(x, 0, z),   /* rot = direction the sitter faces (+π: back away from the table) */ add = (mat, g, px, py, pz) => B.add(mat, g, m.clone().multiply(new THREE.Matrix4().makeTranslation(px, py, pz)));
    add(M.steel, new THREE.BoxGeometry(0.04, 0.45, 0.04), -0.24, 0.225, -0.24); add(M.steel, new THREE.BoxGeometry(0.04, 0.45, 0.04), 0.24, 0.225, -0.24);
    add(M.steel, new THREE.BoxGeometry(0.04, 0.9, 0.04), -0.24, 0.45, 0.24); add(M.steel, new THREE.BoxGeometry(0.04, 0.9, 0.04), 0.24, 0.45, 0.24);
    add(M.steel, new THREE.BoxGeometry(0.04, 0.04, 0.52), -0.27, 0.66, 0); add(M.steel, new THREE.BoxGeometry(0.04, 0.04, 0.52), 0.27, 0.66, 0);   // arm rests
    add(M.chairRed, new THREE.BoxGeometry(0.5, 0.08, 0.5), 0, 0.48, 0);          // seat cushion
    add(M.chairRed, new THREE.BoxGeometry(0.5, 0.42, 0.06), 0, 0.74, 0.2);        // back cushion
    add(M.weave, new THREE.BoxGeometry(0.52, 0.44, 0.03), 0, 0.72, 0.25);         // woven back
  }
  function table(B, M, x, z) {
    B.box(M.table, x - 0.4, 0.73, z - 0.4, x + 0.4, 0.76, z + 0.4);
    B.cyl(M.steel, x, 0, z, 0.03, 0.03, 0.73, 6);
    B.box(M.steel, x - 0.3, 0, z - 0.03, x + 0.3, 0.03, z + 0.03); B.box(M.steel, x - 0.03, 0, z - 0.3, x + 0.03, 0.03, z + 0.3);
    B.add(M.pot, new THREE.CylinderGeometry(0.07, 0.055, 0.1, 8), new THREE.Matrix4().makeTranslation(x, 0.81, z));
    B.add(M.herb, new THREE.IcosahedronGeometry(0.09, 0), new THREE.Matrix4().makeScale(1, 1.4, 1).setPosition(x, 0.92, z));
  }
  function parasol(B, M, x, z) {
    B.cyl(M.steel, x, 0, z, 0.03, 0.03, 2.5, 6);
    B.add(M.parasol, new THREE.ConeGeometry(1.5, 0.45, 12, 1, true), new THREE.Matrix4().makeTranslation(x, 2.45, z));
    B.add(M.dark, new THREE.CylinderGeometry(0.25, 0.35, 0.08, 8), new THREE.Matrix4().makeTranslation(x, 0.04, z));
  }

  /* ---------------- the building ---------------- */
  function build(opt = {}) {
    const M = materials(), B = new Batch(true, [M.sign, M.golf]), group = new THREE.Group();
    const S = [];    // solids for collisions: [x0, x1, z0, z1, y0, y1, kind, matrix?] in this (pre-mirror) frame
    const WALL = 3.7, PITCH = 0.42, OV = 0.9;          // wall height, roof pitch (~24°), eave overhang
    const L = 89.5, D = 18;
    const R0 = 16, R1 = 56, GX0 = 21, GX1 = 35;          // glazed restaurant front and its timber gable (west part, as in the aerial view)

    // ---- floor slab, terrace and paths ----
    B.box(M.pavers, -1.5, -1.5, -7.5, 60, 0.04, -0.01);                 // course-side terrace (pavers)
    B.box(M.deck, R0 + 0.2, 0.04, -6, R1, 0.08, -0.01);                     // decked restaurant terrace
    B.box(M.pavers, -2, -1.5, D, L + 1, 0.03, D + 10);                     // paved apron along the whole parking side
    // plinths: the model stands on uneven ground in the game, so the walls continue 1.5 m below the floor
    B.box(M.concrete, -0.05, -1.5, -0.05, L + 0.05, 0.0, D + 0.05); B.box(M.concrete, 16, -1.5, D, 33, 0.0, D + 2.65);
    B.box(M.concrete, 95.95, -1.5, -3.55, 114.05, 0.0, 15.05);                    // entrance forecourt

    // ---- walls: red cladding everywhere except the glazed restaurant front ----
    const wallRun = (pts, y1 = WALL) => { for (let i = 0; i < pts.length - 1; i++) B.wall(M.clad, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 0, y1); };
    // course side (z = 0), walking west → east the outward normal must point to −z: build east → west
    wallRun([[R0, 0], [0, 0]]); wallRun([[L, 0], [R1, 0]]);
    wallRun([[0, 0], [0, D]]); wallRun([[L, D], [L, 0]]);
    wallRun([[0, D], [16, D], [16, D + 2.6], [33, D + 2.6], [33, D], [L, D]]);   // parking side with the entrance bay
    // restaurant: floor-to-ceiling glazing with dark frames between x 24 and 58
    for (let x = R0; x < R1; x += 2.0) {
      const x1 = Math.min(R1, x + 2.0);
      B.box(M.glass, x, 0.08, -0.03, x1, WALL - 0.3, 0.03);
      B.box(M.frame, x - 0.05, 0.08, -0.08, x + 0.05, WALL - 0.3, 0.05);
    }
    B.box(M.frame, R0, WALL - 0.42, -0.08, R1, WALL - 0.3, 0.05); B.box(M.frame, R0, 0.08, -0.08, R1, 0.2, 0.05); B.box(M.frame, R1 - 0.05, 0.08, -0.08, R1 + 0.05, WALL - 0.3, 0.05);
    B.box(M.clad, R0, WALL - 0.3, -0.05, R1, WALL, 0.05);
    // dark interior behind the glass so the restaurant does not look hollow
    B.box(M.dark, R0 + 0.2, 0.05, 0.4, R1 - 0.2, WALL - 0.3, 0.6);

    // ---- windows ----
    // parking side ribbon windows (long dark-framed band) and a few singles
    windowZ(B, M, 40, 46, 2.0, 2.8, D + 0.02, 1, 3); windowZ(B, M, 48, 50.5, 2.0, 2.8, D + 0.02, 1, 1); windowZ(B, M, 53, 56, 2.0, 2.8, D + 0.02, 1, 2);
    windowZ(B, M, 60, 74, 1.9, 2.9, D + 0.02, 1, 6); windowZ(B, M, 78, 86, 1.9, 2.9, D + 0.02, 1, 4);
    windowZ(B, M, 3, 8, 1.9, 2.9, D + 0.02, 1, 3); windowZ(B, M, 9.5, 14, 1.9, 2.9, D + 0.02, 1, 3);
    // course side: west wing and east wing windows
    windowZ(B, M, 2.5, 7.5, 0.9, 2.8, -0.02, -1, 3); windowZ(B, M, 9, 14, 0.9, 2.8, -0.02, -1, 3);
    windowZ(B, M, 61, 70, 0.9, 2.8, -0.02, -1, 5); windowZ(B, M, 73, 86, 1.6, 2.8, -0.02, -1, 6);
    // entrance (parking side): double glass door, dark steel door, a frosted panel
    windowZ(B, M, 22.5, 25.5, 0.02, 2.5, D + 2.62, 1, 2);
    B.box(M.dark, 30, 0.02, D + 2.6, 31.4, 2.3, D + 2.68);
    B.box(M.glassBlue, 36.5, 0.3, D + 0.02, 38.5, 2.3, D + 0.08);

    // ---- roofs ----
    hipRoof(B, M, -OV, 24 + 1.5, -OV, D + OV, WALL, PITCH, true, false);        // west wing: hip, joins the middle roof
    const yr = hipRoof(B, M, 22, 58, -OV, D + OV, WALL, PITCH, false, false);  // middle: long gable (ends hidden by the wings)
    hipRoof(B, M, 56.5, L + OV, -OV, D + OV, WALL, PITCH, false, true);         // east wing: hip
    // entrance bay roof: gable towards the car park with exposed timber
    {
      const x0 = 15.2, x1 = 33.8, z0 = D / 2, z1 = D + 3.8, yE = WALL;
      const h = ((x1 - x0) / 2) * Math.tan(0.5), xm = (x0 + x1) / 2;
      // the gable reaches back to the main ridge; its back end is closed with a tiled triangle (no open roof)
      B.poly(M.roof, [V(x0, yE, z0), V(x1, yE, z0), V(xm, yE + h, z0)]);
      B.poly(M.roof, [V(x0, yE, z1), V(x0, yE, z0), V(xm, yE + h, z0), V(xm, yE + h, z1)]);
      B.poly(M.roof, [V(x1, yE, z0), V(x1, yE, z1), V(xm, yE + h, z1), V(xm, yE + h, z0)]);
      B.poly(M.timber, [V(x0 + 0.4, yE, z1 - 0.6), V(x1 - 0.4, yE, z1 - 0.6), V(xm, yE + h - 0.35, z1 - 0.6)]);
      for (const s of [-1, 1]) {                       // red barge boards
        const a = V(xm, yE + h, z1 + 0.02), b = V(s < 0 ? x0 : x1, yE, z1 + 0.02), len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
        B.add(M.redTrim, new THREE.BoxGeometry(len, 0.32, 0.08), new THREE.Matrix4().makeRotationZ(Math.atan2(b.y - a.y, b.x - a.x)).setPosition(mid));
      }
    }

    // ---- restaurant cross gable towards the course (timber truss, glass gable) and the terrace roof ----
    {
      const x0 = GX0, x1 = GX1, xm = (x0 + x1) / 2, zFront = -6.3, pitch = 0.55, yE = WALL + 0.25;
      const h = ((x1 - x0) / 2) * Math.tan(pitch);
      B.poly(M.roof, [V(x0, yE, zFront), V(xm, yE + h, zFront), V(xm, yE + h, D / 2), V(x0, yE, D / 2)], true);
      B.poly(M.roof, [V(xm, yE + h, zFront), V(x1, yE, zFront), V(x1, yE, D / 2), V(xm, yE + h, D / 2)], true);
      // glazed gable triangle set back, timber frame in front
      const zg = -5.4;
      B.poly(M.glass, [V(x0 + 0.6, yE, zg), V(x1 - 0.6, yE, zg), V(xm, yE + h - 0.4, zg)], true);
      const beam = (a, b, w, mat = M.timber) => { const len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5), d = b.clone().sub(a).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), d); B.add(mat, new THREE.BoxGeometry(len, w, w), new THREE.Matrix4().compose(mid, q, V(1, 1, 1))); };
      const zt = -5.9;
      beam(V(x0 + 0.3, yE, zt), V(x1 - 0.3, yE, zt), 0.3);                             // tie beam
      beam(V(x0 + 0.3, yE, zt), V(xm, yE + h - 0.1, zt), 0.26); beam(V(x1 - 0.3, yE, zt), V(xm, yE + h - 0.1, zt), 0.26);   // rafters
      beam(V(xm, yE, zt), V(xm, yE + h - 0.2, zt), 0.22);                               // king post
      beam(V(xm, yE + 0.3, zt), V(x0 + 3.2, yE + 1.6, zt), 0.16); beam(V(xm, yE + 0.3, zt), V(x1 - 3.2, yE + 1.6, zt), 0.16);  // struts
      for (const s of [-1, 1]) {                       // red barge boards
        const a = V(xm, yE + h + 0.05, zFront - 0.02), b = V(xm + s * ((x1 - x0) / 2 + 0.1), yE - 0.05, zFront - 0.02), len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
        B.add(M.redTrim, new THREE.BoxGeometry(len, 0.38, 0.1), new THREE.Matrix4().makeRotationZ(Math.atan2(b.y - a.y, b.x - a.x)).setPosition(mid));
      }
      // purlins visible under the gable roof
      for (let k = 1; k < 4; k++) { const t = k / 4; beam(V(x0 + (xm - x0) * t, yE + h * t - 0.15, zFront + 0.3), V(x0 + (xm - x0) * t, yE + h * t - 0.15, 0), 0.14);
        beam(V(x1 - (x1 - xm) * t, yE + h * t - 0.15, zFront + 0.3), V(x1 - (x1 - xm) * t, yE + h * t - 0.15, 0), 0.14); }
      // timber posts carrying the gable
      for (const x of [x0 + 0.4, x1 - 0.4]) B.box(M.timber, x - 0.14, 0.05, zt - 0.14, x + 0.14, yE, zt + 0.14);
      // lean-to terrace roofs either side of the gable (red fascia, awning cassettes, round lamps)
      for (const [a, b] of [[R0 + 0.2, x0], [x1, R1]]) {
        const yIn = WALL - 0.2, yOut = WALL - 0.5, zo = -3.0;      // short cover: the outer tables get parasols
        B.poly(M.roof, [V(a, yOut, zo), V(b, yOut, zo), V(b, yIn, 0.2), V(a, yIn, 0.2)], true);
        B.poly(M.soffit, [V(a, yOut - 0.12, zo), V(a, yIn - 0.12, 0.2), V(b, yIn - 0.12, 0.2), V(b, yOut - 0.12, zo)], true);
        B.box(M.redTrim, a, yOut - 0.4, zo - 0.08, b, yOut + 0.05, zo);
        B.box(M.gutter, a, yOut - 0.1, zo - 0.2, b, yOut + 0.02, zo - 0.08);
        B.box(M.awning, a + 0.2, yOut - 0.62, zo - 0.25, b - 0.2, yOut - 0.42, zo - 0.05);
        for (let x = a + 2.4; x < b - 1; x += 4.6) {
          B.box(M.steel, x - 0.07, 0.05, zo + 0.1, x + 0.07, yOut - 0.4, zo + 0.24);
          B.add(M.lamp, new THREE.CylinderGeometry(0.55, 0.55, 0.28, 16), new THREE.Matrix4().makeTranslation(x + 2.2, yOut - 0.5, zo + 1.6));
        }
      }
    }
    // downpipes
    for (const [x, z] of [[0.3, -0.3], [R0, -0.3], [R1 + 0.3, -0.3], [L - 0.3, -0.3], [0.3, D + 0.3], [L - 0.3, D + 0.3], [40, D + 0.3], [62, D + 0.3]]) B.cyl(M.gutter, x, 0, z, 0.05, 0.05, WALL, 8);

    // ---- pavilion (pro shop / cart garage) with pyramid roof ----
    {
      const x0 = 96, x1 = 114, z0 = -3.5, z1 = 15, W = 3.4;
      B.wall(M.clad, x1, z0, x0, z0, 0, W); B.wall(M.clad, x0, z0, x0, z1, 0, W); B.wall(M.clad, x0, z1, x1, z1, 0, W); B.wall(M.clad, x1, z1, x1, z0, 0, W);
      const ov = 1.0, xa = x0 - ov, xb = x1 + ov, za = z0 - ov, zb = z1 + ov, xm = (x0 + x1) / 2, zm = (z0 + z1) / 2, top = V(xm, W + ((xb - xa) / 2) * Math.tan(0.5), zm);
      const c = [V(xa, W, za), V(xb, W, za), V(xb, W, zb), V(xa, W, zb)];
      for (let i = 0; i < 4; i++) B.poly(M.roof, [c[i], c[(i + 1) % 4], top], true);
      B.poly(M.soffit, [V(xa, W - 0.25, za), V(xb, W - 0.25, za), V(xb, W - 0.25, zb), V(xa, W - 0.25, zb)]);
      for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4]; B.box(M.redTrim, Math.min(a.x, b.x) - 0.02, W - 0.28, Math.min(a.z, b.z) - 0.02, Math.max(a.x, b.x) + 0.02, W + 0.02, Math.max(a.z, b.z) + 0.02); }
      windowZ(B, M, x0 + 3, x1 - 3, 0.6, 2.2, z0 - 0.02, -1, 5);                       // course side: shop window
      B.add(M.golf, new THREE.PlaneGeometry(5.6, 0.7), new THREE.Matrix4().makeRotationY(Math.PI).setPosition(xm, 2.72, z0 - 0.06));   // "GOLF" fascia sign
      B.box(M.frame, x1 + 0.0, 0.05, 2, x1 + 0.08, 2.7, 9);                             // cart garage door (east)
      for (let k = 0; k < 9; k++) B.box(M.gutter, x1 + 0.08, 0.2 + k * 0.28, 2.1, x1 + 0.12, 0.26 + k * 0.28, 8.9);
    }

    // ---- terrace furniture (restaurant) ----
    let seed = 3; const rr = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let x = R0 + 1.5; x < R1 - 1; x += 2.3) for (const z of [-1.8, -4.4]) {
      if (Math.abs(x - GX0 - 0.4) < 0.7 || Math.abs(x - GX1 + 0.4) < 0.7) continue;   // timber posts
      table(B, M, x, z);
      chair(B, M, x, z - 0.72, 0); chair(B, M, x, z + 0.72, Math.PI);
      if (rr() < 0.5) chair(B, M, x - 0.72, z, Math.PI / 2);      // side chair facing the table (+x)
    }
    // parasols over the outer row of tables in front of the short terrace roofs (not under the timber gable)
    { let k = 0;
      for (let x = R0 + 1.5; x < R1 - 1; x += 2.3) {
        if (Math.abs(x - GX0 - 0.4) < 0.7 || Math.abs(x - GX1 + 0.4) < 0.7) continue;
        if (x > GX0 - 0.5 && x < GX1 + 0.5) continue;
        if (k++ % 2 === 0) { parasol(B, M, x, -4.4); S.push([x - 1.2, x + 1.2, -5.6, -3.2, 2.2, 2.75, 'furniture']); }
      } }
    for (const x of [60]) { parasol(B, M, x, -4); table(B, M, x, -4); chair(B, M, x, -4.7, 0); chair(B, M, x, -3.3, Math.PI); }
    // east of the terrace: hedge along the edge, planters with columnar shrubs right behind it (north side)
    B.box(M.hedge, 57.5, 0, -7.6, 88, 1.0, -6.8);
    B.box(M.concrete, 57.5, -1.5, -6.8, L + 0.6, 0.03, -0.01);         // concrete strip between the hedge and the wall
    for (let x = 60; x < 87; x += 3) { B.box(M.pot, x - 0.35, 0, -6.7, x + 0.35, 0.5, -6.0); B.add(M.hedge, new THREE.CylinderGeometry(0.28, 0.35, 2.2, 8), new THREE.Matrix4().makeTranslation(x, 1.6, -6.35)); }

    // ---- extras on the parking side: hedges, boulder, flag pole with the Swiss flag, road sign ----
    if (opt.extras !== false) {
      // narrow lawn beds along the wall with two staggered rows of clipped box hedges (as in the street view)
      B.box(M.lawn, 33.5, 0.03, D, L - 0.5, 0.06, D + 3.4);
      B.box(M.lawn, 0.5, 0.03, D, 15.5, 0.06, D + 7.5);
      const hedge = (x0, x1, z0, z1, h) => { B.box(M.hedge, x0, 0.04, D + z0, x1, h, D + z1); S.push([x0, x1, D + z0, D + z1, 0, h, 'hedge']); };
      hedge(34, 36, 0.3, 1.3, 1.1); hedge(39, L - 1.5, 0.3, 1.3, 1.1);                    // back row (gap for the side door)
      for (let x = 39.5; x < L - 6; x += 12.5) hedge(x, Math.min(x + 11, L - 2), 1.7, 3.0, 0.85);   // front row in blocks
      hedge(1.5, 15, 0.3, 1.4, 1.0); hedge(3, 14.6, 1.9, 3.2, 0.8);                          // west of the entrance
      B.add(M.rock, new THREE.DodecahedronGeometry(0.8, 0), new THREE.Matrix4().makeScale(1.2, 1.1, 0.9).setPosition(13.6, 0.55, D + 4.6));
      // flat red canopy over the entrance door, on two red posts
      B.box(M.redTrim, 19.5, 2.75, D + 2.6, 28.5, 2.95, D + 4.6);
      for (const x of [19.7, 28.3]) B.box(M.redTrim, x - 0.07, 0, D + 4.4, x + 0.07, 2.75, D + 4.54);
      B.cyl(M.white, 9.5, -0.5, D + 6, 0.06, 0.04, 9.5, 8);
      B.add(M.white, new THREE.SphereGeometry(0.09, 8, 6), new THREE.Matrix4().makeTranslation(9.5, 9.05, D + 6));
      // "GOLF UNTERENGSTRINGEN" sign: west end of the car park by the trail (north-west of the building),
      // facing south-west towards players coming up the path
      const T = new THREE.Matrix4().makeTranslation(-19.5, 0, D + 6).multiply(new THREE.Matrix4().makeRotationY(-2.4));
      S.push([-2.05, 2.05, -0.1, 0.1, 0, 2.6, 'wall', T]);
      const at = (mat, geo, x, y, z) => B.add(mat, geo, T.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z)));
      at(M.frame, new THREE.BoxGeometry(0.08, 4.1, 0.08), -2, 0.55, 0); at(M.frame, new THREE.BoxGeometry(0.08, 4.1, 0.08), 2, 0.55, 0);
      at(M.redTrim, new THREE.BoxGeometry(4, 2, 0.06), 0, 1.45, -0.02);
      at(M.sign, new THREE.PlaneGeometry(4, 2), 0, 1.45, 0.02);
      B.add(M.sign, new THREE.PlaneGeometry(4, 2), T.clone().multiply(new THREE.Matrix4().makeTranslation(0, 1.45, -0.06)).multiply(new THREE.Matrix4().makeRotationY(Math.PI)));   // text on the back too
      at(M.rock, new THREE.BoxGeometry(5, 1.6, 1.4), 0, -0.72, 0);            // gravel bed (reaches into the ground)
      at(M.hedge, new THREE.SphereGeometry(0.4, 8, 6), -1, 0.3, 0.6); at(M.hedge, new THREE.SphereGeometry(0.4, 8, 6), 1, 0.3, 0.6);
    }

    // solids: the building blocks, roofs over the terrace, posts, tables, hedges, rock, flag pole
    S.push([0, L, 0, D, -1, 9, 'wall'], [16, 33, D, D + 2.6, -1, 7, 'wall'], [96, 114, -3.5, 15, -1, 7, 'wall']);
    S.push([GX0, GX1, -6.3, 0, WALL + 0.15, WALL + 3.5, 'roof'], [R0, GX0, -3.1, 0.2, WALL - 0.75, WALL, 'roof'], [GX1, R1, -3.1, 0.2, WALL - 0.75, WALL, 'roof']);
    for (const x of [GX0 + 0.4, GX1 - 0.4]) S.push([x - 0.15, x + 0.15, -6.05, -5.75, 0, WALL + 0.3, 'post']);
    for (const [a, b] of [[R0 + 0.2, GX0], [GX1, R1]]) for (let x = a + 2.4; x < b - 1; x += 4.6) S.push([x - 0.08, x + 0.08, -2.92, -2.74, 0, WALL - 0.8, 'post']);
    for (let x = R0 + 1.5; x < R1 - 1; x += 2.3) for (const z of [-1.8, -4.4]) {
      if (Math.abs(x - GX0 - 0.4) < 0.7 || Math.abs(x - GX1 + 0.4) < 0.7) continue;
      S.push([x - 0.45, x + 0.45, z - 0.95, z + 0.95, 0, 0.95, 'furniture']);
    }
    S.push([59.5, 60.5, -5, -3, 0, 0.95, 'furniture'], [58.8, 61.2, -5.2, -2.8, 2.2, 2.75, 'furniture']);
    S.push([57.5, 88, -7.6, -6.8, 0, 1.0, 'hedge'], [59.6, 86.4, -6.75, -5.95, 0, 2.7, 'hedge']);
    if (opt.extras !== false) {
      S.push([12.6, 14.6, D + 3.8, D + 5.4, 0, 1.1, 'wall'], [9.4, 9.6, D + 5.9, D + 6.1, 0, 9, 'post'], [19.5, 28.5, D + 2.6, D + 4.6, 2.75, 2.95, 'roof']);
      for (const x of [19.7, 28.3]) S.push([x - 0.08, x + 0.08, D + 4.4, D + 4.55, 0, 2.75, 'post']);
    }
    group.userData.solids = S; group.userData.chairs = B.chairs || [];
    B.build(group);
    // Swiss flag on the pole (pole at x 9.5, z −(D + 6) after the mirror): a cloth mesh animated by updateFlag
    if (opt.extras !== false) {
      const g = new THREE.PlaneGeometry(1.5, 1.0, 14, 6); g.translate(0.75, 0, 0);
      const flag = new THREE.Mesh(g, M.flag); flag.castShadow = true;
      flag.position.set(9.5, 8.45, -(D + 6)); flag.userData.base = Float32Array.from(g.attributes.position.array);
      group.add(flag); group.userData.flag = flag;
    }
    Object.assign(group.userData, { length: L, depth: D, ridge: yr });
    return group;
  }
  // flag flies downwind: wind (wx, wz) = world direction the air moves in (m/s), as in main.js; t = time (s)
  const _q = new THREE.Quaternion(), _w = new THREE.Vector3();
  function updateFlag(group, wx, wz, t) {
    const f = group.userData.flag; if (!f) return;
    const sp = Math.hypot(wx, wz);
    f.userData.wind = (f.userData.wind ?? sp) + (sp - (f.userData.wind ?? sp)) * 0.05;
    const ws = f.userData.wind;
    // wind into the club house's own frame (the group may be rotated in the world)
    group.getWorldQuaternion(_q); _w.set(wx, 0, wz).applyQuaternion(_q.invert());
    if (sp > 0.05) { const yaw = Math.atan2(-_w.z, _w.x); let d = yaw - f.rotation.y; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI; f.rotation.y += d * 0.06; }
    const p = f.geometry.attributes.position, b = f.userData.base;
    const droop = 1 - Math.min(1, ws / 5), amp0 = 0.03 + 0.02 * Math.min(ws, 8), ph = t * (3 + ws * 0.8);
    for (let i = 0; i < p.count; i++) {
      const x = b[i * 3], y = b[i * 3 + 1], k = x / 1.5;
      p.setXYZ(i, x * (1 - 0.55 * droop * k), y - droop * x * 0.6, Math.sin(x * 5 - ph) * amp0 * k + Math.sin(y * 4 + ph * 0.7) * amp0 * 0.3 * k);
    }
    p.needsUpdate = true; f.geometry.computeVertexNormals();
  }
  return { build, materials, updateFlag };
})();
