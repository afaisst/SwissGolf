// SwissGolf – green reading: white arrows on the green that flow downhill (toggle with G when the ball is on/near the green)
'use strict';

const GREENREAD = { on: false, mesh: null, arrows: [], green: null, t: 0 };
const GR_SPACING = 0.9;   // m between arrows
const GR_MAX = 1400;

function practiceGreenActive() {
  if (typeof PUTT === 'undefined' || !PUTT) return false;
  if (game.practice && game.practice.kind === 'putt') return onPracticeGreen(game.ball.x, game.ball.z, 1.5);
  return game.mode === 'walk' && (onPracticeGreen(game.player.x, game.player.z, 2) || (game.pball && onPracticeGreen(game.pball.x, game.pball.z, 1)));
}
function grWanted() {
  if (practiceGreenActive()) return PUTT.green;
  let G = null, best = 1e9;
  for (const g of FEAT.greens) { const d = polyDist(pin.x, -pin.z, g.pts); if (d < best) { best = d; G = g; } }
  return G;
}
function greenReadAvailable() {
  if (practiceGreenActive()) return true;
  const lie = game.ballOnTee ? S_TEE : lieAt(game.ball.x, game.ball.z);
  return lie === S_GREEN || lie === S_FRINGE || distToPin(game.ball.x, game.ball.z) < 30;
}
function toggleGreenRead(on) {
  on = on ?? !GREENREAD.on;
  if (on && !greenReadAvailable()) { showMsg('Green reading<small>available when your ball is on or close to the green</small>', 1.8); return; }
  GREENREAD.on = on;
  if (on) buildGreenRead();
  if (GREENREAD.mesh) GREENREAD.mesh.visible = on;
  updateHUD();
}

function arrowGeometry() {
  const s = new THREE.Shape(); // pointing to -Z (i.e. +y in shape space before the rotation)
  s.moveTo(-0.035, -0.26); s.lineTo(0.035, -0.26); s.lineTo(0.035, 0.06); s.lineTo(0.11, 0.06);
  s.lineTo(0, 0.24); s.lineTo(-0.11, 0.06); s.lineTo(-0.035, 0.06); s.closePath();
  const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); g.scale(1.25, 1, 1.25); // lies flat, tip towards -Z
  return g;
}

// sample the green that holds the pin on a grid; every arrow points down the local fall line
function buildGreenRead() {
  const G = grWanted();
  if (!G || G === GREENREAD.green) return;
  GREENREAD.green = G; GREENREAD.arrows = [];
  const [a, b, c, d] = G.bb, e = 0.3;
  for (let s = b + GR_SPACING / 2; s < d; s += GR_SPACING) for (let x = a + GR_SPACING / 2; x < c; x += GR_SPACING) {
    // a little jitter so the grid does not look mechanical
    const jx = x + (hash2(Math.round(x * 10), Math.round(s * 10)) - 0.5) * 0.25, js = s + (hash2(Math.round(s * 10), Math.round(x * 10)) - 0.5) * 0.25;
    if (polyDist(jx, js, G.pts) > -0.35) continue;
    const z = -js;
    const gx = (Hw(jx + e, z) - Hw(jx - e, z)) / (2 * e), gz = (Hw(jx, z + e) - Hw(jx, z - e)) / (2 * e);
    const slope = Math.hypot(gx, gz);
    GREENREAD.arrows.push({ x: jx, z, dx: -gx / (slope || 1), dz: -gz / (slope || 1), slope, ph: hash2(Math.round(jx * 7), Math.round(js * 7)) * 0.25 });
    if (GREENREAD.arrows.length >= GR_MAX) break;
  }
  if (!GREENREAD.mesh) {
    GREENREAD.mesh = new THREE.InstancedMesh(arrowGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, fog: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), GR_MAX);
    GREENREAD.mesh.frustumCulled = false; GREENREAD.mesh.renderOrder = 4; GREENREAD.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(GR_MAX * 3), 3);
    world.add(GREENREAD.mesh);
  }
  GREENREAD.mesh.count = GREENREAD.arrows.length;
  const col = new THREE.Color();
  GREENREAD.arrows.forEach((A, i) => { // white; steep spots (> 3 %) turn slightly warm so they stand out
    const k = smoothstep(0.02, 0.05, A.slope); col.setRGB(1, 1 - 0.12 * k, 1 - 0.45 * k); GREENREAD.mesh.setColorAt(i, col);
  });
  GREENREAD.mesh.instanceColor.needsUpdate = true;
}

const _grM = new THREE.Matrix4(), _grQ = new THREE.Quaternion(), _grQ2 = new THREE.Quaternion(), _grN = new THREE.Vector3(), _grP = new THREE.Vector3(), _grS = new THREE.Vector3(), _grUp = new THREE.Vector3(0, 1, 0);
function updateGreenRead(dt) {
  if (!GREENREAD.on || !GREENREAD.mesh) return;
  if (!greenReadAvailable() && game.mode !== 'flight') { toggleGreenRead(false); return; }
  if (grWanted() !== GREENREAD.green) buildGreenRead(); // new hole, or the practice green
  GREENREAD.t += dt;
  const im = GREENREAD.mesh;
  GREENREAD.arrows.forEach((A, i) => {
    if (A.slope < 0.003) { _grS.set(0, 0, 0); _grM.compose(_grP.set(A.x, 0, A.z), _grQ, _grS); im.setMatrixAt(i, _grM); return; } // flat: no arrow
    // arrows creep downhill (faster where it is steeper), growing in and fading out over one cycle
    const speed = 0.25 + 9 * A.slope, f = (GREENREAD.t * speed / GR_SPACING + A.ph) % 1;
    const off = (f - 0.5) * GR_SPACING * 0.6, x = A.x + A.dx * off, z = A.z + A.dz * off;
    const size = clamp(A.slope / 0.025, 0.45, 1.35) * Math.sin(Math.PI * f) ** 0.6;
    const e = 0.25; _grN.set(Hw(x - e, z) - Hw(x + e, z), 2 * e, Hw(x, z - e) - Hw(x, z + e)).normalize();
    _grQ.setFromUnitVectors(_grUp, _grN).multiply(_grQ2.setFromAxisAngle(_grUp, Math.atan2(-A.dx, -A.dz)));
    _grS.set(size, 1, size);
    _grM.compose(_grP.set(x, Hw(x, z) + 0.025, z), _grQ, _grS); im.setMatrixAt(i, _grM);
  });
  im.instanceMatrix.needsUpdate = true;
}
