// Staged screenshot scenes. Each one plays the real rules forward from a
// fresh world for a few seconds with a scripted driver, so the frame is what
// a short game really looks like — and the same seed always gives the same
// frame. After staging, the mission banner is frozen on screen for a long
// time, because the staged frame is a still and its clock never advances.

import { STEP, CAR_MODELS } from './config.js';
import { stepGame, setMission, showBanner, currentMission } from './world.js';

// A minimal stand-in for the real Input: scripted keys, aim and fire.
function scriptedInput() {
  const keys = new Set();
  return {
    keys,
    mouseDown: false,
    aimX: 0,
    aimY: 0,
    moveVector() {
      let x = 0;
      let y = 0;
      if (keys.has('a')) x -= 1;
      if (keys.has('d')) x += 1;
      if (keys.has('w')) y -= 1;
      if (keys.has('s')) y += 1;
      return { x, y };
    },
    take() { return false; },
  };
}

function putPlayerInCar(g, modelIdx, x, y, angle) {
  const model = CAR_MODELS[modelIdx];
  const car = {
    id: g.cars.length, model: modelIdx, x, y, angle, speed: 0, health: 100,
    kind: 'player', color: model.colors[0],
    from: null, target: null, ramCd: 0, officerCd: 0,
  };
  g.cars.push(car);
  g.player.car = car;
  g.player.x = x;
  g.player.y = y;
  g.player.angle = angle;
  return car;
}

function freezeBanner(g) {
  const m = currentMission(g);
  if (m) showBanner(g, m.title, m.steps[g.missionStep].label, 3600);
}

export function stageShot(g, name) {
  const input = scriptedInput();
  const p = g.player;

  if (name === 'cover') {
    // Mission 6, late morning, three stars, a Cometa GT tearing east with
    // three SBPD cars on its tail.
    setMission(g, 5, 0);
    g.clockMin = 10 * 60 + 24;
    putPlayerInCar(g, 1, 1500, 1500, 0);
    p.heat = 72;
    p.lastCrime = g.time;
    const tails = [[1350, 1500], [1280, 1470], [1400, 1530]];
    for (const [x, y] of tails) {
      g.cars.push({
        id: g.cars.length, model: 1, x, y, angle: 0, speed: 200, health: 100,
        kind: 'police', color: '#1d2733',
        from: null, target: null, ramCd: 0, officerCd: 0,
      });
    }
    const total = Math.round(4 / STEP);
    for (let i = 0; i < total; i++) {
      input.keys.clear();
      if (i < Math.round(1.5 / STEP)) input.keys.add('w');
      // Steer back toward the road's centreline so police rams shoving the
      // car sideways do not wedge it against the buildings.
      const car = g.player.car;
      if (car) {
        const want = Math.atan2(1500 - car.y, 3300 - car.x);
        let d = want - car.angle;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        if (d > 0.05) input.keys.add('d');
        else if (d < -0.05) input.keys.add('a');
      }
      p.aimX = p.x + 100;
      p.aimY = p.y;
      stepGame(g, input, STEP);
    }
  } else if (name === 'street') {
    // Mission 1, morning downtown: Rico on foot beside a parked car.
    setMission(g, 0, 0);
    g.clockMin = 9 * 60 + 5;
    const parked = g.cars.find((c) => c.kind === 'parked' && c.x >= 1200 && c.x < 3000 && c.y >= 600 && c.y < 1800)
      || g.cars.find((c) => c.kind === 'parked');
    if (parked) {
      p.x = parked.x + 52;
      p.y = parked.y;
      p.aimX = parked.x;
      p.aimY = parked.y;
    }
    const total = Math.round(2.5 / STEP);
    for (let i = 0; i < total; i++) {
      input.keys.clear();
      stepGame(g, input, STEP);
    }
  } else if (name === 'beach') {
    // Mission 2, late afternoon on the sand: the Lobos crew lines up and
    // Rico works through them, sidestepping as he shoots.
    setMission(g, 1, 1);
    g.clockMin = 16 * 60 + 40;
    for (let i = 0; i < Math.round(0.5 / STEP); i++) stepGame(g, input, STEP);
    p.x = 1650;
    p.y = 2280;
    p.angle = -Math.PI / 2;
    g.rivals.forEach((r, i) => {
      r.x = 1560 + i * 60;
      r.y = 2210 + (i % 2) * 25;
    });
    const total = Math.round(3.5 / STEP);
    for (let i = 0; i < total; i++) {
      input.keys.clear();
      if (Math.floor(i / 30) % 2 === 0) input.keys.add('a');
      else input.keys.add('d');
      const first = g.rivals[0];
      if (first) {
        p.aimX = first.x;
        p.aimY = first.y;
      }
      if (i % 50 === 0) {
        // Fire one aimed shot at the first rival.
        const spread = 0;
        p.ammo = Math.max(p.ammo, 1);
        g.bullets.push({
          x: p.x + Math.cos(p.angle) * 20, y: p.y + Math.sin(p.angle) * 20,
          angle: Math.atan2((first ? first.y : p.y - 100) - p.y, (first ? first.x : p.x) - p.x) + spread,
          speed: 900, from: 'player', dmg: 34, life: 0.55,
        });
        g.stats.shots++;
        for (const ped of g.peds) {
          if (Math.hypot(ped.x - p.x, ped.y - p.y) < 300) ped.panicT = 3;
        }
      }
      stepGame(g, input, STEP);
    }
  } else if (name === 'night') {
    // Mission 3, late night: a Brisa Convertible running east through the
    // dark city, headlights on.
    setMission(g, 2, 0);
    g.clockMin = 23 * 60 + 10;
    putPlayerInCar(g, 3, 2400, 1500, 0);
    const total = Math.round(2 / STEP);
    for (let i = 0; i < total; i++) {
      input.keys.clear();
      input.keys.add('w');
      const car = g.player.car;
      if (car) {
        const want = Math.atan2(1500 - car.y, 3300 - car.x);
        let d = want - car.angle;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        if (d > 0.05) input.keys.add('d');
        else if (d < -0.05) input.keys.add('a');
      }
      p.aimX = p.x + 100;
      p.aimY = p.y;
      stepGame(g, input, STEP);
    }
  } else {
    return false;
  }
  freezeBanner(g);
  return true;
}
