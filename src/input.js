export default class Input {
  constructor() {
    this.keys = new Set();
    this.flapQueued = 0;
    this.resetQueued = 0;
    this.testWaterQueued = 0; // DEBUG: T key — spawn near water

    const onKeyDown = (e) => {
      const k = this._normalize(e);
      if (!k) return;

      const alreadyHeld = this.keys.has(k);
      this.keys.add(k);

      if (k === 'space' && !alreadyHeld) this.flapQueued += 1;
      if (k === 'r' && !alreadyHeld) this.resetQueued += 1;
      if (k === 't' && !alreadyHeld) this.testWaterQueued += 1;

      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'space', 'r'].includes(k)) {
        e.preventDefault();
      }
    };

    const onKeyUp = (e) => {
      const k = this._normalize(e);
      if (k) this.keys.delete(k);
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp, { passive: false });
    window.addEventListener('pointerdown', (e) => {
      this.flapQueued += 1;
      e.preventDefault();
    }, { passive: false });
  }

  _normalize(e) {
    const code = (e.code || '').toLowerCase();
    const key = (e.key || '').toLowerCase();

    if (code === 'space') return 'space';
    if (code.startsWith('arrow')) return code;
    if (code.startsWith('key')) return code.slice(3);
    if (key === ' ' || key === 'spacebar' || key === 'space') return 'space';
    if (key.startsWith('arrow')) return key;
    if (key.length === 1) return key;
    return null;
  }

  left() { return this.keys.has('arrowleft') || this.keys.has('a'); }
  right() { return this.keys.has('arrowright') || this.keys.has('d'); }
  up() { return this.keys.has('arrowup') || this.keys.has('w'); }
  down() { return this.keys.has('arrowdown') || this.keys.has('s'); }
  flap() { return this.keys.has('space'); }
  reset() { return this.keys.has('r'); }

  consumeFlap() {
    const pressed = this.flapQueued > 0;
    this.flapQueued = 0;
    return pressed;
  }

  consumeReset() {
    const pressed = this.resetQueued > 0;
    this.resetQueued = 0;
    return pressed;
  }

  consumeTestWater() {
    const pressed = this.testWaterQueued > 0;
    this.testWaterQueued = 0;
    return pressed;
  }
}
