// Keyboard and mouse input. Held keys stay true while down; fire, interact,
// weapon-switch, confirm and pause are edge-triggered — each press registers
// exactly once and is then consumed by the game loop.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.inCar = false;
    // Edge-triggered flags, set on keydown / mousedown, cleared by consume().
    this._fire = false;
    this._interact = false;
    this._switchWeapon = false;
    this._confirm = false;
    this._pause = false;
    this._radio = false;
    this._newGame = false;

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(k);
      if (k === 'e') this._interact = true;
      if (k === 'q') this._switchWeapon = true;
      if (k === 'enter' || k === ' ') this._confirm = true;
      if (k === 'p' || k === 'escape') this._pause = true;
      if (k === 'r') this._radio = true;
      if (k === 'n') this._newGame = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - r.left) * (canvas.width / r.width);
      this.mouseY = (e.clientY - r.top) * (canvas.height / r.height);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this._fire = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  held(...names) {
    return names.some((n) => this.keys.has(n));
  }

  // Movement vector from WASD / arrows, normalised.
  moveVector() {
    let x = 0;
    let y = 0;
    if (this.held('a', 'arrowleft')) x -= 1;
    if (this.held('d', 'arrowright')) x += 1;
    if (this.held('w', 'arrowup')) y -= 1;
    if (this.held('s', 'arrowdown')) y += 1;
    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.hypot(x, y);
      x *= inv;
      y *= inv;
    }
    return { x, y };
  }

  // Read and clear one edge flag.
  take(name) {
    const key = '_' + name;
    const v = this[key];
    this[key] = false;
    return v;
  }

  // Clear every pending edge flag (used when changing screens).
  consumeAll() {
    this._fire = false;
    this._interact = false;
    this._switchWeapon = false;
    this._confirm = false;
    this._pause = false;
    this._radio = false;
    this._newGame = false;
  }
}
