// The game's rules and state, with no drawing and no browser in it: the thief, the
// patrolling guards and their FSM, the sweeping cameras, the loot, the alarm meter and
// the win/lose conditions. step() advances one fixed step and returns what happened as
// bit flags, so the caller can react without the world knowing about screens or sound.
// Nothing here allocates after createWorld returns.
//
// Perception follows the cheap-to-expensive order: squared distance, then the vision
// cone, then one line-of-sight ray against the solid rectangles. Guards sense at 10 Hz
// (staggered); cameras, being machines, sense every step. A guard that spots the thief
// waits out its reaction delay before the alarm starts rising, so the player can react.
import {
  ALARM,
  CAMERA,
  CAMERA_SPOTS,
  ENTRANCE,
  EXIT,
  FIELD,
  GUARD,
  GUARD_PATROLS,
  LOOT_SPOTS,
  NIGHT_SECONDS,
  PLAYER,
  WALLS,
} from './config.js';

export const EVENT_LOOT = 1;
export const EVENT_SEEN = 2;
export const EVENT_CAUGHT = 4;
export const EVENT_WIN = 8;
export const EVENT_ALARM_HIGH = 16;

/** Smallest absolute difference between two angles, in (-PI, PI]. */
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** True when `target` is inside `sensor`'s range and vision cone (no line of sight). */
export function inCone(sensor, target) {
  const dx = target.x - sensor.x;
  const dy = target.y - sensor.y;
  const distSq = dx * dx + dy * dy;
  if (distSq > sensor.range * sensor.range) return false;
  if (distSq === 0) return true;
  const toTarget = Math.atan2(dy, dx);
  return Math.abs(angleDiff(toTarget, sensor.angle)) <= sensor.halfAngle;
}

/** True when the segment (x1,y1)-(x2,y2) touches or crosses the rectangle. */
function segmentHitsRect(x1, y1, x2, y2, rect) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tMin = 0;
  let tMax = 1;
  if (dx === 0) {
    if (x1 < rect.x || x1 > rect.x + rect.width) return false;
  } else {
    let t1 = (rect.x - x1) / dx;
    let t2 = (rect.x + rect.width - x1) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  if (dy === 0) {
    if (y1 < rect.y || y1 > rect.y + rect.height) return false;
  } else {
    let t1 = (rect.y - y1) / dy;
    let t2 = (rect.y + rect.height - y1) / dy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  return true;
}

/** True when the sensor can see the target: in cone, and no wall between them. */
export function canSee(sensor, target, walls) {
  if (!inCone(sensor, target)) return false;
  for (let i = 0; i < walls.length; i += 1) {
    if (segmentHitsRect(sensor.x, sensor.y, target.x, target.y, walls[i])) return false;
  }
  return true;
}

/** Does the circle overlap the rectangle? */
function circleHitsRect(x, y, radius, rect) {
  const cx = Math.max(rect.x, Math.min(x, rect.x + rect.width));
  const cy = Math.max(rect.y, Math.min(y, rect.y + rect.height));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < radius * radius;
}

/**
 * Move a circle by (dx, dy), sliding along walls: try x, then y, keeping the move that
 * does not overlap a solid rectangle.
 */
function moveCircle(body, dx, dy, walls) {
  const nextX = body.x + dx;
  let blocked = false;
  for (let i = 0; i < walls.length; i += 1) {
    if (circleHitsRect(nextX, body.y, body.radius, walls[i])) { blocked = true; break; }
  }
  if (!blocked) body.x = nextX;
  const nextY = body.y + dy;
  blocked = false;
  for (let i = 0; i < walls.length; i += 1) {
    if (circleHitsRect(body.x, nextY, body.radius, walls[i])) { blocked = true; break; }
  }
  if (!blocked) body.y = nextY;
}

/** Turn `angle` toward `target` by at most `maxTurn` radians. */
function turnToward(angle, target, maxTurn) {
  const d = angleDiff(target, angle);
  if (Math.abs(d) <= maxTurn) return target;
  return angle + Math.sign(d) * maxTurn;
}

export function createWorld(random) {
  const player = { x: ENTRANCE.x, y: ENTRANCE.y, radius: PLAYER.radius };
  const guards = GUARD_PATROLS.map((waypoints, index) => {
    const start = waypoints[0];
    const next = waypoints[1];
    return {
      x: start.x,
      y: start.y,
      angle: Math.atan2(next.y - start.y, next.x - start.x),
      radius: GUARD.radius,
      range: GUARD.range,
      halfAngle: GUARD.halfAngle,
      waypoints,
      wpIndex: 1,
      state: 'patrol',
      stateTime: 0,
      lastKnown: { x: start.x, y: start.y },
      seeing: false,
      react: 0,
      senseTimer: index * 0.05, // stagger the 10 Hz sensors
      searchTime: 0,
    };
  });
  const cameras = CAMERA_SPOTS.map((spot, index) => ({
    x: spot.x,
    y: spot.y,
    baseAngle: spot.baseAngle,
    angle: spot.baseAngle,
    range: CAMERA.range,
    halfAngle: CAMERA.halfAngle,
    phase: index * 1.7, // cameras sweep out of phase
    seeing: false,
  }));
  const loots = LOOT_SPOTS.map((spot) => ({ ...spot, taken: false }));
  const state = {
    player,
    guards,
    cameras,
    loots,
    walls: WALLS,
    exit: EXIT,
    alarm: 0,
    score: 0,
    timeLeft: NIGHT_SECONDS,
    elapsed: 0,
    diamondGot: false,
    lootGot: 0,
    status: 'playing', // playing | won | caught
    caughtReason: null, // guard | alarm | dawn
    seenBy: null, // guard | camera | null, for the renderer's alarm flash
    alarmHigh: false,
  };
  let seenAnyPrev = false;

  function reset() {
    player.x = ENTRANCE.x;
    player.y = ENTRANCE.y;
    for (let i = 0; i < guards.length; i += 1) {
      const g = guards[i];
      const start = g.waypoints[0];
      const next = g.waypoints[1];
      g.x = start.x;
      g.y = start.y;
      g.angle = Math.atan2(next.y - start.y, next.x - start.x);
      g.wpIndex = 1;
      g.state = 'patrol';
      g.stateTime = 0;
      g.lastKnown.x = start.x;
      g.lastKnown.y = start.y;
      g.seeing = false;
      g.react = 0;
      g.senseTimer = i * 0.05;
      g.searchTime = 0;
    }
    for (let i = 0; i < cameras.length; i += 1) {
      cameras[i].angle = cameras[i].baseAngle;
      cameras[i].phase = i * 1.7;
      cameras[i].seeing = false;
    }
    for (const loot of loots) loot.taken = false;
    state.alarm = 0;
    state.score = 0;
    state.timeLeft = NIGHT_SECONDS;
    state.elapsed = 0;
    state.diamondGot = false;
    state.lootGot = 0;
    state.status = 'playing';
    state.caughtReason = null;
    state.seenBy = null;
    state.alarmHigh = false;
    seenAnyPrev = false;
  }

  function changeGuardState(g, next) {
    g.state = next;
    g.stateTime = 0;
    if (next === 'search') g.searchTime = GUARD.searchSeconds;
  }

  /**
   * One fixed step. `input` is the thief's move direction, each component in [-1, 1].
   * Returns bit flags of what happened this step.
   */
  function step(dt, input) {
    if (state.status !== 'playing') return 0;
    let events = 0;
    state.elapsed += dt;
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      state.status = 'caught';
      state.caughtReason = 'dawn';
      return EVENT_CAUGHT;
    }

    // The thief moves (axis-separated slide against the walls).
    const len = Math.hypot(input.x, input.y);
    if (len > 0) {
      const nx = input.x / len;
      const ny = input.y / len;
      moveCircle(player, nx * PLAYER.speed * dt, ny * PLAYER.speed * dt, WALLS);
    }

    // Loot pickup.
    for (const loot of loots) {
      if (loot.taken) continue;
      const dx = player.x - loot.x;
      const dy = player.y - loot.y;
      if (dx * dx + dy * dy < loot.radius * loot.radius) {
        loot.taken = true;
        state.score += loot.value;
        state.lootGot += 1;
        if (loot.kind === 'diamond') state.diamondGot = true;
        events |= EVENT_LOOT;
      }
    }

    // Win: the diamond in hand and the thief inside the exit doorway.
    if (
      state.diamondGot &&
      player.x >= EXIT.x && player.x <= EXIT.x + EXIT.width &&
      player.y >= EXIT.y && player.y <= EXIT.y + EXIT.height
    ) {
      state.score += Math.round(state.timeLeft) * 5;
      state.status = 'won';
      return events | EVENT_WIN;
    }

    // Cameras sweep and sense every step.
    let cameraSeeing = false;
    for (const cam of cameras) {
      cam.phase += CAMERA.sweepSpeed * dt;
      cam.angle = cam.baseAngle + CAMERA.sweep * Math.sin(cam.phase);
      cam.seeing = canSee(cam, player, WALLS);
      if (cam.seeing) cameraSeeing = true;
    }

    // Guards sense at 10 Hz, staggered.
    let guardSeeing = false;
    let closestGuardDist = Infinity;
    for (const g of guards) {
      g.senseTimer -= dt;
      if (g.senseTimer <= 0) {
        g.senseTimer += 0.1;
        g.seeing = canSee(g, player, WALLS);
        if (g.seeing) {
          g.lastKnown.x = player.x;
          g.lastKnown.y = player.y;
        }
      }
      if (g.seeing) {
        guardSeeing = true;
        const d = Math.hypot(player.x - g.x, player.y - g.y);
        if (d < closestGuardDist) closestGuardDist = d;
        if (g.react < GUARD.reaction) g.react += dt;
      } else {
        g.react = 0;
      }
    }

    const seenAny = guardSeeing || cameraSeeing;
    if (seenAny && !seenAnyPrev) events |= EVENT_SEEN;
    seenAnyPrev = seenAny;
    state.seenBy = guardSeeing ? 'guard' : cameraSeeing ? 'camera' : null;

    // The alarm: guards raise it (faster up close, after their reaction delay),
    // cameras raise it at their own rate, and it falls when nobody sees the thief.
    const guardReady = guards.some((g) => g.seeing && g.react >= GUARD.reaction);
    if (guardReady || cameraSeeing) {
      let rate = 0;
      if (guardReady) rate = Math.max(rate, ALARM.guardRate * (1 - 0.5 * (closestGuardDist / GUARD.range)));
      if (cameraSeeing) rate = Math.max(rate, CAMERA.alarmRate);
      state.alarm = Math.min(ALARM.max, state.alarm + rate * dt);
    } else {
      state.alarm = Math.max(0, state.alarm - ALARM.decayRate * dt);
    }
    if (state.alarm >= 70 && !state.alarmHigh) {
      state.alarmHigh = true;
      events |= EVENT_ALARM_HIGH;
    } else if (state.alarm < 60) {
      state.alarmHigh = false;
    }
    if (state.alarm >= ALARM.max) {
      state.status = 'caught';
      state.caughtReason = 'alarm';
      return events | EVENT_CAUGHT;
    }

    // Guard FSM: patrol -> suspicious -> chase -> search -> patrol, with hysteresis
    // so the state cannot flicker at a threshold.
    for (const g of guards) {
      g.stateTime += dt;
      const canChange = g.stateTime >= GUARD.minStateTime;
      if (g.state === 'patrol') {
        if (state.alarm >= GUARD.chaseAt && g.seeing && canChange) changeGuardState(g, 'chase');
        else if (state.alarm >= GUARD.suspiciousAt && canChange) changeGuardState(g, 'suspicious');
      } else if (g.state === 'suspicious') {
        if (state.alarm >= GUARD.chaseAt && g.seeing && canChange) changeGuardState(g, 'chase');
        else if (state.alarm < GUARD.suspiciousAt - 15 && canChange) changeGuardState(g, 'patrol');
      } else if (g.state === 'chase') {
        if (state.alarm < GUARD.giveUpBelow && canChange) changeGuardState(g, 'search');
        else if (!g.seeing && g.stateTime > 2 && canChange) changeGuardState(g, 'search');
      } else if (g.state === 'search') {
        g.searchTime -= dt;
        if (g.searchTime <= 0 && canChange) changeGuardState(g, 'patrol');
        else if (state.alarm >= GUARD.chaseAt && g.seeing && canChange) changeGuardState(g, 'chase');
      }

      // Move by state.
      if (g.state === 'patrol') {
        const wp = g.waypoints[g.wpIndex];
        const dx = wp.x - g.x;
        const dy = wp.y - g.y;
        const dist = Math.hypot(dx, dy);
        const stepLen = GUARD.patrolSpeed * dt;
        if (dist <= Math.max(12, stepLen)) {
          g.wpIndex = (g.wpIndex + 1) % g.waypoints.length;
        } else {
          const heading = Math.atan2(dy, dx);
          g.angle = turnToward(g.angle, heading, 6 * dt);
          moveCircle(g, (dx / dist) * stepLen, (dy / dist) * stepLen, WALLS);
        }
      } else if (g.state === 'suspicious' || g.state === 'chase') {
        const tx = g.state === 'chase' ? player.x : g.lastKnown.x;
        const ty = g.state === 'chase' ? player.y : g.lastKnown.y;
        const dx = tx - g.x;
        const dy = ty - g.y;
        const dist = Math.hypot(dx, dy);
        const speed = g.state === 'chase' ? GUARD.chaseSpeed : GUARD.suspiciousSpeed;
        const stepLen = speed * dt;
        if (dist > Math.max(10, stepLen)) {
          const heading = Math.atan2(dy, dx);
          g.angle = turnToward(g.angle, heading, 7 * dt);
          moveCircle(g, (dx / dist) * stepLen, (dy / dist) * stepLen, WALLS);
        } else if (g.state === 'suspicious' && canChange) {
          changeGuardState(g, 'search');
        }
      } else if (g.state === 'search') {
        g.angle += 1.4 * dt; // scan the room
      }
    }

    // Caught by touch.
    for (const g of guards) {
      const dx = player.x - g.x;
      const dy = player.y - g.y;
      const touch = PLAYER.radius + GUARD.radius + 2;
      if (dx * dx + dy * dy < touch * touch) {
        state.status = 'caught';
        state.caughtReason = 'guard';
        return events | EVENT_CAUGHT;
      }
    }

    return events;
  }

  reset();
  return { state, reset, step };
}
