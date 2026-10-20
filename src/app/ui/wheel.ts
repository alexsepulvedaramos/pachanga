import { Component, computed, input, output, signal } from '@angular/core';
import { clubColor } from './club-colors';

interface Segment {
  club: string;
  path: string;
  color: string;
  labelX: number;
  labelY: number;
  labelAngle: number;
}

const SIZE = 400;
const R = SIZE / 2;
const SPIN_MS = 4200;

/** Prize wheel. `spinTo` animates to a segment of the given club and then emits `landed`. */
@Component({
  selector: 'app-wheel',
  template: `
    <div class="relative mx-auto aspect-square w-full max-w-[26rem]">
      <svg
        [attr.viewBox]="'0 0 ' + size + ' ' + size"
        class="size-full"
        role="img"
        [attr.aria-label]="'Ruleta con ' + entries().length + ' casillas'"
      >
        <g
          [style.transform]="'rotate(' + rotation() + 'deg)'"
          [style.transition]="spinning() ? 'transform ' + spinMs + 'ms cubic-bezier(0.12, 0.7, 0.08, 1)' : 'none'"
          style="transform-origin: 50% 50%"
        >
          <circle [attr.cx]="r" [attr.cy]="r" [attr.r]="r - 2" fill="#141c33" />
          @for (s of segments(); track $index) {
            <path [attr.d]="s.path" [attr.fill]="s.color" stroke="#0a0f1e" stroke-width="3" />
            <text
              [attr.x]="s.labelX"
              [attr.y]="s.labelY"
              [attr.transform]="'rotate(' + s.labelAngle + ' ' + s.labelX + ' ' + s.labelY + ')'"
              text-anchor="middle"
              dominant-baseline="middle"
              fill="#0a0f1e"
              font-family="Barlow Condensed, sans-serif"
              font-weight="800"
              font-style="italic"
              [attr.font-size]="entries().length > 8 ? 17 : 22"
            >
              {{ short(s.club) }}
            </text>
          }
        </g>
        <circle [attr.cx]="r" [attr.cy]="r" r="42" fill="#0a0f1e" stroke="#26324f" stroke-width="4" />
        <text
          [attr.x]="r"
          [attr.y]="r + 2"
          text-anchor="middle"
          dominant-baseline="middle"
          fill="#c8ff2e"
          font-family="Barlow Condensed, sans-serif"
          font-weight="800"
          font-style="italic"
          font-size="30"
        >
          {{ entries().length }}
        </text>
      </svg>
      <!-- Pointer -->
      <div
        class="absolute left-1/2 top-0 h-9 w-7 -translate-x-1/2 -translate-y-1 bg-chalk"
        style="clip-path: polygon(0 0, 100% 0, 50% 100%)"
        aria-hidden="true"
      ></div>
    </div>
  `,
})
export class Wheel {
  readonly entries = input.required<string[]>();
  readonly clubs = input.required<string[]>();
  readonly landed = output<void>();

  protected readonly size = SIZE;
  protected readonly r = R;
  protected readonly spinMs = SPIN_MS;
  protected readonly rotation = signal(0);
  protected readonly spinning = signal(false);

  protected readonly segments = computed<Segment[]>(() => {
    const entries = this.entries();
    const n = entries.length;
    if (n === 0) return [];
    const seg = 360 / n;
    return entries.map((club, i) => {
      const start = i * seg;
      const end = start + seg;
      const mid = start + seg / 2;
      const [lx, ly] = polar(R * 0.66, mid);
      return {
        club,
        path: n === 1 ? fullCircle() : arc(start, end),
        color: clubColor(this.clubs(), club),
        labelX: lx,
        labelY: ly,
        labelAngle: mid - 90,
      };
    });
  });

  /** Spins several turns and stops on a random segment of `club`. */
  spinTo(club: string): void {
    const entries = this.entries();
    const options = entries.map((c, i) => (c === club ? i : -1)).filter((i) => i >= 0);
    if (options.length === 0) return;
    const seg = 360 / entries.length;
    const index = options[Math.floor(Math.random() * options.length)];
    const target = (index + 0.5 + (Math.random() - 0.5) * 0.6) * seg;
    const current = this.rotation();
    const delta = (((-target - current) % 360) + 360) % 360;
    this.spinning.set(true);
    this.rotation.set(current + 360 * 6 + delta);
    setTimeout(() => {
      this.spinning.set(false);
      this.landed.emit();
    }, SPIN_MS + 150);
  }

  protected short(club: string): string {
    const upper = club.toUpperCase();
    return upper.length > 11 ? upper.slice(0, 10) + '.' : upper;
  }
}

function polar(radius: number, angleDeg: number): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [R + radius * Math.cos(a), R + radius * Math.sin(a)];
}

function arc(start: number, end: number): string {
  const [x1, y1] = polar(R - 2, start);
  const [x2, y2] = polar(R - 2, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${R} ${R} L ${x1} ${y1} A ${R - 2} ${R - 2} 0 ${large} 1 ${x2} ${y2} Z`;
}

function fullCircle(): string {
  return `M ${R} 2 A ${R - 2} ${R - 2} 0 1 1 ${R - 0.01} 2 Z`;
}
