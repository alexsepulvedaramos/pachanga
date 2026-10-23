import { Component, computed, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { TournamentSession } from '../../data/tournament-session';
import { GalaSlide, playerRecord } from '../../domain/gala';
import { clubColor } from '../../ui/club-colors';
import { ClubCrest } from '../../ui/club-crest';
import { Confetti } from '../../ui/confetti';
import { prefersReducedMotion } from '../../ui/motion';

type BallonDorSlide = Extract<GalaSlide, { kind: 'ballonDor' }>;

/** Bronze, silver and gold, like the cards in the game: the light colour and the card's gradient. */
const TIERS = {
  3: { light: '#e39a5c', card: 'bronze' },
  2: { light: '#dfe7f2', card: 'silver' },
  1: { light: '#ffc83d', card: 'gold' },
} as const;

const PLACE_LABELS = { 1: 'Ganador', 2: '2º puesto', 3: '3er puesto' } as const;

/** When each clue comes out and when the card does, in milliseconds. */
function timeline(place: 1 | 2 | 3) {
  const clue = place === 1 ? 1700 : 1300;
  const boom = 700 + 3 * clue;
  return {
    clue,
    clues: [700, 700 + clue, 700 + 2 * clue],
    tint: boom - 500,
    boom,
    card: boom + 150,
  };
}

/** How long a Ballon d'Or walkout takes before the card is out. */
export function walkoutMs(place: 1 | 2 | 3): number {
  return timeline(place).card;
}

/**
 * A Ballon d'Or place revealed like a pack walkout in the game: spotlights sweep a dark stadium,
 * three clues come out one at a time (club, goals or wins, first-place votes), the screen flashes
 * in the colour of the place and the player's card turns in.
 */
@Component({
  selector: 'app-walkout',
  imports: [ClubCrest, Confetti],
  host: { class: 'absolute inset-0 block' },
  styles: `
    .beam {
      position: absolute;
      bottom: -10%;
      width: min(42%, 75vh);
      height: 130%;
      transform-origin: 50% 100%;
      background: linear-gradient(to top, var(--beam), transparent 85%);
      clip-path: polygon(45% 100%, 55% 100%, 100% 0, 0 0);
      filter: blur(2px);
      opacity: 0;
    }
    .beam.left {
      left: 4%;
      animation:
        sweep-left 2.6s ease-in-out infinite alternate,
        fade-in 0.8s both;
    }
    .beam.right {
      right: 4%;
      animation:
        sweep-right 2.6s ease-in-out infinite alternate,
        fade-in 0.8s both;
    }
    .clue {
      animation: clue var(--clue) both;
    }
    .flash {
      animation: flash 0.9s ease-out both;
    }
    .card {
      --c1: #fbe7a1;
      --c2: #d4a537;
      --c3: #8a6411;
      --ink-on-card: #2b1d00;
      position: relative;
      /* Sized by whichever of width and height runs out first, so it is as big as the screen allows. */
      width: min(68vw, 42vh);
      aspect-ratio: 0.7;
      container-type: inline-size;
      color: var(--ink-on-card);
      background: linear-gradient(160deg, var(--c1) 0%, var(--c2) 55%, var(--c3) 100%);
      clip-path: polygon(14% 0, 86% 0, 100% 9%, 100% 84%, 50% 100%, 0 84%, 0 9%);
      box-shadow: inset 0 0 0 3px rgb(255 255 255 / 0.35);
      animation: card-in 1s cubic-bezier(0.2, 0.9, 0.3, 1) both;
    }
    .card::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(
        115deg,
        transparent 30%,
        rgb(255 255 255 / 0.55) 45%,
        transparent 60%
      );
      background-size: 250% 100%;
      animation: shine 3s linear infinite;
      pointer-events: none;
    }
    .card.silver {
      --c1: #f4f7fb;
      --c2: #b9c3d0;
      --c3: #6f7b8c;
      --ink-on-card: #1b2330;
    }
    .card.bronze {
      --c1: #f2c49b;
      --c2: #b8743f;
      --c3: #6b3d1b;
      --ink-on-card: #2a1406;
    }
    @keyframes sweep-left {
      from {
        transform: rotate(-28deg);
      }
      to {
        transform: rotate(14deg);
      }
    }
    @keyframes sweep-right {
      from {
        transform: rotate(28deg);
      }
      to {
        transform: rotate(-14deg);
      }
    }
    @keyframes fade-in {
      to {
        opacity: 1;
      }
    }
    @keyframes clue {
      0% {
        opacity: 0;
        transform: scale(1.6);
        filter: blur(4px);
      }
      15%,
      80% {
        opacity: 1;
        transform: none;
        filter: none;
      }
      100% {
        opacity: 0;
        transform: scale(0.9);
      }
    }
    @keyframes flash {
      0% {
        opacity: 0;
      }
      12% {
        opacity: 1;
      }
      100% {
        opacity: 0;
      }
    }
    @keyframes card-in {
      from {
        opacity: 0;
        transform: perspective(900px) rotateY(-95deg) scale(0.6);
      }
      70% {
        transform: perspective(900px) rotateY(12deg) scale(1.06);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    @keyframes shine {
      from {
        background-position: 200% 0;
      }
      to {
        background-position: -200% 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .beam,
      .card,
      .card::after {
        animation: none;
        opacity: 1;
      }
    }
  `,
  template: `
    @let s = slide();
    <div
      class="absolute inset-0 -z-10 transition-[background] duration-700"
      [style.background]="
        phase() === 'card'
          ? 'radial-gradient(circle at 50% 45%, ' + tier().light + '55, var(--color-ink) 70%)'
          : 'var(--color-ink)'
      "
    ></div>
    <div
      class="absolute inset-0 -z-10 overflow-hidden"
      [style.--beam]="tinted() ? tier().light + 'cc' : 'rgb(255 255 255 / 0.5)'"
    >
      <div class="beam left"></div>
      <div class="beam right"></div>
    </div>

    <div
      class="flex h-full flex-col items-center justify-center px-[5vmin] pb-[max(7rem,19vmin)] pt-[max(6rem,14vmin)] text-center"
    >
      @switch (phase()) {
        @case ('club') {
          <div class="clue flex flex-col items-center gap-[3vmin]" [style.--clue]="clueMs()">
            <app-club-crest
              [club]="club()"
              [color]="clubColorOf()"
              size="clamp(7rem, min(32vw, 30vh), 32rem)"
            />
            <p class="eyebrow gala-label text-chalk/80">Su club</p>
          </div>
        }
        @case ('stat') {
          <div class="clue flex flex-col items-center gap-2" [style.--clue]="clueMs()">
            <p class="heading gala-number">{{ stat().value }}</p>
            <p class="eyebrow gala-label text-chalk/80">{{ stat().label }}</p>
          </div>
        }
        @case ('votes') {
          <div class="clue flex flex-col items-center gap-2" [style.--clue]="clueMs()">
            <p class="heading gala-number">{{ votes().value }}</p>
            <p class="eyebrow gala-label text-chalk/80">{{ votes().label }}</p>
          </div>
        }
        @case ('card') {
          <app-confetti
            [colors]="[tier().light, '#fff3c4', '#f2f5ff']"
            [rain]="s.place === 1"
            [amount]="s.place === 1 ? 200 : 90"
          />
          <div class="card font-display" [class]="tier().card">
            <div
              class="grid size-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr_auto_auto] px-[10cqw] pb-[16cqw] pt-[12cqw]"
            >
              <div class="flex items-start justify-between text-left">
                <div>
                  <p class="text-[17cqw] font-extrabold leading-[0.85]">{{ s.points }}</p>
                  <p class="text-[4.5cqw] font-bold tracking-widest">PTS</p>
                </div>
                <app-club-crest [club]="club()" [color]="clubColorOf()" size="17cqw" />
              </div>
              <div
                class="grid aspect-square w-1/2 place-items-center self-center justify-self-center rounded-full bg-[radial-gradient(circle_at_50%_35%,rgb(255_255_255/0.45),rgb(0_0_0/0.12))]"
              >
                <span class="text-[22cqw] font-extrabold italic leading-none">{{ initial() }}</span>
              </div>
              <p
                class="truncate border-b-[0.5cqw] border-current pb-[1cqw] text-[12cqw] font-extrabold uppercase italic leading-none"
              >
                {{ name() }}
              </p>
              <div
                class="grid grid-cols-4 gap-[1cqw] pt-[2cqw] text-[3.8cqw] font-bold uppercase leading-tight"
              >
                @for (item of cardStats(); track item.label) {
                  <p>
                    <span class="block text-[8cqw] font-extrabold">{{ item.value }}</span>
                    {{ item.label }}
                  </p>
                }
              </div>
            </div>
          </div>
          <p
            class="eyebrow gala-label mt-[3vmin] animate-rise [animation-delay:700ms]"
            [style.color]="tier().light"
          >
            Balón de Oro · {{ placeLabel() }}
          </p>
        }
      }
    </div>

    @if (flashing()) {
      <div
        class="flash pointer-events-none absolute inset-0 z-10"
        [style.background]="tier().light"
      ></div>
    }
  `,
})
export class Walkout implements OnInit {
  private readonly session = inject(TournamentSession);
  private readonly destroyRef = inject(DestroyRef);
  readonly slide = input.required<BallonDorSlide>();

  protected readonly phase = signal<'dark' | 'club' | 'stat' | 'votes' | 'card'>('dark');
  protected readonly tinted = signal(false);
  protected readonly flashing = signal(false);

  protected readonly tier = computed(() => TIERS[this.slide().place]);
  protected readonly placeLabel = computed(() => PLACE_LABELS[this.slide().place]);
  protected readonly clueMs = computed(() => `${timeline(this.slide().place).clue}ms`);
  protected readonly name = computed(() => this.session.personName(this.slide().participantId));
  protected readonly initial = computed(() => this.name().charAt(0).toUpperCase());
  protected readonly club = computed(() => {
    const id = this.slide().participantId;
    return this.session.tournament()?.teams.find((x) => x.memberIds.includes(id))?.club ?? '';
  });
  protected readonly clubColorOf = computed(() =>
    clubColor(this.session.tournament()?.clubs ?? [], this.club()),
  );
  private readonly record = computed(() => {
    const t = this.session.tournament();
    return t ? playerRecord(t, this.slide().participantId) : { played: 0, wins: 0, goals: 0 };
  });
  private readonly trackScorers = computed(() => !!this.session.tournament()?.config.trackScorers);

  /** Second clue: goals when they are tracked, wins otherwise. */
  protected readonly stat = computed(() =>
    this.trackScorers()
      ? {
          value: this.record().goals,
          label: this.record().goals === 1 ? 'gol en la noche' : 'goles en la noche',
        }
      : { value: this.record().wins, label: this.record().wins === 1 ? 'victoria' : 'victorias' },
  );
  /** Third clue: first-place votes, or how many podiums they made if nobody put them first. */
  protected readonly votes = computed(() => {
    const { firsts, ballots } = this.slide();
    return firsts > 0
      ? { value: firsts, label: firsts === 1 ? 'voto como 1º' : 'votos como 1º' }
      : { value: ballots, label: ballots === 1 ? 'podio votado' : 'podios votados' };
  });
  protected readonly cardStats = computed(() => {
    const r = this.record();
    return [
      this.trackScorers()
        ? { label: 'Gol', value: `${r.goals}` }
        : { label: 'Votos', value: `${this.slide().ballots}` },
      { label: 'PJ', value: `${r.played}` },
      { label: 'Vic', value: `${r.wins}` },
      { label: 'BdO', value: `${this.slide().place}º` },
    ];
  });

  ngOnInit(): void {
    if (prefersReducedMotion()) {
      this.phase.set('card');
      return;
    }
    const steps = timeline(this.slide().place);
    const big = this.slide().place === 1;
    const timers = [
      ...(['club', 'stat', 'votes'] as const).map((phase, i) =>
        setTimeout(() => {
          this.phase.set(phase);
          navigator.vibrate?.(40);
        }, steps.clues[i]),
      ),
      setTimeout(() => this.tinted.set(true), steps.tint),
      setTimeout(() => {
        this.flashing.set(true);
        navigator.vibrate?.(big ? [120, 60, 120, 60, 400] : [150]);
      }, steps.boom),
      setTimeout(() => this.phase.set('card'), steps.card),
    ];
    this.destroyRef.onDestroy(() => timers.forEach(clearTimeout));
  }
}
