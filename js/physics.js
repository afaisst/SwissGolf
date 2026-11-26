// SwissGolf – Clubs and golf-ball physics (flight, bounce, roll)
'use strict';

/* =====================================================================
   Clubs (ball speed m/s, launch °, spin rpm) – tuned to realistic carries
   ===================================================================== */
const CLUBS = [
  { id: 'DR', name: 'Driver', speed: 66, launch: 12.5, spin: 2800, len: 1.14, disp: 2.6 },
  { id: '3W', name: '3 Wood', speed: 61, launch: 11.5, spin: 3600, len: 1.08, disp: 2.3 },
  { id: '5W', name: '5 Wood', speed: 58, launch: 12.5, spin: 4300, len: 1.05, disp: 2.2 },
  { id: '4H', name: '4 Hybrid', speed: 55, launch: 13.5, spin: 4600, len: 1.01, disp: 2.1 },
  { id: '5I', name: '5 Iron', speed: 52.5, launch: 14.5, spin: 5200, len: 0.98, disp: 2.0 },
  { id: '6I', name: '6 Iron', speed: 50, launch: 16, spin: 6000, len: 0.96, disp: 1.9 },
  { id: '7I', name: '7 Iron', speed: 47.5, launch: 18, spin: 6800, len: 0.95, disp: 1.8 },
  { id: '8I', name: '8 Iron', speed: 44.5, launch: 20.5, spin: 7500, len: 0.93, disp: 1.7 },
  { id: '9I', name: '9 Iron', speed: 42, launch: 23, spin: 8200, len: 0.92, disp: 1.6 },
  { id: 'PW', name: 'Pitching Wedge', speed: 39, launch: 26, spin: 8800, len: 0.9, disp: 1.5 },
  { id: 'GW', name: 'Gap Wedge 50°', speed: 36, launch: 29, spin: 9200, len: 0.9, disp: 1.4 },
  { id: 'SW', name: 'Sand Wedge 56°', speed: 32, launch: 32, spin: 9500, len: 0.89, disp: 1.3 },
  { id: 'LW', name: 'Lob Wedge 60°', speed: 28, launch: 36, spin: 9800, len: 0.88, disp: 1.3 },
  { id: 'PT', name: 'Putter', speed: 6.2, launch: 0, spin: 0, len: 0.86, disp: 0.35, putter: true },
];
const PUTTER = CLUBS.length - 1;

/* =====================================================================
   Ball physics
   ===================================================================== */
const GRAV = 9.81, BR = 0.02135, KAERO = 0.5 * 1.2 * Math.PI * BR * BR / 0.04593;
const DT = 1 / 240;
const CUP_R = 0.054;

function launchState(pos, club, power, yaw, lie, random) {
  const c = CLUBS[club], L = SURF[lie];
  let speed = c.speed * power, launch = c.launch, rpm = c.spin * (0.55 + 0.45 * power);
  let dispDeg = 0, tiltDeg = 0;
  if (!c.putter) {
    let spdF = L.spd, spinF = L.spin;
    if (lie === S_BUNKER && (c.id === 'SW' || c.id === 'LW' || c.id === 'GW')) spdF = 0.8;
    if (c.id === 'DR' && lie !== S_TEE) { spdF *= 0.93; launch -= 2; }
    if (lie === S_ROUGH || lie === S_DEEP) launch += 2;
    speed *= spdF; rpm *= spinF;
    if (random) {
      const extra = power > 0.92 ? 1 + (power - 0.92) * 8 : 1;
      dispDeg = gauss() * c.disp * L.disp * extra * 0.8;
      tiltDeg = gauss() * 5 * L.disp * extra;
    }
  } else if (random) dispDeg = gauss() * c.disp * (lie === S_GREEN ? 1 : 2);
  const y = yaw + dispDeg * Math.PI / 180;
  const dx = -Math.sin(y), dz = -Math.cos(y);
  const la = launch * Math.PI / 180;
  const st = {
    x: pos.x, y: pos.y, z: pos.z,
    vx: dx * Math.cos(la) * speed, vy: Math.sin(la) * speed, vz: dz * Math.cos(la) * speed,
    w: rpm * 2 * Math.PI / 60,
    mode: c.putter ? 'roll' : 'flight', t: 0, landed: false, bounces: 0, treeId: -1, lipped: false,
    start: { x: pos.x, z: pos.z }, carry: null, lastDry: { x: pos.x, z: pos.z }, lastIn: { x: pos.x, z: pos.z }
  };
  const tl = tiltDeg * Math.PI / 180;
  // spin axis: horizontal, perpendicular to direction (backspin), tilted for curvature
  st.ax = -dz * Math.cos(tl); st.ay = -Math.sin(tl); st.az = dx * Math.cos(tl);
  return st;
}

function terrainNormal(x, z) {
  const e = 0.25;
  const hx = (Hw(x + e, z) - Hw(x - e, z)) / (2 * e), hz = (Hw(x, z + e) - Hw(x, z - e)) / (2 * e);
  const l = Math.hypot(hx, 1, hz);
  return [-hx / l, 1 / l, -hz / l];
}

// one physics step. returns null or an event {type:...}
function physStep(st, wind, cup, trees) {
  st.t += DT;
  if (st.mode === 'flight') {
    const vrx = st.vx - wind.x, vry = st.vy, vrz = st.vz - wind.z;
    const v = Math.hypot(vrx, vry, vrz) || 1e-6;
    const S = BR * st.w / v;
    const Cd = 0.21 + 0.24 * S;
    const Cl = st.w > 5 ? Math.min(0.36, 0.05 + 1.6 * S - 1.6 * S * S) : 0;
    let lx = st.ay * vrz - st.az * vry, ly = st.az * vrx - st.ax * vrz, lz = st.ax * vry - st.ay * vrx;
    const ll = Math.hypot(lx, ly, lz) || 1; lx /= ll; ly /= ll; lz /= ll;
    const kd = KAERO * Cd * v, kl = KAERO * Cl * v * v;
    st.vx += (-kd * vrx + kl * lx) * DT;
    st.vy += (-GRAV - kd * vry + kl * ly) * DT;
    st.vz += (-kd * vrz + kl * lz) * DT;
    st.x += st.vx * DT; st.y += st.vy * DT; st.z += st.vz * DT;
    st.w *= Math.exp(-DT / 25);
    if (st.x < X0 + 2 || st.x > X1 - 2 || -st.z < S0 + 2 || -st.z > S1 - 2) return { type: 'ob' };
    // remember last point above dry land (for penalty-area drops)
    if (((st.t * 240) | 0) % 3 === 0) {           // remember where the ball last was over dry land / in bounds (rules: crossing points)
      if (Sw(st.x, st.z) !== S_WATER) { st.lastDry.x = st.x; st.lastDry.z = st.z; }
      if (typeof isOB === 'function' && !isOB(st.x, -st.z)) { st.lastIn.x = st.x; st.lastIn.z = st.z; }
    }
    if (trees) treeCollide(st, trees);
    if (typeof solidHit === 'function' && solidHit(st) === 'rest') { st.vx = st.vz = 0; st.y = Hw(st.x, st.z) + BR; return { type: 'rest' }; }   // club house, range, nets…
    const h = Hw(st.x, st.z);
    if (st.y - BR <= h) {
      const surf = Sw(st.x, st.z);
      if (!st.landed) { st.landed = true; st.carry = { x: st.x, z: st.z }; }
      if (surf === S_WATER) return { type: 'water' };
      if (cup && Math.hypot(st.x - cup.x, st.z - cup.z) < CUP_R && Math.hypot(st.vx, st.vz) < 4) return { type: 'holed' };
      const n = terrainNormal(st.x, st.z);
      const vn = st.vx * n[0] + st.vy * n[1] + st.vz * n[2];
      st.y = h + BR;
      if (vn < 0) {
        const P = SURF[surf];
        let tx = st.vx - vn * n[0], ty = st.vy - vn * n[1], tz = st.vz - vn * n[2];
        const rpm = st.w * 60 / (2 * Math.PI);
        const brake = clamp(P.f + P.grab * Math.min(1, rpm / 9000) * Math.min(1, -vn / 12) + (st.bounces === 0 ? 0.05 : 0), 0, 0.97);
        tx *= 1 - brake; ty *= 1 - brake; tz *= 1 - brake;
        const e = P.e * (1 - Math.min(0.4, -vn / 60));
        const nvn = -vn * e;
        st.vx = tx + n[0] * nvn; st.vy = ty + n[1] * nvn; st.vz = tz + n[2] * nvn;
        st.w *= 0.45; st.bounces++;
        if (nvn < 0.7) { st.mode = 'roll'; st.vy = 0; }
        return { type: 'bounce', surf, speed: -vn };
      }
    }
    return null;
  }
  // rolling on the ground
  const surf = Sw(st.x, st.z);
  if (surf === S_WATER) return { type: 'water' };
  if (((st.t * 240) | 0) % 3 === 0) { st.lastDry.x = st.x; st.lastDry.z = st.z; if (typeof isOB === 'function' && !isOB(st.x, -st.z)) { st.lastIn.x = st.x; st.lastIn.z = st.z; } }
  const P = SURF[surf];
  const e = 0.12;
  const hx = (Hw(st.x + e, st.z) - Hw(st.x - e, st.z)) / (2 * e), hz = (Hw(st.x, st.z + e) - Hw(st.x, st.z - e)) / (2 * e);
  const slopeAcc = (5 / 7) * GRAV;
  let ax = -slopeAcc * hx, az = -slopeAcc * hz;
  const sp = Math.hypot(st.vx, st.vz);
  if (sp < 0.06 && slopeAcc * Math.hypot(hx, hz) < P.roll) { st.vx = st.vz = 0; st.y = Hw(st.x, st.z) + BR; return { type: 'rest' }; }
  if (sp > 1e-5) { ax -= P.roll * st.vx / sp; az -= P.roll * st.vz / sp; }
  st.vx += ax * DT; st.vz += az * DT;
  st.x += st.vx * DT; st.z += st.vz * DT;
  if (typeof solidHit === 'function') { st.y = Hw(st.x, st.z) + BR; solidHit(st); }
  st.y = Hw(st.x, st.z) + BR;
  if (st.x < X0 + 2 || st.x > X1 - 2 || -st.z < S0 + 2 || -st.z > S1 - 2) return { type: 'ob' };
  if (cup) {
    const d = Math.hypot(st.x - cup.x, st.z - cup.z);
    const v2 = Math.hypot(st.vx, st.vz);
    if (d < CUP_R) {
      if (v2 < 1.45) return { type: 'holed' };
      if (d < 0.035 && !st.lipped) { // lip out
        st.lipped = true; const a = (Math.random() - 0.5) * 1.4, c = Math.cos(a), s = Math.sin(a);
        const vx = st.vx * c - st.vz * s, vz = st.vx * s + st.vz * c; st.vx = vx * 0.55; st.vz = vz * 0.55;
        return { type: 'lip' };
      }
    } else if (d < 0.12 && v2 < 0.9) { // gentle pull at the edge of the cup
      st.vx += (cup.x - st.x) / d * 0.6 * DT; st.vz += (cup.z - st.z) / d * 0.6 * DT;
    }
  }
  if (st.t > 60) return { type: 'rest' };
  return null;
}

// predicted landing point (no wind, no randomness, no trees)
function predict(pos, club, power, yaw, lie) {
  const st = launchState(pos, club, power, yaw, lie, false);
  if (CLUBS[club].putter) {
    const P = SURF[lie === S_GREEN || lie === S_FRINGE ? S_GREEN : lie];
    const sp = CLUBS[club].speed * power, d = sp * sp / (2 * P.roll);
    return { x: pos.x + (-Math.sin(yaw)) * d, z: pos.z + (-Math.cos(yaw)) * d, carry: d };
  }
  const nowind = { x: 0, z: 0 };
  for (let i = 0; i < 240 * 12; i++) {
    const ev = physStep(st, nowind, null, null);
    if (st.landed || (ev && ev.type !== 'bounce')) break;
  }
  const c = st.carry || st;
  return { x: c.x, z: c.z, carry: Math.hypot(c.x - pos.x, c.z - pos.z) };
}
// flat-ground carry table for HUD
const CARRY = CLUBS.map((c, i) => {
  if (c.putter) return 0;
  const st = launchState({ x: 0, y: BR, z: 0 }, i, 1, 0, i === 0 ? S_TEE : S_FAIR, false);
  let y0 = 0;
  for (let k = 0; k < 240 * 12; k++) {
    const vrx = st.vx, vry = st.vy, vrz = st.vz, v = Math.hypot(vrx, vry, vrz), S = BR * st.w / v;
    const Cd = 0.21 + 0.24 * S, Cl = Math.min(0.36, 0.05 + 1.6 * S - 1.6 * S * S);
    let lx = st.ay * vrz - st.az * vry, ly = st.az * vrx - st.ax * vrz, lz = st.ax * vry - st.ay * vrx;
    const ll = Math.hypot(lx, ly, lz) || 1;
    st.vx += (-KAERO * Cd * v * vrx + KAERO * Cl * v * v * lx / ll) * DT;
    st.vy += (-GRAV - KAERO * Cd * v * vry + KAERO * Cl * v * v * ly / ll) * DT;
    st.vz += (-KAERO * Cd * v * vrz + KAERO * Cl * v * v * lz / ll) * DT;
    st.x += st.vx * DT; st.y += st.vy * DT; st.z += st.vz * DT; st.w *= Math.exp(-DT / 25);
    if (st.y < 0) break;
  }
  return Math.hypot(st.x, st.z);
});
