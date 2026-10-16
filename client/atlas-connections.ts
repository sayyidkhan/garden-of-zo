import { Container, Sprite, Texture } from 'pixi.js';

export class AtlasConnection extends Container {
  private samples: { x: number; y: number; distance: number }[] = [];
  private dots: Sprite[] = [];
  private length = 0;
  private phase = 0;
  private spacing = 0;
  private bounds: { left: number; right: number; top: number; bottom: number };

  constructor(path: string, private dotTexture: Texture) {
    super();
    this.eventMode = 'none';
    const n = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    this.bounds = { left: Math.min(n[0], n[2], n[4], n[6]), right: Math.max(n[0], n[2], n[4], n[6]), top: Math.min(n[1], n[3], n[5], n[7]), bottom: Math.max(n[1], n[3], n[5], n[7]) };
    for (let i = 0; i <= 128; i++) {
      const t = i / 128, u = 1 - t;
      const x = u ** 3 * n[0] + 3 * u * u * t * n[2] + 3 * u * t * t * n[4] + t ** 3 * n[6];
      const y = u ** 3 * n[1] + 3 * u * u * t * n[3] + 3 * u * t * t * n[5] + t ** 3 * n[7];
      const previous = this.samples[i - 1];
      if (previous) this.length += Math.hypot(x - previous.x, y - previous.y);
      this.samples.push({ x, y, distance: this.length });
    }
  }

  update(camera: { scale: { x: number }; left: number; right: number; top: number; bottom: number }, elapsed: number) {
    const scale = camera.scale.x;
    this.renderable = this.visible && this.bounds.right >= camera.left && this.bounds.left <= camera.right && this.bounds.bottom >= camera.top && this.bounds.top <= camera.bottom;
    if (!this.renderable || !this.length) return false;
    const spacing = Math.max(22, 15 / scale);
    if (this.spacing !== spacing) {
      this.phase = this.spacing ? this.phase / this.spacing * spacing : 0;
      this.spacing = spacing;
    }
    this.phase = (this.phase + elapsed * 16 / 1000 / scale) % spacing;
    const count = Math.ceil(this.length / spacing);
    while (this.dots.length < count) {
      const dot = new Sprite(this.dotTexture);
      dot.anchor.set(.5);
      this.dots.push(dot);
      this.addChild(dot);
    }
    let sample = 1;
    for (let i = 0; i < this.dots.length; i++) {
      const dot = this.dots[i], distance = i * spacing + this.phase;
      dot.visible = i < count && distance < this.length;
      if (!dot.visible) continue;
      while (sample < this.samples.length - 1 && this.samples[sample].distance < distance) sample++;
      const a = this.samples[sample - 1], b = this.samples[sample];
      const t = (distance - a.distance) / Math.max(.001, b.distance - a.distance);
      dot.position.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      dot.scale.set(1 / scale);
    }
    return true;
  }
}
