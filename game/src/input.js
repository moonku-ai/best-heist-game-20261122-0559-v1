// Keyboard and pointer input. Held keys give a steering direction; one-shot presses
// (start or restart, pause) are queued as bit flags and taken once by the loop, so a
// press between two frames is never lost and never counted twice. A mouse click sets a
// move target the thief walks toward until a key is pressed or the target is reached.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);

export function createInput(target, toField) {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let actions = 0;
  let clickTarget = null;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else return;
    clickTarget = null; // a key press takes over from click-to-move
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    up = false; down = false; left = false; right = false;
  });
  target.addEventListener('pointerdown', (event) => {
    actions |= ACTION_CONFIRM;
    if (toField) {
      const point = toField(event.clientX, event.clientY);
      if (point) clickTarget = point;
    }
  });

  return {
    /** The held-keys direction, each component in [-1, 1]. */
    direction() {
      return { x: (right ? 1 : 0) - (left ? 1 : 0), y: (down ? 1 : 0) - (up ? 1 : 0) };
    },
    /** The click-to-move target, or null. */
    moveTarget() {
      return clickTarget;
    },
    /** Forget the click target (reached it, or the loop decided to stop). */
    clearMoveTarget() {
      clickTarget = null;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
