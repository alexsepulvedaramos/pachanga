import { Component, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { prefersReducedMotion } from './motion';

/** A number that counts up from zero when it appears. */
@Component({
  selector: 'app-count-up',
  template: `{{ shown() }}`,
})
export class CountUp implements OnInit {
  readonly value = input.required<number>();
  /** Milliseconds to get there. */
  readonly duration = input(1200);
  readonly delay = input(0);

  protected readonly shown = signal(0);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    const target = this.value();
    if (prefersReducedMotion() || target === 0) {
      this.shown.set(target);
      return;
    }
    let frame = 0;
    const start = performance.now() + this.delay();
    const tick = (now: number) => {
      const progress = Math.min(Math.max((now - start) / this.duration(), 0), 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      this.shown.set(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    this.destroyRef.onDestroy(() => cancelAnimationFrame(frame));
  }
}
