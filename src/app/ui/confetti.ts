import { AfterViewInit, Component, DestroyRef, ElementRef, inject, input, viewChild } from '@angular/core';
import { prefersReducedMotion } from './motion';

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  angle: number;
  spin: number;
  color: string;
}

/**
 * Confetti over its container: a burst from the bottom when it appears and, with `rain`, a shower
 * that keeps falling. Nothing at all for people who prefer reduced motion.
 */
@Component({
  selector: 'app-confetti',
  host: { class: 'pointer-events-none absolute inset-0 block', 'aria-hidden': 'true' },
  template: `<canvas #canvas class="size-full"></canvas>`,
})
export class Confetti implements AfterViewInit {
  readonly colors = input<string[]>(['#c8ff2e', '#18d6ff', '#ff3b6b', '#ffc83d', '#f2f5ff']);
  readonly rain = input(false);
  /** Pieces in the opening burst. */
  readonly amount = input(140);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly destroyRef = inject(DestroyRef);

  ngAfterViewInit(): void {
    if (prefersReducedMotion()) return;
    const canvas = this.canvas().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = canvas.clientWidth * ratio;
      canvas.height = canvas.clientHeight * ratio;
    };
    resize();

    const colors = this.colors();
    const piece = (x: number, y: number, vx: number, vy: number): Piece => ({
      x,
      y,
      vx,
      vy,
      size: (6 + Math.random() * 8) * ratio,
      angle: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
    const pieces: Piece[] = [];
    for (let i = 0; i < this.amount(); i++) {
      const fromLeft = i % 2 === 0;
      pieces.push(
        piece(
          fromLeft ? 0 : canvas.width,
          canvas.height,
          (fromLeft ? 1 : -1) * (4 + Math.random() * 10) * ratio,
          -(14 + Math.random() * 14) * ratio,
        ),
      );
    }

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 16.7, 3);
      last = now;
      if (this.rain() && pieces.length < 220 && Math.random() < 0.5) {
        pieces.push(piece(Math.random() * canvas.width, -20, (Math.random() - 0.5) * 2 * ratio, (2 + Math.random() * 3) * ratio));
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i];
        p.vy += 0.35 * ratio * dt;
        p.vx *= 0.99;
        p.vy = Math.min(p.vy, 6 * ratio);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.angle += p.spin * dt;
        if (p.y > canvas.height + 40) {
          pieces.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (pieces.length || this.rain()) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    addEventListener('resize', resize);
    this.destroyRef.onDestroy(() => {
      cancelAnimationFrame(frame);
      removeEventListener('resize', resize);
    });
  }
}
