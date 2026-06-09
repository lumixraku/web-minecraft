// World grid
export const SIZE = 128;
export const HALF = SIZE / 2;

// Vertical layout (in blocks)
export const SEA_LEVEL = 10;     // water surface
export const SNOW_LEVEL = 30;    // pure snow above this
export const STONE_EXPOSE = 22;  // bare stone above this (no grass)
export const BEACH_BAND = 1;     // sand within this many blocks of sea level
export const MAX_DEPTH = 10;     // how deep below surface we render side blocks

// Feature counts
export const TARGET_TREES = 220;
export const CLOUD_COUNT = 14;
export const CLOUD_BASE_Y = 58;

// Camera / lighting
export const FOG_NEAR = 90;
export const FOG_FAR = 320;
