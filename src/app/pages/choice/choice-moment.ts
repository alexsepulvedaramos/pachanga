import { Component, computed, effect, inject, input, OnDestroy, OnInit, signal } from '@angular/core';
import { TournamentSession } from '../../data/tournament-session';
import { Id } from '../../domain/types';
import { ClubCrest } from '../../ui/club-crest';
import { ChoiceMomentViewer } from './choice-moment-viewer';
import { Icon } from '../../ui/icon';

/**
 * Full screen "moment to choose" in the knockout: the team whose turn it is picks a rival (or the
 * order of play) from their phones while everyone else, and the TV, waits with them; then every
 * screen reveals the pick.
 */
@Component({
  selector: 'app-choice-moment',
  imports: [ClubCrest, Icon],
  host: { '(document:keydown.escape)': 'display() || viewer.close()' },
  template: `
    @if (session.tournament(); as t) {
      <div
        class="fixed inset-0 z-[60] flex select-none flex-col overflow-y-auto bg-ink"
        role="dialog"
        aria-modal="true"
        aria-label="Momento de elegir"
      >
        <div class="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_30%,#ffc83d26,var(--color-ink)_65%)]"></div>
        <div class="flex items-center justify-between gap-3 px-[3vmin] pt-[max(1rem,env(safe-area-inset-top),3vmin)]">
          <p class="eyebrow gala-label truncate text-chalk/80">{{ t.name }} · {{ stageName() }}</p>
          @if (!display()) {
            <button type="button" class="px-2 text-2xl text-chalk/80 hover:text-chalk" aria-label="Cerrar" (click)="viewer.close()"><app-icon name="close" /></button>
          }
        </div>

        @if (viewer.reveal(); as r) {
          <!-- The pick, revealed on every screen -->
          <section class="flex flex-1 flex-col items-center justify-center px-[5vmin] pb-[6vmin] text-center" aria-live="assertive">
            <app-club-crest class="animate-pop" [club]="session.teamName(r.chooserId)" size="clamp(3.5rem, min(16vw, 14vh), 18rem)" />
            <p class="heading gala-subtitle mt-3 animate-rise">
              {{ session.teamName(r.chooserId) }} <span class="text-mist">{{ r.opponentId ? 'elige a…' : 'jugará…' }}</span>
            </p>
            @if (r.opponentId; as rival) {
              <app-club-crest class="mt-[3vmin] animate-pop [animation-delay:1400ms]" [club]="session.teamName(rival)" size="clamp(6rem, min(30vw, 26vh), 30rem)" />
              <h2 class="heading gold-text gala-title-xl mt-4 animate-slam [animation-delay:1600ms]">{{ session.teamName(rival) }}</h2>
              <p class="gala-subtitle mt-4 animate-rise font-display font-bold uppercase text-mist [animation-delay:2400ms]">
                {{ session.teamName(r.chooserId) }} vs {{ session.teamName(rival) }}
              </p>
            } @else {
              <h2 class="heading gold-text gala-title-xl mt-[3vmin] animate-slam [animation-delay:1400ms]">
                {{ r.first ? 'Primero' : 'Segundo' }}
              </h2>
            }
          </section>
        } @else if (viewer.decision(); as d) {
          <section class="flex flex-1 flex-col items-center justify-center px-[4vmin] pb-[4vmin] pt-[2vmin] text-center" aria-live="polite">
            <p class="eyebrow gala-label animate-rise text-gold">Momento de elegir</p>
            <app-club-crest class="mt-4 animate-pop [animation-delay:200ms]" [club]="session.teamName(d.chooserId)" size="clamp(3.5rem, min(20vw, 12vh), 22rem)" />
            <h2 class="heading mt-2 animate-slam text-[clamp(2.75rem,min(12vw,11vmin),20rem)] [animation-delay:400ms]">{{ session.teamName(d.chooserId) }}</h2>
            <p class="mt-1 animate-rise font-display text-[clamp(1.25rem,min(5vw,5.2vmin),8rem)] font-bold uppercase text-gold [animation-delay:800ms]">
              {{ question() }}
            </p>
            <p class="gala-text mt-2 animate-rise text-mist [animation-delay:1000ms]">
              {{ reason() }} · {{ session.memberNames(d.chooserId).join(' + ') }}
            </p>

            @if (d.kind === 'playoffOpponent' || d.kind === 'semiOpponent') {
              <div class="mt-[2.5vmin] grid w-full max-w-[min(100%,150vmin)] gap-[2vmin]" [class]="d.options.length > 2 ? 'grid-cols-3' : 'grid-cols-2'">
                @for (option of d.options; track option; let i = $index) {
                  <button
                    type="button"
                    class="cut flex animate-rise flex-col items-center gap-[1vmin] border-2 bg-pitch px-[1vmin] py-[2vmin] transition disabled:cursor-default"
                    [class]="picked() === option ? 'border-gold bg-gold/10' : 'border-transparent'"
                    [class.animate-suspense]="!canChoose()"
                    [style.animation-delay.ms]="1200 + i * 200"
                    [disabled]="!canChoose() || session.saving()"
                    [attr.aria-pressed]="canChoose() ? picked() === option : null"
                    (click)="picked.set(option)"
                  >
                    <app-club-crest [club]="session.teamName(option)" size="clamp(2.5rem, min(12vw, 8vh), 14rem)" />
                    <span class="heading gala-row max-w-full truncate">{{ session.teamName(option) }}</span>
                    <span class="eyebrow gala-small text-mist">{{ position(option) }}º en liguilla</span>
                  </button>
                }
              </div>
            } @else {
              <div class="mt-[3vmin] grid w-full max-w-[min(100%,100vmin)] grid-cols-2 gap-[2vmin]">
                @for (first of [true, false]; track first; let i = $index) {
                  <button
                    type="button"
                    class="cut animate-rise border-2 bg-pitch px-[1.5vmin] py-[3vmin] transition disabled:cursor-default"
                    [class]="picked() === first ? 'border-gold bg-gold/10' : 'border-transparent'"
                    [style.animation-delay.ms]="1200 + i * 200"
                    [disabled]="!canChoose() || session.saving()"
                    [attr.aria-pressed]="canChoose() ? picked() === first : null"
                    (click)="picked.set(first)"
                  >
                    <span class="heading gala-subtitle">{{ first ? 'Primero' : 'Segundo' }}</span>
                  </button>
                }
              </div>
            }

            <div class="mt-[2.5vmin] min-h-14">
              @if (canChoose()) {
                @if (picked() !== null) {
                  <button type="button" class="btn-primary !px-[1.6em] !py-[0.6em] !text-[max(1.125rem,3.2vmin)]" [disabled]="session.saving()" (click)="confirm()">
                    {{ confirmLabel() }}
                  </button>
                } @else {
                  <p class="eyebrow gala-label text-chalk/70">{{ viewer.mine() ? 'Os toca elegir: tocad una opción' : 'Elige por ellos como admin' }}</p>
                }
              } @else {
                <p class="eyebrow gala-label animate-pulse-live text-chalk/70">Esperando a que elijan…</p>
              }
            </div>
          </section>
        }
      </div>
    }
  `,
})
export class ChoiceMoment implements OnInit, OnDestroy {
  protected readonly session = inject(TournamentSession);
  protected readonly viewer = inject(ChoiceMomentViewer);
  /** A screen to look at only (the TV): no choosing and no closing. */
  readonly display = input(false);

  protected readonly picked = signal<Id | boolean | null>(null);

  protected readonly canChoose = computed(() => !this.display() && (this.viewer.mine() || this.session.isAdmin()));

  protected readonly stageName = computed(() => {
    const kind = this.viewer.decision()?.kind ?? this.viewer.reveal()?.kind;
    return kind === 'playoffOpponent' || kind === 'playoffOrder' ? 'Repesca' : 'Semifinales';
  });

  protected readonly question = computed(() => {
    const kind = this.viewer.decision()?.kind;
    if (kind === 'playoffOpponent') return 'elige rival para la repesca';
    if (kind === 'semiOpponent') return 'elige rival para semis';
    return '¿su partido va primero o segundo?';
  });

  protected readonly reason = computed(() => {
    const d = this.viewer.decision();
    return d ? `${this.position(d.chooserId)}º en la liguilla` : '';
  });

  protected readonly confirmLabel = computed(() => {
    const value = this.picked();
    if (typeof value === 'boolean') return value ? 'Jugar primero' : 'Jugar segundo';
    return value ? `Elegir a ${this.session.teamName(value)}` : '';
  });

  constructor() {
    // A new decision, or the same one made elsewhere, starts with nothing picked.
    effect(() => {
      this.viewer.decision();
      this.picked.set(null);
    });
  }

  ngOnInit(): void {
    document.body.style.overflow = 'hidden';
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
  }

  protected position(teamId: Id): number {
    return (this.session.tournament()?.groupRanking?.indexOf(teamId) ?? -1) + 1;
  }

  protected async confirm(): Promise<void> {
    const value = this.picked();
    if (value === null) return;
    await this.viewer.choose(value);
    this.picked.set(null);
  }
}
