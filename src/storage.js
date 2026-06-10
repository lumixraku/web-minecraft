// localStorage-backed world save. Terrain regenerates deterministically
// from the seed, so the save only carries the seed plus the player's
// delta: block edits, position/orientation, time of day and weather.
//
// v2 format:
//   { version: 2, seed, savedAt,
//     time, weather,
//     player: { x, y, z, yaw, pitch, flying },
//     edits: { "x,y,z": blockId, ... } }   // 0 = dug out
//
// v1 saves (seed only) still load — they just start at spawn.

const KEY = 'voxel-world';
const VERSION = 2;

export function loadWorld() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.seed !== 'number') return null;
    if (data.version !== 1 && data.version !== VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

// `data` needs at least { seed }; everything else is optional.
export function saveWorld(data) {
  const full = { version: VERSION, savedAt: Date.now(), ...data };
  try {
    localStorage.setItem(KEY, JSON.stringify(full));
  } catch (e) {
    console.warn('Failed to save world to localStorage', e);
  }
  return full;
}

export function clearWorld() {
  localStorage.removeItem(KEY);
}
