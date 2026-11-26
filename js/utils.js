// SwissGolf – Math helpers, noise, random numbers
'use strict';

/* =====================================================================
   Utilities
   ===================================================================== */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
function hash2(i, j) { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vnoise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x, y, o = 4) { let s = 0, a = 0.5, f = 1, n = 0; for (let k = 0; k < o; k++) { s += a * vnoise(x * f + k * 17.3, y * f - k * 9.1); n += a; a *= 0.5; f *= 2.03; } return s / n; }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rand = mulberry32(20200526);
function gauss() { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); }
function tableInterp(tab, s, col) { // Catmull-Rom through rows [s, ...]
  const n = tab.length;
  if (s <= tab[0][0]) return tab[0][col];
  if (s >= tab[n - 1][0]) return tab[n - 1][col];
  let i = 0; while (s > tab[i + 1][0]) i++;
  const p0 = tab[Math.max(i - 1, 0)][col], p1 = tab[i][col], p2 = tab[i + 1][col], p3 = tab[Math.min(i + 2, n - 1)][col];
  const t = (s - tab[i][0]) / (tab[i + 1][0] - tab[i][0]), t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
// signed distance to a chain of capsules with per-point radius; pts = [[x,s,r],...]
function chainDist(x, s, pts) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1];
    const t = clamp(((x - a[0]) * dx + (s - a[1]) * dy) / (dx * dx + dy * dy), 0, 1);
    const d = Math.hypot(x - a[0] - t * dx, s - a[1] - t * dy) - lerp(a[2], b[2], t);
    if (d < best) best = d;
  }
  return best;
}
// wobbly ellipse signed distance (approx.)
function blobDist(x, s, b) {
  const dx = x - b.x, ds = s - b.s, c = Math.cos(b.rot), sn = Math.sin(b.rot);
  const u = dx * c - ds * sn, v = dx * sn + ds * c;
  const ang = Math.atan2(v / b.rs, u / b.rx);
  const k = 1 + (b.w1 ?? 0.08) * Math.sin(2 * ang + (b.p1 ?? 0.6)) + (b.w2 ?? 0.06) * Math.sin(3 * ang + (b.p2 ?? 2.1));
  const e = Math.hypot(u / b.rx, v / b.rs);
  return (e / k - 1) * Math.min(b.rx, b.rs);
}
