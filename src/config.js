// Chunked infinite world
export const CHUNK = 16;          // chunk side in blocks
export const WORLD_HEIGHT = 100;  // voxel field height
export const RENDER_DIST = 7;     // mesh radius in chunks around the player
                                  // (voxel data generates one chunk further)

// Vertical layout (in blocks)
export const SEA_LEVEL = 10;     // columns below this are submerged
export const SNOW_LEVEL = 40;    // pure snow above this
export const STONE_EXPOSE = 30;  // bare stone above this (no grass)
export const BEACH_BAND = 1;     // sand within this many blocks of sea level
export const WATER_Y = SEA_LEVEL + 0.875; // water surface render height

// Features
export const TREE_CHANCE = 0.012; // per-column tree probability (× forest factor)
export const CLOUD_Y = 85;        // shader cloud layer altitude

// Day / night
export const DAY_LENGTH = 86400; // seconds for a full day cycle (real time: 1 in-game day = 24 real hours)

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
