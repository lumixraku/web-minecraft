// World grid
export const SIZE = 128;
export const HALF = SIZE / 2;
export const WORLD_HEIGHT = 100;  // voxel field height (terrain maxes ~93)
export const CHUNK = 16;          // chunk side for re-meshable regions

// Vertical layout (in blocks)
export const SEA_LEVEL = 10;     // columns below this are submerged
export const SNOW_LEVEL = 30;    // pure snow above this
export const STONE_EXPOSE = 22;  // bare stone above this (no grass)
export const BEACH_BAND = 1;     // sand within this many blocks of sea level
export const WATER_Y = SEA_LEVEL + 0.875; // water surface render height

// Feature counts
export const TARGET_TREES = 220;
export const CLOUD_Y = 85;       // shader cloud layer altitude

// Day / night
export const DAY_LENGTH = 240;   // seconds for a full day cycle

// Camera / lighting
export const FOG_NEAR = 140;
export const FOG_FAR = 360;

// Player physics
export const PLAYER = {
  width: 0.6,
  height: 1.8,
  eye: 1.62,
  speed: 5.0,
  sprint: 8.0,
  jump: 8.4,
  gravity: -23,
  flySpeed: 16,
};
export const REACH = 7;          // block interaction distance
