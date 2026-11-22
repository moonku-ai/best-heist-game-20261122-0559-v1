// The screenshot scenes behind ?shot=start|play|alarm|end. Each one plays the real rules
// forward from a fresh world, steered by a simple autopilot, so the frame is what a real
// game looks like and the same seed always gives the same frame. The autopilot walks
// toward its target and, unless it has waited too long, refuses any step a guard or a
// camera would see — waiting for the cones to pass, then going for it.
import { STEP } from './config.js';
import { EVENT_CAUGHT, EVENT_WIN, canSee } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const PLAY_LIMIT_SECONDS = 8;
const ALARM_TARGET = 60;
const END_LIMIT_SECONDS = 120;

/** Would the thief be seen standing at (x, y)? Checks every guard and camera. */
function wouldBeSeen(state, x, y) {
  const probe = { x, y };
  for (const g of state.guards) if (canSee(g, probe, state.walls)) return true;
  for (const c of state.cameras) if (canSee(c, probe, state.walls)) return true;
  return false;
}

/** Would the thief's circle overlap a solid rectangle at (x, y)? */
function circleHitsRect(x, y, radius, rect) {
  const cx = Math.max(rect.x, Math.min(x, rect.x + rect.width));
  const cy = Math.max(rect.y, Math.min(y, rect.y + rect.height));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < radius * radius;
}

/** True when the thief cannot stand at (x, y) because a wall is there. */
function blockedAt(state, x, y) {
  for (const w of state.walls) {
    if (circleHitsRect(x, y, state.player.radius, w)) return true;
  }
  return false;
}

/**
 * A steering pilot: walk toward `target`, refusing steps a sensor would see. After
 * waiting 2 s it goes reckless for 1.5 s, so it never stalls behind a passing cone.
 * A greedy walk gets stuck in the dent below a pedestal (sidesteps pull it back to
 * the middle while straight up stays blocked), so when the direct step is blocked the
 * pilot slides sideways along the obstacle and sticks to that side until the way
 * forward clears — simple wall following, no pathfinding needed for one room. The
 * slide is axis-aligned: a step perpendicular to the target direction still clips
 * the pedestal's edge when the thief hugs it, so the slide runs along the room's
 * axes instead.
 */
function createPilot() {
  let waitTime = 0;
  let recklessUntil = 0;
  let slide = null; // { axis: 'x' | 'y', dir: -1 | 1 } while wall following
  return function pilot(state, target) {
    const p = state.player;
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 12) { slide = null; return { x: 0, y: 0 }; }
    const want = Math.atan2(dy, dx);
    const stepLen = 235 * STEP;
    const candidates = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, (3 * Math.PI) / 4, -(3 * Math.PI) / 4, Math.PI];

    function probe(turn) {
      const angle = want + turn;
      const nx = p.x + Math.cos(angle) * stepLen;
      const ny = p.y + Math.sin(angle) * stepLen;
      if (blockedAt(state, nx, ny)) return null;
      const seen = wouldBeSeen(state, nx, ny);
      const progress = dist - Math.hypot(target.x - nx, target.y - ny);
      return { x: Math.cos(angle), y: Math.sin(angle), seen, progress, turn };
    }

    /** An axis-aligned step: { axis, dir } along the room's axes, or null if blocked/seen. */
    function axisStep(axis, dir) {
      const nx = axis === 'x' ? p.x + dir * stepLen : p.x;
      const ny = axis === 'y' ? p.y + dir * stepLen : p.y;
      if (blockedAt(state, nx, ny)) return null;
      if (wouldBeSeen(state, nx, ny)) return null;
      return { x: axis === 'x' ? dir : 0, y: axis === 'y' ? dir : 0 };
    }

    // Sliding: keep going along the room's axis until the direct step clears.
    if (slide) {
      const direct = probe(0);
      if (direct && !direct.seen && direct.progress > 0.5) {
        slide = null;
      } else {
        const step = axisStep(slide.axis, slide.dir) ?? axisStep(slide.axis, -slide.dir);
        if (step) {
          if (step.x !== 0) slide.dir = Math.sign(step.x);
          if (step.y !== 0) slide.dir = Math.sign(step.y);
          return step;
        }
        slide = null;
      }
    }

    let best = null;
    let bestScore = -Infinity;
    for (const turn of candidates) {
      const cand = probe(turn);
      if (!cand) continue; // a wall is there: no progress at all
      const score = cand.progress - (cand.seen ? 100 : 0) - Math.abs(turn) * 2;
      if (score > bestScore) {
        bestScore = score;
        best = cand;
      }
    }
    if (!best) return { x: 0, y: 0 };
    // The direct step is blocked but a sidestep is open: start sliding along the axis
    // across the target direction (horizontal when the target is mostly above/below).
    if (best.progress < 0.2 && probe(0) === null) {
      const axis = Math.abs(dx) <= Math.abs(dy) ? 'x' : 'y';
      const toward = axis === 'x' ? dx : dy;
      const firstDir = toward !== 0 ? Math.sign(toward) : -1;
      const step = axisStep(axis, firstDir) ?? axisStep(axis, -firstDir);
      if (step) {
        slide = { axis, dir: axis === 'x' ? Math.sign(step.x) : Math.sign(step.y) };
        return step;
      }
    }
    const reckless = state.elapsed < recklessUntil;
    if (!reckless && best.seen) {
      waitTime += STEP;
      if (waitTime > 2) {
        recklessUntil = state.elapsed + 1.5;
        waitTime = 0;
      } else {
        return { x: 0, y: 0 };
      }
    } else if (!best.seen) {
      waitTime = 0;
    }
    return { x: best.x, y: best.y };
  };
}

function nearestLoot(state) {
  let bestLoot = null;
  let bestDist = Infinity;
  for (const loot of state.loots) {
    if (loot.taken) continue;
    const d = Math.hypot(loot.x - state.player.x, loot.y - state.player.y);
    if (d < bestDist) { bestDist = d; bestLoot = loot; }
  }
  return bestLoot;
}

function runSteps(world, pilot, targetFn, limitSeconds) {
  const steps = Math.floor(limitSeconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const target = targetFn(world.state);
    if (!target) break;
    const events = world.step(STEP, pilot(world.state, target));
    if (events & EVENT_WIN || events & EVENT_CAUGHT) break;
  }
}

/** Walk a list of waypoints in order, each until reached (within 14 px) or the cap. */
function runRoute(world, pilot, waypoints, limitSeconds) {
  let index = 0;
  runSteps(world, pilot, (state) => {
    while (index < waypoints.length) {
      const wp = waypoints[index];
      if (Math.hypot(wp.x - state.player.x, wp.y - state.player.y) < 14) index += 1;
      else return wp;
    }
    return null;
  }, limitSeconds);
}

/**
 * Set `world` to the named scene (start, play, alarm or end) and return the screen to
 * draw over it and the best score to show.
 */
export function stageShot(name, world) {
  const pilot = createPilot();
  world.reset();
  if (name !== 'play' && name !== 'alarm' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, { x: 0, y: 0 });
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'alarm') {
    // Creep along the left wall to camera one's sweep and stand there until the alarm
    // is high. The left-wall route keeps the thief out of the guards' patrol lanes,
    // so no guard ever gets a last-known position: cameras raise the alarm without
    // chasing. The shot is taken the moment the meter crosses the target, while the
    // camera still has the thief in its cone — no fleeing, because the longer the
    // thief stands there, the likelier a guard's patrol sweep catches it.
    runRoute(world, pilot, [
      { x: 150, y: 650 }, { x: 150, y: 300 }, { x: 300, y: 300 }, { x: 300, y: 210 },
    ], 25);
    let waited = 0;
    while (world.state.alarm < ALARM_TARGET && waited < 40 && world.state.status === 'playing') {
      world.step(STEP, { x: 0, y: 0 });
      waited += STEP;
    }
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'end') {
    runSteps(world, pilot, (state) => {
      if (!state.diamondGot) {
        const diamond = state.loots.find((l) => l.kind === 'diamond');
        return diamond.taken ? null : diamond;
      }
      return { x: 640, y: 702 }; // centre of the exit doorway
    }, END_LIMIT_SECONDS);
    return { screen: world.state.status === 'won' ? SCREEN_WIN : SCREEN_OVER, best: world.state.score };
  }
  // play: cross the room for the left gold (through the guards' side of the hall),
  // then the diamond, then head for the exit — stop mid-run so the frame shows the
  // heist in progress, cones sweeping and the alarm already warm.
  runSteps(world, pilot, (state) => {
    const leftGold = state.loots.find((l) => l.kind === 'gold' && l.x < 300);
    if (leftGold && !leftGold.taken) return leftGold;
    if (state.diamondGot) return { x: 640, y: 702 }; // centre of the exit doorway
    return nearestLoot(state) ?? { x: 640, y: 702 };
  }, PLAY_LIMIT_SECONDS);
  return { screen: SCREEN_PLAY, best: world.state.score };
}
