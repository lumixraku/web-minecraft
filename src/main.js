import * as THREE from 'three';
import { createScene } from './scene.js';
import { createWorld } from './world.js';
import { loadWorld, saveWorld } from './storage.js';
import { newSeed } from './random.js';
import { createMenu } from './menu.js';
import { createSky } from './sky.js';
import { createClouds } from './clouds.js';
import { createWeather } from './weather.js';
import { createPlayer } from './player.js';
import { createInteraction } from './interact.js';
import { createHud } from './hud.js';
import { createConsole } from './console.js';
import { createDebug } from './debug.js';

const canvas = document.getElementById('app');
const loading = document.getElementById('loading');
const underwaterEl = document.getElementById('underwater');

const { scene, camera, composer } = createScene(canvas);
const sky = createSky(scene);
const clouds = createClouds(scene);
const weather = createWeather(scene);
const hud = createHud();
const player = createPlayer(camera);

let world = null;
const interact = createInteraction(scene, camera, player, hud, () => world);
const debug = createDebug({ camera, player, getWorld: () => world, interact });

function lockPointer() {
  // May be rejected (e.g. right after ESC there's a browser cooldown) —
  // the user can always click the canvas to capture the mouse again.
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch { /* ignore */ }
}

const gameConsole = createConsole({
  sky, weather, player,
  getWorld: () => world,
  requestLock: lockPointer,
});

// Build (or rebuild) the world from a save: { seed, edits?, player?,
// time?, weather? }. Restores the previous session's position, view,
// flight state, time of day and weather when present.
function generateFromSave(save) {
  loading.style.display = 'flex';
  // Defer one frame so the loading screen paints before the synchronous
  // pre-generation of the chunks around spawn.
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      if (world) world.dispose();
      world = createWorld(save.seed, scene, save.edits || null);
      const center = save.player || world.findSpawn();
      world.pregenerate(center.x, center.z);
      player.setWorld(world);
      if (save.player) player.restore(save.player);
      else player.spawn(center);
      if (typeof save.time === 'number') sky.setTimeOfDay(save.time);
      if (save.weather) weather.setState(save.weather);
      loading.style.display = 'none';
      resolve();
    });
  });
}

// ---- autosave ----
let lastSavedEdits = -1;
let lastSavedAt = 0;

function persist() {
  if (!world) return;
  saveWorld({
    seed: world.seed,
    time: sky.timeOfDay,
    weather: weather.state,
    player: {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      yaw: camera.rotation.y,
      pitch: camera.rotation.x,
      flying: player.flying,
    },
    edits: world.exportEdits(),
  });
  lastSavedEdits = world.editsVersion;
  lastSavedAt = performance.now();
}

// Save every few seconds while playing, and on the way out.
setInterval(() => {
  if (!world) return;
  // Always cheap; skip only if nothing happened very recently
  if (world.editsVersion !== lastSavedEdits || performance.now() - lastSavedAt > 5000) {
    persist();
  }
}, 2000);
window.addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persist();
});

const menu = createMenu({
  peekSave: () => loadWorld(),
  onResume: () => { menu.hide(); lockPointer(); },
  onContinue: async () => {
    const save = loadWorld();
    if (!save) return;
    await generateFromSave(save);
    menu.setWorldLoaded(save.seed);
    menu.hide();
    lockPointer();
  },
  onNew: async () => {
    const seed = newSeed();
    saveWorld({ seed });
    await generateFromSave({ seed });
    menu.setWorldLoaded(seed);
    menu.hide();
    lockPointer();
  },
});

menu.show();

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  player.setEnabled(locked);
  // ESC released the pointer → menu (unless the command console took it)
  if (!locked && world && !menu.isVisible() && !gameConsole.isOpen()) menu.show();
});
canvas.addEventListener('click', () => {
  if (world && !menu.isVisible() && !gameConsole.isOpen()) lockPointer();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && world && menu.isVisible()) {
    menu.hide();
    lockPointer();
    return;
  }
  if (!world || menu.isVisible() || gameConsole.isOpen()) return;
  if (e.key === '/') {
    e.preventDefault();
    gameConsole.show();
    return;
  }
  if (e.code === 'F3') {
    e.preventDefault(); // browsers bind F3 to find-in-page
    debug.toggle();
    return;
  }
  if (e.code === 'KeyR') weather.cycle();
  if (e.code === 'KeyT') sky.setTimeScale(40);
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'KeyT' && !gameConsole.isOpen()) sky.setTimeScale(1);
});

// Debug / test hooks (used by automated checks; harmless to ship)
window.__game = {
  scene, camera, sky, weather, player, debug,
  console: gameConsole,
  get world() { return world; },
};

const clock = new THREE.Clock();

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);

  player.update(dt);
  const w = weather.update(dt, camera, sky.out.dayF);
  sky.update(dt, w, camera);
  clouds.update(dt, w, sky, camera);

  if (world) {
    // Stream chunks toward the player
    world.update(player.position.x, player.position.z);
    world.water.update(dt, w, sky, scene);
    interact.update();

    const under = player.headUnderwater();
    if (under) {
      // Dense blue fog while submerged; the DOM overlay adds the tint
      scene.fog.color.setRGB(0.03, 0.18, 0.32).multiplyScalar(0.25 + 0.75 * sky.out.dayF);
      scene.fog.near = 2;
      scene.fog.far = 26;
    }
    underwaterEl.style.opacity = under ? 1 : 0;

    hud.setStatus(sky.timeOfDay, w.name);
  }
  debug.update(dt);

  composer.render();
  requestAnimationFrame(tick);
}
tick();
