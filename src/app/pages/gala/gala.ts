import { Component, computed, effect, inject, OnDestroy, OnInit, signal, untracked } from '@angular/core';
import { TournamentSession } from '../../data/tournament-session';
import { galaLive, GalaSlide, galaSlides, setGalaStep } from '../../domain/gala';
import { topScorers } from '../../domain/tournament';
import { Id, Match } from '../../domain/types';
import { clubColor } from '../../ui/club-colors';
import { Confetti } from '../../ui/confetti';
import { CountUp } from '../../ui/count-up';
import { GalaViewer } from './gala-viewer';

const GOLD = ['#ffc83d', '#ffb703', '#fff3c4', '#f2f5ff'];

/** How long each kind of slide stays up when replayed, after any suspense. */
const SLIDE_MS: Record<GalaSlide['kind'], number> = {
  intro: 6500,
  champions: 7000,
  goldenBoot: 6500,
  ballonDor: 6000,
};

/** Drumroll before a Ballon d'Or name comes out, longer for the winner. */
const SUSPENSE_MS = { 3: 2200, 2: 2800, 1: 4200 } as const;

/**
 * Closing ceremony, full screen and story-style: how the night went, the champions, the Golden
 * Boot and the Ballon d'Or podium from third to first. Live, every screen shows the slide the
 * admin is on; replayed, it moves on by itself and with taps.
 */
@Component({
  selector: 'app-gala',
  imports: [Confetti, CountUp],
  host: {
    '(document:keydown.arrowright)': 'next()',
    '(document:keydown.space)': '$event.preventDefault(); next()',
    '(document:keydown.arrowleft)': 'previous()',
    '(document:keydown.escape)': 'viewer.close()',
  },
  template: `
    @if (session.tournament(); as t) {
      <div
        class="fixed inset-0 z-[60] select-none overflow-hidden bg-ink"
        role="dialog"
        aria-modal="true"
        aria-label="Gala de {{ t.name }}"
        (click)="tap($event)"
      >
        <!-- Progress, like stories -->
        <div class="absolute inset-x-0 top-0 z-20 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div class="flex gap-1">
            @for (s of slides(); track $index) {
              <div class="h-1 flex-1 overflow-hidden bg-chalk/25">
                @if ($index < index() || ($index === index() && (live() || finished()))) {
                  <div class="h-full bg-chalk"></div>
                } @else if ($index === index() && !paused()) {
                  <div
                    class="h-full origin-left animate-story bg-chalk"
                    [style.animation-duration.ms]="durationOf(s)"
                    (animationend)="autoAdvance()"
                  ></div>
                }
              </div>
            }
          </div>
          <div class="mt-3 flex items-center justify-between gap-3">
            <p class="eyebrow truncate text-chalk/80">{{ t.name }}</p>
            <div class="flex items-center gap-2">
              @if (live() && !ended()) {
                <span class="tag animate-pulse-live bg-flare text-ink">En directo</span>
              }
              <button
                type="button"
                class="px-2 text-2xl text-chalk/80 hover:text-chalk"
                aria-label="Cerrar la gala"
                (click)="$event.stopPropagation(); viewer.close()"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        @for (slide of shown(); track key()) {
          <section class="absolute inset-0 flex flex-col items-center justify-center px-6 pb-28 pt-24 text-center" aria-live="polite">
            @switch (slide.kind) {
              @case ('intro') {
                <div class="absolute inset-0 -z-10 bg-[linear-gradient(115deg,var(--color-pitch)_0_45%,var(--color-ink)_45%_100%)]"></div>
                <p class="eyebrow animate-rise text-cyan">Así fue</p>
                <h2 class="heading mt-3 animate-slam text-[clamp(3rem,14vw,9rem)] [animation-delay:150ms]">{{ t.name }}</h2>
                <div class="mt-10 grid w-full max-w-xl grid-cols-2 gap-3">
                  <div class="cut animate-pop bg-volt p-4 text-ink [animation-delay:700ms]">
                    <p class="heading text-[clamp(3rem,12vw,6rem)] tabular-nums"><app-count-up [value]="slide.matches" [delay]="700" /></p>
                    <p class="eyebrow">Partidos</p>
                  </div>
                  <div class="cut animate-pop bg-cyan p-4 text-ink [animation-delay:1000ms]">
                    <p class="heading text-[clamp(3rem,12vw,6rem)] tabular-nums"><app-count-up [value]="slide.goals" [delay]="1000" /></p>
                    <p class="eyebrow">Goles</p>
                  </div>
                </div>
                @if (slide.biggestWin; as m) {
                  <div class="mt-6 animate-rise [animation-delay:1800ms]">
                    <p class="eyebrow text-flare">La mayor goleada</p>
                    <p class="heading mt-1 text-[clamp(1.5rem,6vw,3rem)]">{{ score(m) }}</p>
                  </div>
                }
              }

              @case ('champions') {
                <div
                  class="absolute inset-0 -z-10 opacity-90"
                  [style.background]="'radial-gradient(circle at 50% 40%, ' + clubColorOf(slide.teamId) + '55, var(--color-ink) 70%)'"
                ></div>
                <app-confetti [amount]="180" />
                <p class="animate-pop text-[clamp(5rem,22vw,11rem)] leading-none" aria-hidden="true">🏆</p>
                <p class="eyebrow mt-4 animate-rise text-volt [animation-delay:400ms]">Campeones</p>
                <h2 class="heading mt-2 animate-slam text-[clamp(3.5rem,16vw,10rem)] [animation-delay:700ms]">{{ session.teamName(slide.teamId) }}</h2>
                <p class="mt-4 animate-rise font-display text-[clamp(1.5rem,6vw,3rem)] font-bold uppercase [animation-delay:1300ms]">
                  {{ names(slide.playerIds) }}
                </p>
                <p class="mt-6 animate-rise text-mist [animation-delay:1800ms]">Final · {{ score(slide.final) }}</p>
              }

              @case ('goldenBoot') {
                <div class="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_35%,#ffc83d33,var(--color-ink)_65%)]"></div>
                <p class="animate-pop text-[clamp(5rem,20vw,10rem)] leading-none" aria-hidden="true">👟</p>
                <p class="eyebrow mt-4 animate-rise text-gold [animation-delay:400ms]">
                  Bota de Oro{{ slide.participantIds.length > 1 ? ' compartida' : '' }}
                </p>
                <h2 class="heading mt-2 animate-slam text-[clamp(3rem,14vw,9rem)] [animation-delay:800ms]">{{ names(slide.participantIds) }}</h2>
                <p class="heading mt-6 animate-rise text-[clamp(2.5rem,10vw,6rem)] text-gold [animation-delay:1400ms]">
                  <app-count-up [value]="slide.goals" [delay]="1400" /> {{ slide.goals === 1 ? 'gol' : 'goles' }}
                </p>
              }

              @case ('ballonDor') {
                @if (!revealed()) {
                  <div class="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_45%,#ffc83d22,var(--color-ink)_60%)]"></div>
                  <p class="eyebrow animate-rise text-gold">Balón de Oro</p>
                  <p class="heading mt-2 animate-rise text-[clamp(2.5rem,11vw,6rem)]">{{ placeLabel(slide.place) }}</p>
                  <p class="mt-10 animate-suspense text-[clamp(5rem,22vw,11rem)] leading-none" aria-hidden="true">⚽</p>
                  <p class="mt-8 animate-pulse-live font-display text-xl font-bold uppercase tracking-[0.3em] text-mist">
                    {{ slide.place === 1 ? 'Y el Balón de Oro es para…' : 'Es para…' }}
                  </p>
                } @else {
                  @if (slide.place === 1) {
                    <div class="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_40%,#ffc83d66,#3d2a00_55%,var(--color-ink)_90%)]"></div>
                    <app-confetti [colors]="gold" [rain]="true" [amount]="220" />
                  } @else {
                    <div class="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_40%,#ffc83d26,var(--color-ink)_65%)]"></div>
                    <app-confetti [colors]="gold" [amount]="slide.place === 2 ? 90 : 50" />
                  }
                  <p class="eyebrow animate-rise text-gold">{{ slide.place === 1 ? 'Balón de Oro' : 'Balón de Oro · ' + placeLabel(slide.place) }}</p>
                  @if (slide.place === 1) {
                    <p class="mt-2 animate-pop text-[clamp(4rem,16vw,8rem)] leading-none" aria-hidden="true">🏅</p>
                  } @else {
                    <p class="heading mt-2 animate-pop text-[clamp(4rem,18vw,9rem)] text-chalk/30">{{ slide.place }}º</p>
                  }
                  <h2
                    class="heading mt-2 animate-flip-in text-[clamp(3.5rem,17vw,11rem)] [animation-delay:200ms]"
                    [class]="slide.place === 1 ? 'gold-text animate-shine' : ''"
                  >
                    {{ session.personName(slide.participantId) }}
                  </h2>
                  <p class="mt-3 animate-rise font-display text-[clamp(1.25rem,5vw,2.25rem)] font-bold uppercase text-mist [animation-delay:700ms]">
                    {{ detail(slide.participantId) }}
                  </p>
                  <p class="heading mt-6 animate-rise text-[clamp(2.5rem,10vw,5rem)] text-gold [animation-delay:1000ms]">
                    <app-count-up [value]="slide.points" [delay]="1000" [duration]="1500" /> puntos
                  </p>
                }
              }
            }
          </section>
        }

        <!-- Controls -->
        <div class="absolute inset-x-0 bottom-0 z-20 flex items-center justify-center gap-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          @if (ended()) {
            <button type="button" class="btn-secondary" (click)="$event.stopPropagation(); restart()">Volver a verla</button>
            <button type="button" class="btn-primary" (click)="$event.stopPropagation(); viewer.close()">Cerrar</button>
          } @else if (live() && session.isAdmin()) {
            <button type="button" class="btn-secondary" [disabled]="index() === 0 || session.saving()" (click)="$event.stopPropagation(); previous()">←</button>
            <button type="button" class="btn-primary min-w-48 text-lg" [disabled]="session.saving()" (click)="$event.stopPropagation(); next()">
              {{ index() === slides().length - 1 ? 'Terminar la gala' : 'Siguiente →' }}
            </button>
          } @else if (live()) {
            <p class="eyebrow text-chalk/60">En directo · el admin pasa las pantallas</p>
          } @else if (finished()) {
            <button type="button" class="btn-secondary" (click)="$event.stopPropagation(); restart()">Volver a verla</button>
            <button type="button" class="btn-primary" (click)="$event.stopPropagation(); viewer.close()">Cerrar</button>
          } @else {
            <p class="eyebrow text-chalk/50">Toca para avanzar</p>
          }
        </div>
      </div>
    }
  `,
})
export class Gala implements OnInit, OnDestroy {
  protected readonly session = inject(TournamentSession);
  protected readonly viewer = inject(GalaViewer);
  protected readonly gold = GOLD;

  protected readonly slides = computed(() => {
    const t = this.session.tournament();
    return t ? galaSlides(t) : [];
  });
  protected readonly live = computed(() => this.viewer.mode() === 'live');
  /** Slide this screen is on when replaying. */
  private readonly ownStep = signal(0);
  /** Live gala the admin has finished. */
  protected readonly ended = computed(() => {
    const t = this.session.tournament();
    return this.live() && !!t?.gala && !galaLive(t);
  });
  protected readonly index = computed(() => {
    const step = this.live() ? (this.session.tournament()?.gala?.step ?? 0) : this.ownStep();
    return Math.max(0, Math.min(step, this.slides().length - 1));
  });
  /** Replay sitting on its last slide. */
  protected readonly finished = signal(false);
  protected readonly paused = computed(() => this.live() || this.finished());
  protected readonly current = computed<GalaSlide | null>(() => this.slides()[this.index()] ?? null);
  /** The current slide in a one-item list, so it is rebuilt (and animates in) on every change. */
  protected readonly shown = computed(() => (this.current() ? [this.current()!] : []));
  protected readonly key = computed(() => `${this.viewer.mode()}:${this.index()}`);
  /** Whether the name on a Ballon d'Or slide is out, after the drumroll. */
  protected readonly revealed = signal(false);
  private suspense: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      this.key();
      const slide = this.current();
      untracked(() => {
        clearTimeout(this.suspense);
        this.revealed.set(slide?.kind !== 'ballonDor');
        if (slide?.kind !== 'ballonDor') return;
        this.suspense = setTimeout(() => {
          this.revealed.set(true);
          navigator.vibrate?.(slide.place === 1 ? [120, 60, 120, 60, 400] : [150]);
        }, SUSPENSE_MS[slide.place]);
      });
    });
    // Replays start from the beginning.
    effect(() => {
      if (this.viewer.mode() === 'replay') untracked(() => this.restart());
    });
  }

  ngOnInit(): void {
    document.body.style.overflow = 'hidden';
  }

  ngOnDestroy(): void {
    clearTimeout(this.suspense);
    document.body.style.overflow = '';
  }

  protected durationOf(slide: GalaSlide): number {
    return SLIDE_MS[slide.kind] + (slide.kind === 'ballonDor' ? SUSPENSE_MS[slide.place] : 0);
  }

  protected tap(event: MouseEvent): void {
    if (event.clientX < innerWidth / 3) this.previous();
    else this.next();
  }

  protected next(): void {
    if (this.live()) {
      const t = this.session.tournament();
      if (!this.session.isAdmin() || this.session.saving() || !t?.gala || this.ended()) return;
      void this.session.apply((x) => setGalaStep(x, x.gala!.step + 1));
      return;
    }
    if (this.ownStep() >= this.slides().length - 1) this.finished.set(true);
    else this.ownStep.update((s) => s + 1);
  }

  protected previous(): void {
    if (this.live()) {
      const t = this.session.tournament();
      if (!this.session.isAdmin() || this.session.saving() || !t?.gala || this.ended()) return;
      void this.session.apply((x) => setGalaStep(x, Math.min(x.gala!.step, this.slides().length - 1) - 1));
      return;
    }
    this.finished.set(false);
    this.ownStep.update((s) => Math.max(0, s - 1));
  }

  protected autoAdvance(): void {
    if (!this.live()) this.next();
  }

  protected restart(): void {
    this.finished.set(false);
    this.ownStep.set(0);
    if (this.viewer.mode() !== 'replay') this.viewer.replay();
  }

  protected names(ids: Id[]): string {
    return ids.map((id) => this.session.personName(id)).join(' + ');
  }

  protected clubColorOf(teamId: Id): string {
    const t = this.session.tournament();
    return t ? clubColor(t.clubs, this.session.teamName(teamId)) : '#c8ff2e';
  }

  protected score(m: Match): string {
    const pens = m.homePens != null && m.awayPens != null ? ` (pen. ${m.homePens}–${m.awayPens})` : '';
    return `${this.session.teamName(m.homeId)} ${m.homeGoals}–${m.awayGoals} ${this.session.teamName(m.awayId)}${pens}`;
  }

  protected placeLabel(place: 1 | 2 | 3): string {
    return place === 1 ? 'Ganador' : place === 2 ? '2º puesto' : '3er puesto';
  }

  /** Club and, if scorers are tracked, goals of a Ballon d'Or nominee. */
  protected detail(participantId: Id): string {
    const t = this.session.tournament();
    if (!t) return '';
    const club = t.teams.find((x) => x.memberIds.includes(participantId))?.club ?? '';
    if (!t.config.trackScorers) return club;
    const goals = topScorers(t).find((s) => s.participantId === participantId)?.goals ?? 0;
    return `${club} · ${goals} ${goals === 1 ? 'gol' : 'goles'}`;
  }
}
