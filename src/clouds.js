import * as THREE from 'three';
import { CLOUD_Y } from './config.js';
import { NOISE_GLSL } from './shaders.js';

// Procedural cloud layer: one big plane at CLOUD_Y that follows the camera.
// The fragment shader draws drifting fbm clouds; `uCover` (from the weather
// system) slides the density threshold from sparse puffs to full overcast,
// and the cloud color tracks daylight / dusk / storm gloom.

const VERT = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uCover;     // 0..1 cloud coverage
  uniform vec3 uCol;        // lit cloud color (day/dusk/night/storm resolved)
  uniform vec3 uShadeCol;   // unlit underside color
  uniform vec2 uSunXZ;      // sun direction projected on the ground plane
  uniform vec2 uCamXZ;
  uniform float uFlash;
  varying vec3 vW;

  ${NOISE_GLSL}

  void main() {
    // Slightly anisotropic scale → windswept, stretched puffs
    vec2 q = vW.xz * vec2(0.010, 0.016) + vec2(uTime * 0.010, uTime * 0.0042);
    float n = fbm(q);

    float thresh = 0.58 - uCover * 0.50;
    float density = smoothstep(thresh, thresh + 0.18, n);
    if (density < 0.004) discard;

    // Fake self-shadowing: re-sample slightly toward the sun; where the
    // sunward sample is denser, this spot is an underside.
    float n2 = fbm(q + uSunXZ * 0.035 + vec2(0.02));
    float shade = clamp(0.55 + (n - n2) * 4.5, 0.0, 1.0);
    vec3 col = mix(uShadeCol, uCol, shade);
    col += vec3(0.9, 0.95, 1.0) * uFlash * 0.8;

    float distF = 1.0 - smoothstep(320.0, 620.0, length(vW.xz - uCamXZ));
    gl_FragColor = vec4(col, density * 0.92 * distF);
  }
`;

const CLOUD_DAY = new THREE.Color(1.0, 1.0, 1.0);
const CLOUD_NIGHT = new THREE.Color(0.16, 0.18, 0.26);
const CLOUD_DUSK = new THREE.Color(1.0, 0.62, 0.38);
const SHADE_DAY = new THREE.Color(0.62, 0.67, 0.76);
const SHADE_NIGHT = new THREE.Color(0.08, 0.09, 0.14);
const STORM_TINT = new THREE.Color(0.30, 0.32, 0.36);

export function createClouds(scene) {
  const uniforms = {
    uTime:     { value: 0 },
    uCover:    { value: 0.25 },
    uCol:      { value: new THREE.Color(1, 1, 1) },
    uShadeCol: { value: new THREE.Color(0.6, 0.65, 0.75) },
    uSunXZ:    { value: new THREE.Vector2(1, 0) },
    uCamXZ:    { value: new THREE.Vector2(0, 0) },
    uFlash:    { value: 0 },
  };
  const geom = new THREE.PlaneGeometry(1400, 1400);
  geom.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geom, new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  }));
  mesh.position.y = CLOUD_Y;
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  scene.add(mesh);

  let elapsed = 0;

  function update(dt, weather, sky, camera) {
    elapsed += dt;
    uniforms.uTime.value = elapsed;
    uniforms.uCover.value = weather.cover;
    uniforms.uFlash.value = weather.flash;

    uniforms.uCol.value
      .copy(CLOUD_NIGHT).lerp(CLOUD_DAY, sky.out.dayF)
      .lerp(CLOUD_DUSK, sky.out.duskF * 0.65)
      .lerp(STORM_TINT, weather.gloom * 0.8);
    uniforms.uShadeCol.value
      .copy(SHADE_NIGHT).lerp(SHADE_DAY, sky.out.dayF)
      .lerp(STORM_TINT.clone().multiplyScalar(0.5), weather.gloom * 0.8);

    const s = sky.out.sunDir;
    uniforms.uSunXZ.value.set(s.x, s.z);
    mesh.position.x = camera.position.x;
    mesh.position.z = camera.position.z;
    uniforms.uCamXZ.value.set(camera.position.x, camera.position.z);
  }

  return { update, mesh };
}
