import { Component, computed, effect, inject, signal } from '@angular/core';
import { TournamentSession } from '../../data/tournament-session';
import { enableBallonDor, hasBallonDor, hasVoted, PODIUM_POINTS, votingOpen } from '../../domain/ballon-dor';
import { galaLive, galaReady, startGala } from '../../domain/gala';
import { topScorers } from '../../domain/tournament';
import { Id } from '../../domain/types';
import { ConfirmService } from '../../ui/confirm.service';
import { GalaViewer } from './gala-viewer';
import { ShareWrapped } from '../../ui/share-wrapped';
import { changeName } from '../../ui/identity-gate';
import { PushNotifications } from '../../data/push-notifications';

const PLACES = ['1º', '2º', '3º'];

/**
 * After the final: the Ballon d'Or vote while it is open (each player picks a podium, the admin
 * closes it early if someone is missing), then the way into the gala.
 */
@Component({
  selector: 'app-ballon-dor-panel',
  template: `
    @if (session.tournament(); as t) {
      @if (open()) {
        <section class="cut mt-6 animate-rise bg-pitch p-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="eyebrow text-gold">Balón de Oro</p>
              <p class="heading mt-1 text-4xl">Vota tu podio</p>
              <p class="mt-1 text-sm text-mist">3 puntos al 1º, 2 al 2º y 1 al 3º. Nadie ve los votos hasta la gala.</p>
            </div>
            <p class="heading shrink-0 text-4xl text-gold">
              {{ voters().length }}<span class="text-mist">/{{ t.participants.length }}</span>
            </p>
          </div>

          <div class="mt-4 flex flex-wrap gap-1.5" aria-label="Quién ha votado">
            @for (p of t.participants; track p.id) {
              @if (session.isAdmin() && voters().includes(p.id)) {
                <button
                  type="button"
                  class="tag bg-gold text-ink hover:brightness-110"
                  [attr.aria-label]="p.name + ' ha votado. Borrar su voto'"
                  (click)="reset(p.id, p.name)"
                >
                  ✓ {{ p.name }}
                </button>
              } @else {
                <span class="tag" [class]="voters().includes(p.id) ? 'bg-gold text-ink' : 'bg-line text-mist'">
                  {{ voters().includes(p.id) ? '✓ ' : '' }}{{ p.name }}
                </span>
              }
            }
          </div>
          @if (session.isAdmin() && voters().length) {
            <p class="mt-2 text-xs text-mist">Toca a alguien que ha votado para borrar su voto si no lo emitió él.</p>
          }

          <div class="mt-5 border-t border-line pt-5">
            @if (!session.me()) {
              <div class="flex flex-wrap items-center justify-between gap-3">
                <p class="text-sm text-mist">Estás como invitado: solo votan los jugadores.</p>
                <button type="button" class="tag bg-line text-chalk hover:bg-raised" (click)="session.setGuest(false)">Soy jugador</button>
              </div>
            } @else if (iVoted() && !editing()) {
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p class="eyebrow text-mist">{{ session.personName(session.me()!) }} · Tu voto</p>
                  @if (myBallot(); as ballot) {
                    <ol class="mt-1 space-y-0.5">
                      @for (id of ballot; track id; let i = $index) {
                        <li class="font-display text-lg font-bold uppercase">
                          <span class="text-gold">{{ places[i] }}</span> {{ session.personName(id) }}
                        </li>
                      }
                    </ol>
                  } @else {
                    <p class="mt-1 text-sm">Ya has votado desde otro móvil.</p>
                  }
                </div>
                <div class="flex gap-2">
                  <button type="button" class="btn-secondary text-sm" (click)="edit()">Cambiar voto</button>
                  <button type="button" class="tag bg-line text-mist hover:text-chalk" (click)="notMe()">No soy yo</button>
                </div>
              </div>
            } @else {
              <div class="flex items-center justify-between gap-3">
                <p class="eyebrow text-mist">Vota como {{ session.personName(session.me()!) }}</p>
                <button type="button" class="tag bg-line text-mist hover:text-chalk" (click)="notMe()">No soy yo</button>
              </div>
              <ol class="mt-3 grid grid-cols-3 gap-2">
                @for (place of places; track place; let i = $index) {
                  <li>
                    <button
                      type="button"
                      class="cut-sm flex h-full w-full flex-col items-center gap-0.5 p-2 text-center"
                      [class]="picks()[i] ? 'bg-gold text-ink' : 'bg-raised text-mist'"
                      [disabled]="!picks()[i]"
                      [attr.aria-label]="picks()[i] ? 'Quitar a ' + session.personName(picks()[i]!) + ' del ' + place : place + ' libre'"
                      (click)="toggle(picks()[i]!)"
                    >
                      <span class="heading text-2xl">{{ place }}</span>
                      <span class="w-full truncate font-display text-sm font-bold uppercase">
                        {{ picks()[i] ? session.personName(picks()[i]!) : '—' }}
                      </span>
                      <span class="text-[0.65rem] font-bold uppercase">{{ points[i] }} pts</span>
                    </button>
                  </li>
                }
              </ol>
              <ul class="mt-4 grid gap-1.5 sm:grid-cols-2">
                @for (c of candidates(); track c.id) {
                  <li>
                    <button
                      type="button"
                      class="flex w-full items-center gap-3 border-l-4 px-3 py-2 text-left"
                      [class]="placeOf(c.id) !== null ? 'border-gold bg-gold/10' : 'border-transparent bg-raised hover:bg-line'"
                      [attr.aria-pressed]="placeOf(c.id) !== null"
                      (click)="toggle(c.id)"
                    >
                      <span class="min-w-0 flex-1">
                        <span class="block truncate font-display text-lg font-bold uppercase">{{ c.name }}</span>
                        <span class="block truncate text-xs text-mist">{{ c.detail }}</span>
                      </span>
                      @if (placeOf(c.id); as place) {
                        <span class="heading text-2xl text-gold">{{ place }}</span>
                      }
                    </button>
                  </li>
                }
              </ul>
              <div class="mt-4 flex items-center justify-end gap-2">
                @if (!complete()) {
                  <p class="mr-auto text-xs text-mist">Elige tu 1º, 2º y 3º.</p>
                }
                @if (editing()) {
                  <button type="button" class="btn-secondary" (click)="editing.set(false)">Cancelar</button>
                }
                <button type="button" class="btn-primary px-8" [disabled]="!complete() || sending()" (click)="vote()">
                  {{ iVoted() ? 'Cambiar voto' : 'Votar' }}
                </button>
              </div>
            }
          </div>

          @if (session.isAdmin()) {
            <div class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <p class="text-sm text-mist">Se cierra sola cuando hayan votado todos.</p>
              <button type="button" class="btn-secondary text-sm" [disabled]="sending()" (click)="close()">Cerrar votación</button>
            </div>
          }
        </section>
      } @else if (ready()) {
        <section class="cut mt-6 animate-rise bg-pitch p-5 text-center">
          <p class="eyebrow text-gold">La gala</p>
          <p class="heading mt-1 text-4xl">
            {{ hasVote() ? 'Campeones, Bota de Oro y Balón de Oro' : 'Campeones y Bota de Oro' }}
          </p>
          @if (live()) {
            <button type="button" class="btn-primary mt-4" (click)="viewer.watchLive()">Volver al directo</button>
          } @else if (t.gala) {
            <div class="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" class="btn-primary" [disabled]="wrapped.busy()" (click)="wrapped.share(t)">Compartir el resumen</button>
              <button type="button" class="btn-secondary" (click)="viewer.replay()">Volver a verla</button>
            </div>
          } @else {
            @if (session.isAdmin()) {
              <p class="mt-2 text-sm text-mist">Empieza a la vez en todos los móviles y en la tele, y tú pasas las pantallas.</p>
              <div class="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" class="btn-primary text-lg" [disabled]="session.saving()" (click)="startLive()">
                  Empezar la gala
                </button>
                <button type="button" class="btn-secondary" (click)="viewer.replay()">Verla yo solo</button>
              </div>
            } @else {
              <button type="button" class="btn-primary mt-4 text-lg" (click)="viewer.replay()">Ver la gala</button>
            }
          }
        </section>
      } @else if (session.isAdmin() && !hasVote() && !t.gala) {
        <button type="button" class="mt-3 text-sm text-mist underline hover:text-chalk" (click)="enableVote()">
          Añadir votación del Balón de Oro
        </button>
      }
    }
  `,
})
export class BallonDorPanel {
  protected readonly session = inject(TournamentSession);
  protected readonly viewer = inject(GalaViewer);
  protected readonly wrapped = inject(ShareWrapped);
  private readonly confirm = inject(ConfirmService);
  private readonly push = inject(PushNotifications);
  protected readonly places = PLACES;
  protected readonly points = PODIUM_POINTS;

  protected readonly picks = signal<(Id | null)[]>([null, null, null]);
  protected readonly editing = signal(false);
  protected readonly sending = signal(false);

  constructor() {
    // A different person on this phone starts a fresh ballot.
    effect(() => {
      this.session.me();
      this.picks.set([null, null, null]);
      this.editing.set(false);
    });
  }

  protected readonly open = computed(() => {
    const t = this.session.tournament();
    return !!t && votingOpen(t);
  });
  protected readonly ready = computed(() => {
    const t = this.session.tournament();
    return !!t && galaReady(t);
  });
  protected readonly live = computed(() => {
    const t = this.session.tournament();
    return !!t && galaLive(t);
  });
  protected readonly hasVote = computed(() => {
    const t = this.session.tournament();
    return !!t && hasBallonDor(t);
  });
  protected readonly voters = computed(() => this.session.tournament()?.ballonDor?.voters ?? []);
  protected readonly iVoted = computed(() => {
    const t = this.session.tournament();
    const me = this.session.me();
    return !!t && !!me && hasVoted(t, me);
  });
  protected readonly myBallot = computed(() => {
    this.session.tournament();
    return this.session.myBallot();
  });
  protected readonly complete = computed(() => this.picks().every((id) => id !== null));

  protected readonly candidates = computed(() => {
    const t = this.session.tournament();
    const me = this.session.me();
    if (!t) return [];
    const goals = new Map(topScorers(t).map((s) => [s.participantId, s.goals]));
    return t.participants
      .filter((p) => p.id !== me)
      .map((p) => {
        const club = t.teams.find((x) => x.memberIds.includes(p.id))?.club ?? '';
        const scored = goals.get(p.id) ?? 0;
        return {
          id: p.id,
          name: p.name,
          detail: t.config.trackScorers ? `${club} · ${scored} ${scored === 1 ? 'gol' : 'goles'}` : club,
        };
      });
  });

  protected placeOf(id: Id): string | null {
    const index = this.picks().indexOf(id);
    return index < 0 ? null : PLACES[index];
  }

  /** Puts a player in the first free place, or takes them out. */
  protected toggle(id: Id): void {
    this.picks.update((picks) => {
      const index = picks.indexOf(id);
      if (index >= 0) return picks.map((x, i) => (i === index ? null : x));
      const free = picks.indexOf(null);
      return free < 0 ? picks : picks.map((x, i) => (i === free ? id : x));
    });
  }

  protected edit(): void {
    const ballot = this.myBallot();
    this.picks.set(ballot && ballot.length === 3 ? [...ballot] : [null, null, null]);
    this.editing.set(true);
  }

  protected async vote(): Promise<void> {
    if (!this.complete()) return;
    this.sending.set(true);
    try {
      if (await this.session.castVote(this.picks() as Id[])) {
        this.editing.set(false);
        this.picks.set([null, null, null]);
      }
    } finally {
      this.sending.set(false);
    }
  }

  protected async close(): Promise<void> {
    const t = this.session.tournament();
    if (!t) return;
    const missing = t.participants.length - this.voters().length;
    const ok = await this.confirm.ask({
      title: 'Cerrar la votación',
      message: missing
        ? `Faltan ${missing} por votar. Se cuentan solo los votos emitidos y ya no se puede votar.`
        : 'Se cuentan los votos y ya no se puede votar.',
      confirmLabel: 'Cerrar',
    });
    if (!ok) return;
    this.sending.set(true);
    try {
      await this.session.closeVoting();
    } finally {
      this.sending.set(false);
    }
  }

  protected async reset(voterId: Id, name: string): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Borrar el voto de ${name}`,
      message: 'Podrá volver a votar desde cualquier móvil.',
      confirmLabel: 'Borrar voto',
      danger: true,
    });
    if (ok) await this.session.resetVote(voterId);
  }

  protected notMe(): Promise<void> {
    return changeName(this.session, this.confirm, this.push);
  }

  protected async startLive(): Promise<void> {
    await this.session.apply((t) => startGala(t));
  }

  protected async enableVote(): Promise<void> {
    await this.session.apply(enableBallonDor);
  }
}
