// SwissGolf – real terrain from swisstopo swissALTI3D (decoded from maps/<Course>/terrain.js)
'use strict';

// Grids are stored north-up: row 0 = northern edge (n1), column 0 = western edge (e0), spacing res metres.
const TERRAIN = { ready: false, e0: 0, n1: 0, res: 1, w: 0, h: 0, height: null, waterSdf: null, waterZ: null };

async function inflateB64(b64) {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Response(stream).arrayBuffer();
}
function undelta(int16, w, h, zmin) { // row-wise delta coded centimetres -> metres
  const out = new Float32Array(w * h);
  for (let r = 0; r < h; r++) { let acc = 0; for (let c = 0; c < w; c++) { const k = r * w + c; acc += int16[k]; out[k] = zmin + acc / 100; } }
  return out;
}
async function loadTerrain(id) {
  const t = window.SWISSGOLF && SWISSGOLF.terrain && SWISSGOLF.terrain[id];
  if (!t || typeof DecompressionStream === 'undefined') { console.warn('no terrain data for', id, '– using synthetic terrain'); return false; }
  const [h, sdf, wz] = await Promise.all([inflateB64(t.heights), inflateB64(t.waterSdf), inflateB64(t.waterZ)]);
  Object.assign(TERRAIN, { e0: t.e0, n1: t.n1, res: t.res, w: t.w, h: t.h });
  TERRAIN.height = undelta(new Int16Array(h), t.w, t.h, t.zmin);
  TERRAIN.waterSdf = new Int8Array(sdf);
  TERRAIN.waterZ = undelta(new Int16Array(wz), t.w, t.h, t.zmin);
  TERRAIN.ready = true;
  return true;
}
// bilinear sample of a grid at LV95 (E, N); scale converts stored units to metres
function terrainSample(arr, E, N, scale = 1) {
  const T = TERRAIN;
  let c = (E - T.e0) / T.res - 0.5, r = (T.n1 - N) / T.res - 0.5;
  c = clamp(c, 0, T.w - 1.001); r = clamp(r, 0, T.h - 1.001);
  const c0 = c | 0, r0 = r | 0, fc = c - c0, fr = r - r0, k = r0 * T.w + c0;
  return scale * ((arr[k] * (1 - fc) + arr[k + 1] * fc) * (1 - fr) + (arr[k + T.w] * (1 - fc) + arr[k + T.w + 1] * fc) * fr);
}
