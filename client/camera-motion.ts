import { Decelerate, Plugin, type Viewport } from 'pixi-viewport';

export class AtlasGlide extends Decelerate {
  constructor(viewport: Viewport) {
    super(viewport, { friction: Math.exp(-16 / 150), minSpeed: .01 });
  }

  up() {
    super.up();
    const speed = Math.hypot(this.x ?? 0, this.y ?? 0);
    if (!Number.isFinite(speed)) this.reset();
    else if (speed > 1.6) {
      this.x = (this.x || 0) * 1.6 / speed;
      this.y = (this.y || 0) * 1.6 / speed;
    }
    return false;
  }

  update(elapsed: number) {
    if (this.paused || !this.isActive()) return;
    for (const axis of ['x', 'y'] as const) {
      const velocity = this[axis] || 0;
      if (!velocity) continue;
      const rate = -Math.log(axis === 'x' ? this.percentChangeX : this.percentChangeY) / 16;
      const decay = Math.exp(-rate * elapsed);
      this.parent[axis] += velocity * (1 - decay) / rate;
      this[axis] = Math.abs(velocity * decay) < this.options.minSpeed ? 0 : velocity * decay;
    }
    this.parent.emit('moved', { viewport: this.parent, type: 'decelerate' });
  }
}

export class AtlasWheel extends Plugin {
  target: number | undefined;
  private anchor = { x: 0, y: 0 };
  private direction = 0;

  constructor(viewport: Viewport, private limits: () => { min: number; max: number }, private reduced: () => boolean) {
    super(viewport);
  }

  reset() { this.target = undefined; this.direction = 0; }
  down() { this.reset(); return false; }

  wheel(event: WheelEvent) {
    if (this.paused || this.parent.input.count()) return false;
    const unit = event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? this.parent.screenHeight : 1;
    const delta = Math.max(-240, Math.min(240, event.deltaY * unit));
    if (!delta) return false;
    this.parent.plugins.remove('animate');
    this.parent.plugins.get<Decelerate>('decelerate')?.reset();
    this.anchor = this.parent.input.getPointerPosition(event);
    if (Math.sign(delta) !== this.direction) this.target = this.parent.scale.x;
    this.direction = Math.sign(delta);
    const { min, max } = this.limits();
    this.target = Math.max(min, Math.min(max, (this.target ?? this.parent.scale.x) * Math.exp(-delta * (event.ctrlKey ? .008 : .0018))));
    if (this.reduced()) this.update(0);
    event.preventDefault();
    return true;
  }

  update(elapsed: number) {
    if (this.paused || this.target === undefined) return;
    const current = this.parent.scale.x;
    const next = this.reduced() ? this.target : current + (this.target - current) * -Math.expm1(-elapsed / 32);
    const scale = Math.abs(next - this.target) < .0002 ? this.target : next;
    const ratio = scale / current;
    this.parent.x = this.anchor.x - (this.anchor.x - this.parent.x) * ratio;
    this.parent.y = this.anchor.y - (this.anchor.y - this.parent.y) * ratio;
    this.parent.scale.set(scale);
    this.parent.emit('zoomed', { viewport: this.parent, type: 'wheel' });
    this.parent.emit('moved', { viewport: this.parent, type: 'wheel' });
    if (scale === this.target) this.reset();
  }
}
