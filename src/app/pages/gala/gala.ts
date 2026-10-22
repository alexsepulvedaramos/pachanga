import { Component, computed, effect, inject, OnDestroy, OnInit, signal, untracked } from '@angular/core';
import { TournamentSession } from '../../data/tournament-session';
import { galaLive, GalaSlide, galaSlides, setGalaStep } from '../../domain/gala';
import { Id, Match } from '../../domain/types';
import { clubColor } from '../../ui/club-colors';
import { ClubCrest } from '../../ui/club-crest';
import { Confetti } from '../../ui/confetti';
import { CountUp } from '../../ui/count-up';
import { GalaViewer } from './gala-viewer';
import { Walkout, walkoutMs } from './walkout';
import { ShareWrapped } from '../../ui/share-wrapped';

/** How long each kind of slide stays up when replayed, after any walkout. */
const SLIDE_MS: Record<GalaSlide['kind'], number> = {
  intro: 6500,
  champions: 7000,
  goldenBoot: 6500,
  ballonDor: 6000,
};


/**
 * Closing ceremony, full screen and story-style: how the night went, the champions, the Golden
 * Boot and the Ballon d'Or podium from third to first. Live, every screen shows the slide the
 * admin is on; replayed, it moves on by itself and with taps.
 */
@Component({
  selector: 'app-gala',
  imports: [Confetti, CountUp, ClubCrest, Walkout],
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
                <span class="tag bg-flare text-ink"><span class="mr-1.5 inline-block size-1.5 animate-pulse-live bg-ink align-middle"></span>En directo</span>
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

        @for (k of keys(); track k) {
          @let slide = current()!;
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
                <app-club-crest
                  class="animate-pop"
                  [club]="session.teamName(slide.teamId)"
                  [color]="clubColorOf(slide.teamId)"
                  size="clamp(6rem, 30vw, 12rem)"
                />
                <p class="eyebrow mt-4 animate-rise text-volt [animation-delay:400ms]">🏆 Campeones</p>
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
                <app-walkout [slide]="slide" />
              }
            }
          </section>
        }

        <!-- Controls -->
        <div class="absolute inset-x-0 bottom-0 z-20 flex items-center justify-center gap-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          @if (ended() || finished()) {
            <button type="button" class="btn-primary" [disabled]="wrapped.busy()" (click)="$event.stopPropagation(); wrapped.share(t)">
              Compartir
            </button>
          }
          @if (ended()) {
            <button type="button" class="btn-secondary" (click)="$event.stopPropagation(); restart()">Volver a verla</button>
            <button type="button" class="btn-secondary" (click)="$event.stopPropagation(); viewer.close()">Cerrar</button>
          } @else if (live() && session.isAdmin()) {
            <button type="button" class="btn-secondary" [disabled]="index() === 0 || session.saving()" (click)="$event.stopPropagation(); previous()">←</button>
            <button type="button" class="btn-primary min-w-48 text-lg" [disabled]="session.saving()" (click)="$event.stopPropagation(); next()">
              {{ index() === slides().length - 1 ? 'Terminar la gala' : 'Siguiente →' }}
            </button>
          } @else if (live()) {
            <p class="eyebrow text-chalk/60">En directo · el admin pasa las pantallas</p>
          } @else if (finished()) {
            <button type="button" class="btn-secondary" (click)="$event.stopPropagation(); restart()">Volver a verla</button>
            <button type="button" class="btn-secondary" (click)="$event.stopPropagation(); viewer.close()">Cerrar</button>
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
  protected readonly wrapped = inject(ShareWrapped);

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
  /**
   * The current slide's key in a one-item list, tracked by itself, so every slide is built afresh
   * (and animates in) even when it is the same kind as the one before.
   */
  protected readonly keys = computed(() => (this.current() ? [`${this.viewer.mode()}:${this.index()}`] : []));
  constructor() {
    // Replays start from the beginning.
    effect(() => {
      if (this.viewer.mode() === 'replay') untracked(() => this.restart());
    });
  }

  ngOnInit(): void {
    document.body.style.overflow = 'hidden';
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
  }

  protected durationOf(slide: GalaSlide): number {
    return SLIDE_MS[slide.kind] + (slide.kind === 'ballonDor' ? walkoutMs(slide.place) : 0);
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
}
