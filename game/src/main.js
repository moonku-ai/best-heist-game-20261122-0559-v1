// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, paused, win and caught.
// Screen shake is trauma-based and visual only: it moves the camera, never the bodies.
//
// ?seed=N fixes the patrol and camera phases. ?shot=start|play|alarm|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot. ?debug=1 shows the numeric state in the title.
import { BEST_KEY, FIELD, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_ALARM_HIGH, EVENT_CAUGHT, EVENT_LOOT, EVENT_SEEN, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { playCaught, playDiamond, playPickup, playSpotted, playWin, unlockAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
// Debug hooks (guizang-style): expose the live state for play-testing and screenshots.
window.__game = world;
window.__shotReady = false;

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, 1 / 60, 0, 0);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  // Click-to-move needs screen pixels translated into field coordinates.
  const toField = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / FIELD.width, rect.height / FIELD.height);
    const x = (clientX - rect.left - (rect.width - FIELD.width * scale) / 2) / scale;
    const y = (clientY - rect.top - (rect.height - FIELD.height * scale) / 2) / scale;
    if (x < 0 || y < 0 || x > FIELD.width || y > FIELD.height) return null;
    return { x, y };
  };
  const input = createInput(canvas, toField);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let trauma = 0;
  let shakeTime = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function addTrauma(amount) {
    trauma = Math.min(1, trauma + amount);
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    trauma = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Steal the Star Diamond, then reach the exit.');
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(won ? `Clean getaway. Score ${world.state.score}.` : `Caught. Score ${world.state.score}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM) {
      unlockAudio();
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) startGame();
      else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
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

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { x: 0, y: 0 });
      return;
    }
    // Keyboard first; click-to-move when no key is held.
    const keys = input.direction();
    let move = keys;
    if (keys.x === 0 && keys.y === 0) {
      const target = input.moveTarget();
      if (target) {
        const dx = target.x - world.state.player.x;
        const dy = target.y - world.state.player.y;
        if (Math.hypot(dx, dy) < 10) input.clearMoveTarget();
        else move = { x: dx, y: dy };
      }
    }
    const events = world.step(STEP, move);
    if (events & EVENT_LOOT) {
      addTrauma(0.15);
      renderer.burst(world.state.player.x, world.state.player.y, '#f2c94c');
      if (world.state.diamondGot) playDiamond();
      else playPickup();
    }
    if (events & EVENT_SEEN) {
      addTrauma(0.35);
      playSpotted();
    }
    if (events & EVENT_ALARM_HIGH) addTrauma(0.3);
    if (events & EVENT_WIN) {
      playWin();
      endGame(true);
    } else if (events & EVENT_CAUGHT) {
      addTrauma(0.8);
      playCaught();
      endGame(false);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      accumulator += dt;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    // Trauma decays in real time, so shake never freezes off-centre during a pause.
    trauma = Math.max(0, trauma - 1.2 * dt);
    shakeTime += dt * 30;
    const shake = trauma * trauma;
    const shakeX = 12 * shake * Math.sin(shakeTime * 1.7);
    const shakeY = 8 * shake * Math.sin(shakeTime * 2.3);
    renderer.draw(world.state, screen, best, dt, shakeX, shakeY);
  }

  // Leaving the tab pauses a running game rather than letting the night run out unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('The Midnight Gallery. Press Space or click to start the heist.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
