import { Component, computed, effect, inject, signal } from '@angular/core';
import { TournamentSession } from '../data/tournament-session';
import { ToastService } from './toast.service';
import { myTurn, MyTurn } from '../domain/tournament';
import { formatClock, formatDuration } from './format';

/** "Who are you?" picker, then where that person stands: playing now, how long until they play… */
@Component({
  selector: 'app-my-turn',
  template: `
    @if (session.tournament(); as t) {
      @if (choosing() || !session.me()) {
        <section class="cut-sm bg-pitch p-4">
          <p class="eyebrow text-cyan">¿Quién eres?</p>
          <p class="mt-1 text-sm text-mist">Elige tu nombre para ver tus partidos destacados y cuándo te toca.</p>
          <div class="mt-3 flex flex-wrap gap-1.5">
            @for (p of t.participants; track p.id) {
              <button
                type="button"
                class="tag px-3 py-1.5 text-sm"
                [class]="session.me() === p.id ? 'bg-volt text-ink' : 'bg-line text-chalk hover:bg-raised'"
                (click)="choose(p.id)"
              >
                {{ p.name }}
              </button>
            }
            @if (session.me()) {
              <button type="button" class="tag bg-transparent px-3 py-1.5 text-sm text-mist" (click)="choosing.set(false)">Cancelar</button>
            }
          </div>
        </section>
      } @else if (turn(); as turn) {
        <section
          class="cut-sm flex items-center gap-4 p-4"
          [class]="turn.kind === 'now' ? 'bg-flare text-ink' : 'bg-pitch'"
          aria-live="polite"
        >
          <div class="min-w-0 flex-1">
            <p class="eyebrow" [class.text-mist]="turn.kind !== 'now'">{{ session.personName(session.me()!) }}</p>
            @switch (turn.kind) {
              @case ('now') {
                <p class="heading mt-0.5 text-3xl">¡Te toca!</p>
                <p class="font-display font-bold uppercase">
                  {{ session.teamName(turn.match.homeId) }} vs {{ session.teamName(turn.match.awayId) }}
                </p>
              }
              @case ('later') {
                <p class="heading mt-0.5 text-3xl">
                  Juegas en {{ turn.matchesBefore }} partido{{ turn.matchesBefore > 1 ? 's' : '' }}
                </p>
                <p class="text-sm text-mist">
                  {{ session.teamName(turn.match.homeId) }} vs {{ session.teamName(turn.match.awayId) }} ·
                  en ~{{ duration(turn.minutes) }} (hacia las {{ clock(turn.minutes) }})
                </p>
              }
              @case ('waiting') {
                <p class="heading mt-0.5 text-3xl">Esperando cruce</p>
                <p class="text-sm text-mist">Sigues vivo: tu próximo partido sale cuando se decida el cuadro.</p>
              }
              @case ('done') {
                <p class="heading mt-0.5 text-3xl">Has terminado</p>
                <p class="text-sm text-mist">Ya no te quedan partidos. Toca animar.</p>
              }
            }
          </div>
          <button
            type="button"
            class="tag shrink-0"
            [class]="turn.kind === 'now' ? 'bg-ink text-chalk' : 'bg-line text-mist hover:text-chalk'"
            (click)="choosing.set(true)"
          >
            Cambiar
          </button>
        </section>
      }
    }
  `,
})
export class MyTurnPanel {
  protected readonly session = inject(TournamentSession);
  private readonly toast = inject(ToastService);
  protected readonly choosing = signal(false);

  protected readonly turn = computed<MyTurn | null>(() => {
    const t = this.session.tournament();
    const me = this.session.me();
    return t && me && t.stage !== 'draw' ? myTurn(t, me) : null;
  });

  constructor() {
    // Buzz and announce when someone else's update makes it this person's turn.
    let previous: string | null = null;
    effect(() => {
      const turn = this.turn();
      const key = turn?.kind === 'now' ? turn.match.id : null;
      if (key && previous !== null && key !== previous) {
        this.toast.info('¡Te toca jugar!');
        navigator.vibrate?.([200, 100, 200]);
      }
      previous = key ?? '';
    });
  }

  protected choose(participantId: string): void {
    this.session.setMe(participantId);
    this.choosing.set(false);
  }

  protected duration(minutes: number): string {
    return formatDuration(minutes);
  }

  protected clock(minutes: number): string {
    return formatClock(new Date(Date.now() + minutes * 60_000));
  }
}
