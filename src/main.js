import { createScene } from './scene.js';
import { buildWorld, disposeWorld } from './world.js';

const canvas = document.getElementById('app');
const loading = document.getElementById('loading');
const regenBtn = document.getElementById('regen');

const { scene, camera, renderer, controls, sun } = createScene(canvas);

let worldGroup = null;

function regenerate() {
  loading.style.display = 'flex';
  // Defer one frame so the loading screen actually paints before we block
  // the main thread building ~80k instances.
  requestAnimationFrame(() => {
    if (worldGroup) disposeWorld(worldGroup);
    worldGroup = buildWorld();
    scene.add(worldGroup);
    sun.target.position.set(0, 10, 0);
    sun.target.updateMatrixWorld();
    loading.style.display = 'none';
  });
}

regenBtn.addEventListener('click', regenerate);
regenerate();

function tick() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
