// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical
// area; the renderer scales it to the window, so no rule below depends on the screen size.
// The room is the Midnight Gallery: one museum hall, walls around it, display pedestals
// for cover, a diamond on a pedestal under the vault door, three gold bars, two patrolling
// guards, two sweeping wall cameras, and the exit door at the bottom.
export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Seconds of night left when the run starts; at zero, dawn breaks and the run is caught. */
export const NIGHT_SECONDS = 180;

export const PLAYER = { radius: 14, speed: 235 };

/** Wall thickness around the room. */
export const WALL = 24;

/**
 * Solid rectangles: the outer walls (the bottom one split so the exit door is a gap) and
 * the interior display cases. Vision rays and movement both treat them as solid.
 */
export const WALLS = [
  { x: 0, y: 0, width: 1280, height: WALL }, // top wall
  { x: 0, y: 696, width: 600, height: WALL }, // bottom wall, left of the door
  { x: 680, y: 696, width: 600, height: WALL }, // bottom wall, right of the door
  { x: 0, y: 0, width: WALL, height: 720 }, // left wall
  { x: 1256, y: 0, width: WALL, height: 720 }, // right wall
  { x: 560, y: 40, width: 160, height: 80 }, // vault door block, top centre
  { x: 150, y: 180, width: 120, height: 60 }, // display case, upper left
  { x: 1010, y: 180, width: 120, height: 60 }, // display case, upper right
  { x: 200, y: 460, width: 120, height: 60 }, // display case, lower left
  { x: 960, y: 460, width: 120, height: 60 }, // display case, lower right
  { x: 590, y: 300, width: 100, height: 60 }, // central statue plinth
];

/** The thief starts at the entrance, just inside the exit door. */
export const ENTRANCE = { x: 640, y: 650 };

/** Step into this doorway with the diamond to win. */
export const EXIT = { x: 600, y: 688, width: 80, height: 28 };

/** Loot: one diamond under the vault, three gold bars around the hall. */
export const LOOT_SPOTS = [
  { kind: 'diamond', x: 640, y: 172, value: 500, radius: 36 },
  { kind: 'gold', x: 140, y: 360, value: 100, radius: 32 },
  { kind: 'gold', x: 1140, y: 360, value: 100, radius: 32 },
  { kind: 'gold', x: 640, y: 560, value: 100, radius: 32 },
];

export const GUARD = {
  radius: 15,
  patrolSpeed: 95,
  suspiciousSpeed: 150,
  chaseSpeed: 265,
  range: 260,
  halfAngle: 0.66, // ~38 degrees each side
  /** Delay before a guard that just spotted the thief starts raising the alarm. */
  reaction: 0.35,
  /** Alarm level that makes guards leave patrol for the last known position. */
  suspiciousAt: 40,
  /** Alarm level that makes guards chase the thief's live position. */
  chaseAt: 70,
  /** Alarm level below which a chasing guard gives up and searches. */
  giveUpBelow: 25,
  /** Seconds a guard searches the last known spot before returning to patrol. */
  searchSeconds: 4,
  /** Minimum seconds in one guard state (stops flicker at thresholds). */
  minStateTime: 0.4,
};

/** Two patrol loops, one per side of the hall. */
export const GUARD_PATROLS = [
  [
    { x: 120, y: 120 }, { x: 120, y: 600 }, { x: 400, y: 600 }, { x: 400, y: 120 },
  ],
  [
    { x: 1160, y: 120 }, { x: 1160, y: 600 }, { x: 880, y: 600 }, { x: 880, y: 120 },
  ],
];

export const CAMERA = {
  range: 300,
  halfAngle: 0.5, // ~29 degrees each side
  sweep: 0.9, // radians each side of the base angle
  sweepSpeed: 0.45, // radians per second
  alarmRate: 30, // alarm points per second while the thief is in the cone
};

/** Wall cameras, mounted under the top wall, sweeping the hall. */
export const CAMERA_SPOTS = [
  { x: 300, y: 30, baseAngle: Math.PI / 2 },
  { x: 980, y: 30, baseAngle: Math.PI / 2 },
];

export const ALARM = {
  /** Points per second a guard adds while it sees the thief (scaled by closeness). */
  guardRate: 55,
  /** Points per second the alarm falls while nobody sees the thief. */
  decayRate: 16,
  max: 100,
};

export const PALETTE = {
  backdrop: '#0b0d12',
  floor: '#171a21',
  floorTile: '#1c2029',
  wall: '#2e3442',
  wallTop: '#3a4152',
  pedestal: '#3d2f1e',
  pedestalTop: '#6b5228',
  vault: '#4a3b12',
  vaultGlow: '#f2c94c',
  player: '#e8e8ec',
  playerHood: '#23262e',
  guard: '#c94f4f',
  guardSuit: '#7a2e2e',
  cone: 'rgba(224, 122, 95, 0.20)',
  coneHot: 'rgba(229, 83, 75, 0.34)',
  cameraCone: 'rgba(242, 201, 76, 0.16)',
  cameraBody: '#8a6d1f',
  diamond: '#7fe3f0',
  gold: '#f2c94c',
  exit: '#3fae6a',
  exitGlow: 'rgba(63, 174, 106, 0.25)',
  panel: '#1e222c',
  text: '#eef1f5',
  muted: '#9aa1b0',
  alarmLow: '#3fae6a',
  alarmMid: '#e8a33d',
  alarmHigh: '#e5534b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'midnight-gallery.best';
