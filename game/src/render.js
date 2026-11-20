// Solmar Bay — canvas renderer: the world, night lighting, minimap, HUD
// and every screen (title, pause, wasted, busted, win).

import {
  VIEW_W, VIEW_H, WORLD_W, WORLD_H, GRID, ROAD_W, SEA_Y, HARBOUR_X, SAND_Y,
  COLORS, FONT, CAR_MODELS, PLACES, SUN_COINS, MISSIONS,
  districtAt, DISTRICT_STYLE,
} from './config.js';
import { wantedStars, currentMission, currentStep, stepTarget } from './world.js';

const TAU = Math.PI * 2;

export function makeCamera() {
  return { x: 465, y: 540, zoom: 1 };
}

export function updateCamera(cam, g) {
  const tx = g.player.x;
  const ty = g.player.y;
  cam.x += (tx - cam.x) * 0.12;
  cam.y += (ty - cam.y) * 0.12;
  const targetZoom = g.player.car ? 0.82 : 1;
  cam.zoom += (targetZoom - cam.zoom) * 0.05;
  const vw = VIEW_W / cam.zoom;
  const vh = VIEW_H / cam.zoom;
  cam.x = Math.max(vw / 2, Math.min(WORLD_W - vw / 2, cam.x));
  cam.y = Math.max(vh / 2, Math.min(WORLD_H - vh / 2, cam.y));
}

// How dark it is, 0 = full day, 1 = deep night, from the game clock.
export function darknessAt(clockMin) {
  const m = clockMin;
  if (m >= 420 && m < 1050) return 0; // 07:00–17:30
  if (m >= 1110 || m < 330) return 1; // 18:30–05:30
  if (m >= 1050) return (m - 1050) / 60; // dusk
  return 1 - (m - 330) / 90; // dawn
}

function clockText(clockMin) {
  const h = Math.floor(clockMin / 60) % 24;
  const m = Math.floor(clockMin % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCarShape(ctx, car, isPlayerCar) {
  const model = CAR_MODELS[car.model];
  const L = model.len;
  const W = model.wid;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  if (car.kind === 'wreck') {
    ctx.fillStyle = '#1a1a1a';
    roundRect(ctx, -L / 2, -W / 2, L, W, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(229,83,75,0.5)';
    ctx.beginPath();
    ctx.arc(0, 0, 10 + Math.sin(Date.now() / 300) * 3, 0, TAU);
    ctx.fill();
    ctx.restore();
    return;
  }
  // Wheels.
  ctx.fillStyle = '#141414';
  const wx = L / 2 - 12;
  const wy = W / 2 - 2;
  for (const [sx, sy] of [[-wx, -wy], [wx, -wy], [-wx, wy], [wx, wy]]) {
    ctx.fillRect(sx - 8, sy - 5, 16, 10);
  }
  // Body.
  ctx.fillStyle = car.kind === 'police' ? '#1d2733' : car.color;
  roundRect(ctx, -L / 2, -W / 2, L, W, 9);
  ctx.fill();
  if (car.kind === 'police') {
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(-L / 2 + 6, -W / 2, L - 12, W);
    ctx.fillStyle = '#1d2733';
    ctx.font = 'bold 9px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SBPD', 0, 0);
  } else {
    // Dark window band and light nose stripe.
    ctx.fillStyle = 'rgba(20,28,36,0.85)';
    roundRect(ctx, -L / 2 + 12, -W / 2 + 5, L / 2 - 8, W - 10, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(L / 2 - 5, -W / 2 + 4, 3, W - 8);
  }
  // Headlights.
  ctx.fillStyle = '#fff6c9';
  ctx.fillRect(L / 2 - 2, -W / 2 + 3, 3, 5);
  ctx.fillRect(L / 2 - 2, W / 2 - 8, 3, 5);
  if (isPlayerCar) {
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 2.5;
    roundRect(ctx, -L / 2 - 2, -W / 2 - 2, L + 4, W + 4, 10);
    ctx.stroke();
  }
  if (car.kind === 'police') {
    const phase = Math.floor(Date.now() / 300) % 2 === 0;
    ctx.fillStyle = phase ? '#ff3b30' : '#2f7bff';
    ctx.fillRect(-8, -W / 2 + 2, 16, 5);
    ctx.fillStyle = phase ? '#2f7bff' : '#ff3b30';
    ctx.fillRect(-8, W / 2 - 7, 16, 5);
  }
  ctx.restore();
}

function drawPerson(ctx, x, y, angle, shirt, skin, opts) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = '#2a2f38';
  ctx.fillRect(-6, 3, 12, 5); // trousers
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, TAU);
  ctx.fill();
  if (opts && opts.gun) {
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(16, 0);
    ctx.stroke();
  }
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(10, 0, 5, 0, TAU);
  ctx.fill();
  ctx.restore();
  if (opts && opts.panic) {
    ctx.fillStyle = COLORS.gold;
    ctx.font = 'bold 16px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('!', x, y - 16);
  }
  if (opts && opts.health != null && opts.health < 60) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 14, y - 24, 28, 5);
    ctx.fillStyle = COLORS.red;
    ctx.fillRect(x - 14, y - 24, 28 * (opts.health / 60), 5);
  }
}

export function drawWorld(ctx, g, cam) {
  const vw = VIEW_W / cam.zoom;
  const vh = VIEW_H / cam.zoom;
  const left = cam.x - vw / 2;
  const top = cam.y - vh / 2;
  ctx.save();
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-left, -top);

  // Ground.
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(left, top, vw, vh);

  // Sea: south strip and harbour strip.
  ctx.fillStyle = COLORS.sea;
  ctx.fillRect(left, SEA_Y, vw, WORLD_H - SEA_Y);
  ctx.fillRect(HARBOUR_X, top, WORLD_W - HARBOUR_X, vh);
  ctx.fillStyle = COLORS.deepSea;
  for (let y = SEA_Y + 40; y < WORLD_H; y += 60) {
    ctx.fillRect(left, y, vw, 4);
  }
  for (let x = HARBOUR_X + 40; x < WORLD_W; x += 60) {
    ctx.fillRect(x, top, 4, vh);
  }
  // Sand: beach band and harbour edge strip.
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(left, SAND_Y, vw, SEA_Y - SAND_Y);
  ctx.fillRect(HARBOUR_X - 26, top, 26, vh);

  // Park lawns.
  for (const b of g.city.blocks) {
    if (b.district === 'Palm Park') {
      ctx.fillStyle = COLORS.parkGrass;
      ctx.fillRect(b.x0 + 24, b.y0 + 24, GRID - 48, GRID - 48);
    }
  }

  // Big faint district labels on the ground.
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.font = 'bold 64px ' + FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labels = [
    ['Downtown', 2100, 1200], ['Old Town', 450, 1050], ['Marina', 3150, 1500],
    ['Beachfront', 1800, 2100], ['Industrial', 3150, 450],
    ['Suburbs', 600, 2100], ['Palm Park', 1650, 1650],
  ];
  for (const [name, x, y] of labels) ctx.fillText(name, x, y);

  // Roads: sidewalk underlay, asphalt, yellow centre dashes. Roads only
  // run on land — never across the sea or the harbour water.
  const roads = [...g.city.nodes.values()];
  const landBottom = Math.min(top + vh, SEA_Y);
  const landRight = Math.min(left + vw, HARBOUR_X);
  ctx.fillStyle = COLORS.sidewalk;
  for (const n of roads) {
    if (landBottom > top) ctx.fillRect(n.x - ROAD_W / 2 - 8, top, ROAD_W + 16, landBottom - top);
    if (landRight > left) ctx.fillRect(left, n.y - ROAD_W / 2 - 8, landRight - left, ROAD_W + 16);
  }
  ctx.fillStyle = COLORS.road;
  for (const n of roads) {
    if (landBottom > top) ctx.fillRect(n.x - ROAD_W / 2, top, ROAD_W, landBottom - top);
    if (landRight > left) ctx.fillRect(left, n.y - ROAD_W / 2, landRight - left, ROAD_W);
  }
  ctx.strokeStyle = COLORS.roadEdge;
  ctx.lineWidth = 2;
  for (const n of roads) {
    ctx.beginPath();
    if (landBottom > top) {
      ctx.moveTo(n.x - ROAD_W / 2, top); ctx.lineTo(n.x - ROAD_W / 2, landBottom);
      ctx.moveTo(n.x + ROAD_W / 2, top); ctx.lineTo(n.x + ROAD_W / 2, landBottom);
    }
    if (landRight > left) {
      ctx.moveTo(left, n.y - ROAD_W / 2); ctx.lineTo(landRight, n.y - ROAD_W / 2);
      ctx.moveTo(left, n.y + ROAD_W / 2); ctx.lineTo(landRight, n.y + ROAD_W / 2);
    }
    ctx.stroke();
  }
  ctx.fillStyle = COLORS.lane;
  for (const n of roads) {
    for (let y = Math.floor(top / 44) * 44; y < landBottom; y += 44) {
      ctx.fillRect(n.x - 2, y, 4, 20);
    }
    for (let x = Math.floor(left / 44) * 44; x < landRight; x += 44) {
      ctx.fillRect(x, n.y - 2, 20, 4);
    }
  }

  // Marina piers.
  ctx.fillStyle = '#8a6d3b';
  for (const pier of g.city.piers) {
    ctx.fillRect(pier.x, pier.y, pier.len, pier.w);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    for (let x = pier.x; x < pier.x + pier.len; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, pier.y);
      ctx.lineTo(x, pier.y + pier.w);
      ctx.stroke();
    }
  }

  // Palm Park pond.
  ctx.fillStyle = COLORS.sea;
  ctx.beginPath();
  ctx.ellipse(1650, 1650, 56, 36, 0, 0, TAU);
  ctx.fill();

  // Buildings: shadow, roof, inner court for tall towers, lit windows.
  const dark = darknessAt(g.clockMin);
  for (const b of g.city.buildings) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(b.x + b.height * 0.25, b.y + b.height * 0.25, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    if (b.height > 40) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x + b.w * 0.2, b.y + b.h * 0.2, b.w * 0.6, b.h * 0.6);
    }
    if (dark > 0.4 && b.lit) {
      const style = DISTRICT_STYLE[b.district] || DISTRICT_STYLE.Suburbs;
      ctx.fillStyle = style.window;
      const cols = Math.max(1, Math.floor(b.w / 26));
      const rows = Math.max(1, Math.floor(b.h / 26));
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const on = Math.sin(b.hash * 100 + i * 7.3 + j * 3.1) > -0.2;
          if (on) ctx.fillRect(b.x + 8 + i * 26, b.y + 8 + j * 26, 9, 11);
        }
      }
    }
  }

  // Trees.
  for (const t of g.city.trees) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(t.x + 4, t.y + 5, t.r, t.r * 0.7, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2f6b2a';
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#4d8a3f';
    ctx.beginPath();
    ctx.arc(t.x - 3, t.y - 3, t.r * 0.55, 0, TAU);
    ctx.fill();
  }

  // Place markers: coloured circle, letter, name when it fits.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const pl of PLACES) {
    ctx.fillStyle = pl.color;
    ctx.beginPath();
    ctx.arc(pl.x, pl.y, 15, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#141414';
    ctx.font = 'bold 14px ' + FONT;
    ctx.fillText(pl.letter, pl.x, pl.y + 1);
    const sx = (pl.x - left) * cam.zoom;
    if (sx > 60 && sx < VIEW_W - 60) {
      ctx.fillStyle = COLORS.text;
      ctx.font = 'bold 13px ' + FONT;
      ctx.fillText(pl.short, pl.x, pl.y - 26);
    }
  }

  // Sun Coins, pulsing gold.
  const pulse = 1 + Math.sin(g.time * 4) * 0.15;
  for (let i = 0; i < SUN_COINS.length; i++) {
    if (g.player.coins[i]) continue;
    const c = SUN_COINS[i];
    ctx.fillStyle = COLORS.gold;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 11 * pulse, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#8a6d1f';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#7a5c00';
    ctx.font = 'bold 12px ' + FONT;
    ctx.fillText('S', c.x, c.y + 1);
  }

  // Mission marker: pulsing ring and a vertical light beam.
  const target = stepTarget(g);
  if (target) {
    const r = 26 + Math.sin(g.time * 3) * 5;
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(target.x, target.y, r, 0, TAU);
    ctx.stroke();
    const grad = ctx.createLinearGradient(target.x, target.y - 260, target.x, target.y);
    grad.addColorStop(0, 'rgba(242,201,76,0)');
    grad.addColorStop(1, 'rgba(242,201,76,0.5)');
    ctx.fillStyle = grad;
    ctx.fillRect(target.x - 8, target.y - 260, 16, 260);
  }

  // Cars: others first, the player's car last.
  const others = g.cars.filter((c) => c !== g.player.car);
  for (const car of others) drawCarShape(ctx, car, false);
  if (g.player.car) drawCarShape(ctx, g.player.car, true);

  // Pedestrians, rivals, officers, player.
  for (const ped of g.peds) {
    drawPerson(ctx, ped.x, ped.y, ped.angle, ped.shirt, ped.skin, { panic: ped.panicT > 0 });
  }
  for (const r of g.rivals) {
    drawPerson(ctx, r.x, r.y, r.angle, '#c23b2e', '#e8b98a', { gun: true, health: r.health });
  }
  for (const off of g.officers) {
    ctx.strokeStyle = COLORS.blue;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(off.x, off.y, 18, 0, TAU);
    ctx.stroke();
    drawPerson(ctx, off.x, off.y, off.angle, '#1d2733', '#e8b98a', { gun: true });
  }
  const p = g.player;
  if (!p.car) {
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 18, 0, TAU);
    ctx.stroke();
    drawPerson(ctx, p.x, p.y, p.angle, '#e86a2a', '#e8b98a', { gun: p.weapon === 'pistol' });
  }

  // Bullet tracers.
  ctx.strokeStyle = '#ffe9a8';
  ctx.lineWidth = 2;
  for (const b of g.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - Math.cos(b.angle) * 14, b.y - Math.sin(b.angle) * 14);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // Particles.
  for (const pt of g.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.max);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // --- night lighting ---------------------------------------------------
  if (dark > 0.02) {
    const light = document.createElement('canvas');
    light.width = VIEW_W;
    light.height = VIEW_H;
    const lctx = light.getContext('2d');
    lctx.fillStyle = 'rgba(8,12,30,' + (dark * 0.55).toFixed(3) + ')';
    lctx.fillRect(0, 0, VIEW_W, VIEW_H);
    lctx.globalCompositeOperation = 'destination-out';
    const pool = (wx, wy, r, strength) => {
      const sx = (wx - left) * cam.zoom;
      const sy = (wy - top) * cam.zoom;
      const grad = lctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      grad.addColorStop(0, 'rgba(0,0,0,' + strength + ')');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = grad;
      lctx.beginPath();
      lctx.arc(sx, sy, r, 0, TAU);
      lctx.fill();
    };
    pool(p.x, p.y, 190, 0.95);
    if (p.car) {
      pool(p.x + Math.cos(p.angle) * 150, p.y + Math.sin(p.angle) * 150, 260, 0.9);
    }
    for (const n of g.city.nodes.values()) {
      if ((n.ix + n.iy) % 2 === 0) pool(n.x, n.y, 110, 0.8);
    }
    for (const car of g.cars) {
      if (car.kind === 'police') pool(car.x, car.y, 90, 0.85);
    }
    ctx.drawImage(light, 0, 0);
  }
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = COLORS.hudPanel;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = COLORS.hudBorder;
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function drawMinimap(ctx, g) {
  const mw = 216;
  const mh = 156;
  const x0 = 12;
  const y0 = 12;
  const sx = mw / WORLD_W;
  const sy = mh / WORLD_H;
  panel(ctx, x0, y0, mw, mh);
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, x0, y0, mw, mh, 8);
  ctx.clip();
  ctx.fillStyle = '#3d6b33';
  ctx.fillRect(x0, y0, mw, mh);
  ctx.fillStyle = COLORS.sea;
  ctx.fillRect(x0, y0 + SEA_Y * sy, mw, mh - SEA_Y * sy);
  ctx.fillRect(x0 + HARBOUR_X * sx, y0, mw - HARBOUR_X * sx, mh);
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(x0, y0 + SAND_Y * sy, mw, (SEA_Y - SAND_Y) * sy);
  ctx.fillStyle = COLORS.parkGrass;
  ctx.fillRect(x0 + 1350 * sx, y0 + 1500 * sy, 600 * sx, 300 * sy);
  ctx.strokeStyle = '#9a9a92';
  ctx.lineWidth = 1;
  for (const n of g.city.nodes.values()) {
    ctx.beginPath();
    ctx.moveTo(x0 + n.x * sx, y0);
    ctx.lineTo(x0 + n.x * sx, y0 + mh);
    ctx.moveTo(x0, y0 + n.y * sy);
    ctx.lineTo(x0 + mw, y0 + n.y * sy);
    ctx.stroke();
  }
  for (const pl of PLACES) {
    ctx.fillStyle = pl.color;
    ctx.beginPath();
    ctx.arc(x0 + pl.x * sx, y0 + pl.y * sy, 3.5, 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < SUN_COINS.length; i++) {
    if (g.player.coins[i]) continue;
    ctx.fillStyle = COLORS.gold;
    ctx.beginPath();
    ctx.arc(x0 + SUN_COINS[i].x * sx, y0 + SUN_COINS[i].y * sy, 2.5, 0, TAU);
    ctx.fill();
  }
  const target = stepTarget(g);
  if (target) {
    ctx.fillStyle = COLORS.gold;
    ctx.beginPath();
    ctx.arc(x0 + target.x * sx, y0 + target.y * sy, 4 + Math.sin(g.time * 4) * 1.5, 0, TAU);
    ctx.fill();
  }
  for (const car of g.cars) {
    if (car.kind !== 'police') continue;
    ctx.fillStyle = COLORS.red;
    ctx.beginPath();
    ctx.arc(x0 + car.x * sx, y0 + car.y * sy, 3, 0, TAU);
    ctx.fill();
  }
  // Player arrow.
  const px = x0 + g.player.x * sx;
  const py = y0 + g.player.y * sy;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(g.player.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 13px ' + FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(districtAt(g.player.x, g.player.y), x0 + 4, y0 + mh + 12);
}

export function drawHUD(ctx, g) {
  const p = g.player;
  const stars = wantedStars(g);
  drawMinimap(ctx, g);

  // Wanted stars and cash, top right.
  const pw = 210;
  panel(ctx, VIEW_W - pw - 12, 12, pw, 64);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 22px ' + FONT;
  let starText = '';
  for (let i = 0; i < 5; i++) starText += i < stars ? '★' : '☆';
  ctx.fillStyle = stars > 0 ? COLORS.gold : COLORS.muted;
  ctx.fillText(starText, VIEW_W - pw - 2, 30);
  ctx.fillStyle = '#7ee787';
  ctx.font = 'bold 18px ' + FONT;
  ctx.fillText('$' + p.cash, VIEW_W - pw - 2, 56);
  ctx.fillStyle = COLORS.muted;
  ctx.font = '13px ' + FONT;
  ctx.fillText('☀ ' + p.coinsTaken + '/8    ✓ ' + g.stats.missionsDone + '/6', VIEW_W - pw - 2, 74);

  // Clock and district, top centre.
  const cw = 190;
  panel(ctx, VIEW_W / 2 - cw / 2, 12, cw, 40);
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 16px ' + FONT;
  ctx.textAlign = 'center';
  ctx.fillText(clockText(g.clockMin) + '  ·  ' + districtAt(p.x, p.y), VIEW_W / 2, 33);

  // Health and armour, bottom left.
  panel(ctx, 12, VIEW_H - 76, 250, 64);
  ctx.textAlign = 'left';
  ctx.font = 'bold 13px ' + FONT;
  ctx.fillStyle = COLORS.text;
  ctx.fillText('HEALTH', 22, VIEW_H - 60);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(90, VIEW_H - 67, 150, 12);
  ctx.fillStyle = '#4fc3f7';
  ctx.fillRect(90, VIEW_H - 67, 150 * (p.health / 100), 12);
  ctx.fillText('ARMOUR', 22, VIEW_H - 40);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(90, VIEW_H - 47, 150, 12);
  ctx.fillStyle = '#f2c94c';
  ctx.fillRect(90, VIEW_H - 47, 150 * (p.armour / 100), 12);
  ctx.fillStyle = COLORS.muted;
  ctx.font = '13px ' + FONT;
  const weaponLine = p.weapon === 'pistol'
    ? 'Pistol  ·  ' + p.ammo + ' rounds'
    : 'Fists';
  ctx.fillText(weaponLine + '   (Q to switch)', 22, VIEW_H - 20);

  // Mission tracker, bottom centre.
  const m = currentMission(g);
  const s = currentStep(g);
  if (m && s) {
    const tw = 460;
    panel(ctx, VIEW_W / 2 - tw / 2, VIEW_H - 76, tw, 64);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.gold;
    ctx.font = 'bold 15px ' + FONT;
    ctx.fillText(m.title + '  ·  $' + m.reward, VIEW_W / 2, VIEW_H - 58);
    ctx.fillStyle = COLORS.text;
    ctx.font = '14px ' + FONT;
    let label = s.label;
    if (s.kind === 'kill') label = s.label.replace(/\(\d+\/\d+\)/, '(' + g.missionKills + '/' + s.count + ')');
    ctx.fillText(label, VIEW_W / 2, VIEW_H - 36);
    if (s.kind === 'timed' && g.missionTimer !== null) {
      ctx.fillStyle = g.missionTimer < 15 ? COLORS.red : COLORS.text;
      ctx.font = 'bold 15px ' + FONT;
      ctx.fillText(Math.ceil(g.missionTimer) + 's', VIEW_W / 2, VIEW_H - 18);
    } else {
      ctx.fillStyle = COLORS.muted;
      ctx.font = '12px ' + FONT;
      ctx.fillText(s.hint, VIEW_W / 2, VIEW_H - 18);
    }
  }

  // Speedometer, bottom right, while driving.
  if (p.car) {
    const model = CAR_MODELS[p.car.model];
    const mph = Math.round(Math.abs(p.car.speed) * 0.18);
    panel(ctx, VIEW_W - 172, VIEW_H - 76, 160, 64);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 26px ' + FONT;
    ctx.fillText(mph + ' mph', VIEW_W - 92, VIEW_H - 50);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '12px ' + FONT;
    ctx.fillText(model.name, VIEW_W - 92, VIEW_H - 28);
    if (p.car.health < 100) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(VIEW_W - 160, VIEW_H - 20, 136, 6);
      ctx.fillStyle = p.car.health > 40 ? '#7ee787' : COLORS.red;
      ctx.fillRect(VIEW_W - 160, VIEW_H - 20, 136 * (p.car.health / 100), 6);
    }
  }

  // Arrest warning.
  if (p.arrest > 0) {
    ctx.fillStyle = COLORS.red;
    ctx.font = 'bold 26px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('BEING ARRESTED — MOVE!', VIEW_W / 2, 110);
  }

  // Subtitle message.
  if (g.message) {
    ctx.font = '15px ' + FONT;
    const w = ctx.measureText(g.message).width + 32;
    panel(ctx, VIEW_W / 2 - w / 2, VIEW_H - 128, w, 34);
    ctx.fillStyle = COLORS.text;
    ctx.font = '15px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(g.message, VIEW_W / 2, VIEW_H - 110);
  }

  // Mission banner.
  if (g.banner) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 40px ' + FONT;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = COLORS.gold;
    ctx.fillText(g.banner.title, VIEW_W / 2, 190);
    ctx.shadowBlur = 0;
    ctx.font = '20px ' + FONT;
    ctx.fillStyle = COLORS.text;
    ctx.fillText(g.banner.sub, VIEW_W / 2, 222);
  }
}

function dim(ctx) {
  ctx.fillStyle = 'rgba(8,10,16,0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function bigTitle(ctx, text, y, color, size) {
  ctx.textAlign = 'center';
  ctx.font = 'bold ' + size + 'px ' + FONT;
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = color;
  ctx.fillText(text, VIEW_W / 2, y);
  ctx.shadowBlur = 0;
}

export function drawTitle(ctx, g, hasSave, saveInfo, blinkOn) {
  bigTitle(ctx, 'SOLMAR BAY', 220, COLORS.gold, 84);
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.text;
  ctx.font = '22px ' + FONT;
  ctx.fillText('An original open-world crime story', VIEW_W / 2, 268);
  ctx.font = '17px ' + FONT;
  ctx.fillStyle = COLORS.muted;
  ctx.fillText('Rico Vega returns to Solmar Bay. Tia Carmen has work for him.', VIEW_W / 2, 300);
  if (blinkOn) {
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 20px ' + FONT;
    ctx.fillText(
      hasSave ? 'Press ENTER to continue — or N for a new game' : 'Press ENTER to start',
      VIEW_W / 2, 380,
    );
  }
  ctx.font = '15px ' + FONT;
  ctx.fillStyle = COLORS.muted;
  const lines = [
    'WASD / arrows — move & drive      Mouse — aim      Click — shoot / punch',
    'E — enter car / interact      Q — switch weapon      R — radio      P / Esc — pause',
  ];
  ctx.fillText(lines[0], VIEW_W / 2, 440);
  ctx.fillText(lines[1], VIEW_W / 2, 466);
  if (hasSave && saveInfo) {
    ctx.fillStyle = COLORS.gold;
    ctx.font = '15px ' + FONT;
    ctx.fillText(saveInfo, VIEW_W / 2, 510);
  }
  ctx.fillStyle = 'rgba(185,183,168,0.8)';
  ctx.font = '12px ' + FONT;
  ctx.fillText('A work of original fiction. Any resemblance to real people or places is coincidence.', VIEW_W / 2, VIEW_H - 24);
}

export function drawPause(ctx, g) {
  dim(ctx);
  bigTitle(ctx, 'PAUSED', 300, COLORS.text, 56);
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.muted;
  ctx.font = '16px ' + FONT;
  ctx.fillText('WASD / arrows — move & drive      Mouse — aim      Click — shoot / punch', VIEW_W / 2, 360);
  ctx.fillText('E — enter car / interact      Q — switch weapon      R — radio      P / Esc — resume', VIEW_W / 2, 388);
  ctx.fillStyle = COLORS.gold;
  ctx.font = 'bold 17px ' + FONT;
  ctx.fillText(
    'Cash $' + g.player.cash + '   ·   Sun Coins ' + g.player.coinsTaken + '/8   ·   Missions ' +
    g.stats.missionsDone + '/6',
    VIEW_W / 2, 440,
  );
}

export function drawEndScreen(ctx, kind) {
  dim(ctx);
  if (kind === 'wasted') {
    bigTitle(ctx, 'WASTED', 300, COLORS.red, 72);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.text;
    ctx.font = '18px ' + FONT;
    ctx.fillText('Rico wakes up at Solmar General. The city keeps moving.', VIEW_W / 2, 360);
  } else if (kind === 'busted') {
    bigTitle(ctx, 'BUSTED', 300, COLORS.blue, 72);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.text;
    ctx.font = '18px ' + FONT;
    ctx.fillText('The SBPD lets Rico go — after a fine. Stay out of sight next time.', VIEW_W / 2, 360);
  } else {
    bigTitle(ctx, 'THE SOLMAR SCORE', 300, COLORS.gold, 64);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.text;
    ctx.font = '18px ' + FONT;
    ctx.fillText('Rico and Tia Carmen pull off the job of a lifetime. Solmar Bay is theirs.', VIEW_W / 2, 360);
  }
  ctx.fillStyle = COLORS.muted;
  ctx.font = 'bold 18px ' + FONT;
  ctx.fillText('Press ENTER to continue', VIEW_W / 2, 420);
}
