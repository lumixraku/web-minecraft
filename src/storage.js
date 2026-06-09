// localStorage-backed world save. We persist just the seed — the terrain
// itself is reproduced deterministically by the seeded PRNG.

const KEY = 'voxel-world';
const VERSION = 1;

export function loadWorld() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== VERSION) return null;
    if (typeof data.seed !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function saveWorld(seed) {
  const data = { version: VERSION, seed, savedAt: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save world to localStorage', e);
  }
  return data;
}

export function clearWorld() {
  localStorage.removeItem(KEY);
}
