import { BLOCK_IDS } from './voxels.js';
import { blockColor } from './materials.js';

// In-game HUD: hotbar (block palette), crosshair (pure CSS), and the
// time-of-day / weather status line. Slots are built from the materials
// dictionary so swatch colors always match the real blocks.

const HOTBAR = ['grass', 'dirt', 'stone', 'sand', 'wood', 'leaves', 'snow'];
const WEATHER_LABEL = {
  clear: 'Clear', cloudy: 'Cloudy', rain: 'Rain', storm: 'Storm', snow: 'Snow',
};

export function createHud() {
  const bar = document.getElementById('hotbar');
  const status = document.getElementById('status');
  let selected = 0;

  const slots = HOTBAR.map((type, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot';
    const swatch = document.createElement('div');
    swatch.className = 'swatch';
    swatch.style.background = '#' + blockColor(type).getHexString();
    slot.appendChild(swatch);
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(i + 1);
    slot.appendChild(num);
    bar.appendChild(slot);
    return slot;
  });

  function select(i) {
    selected = (i + HOTBAR.length) % HOTBAR.length;
    slots.forEach((s, j) => s.classList.toggle('selected', j === selected));
  }
  select(0);

  document.addEventListener('keydown', (e) => {
    if (document.pointerLockElement === null) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= HOTBAR.length) select(n - 1);
  });
  document.addEventListener('wheel', (e) => {
    if (document.pointerLockElement === null) return;
    select(selected + (e.deltaY > 0 ? 1 : -1));
  });

  function setStatus(timeOfDay, weatherName) {
    const mins = Math.floor(timeOfDay * 24 * 60);
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    status.textContent = `${hh}:${mm} · ${WEATHER_LABEL[weatherName] || weatherName}`;
  }

  return {
    select,
    selectedId: () => BLOCK_IDS[HOTBAR[selected]],
    setStatus,
  };
}
