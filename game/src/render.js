// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. One frame shows the whole heist: the gallery room, the thief, the guards with
// their vision cones, the wall cameras with theirs, the loot and the alarm meter.
// Flat shapes, canvas text for the HUD and the panels. Text that holds a number is
// rebuilt only when the number changes, so a frame allocates nothing.
import { FIELD, FONT, LOOT_SPOTS, PALETTE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WIN = 'win';
export const SCREEN_OVER = 'over';

const PANEL = { width: 640, top: 150, line: 34, bottom: 76 };
const ALARM_BAR = { x: 470, y: 14, width: 340, height: 18 };

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

/** Paintings hung on the display cases: a frame, a coloured canvas, one simple shape. */
const PAINTINGS = [
  { fill: '#274b63', shape: '#f2c94c', kind: 'circle' },
  { fill: '#5c2e3e', shape: '#7fe3f0', kind: 'triangle' },
  { fill: '#2e4a2f', shape: '#e8e8ec', kind: 'circle' },
  { fill: '#4a2f1e', shape: '#e5534b', kind: 'triangle' },
  { fill: '#3a2e5c', shape: '#f2c94c', kind: 'circle' },
];

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const lootLabel = cachedLabel('LOOT $');
  const timerLabel = cachedLabel('');
  const alarmLabel = cachedLabel('');
  const scoreLabel = cachedLabel('Score ');
  const bestLabel = cachedLabel('Best ');
  const particles = [];

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  /** A short-lived sparkle burst (pickups, spots). Visual only, never simulation. */
  function burst(x, y, color) {
    for (let i = 0; i < 10; i += 1) {
      particles.push({ x, y, color, life: 0.5, age: 0, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160 });
    }
  }

  function drawFloor(state) {
    context.fillStyle = PALETTE.floor;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Parquet tiles.
    context.fillStyle = PALETTE.floorTile;
    const tile = 80;
    for (let ty = 0; ty < FIELD.height / tile; ty += 1) {
      for (let tx = 0; tx < FIELD.width / tile; tx += 1) {
        if ((tx + ty) % 2 === 0) context.fillRect(tx * tile, ty * tile, tile, tile);
      }
    }
    // The red carpet runner: vault to exit, the thief's route.
    context.fillStyle = '#5c1f24';
    context.fillRect(596, 120, 88, 576);
    context.fillStyle = '#8a6d1f';
    context.fillRect(596, 120, 4, 576);
    context.fillRect(680, 120, 4, 576);
    // Wall shadows along the room's edges.
    context.fillStyle = 'rgba(0,0,0,0.35)';
    context.fillRect(0, 24, FIELD.width, 6);
    context.fillRect(0, 0, 6, FIELD.height);
    context.fillRect(FIELD.width - 6, 0, 6, FIELD.height);
  }

  function drawWallsAndFurniture(state) {
    // Outer walls.
    context.fillStyle = PALETTE.wall;
    for (const w of state.walls) {
      if (w.width === 1280 || w.height === 720) context.fillRect(w.x, w.y, w.width, w.height);
    }
    context.fillStyle = PALETTE.wallTop;
    context.fillRect(0, 0, FIELD.width, 4);
    // The vault door: gold-trimmed block under the top wall.
    const vault = state.walls.find((w) => w.width === 160 && w.height === 80);
    context.fillStyle = PALETTE.vault;
    context.fillRect(vault.x, vault.y, vault.width, vault.height);
    context.strokeStyle = PALETTE.vaultGlow;
    context.lineWidth = 3;
    context.strokeRect(vault.x + 4, vault.y + 4, vault.width - 8, vault.height - 8);
    text('VAULT', vault.x + vault.width / 2, vault.y + vault.height - 14, 20, PALETTE.vaultGlow, 'center');
    // Display cases with a little painting each.
    const cases = state.walls.filter((w) => w.width === 120 && w.height === 60);
    for (let i = 0; i < cases.length; i += 1) {
      const c = cases[i];
      context.fillStyle = PALETTE.pedestal;
      context.fillRect(c.x, c.y, c.width, c.height);
      context.fillStyle = PALETTE.pedestalTop;
      context.fillRect(c.x, c.y, c.width, 8);
      const art = PAINTINGS[i % PAINTINGS.length];
      context.fillStyle = '#c9a227';
      context.fillRect(c.x + 18, c.y + 14, 84, 38);
      context.fillStyle = art.fill;
      context.fillRect(c.x + 22, c.y + 18, 76, 30);
      context.fillStyle = art.shape;
      if (art.kind === 'circle') {
        context.beginPath();
        context.arc(c.x + 60, c.y + 33, 10, 0, Math.PI * 2);
        context.fill();
      } else {
        context.beginPath();
        context.moveTo(c.x + 60, c.y + 22);
        context.lineTo(c.x + 72, c.y + 44);
        context.lineTo(c.x + 48, c.y + 44);
        context.closePath();
        context.fill();
      }
    }
    // Central statue plinth.
    const plinth = state.walls.find((w) => w.width === 100 && w.height === 60);
    context.fillStyle = PALETTE.pedestal;
    context.fillRect(plinth.x, plinth.y, plinth.width, plinth.height);
    context.fillStyle = '#d8d3c3';
    context.beginPath();
    context.arc(plinth.x + 50, plinth.y + 30, 16, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#8a8578';
    context.beginPath();
    context.arc(plinth.x + 50, plinth.y + 22, 9, 0, Math.PI * 2);
    context.fill();
    // The exit doorway: a green-lit gap in the bottom wall.
    const exit = state.exit;
    context.fillStyle = PALETTE.exitGlow;
    context.fillRect(exit.x - 8, exit.y - 26, exit.width + 16, 34);
    context.fillStyle = PALETTE.exit;
    context.fillRect(exit.x, exit.y - 4, exit.width, 10);
    text('EXIT', exit.x + exit.width / 2, exit.y - 10, 18, PALETTE.exit, 'center');
  }

  function drawCone(x, y, angle, halfAngle, range, fill, edge) {
    context.beginPath();
    context.moveTo(x, y);
    context.arc(x, y, range, angle - halfAngle, angle + halfAngle);
    context.closePath();
    context.fillStyle = fill;
    context.fill();
    context.strokeStyle = edge;
    context.lineWidth = 1.5;
    context.stroke();
  }

  function drawLoot(state) {
    for (const loot of state.loots) {
      if (loot.taken) continue;
      const pulse = 0.6 + 0.4 * Math.sin(state.elapsed * 3 + loot.x);
      if (loot.kind === 'diamond') {
        context.save();
        context.translate(loot.x, loot.y);
        context.rotate(Math.sin(state.elapsed * 1.5) * 0.15);
        const glow = context.createRadialGradient(0, 0, 4, 0, 0, 46);
        glow.addColorStop(0, `rgba(127,227,240,${0.5 * pulse})`);
        glow.addColorStop(1, 'rgba(127,227,240,0)');
        context.fillStyle = glow;
        context.beginPath();
        context.arc(0, 0, 46, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = PALETTE.diamond;
        context.beginPath();
        context.moveTo(0, -20);
        context.lineTo(15, 0);
        context.lineTo(0, 20);
        context.lineTo(-15, 0);
        context.closePath();
        context.fill();
        context.fillStyle = 'rgba(255,255,255,0.85)';
        context.beginPath();
        context.moveTo(0, -20);
        context.lineTo(7, 0);
        context.lineTo(0, 6);
        context.lineTo(-7, 0);
        context.closePath();
        context.fill();
        context.restore();
        text('STAR DIAMOND', loot.x, loot.y + 44, 15, PALETTE.diamond, 'center');
      } else {
        const glow = context.createRadialGradient(loot.x, loot.y, 4, loot.x, loot.y, 34);
        glow.addColorStop(0, `rgba(242,201,76,${0.45 * pulse})`);
        glow.addColorStop(1, 'rgba(242,201,76,0)');
        context.fillStyle = glow;
        context.beginPath();
        context.arc(loot.x, loot.y, 34, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = PALETTE.gold;
        context.fillRect(loot.x - 14, loot.y - 6, 28, 12);
        context.fillStyle = '#ffe27a';
        context.fillRect(loot.x - 14, loot.y - 6, 28, 4);
      }
    }
  }

  function drawGuards(state) {
    for (const g of state.guards) {
      const seeing = g.seeing;
      drawCone(g.x, g.y, g.angle, g.halfAngle, g.range, seeing ? PALETTE.coneHot : PALETTE.cone, seeing ? 'rgba(229,83,75,0.5)' : 'rgba(224,122,95,0.25)');
      // Shadow, body, cap, facing tick.
      context.fillStyle = 'rgba(0,0,0,0.4)';
      context.beginPath();
      context.ellipse(g.x, g.y + 10, 16, 7, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.guardSuit;
      context.beginPath();
      context.arc(g.x, g.y, g.radius, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#e8b4b4';
      context.lineWidth = 2;
      context.stroke();
      context.fillStyle = '#e8b4b4';
      context.beginPath();
      context.arc(g.x + Math.cos(g.angle) * 7, g.y + Math.sin(g.angle) * 7, 4, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.guard;
      context.beginPath();
      context.arc(g.x, g.y - 4, 6, 0, Math.PI * 2);
      context.fill();
      if (g.state === 'chase' || g.state === 'suspicious') {
        text('!', g.x, g.y - 24, 28, '#ff6b5e', 'center');
      }
    }
  }

  function drawCameras(state) {
    for (const cam of state.cameras) {
      drawCone(cam.x, cam.y, cam.angle, cam.halfAngle, cam.range, PALETTE.cameraCone, 'rgba(242,201,76,0.3)');
      context.fillStyle = PALETTE.cameraBody;
      context.fillRect(cam.x - 12, cam.y - 8, 24, 12);
      context.fillStyle = cam.seeing ? '#ff5b4d' : '#3fae6a';
      context.beginPath();
      context.arc(cam.x + Math.cos(cam.angle) * 10, cam.y + Math.sin(cam.angle) * 10, 4, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawPlayer(state) {
    const p = state.player;
    context.fillStyle = 'rgba(0,0,0,0.45)';
    context.beginPath();
    context.ellipse(p.x, p.y + 9, 15, 6, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.playerHood;
    context.beginPath();
    context.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = PALETTE.player;
    context.lineWidth = 2;
    context.stroke();
    // The mask: a light band across the face.
    context.fillStyle = PALETTE.player;
    context.fillRect(p.x - 9, p.y - 3, 18, 6);
    context.fillStyle = '#23262e';
    context.fillRect(p.x - 4, p.y - 1, 3, 2);
    context.fillRect(p.x + 2, p.y - 1, 3, 2);
    if (state.diamondGot) {
      context.fillStyle = PALETTE.diamond;
      context.beginPath();
      context.moveTo(p.x, p.y - 24);
      context.lineTo(p.x + 6, p.y - 16);
      context.lineTo(p.x, p.y - 8);
      context.lineTo(p.x - 6, p.y - 16);
      context.closePath();
      context.fill();
    }
  }

  function drawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const pt = particles[i];
      pt.age += dt;
      if (pt.age >= pt.life) { particles.splice(i, 1); continue; }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      context.globalAlpha = 1 - pt.age / pt.life;
      context.fillStyle = pt.color;
      context.beginPath();
      context.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawHud(state) {
    context.textBaseline = 'top';
    const lootCount = state.lootGot;
    text(lootLabel(state.score), 30, 16, 24, PALETTE.text, 'left');
    text(`◆ ${lootCount}/${LOOT_SPOTS.length}`, 30, 44, 18, PALETTE.muted, 'left');
    // Alarm meter: the wide bar across the top centre.
    const alarm = Math.round(state.alarm);
    const fillColor = alarm < 40 ? PALETTE.alarmLow : alarm < 70 ? PALETTE.alarmMid : PALETTE.alarmHigh;
    text('ALARM', ALARM_BAR.x - 12, ALARM_BAR.y - 2, 20, PALETTE.text, 'right');
    context.fillStyle = '#10131a';
    context.fillRect(ALARM_BAR.x, ALARM_BAR.y, ALARM_BAR.width, ALARM_BAR.height);
    context.fillStyle = fillColor;
    context.fillRect(ALARM_BAR.x, ALARM_BAR.y, (ALARM_BAR.width * alarm) / 100, ALARM_BAR.height);
    context.strokeStyle = PALETTE.muted;
    context.lineWidth = 1;
    context.strokeRect(ALARM_BAR.x, ALARM_BAR.y, ALARM_BAR.width, ALARM_BAR.height);
    text(alarmLabel(`${alarm}%`), ALARM_BAR.x + ALARM_BAR.width + 10, ALARM_BAR.y - 2, 20, fillColor, 'left');
    // Night timer.
    const seconds = Math.max(0, Math.ceil(state.timeLeft));
    const mm = Math.floor(seconds / 60);
    const ss = String(seconds % 60).padStart(2, '0');
    text(timerLabel(`${mm}:${ss}`), FIELD.width - 30, 16, 24, seconds <= 30 ? PALETTE.alarmHigh : PALETTE.text, 'right');
    text('NIGHT', FIELD.width - 30, 44, 18, PALETTE.muted, 'right');
    // Objective, small, bottom centre.
    context.textBaseline = 'alphabetic';
    const objective = state.diamondGot ? 'Diamond secured — reach the EXIT!' : 'Steal the STAR DIAMOND, then reach the EXIT';
    text(objective, FIELD.width / 2, FIELD.height - 12, 17, PALETTE.muted, 'center');
    // Red edge flash while any sensor sees the thief.
    if (state.seenBy) {
      const pulse = 0.18 + 0.12 * Math.sin(state.elapsed * 10);
      context.strokeStyle = `rgba(229,83,75,${pulse.toFixed(3)})`;
      context.lineWidth = 14;
      context.strokeRect(7, 7, FIELD.width - 14, FIELD.height - 14);
      text(state.seenBy === 'guard' ? 'SPOTTED!' : 'ON CAMERA!', FIELD.width / 2, 152, 30, '#ff6b5e', 'center');
    }
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(10,12,17,0.82)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.vaultGlow;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 78, 46, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 21, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 38, 23, PALETTE.gold, 'center');
  }

  const TITLE_LINES = [
    'One room. Two guards. Two cameras. One diamond.',
    'Stay out of the red cones and the amber camera sweeps,',
    'grab the Star Diamond and the gold, then slip out the EXIT.',
    'Move with WASD or arrow keys — or click where to go.',
    'Seen too long and the alarm hits 100%: lockdown.',
    '',
  ];
  const PAUSED_LINES = ['The guards will wait for you.'];
  const WIN_LINES = ['', '', ''];
  const OVER_LINES = ['', '', ''];

  /** Paint one frame: the room, the HUD, then a panel for the screen the game is on. */
  function draw(state, screen, best, dt, shakeX, shakeY) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawFloor(state);
    drawWallsAndFurniture(state);
    drawLoot(state);
    drawGuards(state);
    drawCameras(state);
    drawPlayer(state);
    drawParticles(dt);
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[5] = bestLabel(best);
      drawPanel('THE MIDNIGHT GALLERY', TITLE_LINES, 'Press Space or click to start the heist');
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', PAUSED_LINES, 'Press P to resume');
    } else if (screen === SCREEN_WIN) {
      WIN_LINES[0] = scoreLabel(state.score);
      WIN_LINES[1] = `Loot ${state.lootGot}/${LOOT_SPOTS.length}  ·  ${Math.ceil(state.timeLeft)}s of night to spare`;
      WIN_LINES[2] = bestLabel(best);
      drawPanel('CLEAN GETAWAY!', WIN_LINES, 'Press Space or click to steal again');
    } else if (screen === SCREEN_OVER) {
      const reason = state.caughtReason === 'alarm'
        ? 'The alarm hit 100% — lockdown.'
        : state.caughtReason === 'dawn'
          ? 'Dawn broke over the gallery.'
          : 'A guard caught you red-handed.';
      OVER_LINES[0] = reason;
      OVER_LINES[1] = scoreLabel(state.score);
      OVER_LINES[2] = bestLabel(best);
      drawPanel('CAUGHT!', OVER_LINES, 'Press Space or click to try again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, burst };
}
