import { Component, input } from '@angular/core';

/** The app's line icons, drawn on a 24×24 grid in the colour of the text around them. */
const PATHS = {
  ball: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 8.2l3.6 2.6-1.4 4.2H9.8l-1.4-4.2ZM12 8.2V3M15.6 10.8l4.8-1.6M14.2 15l3 4M9.8 15l-3 4M8.4 10.8 3.6 9.2',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2.5h-15ZM10 21a2 2 0 0 0 4 0M12 3v2',
  pencil: 'M4 20l1-4.5L16 4.5l3.5 3.5-11 11ZM14 7l3.5 3.5',
  check: 'M5 12.5l4.5 4.5L19 7',
  close: 'M6 6l12 12M18 6 6 18',
  back: 'M19 12H5M11 6l-6 6 6 6',
};

export type IconName = keyof typeof PATHS;

@Component({
  selector: 'app-icon',
  host: { class: 'inline-block shrink-0 align-[-0.15em]', 'aria-hidden': 'true' },
  template: `
    <svg
      viewBox="0 0 24 24"
      [attr.width]="size()"
      [attr.height]="size()"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="name() === 'check' || name() === 'close' ? 2.4 : 2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="block"
    >
      <path [attr.d]="paths[name()]" />
    </svg>
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input('1em');
  protected readonly paths = PATHS;
}

/** A rating out of five as whole and half stars, in the colour of the text around it. */
@Component({
  selector: 'app-stars',
  host: { class: 'inline-flex items-center gap-px align-[-0.1em]', role: 'img', '[attr.aria-label]': 'value() + " estrellas"' },
  template: `
    @for (fill of fills(); track $index) {
      <svg viewBox="0 0 24 24" width="1em" height="1em" class="block" aria-hidden="true">
        <defs>
          <clipPath [attr.id]="clipId + $index"><rect x="0" y="0" width="12" height="24" /></clipPath>
        </defs>
        @if (fill === 1) {
          <path [attr.d]="star" fill="currentColor" />
        } @else {
          <path [attr.d]="star" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
          <path [attr.d]="star" fill="currentColor" [attr.clip-path]="'url(#' + clipId + $index + ')'" />
        }
      </svg>
    }
  `,
})
export class Stars {
  readonly value = input.required<number>();
  protected readonly star = 'M12 3l2.8 6 6.2.6-4.8 4.2 1.4 6.2L12 16.8 6.4 20l1.4-6.2L3 9.6 9.2 9z';
  protected readonly clipId = `half-star-${nextId++}-`;

  /** 1 for a whole star, 0.5 for the half one at the end. */
  protected fills(): number[] {
    const whole = Math.floor(this.value());
    return [...Array(whole).fill(1), ...(this.value() % 1 ? [0.5] : [])];
  }
}

let nextId = 0;
