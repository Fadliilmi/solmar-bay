// The screenshot scenes behind ?shot=cover|street|beach|night. Each one plays the
// real rules forward from a fresh world for a few seconds, steered by a scripted
// driver, so the frame is what a short game really looks like — and the same seed
// always gives the same frame.
import { STEP, WORLD, CAR_MODELS, MISSIONS } from './config.js';
import { SCREEN_PLAY } from './world.js';

const SAMPLE = STEP;

/** Find a car of a model near a point and put the player in it. */
function putPlayerInCar(world, modelId, x, y, angle) {
  const state = world.state;
  const model = CAR_MODELS.find((m) => m.id === modelId) ?? CAR_MODELS[0];
  let car = null;
  for (const c of state.cars) {
    if (c.kind === 'parked' && c.model.id === modelId) {
      car = c;
      break;
    }
  }
  if (!car) {
    car = {
      kind: 'player', model, x, y, angle, speed: 0, color: model.colors[0],
      length: model.length, width: model.width, health: 100,
      targetNode: -1, nextNode: -1, wait: 0, siren: false, sirenPhase: 0, driver: false,
    };
    state.cars.push(car);
  }
  car.kind = 'player';
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.speed = 0;
  car.health = 100;
  car.color = model.colors[0]; // the hero car wears its signature colour
  state.player.inCar = car;
  state.player.x = x;
  state.player.y = y;
  state.player.angle = angle;
  return car;
}

/** Spawn a police car at a spot, already chasing the player. */
function spawnPoliceAt(world, x, y, trail) {
  const state = world.state;
  const model = CAR_MODELS[0];
  const car = {
    kind: 'police', model, x, y,
    angle: Math.atan2(state.player.y - y, state.player.x - x),
    speed: 200, color: '#20242c',
    length: model.length, width: model.width, health: 100,
    targetNode: -1, nextNode: -1, fromNode: -1, wait: 0, siren: true, sirenPhase: 0, driver: false,
    trail: trail ?? 0,
  };
  state.cars.push(car);
  return car;
}

function idleInput() {
  return { up: false, down: false, left: false, right: false, aim: false, aimX: 0, aimY: 0, fire: false, interact: false, weapon: false };
}

function driveInput(steer) {
  const input = idleInput();
  input.up = true;
  if (steer < 0) input.left = true;
  if (steer > 0) input.right = true;
  return input;
}

/** Steer the player's car toward a target point. */
function steerToward(world, tx, ty) {
  const car = world.state.player.inCar;
  if (!car) return 0;
  const want = Math.atan2(ty - car.y, tx - car.x);
  let d = want - car.angle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d > 0.08 ? 1 : d < -0.08 ? -1 : 0;
}

/** Cover: a car chase through downtown, three SBPD cars behind, the bank job on. */
function stageCover(world) {
  const state = world.state;
  world.reset();
  world.startMission(5);
  state.clockBase = 10 * 60 + 24;
  putPlayerInCar(world, 'cometa', 1500, 1500, 0);
  state.player.heat = 72; // three stars
  spawnPoliceAt(world, 1350, 1500, 0);
  spawnPoliceAt(world, 1280, 1470, 1);
  spawnPoliceAt(world, 1400, 1530, 2);
  // Full throttle for a beat, then coast: the SBPD cars catch the Cometa and
  // sit on its bumper for the frame.
  for (let i = 0; i < 4 / SAMPLE; i += 1) {
    const input = i < 1.5 / SAMPLE ? driveInput(steerToward(world, 3300, 1500)) : idleInput();
    world.step(SAMPLE, input);
  }
  return { screen: SCREEN_PLAY };
}

/** Street: Rico on foot downtown, first mission, traffic and pedestrians around. */
function stageStreet(world) {
  const state = world.state;
  world.reset();
  world.startMission(0);
  state.clockBase = 9 * 60 + 5;
  // Stand Rico beside a parked car downtown: mission 1 is about stealing one.
  const parked = state.cars.find((c) => c.kind === 'parked' && c.x > 1200 && c.x < 2700 && c.y > 600 && c.y < 1500)
    ?? state.cars.find((c) => c.kind === 'parked');
  if (parked) {
    state.player.x = parked.x + 52;
    state.player.y = parked.y + 8;
    state.player.angle = Math.atan2(parked.y - state.player.y, parked.x - state.player.x);
  } else {
    state.player.x = 1500;
    state.player.y = 1350;
    state.player.angle = -Math.PI / 2;
  }
  for (let i = 0; i < 2.5 / SAMPLE; i += 1) {
    world.step(SAMPLE, idleInput());
  }
  return { screen: SCREEN_PLAY };
}

/** Beach: a shootout on the sand — Rico trading fire with the Lobos crew. */
function stageBeach(world) {
  const state = world.state;
  world.reset();
  world.startMission(1);
  // Jump straight to the shootout step.
  state.missionStep = 1;
  state.clockBase = 16 * 60 + 40;
  state.player.heat = 0; // the shootout itself earns the stars
  state.player.ammo = 48;
  // Let the kill step spawn its rivals, then move the fight onto the sand.
  for (let i = 0; i < 0.5 / SAMPLE; i += 1) world.step(SAMPLE, idleInput());
  state.player.x = 1650;
  state.player.y = 2280;
  state.player.angle = -Math.PI / 2;
  state.rivals.forEach((r, i) => {
    r.x = 1560 + i * 60;
    r.y = 2210 + (i % 2) * 50;
  });
  for (let i = 0; i < 3.5 / SAMPLE; i += 1) {
    const input = idleInput();
    const rival = state.rivals[0];
    if (rival) {
      input.aim = true;
      input.aimX = rival.x;
      input.aimY = rival.y;
      input.fire = i % 50 === 0;
    }
    // Sidestep along the beach while shooting.
    input.left = i % 120 < 60;
    input.right = i % 120 >= 60;
    world.step(SAMPLE, input);
  }
  return { screen: SCREEN_PLAY };
}

/** Night: a drive along the marina with the headlights on. */
function stageNight(world) {
  const state = world.state;
  world.reset();
  world.startMission(2);
  state.clockBase = 23 * 60 + 10;
  putPlayerInCar(world, 'brisa', 2400, 1500, 0);
  for (let i = 0; i < 2 / SAMPLE; i += 1) {
    world.step(SAMPLE, driveInput(steerToward(world, 3300, 1500)));
  }
  return { screen: SCREEN_PLAY };
}

/**
 * Set `world` to the named scene (cover, street, beach or night; any other name
 * is cover) and return the screen to draw over it. The mission banner is frozen
 * on afterwards: the staged frame is a still, so its clock never advances.
 */
export function stageShot(name, world) {
  const scene = name === 'street' ? stageStreet(world)
    : name === 'beach' ? stageBeach(world)
    : name === 'night' ? stageNight(world)
    : stageCover(world);
  const mission = MISSIONS[world.state.missionIndex];
  if (mission) world.showBanner(mission.title, 3600);
  return scene;
}

// Keep the world import used by the bundler's reachability walk honest.
void WORLD;
