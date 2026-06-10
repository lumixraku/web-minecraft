// Minecraft-style command console. Press `/` in game to open the input
// (pointer lock is released while typing), Enter to run, ESC to close.
// Commands:
//   /help
//   /time set <day|noon|sunset|night|midnight|sunrise|HH:MM|ticks>
//   /time add <ticks>
//   /timescale <n>          day-cycle speed multiplier (0 freezes time)
//   /weather <state>        clear | cloudy | rain | storm | snow
//   /weather lock|unlock    pin / resume auto-cycling weather
//   /tp <x> <z> | /tp <x> <y> <z> | /tp spawn
//   /fly
//   /renderdistance <2-12>
//   /seed

// Minecraft tick 0 = 06:00; our timeOfDay 0 = midnight.
const TIME_KEYWORDS = {
  day: 0.30, morning: 0.30, noon: 0.5, sunset: 0.742, dusk: 0.77,
  night: 0.83, midnight: 0.0, sunrise: 0.25, dawn: 0.23,
};

function parseTime(arg) {
  if (arg in TIME_KEYWORDS) return TIME_KEYWORDS[arg];
  const hm = /^(\d{1,2}):(\d{2})$/.exec(arg);
  if (hm) {
    const h = +hm[1], m = +hm[2];
    if (h < 24 && m < 60) return (h + m / 60) / 24;
    return null;
  }
  if (/^\d+$/.test(arg)) return ((+arg % 24000) / 24000 + 0.25) % 1;
  return null;
}

function fmtTime(t) {
  const mins = Math.floor(t * 24 * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

export function createConsole({ sky, weather, player, getWorld, requestLock }) {
  const root = document.getElementById('console');
  const logEl = document.getElementById('console-log');
  const input = document.getElementById('console-input');
  let open = false;

  function print(msg, isError = false) {
    const line = document.createElement('div');
    line.className = 'console-line' + (isError ? ' error' : '');
    line.textContent = msg;
    logEl.appendChild(line);
    while (logEl.children.length > 8) logEl.removeChild(logEl.firstChild);
    setTimeout(() => { line.classList.add('faded'); }, 6000);
  }

  const commands = {
    help() {
      print('/time set <day|noon|sunset|night|HH:MM|ticks> · /time add <ticks>');
      print('/timescale <n> · /weather <clear|cloudy|rain|storm|snow|lock|unlock>');
      print('/tp <x> <z> | <x> <y> <z> | spawn · /fly · /renderdistance <n> · /seed');
    },

    time(args) {
      const [op, val] = args;
      if (op === 'set') {
        const t = parseTime(val ?? '');
        if (t === null) return print(`Unknown time "${val}"`, true);
        sky.setTimeOfDay(t);
        print(`Time set to ${fmtTime(t)}`);
      } else if (op === 'add') {
        const ticks = parseInt(val, 10);
        if (Number.isNaN(ticks)) return print(`"${val}" is not a number`, true);
        sky.setTimeOfDay(sky.timeOfDay + ticks / 24000);
        print(`Time advanced to ${fmtTime(sky.timeOfDay)}`);
      } else {
        print('Usage: /time set <value> | /time add <ticks>', true);
      }
    },

    timescale(args) {
      const n = parseFloat(args[0]);
      if (Number.isNaN(n) || n < 0) return print('Usage: /timescale <n ≥ 0>', true);
      sky.setTimeScale(n);
      print(n === 0 ? 'Time frozen' : `Day cycle speed ×${n}`);
    },

    weather(args) {
      const arg = (args[0] || '').toLowerCase();
      if (arg === 'lock') {
        weather.setLocked(true);
        return print(`Weather locked (${weather.state})`);
      }
      if (arg === 'unlock') {
        weather.setLocked(false);
        return print('Weather cycling resumed');
      }
      if (!weather.isValidState(arg)) {
        return print(`Usage: /weather <${weather.states.join('|')}|lock|unlock>`, true);
      }
      weather.setState(arg);
      print(`Weather set to ${arg}`);
    },

    tp(args) {
      const world = getWorld();
      if (!world) return;
      if (args[0] === 'spawn') {
        const v = world.findSpawn();
        player.teleport(v.x, v.y, v.z);
        return print(`Teleported to spawn (${Math.round(v.x)}, ${Math.round(v.z)})`);
      }
      const nums = args.map(Number);
      if (args.length === 2 && nums.every(Number.isFinite)) {
        const x = Math.floor(nums[0]), z = Math.floor(nums[1]);
        const y = world.surfaceAt(x, z) + 1;
        player.teleport(x + 0.5, y, z + 0.5);
        return print(`Teleported to (${x}, ${Math.round(y)}, ${z})`);
      }
      if (args.length === 3 && nums.every(Number.isFinite)) {
        player.teleport(nums[0], nums[1], nums[2]);
        return print(`Teleported to (${nums.join(', ')})`);
      }
      print('Usage: /tp <x> <z> | /tp <x> <y> <z> | /tp spawn', true);
    },

    fly() {
      print(player.toggleFly() ? 'Fly mode on' : 'Fly mode off');
    },

    renderdistance(args) {
      const world = getWorld();
      const n = parseInt(args[0], 10);
      if (!world || Number.isNaN(n)) return print('Usage: /renderdistance <2-12>', true);
      world.setRenderDist(n);
      print(`Render distance set to ${world.renderDist} chunks`);
    },

    seed() {
      const world = getWorld();
      if (world) print(`Seed: ${world.seed}`);
    },
  };
  commands.rd = commands.renderdistance;

  function exec(line) {
    const parts = line.trim().replace(/^\//, '').split(/\s+/).filter(Boolean);
    if (!parts.length) return;
    const cmd = parts[0].toLowerCase();
    if (commands[cmd]) {
      try {
        commands[cmd](parts.slice(1));
      } catch (err) {
        print(`Error: ${err.message}`, true);
      }
    } else {
      print(`Unknown command "/${cmd}" — try /help`, true);
    }
  }

  function show() {
    open = true;
    root.classList.add('open');
    input.value = '/';
    document.exitPointerLock();
    // Focus after the lock release settles so the keystroke doesn't leak in
    setTimeout(() => input.focus(), 0);
  }

  function hide(relock = true) {
    open = false;
    root.classList.remove('open');
    input.blur();
    input.value = '';
    if (relock) requestLock();
  }

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const line = input.value;
      hide();
      if (line.trim()) exec(line);
    } else if (e.key === 'Escape') {
      hide();
    }
  });

  return { show, hide, print, isOpen: () => open };
}
