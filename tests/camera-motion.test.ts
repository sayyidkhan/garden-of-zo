import { describe, expect, test } from 'bun:test';
import { EventEmitter } from 'pixi.js';
import { AtlasGlide, AtlasWheel } from '../client/camera-motion';
import type { Viewport } from 'pixi-viewport';

function camera() {
  return Object.assign(new EventEmitter(), {
    x: -600, y: -400, screenHeight: 800,
    scale: { x: .72, y: .72, set(value: number) { this.x = this.y = value; } },
    input: { count: () => 0, getPointerPosition: () => ({ x: 500, y: 300 }) },
    plugins: { remove() {}, get() { return undefined; } },
  }) as unknown as Viewport;
}

describe('Atlas camera motion', () => {
  test('a fast flick stays within 240 screen pixels of release', () => {
    const viewport = camera(), glide = new AtlasGlide(viewport);
    (glide as any).saved = [{ x: -1600, y: -400, time: performance.now() - 20 }];
    glide.up(); glide.update(2000);
    expect(viewport.x + 600).toBeGreaterThan(230);
    expect(viewport.x + 600).toBeLessThanOrEqual(240);
    expect(viewport.y).toBe(-400);
  });

  test('release glide travels the same distance at 30, 60, 120 and 144 Hz', () => {
    const distances = [30, 60, 120, 144].map(fps => {
      const viewport = camera(), start = viewport.x;
      const glide = new AtlasGlide(viewport);
      glide.activate({ x: 1, y: -.5 });
      for (let frame = 0; frame < fps / 2; frame++) glide.update(1000 / fps);
      expect(viewport.x - start).toBeGreaterThan(140);
      expect(viewport.x - start).toBeLessThan(150);
      expect((viewport.x - start) / (viewport.y + 400)).toBeCloseTo(-2, 6);
      return viewport.x - start;
    });
    expect(Math.max(...distances) - Math.min(...distances)).toBeLessThan(.01);
  });

  test('holding still before release produces no glide; a new press cancels glide', () => {
    const viewport = camera(), glide = new AtlasGlide(viewport);
    (glide as any).saved = [{ x: -610, y: -400, time: performance.now() - 200 }];
    glide.up(); glide.update(16);
    expect(viewport.x).toBe(-600);
    glide.activate({ x: 1 }); glide.down(); glide.update(16);
    expect(viewport.x).toBe(-600);
    glide.activate({ x: 1 }); glide.update(16);
    expect(viewport.x).toBeGreaterThan(-600);
    expect(viewport.y).toBe(-400);
  });

  test('zoom advances across frames with a stable cursor anchor and settles', () => {
    for (const fps of [30, 60, 120, 144]) {
      const viewport = camera();
      const wheel = new AtlasWheel(viewport, () => ({ min: .2, max: 2.4 }), () => false);
      const anchor = (500 - viewport.x) / viewport.scale.x;
      wheel.wheel({ deltaY: -120, deltaMode: 0, preventDefault() {} } as WheelEvent);
      expect(viewport.scale.x).toBe(.72);
      wheel.update(1000 / fps);
      expect(viewport.scale.x).toBeGreaterThan(.72);
      expect(viewport.scale.x).toBeLessThan(wheel.target!);
      for (let frame = 0; frame < fps / 2; frame++) wheel.update(1000 / fps);
      expect(wheel.target).toBeUndefined();
      expect((500 - viewport.x) / viewport.scale.x).toBeCloseTo(anchor, 8);
      expect(viewport.scale.x).toBeCloseTo(.72 * Math.exp(.216), 8);
    }
  });

  test('reversing wheel direction responds immediately; pressing cancels pending zoom', () => {
    const viewport = camera();
    const wheel = new AtlasWheel(viewport, () => ({ min: .2, max: 2.4 }), () => false);
    const event = (deltaY: number) => ({ deltaY, deltaMode: 0, preventDefault() {} }) as WheelEvent;
    wheel.wheel(event(-120)); wheel.update(16);
    const zoom = viewport.scale.x;
    wheel.wheel(event(120)); wheel.update(16);
    expect(viewport.scale.x).toBeLessThan(zoom);
    wheel.down(); const stopped = viewport.scale.x; wheel.update(100);
    expect(viewport.scale.x).toBe(stopped);
  });

  test('wheel respects limits and reduced motion', () => {
    const viewport = camera();
    const wheel = new AtlasWheel(viewport, () => ({ min: .2, max: .8 }), () => true);
    wheel.wheel({ deltaY: -120, deltaMode: 1, preventDefault() {} } as WheelEvent);
    expect(viewport.scale.x).toBe(.8);
    expect(wheel.target).toBeUndefined();
  });
});
