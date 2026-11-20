// The renderer: a top-down canvas view of Solmar Bay — city, traffic, people,
// combat, day/night lighting with headlights, and the full HUD with minimap.
import { VIEW, WORLD, PALETTE, PLACES, MISSIONS, FONT, PLAYER } from './config.js';
import { districtAt } from './world.js';

const TAU = Math.PI * 2;

function hash(n) {
  const h = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

/** 0 = full day, 1 = deep night, from the game clock in minutes. */
export function darknessAt(clock) {
  const h = clock / 60;
  if (h >= 7 && h < 17.5) return 0;
  if (h >= 18.5 && h < 5.5) return 1;
  if (h >= 17.5 && h < 18.5) return (h - 17.5) * 1;
  if (h >= 5.5 && h < 7) return 1 - (h - 5.5) / 1.5;
  if (h >= 18.5 || h < 5.5) return 1;
  return 0;
}

function formatClock(clock) {
  const h = Math.floor(clock / 60) % 24;
  const m = Math.floor(clock % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const DISTRICT_LABELS = [
  { x: 1950, y: 1050, name: 'DOWNTOWN' },
  { x: 450, y: 1050, name: 'OLD TOWN' },
  { x: 3150, y: 1500, name: 'MARINA' },
  { x: 1800, y: 2310, name: 'BEACHFRONT' },
  { x: 3000, y: 450, name: 'INDUSTRIAL' },
  { x: 750, y: 450, name: 'SUBURBS' },
  { x: 1650, y: 1650, name: 'PALM PARK' },
];

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const lightCanvas = document.createElement('canvas');
  lightCanvas.width = VIEW.width;
  lightCanvas.height = VIEW.height;
  const lctx = lightCanvas.getContext('2d');
  let zoom = 1;
  let camX = 1800;
  let camY = 1300;

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCarShape(car, isPlayer) {
    const m = car.model;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Wheels
    ctx.fillStyle = '#14161a';
    const wl = m.length * 0.32;
    const ww = m.width / 2 - 2;
    ctx.fillRect(-wl, -ww - 3, 16, 6);
    ctx.fillRect(wl - 8, -ww - 3, 16, 6);
    ctx.fillRect(-wl, ww - 3, 16, 6);
    ctx.fillRect(wl - 8, ww - 3, 16, 6);
    // Body
    ctx.fillStyle = car.color;
    roundRect(-m.length / 2, -m.width / 2, m.length, m.width, 8);
    ctx.fill();
    if (isPlayer) {
      ctx.strokeStyle = '#f2c94c';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    // Windows + roof
    ctx.fillStyle = 'rgba(20, 28, 38, 0.85)';
    roundRect(-m.length * 0.18, -m.width / 2 + 4, m.length * 0.3, m.width - 8, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(-m.length / 2 + 6, -m.width / 2 + 3, 10, m.width - 6);
    if (car.kind === 'police') {
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(-8, -m.width / 2, 16, m.width);
      ctx.fillStyle = '#20242c';
      ctx.font = 'bold 9px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('SBPD', 0, 3);
      const flash = Math.floor(car.sirenPhase) % 2 === 0;
      ctx.fillStyle = flash ? '#ff2a2a' : '#2a6bff';
      ctx.fillRect(-4, -m.width / 2 - 2, 8, 5);
      ctx.fillStyle = flash ? '#2a6bff' : '#ff2a2a';
      ctx.fillRect(-4, m.width / 2 - 3, 8, 5);
    }
    // Headlights
    ctx.fillStyle = '#fff6c8';
    ctx.fillRect(m.length / 2 - 2, -m.width / 2 + 3, 3, 5);
    ctx.fillRect(m.length / 2 - 2, m.width / 2 - 8, 3, 5);
    ctx.restore();
  }

  function drawPerson(x, y, angle, shirt, pants, isPlayer, aiming) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = pants;
    ctx.fillRect(-7, -5, 12, 4);
    ctx.fillRect(-7, 1, 12, 4);
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, TAU);
    ctx.fill();
    if (isPlayer) {
      ctx.strokeStyle = '#f2c94c';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Head
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(2, 0, 5.5, 0, TAU);
    ctx.fill();
    // Gun arm when aiming
    if (aiming) {
      ctx.strokeStyle = '#1c1e22';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(20, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWorld(state) {
    const p = state.player;
    const targetZoom = p.inCar ? 0.82 : 1;
    zoom += (targetZoom - zoom) * 0.05;
    camX += (clamp(p.x, VIEW.width / 2 / zoom, WORLD.width - VIEW.width / 2 / zoom) - camX) * 0.12;
    camY += (clamp(p.y, VIEW.height / 2 / zoom, WORLD.height - VIEW.height / 2 / zoom) - camY) * 0.12;
    const vw = VIEW.width / zoom;
    const vh = VIEW.height / zoom;
    const vx0 = camX - vw / 2;
    const vy0 = camY - vh / 2;
    const vx1 = camX + vw / 2;
    const vy1 = camY + vh / 2;
    const dark = darknessAt(state.clock);

    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(VIEW.width / 2 / zoom - camX, VIEW.height / 2 / zoom - camY);

    // Ground
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(vx0 - 40, vy0 - 40, vw + 80, vh + 80);
    // Sea: south and east
    ctx.fillStyle = PALETTE.sea;
    ctx.fillRect(vx0, Math.max(vy0, WORLD.seaY), vw, Math.max(0, vy1 - WORLD.seaY));
    ctx.fillRect(Math.max(vx0, WORLD.marinaX), vy0, Math.max(0, vx1 - WORLD.marinaX), vh);
    ctx.fillStyle = PALETTE.seaDeep;
    for (let i = 0; i < 6; i += 1) {
      const wy = WORLD.seaY + 30 + i * 26;
      if (wy < vy0 || wy > vy1) continue;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(vx0, wy, vw, 3);
    }
    ctx.globalAlpha = 1;
    // Sand
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(vx0, Math.max(vy0, WORLD.beachY), vw, Math.max(0, Math.min(vy1, WORLD.seaY) - WORLD.beachY));
    ctx.fillRect(Math.max(vx0, WORLD.marinaX - 40), vy0, 40, vh);
    // Park lawns
    ctx.fillStyle = PALETTE.parkGrass;
    for (const b of state.city.blocks) {
      if (b.district !== 'park') continue;
      if (b.x1 < vx0 || b.x0 > vx1 || b.y1 < vy0 || b.y0 > vy1) continue;
      ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    }
    // District labels painted on the ground
    ctx.font = 'bold 44px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    for (const l of DISTRICT_LABELS) {
      if (l.x < vx0 - 200 || l.x > vx1 + 200 || l.y < vy0 - 60 || l.y > vy1 + 60) continue;
      ctx.fillText(l.name, l.x, l.y);
    }
    // Roads: sidewalk underlay, then asphalt
    const half = WORLD.roadWidth / 2;
    ctx.fillStyle = PALETTE.sidewalk;
    for (let gx = 1; gx * WORLD.roadSpacing < WORLD.width; gx += 1) {
      const x = gx * WORLD.roadSpacing;
      if (x < vx0 - 60 || x > vx1 + 60) continue;
      ctx.fillRect(x - half - 8, Math.max(vy0, 0), WORLD.roadWidth + 16, Math.min(vy1, WORLD.seaY) - Math.max(vy0, 0));
    }
    for (let gy = 1; gy * WORLD.roadSpacing < WORLD.height; gy += 1) {
      const y = gy * WORLD.roadSpacing;
      if (y < vy0 - 60 || y > vy1 + 60) continue;
      ctx.fillRect(Math.max(vx0, 0), y - half - 8, Math.min(vx1, WORLD.marinaX) - Math.max(vx0, 0), WORLD.roadWidth + 16);
    }
    ctx.fillStyle = PALETTE.road;
    for (let gx = 1; gx * WORLD.roadSpacing < WORLD.width; gx += 1) {
      const x = gx * WORLD.roadSpacing;
      if (x < vx0 - 60 || x > vx1 + 60) continue;
      ctx.fillRect(x - half, Math.max(vy0, 0), WORLD.roadWidth, Math.min(vy1, WORLD.seaY) - Math.max(vy0, 0));
    }
    for (let gy = 1; gy * WORLD.roadSpacing < WORLD.height; gy += 1) {
      const y = gy * WORLD.roadSpacing;
      if (y < vy0 - 60 || y > vy1 + 60) continue;
      ctx.fillRect(Math.max(vx0, 0), y - half, Math.min(vx1, WORLD.marinaX) - Math.max(vx0, 0), WORLD.roadWidth);
    }
    // Lane dashes
    ctx.fillStyle = PALETTE.laneMark;
    for (let gx = 1; gx * WORLD.roadSpacing < WORLD.width; gx += 1) {
      const x = gx * WORLD.roadSpacing;
      if (x < vx0 - 60 || x > vx1 + 60) continue;
      for (let y = Math.max(0, Math.floor(vy0 / 44) * 44); y < Math.min(vy1, WORLD.seaY); y += 44) {
        ctx.fillRect(x - 2, y, 4, 22);
      }
    }
    for (let gy = 1; gy * WORLD.roadSpacing < WORLD.height; gy += 1) {
      const y = gy * WORLD.roadSpacing;
      if (y < vy0 - 60 || y > vy1 + 60) continue;
      for (let x = Math.max(0, Math.floor(vx0 / 44) * 44); x < Math.min(vx1, WORLD.marinaX); x += 44) {
        ctx.fillRect(x, y - 2, 22, 4);
      }
    }
    // Marina piers
    ctx.fillStyle = '#8a6a4a';
    for (const pier of state.city.piers) {
      ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
      ctx.fillStyle = '#6a4a2a';
      for (let x = pier.x + 12; x < pier.x + pier.w; x += 24) ctx.fillRect(x, pier.y, 2, pier.h);
      ctx.fillStyle = '#8a6a4a';
    }
    // Park pond
    ctx.fillStyle = PALETTE.sea;
    ctx.beginPath();
    ctx.ellipse(1650, 1650, 56, 36, 0, 0, TAU);
    ctx.fill();
    // Buildings: shadow, roof, lit windows
    for (const b of state.city.buildings) {
      if (b.x + b.w < vx0 || b.x > vx1 || b.y + b.h < vy0 || b.y > vy1) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(b.x + b.height * 0.3, b.y + b.height * 0.4, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      // Roof detail: a darker inner court for big downtown towers
      if (b.height > 40) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(b.x + b.w * 0.25, b.y + b.h * 0.25, b.w * 0.5, b.h * 0.5);
      }
      if (dark > 0.25) {
        const cols = Math.max(2, Math.floor(b.w / 20));
        const rows = Math.max(2, Math.floor(b.h / 20));
        for (let i = 0; i < cols; i += 1) {
          for (let j = 0; j < rows; j += 1) {
            if (hash(b.seed * 997 + i * 13 + j * 7) < 0.32) {
              ctx.fillStyle = `rgba(255, 214, 106, ${0.55 + 0.45 * dark})`;
              ctx.fillRect(b.x + 6 + i * ((b.w - 12) / cols), b.y + 6 + j * ((b.h - 12) / rows), 7, 9);
            }
          }
        }
      }
    }
    // Trees
    for (const t of state.city.trees) {
      if (t.x < vx0 || t.x > vx1 || t.y < vy0 || t.y > vy1) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(t.x + 4, t.y + 5, t.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#2f6b2a';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#3f8a35';
      ctx.beginPath();
      ctx.arc(t.x - 2, t.y - 2, t.r * 0.55, 0, TAU);
      ctx.fill();
    }
    // Places: markers with labels
    ctx.font = 'bold 13px ' + FONT;
    ctx.textAlign = 'center';
    for (const [key, place] of Object.entries(PLACES)) {
      if (place.x < vx0 - 80 || place.x > vx1 + 80 || place.y < vy0 - 80 || place.y > vy1 + 80) continue;
      ctx.fillStyle = place.color;
      ctx.beginPath();
      ctx.arc(place.x, place.y, 16, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#14161a';
      ctx.font = 'bold 15px ' + FONT;
      ctx.fillText(key === 'garage' ? 'C' : key === 'gunshop' ? 'G' : key === 'spray' ? 'P' : key === 'hospital' ? 'H' : key === 'bank' ? '$' : 'S', place.x, place.y + 5);
      // The name label only when it fits on screen whole: a clipped label
      // reads as a stray fragment at the edge.
      if (place.x > vx0 + 110 && place.x < vx1 - 110 && place.y > vy0 + 40 && place.y < vy1 - 10) {
        ctx.font = '11px ' + FONT;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(place.name, place.x, place.y - 24);
      }
    }
    // Sun Coins
    for (const coin of state.coins) {
      if (coin.taken) continue;
      if (coin.x < vx0 || coin.x > vx1 || coin.y < vy0 || coin.y > vy1) continue;
      const pulse = 1 + Math.sin(state.time * 4 + coin.x) * 0.12;
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(coin.x, coin.y, 13 * pulse, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#8a6d1f';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#8a6d1f';
      ctx.font = 'bold 13px ' + FONT;
      ctx.fillText('☀', coin.x, coin.y + 5);
    }
    // Mission marker: pulsing ring + beam
    const mission = MISSIONS[state.missionIndex];
    const step = mission ? mission.steps[state.missionStep] : null;
    if (step && step.x !== undefined) {
      const pulse = 1 + Math.sin(state.time * 5) * 0.15;
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(step.x, step.y, 34 * pulse, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(242, 201, 76, 0.18)';
      ctx.beginPath();
      ctx.arc(step.x, step.y, 34 * pulse, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(242, 201, 76, 0.10)';
      ctx.fillRect(step.x - 8, step.y - 260, 16, 260);
    }
    // Cars: everyone else first, the player's car last so it is never hidden.
    for (const car of state.cars) {
      if (car === p.inCar) continue;
      if (car.x < vx0 - 80 || car.x > vx1 + 80 || car.y < vy0 - 80 || car.y > vy1 + 80) continue;
      if (car.kind === 'wreck') {
        ctx.save();
        ctx.translate(car.x, car.y);
        ctx.rotate(car.angle);
        ctx.fillStyle = '#1c1c1c';
        roundRect(-car.model.length / 2, -car.model.width / 2, car.model.length, car.model.width, 8);
        ctx.fill();
        ctx.fillStyle = 'rgba(229, 83, 75, 0.5)';
        ctx.fillRect(-8, -6, 16, 12);
        ctx.restore();
        continue;
      }
      drawCarShape(car, false);
    }
    if (p.inCar) drawCarShape(p.inCar, true);
    // Pedestrians
    for (const ped of state.peds) {
      if (ped.x < vx0 || ped.x > vx1 || ped.y < vy0 || ped.y > vy1) continue;
      drawPerson(ped.x, ped.y, ped.angle, ped.shirt, '#2a2d33', false, false);
      if (ped.panic > 0) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px ' + FONT;
        ctx.fillText('!', ped.x, ped.y - 16);
      }
    }
    // Rival crew
    for (const r of state.rivals) {
      drawPerson(r.x, r.y, r.angle, '#8a2a2a', '#1c1c1c', false, true);
      ctx.fillStyle = '#e5534b';
      ctx.fillRect(r.x - 12, r.y - 22, 24, 4);
      ctx.fillStyle = '#7ee787';
      ctx.fillRect(r.x - 12, r.y - 22, 24 * Math.max(0, r.health / 60), 4);
    }
    // Foot officers
    for (const cop of state.cops) {
      drawPerson(cop.x, cop.y, cop.angle, '#20242c', '#20242c', false, true);
      ctx.fillStyle = '#4fc3f7';
      ctx.beginPath();
      ctx.arc(cop.x, cop.y, 11, 0, TAU);
      ctx.stroke();
    }
    // Player on foot
    if (!p.inCar) {
      drawPerson(p.x, p.y, p.angle, '#e86a2a', '#2a2d33', true, p.weapon === 'pistol');
    }
    // Bullets: tracers
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 2;
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x - Math.cos(b.angle) * 14, b.y - Math.sin(b.angle) * 14);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Particles
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Night lighting: darken the world, then cut light pools.
    if (dark > 0.05) {
      lctx.clearRect(0, 0, VIEW.width, VIEW.height);
      lctx.fillStyle = `rgba(6, 10, 26, ${0.62 * dark})`;
      lctx.fillRect(0, 0, VIEW.width, VIEW.height);
      lctx.globalCompositeOperation = 'destination-out';
      const screenPos = (x, y) => [
        (x - camX) * zoom + VIEW.width / 2,
        (y - camY) * zoom + VIEW.height / 2,
      ];
      const pool = (x, y, r, a) => {
        const [sx, sy] = screenPos(x, y);
        const g = lctx.createRadialGradient(sx, sy, 10, sx, sy, r);
        g.addColorStop(0, `rgba(0,0,0,${a})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        lctx.fillStyle = g;
        lctx.beginPath();
        lctx.arc(sx, sy, r, 0, TAU);
        lctx.fill();
      };
      pool(p.x, p.y, 190, 0.95);
      // Headlights: two cones ahead of a driven car
      if (p.inCar) {
        const car = p.inCar;
        const [fx, fy] = screenPos(car.x + Math.cos(car.angle) * 150, car.y + Math.sin(car.angle) * 150);
        const g = lctx.createRadialGradient(fx, fy, 10, fx, fy, 260);
        g.addColorStop(0, 'rgba(0,0,0,0.9)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        lctx.fillStyle = g;
        lctx.beginPath();
        lctx.arc(fx, fy, 260, 0, TAU);
        lctx.fill();
      }
      // Streetlights at every other intersection
      for (const node of state.city.nodes) {
        if ((node.id % 2) !== 0) continue;
        const [sx, sy] = screenPos(node.x, node.y);
        if (sx < -120 || sx > VIEW.width + 120 || sy < -120 || sy > VIEW.height + 120) continue;
        pool(node.x, node.y, 110, 0.75);
      }
      // Police light bars glow
      for (const car of state.cars) {
        if (car.kind !== 'police') continue;
        const [sx, sy] = screenPos(car.x, car.y);
        if (sx < -80 || sx > VIEW.width + 80 || sy < -80 || sy > VIEW.height + 80) continue;
        pool(car.x, car.y, 90, 0.6);
      }
      lctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(lightCanvas, 0, 0);
    }
    return { camX, camY, zoom, dark };
  }

  function drawMinimap(state, cam) {
    const mw = 216;
    const mh = 156;
    const mx = 16;
    const my = 16;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(mx - 6, my - 6, mw + 12, mh + 12, 8);
    ctx.fill();
    ctx.strokeStyle = PALETTE.hudBorder;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.rect(mx, my, mw, mh);
    ctx.clip();
    ctx.fillStyle = '#2d4a26';
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = '#1d5f7a';
    ctx.fillRect(mx + WORLD.marinaX * sx, my, mw - WORLD.marinaX * sx, mh);
    ctx.fillRect(mx, my + WORLD.seaY * sy, mw, mh - WORLD.seaY * sy);
    ctx.fillStyle = '#d9c184';
    ctx.fillRect(mx, my + WORLD.beachY * sy, mw, (WORLD.seaY - WORLD.beachY) * sy);
    ctx.fillStyle = '#5d8f47';
    ctx.fillRect(mx + 1350 * sx, my + 1500 * sy, 600 * sx, 300 * sy);
    ctx.strokeStyle = '#55595f';
    ctx.lineWidth = 2;
    for (let gx = 1; gx * WORLD.roadSpacing < WORLD.width; gx += 1) {
      ctx.beginPath();
      ctx.moveTo(mx + gx * WORLD.roadSpacing * sx, my);
      ctx.lineTo(mx + gx * WORLD.roadSpacing * sx, my + WORLD.seaY * sy);
      ctx.stroke();
    }
    for (let gy = 1; gy * WORLD.roadSpacing < WORLD.height; gy += 1) {
      ctx.beginPath();
      ctx.moveTo(mx, my + gy * WORLD.roadSpacing * sy);
      ctx.lineTo(mx + WORLD.marinaX * sx, my + gy * WORLD.roadSpacing * sy);
      ctx.stroke();
    }
    // Places
    for (const place of Object.values(PLACES)) {
      ctx.fillStyle = place.color;
      ctx.fillRect(mx + place.x * sx - 2, my + place.y * sy - 2, 4, 4);
    }
    // Sun Coins
    ctx.fillStyle = PALETTE.gold;
    for (const coin of state.coins) {
      if (coin.taken) continue;
      ctx.beginPath();
      ctx.arc(mx + coin.x * sx, my + coin.y * sy, 2.5, 0, TAU);
      ctx.fill();
    }
    // Mission marker
    const mission = MISSIONS[state.missionIndex];
    const step = mission ? mission.steps[state.missionStep] : null;
    if (step && step.x !== undefined) {
      const pulse = 5 + Math.sin(state.time * 5) * 2;
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(mx + step.x * sx, my + step.y * sy, pulse, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#14161a';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // Police
    ctx.fillStyle = '#ff2a2a';
    for (const car of state.cars) {
      if (car.kind !== 'police') continue;
      ctx.beginPath();
      ctx.arc(mx + car.x * sx, my + car.y * sy, 3, 0, TAU);
      ctx.fill();
    }
    // Player arrow
    const p = state.player;
    ctx.save();
    ctx.translate(mx + p.x * sx, my + p.y * sy);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    // Viewport rectangle
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    const vw = VIEW.width / cam.zoom;
    const vh = VIEW.height / cam.zoom;
    ctx.strokeRect(
      mx + (cam.camX - vw / 2) * sx,
      my + (cam.camY - vh / 2) * sy,
      vw * sx, vh * sy,
    );
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 12px ' + FONT;
    ctx.textAlign = 'left';
    const districtName = { downtown: 'Downtown', oldtown: 'Old Town', marina: 'Marina', beach: 'Beachfront', industrial: 'Industrial', park: 'Palm Park', suburbs: 'Suburbs' }[districtAt(p.x, p.y)];
    ctx.fillText(districtName, mx, my + mh + 20);
  }

  function drawHud(state, cam) {
    const p = state.player;
    drawMinimap(state, cam);
    // Wanted stars + cash, top right — on a panel so they read over any roof.
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(VIEW.width - 252, 12, 242, 100, 8);
    ctx.fill();
    ctx.strokeStyle = PALETTE.hudBorder;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.font = 'bold 26px ' + FONT;
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < p.wanted ? '★' : '☆';
    ctx.fillStyle = p.wanted > 0 ? '#ffd76a' : 'rgba(255,255,255,0.55)';
    ctx.fillText(stars, VIEW.width - 20, 44);
    ctx.font = 'bold 22px ' + FONT;
    ctx.fillStyle = '#7ee787';
    ctx.fillText(`$${p.cash.toLocaleString('en-US')}`, VIEW.width - 20, 76);
    ctx.font = '14px ' + FONT;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(`☀ ${p.coins}/8   ✦ ${state.stats.missionsDone}/6 missions`, VIEW.width - 20, 100);
    // Clock + district, top centre — on a panel so they read over any roof.
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(VIEW.width / 2 - 118, 8, 236, 54, 8);
    ctx.fill();
    ctx.strokeStyle = PALETTE.hudBorder;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px ' + FONT;
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(formatClock(state.clock), VIEW.width / 2, 34);
    ctx.font = '13px ' + FONT;
    ctx.fillStyle = PALETTE.muted;
    const districtName = { downtown: 'Downtown', oldtown: 'Old Town', marina: 'Marina', beach: 'Beachfront', industrial: 'Industrial', park: 'Palm Park', suburbs: 'Suburbs' }[districtAt(p.x, p.y)];
    ctx.fillText(districtName + ' — Solmar Bay', VIEW.width / 2, 54);
    // Health / armour, bottom left
    const bx = 20;
    const by = VIEW.height - 84;
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px ' + FONT;
    ctx.fillStyle = PALETTE.text;
    ctx.fillText('HEALTH', bx, by - 6);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx, by, 220, 12);
    ctx.fillStyle = p.health > 30 ? '#7ee787' : '#e5534b';
    ctx.fillRect(bx, by, 220 * (p.health / PLAYER.health), 12);
    ctx.fillText('ARMOUR', bx, by + 30);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx, by + 36, 220, 12);
    ctx.fillStyle = '#4fc3f7';
    ctx.fillRect(bx, by + 36, 220 * (p.armor / PLAYER.armor), 12);
    ctx.font = '13px ' + FONT;
    ctx.fillStyle = PALETTE.text;
    const weapon = p.weapon === 'pistol' ? `Pistol — ${p.ammo} rounds` : 'Fists';
    ctx.fillText(p.inCar ? `${p.inCar.model.name}  [E] exit` : `${weapon}  [Q] switch  [E] enter car`, bx, by + 66);
    // Mission tracker, bottom centre
    const mission = MISSIONS[state.missionIndex];
    const step = mission ? mission.steps[state.missionStep] : null;
    if (mission && step) {
      const label = step.type === 'kill'
        ? step.label.replace(/\(\d+\/\d+\)/, `(${state.missionKills}/${step.count})`)
        : step.label;
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.hudPanel;
      const tw = 420;
      roundRect(VIEW.width / 2 - tw / 2, VIEW.height - 92, tw, 52, 8);
      ctx.fill();
      ctx.strokeStyle = PALETTE.hudBorder;
      ctx.stroke();
      ctx.fillStyle = PALETTE.gold;
      ctx.font = 'bold 14px ' + FONT;
      ctx.fillText(mission.title.toUpperCase(), VIEW.width / 2, VIEW.height - 70);
      ctx.fillStyle = PALETTE.text;
      ctx.font = '14px ' + FONT;
      ctx.fillText(label, VIEW.width / 2, VIEW.height - 50);
      if (step.type === 'timed' && state.missionTimer > 0) {
        ctx.fillStyle = state.missionTimer < 15 ? '#e5534b' : PALETTE.text;
        ctx.font = 'bold 16px ' + FONT;
        ctx.fillText(`${Math.ceil(state.missionTimer)}s`, VIEW.width / 2, VIEW.height - 100);
      }
    }
    // Speed, bottom right — on a panel so it reads over any roof.
    if (p.inCar) {
      ctx.fillStyle = PALETTE.hudPanel;
      roundRect(VIEW.width - 192, VIEW.height - 100, 182, 86, 8);
      ctx.fill();
      ctx.strokeStyle = PALETTE.hudBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.font = 'bold 34px ' + FONT;
      ctx.fillStyle = PALETTE.text;
      const mph = Math.round(Math.abs(p.inCar.speed) * 0.18);
      ctx.fillText(`${mph}`, VIEW.width - 44, VIEW.height - 30);
      ctx.font = '13px ' + FONT;
      ctx.fillStyle = PALETTE.muted;
      ctx.fillText('MPH', VIEW.width - 20, VIEW.height - 30);
      if (p.inCar.health < 100) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(VIEW.width - 164, VIEW.height - 66, 144, 10);
        ctx.fillStyle = p.inCar.health > 35 ? '#f2c94c' : '#e5534b';
        ctx.fillRect(VIEW.width - 164, VIEW.height - 66, 144 * (p.inCar.health / 100), 10);
      }
    }
    // Arrest progress
    if (p.arrest > 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e5534b';
      ctx.font = 'bold 18px ' + FONT;
      ctx.fillText('BEING ARRESTED — MOVE!', VIEW.width / 2, 120);
    }
    // Subtitle message
    if (state.message && state.time < state.messageUntil) {
      ctx.textAlign = 'center';
      ctx.font = '15px ' + FONT;
      const lines = wrapText(state.message, 760);
      const lh = 20;
      const y0 = VIEW.height - 150 - lines.length * lh;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(VIEW.width / 2 - 400, y0 - 8, 800, lines.length * lh + 16, 8);
      ctx.fill();
      ctx.fillStyle = PALETTE.text;
      lines.forEach((line, i) => ctx.fillText(line, VIEW.width / 2, y0 + 12 + i * lh));
    }
    // Banner
    if (state.banner && state.time < state.bannerUntil) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 40px ' + FONT;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillText(state.banner, VIEW.width / 2 + 2, 182);
      ctx.fillStyle = PALETTE.gold;
      ctx.fillText(state.banner, VIEW.width / 2, 180);
    }
  }

  function wrapText(text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    ctx.font = '15px ' + FONT;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawTitle(state, saveInfo) {
    // Slow pan over the city behind the title.
    const t = state.time * 0.02;
    camX = 1800 + Math.sin(t * 0.3) * 500;
    camY = 1300 + Math.cos(t * 0.23) * 300;
    zoom = 0.75;
    const savedZoom = zoom;
    void savedZoom;
    // Draw the world with a fixed camera for the backdrop.
    const vw = VIEW.width / zoom;
    const vh = VIEW.height / zoom;
    void vw;
    void vh;
    drawWorldBackdrop(state);
    ctx.fillStyle = 'rgba(6, 10, 20, 0.55)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 84px ' + FONT;
    ctx.fillText('SOLMAR BAY', VIEW.width / 2, 250);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '24px ' + FONT;
    ctx.fillText('An original open-world crime story', VIEW.width / 2, 296);
    ctx.font = '16px ' + FONT;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('Rico Vega returns to Solmar Bay. Tia Carmen has work for him.', VIEW.width / 2, 330);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 22px ' + FONT;
    const blink = Math.floor(state.time * 1.5) % 2 === 0;
    if (blink) ctx.fillText(saveInfo ? 'Press ENTER to continue — or N for a new game' : 'Press ENTER to start', VIEW.width / 2, 430);
    ctx.font = '15px ' + FONT;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('WASD move / drive   ·   Mouse aim   ·   Click shoot / punch   ·   E enter car & interact', VIEW.width / 2, 500);
    ctx.fillText('Q switch weapon   ·   R radio   ·   P pause   ·   Missions, wanted level, 8 Sun Coins', VIEW.width / 2, 526);
    if (saveInfo) {
      ctx.fillStyle = PALETTE.text;
      ctx.font = '15px ' + FONT;
      ctx.fillText(saveInfo, VIEW.width / 2, 580);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '13px ' + FONT;
    ctx.fillText('A work of original fiction. Any resemblance to real places or people is coincidence.', VIEW.width / 2, VIEW.height - 24);
  }

  function drawWorldBackdrop(state) {
    // Same world draw as play, but with the camera already set by drawTitle.
    const p = state.player;
    void p;
    const vw = VIEW.width / zoom;
    const vh = VIEW.height / zoom;
    const vx0 = camX - vw / 2;
    const vy0 = camY - vh / 2;
    const vx1 = camX + vw / 2;
    const vy1 = camY + vh / 2;
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(VIEW.width / 2 / zoom - camX, VIEW.height / 2 / zoom - camY);
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(vx0 - 40, vy0 - 40, vw + 80, vh + 80);
    ctx.fillStyle = PALETTE.sea;
    ctx.fillRect(vx0, Math.max(vy0, WORLD.seaY), vw, Math.max(0, vy1 - WORLD.seaY));
    ctx.fillRect(Math.max(vx0, WORLD.marinaX), vy0, Math.max(0, vx1 - WORLD.marinaX), vh);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(vx0, Math.max(vy0, WORLD.beachY), vw, Math.max(0, Math.min(vy1, WORLD.seaY) - WORLD.beachY));
    const half = WORLD.roadWidth / 2;
    ctx.fillStyle = PALETTE.road;
    for (let gx = 1; gx * WORLD.roadSpacing < WORLD.width; gx += 1) {
      const x = gx * WORLD.roadSpacing;
      if (x < vx0 - 60 || x > vx1 + 60) continue;
      ctx.fillRect(x - half, Math.max(vy0, 0), WORLD.roadWidth, Math.min(vy1, WORLD.seaY) - Math.max(vy0, 0));
    }
    for (let gy = 1; gy * WORLD.roadSpacing < WORLD.height; gy += 1) {
      const y = gy * WORLD.roadSpacing;
      if (y < vy0 - 60 || y > vy1 + 60) continue;
      ctx.fillRect(Math.max(vx0, 0), y - half, Math.min(vx1, WORLD.marinaX) - Math.max(vx0, 0), WORLD.roadWidth);
    }
    for (const b of state.city.buildings) {
      if (b.x + b.w < vx0 || b.x > vx1 || b.y + b.h < vy0 || b.y > vy1) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(b.x + b.height * 0.3, b.y + b.height * 0.4, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    for (const car of state.cars) {
      if (car.x < vx0 - 80 || car.x > vx1 + 80 || car.y < vy0 - 80 || car.y > vy1 + 80) continue;
      if (car.kind === 'wreck') continue;
      drawCarShape(car, false);
    }
    ctx.restore();
  }

  function drawCenterCard(title, sub, color) {
    ctx.fillStyle = 'rgba(6, 10, 20, 0.6)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.font = 'bold 72px ' + FONT;
    ctx.fillText(title, VIEW.width / 2, VIEW.height / 2 - 10);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '20px ' + FONT;
    ctx.fillText(sub, VIEW.width / 2, VIEW.height / 2 + 36);
    ctx.font = '16px ' + FONT;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('Press ENTER to continue', VIEW.width / 2, VIEW.height / 2 + 78);
  }

  function drawPaused(state) {
    drawWorld(state);
    ctx.fillStyle = 'rgba(6, 10, 20, 0.6)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 48px ' + FONT;
    ctx.fillText('PAUSED', VIEW.width / 2, 300);
    ctx.font = '17px ' + FONT;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('WASD move / drive   ·   Mouse aim   ·   Click shoot   ·   E enter car & interact', VIEW.width / 2, 350);
    ctx.fillText('Q switch weapon   ·   R radio   ·   P resume', VIEW.width / 2, 378);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '16px ' + FONT;
    ctx.fillText(`Cash $${state.player.cash}  ·  Sun Coins ${state.player.coins}/8  ·  Missions ${state.stats.missionsDone}/6`, VIEW.width / 2, 430);
  }

  function draw(state, screen, saveInfo) {
    ctx.clearRect(0, 0, VIEW.width, VIEW.height);
    if (screen === 'title') {
      drawTitle(state, saveInfo);
      return;
    }
    const cam = drawWorld(state);
    if (screen === 'play') {
      drawHud(state, cam);
      return;
    }
    if (screen === 'paused') {
      drawPaused(state);
      return;
    }
    if (screen === 'wasted') {
      drawHud(state, cam);
      drawCenterCard('WASTED', 'Rico wakes up at Solmar General. The city keeps moving.', '#e5534b');
      return;
    }
    if (screen === 'busted') {
      drawHud(state, cam);
      drawCenterCard('BUSTED', 'The SBPD lets Rico go — after a fine. Stay out of sight next time.', '#4fc3f7');
      return;
    }
    if (screen === 'win') {
      drawHud(state, cam);
      drawCenterCard('THE SOLMAR SCORE', 'Rico and Tia Carmen pull off the job of a lifetime. Solmar Bay is theirs.', '#f2c94c');
    }
  }

  /** Centre the camera on the player at once (screenshot staging). */
  function snapCamera(state) {
    const p = state.player;
    zoom = p.inCar ? 0.82 : 1;
    camX = clamp(p.x, VIEW.width / 2 / zoom, WORLD.width - VIEW.width / 2 / zoom);
    camY = clamp(p.y, VIEW.height / 2 / zoom, WORLD.height - VIEW.height / 2 / zoom);
  }

  return { draw, formatClock, getCamera: () => ({ camX, camY, zoom }), snapCamera };
}
