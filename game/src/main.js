// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps, and the renderer paints what is there. The game moves between six
// screens: title, play, paused, wasted, busted and win.
//
// ?seed=N fixes the city. ?shot=cover|street|beach|night (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { VIEW, STEP, SAVE_KEY } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld, EVENT_WASTED, EVENT_BUSTED, EVENT_WIN,
  SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_WASTED, SCREEN_BUSTED, SCREEN_WIN,
} from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveGame() {
  try {
    const s = world.state;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: s.player.cash,
      coins: s.coins.map((c) => c.taken),
      missionIndex: s.missionIndex,
      missionsDone: s.stats.missionsDone,
      kills: s.player.kills,
      carsStolen: s.player.carsStolen,
    }));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function applySave(save) {
  const s = world.state;
  s.player.cash = save.cash ?? 120;
  if (Array.isArray(save.coins)) {
    save.coins.forEach((taken, i) => {
      if (taken && s.coins[i]) {
        s.coins[i].taken = true;
        s.player.coins += 1;
      }
    });
  }
  s.stats.missionsDone = save.missionsDone ?? 0;
  s.player.kills = save.kills ?? 0;
  s.player.carsStolen = save.carsStolen ?? 0;
  world.startMission(Math.min(save.missionIndex ?? 0, 5));
}

function saveSummary(save) {
  if (!save) return null;
  return `Saved game: $${save.cash ?? 0} · ${(save.coins ?? []).filter(Boolean).length}/8 Sun Coins · mission ${((save.missionIndex ?? 0) + 1)}/6`;
}

function runShot(name) {
  const scene = stageShot(name, world);
  renderer.snapCamera(world.state);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, null);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const save = readSave();
  let screen = SCREEN_TITLE;
  let saveTimer = 0;

  function announce(message) {
    status.textContent = message;
  }

  function startGame(fresh) {
    if (fresh) {
      world.reset();
      try {
        window.localStorage.removeItem(SAVE_KEY);
      } catch {
        // Ignore storage errors.
      }
    } else if (save) {
      world.reset();
      applySave(save);
    } else {
      world.reset();
    }
    screen = SCREEN_PLAY;
    announce('Playing. Follow the yellow marker.');
  }

  function endRun(kind) {
    audio.wasted();
    audio.setSiren(false);
    if (kind === 'wasted') {
      world.respawn('wasted');
      screen = SCREEN_WASTED;
      announce('Wasted. Rico wakes up at Solmar General.');
    } else {
      world.respawn('busted');
      screen = SCREEN_BUSTED;
      announce('Busted. The SBPD lets Rico go — after a fine.');
    }
    saveGame();
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE) startGame(false);
      else if (screen === SCREEN_WASTED || screen === SCREEN_BUSTED) screen = SCREEN_PLAY;
      else if (screen === SCREEN_WIN) screen = SCREEN_TITLE;
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
    } else if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  // Radio toggle and new-game key live here, beside the screens they affect.
  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (event.code === 'KeyR' && screen === SCREEN_PLAY) {
      audio.unlock();
      const on = audio.setRadio(!audio.isRadioOn());
      announce(on ? 'Radio Solmar on.' : 'Radio off.');
    }
    if (event.code === 'KeyN' && screen === SCREEN_TITLE) startGame(true);
  });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });

  function step() {
    const dir = input.direction();
    input.playerInCar = Boolean(world.state.player.inCar);
    // Mouse aim is screen space; the world needs world space.
    const cam = renderer.getCamera();
    dir.aimX = (dir.aimX - VIEW.width / 2) / cam.zoom + cam.camX;
    dir.aimY = (dir.aimY - VIEW.height / 2) / cam.zoom + cam.camY;
    dir.aim = !world.state.player.inCar;
    const events = world.step(STEP, dir);
    input.consumeEdges();
    if (events & EVENT_WASTED) endRun('wasted');
    else if (events & EVENT_BUSTED) endRun('busted');
    else if (events & EVENT_WIN) {
      audio.missionDone();
      audio.setSiren(false);
      screen = SCREEN_WIN;
      announce('The Solmar Score complete. Solmar Bay is yours.');
      saveGame();
    }
    saveTimer += STEP;
    if (saveTimer > 5) {
      saveTimer = 0;
      if (screen === SCREEN_PLAY) saveGame();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE) {
      // Attract mode: the city lives behind the title.
      accumulator += dt;
      while (accumulator >= STEP) {
        world.step(STEP, { up: false, down: false, left: false, right: false, aim: false, aimX: 0, aimY: 0, fire: false, interact: false, weapon: false });
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_PLAY) {
      accumulator += dt;
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
      const p = world.state.player;
      audio.setEngine(p.inCar ? p.inCar.speed : 0, Boolean(p.inCar));
      audio.setSiren(p.wanted > 0);
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, saveSummary(save));
  }

  let accumulator = 0;
  let last = performance.now();

  // Leaving the tab pauses a running game rather than letting Rico get arrested unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  window.addEventListener('pagehide', () => saveGame());

  announce('Solmar Bay. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
