// SwissGolf – course model: OpenStreetMap golf features + swissALTI3D terrain, in the frame of the current hole
'use strict';

/* =====================================================================
   Frames
   LV95 (E, N) – Swiss grid metres. Course frame: x = metres east, s = metres north of the course centre.
   World (three.js): X = x, Z = -s, Y = height (m, course centre ≈ 0). One world for all holes.
   ===================================================================== */
const COURSE_DEF = SWISSGOLF.courses[SWISSGOLF.current || Object.keys(SWISSGOLF.courses)[0]];
let HOLE_NO = 1;
const HOLE_NOS = Object.keys(COURSE_DEF.holes).map(Number).sort((a, b) => a - b);
const HOLE_COUNT = HOLE_NOS.length;
const HF = { E: 0, N: 0, ue: 0, un: 1, re: 1, rn: 0, z0: 0 };
function holeToLV95(x, s) { return [HF.E + s * HF.ue + x * HF.re, HF.N + s * HF.un + x * HF.rn]; }
function lv95ToHole(E, N) { const dE = E - HF.E, dN = N - HF.N; return [dE * HF.re + dN * HF.rn, dE * HF.ue + dN * HF.un]; }

// current hole, filled in by setHole(): par, teeSpots, green, line (polyline tee -> green), dir ...
const COURSE = { number: HOLE_NO, par: 4, teeSpots: {}, green: null, line: [], lineSamples: [], dir: [0, 1] };

/* ---------- terrain grid extent: the golf course boundary (OSM) plus a margin ---------- */
const COURSE_AREA = (() => {
  const o = SWISSGOLF.osm[COURSE_DEF.osm]; let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  for (const [t, enc] of o.features) if (t.l === 'golf_course') for (const L of enc) {
    let x = 0, y = 0; for (let i = 0; i < L.length; i += 2) { x += L[i]; y += L[i + 1]; const E = o.origin[0] + x * o.scale, N = o.origin[1] + y * o.scale; a = Math.min(a, E); c = Math.max(c, E); b = Math.min(b, N); d = Math.max(d, N); }
  }
  const E = Math.round((a + c) / 20) * 10, N = Math.round((b + d) / 20) * 10, hw = Math.ceil((c - a) / 2 + 60), hh = Math.ceil((d - b) / 2 + 60);
  return { E, N, hw, hh };
})();
HF.E = COURSE_AREA.E; HF.N = COURSE_AREA.N;
const X0 = -COURSE_AREA.hw, X1 = COURSE_AREA.hw, S0 = -COURSE_AREA.hh, S1 = COURSE_AREA.hh, STEP = 1;
const NX = Math.round((X1 - X0) / STEP) + 1, NS = Math.round((S1 - S0) / STEP) + 1;
const HGRID = new Float32Array(NX * NS);

/* =====================================================================
   Geometry helpers (polygons / polylines in the hole frame)
   ===================================================================== */
function bbox(pts, m = 0) { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const [x, s] of pts) { if (x < a) a = x; if (s < b) b = s; if (x > c) c = x; if (s > d) d = s; } return [a - m, b - m, c + m, d + m]; }
function inBox(x, s, bb, m = 0) { return x >= bb[0] - m && x <= bb[2] + m && s >= bb[1] - m && s <= bb[3] + m; }
function pointInPoly(x, s, P) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const xi = P[i][0], si = P[i][1], xj = P[j][0], sj = P[j][1];
    if ((si > s) !== (sj > s) && x < (xj - xi) * (s - si) / (sj - si) + xi) c = !c;
  }
  return c;
}
function segD(x, s, ax, as, bx, bs) { const dx = bx - ax, ds = bs - as, l = dx * dx + ds * ds; const t = l ? clamp(((x - ax) * dx + (s - as) * ds) / l, 0, 1) : 0; return Math.hypot(x - ax - t * dx, s - as - t * ds); }
function lineDist(x, s, P) { let b = 1e9; for (let i = 0; i < P.length - 1; i++) { const d = segD(x, s, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1]); if (d < b) b = d; } return b; }
function polyDist(x, s, P) { const d = lineDist(x, s, P); return pointInPoly(x, s, P) ? -d : d; }   // signed, negative inside
function centroid(P) { let a = 0, cx = 0, cs = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const f = P[j][0] * P[i][1] - P[i][0] * P[j][1]; a += f; cx += (P[j][0] + P[i][0]) * f; cs += (P[j][1] + P[i][1]) * f; } a *= 0.5; return Math.abs(a) < 1e-6 ? P[0] : [cx / (6 * a), cs / (6 * a)]; }
function polyArea(P) { let a = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) a += P[j][0] * P[i][1] - P[i][0] * P[j][1]; return Math.abs(a / 2); }
function minDistOver(list, x, s, margin) { let b = 99; for (const f of list) { if (!inBox(x, s, f.bb, margin)) continue; const d = polyDist(x, s, f.pts); if (d < b) b = d; } return b; }

/* =====================================================================
   OpenStreetMap features
   ===================================================================== */
const FEAT = { course: [], greens: [], tees: [], fairways: [], bunkers: [], paths: [], roads: [], parking: [], buildings: [], forests: [], range: [], holeLines: [], water: [], rails: [] };
const PATH_W = { footway: 1.8, path: 1.8, cycleway: 2.2, track: 2.8, service: 4.0, residential: 4.5, unclassified: 5, tertiary: 6, secondary: 7, primary: 8 };

function decodeOSM() {
  const o = SWISSGOLF.osm && SWISSGOLF.osm[COURSE_DEF.osm];
  const out = [];
  if (!o) return out;
  for (const [t, enc] of o.features) {
    const lines = enc.map(L => { const pts = []; let x = 0, y = 0; for (let i = 0; i < L.length; i += 2) { x += L[i]; y += L[i + 1]; pts.push([o.origin[0] + x * o.scale, o.origin[1] + y * o.scale]); } return pts; });
    out.push({ t, lines });
  }
  return out;
}

function loadFeatures(raw) {
  for (const k in FEAT) FEAT[k].length = 0;
  for (const { t, lines } of raw) for (const L of lines) {
    const pts = L.map(([E, N]) => lv95ToHole(E, N));
    if (pts.length < 2) continue;
    if (t.g === 'hole') { FEAT.holeLines.push(pts); continue; }
    const f = { t, pts, bb: bbox(pts) };
    if (t.rw) { FEAT.rails.push(f); continue; }                     // railway (track centre line)
    if (t.l === 'golf_course') FEAT.course.push(f);
    else if (t.g === 'green') FEAT.greens.push(f);
    else if (t.g === 'tee') FEAT.tees.push(f);
    else if (t.g === 'fairway') FEAT.fairways.push(f);
    else if (t.g === 'bunker') FEAT.bunkers.push(f);
    else if (t.g === 'driving_range') FEAT.range.push(f);
    else if (t.n === 'water' && pts.length > 3) FEAT.water.push(f);   // ponds mapped in OpenStreetMap (added to the terrain's water below)
    else if (t.b) { f.area = polyArea(pts); FEAT.buildings.push(f); }
    else if (t.a === 'parking') FEAT.parking.push(f);
    else if (t.lu === 'forest' || t.n === 'scrub' || t.n === 'wood') FEAT.forests.push(f);
    else if (t.hw) {
      f.w = PATH_W[t.hw] || 2; f.bb = bbox(pts, f.w);
      (['primary', 'secondary', 'tertiary', 'unclassified', 'service', 'residential'].includes(t.hw) ? FEAT.roads : FEAT.paths).push(f);
    }
  }
}

/* =====================================================================
   Surfaces
   ===================================================================== */
const S_ROUGH = 0, S_SEMI = 1, S_FAIR = 2, S_FRINGE = 3, S_GREEN = 4, S_TEE = 5, S_BUNKER = 6, S_WATER = 7, S_PATH = 8, S_DEEP = 9,
  S_ROAD = 10, S_BUILDING = 11, S_FOREST = 12, S_RANGE = 13;
const SURF = [
  { name: 'Rough', e: 0.18, f: 0.45, roll: 3.6, grab: 0.15, spd: 0.86, spin: 0.55, disp: 1.6 },
  { name: 'Semi-rough', e: 0.24, f: 0.35, roll: 2.2, grab: 0.25, spd: 0.95, spin: 0.8, disp: 1.2 },
  { name: 'Fairway', e: 0.32, f: 0.25, roll: 1.3, grab: 0.35, spd: 1, spin: 1, disp: 1 },
  { name: 'Fringe', e: 0.28, f: 0.3, roll: 0.95, grab: 0.45, spd: 1, spin: 1, disp: 1 },
  { name: 'Green', e: 0.24, f: 0.3, roll: 0.55, grab: 0.6, spd: 1, spin: 1, disp: 1 },
  { name: 'Tee', e: 0.32, f: 0.25, roll: 1.3, grab: 0.35, spd: 1, spin: 1, disp: 1 },
  { name: 'Bunker', e: 0.04, f: 0.85, roll: 9, grab: 0, spd: 0.72, spin: 0.5, disp: 1.8 },
  { name: 'Water', e: 0, f: 1, roll: 50, grab: 0, spd: 0, spin: 0, disp: 1 },
  { name: 'Cart path', e: 0.55, f: 0.12, roll: 0.9, grab: 0.1, spd: 1, spin: 0.9, disp: 1.1 },
  { name: 'Deep rough', e: 0.12, f: 0.6, roll: 6, grab: 0.1, spd: 0.72, spin: 0.4, disp: 2.2 },
  { name: 'Road', e: 0.6, f: 0.1, roll: 0.8, grab: 0.1, spd: 1, spin: 0.9, disp: 1.1 },
  { name: 'Building', e: 0.3, f: 0.3, roll: 2, grab: 0, spd: 0.5, spin: 0.5, disp: 2 },
  { name: 'Woods', e: 0.1, f: 0.7, roll: 7, grab: 0.1, spd: 0.65, spin: 0.4, disp: 2.4 },
  { name: 'Driving range', e: 0.3, f: 0.3, roll: 1.6, grab: 0.3, spd: 1, spin: 1, disp: 1 },
];

// Surface raster (0.3 m) built by scan-converting the OSM polygons; physics and the ground texture both use it.
const RES = 0.3;
const TW = Math.round((X1 - X0) / RES), TH = Math.round((S1 - S0) / RES);
const CLS = new Uint8Array(TW * TH);       // surface class per cell
const INCOURSE = new Uint8Array(TW * TH);  // 1 inside the golf course boundary
const PAVED = new Uint8Array(TW * TH);     // 1 for parking areas (paths and roads are drawn as ribbons)

function fillPoly(P, fn) {
  const bb = bbox(P);
  const r0 = Math.max(0, Math.floor((S1 - bb[3]) / RES)), r1 = Math.min(TH - 1, Math.ceil((S1 - bb[1]) / RES));
  const xs = [];
  for (let r = r0; r <= r1; r++) {
    const s = S1 - (r + 0.5) * RES; xs.length = 0;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const si = P[i][1], sj = P[j][1];
      if ((si > s) !== (sj > s)) xs.push(P[i][0] + (s - si) / (sj - si) * (P[j][0] - P[i][0]));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] - X0) / RES - 0.5)), c1 = Math.min(TW - 1, Math.floor((xs[k + 1] - X0) / RES - 0.5));
      for (let c = c0; c <= c1; c++) fn(r * TW + c);
    }
  }
}
function strokeLine(P, w, closed, fn) {
  const n = closed ? P.length : P.length - 1;
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const c0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - w - X0) / RES)), c1 = Math.min(TW - 1, Math.ceil((Math.max(a[0], b[0]) + w - X0) / RES));
    const r0 = Math.max(0, Math.floor((S1 - Math.max(a[1], b[1]) - w) / RES)), r1 = Math.min(TH - 1, Math.ceil((S1 - Math.min(a[1], b[1]) + w) / RES));
    for (let r = r0; r <= r1; r++) { const s = S1 - (r + 0.5) * RES; for (let c = c0; c <= c1; c++) { const x = X0 + (c + 0.5) * RES; if (segD(x, s, a[0], a[1], b[0], b[1]) <= w) fn(r * TW + c); } }
  }
}
// The club house model's terrace is larger than the OSM building: a green that would run into it is moved away
// (south, away from the building) until there is a 3.5 m walkway between the paving and the green.
// The club house model's terrace is larger than the OSM building. A practice green that runs into it (or across a
// path) is trimmed to the part between the terrace (3.5 m walkway) and the paths; a hole's green is moved away instead.
function clubhouseClearance() {
  if (typeof clubhouseFrame !== 'function' || !(CLUB_PAD = CLUB_PAD || clubhouseFrame())) return;
  const C = CLUB_PAD, GAP = 3.5, PATH_GAP = 1.2, ST = 0.5;
  const isHoleGreen = g => FEAT.holeLines.some(L => { const e = L[L.length - 1]; return polyDist(e[0], e[1], g.pts) < 12; });
  for (const g of FEAT.greens) {
    if (!C.covers((g.bb[0] + g.bb[2]) / 2, (g.bb[1] + g.bb[3]) / 2, 40)) continue;
    let bad = false;
    for (let x = g.bb[0]; x <= g.bb[2] && !bad; x += ST) for (let s = g.bb[1]; s <= g.bb[3]; s += ST)
      if (polyDist(x, s, g.pts) < 0.3 && (C.boxDist(x, s) < GAP || pathDist(x, s) < PATH_GAP)) { bad = true; break; }
    if (!bad) continue;
    if (!isHoleGreen(g) && trimGreen(g, (x, s) => C.boxDist(x, s) >= GAP && pathDist(x, s) >= PATH_GAP, (x, s) => C.boxDist(x, s))) continue;
    let moved = 0;
    const minD = () => { let d = 1e9;
      for (let x = g.bb[0]; x <= g.bb[2]; x += ST) for (let s = g.bb[1]; s <= g.bb[3]; s += ST) if (polyDist(x, s, g.pts) < 0.3) d = Math.min(d, C.boxDist(x, s));
      return d; };
    for (let k = 0; k < 60 && minD() < GAP; k++) { for (const p of g.pts) { p[0] -= C.nx * 0.5; p[1] -= C.ns * 0.5; } g.bb = bbox(g.pts); moved += 0.5; }
    if (moved) console.log('green moved ' + moved + ' m away from the club house terrace');
  }
}
// keep only the connected part of a green where ok(x, s) holds, starting next to the club house (smallest rank),
// and redraw its outline as a smooth star-shaped polygon around that part
function trimGreen(g, ok, rank) {
  const ST = 0.5, x0 = g.bb[0], s0 = g.bb[1], nx = Math.ceil((g.bb[2] - x0) / ST) + 1, ns = Math.ceil((g.bb[3] - s0) / ST) + 1;
  const A = new Uint8Array(nx * ns);
  let seed = -1, best = 1e9;
  for (let j = 0; j < ns; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * ST, s = s0 + j * ST;
    if (polyDist(x, s, g.pts) < -0.2 && ok(x, s)) { A[i + j * nx] = 1; const r = rank(x, s); if (r < best) { best = r; seed = i + j * nx; } }
  }
  if (seed < 0) return false;
  const R = new Uint8Array(nx * ns), q = [seed]; R[seed] = 1;
  let n = 0, cx = 0, cs = 0;
  while (q.length) { const k = q.pop(), i = k % nx, j = (k / nx) | 0; n++; cx += x0 + i * ST; cs += s0 + j * ST;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj, kk = a + b * nx; if (a >= 0 && b >= 0 && a < nx && b < ns && A[kk] && !R[kk]) { R[kk] = 1; q.push(kk); } } }
  if (n * ST * ST < 40) return false;
  cx /= n; cs /= n;
  const inR = (x, s) => { const i = Math.round((x - x0) / ST), j = Math.round((s - s0) / ST); return i >= 0 && j >= 0 && i < nx && j < ns && R[i + j * nx]; };
  if (!inR(cx, cs)) return false;
  const N = 72, rad = [];
  for (let k = 0; k < N; k++) { const a = k / N * Math.PI * 2; let r = 0; while (r < 60 && inR(cx + Math.cos(a) * (r + 0.25), cs + Math.sin(a) * (r + 0.25))) r += 0.25; rad.push(r); }
  const sm = rad.map((r, k) => Math.min(r, 0.5 * r + 0.25 * (rad[(k + 1) % N] + rad[(k + N - 1) % N])) - 0.3);
  g.pts = sm.map((r, k) => { const a = k / N * Math.PI * 2; return [cx + Math.cos(a) * Math.max(0.5, r), cs + Math.sin(a) * Math.max(0.5, r)]; });
  g.pts.push([...g.pts[0]]); g.bb = bbox(g.pts);
  console.log('green trimmed to ' + Math.round(n * ST * ST) + ' m² between the terrace and the paths');
  return true;
}
function rasterize() {
  CLS.fill(S_DEEP); INCOURSE.fill(0);
  const set = v => i => { CLS[i] = v; };
  for (const f of FEAT.course) fillPoly(f.pts, i => { CLS[i] = S_ROUGH; INCOURSE[i] = 1; });
  for (const f of FEAT.forests) fillPoly(f.pts, set(S_FOREST));
  for (const f of FEAT.range) fillPoly(f.pts, set(S_RANGE));
  const soft = i => CLS[i] === S_ROUGH || CLS[i] === S_DEEP || CLS[i] === S_FOREST;
  for (const f of FEAT.fairways) strokeLine(f.pts, 2.5, true, i => { if (soft(i)) CLS[i] = S_SEMI; });
  for (const f of FEAT.fairways) fillPoly(f.pts, set(S_FAIR));
  for (const f of FEAT.tees) fillPoly(f.pts, set(S_TEE));
  for (const f of FEAT.greens) strokeLine(f.pts, 1.3, true, i => { if (CLS[i] !== S_GREEN) CLS[i] = S_FRINGE; });
  for (const f of FEAT.greens) fillPoly(f.pts, set(S_GREEN));
  for (const f of FEAT.bunkers) fillPoly(f.pts, set(S_BUNKER));
  for (const f of FEAT.parking) fillPoly(f.pts, i => { CLS[i] = S_ROAD; PAVED[i] = 1; });
  for (const f of FEAT.roads) strokeLine(f.pts, f.w / 2, false, set(S_ROAD));
  for (const f of FEAT.paths) strokeLine(f.pts, f.w / 2, false, i => { if (CLS[i] !== S_ROAD) CLS[i] = S_PATH; });
  for (const f of FEAT.buildings) if (!(f.t.ly === '1' && f.t.b === 'roof')) fillPoly(f.pts, set(S_BUILDING));
  // club house model (Unterengstringen): its terraces and paving are hard ground, and the car park asphalt runs up to
  // the paved apron along the north side (no strip of grass between the two)
  if (typeof clubhouseFrame === 'function' && (CLUB_PAD = CLUB_PAD || clubhouseFrame())) {
    const C = CLUB_PAD, xs = [], ss = [];
    for (const [a, b] of [[-26, -10], [120, -10], [-26, 40], [120, 40]]) { xs.push(C.ox + a * C.ux + b * C.nx); ss.push(C.os + a * C.us + b * C.ns); }
    const c0 = Math.max(0, Math.floor((Math.min(...xs) - X0) / RES)), c1 = Math.min(TW - 1, Math.ceil((Math.max(...xs) - X0) / RES));
    const r0 = Math.max(0, Math.floor((S1 - Math.max(...ss)) / RES)), r1 = Math.min(TH - 1, Math.ceil((S1 - Math.min(...ss)) / RES));
    const fill = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const x = X0 + (c + 0.5) * RES, sv = S1 - (r + 0.5) * RES, i = r * TW + c;
      if (C.inModel(x, sv)) { if (CLS[i] !== S_BUILDING && C.local(x, sv)[0] > -10) { CLS[i] = S_ROAD; PAVED[i] = 1; } continue; }   // the road sign stands on grass
      const [a, b] = C.local(x, sv);
      if (a < -3 || a > 91 || b < 27.5 || b > 36) continue;
      for (let k = 0.5; k <= 8; k += 0.5) { const j = cell(x + C.nx * k, sv + C.ns * k); if (j >= 0 && PAVED[j]) { fill.push(i); break; } }
    }
    for (const i of fill) { CLS[i] = S_ROAD; PAVED[i] = 1; }
  }
  if (typeof rangeRaster === 'function') rangeRaster();
  // a railway through the course is out of bounds (fenced corridor about 3 m either side of the track)
  for (const f of FEAT.rails) strokeLine(f.pts, RAIL_OB, false, i => { CLS[i] = S_ROAD; PAVED[i] = 0; INCOURSE[i] = 0; });
}
const RAIL_OB = 3.0;
function cell(x, s) {
  const c = Math.floor((x - X0) / RES), r = Math.floor((S1 - s) / RES);
  return (c < 0 || r < 0 || c >= TW || r >= TH) ? -1 : r * TW + c;
}
function surfaceAt(x, s) {
  const k = cell(x, s);
  if (k < 0) return S_DEEP;
  if (waterDist(x, s) < 0) return S_WATER;
  return CLS[k];
}
function inCourse(x, s) { const k = cell(x, s); return k >= 0 && INCOURSE[k] === 1; }
function isOB(x, s) {
  const k = cell(x, s); if (k < 0) return true;
  return INCOURSE[k] === 0 || CLS[k] === S_RANGE || CLS[k] === S_BUILDING;
}

// distances to features (m; negative inside)
const greenDist = (x, s) => minDistOver(FEAT.greens, x, s, 12);
const teeDist = (x, s) => minDistOver(FEAT.tees, x, s, 6);
const bunkerDist = (x, s) => minDistOver(FEAT.bunkers, x, s, 6);
const fairwayDist = (x, s) => minDistOver(FEAT.fairways, x, s, 40);
function pathDist(x, s) { let b = 99; for (const f of FEAT.paths) { if (!inBox(x, s, f.bb, 4)) continue; const d = lineDist(x, s, f.pts) - f.w / 2; if (d < b) b = d; } return b; }
function buildingAt(x, s) { const k = cell(x, s); return k >= 0 && CLS[k] === S_BUILDING; }

/* =====================================================================
   Water (from the terrain: swissALTI3D is hydro-flattened)
   ===================================================================== */
// The terrain finds most ponds by themselves (hydro-flattened DEM). Ponds it misses – e.g. narrow ones under
// trees – come from OpenStreetMap (natural=water): their outline is merged in, the surface sits at the pond's
// own ground level (low percentile of the DEM inside the outline).
function waterDistTerrain(x, s) {
  if (!TERRAIN.ready) return 99;
  const E = HF.E + s * HF.ue + x * HF.re, N = HF.N + s * HF.un + x * HF.rn;
  return terrainSample(TERRAIN.waterSdf, E, N, 0.2);
}
function waterDist(x, s) {
  let d = waterDistTerrain(x, s);
  for (const w of FEAT.water) { if (!inBox(x, s, w.bb, 8)) continue; const dp = polyDist(x, s, w.pts); if (dp < d) d = dp; }
  return d;
}
function waterLevel(x, s) {
  if (!TERRAIN.ready) return -5;
  for (const w of FEAT.water) { if (w.level === undefined || !inBox(x, s, w.bb, 8)) continue; if (polyDist(x, s, w.pts) < 8) return w.level; }
  const E = HF.E + s * HF.ue + x * HF.re, N = HF.N + s * HF.un + x * HF.rn;
  return terrainSample(TERRAIN.waterZ, E, N) - HF.z0;
}
function levelWater() {
  for (const w of FEAT.water) {
    const hs = [];
    for (let x = Math.ceil(w.bb[0]); x <= w.bb[2]; x += 1) for (let s = Math.ceil(w.bb[1]); s <= w.bb[3]; s += 1) if (pointInPoly(x, s, w.pts)) hs.push(realHeight(x, s));
    if (!hs.length) { w.level = undefined; continue; }
    hs.sort((a, b) => a - b);
    w.level = hs[Math.floor(hs.length * 0.2)] + 0.02;
  }
}

/* =====================================================================
   Heights
   ===================================================================== */
function realHeight(x, s) {
  if (!TERRAIN.ready) return 0.3 * Math.sin(x * 0.02) * Math.cos(s * 0.015);
  const E = HF.E + s * HF.ue + x * HF.re, N = HF.N + s * HF.un + x * HF.rn;
  return terrainSample(TERRAIN.height, E, N) - HF.z0;
}
function baseHeight(x, s) {
  // beyond the playing area the ground rises gently to hide the edge of the world
  const ox = Math.max(0, X0 + 35 - x, x - (X1 - 35)), os = Math.max(0, S0 + 35 - s, s - (S1 - 35));
  const o = Math.hypot(ox, os);
  return realHeight(x, s) + o * o * 0.004 + o * 0.12 * fbm(x * 0.03, s * 0.03, 2);
}
function smoothHeight(x, s, r = 1.0) {
  let sum = 0; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) sum += baseHeight(x + i * r, s + j * r) * (i === 0 && j === 0 ? 4 : i === 0 || j === 0 ? 2 : 1);
  return sum / 16;
}
// Each green gets a smooth quadratic surface fitted to the lidar: true tilt and shape, no measurement noise.
function fitGreen(f) {
  const [cx, cs] = centroid(f.pts); f.cx = cx; f.cs = cs;
  const A = Array.from({ length: 6 }, () => new Float64Array(7));
  for (let x = f.bb[0]; x <= f.bb[2]; x += 0.5) for (let s = f.bb[1]; s <= f.bb[3]; s += 0.5) {
    if (polyDist(x, s, f.pts) > 0.5) continue;
    const dx = x - cx, ds = s - cs, v = [1, dx, ds, dx * dx, dx * ds, ds * ds], h = smoothHeight(x, s);
    for (let i = 0; i < 6; i++) { for (let j = 0; j < 6; j++) A[i][j] += v[i] * v[j]; A[i][6] += v[i] * h; }
  }
  for (let i = 0; i < 6; i++) {
    let p = i; for (let r = i + 1; r < 6; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    if (Math.abs(A[i][i]) < 1e-9) continue;
    for (let r = 0; r < 6; r++) if (r !== i) { const k = A[r][i] / A[i][i]; for (let c = i; c < 7; c++) A[r][c] -= k * A[i][c]; }
  }
  const c = Array.from(A, (row, i) => Math.abs(row[i]) > 1e-9 ? row[6] / row[i] : 0);
  const maxSlope = 0.035, tilt = Math.hypot(c[1], c[2]);   // puttable: overall tilt ≤ 3.5 %, gentle curvature
  if (tilt > maxSlope) { c[1] *= maxSlope / tilt; c[2] *= maxSlope / tilt; }
  for (const k of [3, 4, 5]) c[k] = clamp(c[k], -0.0012, 0.0012);
  f.fit = c;
}
function greenSurface(f, x, s) { const c = f.fit, dx = x - f.cx, ds = s - f.cs; return c[0] + c[1] * dx + c[2] * ds + c[3] * dx * dx + c[4] * dx * ds + c[5] * ds * ds; }
function levelTee(f) {
  let sum = 0, n = 0;
  for (let x = f.bb[0]; x <= f.bb[2]; x += 1) for (let s = f.bb[1]; s <= f.bb[3]; s += 1) if (pointInPoly(x, s, f.pts)) { sum += baseHeight(x, s); n++; }
  const [cx, cs] = centroid(f.pts);
  f.h = (n ? sum / n : baseHeight(cx, cs)) + 0.3;      // tee boxes are built up ~30 cm
}
function heightRaw(x, s, withWater = true) {
  let h = baseHeight(x, s);
  for (const t of FEAT.tees) { if (!inBox(x, s, t.bb, 1.6)) continue; const d = polyDist(x, s, t.pts); if (d < 1.6) h = lerp(h, t.h, 1 - smoothstep(0.05, 1.6, d)); }
  for (const g of FEAT.greens) { if (!inBox(x, s, g.bb, 6) || !g.fit) continue; const d = polyDist(x, s, g.pts); if (d < 6) h = lerp(h, greenSurface(g, x, s), 1 - smoothstep(1.3, 6, d)); }
  for (const b of FEAT.bunkers) { if (!inBox(x, s, b.bb, 1.5)) continue; const d = polyDist(x, s, b.pts); if (d < 1.5) h -= 0.35 * smoothstep(1.5, -1.5, d); }
  if (typeof clubPad === 'function') h = clubPad(x, s, h);       // graded pad under the club house model (wins over nearby greens)
  if (typeof rangePad === 'function') h = rangePad(x, s, h);     // driving range tee line and bays
  if (withWater && TERRAIN.ready) {
    const wd = waterDist(x, s);
    if (wd < 1.5) { const wl = waterLevel(x, s); h = Math.min(h, wl + 0.08 + Math.max(0, wd) * 0.3) - 1.4 * smoothstep(0.5, -3, wd); }
  }
  return h;
}

/* =====================================================================
   Hole set-up
   ===================================================================== */
function polylineLength(P) { let L = 0; for (let i = 0; i < P.length - 1; i++) L += Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); return L; }
function pointAlong(P, d) {
  for (let i = 0; i < P.length - 1; i++) {
    const l = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
    if (d <= l || i === P.length - 2) { const t = l ? clamp(d / l, 0, 1) : 0; return [lerp(P[i][0], P[i + 1][0], t), lerp(P[i][1], P[i + 1][1], t)]; }
    d -= l;
  }
  return P[P.length - 1];
}
const TEE_COLORS = { white: '#f5f5f5', yellow: '#fdd835', blue: '#1565c0', red: '#e53935' };

let OSM_RAW = null;
// Build the course model once: project every OSM feature into the course frame, rasterise, level tees, fit greens.
function initCourse() {
  const raw = OSM_RAW || (OSM_RAW = decodeOSM());
  if (TERRAIN.ready) HF.z0 = terrainSample(TERRAIN.height, HF.E, HF.N);
  loadFeatures(raw);
  clubhouseClearance();
  levelWater();
  rasterize();
  for (const t of FEAT.tees) levelTee(t);
  for (const g of FEAT.greens) fitGreen(g);
  COURSE.holes = {};
  for (const no of HOLE_NOS) COURSE.holes[no] = holeInfo(no);
}
// Hole geometry from the OSM `golf=hole` line: green at its end, tee spots along it by scorecard length.
function holeInfo(no) {
  const raw = OSM_RAW.find(f => f.t.g === 'hole' && String(f.t.r) === String(no));
  const meta = COURSE_DEF.holes[no] || { par: 4, tees: { white: 0 } };
  if (!raw) throw new Error('hole ' + no + ' not found in the OpenStreetMap data');
  const line = raw.lines[0].map(([E, N]) => lv95ToHole(E, N));
  const end = line[line.length - 1];
  let green = FEAT.greens[0], best = 1e9;
  for (const g of FEAT.greens) { const d = polyDist(end[0], end[1], g.pts); if (d < best) { best = d; green = g; } }
  const lineLen = polylineLength(line), samples = [];
  for (let d = 0; d <= lineLen; d += 1) samples.push(pointAlong(line, d));
  const lens = meta.tees, maxLen = Math.max(...Object.values(lens)), teeSpots = {};
  for (const [col, len] of Object.entries(lens)) {
    let [x, s] = pointAlong(line, maxLen - len);
    let tb = null, bd = 1e9; for (const t of FEAT.tees) { const d = polyDist(x, s, t.pts); if (d < bd) { bd = d; tb = t; } }
    if (tb && bd > -0.8 && bd < 30) { const [cx, cs] = centroid(tb.pts); for (let k = 0; k < 80 && polyDist(x, s, tb.pts) > -0.8; k++) { x = lerp(x, cx, 0.1); s = lerp(s, cs, 0.1); } }
    teeSpots[col] = { x, s, len, col: TEE_COLORS[col] || '#fff', box: tb };
  }
  const t0 = line[0], dl = Math.hypot(green.cx - t0[0], green.cs - t0[1]);
  return { number: no, par: meta.par, line, lineLen, lineSamples: samples, green, teeSpots, dir: [(green.cx - t0[0]) / dl, (green.cs - t0[1]) / dl] };
}
function setHole(no) {
  HOLE_NO = no;
  const h = COURSE.holes[no];
  Object.assign(COURSE, h);
  COURSE.green.x = COURSE.green.cx; COURSE.green.s = COURSE.green.cs;
}
function nextHoleOf(no) { const i = HOLE_NOS.indexOf(no); return i >= 0 && i < HOLE_NOS.length - 1 ? HOLE_NOS[i + 1] : 0; }

// a point on the hole line `dist` metres from (x, s), further along the hole (for the default aim)
function aimAlongHole(x, s, dist) {
  const P = COURSE.lineSamples; if (!P.length) return [COURSE.green.x, COURSE.green.s];
  let k = 0, b = 1e9; for (let i = 0; i < P.length; i++) { const d = Math.hypot(P[i][0] - x, P[i][1] - s); if (d < b) { b = d; k = i; } }
  for (let i = k; i < P.length; i++) if (Math.hypot(P[i][0] - x, P[i][1] - s) >= dist) return P[i];
  return [COURSE.green.x, COURSE.green.s];
}

/* ---------- height grid lookup (the physics uses exactly the rendered triangles) ---------- */
function heightAt(x, s) {
  let fx = clamp((x - X0) / STEP, 0, NX - 1.0001), fy = clamp((s - S0) / STEP, 0, NS - 1.0001);
  const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = i + j * NX;
  const h00 = HGRID[k], h10 = HGRID[k + 1], h01 = HGRID[k + NX], h11 = HGRID[k + NX + 1];
  return (u + v <= 1) ? h00 + (h10 - h00) * u + (h01 - h00) * v : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}
const Hw = (x, z) => heightAt(x, -z);              // world-space height
const Sw = (x, z) => surfaceAt(x, -z);             // world-space surface
