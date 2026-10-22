import { Component, computed, effect, inject, signal } from '@angular/core';
import { TournamentSession } from '../data/tournament-session';
import { ToastService } from './toast.service';
import { PushNotifications } from '../data/push-notifications';
import { myTurn, MyTurn } from '../domain/tournament';
import { formatClock, formatDuration } from './format';
import { ConfirmService } from './confirm.service';
import { changeName } from './identity-gate';

/** Where the person using this phone stands: playing now, how long until they play… */
@Component({
  selector: 'app-my-turn',
  template: `
    @if (session.tournament(); as t) {
      @if (!session.me()) {
        <section class="cut-sm flex items-center gap-4 bg-pitch p-4">
          <div class="min-w-0 flex-1">
            <p class="eyebrow text-cyan">Invitado</p>
            <p class="mt-1 text-sm text-mist">Si juegas, elige tu nombre para ver cuándo te toca y recibir avisos.</p>
          </div>
          <button type="button" class="tag shrink-0 bg-line text-chalk hover:bg-raised" (click)="session.setGuest(false)">Soy jugador</button>
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
            (click)="change()"
          >
            Cambiar
          </button>
        </section>

        @switch (pushState()) {
          @case ('off') {
            <button type="button" class="btn-secondary mt-2 w-full text-sm" [disabled]="pushBusy()" (click)="enablePush()">
              🔔 Avisarme cuando me toque
            </button>
          }
          @case ('on') {
            <p class="mt-2 flex items-center justify-between gap-3 bg-pitch px-4 py-2 text-sm">
              <span><span class="text-volt">●</span> Avisos activados en este móvil</span>
              <button type="button" class="text-mist underline hover:text-chalk" [disabled]="pushBusy()" (click)="disablePush()">Desactivar</button>
            </p>
          }
          @case ('needs-install') {
            <p class="mt-2 bg-pitch px-4 py-2 text-xs text-mist">
              Para recibir avisos en iPhone, instala la app: <span class="text-chalk">Compartir → Añadir a pantalla de inicio</span>, y ábrela desde ahí.
            </p>
          }
          @case ('blocked') {
            <p class="mt-2 bg-pitch px-4 py-2 text-xs text-mist">
              Has bloqueado las notificaciones de esta web. Actívalas en los ajustes del navegador para recibir avisos.
            </p>
          }
        }
      }
    }
  `,
})
export class MyTurnPanel {
  protected readonly session = inject(TournamentSession);
  private readonly toast = inject(ToastService);
  private readonly push = inject(PushNotifications);
  private readonly confirm = inject(ConfirmService);

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

  protected readonly pushBusy = signal(false);

  /** What to offer about notifications for this device and person. */
  protected readonly pushState = computed<'off' | 'on' | 'needs-install' | 'blocked' | null>(() => {
    const t = this.session.tournament();
    const me = this.session.me();
    if (!t || !me) return null;
    this.push.subscribedAs(); // re-evaluate when notifications are switched on or off
    const availability = this.push.availability(t.id);
    if (availability === 'unavailable') return null;
    if (availability !== 'ready') return availability;
    return this.push.isOn(t.id, me) ? 'on' : 'off';
  });

  protected async enablePush(): Promise<void> {
    const t = this.session.tournament();
    const me = this.session.me();
    if (!t || !me) return;
    this.pushBusy.set(true);
    try {
      await this.push.enable(t.id, me);
      this.toast.info('Listo: te avisaremos cuando te toque.');
    } catch (error) {
      this.toast.error(
        Notification.permission === 'denied'
          ? 'Has bloqueado las notificaciones. Actívalas en los ajustes del navegador.'
          : error,
      );
    } finally {
      this.pushBusy.set(false);
    }
  }

  protected async disablePush(): Promise<void> {
    const t = this.session.tournament();
    if (!t) return;
    this.pushBusy.set(true);
    try {
      await this.push.disable(t.id);
    } finally {
      this.pushBusy.set(false);
    }
  }

  protected change(): Promise<void> {
    return changeName(this.session, this.confirm, this.push);
  }

  protected duration(minutes: number): string {
    return formatDuration(minutes);
  }

  protected clock(minutes: number): string {
    return formatClock(new Date(Date.now() + minutes * 60_000));
  }
}
