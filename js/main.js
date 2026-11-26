// SwissGolf – Rendering, golfer, HUD, input and game loop (needs lib/three.min.js)
'use strict';


/* =====================================================================
   Renderer / scene
   ===================================================================== */
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const LOWQ = /lq/.test(location.search) || (() => { try { return localStorage.getItem('swissgolf.shadows') === '0'; } catch (e) { return false; } })();
renderer.setPixelRatio(LOWQ ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.62;
renderer.shadowMap.enabled = !LOWQ;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xb9cfe0, 260, 2600);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 16000);

// sun (the sky, clouds and weather live in sky.js)
const SUN_EL = 38, SUN_AZ = 235;
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - SUN_EL), THREE.MathUtils.degToRad(SUN_AZ));
const sunLight = new THREE.DirectionalLight(0xfff1dc, 2.6);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
const SH = 45;
Object.assign(sunLight.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 400 });
sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.03;
scene.add(sunLight, sunLight.target);
const hemiLight = new THREE.HemisphereLight(0xcfe6ff, 0x4a6a2a, 0.55); scene.add(hemiLight);
const world = new THREE.Group(); scene.add(world); // all course meshes

/* =====================================================================
   Course textures
   ===================================================================== */
const texCanvas = document.createElement('canvas'); texCanvas.width = TW; texCanvas.height = TH;

const C = {
  rough: [72, 108, 38], deep: [80, 110, 44], semi: [86, 128, 44], fair1: [108, 158, 54], fair2: [96, 145, 48],
  fringe: [92, 150, 52], green1: [104, 170, 62], green2: [94, 160, 56], collar: [62, 104, 36], tee1: [124, 180, 66], tee2: [110, 166, 58], teeEdge: [64, 98, 36],
  sand: [228, 214, 176], bed: [58, 70, 52], mud: [96, 92, 58], path: [150, 138, 112], road: [96, 98, 102],
  building: [120, 116, 108], forest: [50, 74, 30], range1: [104, 152, 54], range2: [96, 142, 50]
};
// alpha channel = how long the grass is (drives the detail texture contrast in the terrain shader)
const GRASS_LEN = { [S_GREEN]: 0.5, [S_FRINGE]: 0.6, [S_TEE]: 0.6, [S_FAIR]: 0.65, [S_RANGE]: 0.65, [S_SEMI]: 0.8, [S_ROUGH]: 0.92, [S_DEEP]: 1, [S_FOREST]: 1,
  [S_BUNKER]: 0.5, [S_PATH]: 0.9, [S_ROAD]: 0.9, [S_BUILDING]: 0.5 };
const SOFT_EDGE = new Set([S_ROUGH, S_DEEP, S_SEMI, S_FOREST, S_RANGE, S_FAIR, S_GREEN, S_FRINGE, S_TEE, S_BUNKER, S_PATH, S_ROAD]);
// Signed distance fields (m, negative inside) to greens / fairways / tees / bunkers, stored 0.3 m apart in an RGBA
// texture. Bilinear filtering of a distance field gives smooth, sharp boundaries – no raster staircase.
const SDF_RANGE = 3.0;
function buildSurfaceSDF() {
  const out = new Uint8Array(TW * TH * 4);
  const lists = [FEAT.greens, FEAT.fairways, FEAT.tees, FEAT.bunkers];
  const mask = new Uint8Array(TW * TH), band = new Uint8Array(TW * TH), tmp = new Uint8Array(TW * TH);
  const R = Math.ceil(SDF_RANGE / RES) + 1;
  lists.forEach((list, ch) => {
    mask.fill(0); for (const f of list) fillPoly(f.pts, i => { mask[i] = 1; });
    // band = cells within R cells of a boundary (boundary cells dilated with two 1-D passes)
    band.fill(0);
    for (let r = 1; r < TH - 1; r++) for (let c = 1; c < TW - 1; c++) { const k = r * TW + c, m = mask[k]; if (mask[k + 1] !== m || mask[k - 1] !== m || mask[k + TW] !== m || mask[k - TW] !== m) band[k] = 1; }
    tmp.fill(0);
    for (let r = 0; r < TH; r++) { let last = -1e9; for (let c = 0; c < TW; c++) { if (band[r * TW + c]) last = c; if (c - last <= R) tmp[r * TW + c] = 1; } last = 1e9; for (let c = TW - 1; c >= 0; c--) { if (band[r * TW + c]) last = c; if (last - c <= R) tmp[r * TW + c] = 1; } }
    band.fill(0);
    for (let c = 0; c < TW; c++) { let last = -1e9; for (let r = 0; r < TH; r++) { if (tmp[r * TW + c]) last = r; if (r - last <= R) band[r * TW + c] = 1; } last = 1e9; for (let r = TH - 1; r >= 0; r--) { if (tmp[r * TW + c]) last = r; if (last - r <= R) band[r * TW + c] = 1; } }
    for (let py = 0; py < TH; py++) {
      const s = S1 - (py + 0.5) * RES, row = (TH - 1 - py) * TW;     // texture rows bottom-up (v = 0 at S0)
      for (let px = 0; px < TW; px++) {
        const k = py * TW + px; let d;
        if (!band[k]) d = mask[k] ? -SDF_RANGE : SDF_RANGE;
        else {
          const x = X0 + (px + 0.5) * RES; d = 1e9; let ins = false;
          for (const f of list) { if (!inBox(x, s, f.bb, SDF_RANGE + 1)) continue; const q = lineDist(x, s, f.pts); if (q < d) d = q; if (!ins && inBox(x, s, f.bb) && pointInPoly(x, s, f.pts)) ins = true; }
          d = Math.min(d, SDF_RANGE); if (ins) d = -d;
        }
        out[(row + px) * 4 + ch] = Math.round(clamp(128 + d / SDF_RANGE * 127, 0, 255));
      }
    }
  });
  const t = new THREE.DataTexture(out, TW, TH, THREE.RGBAFormat);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.needsUpdate = true;
  return t;
}
const lin = (r, g, b) => new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
function paintCourse() {
  // colour every 0.3 m cell from the surface raster (CLS): mowing stripes, crisp tee / green / bunker edges, water banks, noise
  const ctx = texCanvas.getContext('2d');
  const img = ctx.createImageData(TW, TH), d = img.data;
  const rgb = new Float32Array(TW * TH * 3);
  const tile = new Float32Array(256 * 256); for (let i = 0; i < tile.length; i++) tile[i] = Math.random();
  const col = [0, 0, 0];
  const put = c => { col[0] = c[0]; col[1] = c[1]; col[2] = c[2]; };
  const mix = (c, t) => { if (t <= 0) return; col[0] += (c[0] - col[0]) * t; col[1] += (c[1] - col[1]) * t; col[2] += (c[2] - col[2]) * t; };
  const nb = (k, v) => CLS[k + 1] === v || CLS[k - 1] === v || CLS[k + TW] === v || CLS[k - TW] === v;
  for (let py = 1; py < TH - 1; py++) {
    const s = S1 - (py + 0.5) * RES;
    for (let px = 1; px < TW - 1; px++) {
      const x = X0 + (px + 0.5) * RES, k = py * TW + px, c = CLS[k];
      switch (c) {
        // fairways, greens, tees, bunkers are drawn in the terrain shader from distance fields (smooth edges at any distance)
        case S_FAIR: case S_SEMI: case S_GREEN: case S_FRINGE: case S_TEE: case S_BUNKER: put(C.rough); break;
        case S_PATH: case S_ROAD: put(PAVED[k] ? C.road : C.rough); break;          // paths and roads are textured ribbons on top (paths.js)
        case S_BUILDING: put(C.building); break;
        case S_FOREST: put(C.forest); mix(C.deep, vnoise(x * 0.08, s * 0.08) * 0.5); break;
        case S_RANGE: put((Math.floor((x - s * 0.3) / 6) & 1) ? C.range1 : C.range2); break;
        case S_DEEP: put(C.deep); mix(C.rough, vnoise(x * 0.05, s * 0.05) * 0.6); mix([118, 120, 60], Math.max(0, fbm(x * 0.045 + 3, s * 0.045 - 7, 3) - 0.5) * 1.6); break;
        default: put(C.rough); mix([96, 112, 52], Math.max(0, fbm(x * 0.045 + 3, s * 0.045 - 7, 3) - 0.52) * 2.2);
      }
      if (c !== S_ROAD && c !== S_BUILDING) {
        const wd = waterDist(x, s);
        if (wd < 3) { mix(C.mud, (1 - smoothstep(0, 1.6, wd)) * 0.55); mix(C.bed, 1 - smoothstep(-0.2, 0.2, wd)); }
      }
      const n = tile[(px & 255) | ((py & 255) << 8)], lf = vnoise(x * 0.07, s * 0.07);
      const kk = (c === S_BUNKER || c === S_ROAD || c === S_PATH) ? 0.94 + 0.12 * n : (0.88 + 0.2 * lf) * (0.94 + 0.12 * n);
      rgb[k * 3] = col[0] * kk; rgb[k * 3 + 1] = col[1] * kk; rgb[k * 3 + 2] = col[2] * kk;
    }
  }
  // soften only the natural borders (rough ↔ semi ↔ woods); mown edges stay crisp
  for (let py = 0; py < TH; py++) for (let px = 0; px < TW; px++) {
    const k = py * TW + px, c = CLS[k], o = k * 4;
    let r = rgb[k * 3], g = rgb[k * 3 + 1], b = rgb[k * 3 + 2];
    if (py > 0 && px > 0 && py < TH - 1 && px < TW - 1 && SOFT_EDGE.has(c) && (CLS[k + 1] !== c || CLS[k - 1] !== c || CLS[k + TW] !== c || CLS[k - TW] !== c)) {
      r = g = b = 0; let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = k + dy * TW + dx; if (!SOFT_EDGE.has(CLS[q])) continue; r += rgb[q * 3]; g += rgb[q * 3 + 1]; b += rgb[q * 3 + 2]; n++; }
      r /= n; g /= n; b /= n;
    }
    d[o] = clamp(r, 0, 255); d[o + 1] = clamp(g, 0, 255); d[o + 2] = clamp(b, 0, 255); d[o + 3] = 255 * (GRASS_LEN[c] ?? 0.9);
  }
  ctx.putImageData(img, 0, 0);
}
function makeDetailTexture() {
  // tileable grass: thousands of short blades (light/dark), luminance only – the course texture gives the colour
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
  const ctx = c.getContext('2d'), r = mulberry32(31);
  ctx.fillStyle = 'rgb(128,128,128)'; ctx.fillRect(0, 0, N, N);
  for (let i = 0; i < 26000; i++) {
    const x = r() * N, y = r() * N, l = 3 + r() * 9, a = -Math.PI / 2 + (r() - 0.5) * 1.3, v = 70 + r() * 120;
    ctx.strokeStyle = `rgba(${v},${v},${v},0.55)`; ctx.lineWidth = 0.8 + r() * 1.2;
    const dx = Math.cos(a) * l, dy = Math.sin(a) * l;
    for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) { if (x + ox + dx < -12 || x + ox > N + 12 || y + oy + dy < -12 || y + oy > N + 12) continue; ctx.beginPath(); ctx.moveTo(x + ox, y + oy); ctx.lineTo(x + ox + dx, y + oy + dy); ctx.stroke(); }
  }
  const img = ctx.getImageData(0, 0, N, N);   // g channel: soft blotches for clover / patchy growth
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const a = x / N * 6.2832, b = y / N * 6.2832;
    img.data[(y * N + x) * 4 + 1] = 255 * fbm(Math.cos(a) * 2 + 5, Math.sin(a) * 2 + Math.cos(b) * 2 + Math.sin(b), 3);
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
function makeWaterNormal() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const ctx = c.getContext('2d'), img = ctx.createImageData(N, N);
  const h = (x, y) => fbm(x / 22, y / 22, 4) + 0.5 * fbm(x / 7 + 40, y / 7, 2);
  // periodic sampling via wrapping coordinates
  const H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const a = x / N * Math.PI * 2, b = y / N * Math.PI * 2;
    H[y * N + x] = fbm(Math.cos(a) * 3 + 10, Math.sin(a) * 3 + Math.cos(b) * 3, 3) + 0.5 * fbm(Math.sin(b) * 6 + 30, Math.cos(a) * 6, 2);
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = H[y * N + ((x + 1) % N)] - H[y * N + ((x + N - 1) % N)];
    const dy = H[((y + 1) % N) * N + x] - H[((y + N - 1) % N) * N + x];
    const nx = -dx * 6, ny = -dy * 6, nz = 1, l = Math.hypot(nx, ny, nz), o = (y * N + x) * 4;
    img.data[o] = (nx / l * 0.5 + 0.5) * 255; img.data[o + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[o + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
  return t;
}

/* =====================================================================
   Build world
   ===================================================================== */
let terrainMesh, waterMats = [], waterNormal, trees = [], treeGrid = new Map();

function buildTerrain() {
  for (let j = 0; j < NS; j++) for (let i = 0; i < NX; i++) HGRID[i + j * NX] = heightRaw(X0 + i * STEP, S0 + j * STEP);
  const pos = new Float32Array(NX * NS * 3), uv = new Float32Array(NX * NS * 2);
  for (let j = 0; j < NS; j++) for (let i = 0; i < NX; i++) {
    const k = i + j * NX;
    pos[k * 3] = X0 + i * STEP; pos[k * 3 + 1] = HGRID[k]; pos[k * 3 + 2] = -(S0 + j * STEP);
    uv[k * 2] = i / (NX - 1); uv[k * 2 + 1] = j / (NS - 1);
  }
  const idx = new Uint32Array((NX - 1) * (NS - 1) * 6); let p = 0;
  for (let j = 0; j < NS - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const a = i + j * NX, b = a + 1, c = a + NX, d = c + 1;
    idx[p++] = a; idx[p++] = b; idx[p++] = c; idx[p++] = b; idx[p++] = d; idx[p++] = c;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  paintCourse();
  const tex = new THREE.CanvasTexture(texCanvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const detail = makeDetailTexture();
  const sdf = buildSurfaceSDF();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.93, metalness: 0, envMapIntensity: 0.6 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      detailMap: { value: detail }, sdfMap: { value: sdf }, sdfRange: { value: SDF_RANGE },
      detailRep: { value: new THREE.Vector2((X1 - X0), (S1 - S0)) },   // metres across the course
      gridOrigin: { value: new THREE.Vector2(X0, S0) },
      cFair1: { value: lin(...C.fair1) }, cFair2: { value: lin(...C.fair2) }, cSemi: { value: lin(...C.semi) }, cFringe: { value: lin(...C.fringe) },
      cGreen1: { value: lin(...C.green1) }, cGreen2: { value: lin(...C.green2) }, cCollar: { value: lin(...C.collar) },
      cTee1: { value: lin(...C.tee1) }, cTee2: { value: lin(...C.tee2) }, cTeeEdge: { value: lin(...C.teeEdge) },
      cSand: { value: lin(...C.sand) }, cLip: { value: lin(78, 104, 42) },
    });
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D detailMap, sdfMap; uniform vec2 detailRep, gridOrigin; uniform float sdfRange;
        uniform vec3 cFair1, cFair2, cSemi, cFringe, cGreen1, cGreen2, cCollar, cTee1, cTee2, cTeeEdge, cSand, cLip;
        float inside(float d) { float w = max(fwidth(d) * 0.7, 0.015); return 1.0 - smoothstep(-w, w, d); }   // anti-aliased edge
        float stripe(float u, float width) { float f = fract(u / (2.0 * width)); float w = max(fwidth(u) / (2.0 * width), 0.002); return smoothstep(0.5 - w, 0.5 + w, f) - smoothstep(1.0 - w, 1.0, f) + (1.0 - smoothstep(0.0, w, f)); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float glen = clamp((diffuseColor.a - 0.5) * 2.0, 0.0, 1.0);      // 0 = putting green … 1 = deep rough
        diffuseColor.a = 1.0;
        vec2 wm = vMapUv * detailRep, wp = wm + gridOrigin;           // metres; course coordinates (x, s)
        vec4 sd = (texture2D(sdfMap, vMapUv) * 255.0 - 128.0) / 127.0 * sdfRange;
        float dG = sd.r, dF = sd.g, dT = sd.b, dB = sd.a;
        float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)) / 0.105;   // keep the painted noise
        lum = clamp(lum, 0.75, 1.25);
        vec3 col = diffuseColor.rgb;
        // semi-rough collar round the fairway, then the fairway with mowing stripes
        float semi = inside(dF - 2.5); col = mix(col, cSemi * lum, semi); glen = mix(glen, 0.6, semi);
        float fw = inside(dF); col = mix(col, mix(cFair1, cFair2, stripe(wp.y + wp.x * 0.25, 8.0)) * lum, fw); glen = mix(glen, 0.3, fw);
        // tee box with a darker edge
        float te = inside(dT); vec3 tc = mix(cTee1, cTee2, stripe(wp.x - wp.y, 2.2)); tc = mix(tc, cTeeEdge, smoothstep(-0.34, -0.14, dT));     // darker mown edge just inside the boundary
        col = mix(col, tc * lum, te); glen = mix(glen, 0.22, te);
        // fringe, the dark cut line and the green
        float fr = inside(dG - 1.3); col = mix(col, cFringe * lum, fr); glen = mix(glen, 0.2, fr);
        float gr = inside(dG); vec3 gc = mix(cGreen1, cGreen2, stripe(wp.x + wp.y, 1.6)); gc = mix(gc, cCollar, inside(abs(dG + 0.1) - 0.1));
        col = mix(col, gc * mix(1.0, lum, 0.5), gr); glen = mix(glen, 0.0, gr);
        // bunkers: a dark grass lip, then sand
        float lip = inside(dB - 0.35); col = mix(col, cLip * lum, lip * 0.6);
        float bk = inside(dB); col = mix(col, cSand * (0.95 + 0.1 * lum) * mix(0.84, 1.0, smoothstep(0.0, 0.5, -dB)), bk); glen = mix(glen, 0.0, bk);
        diffuseColor.rgb = col;
        float b1 = texture2D(detailMap, wm / mix(0.9, 1.7, glen)).r;            // blades (no blades in sand)
        float b2 = texture2D(detailMap, wm / 3.7 + 0.37).r;
        float bl = texture2D(detailMap, wm / 23.0 + 0.71).g;                     // patches
        float contrast = mix(0.35, 1.0, glen) * (1.0 - bk);
        diffuseColor.rgb *= 1.0 + ((b1 - 0.5) * 1.7 + (b2 - 0.5) * 0.6) * contrast;
        diffuseColor.rgb *= 0.92 + 0.16 * bl;`);
  };
  terrainMesh = new THREE.Mesh(geo, mat);
  terrainMesh.receiveShadow = true;
  world.add(terrainMesh);
}

function buildWaterMesh() {
  // one mesh for all water in the hole's terrain grid; only cells near water get vertices
  const st = 1, nx = NX, ns = NS, map = new Int32Array(nx * ns).fill(-1), wd = new Float32Array(nx * ns);
  for (let j = 0; j < ns; j++) for (let i = 0; i < nx; i++) wd[i + j * nx] = waterDist(X0 + i * st, S0 + j * st);
  const pos = [], uv = [], idx = [];
  const vid = (i, j) => {
    const k = i + j * nx; if (map[k] >= 0) return map[k];
    const x = X0 + i * st, s = S0 + j * st;
    map[k] = pos.length / 3; pos.push(x, waterLevel(x, s), -s); uv.push(x * 0.03, s * 0.03); return map[k];
  };
  for (let j = 0; j < ns - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = i + j * nx;
    if (Math.min(wd[a], wd[a + 1], wd[a + nx], wd[a + nx + 1]) >= 1.0) continue;
    const va = vid(i, j), vb = vid(i + 1, j), vc = vid(i, j + 1), vd = vid(i + 1, j + 1);
    idx.push(va, vb, vc, vb, vd, vc);
  }
  if (!idx.length) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, waterMat);
  m.receiveShadow = true;
  world.add(m);
}
let waterMat;
function buildWater() {
  if (waterMat) { buildWaterMesh(); return; }
  waterNormal = makeWaterNormal();
  // calm pond water: dark, glossy, mostly reflections; only a faint, slow ripple
  waterMat = new THREE.MeshStandardMaterial({ color: 0x1d3833, roughness: 0.05, metalness: 0.0, normalMap: waterNormal, normalScale: new THREE.Vector2(0.035, 0.035),
    transparent: true, opacity: 0.94, envMapIntensity: 0.7 });
  buildWaterMesh();
}

const bridges = [];
function buildBridge() {
  // walk along every path from OpenStreetMap and put a wooden bridge over each stretch that crosses water
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5636, roughness: 0.85 });
  for (const f of FEAT.paths.concat(FEAT.roads)) {
    const P = f.pts, samples = [];
    for (let i = 0; i < P.length - 1; i++) {
      const L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
      for (let d = 0; d < L; d += 0.5) { const t = d / L; samples.push([lerp(P[i][0], P[i + 1][0], t), lerp(P[i][1], P[i + 1][1], t), i]); }
    }
    let run = null;
    // one bridge per water crossing; it follows the path: a curved crossing is split into straight spans
    const flush = () => {
      if (!run || run.length < 2) { run = null; return; }
      // extend the crossing 3.5 m along the path on both sides, so the bridge lands on dry ground
      const first = run[0], last = run[run.length - 1];
      const i0 = samples.indexOf(first), i1 = samples.indexOf(last);
      let j0 = Math.max(0, i0 - 7), j1 = Math.min(samples.length - 1, i1 + 7);
      const ground = q => heightRaw(q[0], q[1], false);
      const deckH = Math.max(ground(samples[j0]), ground(samples[j1]), waterLevel((first[0] + last[0]) / 2, (first[1] + last[1]) / 2) + 0.5) - 0.1;
      // make it longer until both ends rest on the bank: further along the path, then straight on past its end
      while (j0 > 0 && i0 - j0 < 40 && ground(samples[j0]) < deckH - 0.12) j0--;
      while (j1 < samples.length - 1 && j1 - i1 < 40 && ground(samples[j1]) < deckH - 0.12) j1++;
      const pts = samples.slice(j0, j1 + 1);
      const reachBank = (end, prev, add) => {
        const dx = end[0] - prev[0], ds = end[1] - prev[1], l = Math.hypot(dx, ds) || 1;
        for (let k = 1, q = end; k <= 24 && ground(q) < deckH - 0.12; k++) { q = [end[0] + dx / l * 0.5 * k, end[1] + ds / l * 0.5 * k, end[2]]; add(q); }
      };
      if (pts.length >= 2) { reachBank(pts[0], pts[1], q => pts.unshift(q)); reachBank(pts[pts.length - 1], pts[pts.length - 2], q => pts.push(q)); }
      // split into straight spans wherever the path turns by more than ~8°
      const spans = []; let a = 0;
      const head = (i, j) => Math.atan2(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]);
      for (let k = 2; k < pts.length; k++) {
        const h0 = head(a, a + 1), h1 = head(k - 1, k);
        let dh = Math.abs(h1 - h0); if (dh > Math.PI) dh = 2 * Math.PI - dh;
        if (dh > 0.14 && k - 1 - a >= 2) { spans.push([a, k - 1]); a = k - 1; }
      }
      spans.push([a, pts.length - 1]);
      const w = Math.max(2.4, f.w + 0.4);
      for (const [i, j] of spans) {
        const A = pts[i], Bp = pts[j], dx = Bp[0] - A[0], ds = Bp[1] - A[1];
        const len = Math.hypot(dx, ds) + 0.4, ang = Math.atan2(dx, ds), x = (A[0] + Bp[0]) / 2, bs = (A[1] + Bp[1]) / 2;  // +0.4: spans overlap at the joints
        const g = new THREE.Group();
        const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 0.15, len), wood); deck.castShadow = deck.receiveShadow = true; g.add(deck);
        for (const side of [-1, 1]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, len), wood); rail.position.set(side * w / 2, 0.95, 0); rail.castShadow = true; g.add(rail);
          const nPost = Math.max(1, Math.round(len / 2.5));
          for (let k = 0; k <= nPost; k++) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), wood); post.position.set(side * w / 2, 0.5, -len / 2 + 0.2 + k * (len - 0.4) / nPost); post.castShadow = true; g.add(post); }
        }
        g.position.set(x, deckH, -bs); g.rotation.y = -ang;
        world.add(g);
        bridges.push({ x, s: bs, ang, len, w, h: deckH + 0.08, ends: [ground(A) - deckH, ground(Bp) - deckH] });
      }
      run = null;
    };
    for (const p of samples) { if (waterDist(p[0], p[1]) < 0.6) (run = run || []).push(p); else flush(); }
    flush();
  }
}
function onBridge(x, s) { // returns the bridge under (x, s) or null
  for (const b of bridges) {
    const dx = x - b.x, ds = s - b.s, c = Math.cos(b.ang), sn = Math.sin(b.ang);
    const along = dx * sn + ds * c, across = dx * c - ds * sn;
    if (Math.abs(along) < b.len / 2 && Math.abs(across) < b.w / 2) return b;
  }
  return null;
}

/* ---------- trees ---------- */
const NO_TREE = new Set([S_FAIR, S_SEMI, S_GREEN, S_FRINGE, S_TEE, S_BUNKER, S_PATH, S_ROAD, S_BUILDING, S_RANGE]);
function treeOK(x, s, minFair) {
  if (x < X0 + 5 || x > X1 - 5 || s < S0 + 5 || s > S1 - 5) return false;
  for (const [dx, ds] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) { const k = cell(x + dx, s + ds); if (k < 0 || NO_TREE.has(CLS[k])) return false; }
  if (waterDist(x, s) < 3 || greenDist(x, s) < 12 || teeDist(x, s) < 4 || bunkerDist(x, s) < 3 || pathDist(x, s) < 1.2) return false;
  if (minFair > 0 && fairwayDist(x, s) < minFair) return false;
  for (const L of FEAT.holeLines) if (lineDist(x, s, L) < (minFair > 0 ? 22 : 12)) return false;   // keep every line of play open
  return true;
}
function addTree(x, s, conifer, sc) {
  const y0 = heightAt(x, s);
  const t = conifer
    ? { x, z: -s, y0, conifer, trunkH: 1.4 * sc, cr: 2.0 * sc, ch: 8.5 * sc }
    : { x, z: -s, y0, conifer, trunkH: 2.4 * sc, cr: 3.0 * sc, ch: 3.4 * sc };
  t.cy = y0 + t.trunkH + (conifer ? t.ch * 0.42 : t.ch * 0.75);
  t.id = trees.length; trees.push(t);
  const key = Math.floor(x / 10) + ',' + Math.floor(s / 10);
  if (!treeGrid.has(key)) treeGrid.set(key, []);
  treeGrid.get(key).push(t);
}
function registerTree(t) {
  t.id = trees.length; trees.push(t);
  const key = Math.floor(t.x / 10) + ',' + Math.floor(-t.z / 10);
  if (!treeGrid.has(key)) treeGrid.set(key, []);
  treeGrid.get(key).push(t);
}
// a real tree from swissSURFACE3D: position, height h and crown radius r (m)
function addLidarTree(x, s, h, r, conifer) {
  const y0 = heightAt(x, s);
  if (conifer) {
    const trunkH = 0.15 * h, ch = h - trunkH * 0.6;
    registerTree({ x, z: -s, y0, conifer, trunkH, cr: r, ch, cy: y0 + trunkH + ch * 0.42 });
  } else {
    const a = Math.min(0.4 * h, 1.3 * r), ch = a / 0.9, cy = y0 + h - a;   // crown semi-height a
    registerTree({ x, z: -s, y0, conifer, trunkH: Math.max(1.2, cy - y0 - 0.5 * a), cr: r, ch, cy });
  }
}
const PLAY = new Set([S_FAIR, S_GREEN, S_FRINGE, S_TEE, S_BUNKER, S_PATH, S_ROAD, S_BUILDING]);
function buildTrees() {
  const L = SWISSGOLF.trees && SWISSGOLF.trees[COURSE_DEF.terrain];
  if (L) {
    // real trees (swissSURFACE3D lidar). Safety net: no trunk on a playing surface, path, road, building or in water.
    const d = L.data;
    for (let i = 0; i < d.length; i += 5) {
      const [x, s] = lv95ToHole(L.origin[0] + d[i] / 10, L.origin[1] + d[i + 1] / 10);
      if (x < X0 + 3 || x > X1 - 3 || s < S0 + 3 || s > S1 - 3) continue;
      const k = cell(x, s);
      if (CLUB && CLUB.covers(x, s, -2)) continue;
      if (RANGE_PAD && RANGE_PAD.inModel(x, s, 3)) continue;           // driving range tee line and bays                  // club house, its terrace and the car park sign
      if (k < 0 || PLAY.has(CLS[k]) || waterDist(x, s) < 0.5 || fairwayDist(x, s) < 1 || greenDist(x, s) < 3 || teeDist(x, s) < 1.5) continue;
      addLidarTree(x, s, Math.max(3, d[i + 2] / 10), d[i + 3] / 10, d[i + 4] === 1);
    }
  } else buildRandomTrees();
  buildTreeMeshes();
}
function buildRandomTrees() {
  // woods from OpenStreetMap are dense; rough inside the course gets clumps and lines of trees; gardens get a few
  for (let s = S0 + 6; s < S1 - 6; s += 4.5) for (let x = X0 + 6; x < X1 - 6; x += 4.5) {
    const jx = x + (rand() - 0.5) * 4, js = s + (rand() - 0.5) * 4, k = cell(jx, js);
    if (k < 0) continue;
    const c = CLS[k], dens = fbm(jx * 0.03 + 5, js * 0.03 - 3, 3);
    let p = 0, minFair = 0;
    if (c === S_FOREST) { p = 0.75; minFair = 6; }
    else if (c === S_ROUGH) { p = dens > 0.56 ? 0.45 : dens > 0.5 ? 0.1 : 0.015; minFair = 10; }
    else if (c === S_DEEP) p = Math.abs(jx) > 170 || js < -130 || js > 520 ? 0.25 : dens > 0.55 ? 0.18 : 0.04;
    if (rand() > p || !treeOK(jx, js, minFair)) continue;
    addTree(jx, js, rand() < (c === S_FOREST ? 0.25 : 0.35), 0.8 + rand() * 0.6);
  }
}
// Trees are drawn in three levels of detail around the camera: detailed procedural trees (js/trees3d.js) close by,
// lighter versions of the same trees out to TREE_LOD.mid (Settings, 150 m – 1 km, default 500 m), and the old simple blobs in the distance. The ball only ever
// collides with each tree's trunk + crown ellipsoid (treeCollide), whatever is drawn.
const TREE_LOD = { near: LOWQ ? 30 : 55, mid: 500, variants: 4 };
try { TREE_LOD.mid = clamp(+(localStorage.getItem('swissgolf.treeDist') || 500), 150, 1000) || 500; } catch (e) { }
function setTreeDistance(m) { TREE_LOD.mid = clamp(m, 150, 1000); updateTreeLOD(0, true); }   // Settings slider
let treeLOD = null;
function buildTreeMeshes() {
  const nDec = trees.filter(t => !t.conifer).length, nCon = trees.length - nDec;
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1, 6); trunkGeo.translate(0, 0.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 0.95 }), Math.max(1, trees.length));
  const decGeo = new THREE.IcosahedronGeometry(1, 2);
  { const p = decGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 0.82 + 0.3 * fbm(x * 2 + 5, y * 2 + z * 2, 2); p.setXYZ(i, x * k, y * k, z * k); } decGeo.computeVertexNormals(); }
  const conGeo = new THREE.ConeGeometry(1, 1, 9, 3); conGeo.translate(0, 0.5, 0);
  { const p = conGeo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = 1 + 0.12 * Math.sin(y * 18); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } conGeo.computeVertexNormals(); }
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true, envMapIntensity: 0.45 });
  const dec = new THREE.InstancedMesh(decGeo, leafMat, Math.max(1, nDec));
  const con = new THREE.InstancedMesh(conGeo, leafMat, Math.max(1, nCon));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  const detailed = typeof TREES3D !== 'undefined';
  let id = 0, ic = 0;
  trees.forEach((t, i) => {
    const yaw = rand() * 6.28; q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    m.compose(p.set(t.x, t.y0 - 0.2, t.z), q, sc.set(Math.min(1.4, 0.4 + t.cr * 0.15), t.trunkH + (t.conifer ? 1.5 : 0.8), Math.min(1.4, 0.4 + t.cr * 0.15)));
    t.mTrunk = m.toArray(new Float32Array(16));
    if (t.conifer) { m.compose(p.set(t.x, t.y0 + t.trunkH * 0.6, t.z), q, sc.set(t.cr, t.ch, t.cr)); col.setHSL(0.30 + rand() * 0.05, 0.35 + rand() * 0.15, 0.075 + rand() * 0.04); }
    else { m.compose(p.set(t.x, t.cy, t.z), q, sc.set(t.cr, t.ch * 0.9, t.cr)); col.setHSL(0.22 + rand() * 0.06, 0.42 + rand() * 0.2, 0.14 + rand() * 0.07); }
    t.mCrown = m.toArray(new Float32Array(16)); t.cCrown = col.toArray([]);
    t.yaw = yaw; t.variant = (i * 7 + (t.x * 13 | 0)) & 3;
    if (!detailed) {   // static: everything as blobs
      trunks.setMatrixAt(i, m.fromArray(t.mTrunk));
      if (t.conifer) { con.setMatrixAt(ic, m.fromArray(t.mCrown)); con.setColorAt(ic++, col); } else { dec.setMatrixAt(id, m.fromArray(t.mCrown)); dec.setColorAt(id++, col); }
    }
  });
  for (const im of [trunks, dec, con]) { im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; world.add(im); }
  if (!detailed) return;
  if (!dec.instanceColor) dec.setColorAt(0, col); if (!con.instanceColor) con.setColorAt(0, col);
  for (const im of [trunks, dec, con]) im.layers.set(2);            // LOD blobs: main camera only
  // ball cam (layer 1): every tree as a simple blob, always
  {
    const t2 = new THREE.InstancedMesh(trunkGeo, trunks.material, Math.max(1, trees.length));
    const d2 = new THREE.InstancedMesh(decGeo, leafMat, Math.max(1, nDec)), c2 = new THREE.InstancedMesh(conGeo, leafMat, Math.max(1, nCon));
    let a = 0, b = 0;
    trees.forEach((t, i) => {
      t2.setMatrixAt(i, m.fromArray(t.mTrunk));
      if (t.conifer) { c2.setMatrixAt(b, m.fromArray(t.mCrown)); c2.setColorAt(b++, col.fromArray(t.cCrown)); }
      else { d2.setMatrixAt(a, m.fromArray(t.mCrown)); d2.setColorAt(a++, col.fromArray(t.cCrown)); }
    });
    for (const im of [t2, d2, c2]) { im.layers.set(1); im.frustumCulled = false; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; world.add(im); }
  }

  // detailed models: 4 spruces + 4 broadleaves, each in a full and a light version
  const M = TREES3D.materials(), sets = {};
  for (const kind of ['spruce', 'broadleaf']) {
    sets[kind] = [];
    for (let v = 0; v < TREE_LOD.variants; v++) {
      const n = Math.max(1, trees.filter(t => (t.conifer ? 'spruce' : 'broadleaf') === kind && t.variant === v).length);
      sets[kind][v] = [false, true].map(lite => {
        const T = TREES3D.build(kind, 11 + v * 17 + (kind === 'spruce' ? 0 : 5), lite);
        const wood = new THREE.InstancedMesh(T.wood, kind === 'spruce' ? M.barkC : M.barkD, n);
        const leaves = new THREE.InstancedMesh(T.leaves, kind === 'spruce' ? M.needles : M.leaves, n);
        leaves.customDepthMaterial = kind === 'spruce' ? M.needlesDepth : M.leavesDepth;
        leaves.setColorAt(0, col.setRGB(1, 1, 1));
        for (const im of [wood, leaves]) { im.layers.set(2); im.count = 0; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; world.add(im); }
        return { T, wood, leaves, n: 0 };
      });
    }
  }
  // each tree's matrix for the detailed model: height and crown width matched to the lidar tree
  const up = new THREE.Vector3(0, 1, 0);
  for (const t of trees) {
    const T = sets[t.conifer ? 'spruce' : 'broadleaf'][t.variant][0].T;
    const h = t.conifer ? t.trunkH * 0.6 + t.ch : (t.cy - t.y0) + t.ch * 0.45;
    const sy = h / T.height, sxz = clamp(t.cr / T.crownR, sy * 0.65, sy * 1.6);
    m.compose(p.set(t.x, t.y0 - 0.1, t.z), q.setFromAxisAngle(up, t.yaw), sc.set(sxz, sy, sxz));
    t.mDet = m.toArray(new Float32Array(16));
    // tint: a little darker than the preview so the detailed trees blend with the distant ones
    const k = t.conifer ? 0.48 + rand() * 0.12 : 0.5 + rand() * 0.14;
    t.cDet = t.conifer ? [k * (0.92 + rand() * 0.1), k, k * (0.9 + rand() * 0.12)] : [k * (0.8 + rand() * 0.2), k, k * (0.7 + rand() * 0.2)];
  }
  treeLOD = { sets, trunks, dec, con, last: new THREE.Vector3(1e9, 0, 0), timer: 0 };
  updateTreeLOD(0, true);
}
function updateTreeLOD(dt, force = false) {
  const L = treeLOD; if (!L) return;
  L.timer -= dt;
  // in fog / rain nothing is visible beyond the fog's far distance: draw trees only a little past it
  const fogFar = scene.fog ? scene.fog.far * 1.1 + 20 : Infinity;
  if (!force && !(Math.abs(fogFar - (L.fogFar ?? fogFar)) > 15) && (L.timer > 0 || camera.position.distanceToSquared(L.last) < 16)) return;
  L.timer = 0.25; L.last.copy(camera.position); L.fogFar = fogFar;
  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
  const n2 = Math.min(TREE_LOD.near, fogFar) ** 2, m2 = Math.min(TREE_LOD.mid, fogFar) ** 2, f2 = fogFar ** 2;
  for (const k in L.sets) for (const v of L.sets[k]) for (const s of v) s.n = 0;
  let nt = 0, nd = 0, nc = 0;
  const tA = L.trunks.instanceMatrix.array, dA = L.dec.instanceMatrix.array, cA = L.con.instanceMatrix.array, dC = L.dec.instanceColor.array, cC = L.con.instanceColor.array;
  for (const t of trees) {
    const d2 = (t.x - cx) ** 2 + (t.y0 + 6 - cy) ** 2 + (t.z - cz) ** 2;
    if (d2 > f2) continue;                 // hidden by fog
    if (d2 < m2) {
      const s = L.sets[t.conifer ? 'spruce' : 'broadleaf'][t.variant][d2 < n2 ? 0 : 1], i = s.n++;
      s.wood.instanceMatrix.array.set(t.mDet, i * 16); s.leaves.instanceMatrix.array.set(t.mDet, i * 16);
      s.leaves.instanceColor.array.set(t.cDet, i * 3);
    } else {
      tA.set(t.mTrunk, nt++ * 16);
      if (t.conifer) { cA.set(t.mCrown, nc * 16); cC.set(t.cCrown, nc++ * 3); } else { dA.set(t.mCrown, nd * 16); dC.set(t.cCrown, nd++ * 3); }
    }
  }
  for (const k in L.sets) for (const v of L.sets[k]) for (const s of v) {
    s.wood.count = s.leaves.count = s.n;
    s.wood.instanceMatrix.needsUpdate = s.leaves.instanceMatrix.needsUpdate = s.leaves.instanceColor.needsUpdate = true;
  }
  L.trunks.count = nt; L.dec.count = nd; L.con.count = nc;
  for (const im of [L.trunks, L.dec, L.con]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
}
function treesNear(x, z) {
  const s = -z, i = Math.floor(x / 10), j = Math.floor(s / 10), out = [];
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = treeGrid.get((i + a) + ',' + (j + b)); if (l) out.push(...l); }
  return out;
}
function treeCollide(st, enable) {
  for (const t of treesNear(st.x, st.z)) {
    const dx = st.x - t.x, dz = st.z - t.z, dh = Math.hypot(dx, dz);
    if (dh < 0.3 && st.y < t.y0 + t.trunkH + 0.5) { // trunk
      const nx = dx / (dh || 1), nz = dz / (dh || 1), vn = st.vx * nx + st.vz * nz;
      if (vn < 0) { st.vx -= 1.45 * vn * nx; st.vz -= 1.45 * vn * nz; st.vx *= 0.6; st.vz *= 0.6; st.w *= 0.5; sfx.thock(); }
      continue;
    }
    // canopy ellipsoid (cones narrow toward the top)
    let r = t.cr; const yy = st.y - t.cy;
    if (t.conifer) r = t.cr * clamp(0.5 - yy / t.ch, 0.05, 1);
    const q = (dx * dx + dz * dz) / (r * r) + (yy * yy) / ((t.ch * 0.5) ** 2);
    if (q < 1) {
      if (st.treeId !== t.id) {
        st.treeId = t.id;
        if (Math.random() < 0.6) { // hit branches
          const nx = dx / (r * r), ny = yy / ((t.ch * 0.5) ** 2), nz = dz / (r * r), l = Math.hypot(nx, ny, nz) || 1;
          const vn = (st.vx * nx + st.vy * ny + st.vz * nz) / l;
          if (vn < 0) { st.vx -= 1.3 * vn * nx / l; st.vy -= 1.3 * vn * ny / l; st.vz -= 1.3 * vn * nz / l; }
          st.vx = st.vx * 0.35 + (Math.random() - 0.5) * 2; st.vz = st.vz * 0.35 + (Math.random() - 0.5) * 2; st.vy *= 0.3; st.w *= 0.3;
          sfx.leaves();
        }
      } else { const k = 1 - 1.2 * DT; st.vx *= k; st.vy *= k; st.vz *= k; }
    } else if (st.treeId === t.id) st.treeId = -1;
  }
}
function walkBlockedByTree(x, z) { for (const t of treesNear(x, z)) if (Math.hypot(x - t.x, z - t.z) < 0.55) return true; return false; }

/* ---------- stakes (OB white, penalty area yellow) ---------- */
function buildStakes() {
  const pts = [];
  for (const f of FEAT.course) { // white OB stakes along the golf course boundary, near the hole
    const P = f.pts;
    for (let i = 0; i < P.length - 1; i++) {
      const L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
      for (let d = 0; d < L; d += 10) { const x = lerp(P[i][0], P[i + 1][0], d / L), s = lerp(P[i][1], P[i + 1][1], d / L);
        if (!NO_TREE.has(CLS[cell(x, s)] ?? 0) && waterDist(x, s) > 1) pts.push([x, s, 0xffffff]); }
    }
  }
  // white OB stakes along both sides of a railway corridor inside the course
  for (const f of FEAT.rails) {
    const P = f.pts;
    for (let i = 0; i < P.length - 1; i++) {
      const L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]), ux = (P[i + 1][0] - P[i][0]) / L, us = (P[i + 1][1] - P[i][1]) / L;
      for (let d = 0; d < L; d += 12) for (const sd of [-1, 1]) {
        const x = lerp(P[i][0], P[i + 1][0], d / L) + us * (RAIL_OB + 0.4) * sd, s = lerp(P[i][1], P[i + 1][1], d / L) - ux * (RAIL_OB + 0.4) * sd;
        const k = cell(x, s); if (k >= 0 && INCOURSE[k] === 1 && !NO_TREE.has(CLS[k]) && waterDist(x, s) > 1) pts.push([x, s, 0xffffff]);
      }
    }
  }
  // yellow penalty-area stakes ~1.6 m outside the water's edge, about every 7 m, near the hole only
  const wet = [];
  for (let s = S0 + 5; s < S1 - 5; s += 1) for (let x = X0 + 5; x <= X1 - 5; x += 1) { if (!inCourse(x, s)) continue; const d = waterDist(x, s); if (d > 1.2 && d < 2.0 && pathDist(x, s) > 0.8) wet.push([x, s]); }
  const ys = [], grid = new Map();
  for (const [x, s] of wet) {
    const key = Math.floor(x / 7) + ',' + Math.floor(s / 7); let ok = true;
    for (let a = -1; a <= 1 && ok; a++) for (let b = -1; b <= 1 && ok; b++) for (const q of grid.get((Math.floor(x / 7) + a) + ',' + (Math.floor(s / 7) + b)) || []) if (Math.hypot(q[0] - x, q[1] - s) < 7) { ok = false; break; }
    if (!ok) continue;
    if (!grid.has(key)) grid.set(key, []); grid.get(key).push([x, s]); pts.push([x, s, 0xd52b1e]);
  }
  const geo = new THREE.CylinderGeometry(0.03, 0.03, 0.75, 6); geo.translate(0, 0.37, 0);
  const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), pts.length);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  pts.forEach((p, i) => { m.makeTranslation(p[0], heightAt(p[0], p[1]) - 0.05, -p[1]); im.setMatrixAt(i, m); im.setColorAt(i, c.set(p[2])); });
  im.castShadow = true; world.add(im);
}

/* ---------- surrounding landscape ---------- */
function buildLandscape() {
  const cx = 0, cz = 0, R0 = Math.hypot(X1, S1) + 30, R1 = 4600, NR = 46, NA = 200;
  const pos = [], colr = [], idx = [];
  const c = new THREE.Color();
  for (let j = 0; j <= NR; j++) {
    const r = R0 * Math.pow(R1 / R0, j / NR);
    for (let i = 0; i <= NA; i++) {
      const a = i / NA * Math.PI * 2, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      let h = 8 + smoothstep(R0, R0 + 700, r) * (35 + 230 * fbm(Math.cos(a) * 2.2 + 7, Math.sin(a) * 2.2 + r / 1400, 4));
      h += 18 * (fbm(x * 0.004, z * 0.004, 3) - 0.5) * smoothstep(R0, R0 + 300, r);
      if (j === 0) h = -6;
      pos.push(x, h, z);
      const forest = fbm(x * 0.0025 + 3, z * 0.0025, 3) > 0.47 || h > 140;
      if (forest) c.setRGB(0.13, 0.24, 0.10); else c.setRGB(0.30 + 0.12 * vnoise(x * 0.01, z * 0.01), 0.44, 0.18);
      colr.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) {
    const a = j * (NA + 1) + i, b = a + 1, cc = a + NA + 1, d = cc + 1;
    idx.push(a, b, cc, b, d, cc);                     // counter-clockwise from above: normals point up
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const hills = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  scene.add(hills);
  // flat ground under everything
  const ground = new THREE.Mesh(new THREE.CircleGeometry(R0 + 400, 48), new THREE.MeshLambertMaterial({ color: 0x2f4f1c }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -4, 0); scene.add(ground);
  // the Alps far to the south (hazy, no fog)
  const ap = [], ac = [], ai = [], NAL = 720;
  for (let j = 0; j <= 1; j++) for (let i = 0; i <= NAL; i++) {
    const a = THREE.MathUtils.degToRad(95 + i / NAL * 120), r = 12000, taper = Math.pow(Math.sin(Math.PI * i / NAL), 0.6);
    const ridge = (Math.pow(fbm(i * 0.03, 3.3, 6), 1.6) * 420 + 40 + 70 * fbm(i * 0.15, 9.1, 3)) * taper;
    const h = j === 0 ? -50 : ridge;
    ap.push(Math.cos(a) * r, h, cz - Math.sin(a) * r * -1);
    const snow = j === 1 && ridge > 230;
    c.setRGB(snow ? 0.92 : 0.52, snow ? 0.94 : 0.6, snow ? 0.98 : 0.72); ac.push(c.r, c.g, c.b);
  }
  for (let i = 0; i < NAL; i++) { const a = i, b = i + 1, cc = i + NAL + 1, d = cc + 1; ai.push(a, b, cc, b, d, cc); }
  const ag = new THREE.BufferGeometry();
  ag.setAttribute('position', new THREE.Float32BufferAttribute(ap, 3)); ag.setAttribute('color', new THREE.Float32BufferAttribute(ac, 3)); ag.setIndex(ai);
  const alps = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide, transparent: true, opacity: 0.55 }));
  alps.renderOrder = -5; scene.add(alps);
}

/* ---------- pin, cup ---------- */
const PIN_COL = { front: 0xe53935, middle: 0xfdd835, back: 0x1e63c8 };
let pin = { x: 0, z: 0, pos: 'middle' };
const FLAGS = {};          // hole number -> { group, cloth, pin }
let cupMesh = null, flagPhase = 0, flagWind = 0;
function randomPin(no) {
  const h = COURSE.holes[no], g = h.green, d = h.dir;
  const thirds = ['front', 'middle', 'back'], third = thirds[Math.floor(Math.random() * 3)];
  // front / middle / back third along the line of play
  let a = 1e9, b = -1e9; for (const [x, s] of g.pts) { const u = (x - g.cx) * d[0] + (s - g.cs) * d[1]; a = Math.min(a, u); b = Math.max(b, u); }
  const L = b - a, i = thirds.indexOf(third), u0 = a + L * i / 3, u1 = a + L * (i + 1) / 3;
  for (let k = 0; k < 3000; k++) {
    const x = lerp(g.bb[0], g.bb[2], Math.random()), s = lerp(g.bb[1], g.bb[3], Math.random()), u = (x - g.cx) * d[0] + (s - g.cs) * d[1];
    if (u >= u0 && u <= u1 && polyDist(x, s, g.pts) < -2.2) return { x, z: -s, pos: third };
  }
  return { x: g.cx, z: -g.cs, pos: 'middle' };
}
function makeFlag() {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 2.3, 8), new THREE.MeshStandardMaterial({ color: 0xf4f4f4 }));
  pole.position.y = 1.15; pole.castShadow = true; group.add(pole);
  const fg = new THREE.PlaneGeometry(0.6, 0.4, 14, 6); fg.translate(0.3, 0, 0);
  const cloth = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ color: 0xfdd835, side: THREE.DoubleSide, roughness: 0.8 }));
  cloth.position.y = 2.08; cloth.castShadow = true; group.add(cloth);
  cloth.userData.base = fg.attributes.position.array.slice();
  scene.add(group);
  return { group, cloth };
}
function buildFlags() {
  for (const no of HOLE_NOS) {
    const f = FLAGS[no] || (FLAGS[no] = makeFlag());
    f.pin = randomPin(no);
    f.group.position.set(f.pin.x, Hw(f.pin.x, f.pin.z), f.pin.z);
    f.cloth.material.color.set(PIN_COL[f.pin.pos]);
  }
  if (!cupMesh) {
    const cg = new THREE.Group();
    const hole = new THREE.Mesh(new THREE.CircleGeometry(CUP_R, 28), new THREE.MeshBasicMaterial({ color: 0x050505 })); hole.rotation.x = -Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.RingGeometry(CUP_R, CUP_R + 0.012, 28), new THREE.MeshBasicMaterial({ color: 0xffffff })); rim.rotation.x = -Math.PI / 2;
    cg.add(hole, rim); cupMesh = cg; scene.add(cg);
  }
}
function placePin() {           // the current hole's flag and cup
  pin = FLAGS[COURSE.number].pin;
  const y = Hw(pin.x, pin.z), n = terrainNormal(pin.x, pin.z);
  cupMesh.position.set(pin.x, y + 0.004, pin.z);
  cupMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...n));
}
function animateFlags(dt) {
  // smooth the gusts, then advance the wave phase steadily – the cloth never jumps
  const ws = Math.hypot(wind.x, wind.z);
  flagWind += (ws - flagWind) * Math.min(1, dt * 0.8);
  flagPhase += dt * (2.2 + flagWind * 0.9);
  const amp0 = 0.012 + 0.011 * flagWind, droop = 1 - Math.min(1, flagWind / 4);
  const yawDown = Math.atan2(-wind.z, wind.x);
  for (const no in FLAGS) {
    const f = FLAGS[no], c = f.cloth;
    if (camera.position.distanceToSquared(f.group.position) > 400 * 400) continue;
    const p = c.geometry.attributes.position, b = c.userData.base;
    for (let i = 0; i < p.count; i++) {
      const x = b[i * 3], y = b[i * 3 + 1], amp = amp0 * (x / 0.6);
      p.setZ(i, Math.sin(x * 9 - flagPhase) * amp + Math.sin(y * 6 + flagPhase * 0.7) * amp * 0.25);
      p.setY(i, y - droop * x * 0.35);
    }
    p.needsUpdate = true; c.geometry.computeVertexNormals();
    c.rotation.y = flagWind > 0.2 ? yawDown : 0.5;
  }
}

/* =====================================================================
   Golfer
   ===================================================================== */
const UPV = new THREE.Vector3(0, 1, 0);
// one figure per player: shirt colour, male / female, name printed on the back of the shirt
function nameTexture(name, shirtHex) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 80;
  const g = c.getContext('2d'), col = new THREE.Color(shirtHex);
  const lum = 0.299 * col.r + 0.587 * col.g + 0.114 * col.b;
  g.font = '800 54px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = lum > 0.6 ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.35)'; g.fillStyle = lum > 0.6 ? '#1b1b1b' : '#ffffff';
  const t = (name || '').toUpperCase().slice(0, 6);
  g.strokeText(t, 128, 42, 248); g.fillText(t, 128, 42, 248);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
}
function makeGolfer(opt = {}) {
  if (typeof PEOPLE !== 'undefined') {   // realistic skinned figure (js/people.js) + the club
    const g = PEOPLE.build(opt), root = g.root;
    const limb = (r0, r1, mat) => { const geo = new THREE.CylinderGeometry(r1, r0, 1, 10); geo.translate(0, 0.5, 0); const m = new THREE.Mesh(geo, mat); m.castShadow = true; root.add(m); return m; };
    const ks = root.scale.x;   // club parts live in the figure's space: undo the figure's scale
    g.shaft = limb(0.007 / ks, 0.009 / ks, new THREE.MeshStandardMaterial({ color: 0xbfc4c8, metalness: 0.9, roughness: 0.3 }));
    g.grip = limb(0.013 / ks, 0.013 / ks, new THREE.MeshStandardMaterial({ color: 0x111111 }));
    g.clubHead = new THREE.Mesh(new THREE.BoxGeometry(0.1 / ks, 0.05 / ks, 0.03 / ks), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.9, roughness: 0.25 }));
    g.clubHead.castShadow = true; root.add(g.clubHead);
    scene.add(root);
    return g;
  }
  const shirtHex = opt.shirt ?? 0xc8102e, female = opt.sex === 'f';
  const root = new THREE.Group();
  const M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 });
  const skin = M(0xe0ae88), shirt = M(shirtHex), pants = M(female ? 0x2a3550 : 0x2c3342), shoe = M(0xf0f0f0), capM = M(0xffffff), glove = M(0xffffff);
  const limb = (r0, r1, mat) => { const g = new THREE.CylinderGeometry(r1, r0, 1, 10); g.translate(0, 0.5, 0); const m = new THREE.Mesh(g, mat); m.castShadow = true; root.add(m); return m; };
  const legMat = female ? skin : pants;
  const legL = limb(female ? 0.07 : 0.085, 0.055, legMat), legR = limb(female ? 0.07 : 0.085, 0.055, legMat);
  const shoeGeo = new THREE.BoxGeometry(0.11, 0.08, 0.27);
  const footL = new THREE.Mesh(shoeGeo, shoe), footR = new THREE.Mesh(shoeGeo, shoe); footL.castShadow = footR.castShadow = true; root.add(footL, footR);
  let hips;
  if (female) { hips = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.25, 0.3, 14), pants); hips.position.y = 0.83; }   // skort
  else { hips = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.22), pants); hips.position.y = 0.92; }
  hips.castShadow = true; root.add(hips);
  const torso = new THREE.Group(); torso.position.y = 0.94; root.add(torso);
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 4, 12), shirt); chest.scale.set(female ? 1.02 : 1.15, 1, 0.75); chest.position.y = 0.3; chest.castShadow = true; torso.add(chest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), skin); head.position.y = 0.72; head.castShadow = true; torso.add(head);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8), skin); neck.position.y = 0.6; torso.add(neck);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), capM); cap.position.y = 0.75; torso.add(cap);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.01, 16, 1, false, -Math.PI / 2, Math.PI), capM); brim.position.set(0, 0.755, 0.1); torso.add(brim);
  if (female) { // ponytail through the back of the cap
    const hair = M(0x6b4226);
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.16, 4, 8), hair); tail.position.set(0, 0.66, -0.14); tail.rotation.x = 0.35; tail.castShadow = true; torso.add(tail);
    const back = new THREE.Mesh(new THREE.SphereGeometry(0.118, 14, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.3), hair); back.position.y = 0.72; back.rotation.x = -0.5; torso.add(back);
  }
  const cross = new THREE.Group(); cross.position.set(0, 0.36, 0.13); torso.add(cross); // swiss cross on the chest
  const wm = new THREE.MeshBasicMaterial({ color: 0xffffff });
  cross.add(new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.03), wm), new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.1), wm));
  if (opt.name) { // name across the shoulders on the back
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.094), new THREE.MeshStandardMaterial({ map: nameTexture(opt.name, shirtHex), transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
    lab.position.set(0, 0.43, -0.133); lab.rotation.y = Math.PI; torso.add(lab);
  }
  const armL = limb(0.05, 0.06, shirt), armR = limb(0.05, 0.06, shirt);
  const handGeo = new THREE.SphereGeometry(0.045, 10, 8);
  const hands = new THREE.Mesh(handGeo, glove); hands.castShadow = true; root.add(hands);
  const handR = new THREE.Mesh(handGeo, skin); root.add(handR);
  const shaft = limb(0.007, 0.009, new THREE.MeshStandardMaterial({ color: 0xbfc4c8, metalness: 0.9, roughness: 0.3 }));
  const grip = limb(0.013, 0.013, new THREE.MeshStandardMaterial({ color: 0x111111 }));
  const clubHead = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.03), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.9, roughness: 0.25 }));
  clubHead.castShadow = true; root.add(clubHead);
  if (female) root.scale.setScalar(0.95);
  scene.add(root);
  return { root, legL, legR, footL, footR, torso, armL, armR, hands, handR, shaft, grip, clubHead, chest, hips, female };
}
function disposeGolfer(g) { scene.remove(g.root); g.root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }
let golfer = makeGolfer();
function pointLimb(mesh, a, b) {
  const d = new THREE.Vector3().subVectors(b, a), l = d.length();
  mesh.position.copy(a); mesh.scale.set(1, Math.max(l, 0.001), 1);
  mesh.quaternion.setFromUnitVectors(UPV, d.multiplyScalar(1 / (l || 1)));
}
// swing geometry in golfer-local space (golfer faces +Z, target is +X)
const ARM = 0.6, WRIST = 0.42, LEAN = 0.38;
const SHOULDER_C = new THREE.Vector3(0, 0.94, 0).add(new THREE.Vector3(0, 0.5, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), LEAN));
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const AX = new THREE.Vector3(1, 0, 0), AZ = new THREE.Vector3(0, 0, 1);
function swingPoints(alpha, theta, cock, L) {
  _q1.setFromAxisAngle(AX, alpha); _q2.setFromAxisAngle(AZ, theta); _q1.multiply(_q2);
  const hands = new THREE.Vector3(0, -ARM, 0).applyQuaternion(_q1).add(SHOULDER_C);
  _q3.setFromAxisAngle(AZ, cock); _q2.setFromAxisAngle(AX, -WRIST);
  const cd = new THREE.Vector3(0, -1, 0).applyQuaternion(_q2).applyQuaternion(_q3).applyQuaternion(_q1);
  const head = hands.clone().addScaledVector(cd, L);
  return { hands, head };
}
const clubSetup = CLUBS.map(c => { // solve plane tilt so the club head rests at the ball
  let lo = -1.5, hi = 0; // lo: club head high, hi: club head (below) ground
  for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; const p = swingPoints(mid, 0, 0, c.len); if (p.head.y > 0.03) lo = mid; else hi = mid; }
  const a = (lo + hi) / 2, p = swingPoints(a, 0, 0, c.len);
  return { alpha: a, ballLocal: new THREE.Vector3(p.head.x, 0, p.head.z) };
});
let pose = { mode: 'walk', phase: 0, theta: 0, cock: 0, speed: 0 };
function updateGolfer(g = golfer, ps = pose, club = game.club) {
  if (g.skinned) return PEOPLE.update(g, ps, club);
  const tmp = (x, y, z) => new THREE.Vector3(x, y, z);
  const clubVis = ps.mode !== 'sit'; g.shaft.visible = g.grip.visible = g.clubHead.visible = clubVis;
  if (ps.mode === 'sit') { // seated in a cart: thighs forward, shins down; driver's hands on the wheel
    g.torso.rotation.set(-0.08, 0, 0);
    for (const sd of [1, -1]) {
      const hip = tmp(0.1 * sd, 0.92, 0), foot = tmp(0.13 * sd, 0.47, 0.55);   // one straight leg: hip to foot (hidden by the cart body)
      pointLimb(sd > 0 ? g.legL : g.legR, hip, foot);
      const f = sd > 0 ? g.footL : g.footR; f.position.copy(foot).add(tmp(0, 0.03, 0.06)); f.rotation.set(0, 0, 0);
    }
    g.torso.updateMatrix();
    const shL = tmp(0.21, 0.48, 0).applyMatrix4(g.torso.matrix), shR = tmp(-0.21, 0.48, 0).applyMatrix4(g.torso.matrix);
    const hL = ps.drive ? tmp(0.14, 1.2, 0.42) : tmp(0.16, 0.98, 0.32), hR = ps.drive ? tmp(-0.14, 1.2, 0.42) : tmp(-0.16, 0.98, 0.32);
    pointLimb(g.armL, shL, hL); pointLimb(g.armR, shR, hR);
    g.hands.position.copy(hL); g.handR.position.copy(hR); g.handR.visible = true;
    return;
  }
  if (ps.mode === 'walk') {
    const sw = Math.sin(ps.phase) * Math.min(1, ps.speed / 1.2) * (ps.speed > 3 ? 0.7 : 0.32);
    g.torso.rotation.set(ps.speed > 3 ? 0.15 : 0.04, 0, 0);
    pointLimb(g.legL, tmp(0.1, 0.92, 0), tmp(0.11, 0.06 + Math.max(0, -sw) * 0.15, Math.sin(sw) * 0.9));
    pointLimb(g.legR, tmp(-0.1, 0.92, 0), tmp(-0.11, 0.06 + Math.max(0, sw) * 0.15, -Math.sin(sw) * 0.9));
    g.footL.position.set(0.11, 0.04 + Math.max(0, -sw) * 0.15, Math.sin(sw) * 0.9 + 0.05); g.footL.rotation.set(0, 0, 0);
    g.footR.position.set(-0.11, 0.04 + Math.max(0, sw) * 0.15, -Math.sin(sw) * 0.9 + 0.05); g.footR.rotation.set(0, 0, 0);
    g.torso.updateMatrix();
    const shL = tmp(0.21, 0.48, 0).applyMatrix4(g.torso.matrix), shR = tmp(-0.21, 0.48, 0).applyMatrix4(g.torso.matrix);
    const hL = shL.clone().add(tmp(0.04, -0.6, -sw * 0.5)), hR = shR.clone().add(tmp(-0.04, -0.6, sw * 0.5));
    pointLimb(g.armL, shL, hL); pointLimb(g.armR, shR, hR);
    g.hands.position.copy(hL); g.handR.position.copy(hR); g.handR.visible = true;
    // carry the club in the right hand
    const L = CLUBS[club].len, cdir = tmp(0, -0.55, 0.85).normalize();
    const top = hR.clone().addScaledVector(cdir, -0.15), head = hR.clone().addScaledVector(cdir, L - 0.15);
    pointLimb(g.grip, top, hR.clone().addScaledVector(cdir, 0.12)); pointLimb(g.shaft, top, head);
    g.clubHead.position.copy(head); g.clubHead.quaternion.identity();
    return;
  }
  // address / swing
  const cs = clubSetup[club], L = CLUBS[club].len;
  const putter = CLUBS[club].putter;
  const turn = putter ? 0 : clamp(ps.theta / 2.4, -1, 1.1) * 0.9;
  g.torso.rotation.set(LEAN, 0, 0, 'YXZ'); g.torso.rotation.y = turn;
  const stance = putter ? 0.17 : 0.26;
  const shift = putter ? 0 : clamp(ps.theta, -2.5, 2.5) * 0.04;
  pointLimb(g.legL, tmp(0.1, 0.92, -0.03), tmp(stance, 0.06, 0.02 - shift));
  pointLimb(g.legR, tmp(-0.1, 0.92, -0.03), tmp(-stance, 0.06, 0.02 + shift));
  g.footL.position.set(stance, 0.04, 0.06); g.footR.position.set(-stance, 0.04, 0.06);
  g.footL.rotation.set(0, 0.25, 0); g.footR.rotation.set(0, -0.1, 0);
  g.torso.updateMatrix();
  const p = swingPoints(cs.alpha, ps.theta, ps.cock, L);
  const shL = tmp(0.21, 0.48, 0).applyMatrix4(g.torso.matrix), shR = tmp(-0.21, 0.48, 0).applyMatrix4(g.torso.matrix);
  pointLimb(g.armL, shL, p.hands); pointLimb(g.armR, shR, p.hands);
  g.hands.position.copy(p.hands); g.handR.visible = false;
  const dir = p.head.clone().sub(p.hands).normalize();
  pointLimb(g.grip, p.hands.clone().addScaledVector(dir, -0.08), p.hands.clone().addScaledVector(dir, 0.18));
  pointLimb(g.shaft, p.hands.clone().addScaledVector(dir, -0.08), p.head);
  g.clubHead.position.copy(p.head);
  // orient club head: face toward +Z-ish (the ball), toe along the swing
  g.clubHead.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(dir.y < 0 ? 1 : 1, 0, 0));
  g.clubHead.rotation.z = Math.atan2(dir.x, -dir.y);
}

/* =====================================================================
   Ball, markers, trail
   ===================================================================== */
// per player: ball, tee peg and a light beam over the ball in the player's colour (see players.js)
function makeBallMesh() { const m = new THREE.Mesh(new THREE.SphereGeometry(BR * 1.35, 20, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, emissive: 0x222222 })); m.castShadow = true; scene.add(m); return m; }
function makeTeePeg(hex = 0xffffff) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.003, 0.06, 8), new THREE.MeshStandardMaterial({ color: hex })); scene.add(m); return m; }
function makeBeacon(hex = 0xffffff) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 14, 8, 1, true), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.5, depthWrite: false })); m.visible = false; scene.add(m); return m; }
let ballMesh = makeBallMesh(), teePeg = makeTeePeg(), beacon = makeBeacon();
const ringGeo = new THREE.RingGeometry(0.75, 1.0, 48); ringGeo.rotateX(-Math.PI / 2);
const aimRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
const powRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.95, depthWrite: false }));
aimRing.renderOrder = powRing.renderOrder = 5; scene.add(aimRing, powRing);
const AIM_N = 60;
const aimLine = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(AIM_N * 3), 3)),
  new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
aimLine.frustumCulled = false; scene.add(aimLine);
const TRAIL_N = 800;
const trail = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3)),
  new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
trail.frustumCulled = false; scene.add(trail);
let trailCount = 0;
function trailReset() { trailCount = 0; trail.geometry.setDrawRange(0, 0); trail.material.opacity = 0.7; }
function trailPush(x, y, z) {
  if (trailCount >= TRAIL_N) return;
  const a = trail.geometry.attributes.position; a.setXYZ(trailCount++, x, y, z); a.needsUpdate = true; trail.geometry.setDrawRange(0, trailCount);
}

/* =====================================================================
   Sound (synthesised)
   ===================================================================== */
const sfx = (() => {
  let ac = null, rainSrc = null, rainGain = null;
  let muted = false, master = null;
  try { muted = localStorage.getItem('swissgolf.muted') === '1'; } catch (e) { }
  const ctx = () => {
    if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ac.destination); }
    if (ac.state === 'suspended') ac.resume(); return ac;
  };
  function noise(dur, f, q, gain, type = 'bandpass') {
    const a = ctx(), n = a.createBuffer(1, a.sampleRate * dur, a.sampleRate), d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const s = a.createBufferSource(); s.buffer = n;
    const fl = a.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = a.createGain(); g.gain.value = gain;
    s.connect(fl).connect(g).connect(master); s.start();
  }
  function tone(f, dur, gain, type = 'sine') {
    const a = ctx(), o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(gain, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g).connect(master); o.start(); o.stop(a.currentTime + dur);
  }
  return {
    init: ctx,
    get muted() { return muted; },
    setMuted(m) {
      muted = m; try { localStorage.setItem('swissgolf.muted', m ? '1' : '0'); } catch (e) { }
      if (master) master.gain.setTargetAtTime(m ? 0 : 1, ac.currentTime, 0.02);
      if (typeof ui !== 'undefined') ui.soundIcon();
    },
    hit(p, putt) { if (muted) return; if (putt) { tone(1400, 0.06, 0.15 * p + 0.05, 'triangle'); noise(0.04, 2500, 2, 0.2); } else { noise(0.09, 3200, 1.2, 0.5 + 0.6 * p); tone(2100, 0.05, 0.2); } },
    thud(v) { if (muted) return; noise(0.08, 300, 1, Math.min(0.5, v / 30)); },
    thock() { if (muted) return; tone(320, 0.12, 0.3, 'triangle'); },
    leaves() { if (muted) return; noise(0.35, 2500, 0.4, 0.35, 'highpass'); },
    splash() { if (muted) return; noise(0.7, 900, 0.6, 0.6, 'lowpass'); },
    cup() { if (muted) return; tone(500, 0.09, 0.35, 'triangle'); setTimeout(() => tone(380, 0.12, 0.3, 'triangle'), 110); setTimeout(() => tone(300, 0.15, 0.25, 'triangle'), 240); },
    cheer() { if (muted) return; noise(1.8, 1500, 0.3, 0.25); },
    rain(level) {                      // looping filtered noise
      if (!ac && level <= 0) return; const a = ctx();
      if (!rainSrc) {
        const n = a.createBuffer(1, a.sampleRate * 2, a.sampleRate), d = n.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const src = a.createBufferSource(); src.buffer = n; src.loop = true;
        const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.4;
        rainGain = a.createGain(); rainGain.gain.value = 0; src.connect(f).connect(rainGain).connect(master); src.start(); rainSrc = src;
      }
      rainGain.gain.setTargetAtTime(level * 0.09, a.currentTime, 0.5);
    }
  };
})();

/* =====================================================================
   Game state
   ===================================================================== */
const wind = { x: 0, z: 0, base: { x: 0, z: 0 } };
const game = {
  mode: 'intro', tee: 'white', strokes: 0, club: 0, aimYaw: 0, power: 0, chargeT: 0,
  ball: new THREE.Vector3(), ballOnTee: true, prev: null, shot: null, shotStart: null,
  player: new THREE.Vector3(), yaw: 0, stamina: 1, exhausted: false, scores: {}, swingT: 0, resultT: 0, pending: null, mapBig: false,
};
const keys = {};
const $ = id => document.getElementById(id);
const fmt = m => m >= 10 ? Math.round(m) + ' m' : m.toFixed(1) + ' m';
function ballS() { return -game.ball.z; }
function lieAt(x, z) { return Sw(x, z); }
function distToPin(x, z) { return Math.hypot(x - pin.x, z - pin.z); }
function yawTo(fx, fz, tx, tz) { return Math.atan2(-(tx - fx), -(tz - fz)); }

function showMsg(html, dur = 2.4) {
  const m = $('msg'); m.innerHTML = html; m.style.opacity = 1;
  clearTimeout(showMsg.t); showMsg.t = setTimeout(() => m.style.opacity = 0, dur * 1000);
}

// Start (or restart) a hole. how: 'tee' = player and cart at the tee, 'walk' = player stays where he is.
function startHole(tee = game.tee, how = 'tee') {
  if (!PLAYERS.length) game.tee = tee;                 // with players, each one has their own tee (p.tee)
  placePin();
  randomWind();
  if (game.mode === 'cart' && how === 'tee') exitCart();
  if (['aim', 'charge', 'down', 'flight', 'result', 'holed', 'penalty'].includes(game.mode)) game.mode = 'walk';
  game.shot = null; game.penalty = null;
  if (PLAYERS.length) playersStartHole(how);            // every player: ball on their tee, positions, carts, honour
  else { const t0 = COURSE.teeSpots[game.tee] || Object.values(COURSE.teeSpots)[0]; game.ball.set(t0.x, 0, -t0.s); game.ballOnTee = true; game.strokes = 0; game.prev = null; }
  const ts = COURSE.teeSpots[game.tee] || Object.values(COURSE.teeSpots)[0];
  placeBallMesh();
  camSnap = true;
  if (game.mode !== 'cart') { game.mode = 'walk'; pose.mode = 'walk'; golfer.root.visible = true; }
  game.stamina = 1; game.exhausted = false;
  trailReset();
  buildMapBase();
  ui.hideCard();
  updateHUD();
  ui.holeBanner(ts.len);
}
// After holing out: go to the next hole – either jump to its tee or walk / drive there yourself.
function goToHole(no, how = 'tee') {
  setHole(no);
  startHole(game.tee, how);
  if (how === 'walk') showMsg(`Hole ${no}<small>Make your way to the ${game.tee} tee – follow the beacon</small>`, 3.5);
}
function placeBallMesh() {
  if (PLAYERS.length) { refreshBalls(); return; }
  const h = Hw(game.ball.x, game.ball.z);
  game.ball.y = h + BR + (game.ballOnTee ? 0.025 : 0);
  ballMesh.position.copy(game.ball);
  teePeg.visible = game.ballOnTee;
  teePeg.position.set(game.ball.x, h + 0.01, game.ball.z);
}

function enterAim() {
  game.mode = 'aim'; pose.mode = 'swing'; pose.theta = 0; pose.cock = 0; pose.look = null; pose.lookK = 0;
  game.aimYaw = yawTo(game.ball.x, game.ball.z, pin.x, pin.z);
  const lie = game.ballOnTee ? S_TEE : lieAt(game.ball.x, game.ball.z);
  game.club = game.recClub = autoClub(lie);
  // long shot: default aim at the middle of the fairway at the club's carry distance
  const dPin = distToPin(game.ball.x, game.ball.z), carry = CARRY[game.club] * SURF[lie].spd;
  if (!CLUBS[game.club].putter && dPin > carry * 1.1) {
    const [ax, as] = aimAlongHole(game.ball.x, -game.ball.z, carry * 0.97);
    game.aimYaw = yawTo(game.ball.x, game.ball.z, ax, -as);
  }
  positionGolferAtBall();
  if (camera.position.distanceTo(game.ball) > 20) camSnap = true;
  game.aimT0 = performance.now();
  lockPointer();      // hides the cursor; a dot marks the screen centre while addressing the ball
  updateHUD();
}
function exitAim() {
  game.mode = 'walk'; pose.mode = 'walk';
  // step back a little
  game.player.set(golfer.root.position.x, 0, golfer.root.position.z);
  game.yaw = game.aimYaw;
  if (document.pointerLockElement) document.exitPointerLock();
  updateHUD();
}
function autoClub(lie) {
  const d = distToPin(game.ball.x, game.ball.z);
  if (lie === S_GREEN || (lie === S_FRINGE && d < 15)) return PUTTER;
  if (d < 12 && lie !== S_BUNKER && lie !== S_ROUGH && lie !== S_DEEP) return PUTTER;
  let best = CLUBS.length - 2;
  for (let i = 0; i < CLUBS.length - 1; i++) {
    if (i === 0 && lie !== S_TEE) continue;
    if (CARRY[i] * SURF[lie].spd <= d + 6) { best = i; break; }
  }
  if (lie === S_BUNKER && best > 8) best = 11;
  return best;
}
function aimDir() { return { x: -Math.sin(game.aimYaw), z: -Math.cos(game.aimYaw) }; }
function positionGolferAtBall() {
  const t = aimDir(), f = { x: -t.z, z: t.x }; // golfer faces f, target on his left
  const bl = clubSetup[game.club].ballLocal;
  // golfer-local +X = target (left), +Z = facing
  const gx = game.ball.x - t.x * bl.x - f.x * bl.z, gz = game.ball.z - t.z * bl.x - f.z * bl.z;
  golfer.root.position.set(gx, Hw(gx, gz), gz);
  golfer.root.rotation.set(0, Math.atan2(f.x, f.z), 0);
}

function startCharge() { if (game.mode !== 'aim') return; game.mode = 'charge'; game.chargeT = 0; game.power = 0; }
function releaseCharge() {
  if (game.mode !== 'charge') return;
  if (game.power < 0.02) { game.mode = 'aim'; pose.theta = 0; pose.cock = 0; game.power = 0; if (document.pointerLockElement) document.exitPointerLock(); return; } // no pull = no shot
  game.mode = 'down'; game.swingT = 0; game.swingFrom = { theta: pose.theta, cock: pose.cock };
}
function launch() {
  const lie = game.ballOnTee ? S_TEE : lieAt(game.ball.x, game.ball.z);
  if (!game.practice) game.strokes++;
  game.prev = { x: game.ball.x, z: game.ball.z, onTee: game.ballOnTee };
  if (lie === S_BUNKER) { // feet dug in, and the club blasts the sand out under the ball
    sandStance();
    const t = aimDir(); addSandDecal('blasts', game.ball.x + t.x * 0.08, game.ball.z + t.z * 0.08, game.aimYaw + Math.PI / 2, 0.6 + 0.6 * game.power);
  }
  const st = launchState(game.ball, game.club, Math.max(0.02, game.power), game.aimYaw, lie, true);
  const P = game.practice ? null : activePlayer();
  if (P) {
    if (CLUBS[game.club].putter) { P.stats.putts++; P.stats.holePutts++; }
    st.drive = !game.practice && game.prev.onTee && COURSE.par >= 4 && !CLUBS[game.club].putter;   // tee shot on a par 4/5: counts for drives & fairways
  }
  game.shot = st; game.ballOnTee = false;
  if (game.practice) practiceLaunched(); else teePeg.visible = game.prev.onTee;
  game.mode = 'flight'; game.flightCam = null;
  BALLCAM.active = !CLUBS[game.club].putter; BALLCAM.snap = true; BALLCAM.from.set(st.x, 0, st.z);
  trailReset(); trailPush(st.x, st.y, st.z);
  sfx.hit(game.power, CLUBS[game.club].putter);
  if (document.pointerLockElement) document.exitPointerLock();
  updateHUD();
}

function shotFinished(ev) {
  if (game.practice) return practiceFinished(ev);     // driving range (js/range.js)
  const st = game.shot;
  const from = st.start;
  let title = '', sub = '';
  const lieName = s => SURF[s].name;
  if (ev.type === 'holed') {
    game.ball.set(pin.x, Hw(pin.x, pin.z) - 0.08, pin.z); ballMesh.position.copy(game.ball);
    sfx.cup(); setTimeout(() => sfx.cheer(), 300);
    game.mode = 'holed'; finishHole(); return;
  }
  if ((ev.type === 'water' || ev.type === 'ob') && st.drive && activePlayer()) activePlayer().stats.fwTries++;
  if (ev.type === 'water') {
    sfx.splash();
    spawnSplash(st.x, st.z, Math.hypot(st.vx, st.vy, st.vz));
    ballMesh.position.y -= 0.3;
    game.mode = 'penalty'; game.penalty = { kind: 'water', cross: { ...st.lastDry }, at: { x: st.x, z: st.z } };
    showMsg('Splash!<small>Penalty area – choose your relief</small>', 2);
    setTimeout(() => ui.penalty(game.penalty), 900); updateHUD(); return;
  } else if (ev.type === 'ob' || isOB(st.x, -st.z)) {
    game.mode = 'penalty'; game.penalty = { kind: 'ob', cross: { ...st.lastIn }, at: { x: st.x, z: st.z } };
    showMsg('Out of bounds<small>choose how to continue</small>', 2);
    setTimeout(() => ui.penalty(game.penalty), 900); updateHUD(); return;
  } else {
    game.ball.set(st.x, 0, st.z); placeBallMesh();
    const total = Math.hypot(st.x - from.x, st.z - from.z);
    const lie = lieAt(st.x, st.z);
    const P = activePlayer();
    if (P && st.drive) { P.stats.fwTries++; if (lie === S_FAIR) P.stats.fwHit++; P.stats.longest = Math.max(P.stats.longest, total); }
    if (CLUBS[game.club].putter) { title = lie === S_GREEN ? `${fmt(distToPin(st.x, st.z))} left` : lieName(lie); sub = `Putt rolled ${fmt(total)}`; }
    else {
      const carry = st.carry ? Math.hypot(st.carry.x - from.x, st.carry.z - from.z) : total;
      title = lieName(lie); sub = `Carry ${fmt(carry)} · Total ${fmt(total)} · ${fmt(distToPin(st.x, st.z))} to the pin`;
    }
  }
  game.mode = 'result'; game.resultT = 0;
  showMsg(`${title}<small>${sub}</small>`, 3);
  updateHUD();
}
/* ---------- Rules of Golf relief (Rule 17 penalty areas, Rule 18.2 out of bounds, Model Local Rule E-5) ---------- */
const CLUB_LENGTH = 1.14;                         // longest club in the bag except the putter (driver)
function reliefSpotOK(x, s) {
  const k = cell(x, s);
  return k >= 0 && waterDist(x, s) > 1.0 && !isOB(x, s) && !buildingAt(x, s) && CLS[k] !== S_GREEN && !walkBlockedByTree(x, -s);
}
const LIE_PREF = { [S_FAIR]: 5, [S_FRINGE]: 4, [S_SEMI]: 4, [S_TEE]: 3, [S_ROUGH]: 2, [S_PATH]: 1, [S_ROAD]: 1, [S_DEEP]: 1, [S_FOREST]: 0, [S_BUNKER]: 0, [S_RANGE]: 0 };
function reliefOptions(p) {
  const pinS = -pin.z, cx = p.cross.x, cs = -p.cross.z, dCross = Math.hypot(cx - pin.x, cs - pinS), opts = {};
  opts.sd = { x: game.prev.x, z: game.prev.z, onTee: game.prev.onTee, strokes: 1 };
  if (p.kind === 'water') {
    // back-on-the-line: keep the crossing point between the hole and the drop, any distance back
    let ux = cx - pin.x, us = cs - pinS; const ul = Math.hypot(ux, us) || 1; ux /= ul; us /= ul;
    for (let d = 1; d < 120; d += 0.5) { const x = cx + ux * d, s = cs + us * d; if (reliefSpotOK(x, s)) { opts.line = { x, z: -s, strokes: 1 }; break; } }
    // lateral (red penalty area): within two club-lengths of the crossing point, not nearer the hole – pick the best lie
    let best = null, bv = -1e9; const R = 2 * CLUB_LENGTH;
    for (let a = -R; a <= R; a += 0.2) for (let b = -R; b <= R; b += 0.2) {
      if (a * a + b * b > R * R) continue;
      const x = cx + a, s = cs + b;
      if (Math.hypot(x - pin.x, s - pinS) < dCross || !reliefSpotOK(x, s)) continue;
      const v = (LIE_PREF[CLS[cell(x, s)]] ?? 1) * 10 - Math.hypot(a, b);
      if (v > bv) { bv = v; best = { x, z: -s, strokes: 1 }; }
    }
    if (best) opts.lateral = best;
  } else {
    // Model Local Rule E-5: 2 strokes; drop near the fairway reference point (fairway spot as far from the hole as where the ball went out)
    const D = Math.hypot(cx - pin.x, cs - pinS); let best = null, bd = 1e9;
    for (let r = D; r < D + 40 && !best; r += 2) for (let a = 0; a < 6.283; a += 0.004) {
      const x = pin.x + Math.cos(a) * r, s = pinS + Math.sin(a) * r, k = cell(x, s);
      if (k < 0 || CLS[k] !== S_FAIR || !reliefSpotOK(x, s)) continue;
      const d = Math.hypot(x - cx, s - cs); if (d < bd) { bd = d; best = { x, z: -s, strokes: 2 }; }
    }
    if (best && bd < 120) opts.e5 = best;
  }
  return opts;
}
function takeRelief(o, label) {
  game.strokes += o.strokes;
  if (activePlayer()) activePlayer().stats.penalties += o.strokes;
  game.ball.set(o.x, 0, o.z); game.ballOnTee = !!o.onTee; placeBallMesh();
  game.penalty = null; ui.hideCard();
  game.mode = 'walk'; pose.mode = 'walk';
  game.player.set(golfer.root.position.x, 0, golfer.root.position.z);
  game.yaw = yawTo(game.player.x, game.player.z, game.ball.x, game.ball.z); camSnap = true;
  trail.material.opacity = 0.35;
  showMsg(`${label}<small>${o.strokes} penalty stroke${o.strokes > 1 ? 's' : ''} · you play your ${ordinal(game.strokes + 1)} shot</small>`, 3);
  updateHUD();
}
function ordinal(n) { return n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'); }

function finishHole() {
  const par = COURSE.par, d = game.strokes - par;
  const names = { '-3': 'Albatross!', '-2': 'Eagle!', '-1': 'Birdie!', '0': 'Par', '1': 'Bogey', '2': 'Double Bogey', '3': 'Triple Bogey' };
  const name = game.strokes === 1 ? 'HOLE IN ONE!' : (names[d] || (d > 0 ? `+${d}` : `${d}`));
  game.scores[COURSE.number] = game.strokes;
  const P = activePlayer();
  if (!P || !multi()) {
    if (P) P.holed = true;
    showMsg(`In the hole!<small>${name}</small>`, 3);
    setTimeout(() => ui.holeOut(name), 2400);
    updateHUD(); return;
  }
  P.holed = true; P.lastName = name;
  game.player.set(golfer.root.position.x, 0, golfer.root.position.z); game.yaw = game.aimYaw;
  showMsg(`<span style="color:${P.col.css}">●</span> ${P.name} – in the hole!<small>${name} · ${game.strokes} stroke${game.strokes > 1 ? 's' : ''}</small>`, 3);
  updateHUD();
  const next = nextToPlay();
  setTimeout(() => {
    if (next) { game.mode = 'walk'; pose.mode = 'walk'; switchPlayer(next.i, true); }
    else ui.holeOut(name);
  }, 2600);
}
function nextHoleNo() { return nextHoleOf(COURSE.number); }

/* =====================================================================
   HUD
   ===================================================================== */
function updateHUD() { ui.update(); updateAimCursor(); }
function slopeInfo() {
  const b = game.ball, d = distToPin(b.x, b.z);
  if (d < 0.5) return '';
  const dh = Hw(pin.x, pin.z) - Hw(b.x, b.z);
  const pct = dh / d * 100;
  // lateral slope at the midpoint (positive = breaks right)
  const mx = (b.x + pin.x) / 2, mz = (b.z + pin.z) / 2, ty = yawTo(b.x, b.z, pin.x, pin.z);
  const rx = Math.cos(ty), rz = -Math.sin(ty); // right vector
  const lat = (Hw(mx - rx * 0.5, mz - rz * 0.5) - Hw(mx + rx * 0.5, mz + rz * 0.5)) * 100;
  return `${Math.abs(pct).toFixed(1)}% ${pct >= 0 ? 'uphill' : 'downhill'}, breaks ${lat > 0.15 ? 'right' : lat < -0.15 ? 'left' : 'straight'}${Math.abs(lat) > 0.15 ? ' (' + Math.abs(lat).toFixed(1) + '%)' : ''}`;
}
function updateWindHUD() {
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
  const camYaw = Math.atan2(-fwd.x, -fwd.z), windYaw = Math.atan2(-wind.x, -wind.z);
  $('windG').setAttribute('transform', `rotate(${(-(windYaw - camYaw) * 180 / Math.PI).toFixed(1)})`);
  $('windSpd').textContent = Math.hypot(wind.x, wind.z).toFixed(1);
  $('windDir').textContent = compassName(Math.atan2(wind.x, -wind.z));
}

/* ---------- minimap (rotated so the current hole runs up the map) ---------- */
const mapC = $('map'), mapCtx = mapC.getContext('2d');
const MAPT = { cx: 0, cs: 0, dx: 0, ds: 1, k: 1 };
let mapBase = null;
function mapP(x, s) { // course coords -> map pixels
  const u = (x - MAPT.cx) * MAPT.dx + (s - MAPT.cs) * MAPT.ds, v = (x - MAPT.cx) * MAPT.ds - (s - MAPT.cs) * MAPT.dx;
  return [mapC.width / 2 + v * MAPT.k, mapC.height / 2 - u * MAPT.k];
}
function buildMapBase() {
  const t0 = COURSE.line[0], g = COURSE.green, d = COURSE.dir;
  Object.assign(MAPT, { cx: (t0[0] + g.cx) / 2, cs: (t0[1] + g.cs) / 2, dx: d[0], ds: d[1] });
  const L = Math.hypot(g.cx - t0[0], g.cs - t0[1]) + 70;
  let wmax = 0; for (const p of COURSE.line) wmax = Math.max(wmax, Math.abs((p[0] - MAPT.cx) * d[1] - (p[1] - MAPT.cs) * d[0]));
  MAPT.k = Math.min(mapC.height / L, mapC.width / (2 * wmax + 70));
  mapBase = mapBase || document.createElement('canvas'); mapBase.width = mapC.width; mapBase.height = mapC.height;
  const ctx = mapBase.getContext('2d');
  ctx.fillStyle = '#2f4f1c'; ctx.fillRect(0, 0, mapBase.width, mapBase.height);
  // texture pixel (px, py) -> course (x, s) -> map
  const k = MAPT.k, a = k * RES * d[1], b = -k * RES * d[0], c = -k * RES * (-d[0]), dd = -k * RES * d[1];
  const [ox, oy] = mapP(X0, S1);
  ctx.setTransform(k * RES * d[1], -k * RES * d[0], k * RES * d[0], k * RES * d[1], ox, oy);
  ctx.drawImage(texCanvas, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const polys = (list, fill) => { ctx.fillStyle = fill; for (const f of list) { ctx.beginPath(); f.pts.forEach(([x, s], i) => { const [X, Y] = mapP(x, s); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.closePath(); ctx.fill(); } };
  polys(FEAT.fairways, 'rgb(108,158,54)'); polys(FEAT.tees, 'rgb(124,180,66)'); polys(FEAT.greens, 'rgb(130,196,80)'); polys(FEAT.bunkers, 'rgb(228,214,176)');
  ctx.strokeStyle = 'rgba(200,190,160,.8)'; ctx.lineWidth = Math.max(1, k * 1.8);
  for (const f of FEAT.paths) { ctx.beginPath(); f.pts.forEach(([x, s], i) => { const [X, Y] = mapP(x, s); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke(); }
  ctx.fillStyle = 'rgba(40,110,190,.9)';
  for (let s = S0; s < S1; s += 1.5) for (let x = X0; x < X1; x += 1.5) { const [X, Y] = mapP(x, s); if (X < -3 || Y < -3 || X > mapC.width + 3 || Y > mapC.height + 3) continue; if (waterDist(x, s) < 0) ctx.fillRect(X - 1, Y - 1, 1.5 * k + 1, 1.5 * k + 1); }
  ctx.fillStyle = 'rgba(20,55,20,.8)';
  for (const t of trees) { const [X, Y] = mapP(t.x, -t.z); if (X < -10 || Y < -10 || X > mapC.width + 10 || Y > mapC.height + 10) continue; ctx.beginPath(); ctx.arc(X, Y, Math.max(1, t.cr * k * 0.8), 0, 7); ctx.fill(); }
  ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.beginPath();
  for (const f of FEAT.course) f.pts.forEach(([x, s], i) => { const [X, Y] = mapP(x, s); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
  ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5; ctx.beginPath();     // line of play
  COURSE.line.forEach(([x, s], i) => { const [X, Y] = mapP(x, s); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke();
}
function drawMap() {
  const ctx = mapCtx;
  const P = (x, z) => mapP(x, -z);
  ctx.drawImage(mapBase, 0, 0);
  const [px, py] = P(pin.x, pin.z);
  ctx.fillStyle = '#fff'; ctx.fillRect(px - 1, py - 14, 2, 14);
  ctx.fillStyle = '#' + PIN_COL[pin.pos].toString(16).padStart(6, '0'); ctx.beginPath(); ctx.moveTo(px + 1, py - 14); ctx.lineTo(px + 10, py - 11); ctx.lineTo(px + 1, py - 8); ctx.fill();
  if (game.mode === 'aim' || game.mode === 'charge') {
    const pr = game.pred; if (pr) { const [bx, by] = P(game.ball.x, game.ball.z), [lx, ly] = P(pr.x, pr.z); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(lx, ly); ctx.stroke(); ctx.beginPath(); ctx.arc(lx, ly, 4, 0, 7); ctx.stroke(); }
  }
  if (game.shot && game.mode === 'flight') { const [x, y] = P(game.shot.x, game.shot.z); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); }
  const rot = Math.atan2(MAPT.dx, MAPT.ds);   // map "up" heading
  // carts (with their numbers)
  for (const c of CARTS) {
    const [x, y] = P(c.x, c.z); if (x < -10 || y < -10 || x > mapC.width + 10 || y > mapC.height + 10) continue;
    ctx.save(); ctx.translate(x, y); ctx.rotate(-c.yaw - rot); ctx.fillStyle = '#d52b1e'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.fillRect(-3.5, -5.5, 7, 11); ctx.strokeRect(-3.5, -5.5, 7, 11); ctx.restore();
    if (CARTS.length > 1) { ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(c.num), x, y + 3); }
  }
  const list = PLAYERS.length ? PLAYERS : null;
  // balls: white with the player's colour as ring
  for (const p of (list || [null])) {
    const active = !p || p.i === CUR, b = p ? p.ball : game.ball, onTee = active ? game.ballOnTee : p.ballOnTee;
    if (p && (p.holed || (!active && onTee))) continue;
    const [bx, by] = P(b.x, b.z);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = p ? p.col.css : '#000'; ctx.lineWidth = active ? 2 : 1.5; ctx.beginPath(); ctx.arc(bx, by, active ? 3.4 : 2.8, 0, 7); ctx.fill(); ctx.stroke();
  }
  // golfers: arrows in their colours (players sitting in a cart are shown by the cart)
  for (const p of (list || [null])) {
    const active = !p || p.i === CUR;
    if (p ? p.inCart && !active : false) continue;
    if (active && game.mode === 'cart') continue;
    const fig = p ? p.fig : golfer, gp = fig.root.position, [gx, gy] = P(gp.x, gp.z), yaw = fig.root.rotation.y;
    ctx.save(); ctx.translate(gx, gy); ctx.rotate(-yaw + Math.PI - rot);
    ctx.globalAlpha = active ? 1 : 0.8;
    ctx.fillStyle = p ? p.col.css : '#e53935'; ctx.beginPath(); ctx.moveTo(0, active ? -7 : -5.5); ctx.lineTo(active ? 5 : 4, active ? 5 : 4); ctx.lineTo(active ? -5 : -4, active ? 5 : 4); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore();
  }
}

/* =====================================================================
   Input
   ===================================================================== */
addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat && !e.code.startsWith('Arrow')) return;
  keys[e.code] = true;
  if (e.code === 'Space' && game.mode === 'walk' && !nearBall()) runArmed = true;
  if (uiKey(e)) return;
  if (game.mode === 'intro') return;
  if (e.code === 'KeyR' && !game.practice && !['flight', 'down'].includes(game.mode)) { ui.confirmRestart(); return; }
  if (e.code === 'KeyG' && !e.repeat && !['intro', 'penalty', 'holed'].includes(game.mode)) toggleGreenRead();
  if (e.code === 'KeyM') { game.mapBig = !game.mapBig; $('mapWrap').classList.toggle('big', game.mapBig); }
  if (e.code === 'KeyN') sfx.setMuted(!sfx.muted);
  if (e.code === 'Space') {
    if (game.mode === 'walk' && nearBall()) { if (game.carry) showMsg('Put the balls down first<small>press E</small>', 1.6); else enterAim(); }
    else if (game.mode === 'walk' && typeof nearRangeBall === 'function' && nearRangeBall() >= 0) startRangePractice(nearRangeBall());
    else if (game.mode === 'walk' && typeof nearPuttBall === 'function' && nearPuttBall()) startPuttPractice();
    else if (game.mode === 'walk' && nearOtherBall()) { const o = nearOtherBall(); showMsg(`This is not your ball<small>it belongs to <span style="color:${o.col.css}">${o.name}</span></small>`, 1.8); }
    else if (game.mode === 'aim') { exitAim(); if (game.practice) cancelPractice(); }
  }
  if (e.code === 'KeyE') {
    if (game.mode === 'walk' && typeof practiceInteract === 'function' && practiceInteract()) { }   // balls: machine, tee, putting green, put down
    else if (game.mode === 'walk' && nearCart()) enterCart();
    else if (game.mode === 'walk' && nearOtherCart()) showMsg(`That's cart ${nearOtherCart().num}<small>your clubs are on cart ${CART.num}</small>`, 1.8);
    else if (game.mode === 'cart') exitCart();
  }
  { const m = /^Digit([1-4])$/.exec(e.code); if (m && PLAYERS.length > 1) switchPlayer(+m[1] - 1); }
  if (e.code === 'KeyV' && game.mode === 'cart') { CART.view = CART.view === 'first' ? 'third' : 'first'; CART.look = 0; CART.lookPitch = 0; camSnap = true; }
  if (e.code === 'KeyC' && game.mode === 'cart') { CART.look = 0; CART.lookPitch = 0; } // look straight ahead again
  if (game.mode === 'aim' && !e.repeat) {
    if (e.code === 'ArrowUp') changeClub(-1);
    if (e.code === 'ArrowDown') changeClub(1);
    if (e.code === 'KeyB') ui.toggleBag();
  }
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Space') runArmed = false; });
// running needs Space pressed while walking (a Space still held from addressing the ball doesn't count)
let runArmed = false;
function runKeyHeld() { return runArmed && keys.Space; }
addEventListener('blur', () => { for (const k in keys) keys[k] = false; runArmed = false; });
document.addEventListener('visibilitychange', () => { for (const k in keys) keys[k] = false; runArmed = false; });
function changeClub(d) { selectClub(clamp(game.club + d, 0, CLUBS.length - 1)); }
function selectClub(i) { game.club = i; positionGolferAtBall(); updateHUD(); }
const ADDRESS_R = 1.3;      // Space takes the stance only right at the ball (Space also runs)
function nearBall() { return Math.hypot(game.player.x - game.ball.x, game.player.z - game.ball.z) < ADDRESS_R; }
function nearOtherBall() { return PLAYERS.find(p => p.i !== CUR && !p.holed && !p.ballOnTee && Math.hypot(game.player.x - p.ball.x, game.player.z - p.ball.z) < ADDRESS_R) || null; }
canvas.addEventListener('mousemove', e => {
  if (game.mode === 'cart') { cartMouseLook(e); return; } // head follows the mouse, all the way round
  if (performance.now() - game.aimT0 < 250 || Math.abs(e.movementX) > 120 || Math.abs(e.movementY) > 120) return; // ignore pointer-lock jumps
  if (game.mode === 'charge') { // pool-cue style: pull the mouse back (down) for more power, push up for less
    const pull = CLUBS[game.club].putter ? 420 : 320; // pixels for 0 → 100 %
    game.power = clamp(game.power + e.movementY / pull, 0, 1);
    return;
  }
  if (game.mode === 'aim') {
    const sens = CLUBS[game.club].putter ? 0.0012 : 0.0025;
    game.aimYaw -= e.movementX * sens;
    positionGolferAtBall();
  }
});
canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return; sfx.init();
  if (game.mode === 'cart') { canvas.style.cursor = 'grabbing'; return; }   // drag to look around
  if (game.mode !== 'aim') return;
  if (!document.pointerLockElement) { lockPointer(); ui.closeBag(); return; }   // first click only grabs the mouse again
  startCharge();
});
function lockPointer() { if (document.pointerLockElement) return; try { const r = canvas.requestPointerLock?.(); r?.catch?.(() => { }); } catch (er) { } }
function updateAimCursor() {
  const aiming = ['aim', 'charge', 'down'].includes(game.mode);
  document.body.classList.toggle('aim-locked', aiming && document.pointerLockElement === canvas);
  document.body.classList.toggle('aim-free', aiming && document.pointerLockElement !== canvas);
}
document.addEventListener('pointerlockchange', () => { game.aimT0 = performance.now(); updateAimCursor(); });
addEventListener('mouseup', e => { if (e.button === 0) { releaseCharge(); canvas.style.cursor = ''; } });
canvas.addEventListener('wheel', e => { if (game.mode === 'aim') { changeClub(e.deltaY > 0 ? 1 : -1); e.preventDefault(); } }, { passive: false });
$('mapWrap').addEventListener('click', () => { game.mapBig = !game.mapBig; $('mapWrap').classList.toggle('big', game.mapBig); });
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

/* =====================================================================
   Update loop
   ===================================================================== */
let camSnap = true;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function setCam(pos, look, k) {
  if (camSnap) { camPos.copy(pos); camLook.copy(look); camSnap = false; }
  else { camPos.lerp(pos, k); camLook.lerp(look, k); }
  const gh = Hw(camPos.x, camPos.z) + 0.6; if (camPos.y < gh) camPos.y = gh;
  camera.position.copy(camPos); camera.lookAt(camLook);
}

function updateWalk(dt) {
  // running (hold Space) costs stamina; when exhausted you have to recover before running again
  const wantsRun = runKeyHeld() && keys.ArrowUp && !nearBall();
  const run = wantsRun && !game.exhausted && game.stamina > 0;
  if (run) { game.stamina -= dt / 7; if (game.stamina <= 0) { game.stamina = 0; game.exhausted = true; showMsg('Out of breath!<small>Walk a bit to recover</small>', 1.6); } }
  else game.stamina = Math.min(1, game.stamina + dt / (keys.ArrowUp || keys.ArrowDown ? 12 : 5));
  if (game.exhausted && game.stamina >= 0.35) game.exhausted = false;
  const turn = (keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0);
  const mv = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 0.6 : 0);
  game.yaw += turn * dt * (run ? 2.0 : 1.7);
  const speed = mv * (run ? 5.2 : game.exhausted ? 1.15 : 1.45);
  game.running = run && Math.abs(mv) > 0;
  if (Math.abs(speed) > 0.01) {
    const fx = -Math.sin(game.yaw), fz = -Math.cos(game.yaw);
    const nx = game.player.x + fx * speed * dt, nz = game.player.z + fz * speed * dt;
    const s = -nz;
    const ok = (sw) => (sw.water ? onBridge(sw.x, -sw.z) : true);
    const tryMove = (x, z) => {
      if (x < X0 + 3 || x > X1 - 3 || -z < S0 + 3 || -z > S1 - 3) return false;
      if (Sw(x, z) === S_WATER && !onBridge(x, -z)) return false;
      if (walkBlockedByTree(x, z) || buildingAt(x, -z)) return false;
      if (typeof solidAt === 'function' && solidAt(x, z, 0.3)) return false;            // walls, hedges, tables, nets
      if (bodyBlocked(x, z, game.player.x, game.player.z)) return false;   // other players and the carts
      return true;
    };
    if (tryMove(nx, nz)) { game.player.x = nx; game.player.z = nz; }
    else if (tryMove(nx, game.player.z)) game.player.x = nx;
    else if (tryMove(game.player.x, nz)) game.player.z = nz;
    pose.phase += dt * Math.abs(speed) * (run ? 3.1 : 5.2);   // ~0.6 m steps walking, ~1 m running
    sandFootsteps(run);
  } else pose.phase *= 0.9;
  pose.speed = Math.abs(speed);
  let gy = Hw(game.player.x, game.player.z);
  const br = onBridge(game.player.x, -game.player.z); if (br) gy = Math.max(gy, br.h);
  golfer.root.position.set(game.player.x, gy, game.player.z);
  golfer.root.rotation.set(0, game.yaw + Math.PI, 0);
  // camera behind the player
  const fx = -Math.sin(game.yaw), fz = -Math.cos(game.yaw);
  const cp = new THREE.Vector3(game.player.x - fx * 5.2, gy + 2.5, game.player.z - fz * 5.2);
  const lk = new THREE.Vector3(game.player.x + fx * 6, gy + 1.2, game.player.z + fz * 6);
  setCam(cp, lk, 1 - Math.exp(-dt * 5));
  // prompt
  const d = Math.hypot(game.player.x - game.ball.x, game.player.z - game.ball.z);
  const pr = $('prompt');
  pr.style.display = 'block';
  const gHint = greenReadAvailable() ? ` · <b>G</b> ${GREENREAD.on ? 'hide' : 'read'} the green` : '';
  const ph = typeof practiceHint === 'function' ? practiceHint() : null;
  pr.innerHTML = ph ? ph : nearBall() ? '<b>Space</b> – address the ball' + gHint
    : nearCart() ? `<b>E</b> – hop on the golf cart &nbsp;·&nbsp; ball: <b>${fmt(d)}</b>`
    : `${game.ballOnTee ? `Hole ${COURSE.number} tee` : 'Your ball'}: <b>${fmt(d)}</b> &nbsp;·&nbsp; ↑↓←→ walk · hold Space to run${gHint}${game.running ? ' · <b style="color:#7fd3ff">running</b>' : ''}${game.carry ? ` · <b>E</b> put down the ${game.carry.n > 1 ? 'balls' : 'ball'}` : ''}`;
  const sb = $('stamina'); sb.style.display = game.stamina < 1 || run ? 'block' : 'none';
  $('stamFill').style.width = (game.stamina * 100).toFixed(1) + '%';
  $('stamFill').style.background = game.exhausted ? '#e53935' : game.stamina < 0.3 ? '#fb8c00' : '#4fc3f7';
}

function updateAim(dt) {
  const fine = keys.ShiftLeft || keys.ShiftRight ? 0.12 : 0.5;
  const turn = (keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0);
  if (turn) { game.aimYaw += turn * dt * fine * (CLUBS[game.club].putter ? 0.4 : 1); positionGolferAtBall(); }
  const t = aimDir(), b = game.ball;
  const lie = game.ballOnTee ? S_TEE : lieAt(b.x, b.z);
  const putter = CLUBS[game.club].putter;
  const full = predict(b, game.club, 1, game.aimYaw, lie);
  game.pred = full;
  const back = putter ? 3.0 : 4.6, hgt = putter ? 1.3 : 1.9;
  const f = { x: -t.z, z: t.x };
  const cp = new THREE.Vector3(b.x - t.x * back + f.x * 0.5, b.y + hgt, b.z - t.z * back + f.z * 0.5);
  const lookD = putter ? Math.min(8, distToPin(b.x, b.z) + 1) : 35;
  const lk = new THREE.Vector3(b.x + t.x * lookD, Hw(b.x + t.x * lookD, b.z + t.z * lookD) + (putter ? 0 : 0.6), b.z + t.z * lookD);
  setCam(cp, lk, 1 - Math.exp(-dt * 8));
  // markers
  const showRing = (m, p, scaleBase) => {
    const y = Hw(p.x, p.z); m.visible = true; m.position.set(p.x, y + 0.06, p.z);
    const d = camera.position.distanceTo(m.position); m.scale.setScalar(Math.max(scaleBase, d / 45));
  };
  if (!putter) showRing(aimRing, full, 1); else aimRing.visible = false;
  if (game.mode === 'charge') {
    const cur = predict(b, game.club, Math.max(0.02, game.power), game.aimYaw, lie);
    showRing(powRing, cur, putter ? 0.12 : 0.6);
    game.predCur = cur;
  } else { powRing.visible = false; game.predCur = null; }
  ui.gauge(full, lie);
  // aim line hugging the ground
  const len = putter ? Math.max(2, Math.min(distToPin(b.x, b.z) + 1.5, 25)) : full.carry;
  const a = aimLine.geometry.attributes.position;
  for (let i = 0; i < AIM_N; i++) {
    const k = i / (AIM_N - 1) * len, x = b.x + t.x * k, z = b.z + t.z * k;
    a.setXYZ(i, x, Hw(x, z) + (putter ? 0.02 : 0.15), z);
  }
  a.needsUpdate = true; aimLine.visible = true;
  aimLine.material.opacity = putter ? 0.75 : 0.45;
}

function updateCharge(dt) {
  game.chargeT += dt;
  // keyboard alternative while the button is held: ↓ more power, ↑ less
  if (keys.ArrowDown) game.power = Math.min(1, game.power + dt * 0.6);
  if (keys.ArrowUp) game.power = Math.max(0, game.power - dt * 0.6);
  const putter = CLUBS[game.club].putter;
  pose.theta = putter ? -0.08 - 0.5 * game.power : -0.25 - 2.35 * game.power;
  pose.cock = putter ? 0 : -1.25 * smoothstep(0.1, 0.8, game.power);
}

function updateDown(dt) {
  const putter = CLUBS[game.club].putter;
  const T = putter ? 0.32 : 0.22;
  game.swingT += dt;
  const k = Math.min(1, game.swingT / T), e = k * k;
  pose.theta = lerp(game.swingFrom.theta, 0, e);
  pose.cock = lerp(game.swingFrom.cock, 0, Math.pow(k, 3));
  if (k >= 1) { launch(); game.followT = 0; }
}
function updateFollow(dt) {
  if (game.followT === undefined || pose.mode !== 'swing') return;
  const putter = CLUBS[game.club].putter;
  game.followT += dt;
  const k = Math.min(1, game.followT / (putter ? 0.4 : 0.5)), e = 1 - (1 - k) * (1 - k);
  const end = putter ? 0.1 + 0.5 * game.power : 0.4 + 2.0 * Math.max(0.35, game.power);
  pose.theta = lerp(0, end, e);
  pose.cock = putter ? 0 : lerp(0, 1.0, e);
}

function updateFlight(dt) {
  const st = game.shot;
  let steps = Math.round(dt / DT);
  if (st.mode === 'roll' && keys.Space) steps *= 3; // hold space to fast-forward rolling
  for (let i = 0; i < steps; i++) {
    const ev = physStep(st, wind, game.practice && game.practice.kind === 'putt' ? practiceCup(st) : pin, trees);
    if (ev) {
      if (ev.type === 'bounce') {
        if (ev.speed > 2) sfx.thud(ev.speed);
        if (ev.surf === S_BUNKER && ev.speed > 1.5 && !st.pitted) { st.pitted = true; addSandDecal('pits', st.x, st.z, Math.random() * 6.28, clamp(ev.speed / 9, 0.7, 1.5)); }
        continue;
      }
      if (ev.type === 'lip') { sfx.thock(); continue; }
      ballMesh.position.set(st.x, st.y, st.z);
      shotFinished(ev); return;
    }
    if (i % 4 === 0 && st.mode === 'flight') trailPush(st.x, st.y, st.z);
  }
  ballMesh.position.set(st.x, st.y, st.z);
  pose.look = pose.look || new THREE.Vector3(); pose.look.set(st.x, st.y, st.z); pose.lookK = Math.min(1, (pose.lookK || 0) + dt * 1.6);   // the golfer turns his head after the ball
  // a ball caught in a net / stuck on something: if it hardly moves in the air for a while, call it at rest
  const vAll = Math.hypot(st.vx, st.vy, st.vz);
  st.slowT = st.mode === 'flight' && vAll < 2 ? (st.slowT || 0) + dt : 0;
  if (st.slowT > 1.2 || st.t > 40) { st.vx = st.vy = st.vz = 0; st.y = Hw(st.x, st.z) + BR; ballMesh.position.set(st.x, st.y, st.z); shotFinished({ type: 'rest' }); return; }
  // chase camera
  const vh = Math.hypot(st.vx, st.vz);
  if (!game.flightCam) game.flightCam = { dx: -Math.sin(game.aimYaw), dz: -Math.cos(game.aimYaw) };
  if (vh > 1) { game.flightCam.dx = lerp(game.flightCam.dx, st.vx / vh, dt * 2); game.flightCam.dz = lerp(game.flightCam.dz, st.vz / vh, dt * 2); }
  const putter = CLUBS[game.club].putter;
  const back = putter ? 3.5 : 13, up = putter ? 1.4 : 4.5;
  const cp = new THREE.Vector3(st.x - game.flightCam.dx * back, Math.max(st.y, Hw(st.x, st.z)) + up, st.z - game.flightCam.dz * back);
  const lk = new THREE.Vector3(st.x, st.y, st.z);
  if (BALLCAM.active) {
    // big screen stays where the shot was played and turns to watch the ball; the ball cam (inset) chases it
    camLook.lerp(lk, 1 - Math.exp(-dt * (st.t < 0.6 ? 6 : 3))); camera.lookAt(camLook);
    ballCamFollow(cp, lk, dt);
  } else setCam(cp, lk, 1 - Math.exp(-dt * 3));          // putts: the big screen follows the ball as before
  aimRing.visible = powRing.visible = aimLine.visible = false;
  $('prompt').style.display = 'none';
}

/* ---------- ball cam: TV-style inset in the lower left that chases the ball ----------
   Rendered with a second camera into a corner of the canvas. It sees layer 0 (everything shared) and layer 1
   (simple stand-in trees for every tree); the main camera sees layers 0 and 2 (detailed trees, their LOD blobs,
   grass tufts and flowers). The shadow map is not re-rendered for the inset. */
const BALLCAM = { cam: new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 16000), active: false, snap: true,
  pos: new THREE.Vector3(), look: new THREE.Vector3(), from: new THREE.Vector3(), el: null };
BALLCAM.cam.layers.set(0); BALLCAM.cam.layers.enable(1);
camera.layers.enable(2);
function ballCamFollow(pos, look, dt) {
  if (BALLCAM.snap) { BALLCAM.pos.copy(pos); BALLCAM.look.copy(look); BALLCAM.snap = false; }
  else { BALLCAM.pos.lerp(pos, 1 - Math.exp(-dt * 2.2)); BALLCAM.look.lerp(look, 1 - Math.exp(-dt * 8)); }
  const gh = Hw(BALLCAM.pos.x, BALLCAM.pos.z) + 0.8; if (BALLCAM.pos.y < gh) BALLCAM.pos.y = gh;
}
function ballCamRect() {
  const w = Math.round(clamp(innerWidth * 0.36, 260, 640)), h = Math.round(w * 9 / 16);
  return { x: 16, y: 16, w, h };       // CSS pixels from the bottom left
}
function renderBallCam() {
  const show = BALLCAM.active && (game.mode === 'flight' || game.mode === 'result' || game.mode === 'holed');
  if (!BALLCAM.el) {
    BALLCAM.el = document.createElement('div'); BALLCAM.el.id = 'ballCam';
    BALLCAM.el.innerHTML = '<span class="bc-tag">BALL CAM</span><span class="bc-dist"></span>';
    document.body.appendChild(BALLCAM.el);
  }
  BALLCAM.el.style.display = show ? 'block' : 'none';
  if (!show) return;
  const r = ballCamRect(), cam = BALLCAM.cam, st = game.shot;
  Object.assign(BALLCAM.el.style, { left: r.x + 'px', bottom: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
  const bx = game.mode === 'flight' ? st.x : ballMesh.position.x, bz = game.mode === 'flight' ? st.z : ballMesh.position.z;
  BALLCAM.el.lastChild.textContent = fmt(Math.hypot(bx - BALLCAM.from.x, bz - BALLCAM.from.z));
  cam.aspect = r.w / r.h; cam.updateProjectionMatrix();
  cam.position.copy(BALLCAM.pos); cam.lookAt(BALLCAM.look);
  // things that travel with the viewer
  const cloudAt = cloudMesh ? cloudMesh.position.clone() : null;
  if (cloudMesh) cloudMesh.position.copy(cam.position);
  const rainU = rainMesh && rainMesh.visible ? rainMesh.material.uniforms.uCam.value : null, rainAt = rainU ? rainU.clone() : null;
  if (rainU) rainU.copy(cam.position);
  const auto = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
  renderer.setScissorTest(true); renderer.setViewport(r.x, r.y, r.w, r.h); renderer.setScissor(r.x, r.y, r.w, r.h);
  renderer.render(scene, cam);
  renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
  renderer.shadowMap.autoUpdate = auto;
  if (cloudAt) cloudMesh.position.copy(cloudAt);
  if (rainU) rainU.copy(rainAt);
}

const clock = new THREE.Clock();
let tAll = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  tAll += dt;
  updateSky(dt); updateVegetation(dt); updateTreeLOD(dt); if (typeof updatePracticeVisuals === 'function' && game.mode !== 'intro') updatePracticeVisuals(); if (CLUB) { CLUBHOUSE.updateFlag(CLUB.group, wind.x, wind.z, tAll); updateGuests(dt); } animateFlags(dt); updateEffects(dt); if (game.mode !== 'intro') updateGreenRead(dt);
  if (game.mode === 'intro' && !document.getElementById('menu').classList.contains('hidden')) return;   // front page covers the screen
  if (game.mode === 'intro') { // slow fly-over around the course
    const a = tAll * 0.035;
    camera.position.set(Math.sin(a) * X1 * 1.05, 150 + 25 * Math.sin(a * 0.7), Math.cos(a) * S1 * 1.2);
    camera.lookAt(0, -10, 0);
    sunLight.position.copy(camera.position).addScaledVector(sunDir, 300); sunLight.target.position.set(0, 0, 0);
    renderer.render(scene, camera); return;
  }
  // gusty wind
  wind.x = wind.base.x * (1 + 0.15 * Math.sin(tAll * 0.7) + 0.1 * Math.sin(tAll * 1.9));
  wind.z = wind.base.z * (1 + 0.15 * Math.sin(tAll * 0.6 + 1) + 0.1 * Math.sin(tAll * 2.3));

  switch (game.mode) {
    case 'cart': updateCart(dt); $('stamina').style.display = 'none'; game.stamina = Math.min(1, game.stamina + dt / 5); game.exhausted = game.exhausted && game.stamina < 0.35; aimRing.visible = powRing.visible = aimLine.visible = false; break;
    case 'walk': updateWalk(dt); aimRing.visible = powRing.visible = aimLine.visible = false; break;
    case 'aim': game.power = 0; updateAim(dt); $('prompt').style.display = 'none'; break;
    case 'charge': updateCharge(dt); updateAim(dt); break;
    case 'down': updateDown(dt); updateAim(dt); break;
    case 'flight': updateFollow(dt); updateFlight(dt); break;
    case 'result':
      updateFollow(dt);
      game.resultT += dt;
      if (game.resultT > 2.2) {
        game.mode = 'walk'; pose.mode = 'walk';
        game.player.set(golfer.root.position.x, 0, golfer.root.position.z);
        game.yaw = yawTo(game.player.x, game.player.z, game.ball.x, game.ball.z);
        trail.material.opacity = 0.35; updateHUD();
        // driving range: the next ball is on the tee – stay in the address position
        if (game.reaim >= 0 && RANGE && RANGE.mats[game.reaim].on) { const i = game.reaim; game.reaim = -1; startRangePractice(i); }
        else { game.reaim = -1; camSnap = true; }
      }
      break;
    case 'holed': updateFollow(dt); $('prompt').style.display = 'none'; break;
  }
  if (game.mode !== 'cart') updateGolfer();
  updateOccupants();      // players sitting in carts
  // ball beacons in the players' colours (help finding the balls from afar)
  if (PLAYERS.length) updateBeacons();
  else { const dB = camera.position.distanceTo(game.ball); beacon.visible = (game.mode === 'walk' || game.mode === 'cart') && dB > 12; beacon.position.set(game.ball.x, game.ball.y + 7, game.ball.z); beacon.scale.set(Math.max(1, dB / 40), 1, Math.max(1, dB / 40)); }
  if (game.mode !== 'walk' && game.mode !== 'cart') $('stamina').style.display = 'none';
  // sun shadow follows the action
  const focus = game.mode === 'flight' && !BALLCAM.active ? ballMesh.position : game.mode === 'cart' ? CART.group.position : golfer.root.position;
  sunLight.position.copy(focus).addScaledVector(sunDir, 200);
  sunLight.target.position.copy(focus);
  waterNormal.offset.x += dt * (0.002 + wind.x * 0.0015); waterNormal.offset.y -= dt * (0.003 + wind.z * 0.0015);
  updateWindHUD();
  if (game.mode === 'walk' || game.mode === 'flight' || game.mode === 'cart') $('toPin').textContent = fmt(distToPin(game.mode === 'flight' ? game.shot.x : game.ball.x, game.mode === 'flight' ? game.shot.z : game.ball.z));
  drawMap();
  updatePinLabel(); updateAimCursor();
  renderer.render(scene, camera);
  renderBallCam();
}
const _pv = new THREE.Vector3();
function updatePinLabel() {
  const el = $('pinLabel');
  _pv.set(pin.x, Hw(pin.x, pin.z) + 2.6, pin.z);
  const dCam = camera.position.distanceTo(_pv);
  _pv.project(camera);
  if (game.mode === 'holed' || game.mode === 'intro' || dCam < 25 || _pv.z > 1 || Math.abs(_pv.x) > 1.1 || Math.abs(_pv.y) > 1.1) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.style.left = ((_pv.x * 0.5 + 0.5) * innerWidth) + 'px';
  el.style.top = ((-_pv.y * 0.5 + 0.5) * innerHeight) + 'px';
  el.style.setProperty('--pc', '#' + PIN_COL[pin.pos].toString(16).padStart(6, '0'));
  const bp = game.mode === 'flight' ? game.shot : game.ball;
  $('pinDist').textContent = fmt(distToPin(bp.x, bp.z));
}

/* =====================================================================
   Boot
   ===================================================================== */
async function build() {
  ui.initMenu();
  initSky();
  ui.loading('Loading swisstopo terrain…', 0.1);
  await loadTerrain(COURSE_DEF.terrain);
  await loadCartModel();
  ui.loading('Laying out the course…', 0.3); await new Promise(r => setTimeout(r, 20));
  initCourse(); setHole(HOLE_NOS[0]);
  const steps = [prepClubhouse, prepRange, buildTerrain, buildWater, buildBridge, buildPaths, buildRails, buildBuildings, buildRange, buildTrees, buildVegetation, buildTeeMarkers, buildStakes, buildBunkers, buildLandscape, buildFlags, buildCart];
  for (let i = 0; i < steps.length; i++) {
    const f = steps[i], t = performance.now();
    ui.loading('Building the course… (' + f.name.replace('build', '').toLowerCase() + ')', 0.35 + 0.6 * i / steps.length);
    await new Promise(r => setTimeout(r, 0));
    f(); console.log(f.name, (performance.now() - t).toFixed(0));
  }
  placePin(); buildMapBase();
  ui.ready();
}
window.__game = { debug: { shotFinished, launch, physStep, wind, trees, enterAim }, game, get pin() { return pin; }, CLUBS, CARRY, predict, Hw, Sw, startHole, enterAim, SURF,
  simulate(pos, club, power, yaw, lie, w) { const st = launchState(pos, club, power, yaw, lie, false); let ev = null;
    for (let i = 0; i < 240 * 90; i++) { ev = physStep(st, w || { x: 0, z: 0 }, pin, trees); if (ev && ev.type !== 'bounce' && ev.type !== 'lip') break; }
    return { ev: ev && ev.type, x: st.x, s: -st.z, carry: st.carry && Math.hypot(st.carry.x - pos.x, st.carry.z - pos.z), surf: SURF[Sw(st.x, st.z)].name, t: st.t }; } };
camera.position.set(0, 80, 0);
// started by the menu's loader once every script is in (see menu.js)
window.SWISSGOLF_BOOT = () => { build(); frame(); };
