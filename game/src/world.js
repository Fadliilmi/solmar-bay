// Solmar Bay's world: a seeded city on a road grid, its traffic, pedestrians,
// police, missions, combat and the wanted system. Everything the renderer draws
// and the screenshots stage comes from this one simulation.
import {
  WORLD, CAR_MODELS, DISTRICTS, DISTRICT_STYLE, MISSIONS, SUN_COINS, PLACES,
  PLAYER, WANTED, STEP,
} from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WIN = 'win';

export const EVENT_NONE = 0;
export const EVENT_WASTED = 1;
export const EVENT_BUSTED = 2;
export const EVENT_MISSION_DONE = 4;
export const EVENT_WIN = 8;

const TAU = Math.PI * 2;

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

/** Which district a point belongs to. */
export function districtAt(x, y) {
  for (const d of DISTRICTS) if (d.test(x, y)) return d.id;
  return 'suburbs';
}

/** Build the static city: road graph nodes, blocks, buildings, trees, piers. */
function buildCity(random) {
  const spacing = WORLD.roadSpacing;
  const half = WORLD.roadWidth / 2;
  const nodes = [];
  const nodeIndex = new Map();
  for (let gx = 1; gx * spacing < WORLD.width; gx += 1) {
    for (let gy = 1; gy * spacing < WORLD.height; gy += 1) {
      const x = gx * spacing;
      const y = gy * spacing;
      // No intersection inside the sea or the harbour water.
      if (y >= WORLD.seaY || x >= WORLD.marinaX) continue;
      const id = nodes.length;
      nodes.push({ id, x, y, gx, gy });
      nodeIndex.set(`${gx},${gy}`, id);
    }
  }
  // Blocks: the rectangles between four neighbouring intersections.
  const buildings = [];
  const trees = [];
  const blocks = [];
  for (let gx = 1; gx * spacing < WORLD.width; gx += 1) {
    for (let gy = 1; gy * spacing < WORLD.height; gy += 1) {
      const x0 = gx * spacing + half;
      const y0 = gy * spacing + half;
      const x1 = (gx + 1) * spacing - half;
      const y1 = (gy + 1) * spacing - half;
      if (x0 >= WORLD.marinaX || y0 >= WORLD.seaY || x1 <= 0 || y1 <= 0) continue;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const district = districtAt(cx, cy);
      const block = { x0, y0, x1, y1, district };
      blocks.push(block);
      if (district === 'park') {
        // Palm Park: lawns, palms and a pond, no buildings.
        const n = random.int(14, 20);
        for (let i = 0; i < n; i += 1) {
          trees.push({ x: random.range(x0 + 14, x1 - 14), y: random.range(y0 + 14, y1 - 14), r: random.range(7, 11) });
        }
        continue;
      }
      if (district === 'beach') {
        const n = random.int(2, 4);
        for (let i = 0; i < n; i += 1) {
          trees.push({ x: random.range(x0 + 14, x1 - 14), y: random.range(y0 + 14, y1 - 14), r: random.range(7, 10) });
        }
      }
      // 1-4 buildings per block, kept clear of the block's fixed places.
      const count = district === 'downtown' ? random.int(2, 4) : random.int(1, 3);
      for (let i = 0; i < count; i += 1) {
        const w = random.range(56, 120);
        const h = random.range(56, 120);
        const bx = random.range(x0 + 12, x1 - 12 - w);
        const by = random.range(y0 + 12, y1 - 12 - h);
        if (bx < x0 + 8 || by < y0 + 8) continue;
        let clear = true;
        for (const p of Object.values(PLACES)) {
          if (p.x > bx - 90 && p.x < bx + w + 90 && p.y > by - 90 && p.y < by + h + 90) clear = false;
        }
        for (const b of buildings) {
          if (bx < b.x + b.w + 14 && bx + w + 14 > b.x && by < b.y + b.h + 14 && by + h + 14 > b.y) clear = false;
        }
        if (!clear) continue;
        const style = DISTRICT_STYLE[district];
        const height = random.range(style.height[0], style.height[1]);
        buildings.push({
          x: bx, y: by, w, h, height, district,
          roof: random.pick(style.roof),
          lit: random.next(),
          seed: random.next(),
        });
      }
    }
  }
  // Marina piers jutting into the harbour water.
  const piers = [
    { x: 3420, y: 1050, w: 150, h: 26 },
    { x: 3420, y: 1350, w: 150, h: 26 },
    { x: 3420, y: 1650, w: 150, h: 26 },
  ];
  return { nodes, nodeIndex, blocks, buildings, trees, piers };
}

/** A car in the world: traffic, parked, police or the player's ride. */
function makeCar(random, model, x, y, angle, kind) {
  return {
    kind, model, x, y, angle, speed: 0,
    color: random.pick(model.colors),
    length: model.length, width: model.width,
    health: 100, targetNode: -1, nextNode: -1, fromNode: -1, wait: 0,
    siren: kind === 'police', sirenPhase: random.next() * TAU,
    driver: kind === 'traffic',
  };
}

export function createWorld(random) {
  const city = buildCity(random);
  const state = {
    time: 0, // seconds of play
    clock: 8 * 60, // game minutes since midnight; day starts 08:00
    clockBase: 8 * 60, // clock = clockBase + time * 0.5 minutes per second
    random,
    city,
    player: {
      x: 465, y: 540, angle: -Math.PI / 2, speed: 0,
      health: PLAYER.health, armor: 0, cash: 120,
      weapon: 'pistol', ammo: PLAYER.pistolAmmoStart, inCar: null,
      wanted: 0, heat: 0, lastCrime: -999, arrest: 0,
      coins: 0, kills: 0, carsStolen: 0,
    },
    cars: [],
    peds: [],
    cops: [],
    rivals: [],
    bullets: [],
    particles: [],
    pickups: [],
    coins: SUN_COINS.map((c) => ({ ...c, taken: false })),
    missionIndex: 0,
    missionStep: 0,
    missionKills: 0,
    missionSpawned: false,
    collectReady: false,
    missionTimer: 0,
    missionText: '',
    missionDone: false,
    message: '',
    messageUntil: 0,
    banner: '',
    bannerUntil: 0,
    stats: { missionsDone: 0, shotsFired: 0 },
  };

  /** True when no car already sits within `minDist` of a point. */
  function spotClear(x, y, minDist) {
    for (const car of state.cars) {
      if (dist2(x, y, car.x, car.y) < minDist * minDist) return false;
    }
    return true;
  }

  function spawnTraffic(count) {
    for (let i = 0; i < count; i += 1) {
      const node = random.pick(city.nodes);
      const model = random.pick(CAR_MODELS);
      const x = node.x + random.range(-8, 8);
      const y = node.y + random.range(-8, 8);
      if (!spotClear(x, y, 56)) continue;
      const car = makeCar(random, model, x, y, random.range(0, TAU), 'traffic');
      car.targetNode = node.id;
      state.cars.push(car);
    }
  }
  function spawnParked(count) {
    for (let i = 0; i < count; i += 1) {
      const node = random.pick(city.nodes);
      const model = random.pick(CAR_MODELS);
      // Parked mid-block, clear of the junction's turning traffic.
      const side = random.pick([-1, 1]);
      const along = random.range(90, 140) * random.pick([-1, 1]);
      const horiz = random.chance(0.5);
      const x = horiz ? node.x + along : node.x + side * (WORLD.roadWidth / 2 - 6);
      const y = horiz ? node.y + side * (WORLD.roadWidth / 2 - 6) : node.y + along;
      if (x > WORLD.marinaX - 20 || y > WORLD.seaY - 20) continue;
      if (!spotClear(x, y, 70)) continue;
      const car = makeCar(random, model, x, y, horiz ? 0 : Math.PI / 2, 'parked');
      state.cars.push(car);
    }
  }
  function spawnPeds(count) {
    for (let i = 0; i < count; i += 1) {
      const node = random.pick(city.nodes);
      state.peds.push({
        x: node.x + random.range(-120, 120), y: node.y + random.range(-120, 120),
        angle: random.range(0, TAU), speed: random.range(28, 55),
        panic: 0, color: random.pick(['#e8d8b0', '#b0c4e8', '#e8b0b0', '#b0e8c4', '#d8b0e8', '#e8e8e8']),
        shirt: random.pick(['#c23b2e', '#3f6fb5', '#3e7d4e', '#c98a2e', '#7a2ea6', '#e8e8e8']),
      });
    }
  }

  function reset() {
    state.time = 0;
    state.clock = 8 * 60;
    state.clockBase = 8 * 60;
    state.player.x = 465;
    state.player.y = 540;
    state.player.angle = -Math.PI / 2;
    state.player.speed = 0;
    state.player.health = PLAYER.health;
    state.player.armor = 0;
    state.player.cash = 120;
    state.player.weapon = 'pistol';
    state.player.ammo = PLAYER.pistolAmmoStart;
    state.player.inCar = null;
    state.player.wanted = 0;
    state.player.heat = 0;
    state.player.lastCrime = -999;
    state.player.arrest = 0;
    state.player.coins = 0;
    state.player.kills = 0;
    state.player.carsStolen = 0;
    state.cars = [];
    state.peds = [];
    state.cops = [];
    state.rivals = [];
    state.bullets = [];
    state.particles = [];
    state.pickups = [];
    state.coins = SUN_COINS.map((c) => ({ ...c, taken: false }));
    state.missionIndex = 0;
    state.missionStep = 0;
    state.missionKills = 0;
    state.missionSpawned = false;
    state.collectReady = false;
    state.missionTimer = 0;
    state.missionDone = false;
    state.message = '';
    state.messageUntil = 0;
    state.banner = '';
    state.bannerUntil = 0;
    state.stats = { missionsDone: 0, shotsFired: 0 };
    spawnTraffic(26);
    spawnParked(14);
    spawnPeds(34);
    startMission(0);
  }

  function showMessage(text, seconds = 4) {
    state.message = text;
    state.messageUntil = state.time + seconds;
  }
  function showBanner(text, seconds = 3.5) {
    state.banner = text;
    state.bannerUntil = state.time + seconds;
  }

  function currentMission() {
    return MISSIONS[state.missionIndex] ?? null;
  }
  function currentStep() {
    const m = currentMission();
    return m ? m.steps[state.missionStep] ?? null : null;
  }
  function startMission(index) {
    const m = MISSIONS[index];
    if (!m) return;
    state.missionIndex = index;
    state.missionStep = 0;
    state.missionKills = 0;
    state.missionSpawned = false;
    state.collectReady = false;
    state.missionTimer = 0;
    state.missionDone = false;
    showBanner(m.title, 3.5);
    showMessage(m.intro, 6);
  }
  function advanceStep() {
    const m = currentMission();
    if (!m) return;
    state.missionStep += 1;
    state.missionKills = 0;
    state.missionSpawned = false;
    state.collectReady = false;
    if (state.missionStep >= m.steps.length) {
      state.player.cash += m.reward;
      state.stats.missionsDone += 1;
      showBanner(`Mission complete — $${m.reward}`, 4);
      showMessage('Mission complete. Tia Carmen has paid you.', 5);
      if (state.missionIndex + 1 >= MISSIONS.length) {
        state.missionDone = true;
        return;
      }
      startMission(state.missionIndex + 1);
    }
  }
  function spawnRivals(count, x, y) {
    for (let i = 0; i < count; i += 1) {
      state.rivals.push({
        x: x + random.range(-90, 90), y: y + random.range(-90, 90),
        angle: random.range(0, TAU), health: 60, speed: random.range(70, 95),
        shootCooldown: random.range(0.5, 1.5), alive: true, color: '#8a2a2a',
      });
    }
  }

  function addHeat(amount) {
    const p = state.player;
    p.heat = clamp(p.heat + amount, 0, WANTED.maxHeat);
    p.lastCrime = state.time;
  }
  function wantedStars() {
    return clamp(Math.floor(state.player.heat / WANTED.heatPerStar), 0, 5);
  }

  function nearestCar(x, y, maxDist, kinds) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const car of state.cars) {
      if (kinds && !kinds.includes(car.kind)) continue;
      const d = dist2(x, y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function collideBuildings(x, y, radius) {
    for (const b of state.city.buildings) {
      if (x + radius > b.x && x - radius < b.x + b.w && y + radius > b.y && y - radius < b.y + b.h) return b;
    }
    return null;
  }

  function spawnPoliceCar() {
    const p = state.player;
    const angle = random.range(0, TAU);
    const d = random.range(520, 700);
    // On land only: never in the sea or the harbour water.
    const x = clamp(p.x + Math.cos(angle) * d, 80, WORLD.marinaX - 80);
    const y = clamp(p.y + Math.sin(angle) * d, 80, WORLD.seaY - 80);
    const model = CAR_MODELS[0];
    const car = makeCar(random, model, x, y, angleTo(x, y, p.x, p.y), 'police');
    car.color = '#20242c';
    car.trail = random.int(0, 2);
    state.cars.push(car);
    return car;
  }
  function spawnCop(x, y) {
    state.cops.push({
      x, y, angle: 0, health: 50, speed: 150, shootCooldown: 1, arrestHold: 0,
    });
  }

  function stepPlayer(dt, input) {
    const p = state.player;
    if (p.inCar) {
      const car = p.inCar;
      const model = car.model;
      const fwd = input.up ? 1 : input.down ? -0.55 : 0;
      const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
      car.speed += fwd * model.accel * dt;
      car.speed *= Math.pow(0.4, dt); // drag + rolling resistance
      if (Math.abs(car.speed) > model.topSpeed) car.speed = Math.sign(car.speed) * model.topSpeed;
      if (fwd === 0 && Math.abs(car.speed) < 8) car.speed = 0;
      const turn = steer * model.grip * dt * clamp(Math.abs(car.speed) / 140, 0, 1) * Math.sign(car.speed || 1);
      car.angle += turn;
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      const hit = collideBuildings(nx, ny, car.length / 2 - 6);
      if (hit) {
        car.speed *= -0.25;
        car.health -= Math.abs(car.speed) * 0.02 + 2;
        if (Math.abs(car.speed) > 240) addHeat(WANTED.crime.damageCar, null);
      } else {
        car.x = clamp(nx, 30, WORLD.marinaX - 30);
        car.y = clamp(ny, 30, WORLD.seaY - 30);
      }
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      p.speed = car.speed;
      if (car.health <= 0) {
        // The car burns out; Rico bails out on foot.
        car.kind = 'wreck';
        car.speed = 0;
        p.inCar = null;
        p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 40;
        p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 40;
        showMessage('Your car is wrecked!', 3);
        burst(p.x, p.y, '#e5534b', 26);
      }
    } else {
      const mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      const len = Math.hypot(mx, my);
      if (len > 0) {
        p.angle = Math.atan2(my, mx);
        const nx = p.x + (mx / len) * PLAYER.walkSpeed * dt;
        const ny = p.y + (my / len) * PLAYER.walkSpeed * dt;
        if (!collideBuildings(nx, p.y, PLAYER.radius)) p.x = clamp(nx, 30, WORLD.marinaX - 30);
        if (!collideBuildings(p.x, ny, PLAYER.radius)) p.y = clamp(ny, 30, WORLD.seaY - 30);
      }
      p.speed = len > 0 ? PLAYER.walkSpeed : 0;
      if (input.aim) p.angle = Math.atan2(input.aimY - p.y, input.aimX - p.x);
    }
  }

  /** The road-graph node nearest a point. */
  function nearestNodeId(x, y) {
    const gx = Math.round(x / WORLD.roadSpacing);
    const gy = Math.round(y / WORLD.roadSpacing);
    const id = city.nodeIndex.get(`${gx},${gy}`);
    if (id !== undefined) return id;
    let best = 0;
    let bestD = Infinity;
    for (const node of city.nodes) {
      const d = dist2(x, y, node.x, node.y);
      if (d < bestD) {
        bestD = d;
        best = node.id;
      }
    }
    return best;
  }

  /** The next intersection for a traffic car: a neighbouring node, not the one it came from. */
  function pickNextNode(car, node) {
    const options = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const id = city.nodeIndex.get(`${node.gx + dx},${node.gy + dy}`);
      if (id !== undefined && id !== car.fromNode) options.push(id);
    }
    if (options.length === 0) {
      const back = city.nodeIndex.get(`${node.gx},${node.gy}`);
      return back !== undefined ? back : node.id;
    }
    // Prefer to keep going straight.
    const straight = options.filter((id) => {
      const n = city.nodes[id];
      const dir = Math.atan2(n.y - node.y, n.x - node.x);
      return Math.abs(angleDiff(dir, car.angle)) < 0.5;
    });
    if (straight.length > 0 && random.chance(0.6)) return random.pick(straight);
    return random.pick(options);
  }

  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (car.kind === 'parked' || car.kind === 'wreck' || car.kind === 'player') continue;
      if (car.kind === 'police') {
        stepPoliceCar(car, dt);
        continue;
      }
      // Traffic follows the road graph: one intersection at a time, so it
      // stays on the roads instead of cutting across blocks.
      let target = state.city.nodes[car.targetNode];
      if (!target) {
        car.targetNode = nearestNodeId(car.x, car.y);
        continue;
      }
      const dx = target.x - car.x;
      const dy = target.y - car.y;
      const d = Math.hypot(dx, dy);
      if (d < 24) {
        car.fromNode = car.targetNode;
        car.targetNode = pickNextNode(car, target);
        continue;
      }
      const want = Math.atan2(dy, dx);
      const turn = angleDiff(want, car.angle);
      car.angle += clamp(turn, -2.6 * dt, 2.6 * dt);
      // Slow down for the car ahead in this lane, parked or moving.
      let slow = false;
      for (const other of state.cars) {
        if (other === car) continue;
        const ox = other.x - car.x;
        const oy = other.y - car.y;
        const dd = ox * ox + oy * oy;
        if (dd < 110 * 110) {
          const ahead = Math.cos(car.angle) * ox + Math.sin(car.angle) * oy;
          const lateral = Math.abs(-Math.sin(car.angle) * ox + Math.cos(car.angle) * oy);
          if (ahead > 0 && lateral < 24) slow = true;
        }
      }
      // And slow down for a sharp turn at the junction.
      const cruise = slow ? 0 : car.model.topSpeed * 0.42 * (Math.abs(turn) > 0.7 ? 0.4 : 1);
      car.speed += clamp(cruise - car.speed, -260 * dt, 200 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      car.x = clamp(car.x, 30, WORLD.marinaX - 30);
      car.y = clamp(car.y, 30, WORLD.seaY - 30);
    }
  }

  /** The neighbouring node that gets a patrol car closest to its goal. */
  function pickPursuitNode(car, node, goalId) {
    const goal = state.city.nodes[goalId];
    let best = null;
    let bestD = Infinity;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const id = city.nodeIndex.get(`${node.gx + dx},${node.gy + dy}`);
      if (id === undefined || id === car.fromNode) continue;
      const n = city.nodes[id];
      const d = dist2(n.x, n.y, goal.x, goal.y);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    if (best !== null) return best;
    // Nowhere else to go: turn back the way it came.
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const id = city.nodeIndex.get(`${node.gx + dx},${node.gy + dy}`);
      if (id !== undefined) return id;
    }
    return node.id;
  }

  function stepPoliceCar(car, dt) {
    const p = state.player;
    const d = Math.hypot(p.x - car.x, p.y - car.y);
    let want;
    if (d < 170) {
      // Close in: direct pursuit, and ram.
      want = Math.atan2(p.y - car.y, p.x - car.x);
    } else {
      // Route along the road graph toward the player's intersection, so the
      // patrol car stays on the roads instead of cutting across blocks.
      const playerNode = nearestNodeId(p.x, p.y);
      let target = state.city.nodes[car.targetNode];
      if (!target) {
        car.targetNode = nearestNodeId(car.x, car.y);
        target = state.city.nodes[car.targetNode];
      }
      const td = Math.hypot(target.x - car.x, target.y - car.y);
      if (td < 24) {
        car.fromNode = car.targetNode;
        car.targetNode = pickPursuitNode(car, target, playerNode);
        target = state.city.nodes[car.targetNode];
      }
      want = Math.atan2(target.y - car.y, target.x - car.x);
    }
    car.angle += clamp(angleDiff(want, car.angle), -3.2 * dt, 3.2 * dt);
    const cruise = d > 130 ? car.model.topSpeed * 0.62 : car.model.topSpeed * 0.3;
    car.speed += clamp(cruise - car.speed, -420 * dt, 380 * dt);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    if (!collideBuildings(nx, ny, car.length / 2 - 6)) {
      car.x = clamp(nx, 30, WORLD.marinaX - 30);
      car.y = clamp(ny, 30, WORLD.seaY - 30);
    } else {
      car.speed *= 0.4;
    }
    car.sirenPhase += dt * 6;
    // Ram the player's car.
    if (p.inCar && d < (car.length + p.inCar.length) / 2 + 6) {
      p.inCar.health -= 14 * dt;
      p.inCar.speed *= 0.985;
      if (random.chance(dt * 2)) burst(p.inCar.x, p.inCar.y, '#f2c94c', 4);
    }
    // Close in on foot: an officer gets out and chases.
    if (!p.inCar && d < 170 && state.cops.length < 8 && random.chance(dt * 0.7)) {
      spawnCop(car.x, car.y);
    }
  }

  function stepPeds(dt) {
    const p = state.player;
    for (const ped of state.peds) {
      if (ped.panic > 0) {
        ped.panic -= dt;
        // Flee away from the player / the gunfire.
        const away = Math.atan2(ped.y - p.y, ped.x - p.x);
        ped.angle = away;
        ped.x += Math.cos(away) * ped.speed * 2.4 * dt;
        ped.y += Math.sin(away) * ped.speed * 2.4 * dt;
      } else {
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
        if (random.chance(dt * 0.1)) ped.angle = random.range(0, TAU);
        // Stay near roads: wander back toward the nearest intersection.
        if (ped.x < 60 || ped.x > WORLD.width - 60 || ped.y < 60 || ped.y > WORLD.height - 60) {
          ped.angle = Math.atan2(WORLD.height / 2 - ped.y, WORLD.width / 2 - ped.x);
        }
      }
      ped.x = clamp(ped.x, 30, WORLD.marinaX - 30);
      ped.y = clamp(ped.y, 30, WORLD.seaY - 30);
      if (collideBuildings(ped.x, ped.y, 10)) {
        ped.angle += Math.PI / 2;
        ped.x = clamp(ped.x - Math.cos(ped.angle) * 12, 30, WORLD.width - 30);
        ped.y = clamp(ped.y - Math.sin(ped.angle) * 12, 30, WORLD.height - 30);
      }
    }
  }

  function stepCops(dt) {
    const p = state.player;
    for (let i = state.cops.length - 1; i >= 0; i -= 1) {
      const cop = state.cops[i];
      const d = Math.hypot(p.x - cop.x, p.y - cop.y);
      cop.angle = Math.atan2(p.y - cop.y, p.x - cop.x);
      if (d > 26) {
        cop.x = clamp(cop.x + Math.cos(cop.angle) * cop.speed * dt, 30, WORLD.marinaX - 30);
        cop.y = clamp(cop.y + Math.sin(cop.angle) * cop.speed * dt, 30, WORLD.seaY - 30);
      }
      if (d < 30) {
        // Arrest only works on foot: a moving car cannot be held still.
        if (!p.inCar) {
          cop.arrestHold += dt;
          p.arrest = Math.max(p.arrest, cop.arrestHold);
          if (cop.arrestHold > 1.5) return EVENT_BUSTED;
        } else {
          cop.arrestHold = 0;
          p.arrest = 0;
        }
      } else {
        cop.arrestHold = 0;
        p.arrest = 0;
      }
      cop.shootCooldown -= dt;
      if (d < 380 && d > 60 && cop.shootCooldown <= 0 && p.wanted >= 2) {
        cop.shootCooldown = random.range(0.9, 1.6);
        state.bullets.push({
          x: cop.x, y: cop.y, angle: cop.angle + random.range(-0.08, 0.08),
          speed: 900, life: 0.5, from: 'cop', damage: 7,
        });
        burst(cop.x + Math.cos(cop.angle) * 20, cop.y + Math.sin(cop.angle) * 20, '#ffd76a', 3);
      }
      if (cop.health <= 0) state.cops.splice(i, 1);
    }
    return EVENT_NONE;
  }

  function stepRivals(dt) {
    const p = state.player;
    for (let i = state.rivals.length - 1; i >= 0; i -= 1) {
      const r = state.rivals[i];
      if (!r.alive) continue;
      const d = Math.hypot(p.x - r.x, p.y - r.y);
      r.angle = Math.atan2(p.y - r.y, p.x - r.x);
      if (d > 240) {
        r.x = clamp(r.x + Math.cos(r.angle) * r.speed * dt, 30, WORLD.marinaX - 30);
        r.y = clamp(r.y + Math.sin(r.angle) * r.speed * dt, 30, WORLD.seaY - 30);
      } else if (d < 120) {
        r.x = clamp(r.x - Math.cos(r.angle) * r.speed * 0.5 * dt, 30, WORLD.marinaX - 30);
        r.y = clamp(r.y - Math.sin(r.angle) * r.speed * 0.5 * dt, 30, WORLD.seaY - 30);
      }
      r.shootCooldown -= dt;
      if (d < 420 && r.shootCooldown <= 0) {
        r.shootCooldown = random.range(0.8, 1.5);
        state.bullets.push({
          x: r.x, y: r.y, angle: r.angle + random.range(-0.1, 0.1),
          speed: 880, life: 0.55, from: 'rival', damage: 8,
        });
        burst(r.x + Math.cos(r.angle) * 20, r.y + Math.sin(r.angle) * 20, '#ffd76a', 3);
      }
      if (r.health <= 0) {
        r.alive = false;
        burst(r.x, r.y, '#e5534b', 18);
        state.player.kills += 1;
        state.missionKills += 1;
        addHeat(WANTED.crime.killPed, null);
        state.rivals.splice(i, 1);
      }
    }
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i += 1) {
      const a = random.range(0, TAU);
      const s = random.range(40, 220);
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: random.range(0.3, 0.8), max: 0.8, color });
    }
  }

  function stepBullets(dt) {
    const p = state.player;
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += Math.cos(b.angle) * b.speed * dt;
      b.y += Math.sin(b.angle) * b.speed * dt;
      b.life -= dt;
      let dead = b.life <= 0 || collideBuildings(b.x, b.y, 2);
      if (!dead && b.from === 'player') {
        for (const ped of state.peds) {
          if (dist2(b.x, b.y, ped.x, ped.y) < 16 * 16) {
            burst(ped.x, ped.y, '#e5534b', 10);
            state.peds.splice(state.peds.indexOf(ped), 1);
            p.kills += 1;
            addHeat(WANTED.crime.killPed, 'ped');
            dead = true;
            break;
          }
        }
        if (!dead) for (const cop of state.cops) {
          if (dist2(b.x, b.y, cop.x, cop.y) < 16 * 16) {
            cop.health -= PLAYER.pistolDamage;
            burst(cop.x, cop.y, '#e5534b', 8);
            if (cop.health <= 0) addHeat(WANTED.crime.killCop, 'cop');
            dead = true;
            break;
          }
        }
        if (!dead) for (const r of state.rivals) {
          if (dist2(b.x, b.y, r.x, r.y) < 16 * 16) {
            r.health -= PLAYER.pistolDamage;
            burst(r.x, r.y, '#e5534b', 8);
            dead = true;
            break;
          }
        }
        if (!dead) for (const car of state.cars) {
          if (car.kind === 'police' && dist2(b.x, b.y, car.x, car.y) < 30 * 30) {
            car.health -= PLAYER.pistolDamage * 0.5;
            burst(b.x, b.y, '#f2c94c', 5);
            if (car.health <= 0) {
              car.kind = 'wreck';
              burst(car.x, car.y, '#e5534b', 24);
              addHeat(WANTED.crime.killCop, 'cop');
            }
            dead = true;
            break;
          }
        }
      }
      if (!dead && b.from !== 'player') {
        const inCar = p.inCar;
        const tx = inCar ? inCar.x : p.x;
        const ty = inCar ? inCar.y : p.y;
        const radius = inCar ? 34 : 16;
        if (dist2(b.x, b.y, tx, ty) < radius * radius) {
          hurtPlayer(b.damage);
          dead = true;
        }
      }
      if (dead) state.bullets.splice(i, 1);
    }
  }

  function hurtPlayer(damage) {
    const p = state.player;
    let left = damage;
    if (p.armor > 0) {
      const absorbed = Math.min(p.armor, left);
      p.armor -= absorbed;
      left -= absorbed;
    }
    p.health -= left;
    if (p.health <= 0) {
      p.health = 0;
    }
  }

  function stepParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.94;
      pt.vy *= 0.94;
      pt.life -= dt;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }
  }

  function stepWanted(dt) {
    const p = state.player;
    p.wanted = wantedStars();
    if (state.time - p.lastCrime > WANTED.decayDelay && p.heat > 0) {
      p.heat = Math.max(0, p.heat - WANTED.decayRate * dt);
    }
    // Police presence scales with the wanted level.
    const wantCars = p.wanted >= 1 ? Math.min(p.wanted, 3) : 0;
    const policeCars = state.cars.filter((c) => c.kind === 'police').length;
    if (policeCars < wantCars && random.chance(dt * 0.8)) spawnPoliceCar();
    if (p.wanted === 0) {
      for (let i = state.cars.length - 1; i >= 0; i -= 1) {
        if (state.cars[i].kind === 'police') state.cars.splice(i, 1);
      }
      state.cops.length = 0;
    }
    const wantCops = p.wanted >= 3 ? (p.wanted - 2) * 2 : 0;
    if (state.cops.length < wantCops && random.chance(dt * 0.5)) {
      const a = random.range(0, TAU);
      spawnCop(clamp(p.x + Math.cos(a) * 420, 60, WORLD.marinaX - 60), clamp(p.y + Math.sin(a) * 420, 60, WORLD.seaY - 60));
    }
  }

  function stepCoins() {
    const p = state.player;
    for (const coin of state.coins) {
      if (!coin.taken && dist2(p.x, p.y, coin.x, coin.y) < 30 * 30) {
        coin.taken = true;
        p.coins += 1;
        p.cash += 250;
        burst(coin.x, coin.y, '#f2c94c', 20);
        showMessage(`Sun Coin found! ${p.coins}/8 — +$250`, 3);
      }
    }
  }

  function stepMission(dt) {
    const m = currentMission();
    const step = currentStep();
    if (!m || !step) return;
    const p = state.player;
    if (step.type === 'steal') {
      if (p.inCar) advanceStep();
    } else if (step.type === 'goto') {
      if (dist2(p.x, p.y, step.x, step.y) < 70 * 70) advanceStep();
    } else if (step.type === 'kill') {
      if (state.rivals.length === 0 && state.missionKills === 0 && !state.missionSpawned) {
        state.missionSpawned = true;
        spawnRivals(step.count, step.x, step.y);
      }
      if (state.missionKills >= step.count) advanceStep();
    } else if (step.type === 'collect') {
      if (dist2(p.x, p.y, step.x, step.y) < 60 * 60 && state.collectReady) {
        state.collectReady = false;
        if (m.id === 'm6') {
          p.cash += 0; // the score pays out at the safehouse
          showMessage('Vault emptied — now run!', 3);
          addHeat(100, null); // five stars: the whole SBPD is coming
        }
        advanceStep();
      }
    } else if (step.type === 'timed') {
      if (state.missionTimer <= 0) state.missionTimer = step.seconds;
      state.missionTimer -= dt;
      if (dist2(p.x, p.y, step.x, step.y) < 70 * 70) advanceStep();
      else if (state.missionTimer <= 0) {
        showMessage('Too slow — Tia Carmen is not happy. Try again.', 4);
        state.missionStep = 0;
        state.missionTimer = 0;
        p.x = PLACES.garage.x;
        p.y = PLACES.garage.y + 80;
      }
    } else if (step.type === 'escape') {
      const inZone = dist2(p.x, p.y, step.x, step.y) < 80 * 80;
      if (inZone && p.wanted === 0) {
        advanceStep();
      } else if (inZone && p.wanted > 0) {
        showMessage('Lose the cops first — your wanted level must be clear.', 3);
      }
    }
    if (state.missionDone) return;
  }

  function stepPlaces() {
    const p = state.player;
    // Pay 'n Spray: drive in, lose the heat, fix the car.
    if (p.inCar && dist2(p.x, p.y, PLACES.spray.x, PLACES.spray.y) < 60 * 60) {
      if (p.heat > 0 || p.inCar.health < 100) {
        if (p.cash >= 100) {
          p.cash -= 100;
          p.heat = 0;
          p.wanted = 0;
          p.inCar.health = 100;
          showMessage('Pay \u2019n Spray: fresh paint, clean record. -$100', 3);
        }
      }
    }
    // Hospital: walk in to heal.
    if (!p.inCar && dist2(p.x, p.y, PLACES.hospital.x, PLACES.hospital.y) < 55 * 55 && p.health < PLAYER.health) {
      if (p.cash >= 50) {
        p.cash -= 50;
        p.health = PLAYER.health;
        showMessage('Solmar General: patched up. -$50', 3);
      }
    }
  }

  function fireWeapon() {
    const p = state.player;
    if (p.inCar) return;
    if (p.weapon === 'pistol') {
      if (p.ammo <= 0) {
        showMessage('Out of ammo — visit the gun shop.', 2.5);
        return;
      }
      p.ammo -= 1;
      state.stats.shotsFired += 1;
      const a = p.angle;
      state.bullets.push({
        x: p.x + Math.cos(a) * 22, y: p.y + Math.sin(a) * 22,
        angle: a + (random.next() - 0.5) * 0.03, speed: 1100, life: 0.45, from: 'player', damage: PLAYER.pistolDamage,
      });
      burst(p.x + Math.cos(a) * 24, p.y + Math.sin(a) * 24, '#ffd76a', 4);
      for (const ped of state.peds) {
        if (dist2(p.x, p.y, ped.x, ped.y) < 420 * 420) ped.panic = 3;
      }
      const nearCop = state.cops.some((c) => dist2(p.x, p.y, c.x, c.y) < 380 * 380)
        || state.cars.some((c) => c.kind === 'police' && dist2(p.x, p.y, c.x, c.y) < 380 * 380);
      if (nearCop) addHeat(WANTED.crime.shootNearCop, null);
    } else {
      // Fists: a short swing in front of Rico.
      const a = p.angle;
      const hx = p.x + Math.cos(a) * 30;
      const hy = p.y + Math.sin(a) * 30;
      burst(hx, hy, '#f2f0e6', 3);
      for (const ped of state.peds) {
        if (dist2(hx, hy, ped.x, ped.y) < 30 * 30) {
          state.peds.splice(state.peds.indexOf(ped), 1);
          p.kills += 1;
          addHeat(WANTED.crime.killPed, 'ped');
        }
      }
      for (const cop of state.cops) {
        if (dist2(hx, hy, cop.x, cop.y) < 30 * 30) cop.health -= PLAYER.fistDamage;
      }
      for (const r of state.rivals) {
        if (dist2(hx, hy, r.x, r.y) < 30 * 30) r.health -= PLAYER.fistDamage;
      }
    }
  }

  function interact() {
    const p = state.player;
    const step = currentStep();
    // Mission pickup / vault.
    if (step && step.type === 'collect' && dist2(p.x, p.y, step.x, step.y) < 60 * 60) {
      state.collectReady = true;
      return;
    }
    // Gun shop: buy pistol ammo.
    if (!p.inCar && dist2(p.x, p.y, PLACES.gunshop.x, PLACES.gunshop.y) < 60 * 60) {
      if (p.cash >= 50) {
        p.cash -= 50;
        p.ammo += 24;
        showMessage('Ammo-Nation: +24 pistol rounds. -$50', 3);
      } else {
        showMessage('Not enough cash for ammo.', 2.5);
      }
      return;
    }
    // Enter / exit cars.
    if (p.inCar) {
      const car = p.inCar;
      p.inCar = null;
      p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 42;
      p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 42;
      return;
    }
    const car = nearestCar(p.x, p.y, 64, ['parked', 'traffic']);
    if (car) {
      if (car.kind === 'parked' || car.kind === 'traffic') {
        if (car.kind === 'traffic') {
          // Jacking a moving car: the driver bails and runs.
          state.peds.push({
            x: car.x, y: car.y, angle: random.range(0, TAU), speed: 90, panic: 5,
            color: '#e8d8b0', shirt: '#3f6fb5',
          });
          addHeat(WANTED.crime.steal, 'steal');
          showMessage('You jacked the car!', 2.5);
        } else {
          addHeat(WANTED.crime.steal, 'steal');
        }
        car.kind = 'player';
        car.driver = false;
        p.inCar = car;
        p.carsStolen += 1;
        p.x = car.x;
        p.y = car.y;
      }
    }
  }

  /** Keep cars from sitting on top of each other at junctions. */
  function separateCars() {
    const cars = state.cars;
    for (let i = 0; i < cars.length; i += 1) {
      const a = cars[i];
      const wa = a.kind === 'wreck' || a.kind === 'parked' ? 0 : 1;
      for (let j = i + 1; j < cars.length; j += 1) {
        const b = cars[j];
        const wb = b.kind === 'wreck' || b.kind === 'parked' ? 0 : 1;
        if (wa + wb === 0) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const min = 52;
        if (d2 >= min * min || d2 < 0.01) continue;
        const d = Math.sqrt(d2);
        const overlap = min - d;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * overlap * (wa / (wa + wb));
        a.y -= ny * overlap * (wa / (wa + wb));
        b.x += nx * overlap * (wb / (wa + wb));
        b.y += ny * overlap * (wb / (wa + wb));
      }
    }
  }

  function step(dt, input) {
    state.time += dt;
    state.clock = (state.clockBase + state.time * 0.5) % (24 * 60); // 1 real second = 30 game seconds
    stepPlayer(dt, input);
    stepTraffic(dt);
    separateCars();
    stepPeds(dt);
    const busted = stepCops(dt);
    if (busted) return busted;
    stepRivals(dt);
    stepBullets(dt);
    stepParticles(dt);
    stepWanted(dt);
    stepCoins();
    stepMission(dt);
    stepPlaces();
    if (input.fire) fireWeapon();
    if (input.interact) interact();
    if (input.weapon) {
      state.player.weapon = state.player.weapon === 'pistol' ? 'fists' : 'pistol';
      showMessage(state.player.weapon === 'pistol' ? 'Pistol' : 'Fists', 1.2);
    }
    if (state.player.health <= 0) return EVENT_WASTED;
    if (state.missionDone) return EVENT_WIN;
    return EVENT_NONE;
  }

  function respawn(kind) {
    const p = state.player;
    p.health = PLAYER.health;
    p.armor = 0;
    p.heat = 0;
    p.wanted = 0;
    p.arrest = 0;
    p.inCar = null;
    p.x = PLACES.hospital.x;
    p.y = PLACES.hospital.y + 90;
    if (kind === 'wasted') p.cash = Math.max(0, p.cash - 100);
    if (kind === 'busted') p.cash = Math.max(0, p.cash - 200);
    state.cops.length = 0;
    for (let i = state.cars.length - 1; i >= 0; i -= 1) {
      if (state.cars[i].kind === 'police') state.cars.splice(i, 1);
    }
  }

  reset();

  return {
    state, reset, step, interact, fireWeapon, startMission, currentMission, currentStep,
    wantedStars, districtAt, respawn, showMessage, showBanner,
  };
}
