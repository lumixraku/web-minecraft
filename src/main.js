import * as THREE from 'three';
import { CHUNK } from './config.js';
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

const canvas = document.getElementById('app');
const loading = document.getElementById('loading');
const underwaterEl = document.getElementById('underwater');

const { scene, camera, renderer } = createScene(canvas);
const sky = createSky(scene);
const clouds = createClouds(scene);
const weather = createWeather(scene);
const hud = createHud();
const player = createPlayer(camera);

let world = null;
const interact = createInteraction(scene, camera, player, hud, () => world);

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

function generateForSeed(seed) {
  loading.style.display = 'flex';
  // Defer one frame so the loading screen paints before the synchronous
  // pre-generation of the chunks around spawn.
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      if (world) world.dispose();
      world = createWorld(seed, scene);
      const spawn = world.findSpawn();
      world.pregenerate(spawn.x, spawn.z);
      player.setWorld(world);
      player.spawn(spawn);
      loading.style.display = 'none';
      resolve();
    });
  });
}

const menu = createMenu({
  peekSave: () => loadWorld(),
  onResume: () => { menu.hide(); lockPointer(); },
  onContinue: async () => {
    const save = loadWorld();
    if (!save) return;
    await generateForSeed(save.seed);
    menu.setWorldLoaded(save.seed);
    menu.hide();
    lockPointer();
  },
  onNew: async () => {
    const seed = newSeed();
    saveWorld(seed);
    await generateForSeed(seed);
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
  if (e.code === 'KeyR') weather.cycle();
  if (e.code === 'KeyT') sky.setTimeScale(40);
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'KeyT' && !gameConsole.isOpen()) sky.setTimeScale(1);
});

// Debug / test hooks (used by automated checks; harmless to ship)
window.__game = {
  scene, camera, sky, weather, player,
  console: gameConsole,
  get world() { return world; },
};

const clock = new THREE.Clock();

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);

  player.update(dt);
  const w = weather.update(dt, camera, sky.out.dayF);
  let fogBase;
  if (world) {
    fogBase = world.renderDist * CHUNK;
    // Creative flight: the higher you climb, the further the fog opens up,
    // so flying high gives an aerial vista instead of a wall of haze.
    const alt = Math.max(0, camera.position.y - 50);
    fogBase *= 1 + Math.min(1, alt / 80) * 1.8;
  }
  sky.update(dt, w, camera, fogBase);
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

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
