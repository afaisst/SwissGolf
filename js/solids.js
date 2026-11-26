// SwissGolf – solid obstacles of the detailed models (club house, terrace furniture, hedges, driving range bays,
// nets, ball machines): oriented boxes in world space. The ball bounces off them (nets catch it), golfers can't
// walk through them and carts stop in front of them.
// A solid: centre (cx, cz), unit axis (ux, uz) along its length, half length hl, half width hw, heights y0 … y1.
const SOLIDS = [], SOLID_GRID = new Map(), SOLID_CELL = 8;
const SOLID_E = { wall: 0.4, roof: 0.35, hedge: 0.12, furniture: 0.3, post: 0.45, net: 0.02 };
function addSolid(o) {
  o.kind = o.kind || 'wall'; o.e = SOLID_E[o.kind] ?? 0.3;
  SOLIDS.push(o);
  const r = Math.hypot(o.hl, o.hw) + 0.5;
  for (let i = Math.floor((o.cx - r) / SOLID_CELL); i <= Math.floor((o.cx + r) / SOLID_CELL); i++)
    for (let j = Math.floor((o.cz - r) / SOLID_CELL); j <= Math.floor((o.cz + r) / SOLID_CELL); j++) {
      const k = i + ',' + j; if (!SOLID_GRID.has(k)) SOLID_GRID.set(k, []); SOLID_GRID.get(k).push(o);
    }
}
// box from a model's local frame: corners a0..a1 (along the local x), b0..b1 (local z), y0..y1, through a matrix
// that maps the local frame to the world (rotation about y and translation only)
function addSolidBox(m, x0, x1, z0, z1, y0, y1, kind) {
  const c = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2).applyMatrix4(m);
  const u = new THREE.Vector3(1, 0, 0).transformDirection(m);
  const ul = Math.hypot(u.x, u.z) || 1;
  addSolid({ cx: c.x, cz: c.z, ux: u.x / ul, uz: u.z / ul, hl: Math.abs(x1 - x0) / 2, hw: Math.abs(z1 - z0) / 2, y0: c.y - (y1 - y0) / 2, y1: c.y + (y1 - y0) / 2, kind });
}
// wall segment between two world points (x, z), thickness t
function addSolidSegment(x0, z0, x1, z1, t, y0, y1, kind) {
  const L = Math.hypot(x1 - x0, z1 - z0) || 1;
  addSolid({ cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, ux: (x1 - x0) / L, uz: (z1 - z0) / L, hl: L / 2, hw: t / 2, y0, y1, kind });
}
function solidsNear(x, z) { return SOLID_GRID.get(Math.floor(x / SOLID_CELL) + ',' + Math.floor(z / SOLID_CELL)); }
// is a circle of radius r at ground level (x, z) inside a solid that stands in a person's way?
function solidAt(x, z, r) {
  const L = solidsNear(x, z); if (!L) return null;
  const g = Hw(x, z);
  for (const o of L) {
    if (o.y0 > g + 1.8 || o.y1 < g + 0.15) continue;           // roofs overhead, things flat on the ground
    const dx = x - o.cx, dz = z - o.cz, a = dx * o.ux + dz * o.uz, b = -dx * o.uz + dz * o.ux;
    if (Math.abs(a) < o.hl + r && Math.abs(b) < o.hw + r) return o;
  }
  return null;
}
// ball against the solids: push out along the shallowest face, bounce. Returns 'rest' if the ball has come to a
// stop on top of something (roof, table) – it then counts as lying underneath.
function solidHit(st) {
  const L = solidsNear(st.x, st.z); if (!L) return null;
  let hit = null;
  for (const o of L) {
    if (st.y < o.y0 - BR || st.y > o.y1 + BR) continue;
    const dx = st.x - o.cx, dz = st.z - o.cz, a = dx * o.ux + dz * o.uz, b = -dx * o.uz + dz * o.ux;
    const pa = o.hl + BR - Math.abs(a), pb = o.hw + BR - Math.abs(b); if (pa <= 0 || pb <= 0) continue;
    const pt = o.y1 + BR - st.y;
    let nx = 0, ny = 0, nz = 0, pen;
    if (pt < pa && pt < pb && st.vy <= 0.5) { ny = 1; pen = pt; }
    else if (pa < pb) { const s = Math.sign(a) || 1; nx = o.ux * s; nz = o.uz * s; pen = pa; }
    else { const s = Math.sign(b) || 1; nx = -o.uz * s; nz = o.ux * s; pen = pb; }
    st.x += nx * pen; st.y += ny * pen; st.z += nz * pen;
    const vn = st.vx * nx + st.vy * ny + st.vz * nz;
    if (vn < 0) {
      st.vx -= (1 + o.e) * vn * nx; st.vy -= (1 + o.e) * vn * ny; st.vz -= (1 + o.e) * vn * nz;
      const k = o.kind === 'net' ? 0.12 : o.kind === 'hedge' ? 0.4 : 0.75;      // friction along the face
      if (ny) { st.vx *= k; st.vz *= k; }
      if (!ny) { const vt = 1 - (1 - k) * 0.5; st.vx = st.vx * vt; st.vz = st.vz * vt; }
      st.w *= 0.5;
      if (-vn > 2 && typeof sfx !== 'undefined') { if (o.kind === 'hedge') sfx.leaves(); else if (o.kind !== 'net') sfx.thock(); }
    }
    if (ny && Math.hypot(st.vx, st.vy, st.vz) < 0.4) { st.vx = st.vy = st.vz = 0; hit = 'rest'; }
  }
  return hit;
}
