// Keyboard and mouse input for Solmar Bay. Movement keys are held state; fire,
// interact and weapon-switch are edge-triggered: they report true once per press.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

export function createInput(canvas) {
  const keys = new Set();
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let mousePressed = false;
  let interactPressed = false;
  let weaponPressed = false;
  let confirmPressed = false;
  let pausePressed = false;

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'KeyE') interactPressed = true;
    if (event.code === 'KeyQ') weaponPressed = true;
    if (event.code === 'Enter' || event.code === 'Space') confirmPressed = true;
    if (event.code === 'KeyP' || event.code === 'Escape') pausePressed = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = ((event.clientX - rect.left) / rect.width) * canvas.width;
    mouseY = ((event.clientY - rect.top) / rect.height) * canvas.height;
  }
  function onMouseDown(event) {
    if (event.button === 0) {
      mouseDown = true;
      mousePressed = true;
    }
  }
  function onMouseUp(event) {
    if (event.button === 0) mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    /** Held movement + aim for one simulation step. */
    direction() {
      return {
        up: keys.has('KeyW') || keys.has('ArrowUp'),
        down: keys.has('KeyS') || keys.has('ArrowDown'),
        left: keys.has('KeyA') || keys.has('ArrowLeft'),
        right: keys.has('KeyD') || keys.has('ArrowRight'),
        aim: !this.playerInCar,
        aimX: mouseX,
        aimY: mouseY,
        fire: mousePressed,
        interact: interactPressed,
        weapon: weaponPressed,
      };
    },
    /** Screen-space mouse position, in canvas pixels. */
    mouse() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
    playerInCar: false,
    /** Edge-triggered actions; each call consumes them. */
    takeActions() {
      let actions = 0;
      if (confirmPressed) actions |= ACTION_CONFIRM;
      if (pausePressed) actions |= ACTION_PAUSE;
      confirmPressed = false;
      pausePressed = false;
      return actions;
    },
    /** Consume this frame's one-shot presses after the step read them. */
    consumeEdges() {
      mousePressed = false;
      interactPressed = false;
      weaponPressed = false;
    },
  };
}
