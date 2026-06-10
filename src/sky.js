import * as THREE from 'three';
import { DAY_LENGTH, RENDER_DIST, CHUNK } from './config.js';

// Sky + lighting rig: a shader dome (gradient sky, sun & moon discs, dusk
// glow, stars, storm darkening, lightning flash) plus the scene lights that
// track the same sun position. update() advances the day cycle and feeds
// every weather-dependent uniform; `out` exposes the resolved colors so the
// water / cloud shaders can stay in sync.

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uMoonDir;
  uniform float uDayF;   // 0 = night, 1 = day
  uniform float uDuskF;  // sunset / sunrise warmth
  uniform float uStorm;  // 0..1 overcast darkening
  uniform float uFlash;  // lightning
  uniform float uTime;
  varying vec3 vDir;

  float hash13(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;

    // Day / night vertical gradients
    vec3 dayTop   = vec3(0.247, 0.561, 0.851);
    vec3 dayHor   = vec3(0.835, 0.910, 0.970);
    vec3 nightTop = vec3(0.012, 0.027, 0.078);
    vec3 nightHor = vec3(0.050, 0.070, 0.140);
    float t = clamp((h + 0.05) / 1.05, 0.0, 1.0);
    vec3 day = mix(dayHor, dayTop, pow(t, 0.7));
    vec3 night = mix(nightHor, nightTop, pow(t, 0.6));
    vec3 col = mix(night, day, uDayF);

    // Dusk glow — strongest around the sun azimuth, hugging the horizon
    float sunAmount = max(dot(d, uSunDir), 0.0);
    vec3 duskCol = vec3(1.0, 0.45, 0.18);
    col = mix(col, duskCol, uDuskF * pow(sunAmount, 3.0) * (1.0 - abs(h)));
    col += duskCol * uDuskF * pow(max(1.0 - abs(h), 0.0), 6.0) * 0.35;

    // Twilight wash — the whole lower sky soaks in warm haze while the
    // zenith stays dark, with a magenta band in between (the reference
    // look: dusk fills the sky, not just the sun's corner)
    vec3 duskMid = vec3(0.46, 0.22, 0.26);
    float wash = uDuskF * pow(clamp(1.0 - h, 0.0, 1.0), 1.9);
    col = mix(col, duskCol * 0.50 + duskMid * 0.50, wash * 0.50);
    col = mix(col, duskMid, uDuskF * pow(clamp(1.0 - abs(h - 0.25), 0.0, 1.0), 5.0) * 0.30);

    // Sun disc + glow
    float sunDisc = smoothstep(0.99955, 0.99985, sunAmount);
    float sunGlow = pow(sunAmount, 180.0) * 0.5 + pow(sunAmount, 12.0) * 0.12;
    vec3 sunCol = mix(vec3(1.0, 0.95, 0.85), vec3(1.0, 0.55, 0.25), uDuskF);
    col += (sunDisc * 1.6 + sunGlow) * sunCol * (0.25 + uDayF) * (1.0 - uStorm * 0.85);

    // Moon disc (with a crescent bite) + glow
    float moonAmount = max(dot(d, uMoonDir), 0.0);
    float moonDisc = smoothstep(0.99975, 0.99992, moonAmount);
    vec3 biteDir = normalize(uMoonDir + vec3(0.013, 0.011, 0.0));
    float bite = smoothstep(0.99975, 0.99992, max(dot(d, biteDir), 0.0));
    moonDisc = clamp(moonDisc - bite * 0.8, 0.0, 1.0);
    float moonGlow = pow(moonAmount, 350.0) * 0.35;
    col += (moonDisc * 0.95 + moonGlow) * vec3(0.85, 0.9, 1.0)
         * (1.0 - uDayF) * (1.0 - uStorm * 0.9);

    // Stars — hashed cells on the (slowly rotating) sky direction
    vec3 sd = d;
    float ca = cos(uTime * 0.005), sa = sin(uTime * 0.005);
    sd.xz = mat2(ca, -sa, sa, ca) * sd.xz;
    vec3 cell = floor(sd * 120.0);
    float hsh = hash13(cell);
    vec3 f = fract(sd * 120.0) - 0.5;
    float star = step(0.988, hsh) * smoothstep(0.30, 0.0, length(f)) * 1.6;
    star *= 0.55 + 0.45 * sin(uTime * 3.0 + hsh * 87.0);
    star *= smoothstep(0.0, 0.15, h);
    col += vec3(star) * (1.0 - uDayF) * (1.0 - uStorm);

    // Overcast gray-down, then lightning
    vec3 stormGray = vec3(0.25, 0.27, 0.30) * (0.25 + uDayF * 0.75);
    col = mix(col, stormGray, uStorm * 0.7);
    col += vec3(0.9, 0.95, 1.0) * uFlash;

    gl_FragColor = vec4(col, 1.0);
  }
`;

function smoothstepJS(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const DAY_HOR = new THREE.Color(0.835, 0.910, 0.970);
const NIGHT_HOR = new THREE.Color(0.050, 0.070, 0.140);
const DUSK = new THREE.Color(1.0, 0.45, 0.18);
const SUN_WARM = new THREE.Color(1.0, 0.93, 0.78);
const SUN_DUSK = new THREE.Color(1.0, 0.55, 0.25);
const MOON_COL = new THREE.Color(0.55, 0.65, 0.95);
const STORM_GRAY = new THREE.Color(0.25, 0.27, 0.30);

export function createSky(scene) {
  const uniforms = {
    uSunDir:  { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uDayF:    { value: 1 },
    uDuskF:   { value: 0 },
    uStorm:   { value: 0 },
    uFlash:   { value: 0 },
    uTime:    { value: 0 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(700, 32, 16),
    new THREE.ShaderMaterial({
      uniforms, vertexShader: VERT, fragmentShader: FRAG,
      side: THREE.BackSide, depthWrite: false, fog: false,
    }),
  );
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  scene.add(dome);

  const ambient = new THREE.AmbientLight(0xffffff, 0.85);
  const hemi = new THREE.HemisphereLight(0xdfeefc, 0xd8c8a0, 0.35);
  scene.add(ambient, hemi);

  const dirLight = new THREE.DirectionalLight(0xfff6dc, 0.55);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  const d = 110;
  dirLight.shadow.camera.left = -d;
  dirLight.shadow.camera.right = d;
  dirLight.shadow.camera.top = d;
  dirLight.shadow.camera.bottom = -d;
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 400;
  dirLight.shadow.bias = -0.0005;
  dirLight.shadow.normalBias = 0.02;
  scene.add(dirLight, dirLight.target);

  scene.fog = new THREE.Fog(0xeaf3fb, 60, RENDER_DIST * CHUNK);

  let timeOfDay = 0.3;  // 0 midnight, 0.5 noon — start mid-morning
  let timeScale = 1;
  let elapsed = 0;

  // Resolved per-frame values for the other shader systems.
  const out = {
    sunDir: uniforms.uSunDir.value,
    moonDir: uniforms.uMoonDir.value,
    lightDir: new THREE.Vector3(0, 1, 0),  // active light (sun or moon)
    lightCol: new THREE.Color(),           // its color × intensity
    sunCol: new THREE.Color(),
    fogColor: new THREE.Color(),
    reflectCol: new THREE.Color(),  // horizon incl. dusk glow — water fresnel
    dayF: 1,
    duskF: 0,
    flash: 0,
  };

  // fogBase: clear-weather fog distance — tracks the world's render
  // distance so the chunk edge always hides inside the haze.
  function update(dt, weather, camera, fogBase = RENDER_DIST * CHUNK) {
    elapsed += dt;
    timeOfDay = (timeOfDay + (dt * timeScale) / DAY_LENGTH) % 1;

    const a = (timeOfDay - 0.25) * Math.PI * 2;
    const sunDir = uniforms.uSunDir.value;
    sunDir.set(Math.cos(a), Math.sin(a), 0.32).normalize();
    uniforms.uMoonDir.value.copy(sunDir).multiplyScalar(-1);

    const e = sunDir.y;
    const dayF = smoothstepJS(-0.06, 0.16, e);
    const duskF = Math.max(0, 1 - Math.abs(e) / 0.3);
    const storm = weather.gloom;

    uniforms.uDayF.value = dayF;
    uniforms.uDuskF.value = duskF;
    uniforms.uStorm.value = storm;
    uniforms.uFlash.value = weather.flash;
    uniforms.uTime.value = elapsed;
    dome.position.copy(camera.position);

    // --- lights ---
    const sunI = smoothstepJS(0, 0.22, e);
    // Shadow rig follows the player so shadows exist everywhere in the
    // infinite world (the shadow camera box is ±110 around the target).
    dirLight.target.position.set(camera.position.x, 10, camera.position.z);
    if (e > 0) {
      dirLight.position.copy(sunDir).multiplyScalar(180).add(dirLight.target.position);
      dirLight.color.copy(SUN_WARM).lerp(SUN_DUSK, duskF);
      dirLight.intensity = (0.15 + 0.55 * sunI) * (1 - storm * 0.75);
    } else {
      dirLight.position.copy(uniforms.uMoonDir.value).multiplyScalar(180).add(dirLight.target.position);
      dirLight.color.copy(MOON_COL);
      dirLight.intensity = 0.22 * smoothstepJS(0, 0.2, -e) * (1 - storm * 0.8);
    }
    dirLight.target.updateMatrixWorld();

    // Steeper falloff toward dusk so terrain sinks into silhouette while
    // the sky still glows (the reference's near-black dusk landscapes)
    ambient.intensity = (0.15 + 0.71 * Math.pow(dayF, 1.5)) * (1 - storm * 0.35)
      + weather.flash * 1.4;
    hemi.intensity = 0.06 + 0.30 * Math.pow(dayF, 1.4);

    // --- fog tracks the horizon color + weather density ---
    // Aerial perspective: distant terrain melts into the twilight, so the
    // dusk component is strong (matches the sky's lower-hemisphere wash)
    out.fogColor.copy(NIGHT_HOR).lerp(DAY_HOR, dayF);
    out.fogColor.lerp(DUSK, duskF * 0.55);
    const gray = STORM_GRAY.clone().multiplyScalar(0.25 + dayF * 0.75);
    out.fogColor.lerp(gray, storm * 0.7);
    scene.fog.color.copy(out.fogColor);
    scene.fog.far = fogBase * weather.fog;
    scene.fog.near = scene.fog.far * 0.45;

    // Water reflection tint — like the fog color but keeps the dusk glow,
    // so sunset paints the lakes orange instead of leaving them dark.
    out.reflectCol.copy(NIGHT_HOR).lerp(DAY_HOR, dayF);
    out.reflectCol.lerp(DUSK, duskF * 0.8);
    out.reflectCol.lerp(gray, storm * 0.7);

    // --- shared outputs ---
    out.dayF = dayF;
    out.duskF = duskF;
    out.flash = weather.flash;
    out.sunCol.copy(SUN_WARM).lerp(SUN_DUSK, duskF);
    if (e > 0) {
      out.lightDir.copy(sunDir);
      out.lightCol.copy(out.sunCol).multiplyScalar((0.25 + sunI) * (1 - storm * 0.8));
    } else {
      out.lightDir.copy(uniforms.uMoonDir.value);
      out.lightCol.copy(MOON_COL).multiplyScalar(0.35 * (1 - storm * 0.8));
    }
  }

  return {
    update,
    out,
    get timeOfDay() { return timeOfDay; },
    setTimeOfDay(t) { timeOfDay = ((t % 1) + 1) % 1; },
    setTimeScale(s) { timeScale = s; },
  };
}
