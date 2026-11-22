// Tiny procedural sound: short WebAudio bleeps, no audio files and no network. The
// context is created on the first user gesture; every call is guarded, so a browser
// without audio simply stays silent.
let context = null;

function audio() {
  if (context) return context;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    context = new AudioContext();
    return context;
  } catch {
    return null;
  }
}

function beep(freq, duration, type, gainValue, when = 0) {
  const ctx = audio();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, ctx.currentTime + when);
    gain.gain.linearRampToValueAtTime(gainValue, ctx.currentTime + when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + when);
    osc.stop(ctx.currentTime + when + duration + 0.05);
  } catch {
    // Sound is garnish: never let it break the game.
  }
}

export function playPickup() {
  beep(880, 0.12, 'sine', 0.12);
  beep(1318, 0.18, 'sine', 0.1, 0.07);
}

export function playDiamond() {
  beep(1046, 0.12, 'sine', 0.12);
  beep(1318, 0.12, 'sine', 0.12, 0.08);
  beep(1568, 0.22, 'sine', 0.12, 0.16);
}

export function playSpotted() {
  beep(196, 0.25, 'sawtooth', 0.08);
  beep(147, 0.3, 'sawtooth', 0.08, 0.12);
}

export function playWin() {
  beep(523, 0.14, 'triangle', 0.14);
  beep(659, 0.14, 'triangle', 0.14, 0.12);
  beep(784, 0.14, 'triangle', 0.14, 0.24);
  beep(1046, 0.3, 'triangle', 0.14, 0.36);
}

export function playCaught() {
  beep(392, 0.2, 'sawtooth', 0.1);
  beep(311, 0.2, 'sawtooth', 0.1, 0.15);
  beep(233, 0.4, 'sawtooth', 0.1, 0.3);
}

/** Warm the context up on a gesture so later bleeps are not blocked. */
export function unlockAudio() {
  const ctx = audio();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}
