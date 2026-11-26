// SwissGolf – sky, sun, drifting clouds and a small weather model (cloud cover, haze, light)
'use strict';

// Weather settings. Change WEATHER.preset (or call setWeather) – the sky, clouds, fog and sunlight follow.
const WEATHER_PRESETS = {
  sunny:    { cover: 0.18, density: 0.8, haze: 0.35, sun: 1.0, label: 'Sunny' },
  fair:     { cover: 0.42, density: 0.9, haze: 0.5, sun: 0.9, label: 'Fair' },
  cloudy:   { cover: 0.68, density: 1.0, haze: 0.75, sun: 0.55, label: 'Cloudy' },
  overcast: { cover: 0.92, density: 1.1, haze: 1.0, sun: 0.3, dark: 0.25, label: 'Overcast' },
  // fog: the fog closes over the sky as well – no sky dome, no clouds, just the fog colour all around
  fog:      { cover: 0.85, density: 1.0, haze: 1.0, sun: 0.35, fog: [8, 190], fogCol: [0.74, 0.77, 0.80], hideSky: true, label: 'Fog' },
  // rain: dark, low cloud deck over a grey sky, dim light
  rain:     { cover: 1.0, density: 1.4, haze: 1.0, sun: 0.12, rain: 1, fog: [40, 700], fogCol: [0.36, 0.39, 0.42], dark: 0.75, hideSky: true, exposure: 0.78, label: 'Rain' },
};
// wind strength ranges (m/s); direction is random per hole, gusts ±25 %
const WIND_LEVELS = { calm: { range: [0, 0.8], label: 'No wind' }, medium: { range: [2.5, 5.5], label: 'Medium' }, strong: { range: [7, 11], label: 'Strong' } };
const WEATHER = { rain: 0, fog: null, wind: (() => { try { return localStorage.getItem('swissgolf.wind') || 'medium'; } catch (e) { return 'medium'; } })(),
  preset: (() => { try { return localStorage.getItem('swissgolf.weather') || 'fair'; } catch (e) { return 'fair'; } })(), cover: 0.42, density: 0.9, haze: 0.5, sun: 0.9, cloudOffset: new THREE.Vector2() };
let skyMesh = null, cloudMesh = null, rainMesh = null;

function makeSkyMesh(scale) {
  const sky = new THREE.Sky(); sky.scale.setScalar(scale);
  const u = sky.material.uniforms;
  u.turbidity.value = 3.2; u.rayleigh.value = 1.05; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.86;
  u.sunPosition.value.copy(sunDir);
  return sky;
}

const CLOUD_VS = `
  varying vec3 vDir;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vDir = wp.xyz - cameraPosition;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const CLOUD_FS = `
  uniform float uTime, uCover, uDensity, uDark;
  uniform vec2 uOffset;
  uniform vec3 uSun, uSunCol, uSkyCol;
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
  float cloud(vec2 p) {
    float n = fbm(p) * 0.75 + fbm(p * 3.1 + 5.0) * 0.25;
    return smoothstep(1.0 - uCover, 1.0 - uCover + 0.32, n);
  }
  void main() {
    vec3 d = normalize(vDir);
    if (d.y < 0.005) discard;
    vec2 p = d.xz / (d.y + 0.12) * 3.2 + uOffset;          // a flat cloud layer seen from below
    float c = cloud(p);
    if (c < 0.01) discard;
    // light: march a little towards the sun – thick parts are darker underneath
    vec2 toSun = normalize(uSun.xz + 1e-4) * 0.16;
    float sh = cloud(p + toSun) * 0.6 + cloud(p + toSun * 2.3) * 0.4;
    float lit = clamp(1.0 - sh * 0.75 * uDensity, 0.0, 1.0);
    float mu = max(dot(d, uSun), 0.0);
    vec3 col = mix(vec3(0.55, 0.58, 0.64) * (1.15 - 0.4 * uCover), vec3(1.0, 0.99, 0.96), lit);
    col += uSunCol * pow(mu, 12.0) * 0.6 * (1.0 - c * 0.6) * (1.0 - uDark);   // silver lining near the sun
    col *= 1.0 - 0.62 * uDark * (1.0 - 0.35 * lit);                     // rain clouds: dark grey, darkest where thick
    float fade = smoothstep(0.03, 0.3, d.y);                            // thin out towards the horizon
    col = mix(uSkyCol, col, 0.55 + 0.45 * fade);
    gl_FragColor = vec4(col, c * fade * fade * min(1.0, uDensity));
    #include <colorspace_fragment>
  }`;

function initSky() {
  skyMesh = makeSkyMesh(30000); skyMesh.renderOrder = -10; scene.add(skyMesh);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); envScene.add(makeSkyMesh(1000));
  scene.environment = pmrem.fromScene(envScene).texture;
  cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24), new THREE.ShaderMaterial({
    vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS, side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
    uniforms: {
      uTime: { value: 0 }, uDark: { value: 0 }, uCover: { value: WEATHER.cover }, uDensity: { value: WEATHER.density }, uOffset: { value: WEATHER.cloudOffset },
      uSun: { value: sunDir.clone() }, uSunCol: { value: new THREE.Color(1.0, 0.92, 0.78) }, uSkyCol: { value: new THREE.Color(0.72, 0.8, 0.88) },
    }
  }));
  cloudMesh.renderOrder = -9; cloudMesh.frustumCulled = false;
  scene.add(cloudMesh);
  setWeather(WEATHER.preset);
}
function setWeather(name) {
  const p = WEATHER_PRESETS[name] || WEATHER_PRESETS.fair;
  Object.assign(WEATHER, { rain: 0, fog: null }, p, { preset: name });
  if (!cloudMesh) return;
  const u = cloudMesh.material.uniforms; u.uCover.value = p.cover; u.uDensity.value = p.density;
  const su = skyMesh.material.uniforms; su.turbidity.value = 2.5 + 6 * p.haze; su.rayleigh.value = 1.1 - 0.5 * p.haze;
  sunLight.intensity = 2.7 * p.sun;
  hemiLight.intensity = p.rain ? 0.55 : 0.5 + 0.35 * (1 - p.sun);
  scene.fog.color.setRGB(0.70 + 0.05 * p.haze, 0.78, 0.85 - 0.05 * p.haze);
  scene.fog.near = 350 - 200 * p.haze; scene.fog.far = 5200 - 2800 * p.haze;
  if (p.fog) { scene.fog.near = p.fog[0]; scene.fog.far = p.fog[1]; scene.fog.color.setRGB(...p.fogCol); }
  u.uSkyCol.value.copy(scene.fog.color); u.uDark.value = p.dark || 0;
  // thick fog / rain: the sky dome is replaced by the fog colour, so looking up you are inside the weather too
  skyMesh.visible = !p.hideSky;
  cloudMesh.visible = !(p.hideSky && !p.rain);
  scene.background = p.hideSky ? scene.fog.color : null;
  renderer.toneMappingExposure = 0.62 * (0.8 + 0.2 * p.sun) * (p.exposure || 1);
  if (!rainMesh) buildRain();
  rainMesh.visible = !!p.rain;
  if (typeof sfx !== 'undefined') sfx.rain(p.rain ? 1 : 0);
  try { localStorage.setItem('swissgolf.weather', name); } catch (e) { }
}
function updateSky(dt) {
  if (!cloudMesh) return;
  cloudMesh.position.copy(camera.position);
  // clouds drift with the (upper) wind
  // the cloud pattern moves the same way as the wind (offset is subtracted in the shader's frame)
  WEATHER.cloudOffset.x -= (wind.base.x * 0.6 + 1.2) * dt * 0.0016;
  WEATHER.cloudOffset.y -= (wind.base.z * 0.6 + 0.6) * dt * 0.0016;
  cloudMesh.material.uniforms.uTime.value += dt;
  if (rainMesh && rainMesh.visible) {
    const u = rainMesh.material.uniforms, v = u.uVel.value;
    v.set(wind.x * 0.95, -8.5, wind.z * 0.95);                 // drops fall at ~8.5 m/s and drift with the wind
    u.uOff.value.addScaledVector(v, dt);
    const B = u.uBox.value; u.uOff.value.set(((u.uOff.value.x % B.x) + B.x) % B.x, ((u.uOff.value.y % B.y) + B.y) % B.y, ((u.uOff.value.z % B.z) + B.z) % B.z);
    u.uCam.value.copy(camera.position);
  }
}
// Rain: streaks in a box that travels with the camera, wrapped with mod() in the vertex shader
function buildRain() {
  const N = 9000, seed = new Float32Array(N * 2 * 3), end = new Float32Array(N * 2), r = mulberry32(77);
  for (let i = 0; i < N; i++) { const a = r(), b = r(), c = r(); for (let k = 0; k < 2; k++) { seed.set([a, b, c], (i * 2 + k) * 3); end[i * 2 + k] = k; } }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  rainMesh = new THREE.LineSegments(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uBox: { value: new THREE.Vector3(50, 28, 50) }, uOff: { value: new THREE.Vector3() }, uVel: { value: new THREE.Vector3(0, -8.5, 0) }, uCam: { value: new THREE.Vector3() } },
    vertexShader: `attribute vec3 seed; attribute float aEnd; uniform vec3 uBox, uOff, uVel, uCam; varying float vA;
      void main() {
        vec3 p = mod(seed * uBox + uOff, uBox) - uBox * 0.5;
        p.y += 8.0;
        p += uCam - aEnd * uVel * 0.04;               // streak = 40 ms of motion
        vA = (1.0 - aEnd) * (1.0 - smoothstep(10.0, 25.0, length(p.xz - uCam.xz)));
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `varying float vA; void main() { gl_FragColor = vec4(0.78, 0.84, 0.92, 0.42 * vA); }`,
  }));
  rainMesh.frustumCulled = false; rainMesh.renderOrder = 10; rainMesh.visible = false;
  scene.add(rainMesh);
}
function setWindLevel(name) { WEATHER.wind = WIND_LEVELS[name] ? name : 'medium'; try { localStorage.setItem('swissgolf.wind', WEATHER.wind); } catch (e) { } }
function randomWind() {
  const [a, b] = WIND_LEVELS[WEATHER.wind].range, spd = a + Math.random() * (b - a), ang = Math.random() * Math.PI * 2;
  wind.base.x = Math.sin(ang) * spd; wind.base.z = Math.cos(ang) * spd; wind.x = wind.base.x; wind.z = wind.base.z;
}
