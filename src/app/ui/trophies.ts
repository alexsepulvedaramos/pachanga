import { Component, input } from '@angular/core';

let nextId = 0;

/** The Golden Boot: a gold football boot, toe down, on a plinth. */
@Component({
  selector: 'app-golden-boot',
  host: { class: 'inline-block' },
  template: `
    <svg viewBox="0 0 120 150" [attr.width]="size()" class="block h-auto" role="img" aria-label="Bota de Oro">
      <defs>
        <linearGradient [attr.id]="gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fff3c2" />
          <stop offset="0.45" stop-color="#ffc83d" />
          <stop offset="1" stop-color="#b8860b" />
        </linearGradient>
      </defs>
      <g transform="rotate(10 60 80)">
        <g transform="translate(-4 38) scale(0.24)">
          <path d="M95 238h28l-4 26h-20zM150 238h28l-4 26h-20zM385 236h26l-4 24h-18zM440 236h26l-4 24h-18z" fill="#b8860b" />
          <path
            d="M60 240C45 235 42 200 48 160C52 120 70 85 95 75C110 72 120 80 135 92C160 110 195 108 230 100C255 95 270 92 285 98L330 125C380 150 440 160 480 172C505 180 520 195 518 215C516 232 500 240 480 240Z"
            [attr.fill]="'url(#' + gold + ')'"
            stroke="#8a6408"
            stroke-width="9"
            stroke-linejoin="round"
          />
          <path d="M268 104l14 18M300 114l14 18M332 130l12 16" stroke="#8a6408" stroke-width="10" stroke-linecap="round" />
          <path d="M150 192L228 128L248 134L170 198ZM205 214L283 150L303 156L225 220Z" fill="#fff3c2" opacity="0.9" />
        </g>
      </g>
      <rect x="30" y="106" width="60" height="7" rx="2" fill="#b8860b" />
      <path d="M22 113h76l-6 27H28z" fill="#212d50" stroke="#ffc83d" stroke-width="2" stroke-linejoin="round" />
      <rect x="44" y="122" width="32" height="9" rx="1.5" [attr.fill]="'url(#' + gold + ')'" />
    </svg>
  `,
})
export class GoldenBoot {
  readonly size = input('8rem');
  protected readonly gold = `golden-boot-${nextId++}`;
}

/** The champions' cup: big-eared, Champions League style, in gold on the same plinth. */
@Component({
  selector: 'app-champions-cup',
  host: { class: 'inline-block' },
  template: `
    <svg viewBox="0 0 120 150" [attr.width]="size()" class="block h-auto" role="img" aria-label="Copa de campeones">
      <defs>
        <linearGradient [attr.id]="gold" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#fff3c2" />
          <stop offset="0.45" stop-color="#ffc83d" />
          <stop offset="1" stop-color="#b8860b" />
        </linearGradient>
      </defs>
      <path
        d="M42 15C28 0 9 8 12 30C15 52 28 66 40 74M78 15C92 0 111 8 108 30C105 52 92 66 80 74"
        stroke="#d9a21f"
        stroke-width="5"
        stroke-linecap="round"
        fill="none"
      />
      <path
        d="M40 12H80C80 17 77 21 74 24C80 34 85 46 84 57C83 73 73 86 65 93H55C47 86 37 73 36 57C35 46 40 34 46 24C43 21 40 17 40 12Z"
        [attr.fill]="'url(#' + gold + ')'"
        stroke="#8a6408"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
      <path d="M46 30C41 42 41 58 48 72" stroke="#fff3c2" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.8" />
      <path d="M55 93h10l2 10H53z" fill="#d9a21f" />
      <path d="M42 113C44 107 51 103 60 103S76 107 78 113Z" fill="#d9a21f" stroke="#8a6408" stroke-width="1.2" />
      <path d="M22 113h76l-6 27H28z" fill="#212d50" stroke="#ffc83d" stroke-width="2" stroke-linejoin="round" />
      <rect x="44" y="122" width="32" height="9" rx="1.5" [attr.fill]="'url(#' + gold + ')'" />
    </svg>
  `,
})
export class ChampionsCup {
  readonly size = input('8rem');
  protected readonly gold = `champions-cup-${nextId++}`;
}
