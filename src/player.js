import * as THREE from 'three';
import { SEA_LEVEL, WATER_Y, PLAYER, WORLD_HEIGHT } from './config.js';

// First-person player: pointer-lock mouselook, WASD movement, gravity +
// jumping, per-axis AABB collision against the voxel world, swimming in
// water columns, and a toggleable fly mode (F). The camera is driven
// directly; `pos` is the feet position. Voxel cell (x, y, z) spans world
// [x, x+1) on each axis, so lookups are plain floor().

export function createPlayer(camera) {
  camera.rotation.order = 'YXZ';

  const pos = new THREE.Vector3(0.5, WORLD_HEIGHT - 20, 0.5);
  const vel = new THREE.Vector3();
  const keys = new Set();
  let world = null;
  let enabled = false;
  let flying = false;
  let grounded = false;
  let lastSpaceTap = 0;

  document.addEventListener('keydown', (e) => {
    if (!enabled) return;
    keys.add(e.code);
    if (e.code === 'Space') {
      e.preventDefault();
      // Creative mode: double-tap Space toggles flight (like Minecraft)
      if (!e.repeat) {
        const now = performance.now();
        if (now - lastSpaceTap < 300) { flying = !flying; vel.y = 0; }
        lastSpaceTap = now;
      }
    }
    if (e.code === 'KeyF') { flying = !flying; vel.y = 0; }
  });
  document.addEventListener('keyup', (e) => keys.delete(e.code));

  document.addEventListener('mousemove', (e) => {
    if (!enabled) return;
    const s = 0.0022;
    camera.rotation.y -= e.movementX * s;
    camera.rotation.x = Math.max(
      -Math.PI / 2 + 0.01,
      Math.min(Math.PI / 2 - 0.01, camera.rotation.x - e.movementY * s),
    );
  });

  // Does the player AABB at feet position p overlap any solid voxel?
  function collides(p) {
    const r = PLAYER.width / 2;
    const x0 = Math.floor(p.x - r), x1 = Math.floor(p.x + r);
    const z0 = Math.floor(p.z - r), z1 = Math.floor(p.z + r);
    const y0 = Math.floor(p.y), y1 = Math.floor(p.y + PLAYER.height - 0.01);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          if (world.get(x, y, z) !== 0) return true;
        }
      }
    }
    return false;
  }

  // Inside a water column? (water exists where the original terrain is
  // below sea level — edits don't flood, fine for this scope)
  function columnSubmerged() {
    return world.surfaceAt(Math.floor(pos.x), Math.floor(pos.z)) < SEA_LEVEL;
  }
  function inWater() {
    return world && columnSubmerged() && pos.y + 0.6 < WATER_Y;
  }
  function headUnderwater() {
    return world && columnSubmerged() && camera.position.y < WATER_Y - 0.08;
  }

  function update(dt) {
    if (!world || !enabled) return;

    const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const r = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const yaw = camera.rotation.y;
    let mx = f * -Math.sin(yaw) + r * Math.cos(yaw);
    let mz = f * -Math.cos(yaw) - r * Math.sin(yaw);
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }

    const water = inWater();
    if (flying) {
      const sp = PLAYER.flySpeed;
      vel.x = mx * sp;
      vel.z = mz * sp;
      vel.y = ((keys.has('Space') ? 1 : 0) - (keys.has('ShiftLeft') ? 1 : 0)) * sp * 0.9;
    } else {
      let sp = keys.has('ShiftLeft') ? PLAYER.sprint : PLAYER.speed;
      if (water) sp *= 0.55;
      vel.x = mx * sp;
      vel.z = mz * sp;
      if (water) {
        vel.y += PLAYER.gravity * 0.2 * dt;
        if (keys.has('Space')) vel.y = 3.2;
        vel.y = Math.max(-3.0, Math.min(3.4, vel.y));
      } else {
        vel.y += PLAYER.gravity * dt;
        if (keys.has('Space') && grounded) { vel.y = PLAYER.jump; grounded = false; }
      }
    }

    // Per-axis move + resolve
    let prev = pos.x;
    pos.x += vel.x * dt;
    if (collides(pos)) { pos.x = prev; vel.x = 0; }
    prev = pos.z;
    pos.z += vel.z * dt;
    if (collides(pos)) { pos.z = prev; vel.z = 0; }
    prev = pos.y;
    pos.y += vel.y * dt;
    if (collides(pos)) {
      if (vel.y < 0) grounded = true;
      pos.y = prev;
      vel.y = 0;
    } else if (vel.y > 0.01) {
      grounded = false;
    }

    // Recover from falling out of the world (e.g. digging to the void)
    if (pos.y < -20) {
      teleport(pos.x, world.surfaceAt(Math.floor(pos.x), Math.floor(pos.z)) + 1, pos.z);
    }

    camera.position.set(pos.x, pos.y + PLAYER.eye, pos.z);
  }

  function spawn(v) {
    pos.copy(v);
    vel.set(0, 0, 0);
    grounded = false;
    camera.position.set(pos.x, pos.y + PLAYER.eye, pos.z);
    camera.rotation.set(0, Math.PI * 0.75, 0);
  }

  function teleport(x, y, z) {
    pos.set(x, y, z);
    vel.set(0, 0, 0);
    grounded = false;
    camera.position.set(pos.x, pos.y + PLAYER.eye, pos.z);
  }

  // Restore a saved session: position, view direction, flight state.
  function restore(state) {
    teleport(state.x, state.y, state.z);
    camera.rotation.set(state.pitch || 0, state.yaw || 0, 0);
    flying = !!state.flying;
  }

  function getAABB() {
    const r = PLAYER.width / 2;
    return {
      minX: pos.x - r, minY: pos.y, minZ: pos.z - r,
      maxX: pos.x + r, maxY: pos.y + PLAYER.height, maxZ: pos.z + r,
    };
  }

  return {
    update,
    spawn,
    teleport,
    restore,
    setWorld(w) { world = w; },
    setEnabled(on) { enabled = on; if (!on) keys.clear(); },
    toggleFly() { flying = !flying; vel.y = 0; return flying; },
    get flying() { return flying; },
    headUnderwater,
    getAABB,
    position: pos,
  };
}
