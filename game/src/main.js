// Solmar Bay — boot, the fixed-step loop, screens, saves and the staged
// screenshot entry point.

import { VIEW_W, VIEW_H, STEP, SAVE_KEY, MISSIONS } from './config.js';
import { Input } from './input.js';
import { createGame, stepGame, respawn, setMission, currentMission } from './world.js';
import { makeCamera, updateCamera, drawWorld, drawHUD, drawTitle, drawPause, drawEndScreen } from './render.js';
import { AudioSys } from './audio.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const input = new Input(canvas);
const audio = new AudioSys();

const params = new URLSearchParams(window.location.search);
const seedParam = parseInt(params.get('seed') || '', 10);
const seed = Number.isFinite(seedParam) ? seedParam : Math.floor(Math.random() * 2147483647);
const shotName = params.get('shot');

let game = createGame(seed);
const cam = makeCamera();

function announce(text) {
  statusEl.textContent = text;
}

function saveGame() {
  try {
    const p = game.player;
    const data = {
      cash: p.cash,
      coins: p.coins,
      missionIdx: game.missionIdx,
      missionsDone: game.stats.missionsDone,
      kills: p.kills,
      carsStolen: p.carsStolen,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    // Storage may be unavailable; the game still plays.
  }
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || !Array.isArray(data.coins)) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function applySave(data) {
  const p = game.player;
  p.cash = data.cash;
  p.coins = data.coins.map(Boolean);
  p.coinsTaken = p.coins.filter(Boolean).length;
  p.kills = data.kills || 0;
  p.carsStolen = data.carsStolen || 0;
  game.stats.missionsDone = data.missionsDone || 0;
  setMission(game, Math.min(data.missionIdx || 0, MISSIONS.length - 1), 0);
}

function saveSummary(data) {
  if (!data) return '';
  const m = MISSIONS[Math.min(data.missionIdx || 0, MISSIONS.length - 1)];
  return 'Save: $' + data.cash + '  ·  ' + (data.coins || []).filter(Boolean).length +
    '/8 Sun Coins  ·  Mission: ' + m.title;
}

// --- staged screenshot entry point -------------------------------------
if (shotName) {
  const ok = stageShot(game, shotName);
  // Snap the camera straight onto the staged player: the smooth follow
  // would otherwise still be drifting in from its start position.
  cam.x = game.player.x;
  cam.y = game.player.y;
  cam.zoom = game.player.car ? 0.82 : 1;
  updateCamera(cam, game);
  drawWorld(ctx, game, cam);
  drawHUD(ctx, game);
  drawWorld(ctx, game, cam);
  drawHUD(ctx, game);
  window.__shotReady = ok;
} else {
  // --- the live game ----------------------------------------------------
  let screen = 'title';
  let save = loadSave();
  let lastTime = performance.now();
  let accumulator = 0;
  let autosaveT = 0;
  let blinkT = 0;

  function setScreen(next, announcement) {
    screen = next;
    input.consumeAll();
    if (announcement) announce(announcement);
  }

  function startGame(fresh) {
    game = createGame(seed);
    if (!fresh && save) applySave(save);
    updateCamera(cam, game);
    cam.x = game.player.x;
    cam.y = game.player.y;
    setScreen('play', 'Playing Solmar Bay');
    autosaveT = 0;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dtReal = Math.min((now - lastTime) / 1000, 0.25);
    lastTime = now;
    blinkT += dtReal;

    // Title: the city stays alive behind the menu (attract mode).
    if (screen === 'title') {
      const idle = { moveVector: () => ({ x: 0, y: 0 }), take: () => false, mouseDown: false, aimX: game.player.x, aimY: game.player.y - 100 };
      accumulator += dtReal;
      while (accumulator >= STEP) {
        accumulator -= STEP;
        stepGame(game, idle, STEP);
      }
      updateCamera(cam, game);
      drawWorld(ctx, game, cam);
      drawTitle(ctx, game, !!save, save ? saveSummary(save) : '', Math.floor(blinkT * 1.6) % 2 === 0);
      if (input.take('confirm')) {
        audio.ensure();
        startGame(false);
      } else if (input.take('newGame')) {
        audio.ensure();
        save = null;
        startGame(true);
      }
      return;
    }

    if (screen === 'paused') {
      drawWorld(ctx, game, cam);
      drawPause(ctx, game);
      if (input.take('pause') || input.take('confirm')) setScreen('play', 'Playing Solmar Bay');
      return;
    }

    if (screen === 'wasted' || screen === 'busted' || screen === 'win') {
      drawWorld(ctx, game, cam);
      drawHUD(ctx, game);
      drawEndScreen(ctx, screen);
      if (input.take('confirm')) {
        if (screen === 'win') {
          save = loadSave();
          setScreen('title', 'Solmar Bay title screen');
        } else {
          const fine = screen === 'wasted' ? 100 : 200;
          respawn(game, fine);
          saveGame();
          setScreen('play', 'Playing Solmar Bay');
        }
      }
      return;
    }

    // Playing.
    if (input.take('pause')) {
      setScreen('paused', 'Paused');
      return;
    }
    if (input.take('radio')) {
      audio.ensure();
      const on = audio.toggleRadio();
      announce(on ? 'Radio Solmar on' : 'Radio Solmar off');
    }
    if (input.take('confirm')) audio.ensure();
    if (input.mouseDown) audio.ensure();

    // Mouse aim: screen space -> world space through the camera.
    const vw = VIEW_W / cam.zoom;
    const vh = VIEW_H / cam.zoom;
    game.player.aimX = cam.x - vw / 2 + input.mouseX / cam.zoom;
    game.player.aimY = cam.y - vh / 2 + input.mouseY / cam.zoom;
    input.inCar = !!game.player.car;

    accumulator += dtReal;
    while (accumulator >= STEP) {
      accumulator -= STEP;
      stepGame(game, input, STEP);
      if (game.outcome) break;
    }
    updateCamera(cam, game);
    drawWorld(ctx, game, cam);
    drawHUD(ctx, game);

    // Drain world events into sound.
    for (const ev of game.events) {
      if (ev.type === 'shot') audio.shot();
      else if (ev.type === 'punch') audio.punch();
      else if (ev.type === 'coin') audio.coin();
      else if (ev.type === 'pickup') audio.pickup();
      else if (ev.type === 'mission') audio.missionDone();
      else if (ev.type === 'wasted' || ev.type === 'busted') audio.wasted();
    }
    game.events.length = 0;

    audio.setEngine(game.player.car ? game.player.car.speed : 0, !!game.player.car);
    const wanted = game.player.heat >= 20 ? 1 : 0;
    audio.setSiren(wanted);
    audio.updateRadio();

    // Autosave every 5 seconds of play.
    autosaveT += dtReal;
    if (autosaveT >= 5) {
      autosaveT = 0;
      saveGame();
    }

    if (game.outcome === 'wasted') {
      saveGame();
      setScreen('wasted', 'Wasted. Rico wakes up at Solmar General.');
    } else if (game.outcome === 'busted') {
      saveGame();
      setScreen('busted', 'Busted. The SBPD lets Rico go after a fine.');
    } else if (game.outcome === 'win') {
      saveGame();
      setScreen('win', 'The Solmar Score complete. Solmar Bay is theirs.');
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      saveGame();
      setScreen('paused', 'Paused');
    }
  });
  window.addEventListener('pagehide', () => saveGame());

  // Fit the 1280x800 canvas to the window while keeping its proportions.
  function resize() {
    const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
    canvas.style.width = Math.floor(VIEW_W * scale) + 'px';
    canvas.style.height = Math.floor(VIEW_H * scale) + 'px';
  }
  window.addEventListener('resize', resize);
  resize();

  announce('Solmar Bay title screen');
  requestAnimationFrame(frame);
}
