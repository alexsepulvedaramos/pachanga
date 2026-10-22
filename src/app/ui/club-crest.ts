import { Component, computed, inject, input, signal } from '@angular/core';
import { ClubCrests } from '../data/club-crests';

/**
 * A club's crest, or a plain shield in the club's colour with its initials when there is no crest
 * (a club typed by hand, one outside the big five leagues, or an image that fails to load).
 */
@Component({
  selector: 'app-club-crest',
  host: { class: 'inline-grid shrink-0 place-items-center', '[style.width]': 'size()', '[style.height]': 'size()' },
  template: `
    @if (url() && url() !== failed()) {
      <img class="size-full object-contain" [src]="url()" alt="" loading="lazy" (error)="failed.set(url())" />
    } @else {
      <svg viewBox="0 0 40 46" class="size-full" aria-hidden="true">
        <path d="M20 1 38 7v15c0 11-8 19-18 23C10 41 2 33 2 22V7Z" [attr.fill]="color()" stroke="#060a15" stroke-width="2" />
        <text x="20" y="27" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="800" font-size="14" fill="#060a15">
          {{ initials() }}
        </text>
      </svg>
    }
  `,
})
export class ClubCrest {
  private readonly crests = inject(ClubCrests);
  readonly club = input.required<string>();
  readonly color = input('#9eaac8');
  /** CSS size of the square it sits in. */
  readonly size = input('2rem');

  /** Crest image that could not be loaded. */
  protected readonly failed = signal<string | null>(null);
  protected readonly url = computed(() => this.crests.urlFor(this.club()));
  protected readonly initials = computed(() => {
    const words = this.club()
      .replace(/\b(FC|CF|SC|AC|AS|SS|SSC|Club|de|del)\b/gi, ' ')
      .split(/\s+/)
      .filter(Boolean);
    const letters = words.length > 1 ? words.slice(0, 3).map((w) => w[0]) : [...(words[0] ?? '?').slice(0, 3)];
    return letters.join('').toUpperCase();
  });

  constructor() {
    void this.crests.load();
  }
}
