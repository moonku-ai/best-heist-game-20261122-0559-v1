// Tests for the heist world (pure logic, no browser): run with `node --test tests/`.
// Written FIRST (TDD): they fail until world.js implements the rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, EVENT_LOOT, EVENT_CAUGHT, EVENT_WIN, EVENT_SEEN, canSee, inCone } from '../game/src/world.js';
import { FIELD } from '../game/src/config.js';

function rng(seed = 7) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STEP = 1 / 60;
const NO_INPUT = { x: 0, y: 0 };

function stepN(world, n, input = NO_INPUT) {
  let events = 0;
  for (let i = 0; i < n; i += 1) events |= world.step(STEP, input);
  return events;
}

test('fresh world: thief at the entrance, alarm zero, loot waiting', () => {
  const world = createWorld(rng());
  const s = world.state;
  assert.equal(s.alarm, 0);
  assert.equal(s.score, 0);
  assert.equal(s.status, 'playing');
  assert.equal(s.loots.filter((l) => !l.taken).length, 4); // diamond + 3 gold
  assert.ok(s.player.y > FIELD.height - 120); // entrance is at the bottom
  assert.equal(s.guards.length, 2);
  assert.equal(s.cameras.length, 2);
});

test('guard sees the thief in its cone with clear line of sight', () => {
  const world = createWorld(rng());
  const s = world.state;
  const g = s.guards[0];
  // Put the thief straight ahead of the guard, inside range, no wall between.
  s.player.x = g.x + Math.cos(g.angle) * 120;
  s.player.y = g.y + Math.sin(g.angle) * 120;
  assert.equal(canSee(g, s.player, s.walls), true);
  const before = s.alarm;
  stepN(world, 30); // half a second of being seen
  assert.ok(s.alarm > before, `alarm should rise, was ${before} now ${s.alarm}`);
});

test('guard cannot see through a pedestal (line of sight blocked)', () => {
  const world = createWorld(rng());
  const s = world.state;
  const g = s.guards[0];
  // A pedestal sits between guard and thief: pick the wall list's first interior block.
  const block = s.walls.find((w) => w.x > 100 && w.y > 100 && w.x < 1100);
  assert.ok(block, 'needs an interior obstacle for this test');
  // Guard on one side, thief on the other, both aligned through the block centre.
  g.x = block.x - 80; g.y = block.y + block.height / 2; g.angle = 0;
  s.player.x = block.x + block.width + 80; s.player.y = block.y + block.height / 2;
  assert.equal(canSee(g, s.player, s.walls), false);
  const before = s.alarm;
  stepN(world, 30);
  assert.equal(s.alarm, before);
});

test('thief outside the vision cone is not seen', () => {
  const world = createWorld(rng());
  const s = world.state;
  const g = s.guards[0];
  // Behind the guard.
  s.player.x = g.x - Math.cos(g.angle) * 120;
  s.player.y = g.y - Math.sin(g.angle) * 120;
  assert.equal(inCone(g, s.player), false);
  stepN(world, 30);
  assert.equal(s.alarm, 0);
});

test('alarm decays when the thief hides again', () => {
  const world = createWorld(rng());
  const s = world.state;
  s.alarm = 60;
  // Hide the thief far from every guard/camera: bottom-left corner.
  s.player.x = 60; s.player.y = FIELD.height - 60;
  for (const g of s.guards) { g.x = FIELD.width - 100; g.y = 100; g.angle = Math.PI; }
  for (const c of s.cameras) { c.angle = Math.PI / 2; }
  stepN(world, 60);
  assert.ok(s.alarm < 60, `alarm should decay, is ${s.alarm}`);
});

test('touching gold picks it up and scores', () => {
  const world = createWorld(rng());
  const s = world.state;
  const gold = s.loots.find((l) => l.kind === 'gold');
  s.player.x = gold.x; s.player.y = gold.y;
  const events = stepN(world, 3);
  assert.ok(events & EVENT_LOOT, 'pickup should raise EVENT_LOOT');
  assert.equal(gold.taken, true);
  assert.equal(s.score, 100);
});

test('diamond plus exit wins the heist', () => {
  const world = createWorld(rng());
  const s = world.state;
  const diamond = s.loots.find((l) => l.kind === 'diamond');
  s.player.x = diamond.x; s.player.y = diamond.y;
  stepN(world, 3);
  assert.equal(s.diamondGot, true);
  // Walk to the exit door.
  s.player.x = s.exit.x; s.player.y = s.exit.y;
  const events = stepN(world, 3);
  assert.ok(events & EVENT_WIN, 'reaching exit with the diamond should win');
  assert.equal(s.status, 'won');
});

test('exit without the diamond does not win', () => {
  const world = createWorld(rng());
  const s = world.state;
  s.player.x = s.exit.x; s.player.y = s.exit.y;
  stepN(world, 3);
  assert.equal(s.status, 'playing');
});

test('a guard touching the thief ends the run caught', () => {
  const world = createWorld(rng());
  const s = world.state;
  const g = s.guards[0];
  s.player.x = g.x; s.player.y = g.y;
  const events = stepN(world, 3);
  assert.ok(events & EVENT_CAUGHT, 'touch should raise EVENT_CAUGHT');
  assert.equal(s.status, 'caught');
  assert.equal(s.caughtReason, 'guard');
});

test('a sweeping camera raises the alarm when the thief crosses its cone', () => {
  const world = createWorld(rng());
  const s = world.state;
  const c = s.cameras[0];
  s.player.x = c.x + Math.cos(c.angle) * 150;
  s.player.y = c.y + Math.sin(c.angle) * 150;
  assert.equal(canSee(c, s.player, s.walls), true);
  stepN(world, 60);
  assert.ok(s.alarm > 0, `camera should raise alarm, is ${s.alarm}`);
});

test('alarm at 100 triggers lockdown (caught)', () => {
  const world = createWorld(rng());
  const s = world.state;
  s.alarm = 99.5;
  const g = s.guards[0];
  s.player.x = g.x + Math.cos(g.angle) * 100;
  s.player.y = g.y + Math.sin(g.angle) * 100;
  stepN(world, 30);
  assert.equal(s.status, 'caught');
  assert.equal(s.caughtReason, 'alarm');
});

test('walls stop the thief from leaving the room', () => {
  const world = createWorld(rng());
  const s = world.state;
  s.player.x = 40; s.player.y = FIELD.height / 2;
  stepN(world, 120, { x: -1, y: 0 }); // push left into the wall for 2s
  assert.ok(s.player.x >= 24, `thief must stay inside, x=${s.player.x}`);
  assert.ok(s.player.x < 60, 'thief should be pressed against the wall');
});

test('the night timer counts down', () => {
  const world = createWorld(rng());
  const s = world.state;
  const before = s.timeLeft;
  stepN(world, 60);
  assert.ok(Math.abs(s.timeLeft - (before - 1)) < 0.05, `timer should lose ~1s, was ${before} now ${s.timeLeft}`);
});

test('guards patrol: they move between waypoints while calm', () => {
  const world = createWorld(rng());
  const s = world.state;
  const g = s.guards[0];
  const x0 = g.x; const y0 = g.y;
  // Keep the thief out of sight.
  s.player.x = 60; s.player.y = FIELD.height - 60;
  stepN(world, 180);
  assert.ok(Math.hypot(g.x - x0, g.y - y0) > 20, 'patrolling guard should have moved');
  assert.equal(g.state, 'patrol');
});
