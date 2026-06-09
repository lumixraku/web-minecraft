import { createScene } from './scene.js';
import { buildWorld, disposeWorld } from './world.js';
import { loadWorld, saveWorld } from './storage.js';
import { newSeed } from './random.js';
import { createMenu } from './menu.js';

const canvas = document.getElementById('app');
const loading = document.getElementById('loading');
const { scene, camera, renderer, controls, sun } = createScene(canvas);

let worldGroup = null;
let currentSeed = null;

function generateForSeed(seed) {
  loading.style.display = 'flex';
  // Defer one frame so the loading screen paints before we block the main
  // thread building ~80k instances.
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      if (worldGroup) disposeWorld(worldGroup);
      worldGroup = buildWorld(seed);
      scene.add(worldGroup);
      sun.target.position.set(0, 10, 0);
      sun.target.updateMatrixWorld();
      currentSeed = seed;
      loading.style.display = 'none';
      resolve();
    });
  });
}

const menu = createMenu({
  peekSave: () => loadWorld(),
  onResume: () => menu.hide(),
  onContinue: async () => {
    const save = loadWorld();
    if (!save) return;
    await generateForSeed(save.seed);
    menu.setWorldLoaded(save.seed);
    menu.hide();
  },
  onNew: async () => {
    const seed = newSeed();
    saveWorld(seed);
    await generateForSeed(seed);
    menu.setWorldLoaded(seed);
    menu.hide();
  },
});

menu.show();

document.addEventListener('keydown', (e) => {
  // ESC toggles menu, but only after a world has been loaded — pre-load
  // the menu must stay up so the user actually picks something.
  if (e.key === 'Escape' && worldGroup) menu.toggle();
});

function tick() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
