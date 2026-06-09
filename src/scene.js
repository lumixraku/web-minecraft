import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FOG_NEAR, FOG_FAR, FOG_COLOR } from './config.js';

function createSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      topColor:    { value: new THREE.Color(0x4ea3e8) },
      midColor:    { value: new THREE.Color(0xa4d5f3) },
      bottomColor: { value: new THREE.Color(0xeaf3fb) },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 bottomColor;
      varying vec3 vWorld;
      void main() {
        float h = normalize(vWorld).y;
        float t = clamp((h + 0.05) / 1.05, 0.0, 1.0);
        vec3 col = mix(bottomColor, midColor, smoothstep(0.0, 0.45, t));
        col = mix(col, topColor, smoothstep(0.4, 1.0, t));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), mat);
}

function createSun() {
  // Soft warm sun — kept low intensity because ambient does most of the work.
  // Pushing the sun too hard would darken the unlit faces and bring back the
  // muddy look we just fixed.
  const sun = new THREE.DirectionalLight(0xfff6dc, 0.55);
  sun.position.set(70, 120, 50);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const d = 110;
  sun.shadow.camera.left = -d;
  sun.shadow.camera.right = d;
  sun.shadow.camera.top = d;
  sun.shadow.camera.bottom = -d;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 300;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  return sun;
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);
  scene.add(createSky());

  const camera = new THREE.PerspectiveCamera(
    55, window.innerWidth / window.innerHeight, 0.1, 1000,
  );
  camera.position.set(80, 55, 80);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 8, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 12;
  controls.maxDistance = 260;

  // Bright neutral ambient keeps every face readable in true block color.
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  // Hemisphere is just a gentle tint — sky pale blue from above, warm sand
  // from below — so block undersides don't go gray-green.
  scene.add(new THREE.HemisphereLight(0xdfeefc, 0xd8c8a0, 0.35));

  const sun = createSun();
  scene.add(sun);
  scene.add(sun.target);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer, controls, sun };
}
