import { CHUNK } from './config.js';
import { ID_TO_TYPE } from './blocks.js';

// Minecraft-style F3 debug overlay: position, facing, targeted block,
// plus FPS / chunk stats. main.js toggles it and calls update() per frame.

// Compass from the camera's forward vector (-Z is north, +X is east)
function facingName(yaw) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  if (Math.abs(fx) > Math.abs(fz)) {
    return fx > 0 ? 'east (+X)' : 'west (-X)';
  }
  return fz > 0 ? 'south (+Z)' : 'north (-Z)';
}

const norm = (deg) => ((deg % 360) + 540) % 360 - 180; // → [-180, 180)

export function createDebug({ camera, player, getWorld, interact }) {
  const el = document.getElementById('debug');
  let visible = false;
  let fps = 60;

  function toggle() {
    visible = !visible;
    el.style.display = visible ? 'block' : 'none';
  }

  function update(dt) {
    if (dt > 0) fps += (1 / dt - fps) * 0.08; // smoothed
    if (!visible) return;

    const world = getWorld();
    const p = player.position;
    const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
    const yawDeg = norm((camera.rotation.y * 180) / Math.PI);
    const pitchDeg = (camera.rotation.x * 180) / Math.PI;

    const lines = [
      `Voxel World (F3 debug)`,
      `FPS: ${fps.toFixed(0)}`,
      ``,
      `XYZ: ${p.x.toFixed(3)} / ${p.y.toFixed(3)} / ${p.z.toFixed(3)}`,
      `Block: ${bx} ${by} ${bz}`,
      `Chunk: ${Math.floor(bx / CHUNK)} ${Math.floor(bz / CHUNK)}` +
        (world ? ` (${world.chunkCount} cached)` : ''),
      `Facing: ${facingName(camera.rotation.y)}` +
        ` · yaw ${yawDeg.toFixed(1)}° · pitch ${pitchDeg.toFixed(1)}°`,
    ];

    const t = interact.getTarget();
    if (t && world) {
      const id = world.get(t.x, t.y, t.z);
      lines.push(
        ``,
        `Looking at: ${t.x} ${t.y} ${t.z}`,
        `Block type: ${ID_TO_TYPE[id] || 'air'} (id ${id})` +
          ` · face ${t.nx} ${t.ny} ${t.nz}`,
      );
    }

    el.textContent = lines.join('\n');
  }

  return { toggle, update, get visible() { return visible; } };
}
