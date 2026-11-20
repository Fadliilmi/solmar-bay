// Solmar Bay — the whole simulation: seeded city, traffic, police, rivals,
// missions, combat and the wanted system. One fixed step (1/60 s) advances
// everything in a fixed order so a given seed always plays the same way.

import {
  WORLD_W, WORLD_H, GRID, ROAD_W, SEA_Y, HARBOUR_X, SAND_Y,
  CAR_MODELS, PLACES, PLAYER, WANTED, SUN_COINS, COIN_VALUE, MISSIONS,
  districtAt, DISTRICT_STYLE,
} from './config.js';
import { makeRng } from './random.js';

const TAU = Math.PI * 2;
const HOSPITAL = { x: 1050, y: 1740 };

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}
function turnToward(angle, target, maxStep) {
  const d = angDiff(target, angle);
  if (Math.abs(d) <= maxStep) return target;
  return angle + Math.sign(d) * maxStep;
}
export function onLand(x, y) {
  return x >= 30 && x < HARBOUR_X - 10 && y >= 30 && y < SEA_Y - 10;
}

function burst(g, x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = g.rng.next() * TAU;
    const s = g.rng.range(30, speed);
    g.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: g.rng.range(0.3, 0.7), max: 0.7, color, size: g.rng.range(2, 5),
    });
  }
}

function addHeat(g, amount) {
  g.player.heat = Math.min(WANTED.maxHeat, g.player.heat + amount);
  g.player.lastCrime = g.time;
}

// ---------------------------------------------------------------- city ---

function buildCity(rng) {
  const nodes = new Map();
  for (let ix = 0; ix <= WORLD_W / GRID; ix++) {
    for (let iy = 0; iy <= WORLD_H / GRID; iy++) {
      const x = ix * GRID;
      const y = iy * GRID;
      if (y >= SEA_Y || x >= HARBOUR_X) continue;
      nodes.set(ix + ',' + iy, { x, y, ix, iy });
    }
  }
  const blocks = [];
  const buildings = [];
  const trees = [];
  for (let ix = 0; ix < WORLD_W / GRID; ix++) {
    for (let iy = 0; iy < WORLD_H / GRID; iy++) {
      const c = [
        nodes.get(ix + ',' + iy), nodes.get((ix + 1) + ',' + iy),
        nodes.get(ix + ',' + (iy + 1)), nodes.get((ix + 1) + ',' + (iy + 1)),
      ];
      if (c.some((n) => !n)) continue;
      const x0 = ix * GRID;
      const y0 = iy * GRID;
      const cx = x0 + GRID / 2;
      const cy = y0 + GRID / 2;
      const district = districtAt(cx, cy);
      const block = { x0, y0, x1: x0 + GRID, y1: y0 + GRID, district, buildings: [], trees: [] };
      blocks.push(block);
      const inset = 44;
      if (district === 'Palm Park') {
        const n = rng.int(14, 20);
        for (let i = 0; i < n; i++) {
          trees.push({ x: rng.range(x0 + 30, x0 + GRID - 30), y: rng.range(y0 + 30, y0 + GRID - 30), r: rng.range(9, 15) });
        }
        continue;
      }
      if (district === 'Beachfront') {
        const n = rng.int(2, 4);
        for (let i = 0; i < n; i++) {
          trees.push({ x: rng.range(x0 + 30, x0 + GRID - 30), y: rng.range(y0 + 30, y0 + GRID - 30), r: rng.range(9, 14) });
        }
        continue;
      }
      const style = DISTRICT_STYLE[district];
      const count = district === 'Downtown' ? rng.int(2, 4) : rng.int(1, 3);
      for (let b = 0; b < count; b++) {
        for (let attempt = 0; attempt < 14; attempt++) {
          const w = rng.range(56, 120);
          const h = rng.range(56, 120);
          const x = rng.range(x0 + inset, x0 + GRID - inset - w);
          const y = rng.range(y0 + inset, y0 + GRID - inset - h);
          const cxb = x + w / 2;
          const cyb = y + h / 2;
          let clear = true;
          for (const p of PLACES) {
            if (dist(cxb, cyb, p.x, p.y) < 90 + Math.max(w, h) / 2) { clear = false; break; }
          }
          if (clear) {
            for (const o of buildings) {
              if (x < o.x + o.w + 14 && x + w + 14 > o.x && y < o.y + o.h + 14 && y + h + 14 > o.y) { clear = false; break; }
            }
          }
          if (!clear) continue;
          const bld = {
            x, y, w, h, district,
            roof: rng.pick(style.roofs),
            height: rng.range(style.hMin, style.hMax),
            lit: rng.next() < 0.55,
            hash: rng.next(),
          };
          buildings.push(bld);
          block.buildings.push(bld);
          break;
        }
      }
    }
  }
  const piers = [1050, 1350, 1650].map((y) => ({ x: HARBOUR_X, y: y - 13, len: 150, w: 26 }));
  return { nodes, blocks, buildings, trees, piers };
}

function pointInBuilding(city, x, y, pad) {
  for (const b of city.buildings) {
    if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return b;
  }
  return null;
}

// Slide a circle along buildings, axis by axis, returning the new position.
function collideMove(city, x, y, nx, ny, r) {
  if (!pointInBuilding(city, nx, y, r)) x = nx;
  if (!pointInBuilding(city, x, ny, r)) y = ny;
  return { x, y };
}

function nearestNode(city, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const n of city.nodes.values()) {
    const d = dist(x, y, n.x, n.y);
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

function nodeNeighbours(city, node) {
  const out = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const n = city.nodes.get((node.ix + dx) + ',' + (node.iy + dy));
    if (n) out.push(n);
  }
  return out;
}

// ---------------------------------------------------------------- game ---

export function createGame(seed) {
  const rng = makeRng(seed);
  const city = buildCity(rng);
  const g = {
    seed,
    rng,
    time: 0,
    clockMin: 480, // 08:00
    city,
    player: {
      x: PLAYER.startX, y: PLAYER.startY, angle: -Math.PI / 2, speed: 0,
      health: PLAYER.health, armour: 0, cash: PLAYER.startCash,
      weapon: 'pistol', ammo: PLAYER.pistolAmmoStart, car: null,
      heat: 0, lastCrime: -999, arrest: 0, fireCd: 0,
      coins: SUN_COINS.map(() => false), coinsTaken: 0,
      kills: 0, carsStolen: 0, aimX: PLAYER.startX, aimY: PLAYER.startY - 100,
    },
    cars: [],
    peds: [],
    officers: [],
    rivals: [],
    bullets: [],
    particles: [],
    missionIdx: 0,
    missionStep: 0,
    missionKills: 0,
    rivalsSpawned: false,
    missionTimer: null,
    officerSpawnT: 0,
    banner: null,
    message: null,
    messageUntil: 0,
    hintUntil: 0,
    stats: { missionsDone: 0, shots: 0 },
    outcome: null,
    events: [],
  };

  // 26 traffic cars on the road graph.
  const nodeList = [...city.nodes.values()];
  for (let i = 0; i < 26; i++) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const n = rng.pick(nodeList);
      const x = n.x + rng.range(-40, 40);
      const y = n.y + rng.range(-40, 40);
      if (!onLand(x, y)) continue;
      if (g.cars.some((c) => dist(c.x, c.y, x, y) < 56)) continue;
      const model = rng.int(0, CAR_MODELS.length - 1);
      const m = CAR_MODELS[model];
      const nbrs = nodeNeighbours(city, n);
      const target = nbrs.length ? rng.pick(nbrs) : n;
      g.cars.push({
        id: g.cars.length, model, x, y,
        angle: rng.next() * TAU, speed: 0, health: 100,
        kind: 'traffic', color: rng.pick(m.colors),
        from: n, target, ramCd: 0, officerCd: 0,
      });
      break;
    }
  }
  // 14 parked cars near intersections.
  for (let i = 0; i < 14; i++) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const n = rng.pick(nodeList);
      const dir = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
      const along = rng.range(90, 140);
      const x = n.x + dir[0] * along + rng.range(-8, 8);
      const y = n.y + dir[1] * along + rng.range(-8, 8);
      if (!onLand(x, y) || pointInBuilding(city, x, y, 20)) continue;
      if (g.cars.some((c) => dist(c.x, c.y, x, y) < 70)) continue;
      const model = rng.int(0, CAR_MODELS.length - 1);
      const m = CAR_MODELS[model];
      g.cars.push({
        id: g.cars.length, model, x, y,
        angle: dir[0] !== 0 ? 0 : Math.PI / 2, speed: 0, health: 100,
        kind: 'parked', color: rng.pick(m.colors),
        from: n, target: n, ramCd: 0, officerCd: 0,
      });
      break;
    }
  }
  // 34 pedestrians near intersections.
  const shirts = ['#d8d8d8', '#3f6fb5', '#c23b2e', '#e8a020', '#7a2ea6', '#2fa8a0', '#e86a8a'];
  const skins = ['#e8b98a', '#c98d5f', '#8a5a3b', '#f2c9a0'];
  for (let i = 0; i < 34; i++) {
    const n = rng.pick(nodeList);
    g.peds.push({
      x: clamp(n.x + rng.range(-120, 120), 30, WORLD_W - 30),
      y: clamp(n.y + rng.range(-120, 120), 30, WORLD_H - 30),
      angle: rng.next() * TAU,
      speed: rng.range(28, 55),
      shirt: rng.pick(shirts), skin: rng.pick(skins),
      panicT: 0, turnT: rng.range(1, 4),
    });
  }

  beginStep(g);
  return g;
}

export function wantedStars(g) {
  return Math.min(5, Math.floor(g.player.heat / WANTED.heatPerStar));
}

export function currentMission(g) {
  return MISSIONS[g.missionIdx] || null;
}

export function currentStep(g) {
  const m = currentMission(g);
  return m ? m.steps[g.missionStep] : null;
}

export function stepTarget(g) {
  const s = currentStep(g);
  if (!s || s.kind === 'steal') return null;
  return { x: s.x, y: s.y };
}

export function showBanner(g, title, sub, seconds) {
  g.banner = { title, sub, until: g.time + (seconds || 4) };
}

export function showMessage(g, text, seconds) {
  g.message = text;
  g.messageUntil = g.time + (seconds || 3.5);
}

function beginStep(g) {
  const s = currentStep(g);
  g.rivalsSpawned = false;
  g.missionKills = 0;
  g.missionTimer = s && s.kind === 'timed' ? s.seconds : null;
}

function completeStep(g) {
  const m = currentMission(g);
  const s = currentStep(g);
  if (!m || !s) return;
  g.missionStep++;
  if (g.missionStep >= m.steps.length) {
    g.player.cash += m.reward;
    g.stats.missionsDone++;
    g.events.push({ type: 'mission' });
    showBanner(g, m.title + ' — Complete', '+$' + m.reward, 4);
    g.missionIdx++;
    g.missionStep = 0;
    if (g.missionIdx >= MISSIONS.length) {
      g.outcome = 'win';
      g.events.push({ type: 'win' });
      return;
    }
    const next = currentMission(g);
    showMessage(g, next.intro, 6);
  }
  beginStep(g);
}

function spawnRivals(g, x, y, count) {
  for (let i = 0; i < count; i++) {
    g.rivals.push({
      x: clamp(x + g.rng.range(-60, 60), 30, WORLD_W - 30),
      y: clamp(y + g.rng.range(-60, 60), 30, WORLD_H - 30),
      angle: 0, health: 60, speed: g.rng.range(70, 95),
      shootCd: g.rng.range(0.5, 1.2),
    });
  }
  g.rivalsSpawned = true;
}

export function setMission(g, idx, stepIdx) {
  g.missionIdx = idx;
  g.missionStep = stepIdx || 0;
  const m = currentMission(g);
  if (m) showBanner(g, m.title, m.steps[g.missionStep].label, 4);
  beginStep(g);
}

function hurtPlayer(g, dmg) {
  const p = g.player;
  let left = dmg;
  if (p.armour > 0) {
    const absorbed = Math.min(p.armour, left);
    p.armour -= absorbed;
    left -= absorbed;
  }
  p.health -= left;
  if (p.health <= 0) {
    p.health = 0;
    g.outcome = 'wasted';
    g.events.push({ type: 'wasted' });
  }
}

export function respawn(g, fine) {
  const p = g.player;
  p.health = PLAYER.health;
  p.armour = 0;
  p.heat = 0;
  p.arrest = 0;
  p.car = null;
  p.x = HOSPITAL.x;
  p.y = HOSPITAL.y;
  p.angle = -Math.PI / 2;
  p.speed = 0;
  p.cash = Math.max(0, p.cash - fine);
  g.cars = g.cars.filter((c) => c.kind !== 'police');
  g.officers = [];
  g.rivals = [];
  g.bullets = [];
  g.outcome = null;
}

// ------------------------------------------------------------------ step ---

export function stepGame(g, input, dt) {
  const p = g.player;
  g.time += dt;
  g.clockMin = (g.clockMin + 0.5 * dt) % 1440;
  if (p.fireCd > 0) p.fireCd -= dt;

  // --- player ------------------------------------------------------
  const mv = input.moveVector();
  if (p.car) {
    const car = p.car;
    const model = CAR_MODELS[car.model];
    const forward = -mv.y; // W / up = forward
    if (forward > 0) car.speed += model.accel * dt;
    else if (forward < 0) car.speed -= model.accel * 0.55 * dt;
    car.speed -= car.speed * 0.7 * dt; // drag
    car.speed = clamp(car.speed, -model.top * 0.5, model.top);
    const steer = mv.x;
    const speedRatio = clamp(Math.abs(car.speed) / model.top, 0, 1);
    car.angle += steer * model.grip * speedRatio * (car.speed >= 0 ? 1 : -1) * dt;
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const before = car.speed;
    car.hitCd = (car.hitCd || 0) - dt;
    // Slide along buildings instead of stopping dead: try the full move,
    // then x-only, then y-only. A hard stop only damages the car once per
    // half second, so a scrape never grinds it to a wreck.
    let blocked = false;
    if (!pointInBuilding(g.city, nx, ny, 20)) {
      car.x = nx;
      car.y = ny;
    } else if (!pointInBuilding(g.city, nx, car.y, 20)) {
      car.x = nx;
      blocked = true;
    } else if (!pointInBuilding(g.city, car.x, ny, 20)) {
      car.y = ny;
      blocked = true;
    } else {
      blocked = true;
    }
    car.x = clamp(car.x, 30, WORLD_W - 30);
    car.y = clamp(car.y, 30, WORLD_H - 30);
    if (car.y >= SEA_Y - 20) car.y = SEA_Y - 20;
    if (car.x >= HARBOUR_X - 20) car.x = HARBOUR_X - 20;
    if (blocked) {
      car.speed *= -0.25;
      const impact = Math.abs(before);
      if (car.hitCd <= 0 && impact > 60) {
        car.hitCd = 0.5;
        car.health -= 2 + impact * 0.02;
        if (impact > 150) addHeat(g, WANTED.crashCar);
        burst(g, car.x, car.y, '#ffd76a', 6, 120);
      }
      if (car.health <= 0) {
        car.health = 0;
        car.kind = 'wreck';
        p.car = null;
        p.x = clamp(car.x + 40, 30, WORLD_W - 30);
        p.y = clamp(car.y + 40, 30, WORLD_H - 30);
        showMessage(g, 'Your car is wrecked!', 3);
      }
    }
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    p.speed = car.speed;
  } else {
    const moving = mv.x !== 0 || mv.y !== 0;
    if (moving) {
      const nx = p.x + mv.x * PLAYER.walkSpeed * dt;
      const ny = p.y + mv.y * PLAYER.walkSpeed * dt;
      const pos = collideMove(g.city, p.x, p.y, nx, ny, PLAYER.radius);
      p.x = clamp(pos.x, 30, WORLD_W - 30);
      p.y = clamp(pos.y, 30, WORLD_H - 30);
      if (p.y >= SEA_Y - 20) p.y = SEA_Y - 20;
      if (p.x >= HARBOUR_X - 20) p.x = HARBOUR_X - 20;
    }
    // On foot Rico faces where the mouse aims.
    const aimDx = p.aimX - p.x;
    const aimDy = p.aimY - p.y;
    if (Math.hypot(aimDx, aimDy) > 4) p.angle = Math.atan2(aimDy, aimDx);
    else if (moving) p.angle = Math.atan2(mv.y, mv.x);
    p.speed = moving ? PLAYER.walkSpeed : 0;
  }

  // --- traffic ------------------------------------------------------
  for (const car of g.cars) {
    if (car.kind !== 'traffic') continue;
    const model = CAR_MODELS[car.model];
    const t = car.target;
    const want = Math.atan2(t.y - car.y, t.x - car.x);
    const diff = Math.abs(angDiff(want, car.angle));
    car.angle = turnToward(car.angle, want, 2.6 * dt);
    let cruise = model.top * 0.42;
    if (diff > 0.6) cruise *= 0.5;
    for (const other of g.cars) {
      if (other === car || other.kind === 'wreck') continue;
      const d = dist(car.x, car.y, other.x, other.y);
      if (d < 90) {
        const ahead = Math.cos(car.angle) * (other.x - car.x) + Math.sin(car.angle) * (other.y - car.y);
        if (ahead > 0) { cruise = Math.min(cruise, model.top * 0.12); break; }
      }
    }
    car.speed += clamp(cruise - car.speed, -model.accel * dt, model.accel * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    if (dist(car.x, car.y, t.x, t.y) < 24) {
      const opts = nodeNeighbours(g.city, t).filter((n) => n !== car.from);
      let next = null;
      const straight = opts.find((n) => n.x - t.x === t.x - car.from.x && n.y - t.y === t.y - car.from.y);
      if (straight && g.rng.chance(0.6)) next = straight;
      else if (opts.length) next = g.rng.pick(opts);
      else next = car.from;
      car.from = t;
      car.target = next;
    }
  }

  // --- separate overlapping cars ------------------------------------
  for (let i = 0; i < g.cars.length; i++) {
    for (let j = i + 1; j < g.cars.length; j++) {
      const a = g.cars[i];
      const b = g.cars[j];
      if (a.kind === 'wreck' && b.kind === 'wreck') continue;
      const d = dist(a.x, a.y, b.x, b.y);
      if (d > 0.01 && d < 40) {
        const push = (40 - d) / 2;
        const ux = (b.x - a.x) / d;
        const uy = (b.y - a.y) / d;
        a.x -= ux * push; a.y -= uy * push;
        b.x += ux * push; b.y += uy * push;
      }
    }
  }

  // --- pedestrians ----------------------------------------------------
  for (const ped of g.peds) {
    ped.turnT -= dt;
    if (ped.turnT <= 0) {
      ped.angle = g.rng.next() * TAU;
      ped.turnT = g.rng.range(2, 6);
    }
    let sp = ped.speed;
    let ang = ped.angle;
    if (ped.panicT > 0) {
      ped.panicT -= dt;
      sp = ped.speed * 2.4;
      ang = Math.atan2(ped.y - p.y, ped.x - p.x);
      ped.angle = ang;
    }
    const nx = ped.x + Math.cos(ang) * sp * dt;
    const ny = ped.y + Math.sin(ang) * sp * dt;
    if (pointInBuilding(g.city, nx, ny, 10) || !onLand(nx, ny)) {
      ped.angle += Math.PI / 2;
    } else {
      ped.x = clamp(nx, 30, WORLD_W - 30);
      ped.y = clamp(ny, 30, WORLD_H - 30);
    }
  }

  // --- wanted level / police spawning ---------------------------------
  const stars = wantedStars(g);
  if (stars >= 1) {
    const wantPolice = Math.min(stars, 3);
    const have = g.cars.filter((c) => c.kind === 'police' && c.health > 0).length;
    if (have < wantPolice) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const a = g.rng.next() * TAU;
        const r = g.rng.range(520, 700);
        const x = clamp(p.x + Math.cos(a) * r, 40, WORLD_W - 40);
        const y = clamp(p.y + Math.sin(a) * r, 40, WORLD_H - 40);
        if (!onLand(x, y) || pointInBuilding(g.city, x, y, 24)) continue;
        const model = g.rng.pick([0, 1]);
        g.cars.push({
          id: g.cars.length, model, x, y, angle: 0, speed: 0, health: 100,
          kind: 'police', color: '#1d2733',
          from: nearestNode(g.city, x, y), target: nearestNode(g.city, p.x, p.y),
          ramCd: 0, officerCd: 0,
        });
        break;
      }
    }
  }
  // Foot officers at 3+ stars: 2 per star above 2, spawned around Rico.
  const wantOfficers = stars >= 3 ? 2 * (stars - 2) : 0;
  g.officerSpawnT -= dt;
  if (g.officers.length < wantOfficers && g.officerSpawnT <= 0) {
    g.officerSpawnT = 1;
    const a = g.rng.next() * TAU;
    const x = clamp(p.x + Math.cos(a) * 320, 40, WORLD_W - 40);
    const y = clamp(p.y + Math.sin(a) * 320, 40, WORLD_H - 40);
    if (onLand(x, y)) {
      g.officers.push({ x, y, angle: 0, health: 100, shootCd: g.rng.range(0.5, 1), holdT: 0 });
    }
  }

  // --- police cars ----------------------------------------------------
  for (const car of g.cars) {
    if (car.kind !== 'police' || car.health <= 0) continue;
    const model = CAR_MODELS[car.model];
    const d = dist(car.x, car.y, p.x, p.y);
    car.ramCd -= dt;
    car.officerCd -= dt;
    if (d < 170) {
      // Close chase: steer straight at Rico and ram.
      const want = Math.atan2(p.y - car.y, p.x - car.x);
      car.angle = turnToward(car.angle, want, 3.2 * dt);
      car.speed += clamp(model.top * 0.8 - car.speed, -model.accel * dt, model.accel * dt);
      if (p.car && d < 46 && car.ramCd <= 0) {
        car.ramCd = 1;
        p.car.health -= 6;
        p.car.speed *= 0.7;
        burst(g, p.car.x, p.car.y, '#ffd76a', 8, 160);
        if (p.car.health <= 0) {
          const wx = p.car.x;
          const wy = p.car.y;
          p.car.health = 0;
          p.car.kind = 'wreck';
          p.car = null;
          p.x = clamp(wx + 40, 30, WORLD_W - 30);
          p.y = clamp(wy + 40, 30, WORLD_H - 30);
          showMessage(g, 'Your car is wrecked!', 3);
        }
      }
      if (!p.car && d < 120 && g.officers.length < 8 && car.officerCd <= 0) {
        car.officerCd = 3;
        g.officers.push({ x: car.x, y: car.y, angle: 0, health: 100, shootCd: 1, holdT: 0 });
      }
    } else {
      // Far: route along the road graph toward Rico's intersection.
      const goal = nearestNode(g.city, p.x, p.y);
      const here = nearestNode(g.city, car.x, car.y);
      if (!car.target) car.target = here;
      if (dist(car.x, car.y, here.x, here.y) < 30) {
        const opts = nodeNeighbours(g.city, here);
        let best = opts[0];
        let bestD = Infinity;
        for (const n of opts) {
          const dd = dist(n.x, n.y, goal.x, goal.y);
          if (dd < bestD) { bestD = dd; best = n; }
        }
        car.target = best || here;
      }
      const want = Math.atan2(car.target.y - car.y, car.target.x - car.x);
      car.angle = turnToward(car.angle, want, 2.6 * dt);
      car.speed += clamp(model.top * 0.75 - car.speed, -model.accel * dt, model.accel * dt);
    }
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    if (!pointInBuilding(g.city, nx, ny, 20) && onLand(nx, ny)) {
      car.x = nx;
      car.y = ny;
    } else {
      car.speed *= 0.5;
    }
  }

  // --- foot officers ----------------------------------------------------
  for (const off of g.officers) {
    const d = dist(off.x, off.y, p.x, p.y);
    off.angle = Math.atan2(p.y - off.y, p.x - off.x);
    if (!p.car && d < 30) {
      off.holdT += dt;
      p.arrest = off.holdT;
      g.events.push({ type: 'arrest', t: off.holdT });
      if (off.holdT >= 1.5) {
        g.outcome = 'busted';
        g.events.push({ type: 'busted' });
      }
    } else {
      off.holdT = 0;
      p.arrest = 0;
      const nx = off.x + Math.cos(off.angle) * 150 * dt;
      const ny = off.y + Math.sin(off.angle) * 150 * dt;
      if (!pointInBuilding(g.city, nx, ny, 10) && onLand(nx, ny)) {
        off.x = nx;
        off.y = ny;
      }
    }
    off.shootCd -= dt;
    if (stars >= 2 && d >= 60 && d <= 380 && off.shootCd <= 0) {
      off.shootCd = g.rng.range(0.9, 1.6);
      const spread = g.rng.range(-0.06, 0.06);
      g.bullets.push({
        x: off.x, y: off.y, angle: off.angle + spread,
        speed: 900, from: 'enemy', dmg: 7, life: 0.55,
      });
      g.events.push({ type: 'enemyShot' });
    }
  }

  // --- rivals -----------------------------------------------------------
  for (const r of g.rivals) {
    const d = dist(r.x, r.y, p.x, p.y);
    let ang = Math.atan2(p.y - r.y, p.x - r.x);
    let move = 0;
    if (d > 240) move = 1;
    else if (d < 120) { move = -1; ang += Math.PI; }
    r.angle = Math.atan2(p.y - r.y, p.x - r.x);
    if (move !== 0) {
      const nx = r.x + Math.cos(ang) * r.speed * dt * (move < 0 ? 0.7 : 1);
      const ny = r.y + Math.sin(ang) * r.speed * dt * (move < 0 ? 0.7 : 1);
      if (!pointInBuilding(g.city, nx, ny, 10) && onLand(nx, ny)) {
        r.x = nx;
        r.y = ny;
      }
    }
    r.shootCd -= dt;
    if (d <= 420 && r.shootCd <= 0) {
      r.shootCd = g.rng.range(0.8, 1.5);
      g.bullets.push({
        x: r.x, y: r.y, angle: r.angle + g.rng.range(-0.07, 0.07),
        speed: 900, from: 'enemy', dmg: 8, life: 0.55,
      });
      g.events.push({ type: 'enemyShot' });
    }
  }

  // --- bullets ------------------------------------------------------------
  for (let i = g.bullets.length - 1; i >= 0; i--) {
    const b = g.bullets[i];
    b.life -= dt;
    b.x += Math.cos(b.angle) * b.speed * dt;
    b.y += Math.sin(b.angle) * b.speed * dt;
    let dead = b.life <= 0 || pointInBuilding(g.city, b.x, b.y, 0) || !onLand(b.x, b.y);
    if (!dead && b.from === 'player') {
      for (let j = g.peds.length - 1; j >= 0; j--) {
        const ped = g.peds[j];
        if (dist(b.x, b.y, ped.x, ped.y) < 16) {
          g.peds.splice(j, 1);
          p.kills++;
          addHeat(g, WANTED.killPed);
          burst(g, ped.x, ped.y, '#e5534b', 10, 140);
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (let j = g.officers.length - 1; j >= 0; j--) {
          const off = g.officers[j];
          if (dist(b.x, b.y, off.x, off.y) < 16) {
            off.health -= b.dmg;
            if (off.health <= 0) {
              g.officers.splice(j, 1);
              p.kills++;
              addHeat(g, WANTED.killCop);
              burst(g, off.x, off.y, '#e5534b', 10, 140);
            }
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (let j = g.rivals.length - 1; j >= 0; j--) {
          const r = g.rivals[j];
          if (dist(b.x, b.y, r.x, r.y) < 16) {
            r.health -= b.dmg;
            if (r.health <= 0) {
              g.rivals.splice(j, 1);
              g.missionKills++;
              p.kills++;
              addHeat(g, WANTED.killPed);
              burst(g, r.x, r.y, '#e5534b', 10, 140);
            }
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (const car of g.cars) {
          if (car.kind === 'police' && car.health > 0 && dist(b.x, b.y, car.x, car.y) < 34) {
            car.health -= b.dmg / 2;
            burst(g, b.x, b.y, '#ffd76a', 5, 120);
            if (car.health <= 0) {
              car.health = 0;
              car.kind = 'wreck';
              addHeat(g, WANTED.killCop);
              showMessage(g, 'Police car destroyed!', 3);
            }
            dead = true;
            break;
          }
        }
      }
    }
    if (!dead && b.from === 'enemy') {
      if (!p.car && dist(b.x, b.y, p.x, p.y) < 16) {
        hurtPlayer(g, b.dmg);
        burst(g, p.x, p.y, '#e5534b', 5, 100);
        dead = true;
      } else if (p.car && dist(b.x, b.y, p.car.x, p.car.y) < 34) {
        p.car.health -= b.dmg;
        burst(g, b.x, b.y, '#ffd76a', 4, 100);
        if (p.car.health <= 0) {
          p.car.health = 0;
          p.car.kind = 'wreck';
          p.car = null;
          showMessage(g, 'Your car is wrecked!', 3);
        }
        dead = true;
      }
    }
    if (dead) g.bullets.splice(i, 1);
  }

  // --- particles ----------------------------------------------------------
  for (let i = g.particles.length - 1; i >= 0; i--) {
    const pt = g.particles[i];
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    if (pt.life <= 0) g.particles.splice(i, 1);
  }

  // --- wanted decay --------------------------------------------------------
  if (g.time - p.lastCrime > WANTED.decayDelay && p.heat > 0) {
    p.heat = Math.max(0, p.heat - WANTED.decayRate * dt);
  }
  if (wantedStars(g) === 0) {
    g.cars = g.cars.filter((c) => c.kind !== 'police');
    g.officers = [];
    p.arrest = 0;
  }

  // --- Sun Coins ------------------------------------------------------------
  for (let i = 0; i < SUN_COINS.length; i++) {
    if (p.coins[i]) continue;
    const c = SUN_COINS[i];
    if (dist(p.x, p.y, c.x, c.y) < 30) {
      p.coins[i] = true;
      p.coinsTaken++;
      p.cash += COIN_VALUE;
      burst(g, c.x, c.y, '#f2c94c', 18, 200);
      g.events.push({ type: 'coin' });
      showMessage(g, 'Sun Coin ' + p.coinsTaken + '/8 — +$' + COIN_VALUE, 3);
    }
  }

  // --- mission ---------------------------------------------------------------
  const step = currentStep(g);
  if (step && !g.outcome) {
    if (step.kind === 'steal') {
      if (p.car) completeStep(g);
    } else if (step.kind === 'goto') {
      if (dist(p.x, p.y, step.x, step.y) < 70) completeStep(g);
    } else if (step.kind === 'kill') {
      if (!g.rivalsSpawned) spawnRivals(g, step.x, step.y, step.count);
      if (g.missionKills >= step.count) completeStep(g);
    } else if (step.kind === 'timed') {
      if (g.missionTimer !== null) {
        g.missionTimer -= dt;
        if (g.missionTimer <= 0) {
          g.missionStep = 0;
          p.x = 465;
          p.y = 465;
          if (p.car) { p.car.x = 465; p.car.y = 540; }
          showMessage(g, 'Too slow — back to the start of the run.', 4);
          beginStep(g);
        } else if (dist(p.x, p.y, step.x, step.y) < 70) {
          completeStep(g);
        }
      }
    } else if (step.kind === 'escape') {
      if (dist(p.x, p.y, step.x, step.y) < 80) {
        if (wantedStars(g) === 0) completeStep(g);
        else if (g.time > g.hintUntil) {
          g.hintUntil = g.time + 2;
          showMessage(g, 'Lose the cops first — wanted level must be 0.', 2);
        }
      }
    }
  }

  // --- place effects -----------------------------------------------------------
  const spray = PLACES[2];
  if (p.car && dist(p.car.x, p.car.y, spray.x, spray.y) < 60 &&
      (p.heat > 0 || p.car.health < 100) && p.cash >= 100) {
    p.cash -= 100;
    p.heat = 0;
    p.car.health = 100;
    g.events.push({ type: 'pickup' });
    showMessage(g, "Pay 'n Spray — clean plates, fixed paint. -$100", 3);
  }
  const hospital = PLACES[3];
  if (!p.car && dist(p.x, p.y, hospital.x, hospital.y) < 55 && p.health < 100 && p.cash >= 50) {
    p.cash -= 50;
    p.health = PLAYER.health;
    g.events.push({ type: 'pickup' });
    showMessage(g, 'Patched up at Solmar General. -$50', 3);
  }

  // --- firing -------------------------------------------------------------------
  const fireEdge = input.take('fire');
  const wantFire = fireEdge || (input.mouseDown && p.fireCd <= 0);
  if (wantFire && !p.car && p.fireCd <= 0 && !g.outcome) {
    if (p.weapon === 'pistol') {
      if (p.ammo > 0) {
        p.ammo--;
        p.fireCd = 0.22;
        g.stats.shots++;
        const spread = g.rng.range(-0.03, 0.03);
        g.bullets.push({
          x: p.x + Math.cos(p.angle) * 20, y: p.y + Math.sin(p.angle) * 20,
          angle: p.angle + spread, speed: 900, from: 'player',
          dmg: PLAYER.pistolDamage, life: 0.55,
        });
        g.events.push({ type: 'shot' });
        for (const ped of g.peds) {
          if (dist(ped.x, ped.y, p.x, p.y) < 300) ped.panicT = 3;
        }
        const copNear = g.officers.some((o) => dist(o.x, o.y, p.x, p.y) < 380) ||
          g.cars.some((c) => c.kind === 'police' && dist(c.x, c.y, p.x, p.y) < 380);
        if (copNear) addHeat(g, WANTED.shootNearCop);
      } else if (g.time > g.hintUntil) {
        g.hintUntil = g.time + 1;
        showMessage(g, 'Out of ammo — visit Ammo-Nation.', 2);
      }
    } else {
      // Fists: a short arc ahead.
      p.fireCd = 0.35;
      g.events.push({ type: 'punch' });
      for (let j = g.peds.length - 1; j >= 0; j--) {
        const ped = g.peds[j];
        if (dist(ped.x, ped.y, p.x, p.y) < PLAYER.fistRange &&
            Math.abs(angDiff(Math.atan2(ped.y - p.y, ped.x - p.x), p.angle)) < 0.9) {
          g.peds.splice(j, 1);
          p.kills++;
          addHeat(g, WANTED.killPed);
          burst(g, ped.x, ped.y, '#e5534b', 8, 120);
        }
      }
      for (const off of g.officers) {
        if (dist(off.x, off.y, p.x, p.y) < PLAYER.fistRange) off.health -= PLAYER.fistDamage;
      }
      for (const r of g.rivals) {
        if (dist(r.x, r.y, p.x, p.y) < PLAYER.fistRange) r.health -= PLAYER.fistDamage;
      }
      g.officers = g.officers.filter((o) => o.health > 0);
      g.rivals = g.rivals.filter((r) => {
        if (r.health <= 0) { g.missionKills++; p.kills++; addHeat(g, WANTED.killPed); return false; }
        return true;
      });
    }
  }

  // --- interact ------------------------------------------------------------------
  if (input.take('interact') && !g.outcome) {
    const st = currentStep(g);
    const gunShop = PLACES[1];
    if (st && st.kind === 'collect' && dist(p.x, p.y, st.x, st.y) < 60) {
      if (g.missionIdx === 5) {
        addHeat(g, 100);
        showMessage(g, 'The vault is open — every cop in Solmar Bay is coming!', 4);
      }
      completeStep(g);
    } else if (!p.car && dist(p.x, p.y, gunShop.x, gunShop.y) < 60 && p.cash >= 50) {
      p.cash -= 50;
      p.ammo += 24;
      g.events.push({ type: 'pickup' });
      showMessage(g, 'Ammo-Nation: +24 pistol rounds. -$50', 3);
    } else if (p.car) {
      const car = p.car;
      car.kind = 'parked';
      p.car = null;
      p.x = clamp(car.x + Math.cos(car.angle + Math.PI / 2) * 36, 30, WORLD_W - 30);
      p.y = clamp(car.y + Math.sin(car.angle + Math.PI / 2) * 36, 30, WORLD_H - 30);
      p.angle = car.angle;
    } else {
      let best = null;
      let bestD = 64;
      for (const car of g.cars) {
        if (car.kind === 'wreck' || car.kind === 'police') continue;
        const d = dist(p.x, p.y, car.x, car.y);
        if (d < bestD) { bestD = d; best = car; }
      }
      if (best) {
        const wasParked = best.kind === 'parked';
        if (wasParked) {
          addHeat(g, WANTED.stealCar);
        } else {
          addHeat(g, WANTED.stealCar);
          g.peds.push({
            x: best.x + 30, y: best.y + 30, angle: 0, speed: 50,
            shirt: '#d8d8d8', skin: '#e8b98a', panicT: 3, turnT: 2,
          });
          showMessage(g, 'You jacked a moving car!', 3);
        }
        best.kind = 'player';
        p.car = best;
        p.carsStolen++;
        p.x = best.x;
        p.y = best.y;
        p.angle = best.angle;
        g.events.push({ type: 'pickup' });
      }
    }
  }

  // --- weapon switch ---------------------------------------------------------------
  if (input.take('switchWeapon')) {
    p.weapon = p.weapon === 'pistol' ? 'fists' : 'pistol';
    showMessage(g, p.weapon === 'pistol' ? 'Pistol ready.' : 'Fists ready.', 1.5);
  }

  // --- banner expiry -----------------------------------------------------------------
  if (g.banner && g.time > g.banner.until) g.banner = null;
  if (g.message && g.time > g.messageUntil) g.message = null;
}
