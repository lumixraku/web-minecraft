// Game menu controller. The menu DOM lives in index.html — this module
// just wires up state + handlers and picks a splash text per show.

const SPLASHES = [
  'Now with mountains!',
  '100% procedural!',
  'Made with Three.js!',
  'Try the lakes!',
  'Voxels everywhere!',
  'It runs in your browser!',
  'No installation required!',
  'Includes water!',
  'Includes clouds!',
  'Snow on peaks!',
  'Built from cubes!',
  'Just like Minecraft!',
  'Drag to look around!',
  'Press ESC for menu!',
  'Open source!',
  'Vibe coded!',
  'Seeded worlds!',
  'Mostly harmless!',
  'Featuring trees!',
  'Made of bytes!',
  'Free to play!',
  'Loaded with biomes!',
];

function pickSplash() {
  return SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
}

export function createMenu(handlers) {
  const root = document.getElementById('menu');
  const continueBtn = root.querySelector('[data-action=continue]');
  const newBtn = root.querySelector('[data-action=new]');
  const splashEl = root.querySelector('[data-role=splash]');
  const seedEl = root.querySelector('[data-role=seed]');

  let worldLoaded = false;
  let currentSeed = null;

  function render() {
    if (worldLoaded) {
      continueBtn.textContent = 'Resume';
      continueBtn.disabled = false;
    } else {
      const save = handlers.peekSave();
      continueBtn.textContent = save ? 'Continue' : 'Continue';
      continueBtn.disabled = !save;
    }
    seedEl.textContent = currentSeed != null
      ? `Seed: ${currentSeed}`
      : (handlers.peekSave() ? `Save: ${handlers.peekSave().seed}` : 'No save');
  }

  continueBtn.addEventListener('click', () => {
    if (continueBtn.disabled) return;
    if (worldLoaded) handlers.onResume();
    else handlers.onContinue();
  });
  newBtn.addEventListener('click', () => handlers.onNew());

  function show() {
    splashEl.textContent = pickSplash();
    root.classList.remove('hidden');
    document.body.classList.add('menu-open');
    render();
  }
  function hide() {
    root.classList.add('hidden');
    document.body.classList.remove('menu-open');
  }
  function toggle() {
    if (root.classList.contains('hidden')) show();
    else hide();
  }
  function setWorldLoaded(seed) {
    worldLoaded = true;
    currentSeed = seed;
    render();
  }

  return {
    show, hide, toggle, setWorldLoaded,
    isVisible: () => !root.classList.contains('hidden'),
  };
}
