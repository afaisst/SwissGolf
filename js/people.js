// SwissGolf – realistic golfer figures: lofted, skinned bodies (19 bones) posed with two-bone IK.
// The body shapes, skeleton and skin weights are ported from Mr.doob's "slop-newyork" pedestrians (MIT License,
// Copyright (c) 2026 Mr.doob) – rewritten for the WebGL build of three.js (no TSL / GPU instancing, vertex colours
// instead of procedural cloth shading).
const PEOPLE = (() => {
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

  /* ---------------- skeleton (metres, facing +Z, +X = the figure's left) ---------------- */
  const BONE = { PELVIS: 0, CHEST: 1, HEAD: 2, UPPER_ARM_L: 3, FOREARM_L: 4, UPPER_ARM_R: 5, FOREARM_R: 6,
    THIGH_L: 7, SHIN_L: 8, FOOT_L: 9, TOE_L: 10, THIGH_R: 11, SHIN_R: 12, FOOT_R: 13, TOE_R: 14, HAND_L: 15, HAND_R: 16, FINGERS_L: 17, FINGERS_R: 18 };
  const PARENT = [-1, 0, 1, 1, 3, 1, 5, 0, 7, 8, 9, 0, 11, 12, 13, 4, 6, 15, 16];   // + wrists and fingers (not in slop-newyork)
  const NB = PARENT.length;
  const THIGH = 0.42, SHIN = 0.42, ANKLE_H = 0.08, HIP_X = 0.09, UPPER_ARM = 0.3, FOREARM = 0.255;
  const ARM_ABD = 0.14, PELVIS_Y = 0.96, HIP_Y = ANKLE_H + SHIN + THIGH;
  const GRIP = 0.62, KNUCKLE = 0.655;                       // palm centre, measured along the arm from the shoulder
  const SIDES = [1, -1];
  const LIMB = { upperArm: [3, 5], forearm: [4, 6], hand: [15, 16], fingers: [17, 18], thigh: [7, 11], shin: [8, 12], foot: [9, 13], toe: [10, 14] };
  const shoulderJoint = f => f ? [0.165, 1.415, -0.015] : [0.185, 1.43, -0.015];
  function bindJoints(female) {
    const sh = shoulderJoint(female), ax = Math.sin(ARM_ABD) * UPPER_ARM, ay = -Math.cos(ARM_ABD) * UPPER_ARM, j = [];
    j[0] = V(0, PELVIS_Y, 0); j[1] = V(0, 1.12, -0.01); j[2] = V(0, 1.52, -0.012);
    SIDES.forEach((s, k) => {
      j[LIMB.upperArm[k]] = V(s * sh[0], sh[1], sh[2]);
      j[LIMB.forearm[k]] = V(s * (sh[0] + ax), sh[1] + ay, sh[2]);
      j[LIMB.fingers[k]] = V(s * (sh[0] + Math.sin(ARM_ABD) * KNUCKLE), sh[1] - Math.cos(ARM_ABD) * KNUCKLE, sh[2]);
      j[LIMB.hand[k]] = V(s * (sh[0] + Math.sin(ARM_ABD) * (UPPER_ARM + FOREARM)), sh[1] - Math.cos(ARM_ABD) * (UPPER_ARM + FOREARM), sh[2]);
      j[LIMB.thigh[k]] = V(s * HIP_X, HIP_Y, 0);
      j[LIMB.shin[k]] = V(s * HIP_X, ANKLE_H + SHIN, 0);
      j[LIMB.foot[k]] = V(s * HIP_X, ANKLE_H, 0);
      j[LIMB.toe[k]] = V(s * HIP_X, 0.02, 0.135);
    });
    return j;
  }
  const BIND = [bindJoints(false), bindJoints(true)];

  /* ---------------- lofted body ---------------- */
  function ringY(y, rx, rzF, rzB, cz, n, ex = 2, bump = null, cx = 0) {
    const e = 2 / ex, out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      let x = Math.sign(c) * Math.abs(c) ** e * rx, z = Math.sign(s) * Math.abs(s) ** e * (s >= 0 ? rzF : rzB);
      const b = bump ? bump(a) : 0;
      if (b) { const r = Math.hypot(x, z) || 1; x += (x / r) * b; z += (z / r) * b; }
      out.push(V(cx + x, y, cz + z));
    }
    return out;
  }
  const _down = V(0, -1, 0), _yAxis = V(0, 1, 0);
  function limbRing(center, dir, rx, rz, n, ex = 2, twist = 0) {
    const q = new THREE.Quaternion().setFromUnitVectors(_down, dir);
    return ringY(0, rx, rz, rz, 0, n, ex).map(p => p.applyAxisAngle(_yAxis, twist).applyQuaternion(q).add(center));
  }
  function lobe(a, a0, w) { let d = a - a0; d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2; return Math.exp(-(d * d) / (w * w)); }

  // closed loft through equal rings, optional centroid caps; per-row colour (or colFn(point)) and two-bone skin
  function loft(rows, { capStart = false, capEnd = false, colFn = null } = {}) {
    const R = rows.length, C = rows[0].pts.length, per = C + 1;
    const pos = [], col = [], si = [], sw = [], idx = [];
    const push = (p, row) => {
      pos.push(p.x, p.y, p.z);
      const c = colFn ? colFn(p, row) : row.col; col.push(c.r, c.g, c.b);
      const sk = row.skinFn ? row.skinFn(p) : row.skin;
      si.push(sk[0], sk[1], 0, 0); sw.push(1 - sk[2], sk[2], 0, 0);
    };
    for (let i = 0; i < R; i++) for (let j = 0; j < per; j++) push(rows[i].pts[j % C], rows[i]);
    for (let i = 0; i < R - 1; i++) for (let j = 0; j < C; j++) {
      const a = i * per + j, b = a + 1, c = a + per + 1, d = a + per; idx.push(a, b, d, b, c, d);
    }
    const cap = (r, flip) => {
      const start = pos.length / 3, ctr = V();
      for (let j = 0; j < C; j++) { ctr.add(rows[r].pts[j]); push(rows[r].pts[j], rows[r]); }
      push(ctr.divideScalar(C), rows[r]);
      const c = start + C;
      for (let j = 0; j < C; j++) { const a = start + j, b = start + ((j + 1) % C); if (flip) idx.push(c, b, a); else idx.push(c, a, b); }
    };
    if (capStart) cap(0, true);
    if (capEnd) cap(R - 1, false);
    const g = new THREE.BufferGeometry();
    g.setIndex(idx);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const nrm = g.attributes.normal, t = V();       // weld the normals along each ring's seam
    for (let i = 0; i < R; i++) {
      const a = i * per, b = a + per - 1;
      t.set(nrm.getX(a) + nrm.getX(b), nrm.getY(a) + nrm.getY(b), nrm.getZ(a) + nrm.getZ(b)).normalize();
      nrm.setXYZ(a, t.x, t.y, t.z); nrm.setXYZ(b, t.x, t.y, t.z);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    return g;
  }
  function merge(geos) {
    const out = new THREE.BufferGeometry(), names = ['position', 'normal', 'color', 'skinIndex', 'skinWeight'];
    const arrs = {}, idx = [];
    for (const n of names) arrs[n] = [];
    let off = 0;
    for (const g of geos) {
      for (const n of names) { const a = g.attributes[n].array; for (let i = 0; i < a.length; i++) arrs[n].push(a[i]); }
      const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx.push(ix[i] + off);
      off += g.attributes.position.count; g.dispose();
    }
    out.setIndex(idx);
    out.setAttribute('position', new THREE.Float32BufferAttribute(arrs.position, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(arrs.normal, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(arrs.color, 3));
    out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(arrs.skinIndex, 4));
    out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(arrs.skinWeight, 4));
    out.computeBoundingSphere();
    return out;
  }
  // rows of a profile table plus doubled rows at the colour splits (crisp hems, collars and waistbands)
  function splitTable(tab, splits) {
    const dir = Math.sign(tab[tab.length - 1][0] - tab[0][0]), out = [];
    const sp = splits.slice().sort((a, b) => (a - b) * dir);
    for (let i = 0; i < tab.length; i++) {
      out.push({ row: tab[i], at: tab[i][0] });
      if (i === tab.length - 1) break;
      const a = tab[i][0], b = tab[i + 1][0];
      for (const s of sp) if ((s - a) * dir > 0 && (b - s) * dir > 0) {
        const t = (s - a) / (b - a), r = tab[i].map((v, k) => v + ((tab[i + 1][k] ?? v) - v) * t);
        out.push({ row: r, at: s - dir * 1e-4 }, { row: r, at: s + dir * 1e-4 });
      }
    }
    return out;
  }
  function interp(tab, y) {
    if (y >= tab[0][0]) return tab[0];
    for (let i = 0; i < tab.length - 1; i++) {
      const a = tab[i], b = tab[i + 1];
      if (y <= a[0] && y >= b[0]) { const t = (a[0] - y) / (a[0] - b[0]); return a.map((v, k) => v + (b[k] - v) * t); }
    }
    return tab[tab.length - 1];
  }

  // profiles [y, rx, rzFront, rzBack, centreZ] – male / female
  const TORSO = {
    m: [[1.615, .046, .044, .048, -.004], [1.575, .051, .049, .053, -.008], [1.53, .058, .053, .057, -.013], [1.5, .1, .064, .07, -.018],
      [1.47, .163, .08, .082, -.02], [1.44, .188, .095, .089, -.018], [1.4, .186, .108, .093, -.014], [1.34, .177, .118, .096, -.01],
      [1.27, .167, .117, .093, -.006], [1.2, .157, .11, .089, -.002], [1.13, .15, .104, .086, 0], [1.06, .154, .101, .089, 0],
      [.99, .163, .099, .099, 0], [.935, .166, .095, .106, 0], [.885, .152, .078, .1, 0], [.845, .1, .055, .075, 0]],
    f: [[1.615, .042, .04, .044, -.004], [1.575, .045, .043, .047, -.008], [1.53, .051, .047, .051, -.012], [1.5, .086, .056, .062, -.016],
      [1.47, .142, .072, .074, -.018], [1.44, .164, .085, .081, -.016], [1.4, .163, .1, .084, -.012], [1.34, .157, .122, .087, -.006],
      [1.27, .148, .118, .084, -.002], [1.2, .136, .097, .08, 0], [1.13, .127, .09, .078, 0], [1.06, .144, .094, .086, 0],
      [.99, .165, .098, .103, 0], [.935, .174, .096, .112, 0], [.885, .16, .08, .106, 0], [.845, .104, .056, .078, 0]]
  };
  const torsoEx = y => y > 1.5 ? 2 : y > 1.0 ? 2.35 : 2.15;
  const bust = a => 0.011 * (lobe(a, Math.PI / 2 - 0.5, 0.38) + lobe(a, Math.PI / 2 + 0.5, 0.38));
  function torsoSkin(y) {
    if (y > 1.6) return [1, 2, 1]; if (y > 1.56) return [1, 2, 0.65]; if (y > 1.52) return [1, 2, 0.2];
    if (y > 1.15) return [1, 1, 0]; if (y > 1.1) return [0, 1, 0.5]; if (y > 1.03) return [0, 1, 0.15];
    return [0, 0, 0];
  }
  const LEG = {
    m: [[.975, .054, .054, .054, 0], [.925, .062, .072, .075, 0], [.865, .083, .088, .091, .003], [.77, .078, .083, .083, .006],
      [.67, .071, .075, .073, .008], [.59, .064, .067, .064, .008], [.535, .058, .062, .058, .008], [.5, .056, .061, .056, .008],
      [.465, .054, .058, .056, .004], [.415, .054, .056, .06, 0], [.335, .053, .054, .061, -.004], [.245, .051, .052, .054, -.003],
      [.17, .051, .053, .053, 0], [.13, .052, .055, .053, .004], [.1, .044, .046, .044, .004]],
    f: [[.975, .056, .056, .056, 0], [.925, .066, .074, .08, 0], [.865, .087, .087, .094, .003], [.77, .078, .079, .08, .006],
      [.67, .067, .069, .067, .008], [.59, .057, .059, .057, .008], [.535, .051, .055, .051, .008], [.5, .049, .053, .049, .008],
      [.465, .047, .051, .049, .004], [.415, .047, .049, .054, 0], [.335, .046, .047, .056, -.004], [.245, .04, .042, .045, -.003],
      [.17, .035, .037, .037, 0], [.13, .034, .036, .035, .003], [.1, .031, .033, .032, .003]]
  };
  function legSkin(y, k) {
    const th = LIMB.thigh[k], sh = LIMB.shin[k], ft = LIMB.foot[k];
    if (y > 0.95) return [0, th, 0.05]; if (y > 0.9) return [0, th, 0.3]; if (y > 0.84) return [0, th, 0.72];
    if (y > 0.74) return [0, th, 0.93]; if (y > 0.55) return [th, th, 0]; if (y > 0.52) return [th, sh, 0.12];
    if (y > 0.48) return [th, sh, 0.5]; if (y > 0.44) return [th, sh, 0.88]; if (y > 0.15) return [sh, sh, 0];
    if (y > 0.115) return [sh, ft, 0.25]; return [sh, ft, 0.5];
  }
  // [distance from the shoulder, rx, rz, offset to the side, offset forward]
  const ARMT = [[-.022, .026, .032, -.024, 0], [-.008, .042, .05, -.014, 0], [.012, .052, .057, -.006, 0], [.05, .055, .057, .001, 0],
    [.1, .052, .052, .003, 0], [.16, .048, .049, .001, .003], [.23, .044, .046, 0, 0], [.272, .042, .043, 0, -.003], [.3, .041, .042, 0, -.005],
    [.328, .042, .043, 0, -.003], [.39, .043, .042, 0, 0], [.465, .038, .035, 0, 0], [.525, .034, .031, 0, 0], [.542, .036, .033, 0, 0], [.55, .028, .026, 0, 0]];
  const HAND = [[.525, .023, .026, 0], [.555, .021, .03, .002], [.595, .023, .04, .004], [.64, .021, .042, .004], [.68, .017, .037, .002], [.712, .013, .028, 0], [.728, .008, .015, 0]];
  function handSkin(d, k) {
    const fa = LIMB.forearm[k], hd = LIMB.hand[k], fg = LIMB.fingers[k];
    if (d < 0.54) return [fa, hd, 0.5]; if (d < 0.62) return [hd, hd, 0]; if (d < 0.66) return [hd, fg, 0.5]; return [fg, fg, 0];
  }
  function armSkin(d, k) {
    const ua = LIMB.upperArm[k], fa = LIMB.forearm[k];
    if (d < -0.03) return [1, ua, 0.32]; if (d < 0) return [1, ua, 0.6]; if (d < 0.06) return [1, ua, 0.88];
    if (d < 0.26) return [ua, ua, 0]; if (d < 0.29) return [ua, fa, 0.15]; if (d < 0.315) return [ua, fa, 0.5];
    if (d < 0.36) return [ua, fa, 0.85]; if (d < 0.52) return [fa, fa, 0];
    const hd = LIMB.hand[k]; return d < 0.535 ? [fa, hd, 0.25] : d < 0.545 ? [fa, hd, 0.55] : [fa, hd, 0.8];
  }
  const HEAD = {
    m: [[1.752, .0162, .018, .02, -.012], [1.738, .0504, .058, .064, -.013], [1.712, .0702, .082, .092, -.013], [1.682, .0783, .09, .102, -.011],
      [1.652, .0792, .093, .103, -.009], [1.622, .0756, .094, .098, -.007], [1.592, .0702, .095, .09, -.005], [1.562, .0639, .091, .078, -.002],
      [1.537, .0567, .085, .066, .002], [1.514, .0468, .074, .054, .008], [1.497, .027, .048, .032, .016]],
    f: [[1.748, .0153, .017, .019, -.012], [1.734, .0477, .055, .061, -.013], [1.709, .0666, .078, .088, -.013], [1.68, .0747, .086, .097, -.011],
      [1.651, .0747, .089, .098, -.009], [1.622, .0711, .09, .093, -.007], [1.594, .0657, .09, .085, -.005], [1.566, .0594, .086, .073, -.002],
      [1.543, .0522, .08, .061, .002], [1.522, .0414, .068, .049, .008], [1.507, .0234, .042, .028, .014]]
  };
  function headBump(y) {
    const fr = Math.PI / 2;
    return a => {
      let b = 0;
      if (Math.abs(y - 1.592) < 0.02) b += 0.017 * lobe(a, fr, 0.16) + 0.004 * (lobe(a, fr - 0.62, 0.25) + lobe(a, fr + 0.62, 0.25));
      if (Math.abs(y - 1.622) < 0.02) b += 0.007 * lobe(a, fr, 0.14) - 0.005 * (lobe(a, fr - 0.4, 0.22) + lobe(a, fr + 0.4, 0.22));
      if (Math.abs(y - 1.652) < 0.02) b += 0.004 * lobe(a, fr, 0.6);
      if (Math.abs(y - 1.562) < 0.02) b += 0.004 * lobe(a, fr, 0.2) + 0.004 * (lobe(a, fr - 0.75, 0.3) + lobe(a, fr + 0.75, 0.3));
      if (Math.abs(y - 1.514) < 0.012) b += 0.006 * lobe(a, fr, 0.35);
      if (y < 1.64 && y > 1.575) b += 0.011 * (lobe(a, -0.12, 0.22) + lobe(a, Math.PI + 0.12, 0.22));
      return b;
    };
  }
  const hairlineY = a => 1.62 + 0.055 * Math.sin(a) - 0.005 * Math.cos(2 * a);
  function hairShellRing(tab, f, t, n) {
    const crown = tab[0][0], out = [], c = V(0, 1.635, -0.012);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, y = crown + (hairlineY(a) - crown) * f;
      const [, rx, rzF, rzB, cz] = interp(tab, y);
      const p = V(Math.cos(a) * rx, y, cz + Math.sin(a) * (Math.sin(a) >= 0 ? rzF : rzB));
      const k = t * (1 - 0.75 * f * f);
      out.push(p.sub(c).multiplyScalar(1 + k / Math.max(0.05, p.length())).add(c));
    }
    return out;
  }
  // golf shoes: [z from the ankle, half width, top, sole]
  const SHOE = [[-.088, .02, -.02, -.066], [-.078, .034, .016, -.08], [-.05, .042, .036, -.08], [-.01, .045, .032, -.08], [.04, .048, .006, -.08],
    [.09, .05, -.022, -.08], [.13, .051, -.035, -.08], [.165, .048, -.044, -.08], [.192, .039, -.05, -.079], [.208, .022, -.056, -.075]];
  function shoeRing(cx, z, hw, top, sole, n) {
    const out = [], mid = sole + (top - sole) * 0.38;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const x = Math.sign(c) * Math.abs(c) ** 0.6 * hw;
      const y = s >= 0 ? mid + (top - mid) * s ** 0.85 : mid - (mid - sole) * Math.abs(s) ** 0.35;
      out.push(V(cx + x, ANKLE_H + y, z));
    }
    return out;
  }
  function shoeSkin(z, k) {
    const f = LIMB.foot[k], t = LIMB.toe[k];
    if (z < 0.07) return [f, f, 0]; if (z < 0.11) return [f, t, 0.12]; if (z < 0.15) return [f, t, 0.55]; return [t, t, 0];
  }

  const HAIRS = [0x3b2a1e, 0x6b4226, 0x2a211b, 0x9a7b4f, 0x5a3a22, 0x1c1714];
  const SKINS = [0xe0ae88, 0xd9a07a, 0xeab995, 0xc98e66];
  function hashName(s) { let h = 7; for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }

  function buildGeometry(female, cols) {
    const fi = female ? 1 : 0, T = female ? TORSO.f : TORSO.m, L = female ? LEG.f : LEG.m, H = female ? HEAD.f : HEAD.m;
    const geos = [];
    // torso: skin above the polo's collar, shirt, belt, trousers (men) or skort (women)
    const torsoCol = y => y > 1.49 ? cols.skin : y > 1.02 ? cols.shirt : y > 0.995 ? cols.belt : cols.pants;
    geos.push(loft(splitTable(T, [1.49, 1.02, 0.995]).map(({ row: r, at }) => ({
      pts: ringY(r[0], r[1], r[2], r[3], r[4], 18, torsoEx(r[0]), female && r[0] < 1.37 && r[0] > 1.25 ? bust : null),
      skin: torsoSkin(at), col: torsoCol(at)
    })), { capEnd: true }));
    // legs: trousers to the shoe (men), skort hem above the knee (women)
    const legCol = y => !female ? cols.pants : y > 0.7 ? cols.pants : y > 0.135 ? cols.skin : cols.sock;
    SIDES.forEach((s, k) => {
      geos.push(loft(splitTable(L, female ? [0.7, 0.135] : []).map(({ row: r, at }) => ({
        pts: ringY(r[0], r[1], r[2], r[3], r[4], 14, 2, null, s * HIP_X),
        skin: legSkin(at, k), col: legCol(at)
      })), { capStart: true, capEnd: true }));
    });
    // women: short flared, lightly pleated golf skirt; the hem moves partly with the thighs so legs stay inside
    if (female) {
      const SK = [[1.012, .171, .103, .109], [0.94, .186, .109, .122], [0.85, .204, .124, .139], [0.76, .221, .139, .153], [0.672, .234, .149, .164], [0.682, .218, .136, .15]];
      geos.push(loft(SK.map(([y, rx, rzF, rzB], i) => ({
        pts: ringY(y, rx, rzF, rzB, 0, 32, 2.2, i > 0 ? a => (0.0025 + 0.004 * (1.01 - y)) * Math.cos(16 * a) : null),
        col: cols.pants,
        skinFn: p => {
          const w = clamp((0.97 - p.y) / 0.3, 0, 1) * 0.62 * Math.min(1, Math.abs(p.x) / (rx * 0.75));
          return [0, p.x > 0 ? LIMB.thigh[0] : LIMB.thigh[1], w];
        }
      }))));
    }
    // arms: short polo sleeves, bare forearms; a white glove on the left hand
    SIDES.forEach((s, k) => {
      const dir = V(s * Math.sin(ARM_ABD), -Math.cos(ARM_ABD), 0), sh = V(...shoulderJoint(female)); sh.x *= s;
      const at = (d, ox, oz) => sh.clone().addScaledVector(dir, d).add(V(s * ox, 0, oz));
      const sc = female ? 0.86 : 1;
      geos.push(loft(splitTable(ARMT, [0.19]).map(({ row: r, at: d }) => {
        const sleeve = d < 0.19, puff = sleeve ? 1.12 : 1;
        return { pts: limbRing(at(r[0], r[3], r[4]), dir, r[1] * sc * puff, r[2] * sc * puff, 12), skin: armSkin(d, k), col: sleeve ? cols.shirt : cols.skin };
      }), { capStart: true, capEnd: true }));
      const twist = -s * 0.45, hc = k === 0 ? cols.glove : cols.skin;
      geos.push(loft(HAND.map(([d, rx, rz, oz]) => ({ pts: limbRing(at(d, 0, oz), dir, rx * (female ? 0.9 : 1), rz * (female ? 0.9 : 1), 8, 2, twist), skin: handSkin(d, k), col: hc })), { capStart: true, capEnd: true }));
      geos.push(loft([[0.565, 0.026, 0.011], [0.605, 0.038, 0.0105], [0.64, 0.044, 0.008]].map(([d, oz, r]) => {
        const off = V(s * -0.006, 0, oz).applyAxisAngle(_yAxis, twist);
        return { pts: limbRing(sh.clone().addScaledVector(dir, d).add(off), dir, r, r, 6), skin: [LIMB.hand[k], LIMB.hand[k], 0], col: hc };
      }), { capStart: true, capEnd: true }));
    });
    // head with nose, brow, cheekbones, chin and ears
    geos.push(loft(H.map(r => ({ pts: ringY(r[0], r[1], r[2], r[3], r[4], 22, 2, headBump(r[0])), skin: [2, 2, 0], col: cols.skin })), { capStart: true, capEnd: true }));
    // hair shell (a bit fuller for women)
    const cp = capParams(female), cq = qx(-cp.rot), cqi = qx(cp.rot);
    const underCap = p => {             // hair under the cap stays inside it (no strands poking through)
      const q = p.clone().sub(cp.c).applyQuaternion(cq);
      if (q.y < -0.006) return p;
      const e = Math.sqrt((q.x / cp.s.x) ** 2 + (Math.max(0, q.y) / cp.s.y) ** 2 + (q.z / cp.s.z) ** 2);
      if (e <= 0.93) return p;
      return q.multiplyScalar(0.93 / e).applyQuaternion(cqi).add(cp.c);
    };
    geos.push(loft([0.04, 0.22, 0.45, 0.68, 0.86, 1].map(f => ({ pts: hairShellRing(H, f, female ? 0.011 : 0.007, 22).map(underCap), skin: [2, 2, 0], col: cols.hair })), { capStart: true }));
    // polo collar standing round the neck
    const cs = female ? 0.9 : 1;
    geos.push(loft([[1.492, .112, .082, .08, -.018], [1.512, .088, .078, .074, -.016], [1.538, .074, .07, .069, -.013], [1.546, .072, .068, .067, -.013]].map(r => ({
      pts: ringY(r[0], r[1] * cs, r[2] * cs, r[3] * cs, r[4], 18), skin: r[0] > 1.52 ? [1, 2, 0.15] : [1, 1, 0], col: cols.shirt
    }))));
    // shoes: white uppers, dark soles
    SIDES.forEach((s, k) => {
      geos.push(loft(SHOE.map(([z, hw, top, sole]) => {
        const sc = female ? 0.92 : 1;
        return { pts: shoeRing(s * HIP_X, z * sc, hw * (female ? 0.88 : 1), top * sc, sole, 14), skin: shoeSkin(z, k) };
      }), { capStart: true, capEnd: true, colFn: p => p.y < ANKLE_H - 0.066 ? cols.sole : cols.shoe }));
    });
    return merge(geos);
  }

  // surface of the torso at height y and across-position x (front or back), for the logo and the name print
  // front of the face at height y and across-position x (with nose, brow, cheekbones and eye sockets)
  function faceZ(female, y, x) {
    const r = interp(female ? HEAD.f : HEAD.m, y);
    const ring = ringY(y, r[1], r[2], r[3], r[4], 360, 2, headBump(y));
    let best = null, bd = 1e9;
    for (const p of ring) if (p.z > r[4]) { const d = Math.abs(p.x - x); if (d < bd) { bd = d; best = p; } }
    return best.z;
  }
  function torsoSurfaceZ(female, y, x, front) {
    const r = interp(female ? TORSO.f : TORSO.m, y);
    const ring = ringY(y, r[1], r[2], r[3], r[4], 180, torsoEx(y), female && y < 1.37 && y > 1.25 ? bust : null);
    let best = null, bd = 1e9;
    for (const p of ring) if ((p.z > r[4]) === front) { const d = Math.abs(p.x - x); if (d < bd) { bd = d; best = p; } }
    return best ? best.z : 0;
  }

  // the cap: an ellipsoid sized to the head plus the hair, tipped down at the back (figure space)
  function capParams(female) {
    const HT = female ? HEAD.f : HEAD.m, hw = HT[4], ht = (female ? 0.011 : 0.007) + 0.004, capY = 1.664;
    const capZ = hw[4] + (hw[2] - hw[3]) / 2, capD = (hw[2] + hw[3]) / 2 + ht;
    return { c: V(0, capY, capZ), rot: -0.13, s: V(hw[1] + ht, HT[0][0] - capY + ht, capD) };
  }

  // six-panel baseball cap: soft crown with seams, top button, eyelets, curved brim with stitching (cap space)
  function buildCap(sc, hex) {
    const grp = new THREE.Group(), col = new THREE.Color(hex);
    const fabric = new THREE.MeshStandardMaterial({ color: col, roughness: 0.92 });
    const seamM = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.8), roughness: 0.95 });
    const holeM = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.45), roughness: 1 });
    const crownY = y => 1.1 * y * (1 - 0.1 * y * y);          // flatter top, fuller panels
    const frontBulge = (y, z) => z > 0 ? 0.24 * Math.sin(Math.PI * Math.min(1, y * 1.15)) * z : 0;   // structured front panels
    const onCrown = (phi, pol, out = 1) => new THREE.Vector3(
      Math.sin(phi) * Math.cos(pol) * sc.x * out, crownY(Math.sin(pol)) * sc.y * out, Math.cos(phi) * Math.cos(pol) * sc.z * out * (1 + frontBulge(Math.sin(pol), Math.cos(phi) * Math.cos(pol))));
    // crown
    const g = new THREE.SphereGeometry(1, 36, 14, 0, Math.PI * 2, 0, Math.PI / 2), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), z = p.getZ(i); p.setXYZ(i, p.getX(i) * sc.x, crownY(y) * sc.y, z * sc.z * (1 + frontBulge(y, z))); }
    g.computeVertexNormals();
    const crown = new THREE.Mesh(g, fabric); crown.castShadow = true; grp.add(crown);
    // six seams from the band to the button, a small eyelet in every panel
    for (let k = 0; k < 6; k++) {
      const phi = k * Math.PI / 3, pts = [];
      for (let t = 0; t <= 12; t++) pts.push(onCrown(phi, (t / 12) * Math.PI / 2 * 0.985, 1.004));
      grp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0012, 4, false), seamM));
      const e = new THREE.Mesh(new THREE.CircleGeometry(0.0026, 10), holeM), q = onCrown(phi + Math.PI / 6, 0.95, 1.003);
      e.position.copy(q); e.lookAt(q.clone().multiply(new THREE.Vector3(2 / sc.x / sc.x, 2 / sc.y / sc.y, 2 / sc.z / sc.z)).add(q)); grp.add(e);
    }
    // sweatband edge and top button
    const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 4, 40), seamM);
    band.scale.set(sc.x, sc.z, 0.12); band.rotation.x = Math.PI / 2; band.position.y = 0.002; grp.add(band);
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 12, 6), fabric);
    btn.scale.y = 0.45; btn.position.y = crownY(1) * sc.y + 0.001; grp.add(btn);
    // brim: from the front half of the band out to ~7 cm, bent down at the sides, stitched
    const NU = 28, NV = 6, reach = 0.085, bp = [], bi = [];
    const brimPt = (u, v) => {        // u: -1..1 across, v: 0 band .. 1 edge
      const th = u * Math.PI / 2, sx = Math.sin(th), cz = Math.cos(th);
      const k = 0.985 + 0.015 * Math.min(1, v * 4);   // inner edge tucked just inside the crown's rim: no gap
      const x = sx * sc.x * k * (1 + 0.03 * v * cz), z = cz * sc.z * k + reach * v * Math.pow(cz, 0.7);
      return new THREE.Vector3(x, 0.001 - v * (0.008 * sx * sx + 0.016 * cz) - 0.006 * v * v, z);
    };
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) { const q = brimPt(-1 + 2 * i / NU, j / NV); bp.push(q.x, q.y, q.z); }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const a0 = j * (NU + 1) + i, a1 = a0 + 1, b0 = a0 + NU + 1, b1 = b0 + 1; bi.push(a0, b0, a1, a1, b0, b1);
    }
    const bg = new THREE.BufferGeometry(); bg.setIndex(bi); bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); bg.computeVertexNormals();
    const brim = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ color: col, roughness: 0.9, side: THREE.DoubleSide }));
    brim.castShadow = true; grp.add(brim);
    for (const v of [0.5, 0.72, 0.94]) {
      const pts = []; for (let i = 0; i <= 20; i++) pts.push(brimPt(-0.92 + 1.84 * i / 20, v).add(new THREE.Vector3(0, 0.0012, 0)));
      grp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.0007, 3, false), seamM));
    }
    return grp;
  }

  /* ---------------- figure ---------------- */
  function build(opt = {}) {
    const female = opt.sex === 'f', fi = female ? 1 : 0, h = hashName(opt.name);
    const C = c => new THREE.Color(c);
    const shirtHex = opt.shirt ?? 0xc8102e;
    const cols = {
      shirt: C(shirtHex), skin: C(SKINS[h % SKINS.length]), hair: C(HAIRS[(h >> 3) % HAIRS.length]),
      pants: C(female ? 0x24304a : [0x2c3342, 0x3b3b3b, 0xb9ad8f, 0x1f2a3a][(h >> 5) % 4]), belt: C(0x161616),
      shoe: C(0xf2f2f2), sole: C(0x3a3a3a), glove: C(0xfafafa), sock: C(0xf4f4f4)
    };
    const geo = buildGeometry(female, cols);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 });
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.castShadow = true; mesh.frustumCulled = false;
    const J = BIND[fi], bones = [];
    for (let b = 0; b < NB; b++) {
      const bone = new THREE.Bone(); bone.name = 'b' + b;
      bone.position.copy(PARENT[b] < 0 ? J[b] : J[b].clone().sub(J[PARENT[b]]));
      bones.push(bone);
      if (PARENT[b] < 0) mesh.add(bone); else bones[PARENT[b]].add(bone);
    }
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    const root = new THREE.Group(); root.add(mesh);

    // accessories on the bones: cap, eyes, ponytail (head); logo and name print (chest)
    const head = bones[2], chest = bones[1], hj = J[2], cj = J[1];
    const M = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.75 }, o));
    // cap sized to the head plus the hair under it, tipped down at the back, brim over the eyes
    const cp = capParams(female);
    const capGrp = new THREE.Group(); capGrp.position.copy(cp.c).sub(hj); capGrp.rotation.x = cp.rot;
    if (opt.cap !== false) { capGrp.add(buildCap(cp.s, opt.cap ?? 0xffffff)); head.add(capGrp); }
    // face: eyes (white, iris, pupil, lid line), eyebrows, lips
    const irisCol = [0x5a3b22, 0x3d6b8f, 0x4f6b3a, 0x2e2018][(h >> 7) % 4];
    const white = M(0xf3efe8, { roughness: 0.35 }), irisM = M(irisCol, { roughness: 0.3 }), pupilM = M(0x0b0b0b, { roughness: 0.2 });
    const browM = M(cols.hair.clone().multiplyScalar(0.7).getHex(), { roughness: 0.9 }), lidM = M(female ? 0x1a1310 : 0x5e3d2c, { roughness: 0.8 });
    const lipM = M(female ? 0xb4545a : 0xa86a5c, { roughness: 0.55 });
    const ex = female ? 0.029 : 0.031, ey = female ? 1.625 : 1.623, sp = new THREE.SphereGeometry(1, 12, 8);
    const put = (mat, x, y, dz, sx, sy, sz, rz = 0) => {
      const m = new THREE.Mesh(sp, mat); m.position.set(x, y - hj.y, faceZ(female, y, x) + dz - hj.z);
      m.scale.set(sx, sy, sz); m.rotation.z = rz; head.add(m); return m;
    };
    for (const s of SIDES) {
      put(white, s * ex, ey, -0.002, 0.0115, 0.0068, 0.005);
      put(irisM, s * (ex - 0.0015), ey, 0.0022, 0.0055, 0.0055, 0.0018);
      put(pupilM, s * (ex - 0.0015), ey, 0.0034, 0.0025, 0.0025, 0.001);
      put(lidM, s * ex, ey + 0.0058, 0.0015, 0.0125, female ? 0.0022 : 0.0016, 0.0035, s * 0.06);      // upper lid / lashes
      put(browM, s * (ex + 0.002), ey + 0.0175, 0.003, 0.0145, female ? 0.0022 : 0.0032, 0.004, s * (female ? 0.16 : 0.08));
    }
    const ly0 = female ? 1.559 : 1.555;
    put(lipM, 0, ly0 + 0.0028, 0.0006, female ? 0.0155 : 0.0165, female ? 0.0032 : 0.0024, 0.0045);   // upper lip
    put(lipM, 0, ly0 - 0.0028, 0.0004, female ? 0.0145 : 0.015, female ? 0.0036 : 0.0026, 0.0045);    // lower lip
    if (female) {
      const hairM = M(cols.hair.getHex(), { roughness: 0.9 });
      // tapered ponytail through the back of the cap, with a hair tie
      const prof = [[0.001, 0.012], [0.02, 0.006], [0.028, -0.02], [0.033, -0.06], [0.031, -0.1], [0.025, -0.14], [0.016, -0.175], [0.006, -0.2], [0.001, -0.205]];
      const tail = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 12), hairM);
      tail.position.set(0, 1.628 - hj.y, -0.112 - hj.z); tail.rotation.x = 0.42; tail.scale.set(1, 1, 0.8); tail.castShadow = true; head.add(tail);
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.0045, 6, 14), M(shirtHex));
      tie.position.set(0, -0.004, 0); tie.rotation.x = Math.PI / 2; tail.add(tie);
    }
    // a small Swiss cross on the left chest
    const ly = female ? 1.45 : 1.405, lx = female ? 0.065 : 0.075;
    const zf = torsoSurfaceZ(female, ly, lx, true), slope = (torsoSurfaceZ(female, ly, lx + 0.01, true) - torsoSurfaceZ(female, ly, lx - 0.01, true)) / 0.02;
    const logo = new THREE.Group(); logo.position.set(lx, ly - cj.y, zf + (female ? 0.007 : 0.004) - cj.z); logo.rotation.y = Math.atan(-slope);
    const wm = new THREE.MeshBasicMaterial({ color: 0xffffff });
    logo.add(new THREE.Mesh(new THREE.PlaneGeometry(0.044, 0.013), wm), new THREE.Mesh(new THREE.PlaneGeometry(0.013, 0.044), wm));
    chest.add(logo);
    // name across the back of the shirt, bent to the body
    if (opt.name && typeof nameTexture === 'function') {
      const g = new THREE.PlaneGeometry(0.27, 0.085, 18, 3); g.rotateY(Math.PI);
      const p = g.attributes.position, ny = female ? 1.335 : 1.345;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = ny + p.getY(i);
        p.setXYZ(i, x, y - cj.y, torsoSurfaceZ(female, y, x, false) - 0.003 - cj.z);
      }
      g.computeVertexNormals();
      const lab = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: nameTexture(opt.name, shirtHex), transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
      chest.add(lab);
    }
    if (female) root.scale.setScalar(0.96);
    return { root, mesh, bones, female, fi, skinned: true, P: J.map(v => v.clone()), Q: bones.map(() => new THREE.Quaternion()) };
  }

  /* ---------------- posing ---------------- */
  const _m = new THREE.Matrix4(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
  const AXX = V(1, 0, 0), AXY = V(0, 1, 0);
  const qx = a => new THREE.Quaternion().setFromAxisAngle(AXX, a);
  const qy = a => new THREE.Quaternion().setFromAxisAngle(AXY, a);
  const qyx = (y, x) => qy(y).multiply(qx(x));
  // rotation taking the bind frame (primary d0, secondary s0) to (d, s)
  function basis(d, s, out) {
    const sp = s.clone().addScaledVector(d, -s.dot(d)); if (sp.lengthSq() < 1e-8) sp.set(0, 0, 1).addScaledVector(d, -d.z); sp.normalize();
    const z = new THREE.Vector3().crossVectors(sp, d);
    _m.makeBasis(sp, d, z); return out.setFromRotationMatrix(_m);
  }
  const BIND_INV = { leg: basis(V(0, -1, 0), V(0, 0, 1), new THREE.Quaternion()).invert(), arm: [] };
  SIDES.forEach((s, k) => { BIND_INV.arm[k] = basis(V(s * Math.sin(ARM_ABD), -Math.cos(ARM_ABD), 0), V(0, 0, -1), new THREE.Quaternion()).invert(); });
  const PALM = GRIP - UPPER_ARM - FOREARM;      // wrist to palm centre
  // fingers curl towards the palm (the hand mesh is turned by HAND_TWIST about the arm)
  const CURL_AXIS = SIDES.map(s => {
    const d0 = V(s * Math.sin(ARM_ABD), -Math.cos(ARM_ABD), 0), n = V(-s, 0, 0).applyAxisAngle(d0, -s * 0.45);
    return d0.clone().cross(n).normalize();
  });
  function curl(g, k, a) {
    const fg = LIMB.fingers[k]; fk(g, fg);
    g.Q[fg].copy(g.Q[LIMB.hand[k]]).multiply(new THREE.Quaternion().setFromAxisAngle(CURL_AXIS[k], a));
  }

  function fk(g, b) { // joint position of b from its parent's joint and rotation
    const p = PARENT[b], J = BIND[g.fi];
    g.P[b].copy(J[b]).sub(J[p]).applyQuaternion(g.Q[p]).add(g.P[p]);
  }
  // two-bone chain: upper bone u, lower bone l, reaching T (ankle / palm), bending towards `pole`
  function chain(g, u, l, T, l1, l2, pole, inv) {
    const A = g.P[u], AT = T.clone().sub(A), D0 = AT.length(), dir = AT.divideScalar(D0 || 1);
    const D = clamp(D0, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-4);
    const a = (l1 * l1 - l2 * l2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const perp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    const K = A.clone().addScaledVector(dir, a).addScaledVector(perp, h);
    const E = A.clone().addScaledVector(dir, D);
    basis(K.clone().sub(A).normalize(), perp, g.Q[u]).multiply(inv);
    basis(E.clone().sub(K).normalize(), perp, g.Q[l]).multiply(inv);
    g.P[l].copy(K);
    return E;
  }
  function legs(g, feet, poles) {
    for (let k = 0; k < 2; k++) {
      const th = LIMB.thigh[k], sh = LIMB.shin[k], ft = LIMB.foot[k], to = LIMB.toe[k], f = feet[k];
      fk(g, th);
      const E = chain(g, th, sh, f.pos, THIGH, SHIN, poles[k], BIND_INV.leg);
      g.P[ft].copy(E);
      g.Q[ft].copy(qyx(f.yaw || 0, f.pitch || 0));
      g.Q[to].copy(qy(f.yaw || 0)); if (f.toe) g.Q[to].multiply(qx(f.toe));
      fk(g, to);
    }
  }
  function torso(g, pelvisPos, qPelvis, qChest, qHead) {
    g.P[0].copy(pelvisPos); g.Q[0].copy(qPelvis);
    fk(g, 1); g.Q[1].copy(qChest);
    fk(g, 2); g.Q[2].copy(qHead);
  }
  const _sh = [V(), V()];
  // arm to a palm target (shoulders roll forward up to 6 cm when the target is just out of reach).
  // Without `shaft` the wrist stays straight; with the club's direction the wrist hinges so the hand sits halfway
  // between the forearm and the shaft, the palm on the grip (cocking the club bends the wrist, not the forearm).
  const _bk = V(0, 0, -1);
  function armIK(g, k, T, pole, shaft = null, hinge = 0.5) {
    const ua = LIMB.upperArm[k], fa = LIMB.forearm[k], hd = LIMB.hand[k], inv = BIND_INV.arm[k];
    fk(g, ua);
    const reach = (UPPER_ARM + FOREARM + PALM) * 0.985, d = g.P[ua].distanceTo(T);
    _sh[k].set(0, 0, 0);
    if (d > reach) { _sh[k].copy(T).sub(g.P[ua]).setLength(Math.min(0.06, d - reach)); g.P[ua].add(_sh[k]); }
    if (!shaft) {
      chain(g, ua, fa, T, UPPER_ARM, FOREARM + PALM, pole, inv);
      fk(g, hd); g.Q[hd].copy(g.Q[fa]); curl(g, k, 1.3);
      return T;
    }
    let f = T.clone().sub(g.P[ua]).normalize(), h = V();
    for (let it = 0; it < 3; it++) {
      h.copy(f).multiplyScalar(1 - hinge).addScaledVector(shaft, hinge).normalize();
      chain(g, ua, fa, T.clone().addScaledVector(h, -PALM), UPPER_ARM, FOREARM, pole, inv);
      fk(g, hd);
      f.copy(g.P[hd]).sub(g.P[fa]).normalize();
    }
    h.copy(f).multiplyScalar(1 - hinge).addScaledVector(shaft, hinge).normalize();
    basis(h, _bk.clone().applyQuaternion(g.Q[fa]), g.Q[hd]).multiply(inv);
    curl(g, k, 1.75);                 // fingers wrapped round the grip
    return palmOf(g, k);
  }
  function palmOf(g, k) {
    const s = SIDES[k];
    return V(s * Math.sin(ARM_ABD), -Math.cos(ARM_ABD), 0).multiplyScalar(PALM).applyQuaternion(g.Q[LIMB.hand[k]]).add(g.P[LIMB.hand[k]]);
  }
  // arm by swing angles (walking): `fwd` rotates the arm forward, `bend` the elbow, `flex` the wrist
  function armFK(g, k, fwd, bend, flex = 0.12) {
    const ua = LIMB.upperArm[k], fa = LIMB.forearm[k], hd = LIMB.hand[k], s = SIDES[k];
    fk(g, ua); _sh[k].set(0, 0, 0);
    g.Q[ua].copy(g.Q[1]).multiply(qx(-fwd)).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), s * 0.03));
    fk(g, fa);
    g.Q[fa].copy(g.Q[ua]).multiply(qx(-bend));
    fk(g, hd); g.Q[hd].copy(g.Q[fa]).multiply(qx(-flex));
    curl(g, k, k === 1 ? 1.6 : 0.35);  // right hand holds the club, left hangs relaxed
    return palmOf(g, k);
  }
  function apply(g) {
    const B = g.bones, J = BIND[g.fi];
    B[0].position.copy(g.P[0]); B[0].quaternion.copy(g.Q[0]);
    for (let b = 1; b < NB; b++) {
      B[b].quaternion.copy(_qa.copy(g.Q[PARENT[b]]).invert().multiply(g.Q[b]));
      B[b].position.copy(J[b]).sub(J[PARENT[b]]);
    }
    for (let k = 0; k < 2; k++) if (_sh[k].lengthSq() > 0) {   // shoulder roll, in the chest's frame
      const ua = LIMB.upperArm[k];
      B[ua].position.add(_sh[k].clone().applyQuaternion(_qb.copy(g.Q[1]).invert()));
    }
  }

  // head turned towards ps.look (a world point), blended in by ps.lookK (0…1); yaw limited to ±maxYaw
  const _lv = new THREE.Vector3(), _lq = new THREE.Quaternion();
  function headLook(g, ps, q, maxYaw) {
    const k = ps.look ? (ps.lookK ?? 1) : 0; if (k <= 0) return q;
    g.root.updateMatrixWorld(); _lv.copy(ps.look); g.root.worldToLocal(_lv); _lv.y -= 1.6;
    const yaw = clamp(Math.atan2(_lv.x, _lv.z), -maxYaw, maxYaw), pitch = clamp(-Math.atan2(_lv.y, Math.hypot(_lv.x, _lv.z)), -0.6, 0.9);
    return q.clone().slerp(_lq.copy(qyx(yaw, pitch)), k);
  }

  /* ---------------- golfer poses ---------------- */
  const tmp = (x, y, z) => V(x, y, z);
  function update(g, ps, club) {
    const clubVis = ps.mode !== 'sit'; g.shaft.visible = g.grip.visible = g.clubHead.visible = clubVis;
    if (ps.mode === 'sit') {            // in the cart (or on a chair): thighs forward, hands on the wheel or on the lap
      torso(g, tmp(0, PELVIS_Y, -0.02), qx(-0.12), qx(-0.06), headLook(g, ps, qx(0.04), 1.3));
      const fy = ps.chair ? 0.36 : 0.5, fz = ps.chair ? 0.5 : 0.47;
      legs(g, [{ pos: tmp(0.13, fy, fz) }, { pos: tmp(-0.13, fy, fz) }], [tmp(0.2, 1, 1), tmp(-0.2, 1, 1)]);
      const hL = ps.drive ? tmp(0.14, 1.2, 0.42) : tmp(0.15, 0.99, 0.3), hR = ps.drive ? tmp(-0.14, 1.2, 0.42) : tmp(-0.15, 0.99, 0.3);
      armIK(g, 0, hL, tmp(0.6, -1, -0.4));
      if (ps.wave > 0) {                  // waving with the right hand, raised beside the head
        const up = Math.min(1, ps.wave * 3, (ps.waveDur - ps.wave) * 3 + 0.001), sw = Math.sin(ps.wave * 11) * 0.09;
        armIK(g, 1, hR.clone().lerp(tmp(-0.32 + sw, 1.78, 0.12), clamp(up, 0, 1)), tmp(-0.8, -0.6, -0.2));
      } else armIK(g, 1, hR, tmp(-0.6, -1, -0.4));
      apply(g); return;
    }
    if (ps.mode === 'walk') {
      const run = ps.speed > 3, k = Math.min(1, ps.speed / 1.2), ph = ps.phase;
      const A = (run ? 0.42 : 0.3) * k, lift = (run ? 0.16 : 0.08) * k;
      const feet = [0, 1].map(i => {
        const phi = (((ph + i * Math.PI) / (Math.PI * 2)) % 1 + 1) % 1, s = SIDES[i];
        let z, y = ANKLE_H, pitch = 0;
        if (phi < 0.5) {                // stance: foot planted, sliding back under the body
          z = A * (1 - 4 * phi);
          const toe = clamp((phi - 0.32) / 0.18, 0, 1); y += 0.05 * toe * k; pitch = 0.45 * toe * k;  // heel rises before toe-off
          if (phi < 0.08) pitch = -0.25 * (1 - phi / 0.08) * k;                                       // heel strike, toes up
        } else {                        // swing: forward through the air
          const u = (phi - 0.5) * 2, e = u * u * (3 - 2 * u);
          z = -A + 2 * A * e; y += lift * Math.sin(Math.PI * u); pitch = 0.3 * (1 - u) * k - 0.2 * Math.max(0, u - 0.7) / 0.3 * k;
        }
        return { pos: tmp(s * (HIP_X + 0.01), y, z + 0.02), pitch, yaw: s * 0.05 };
      });
      const drop = k * ((run ? 0.06 : 0.035) + 0.022 * (0.5 + 0.5 * Math.cos(2 * ph)));
      const lean = run ? 0.18 : 0.04;
      torso(g, tmp(0, PELVIS_Y - drop, 0), qyx(-0.09 * k * Math.cos(ph), lean * 0.4), qyx(0.07 * k * Math.cos(ph), lean), qx(0.06 - lean * 0.5));
      legs(g, feet, [tmp(0.1, 0, 1), tmp(-0.1, 0, 1)]);
      const sw = (run ? 0.7 : 0.38) * k * Math.cos(ph);
      armFK(g, 0, -sw, run ? 1.0 : 0.2 + 0.15 * Math.max(0, -sw), 0.15);
      const hR = armFK(g, 1, sw * 0.6, run ? 0.9 : 0.25 + 0.1 * Math.max(0, sw), 0.05);
      apply(g);
      // the club in the right hand
      const L = CLUBS[club].len, cdir = tmp(0, -0.55, 0.85).normalize();
      const top = hR.clone().addScaledVector(cdir, -0.12), headP = hR.clone().addScaledVector(cdir, L - 0.12);
      pointLimb(g.grip, top, hR.clone().addScaledVector(cdir, 0.14)); pointLimb(g.shaft, top, headP);
      g.clubHead.position.copy(headP); g.clubHead.quaternion.identity();
      return;
    }
    // address / swing
    const cs = clubSetup[club], L = CLUBS[club].len, putter = CLUBS[club].putter;
    const th = ps.theta;
    const turn = putter ? 0 : clamp(th / 2.4, -1, 1.1) * 0.9;
    const hipTurn = putter ? 0 : turn * (th > 0 ? 0.75 : 0.45);
    const stance = putter ? 0.15 : 0.24;
    const shift = putter ? 0 : clamp(th, -2.5, 2.5) * 0.03;
    const finish = putter ? 0 : clamp((th - 0.9) / 1.4, 0, 1);    // trail heel up, hips facing the target
    torso(g, tmp(shift, 0.925 + 0.02 * finish, -0.07 + 0.04 * finish),
      qyx(hipTurn, 0.32 - 0.15 * finish), qyx(turn, 0.5 - 0.22 * finish), headLook(g, ps, qyx(turn * 0.15, 0.78 - 0.5 * finish), 1.9));
    legs(g, [
      { pos: tmp(stance, ANKLE_H, 0), yaw: 0.3 },
      { pos: tmp(-stance + 0.05 * finish, ANKLE_H + 0.06 * finish, 0.03 * finish), yaw: -0.1 + 0.7 * finish, pitch: 0.9 * finish, toe: -0.9 * finish }
    ], [tmp(0.25, 0, 1), tmp(-0.25 + 0.6 * finish, 0, 1)]);
    const p = swingPoints(cs.alpha, th, ps.cock, L);
    const dir = p.head.clone().sub(p.hands).normalize();
    const hl = p.hands.clone().addScaledVector(dir, -0.015), hr = p.hands.clone().addScaledVector(dir, 0.075);
    armIK(g, 0, hl, tmp(0.25, -1, -0.15), dir, 0.4);
    armIK(g, 1, hr, tmp(-0.35, -1, -0.1), dir, 0.45);
    apply(g);
    pointLimb(g.grip, p.hands.clone().addScaledVector(dir, -0.08), p.hands.clone().addScaledVector(dir, 0.18));
    pointLimb(g.shaft, p.hands.clone().addScaledVector(dir, -0.08), p.head);
    g.clubHead.position.copy(p.head);
    g.clubHead.quaternion.identity();
    g.clubHead.rotation.z = Math.atan2(dir.x, -dir.y);
  }

  return { build, update, BIND };
})();
