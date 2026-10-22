import { Component, computed, inject, signal } from '@angular/core';
import { TournamentSession } from '../data/tournament-session';
import { PushNotifications } from '../data/push-notifications';
import { hasVoted, votingOpen } from '../domain/ballon-dor';
import { ConfirmService } from './confirm.service';
import { ToastService } from './toast.service';
import { Brand } from './brand';

/**
 * Lets go of this phone's name so another can be picked. If it voted the Ballon d'Or under that
 * name, asks whether to delete the ballot too, for when the name was picked by mistake.
 */
export async function changeName(
  session: TournamentSession,
  confirm: ConfirmService,
  push: PushNotifications,
): Promise<void> {
  const t = session.tournament();
  const me = session.me();
  if (!t || !me) return;
  let dropVote = false;
  if (votingOpen(t) && hasVoted(t, me) && session.myBallot()) {
    dropVote = await confirm.ask({
      title: `Has votado como ${session.personName(me)}`,
      message: 'Si no eras tú, borra ese voto para que pueda votar quien sí lo es.',
      confirmLabel: 'Borrar el voto',
      cancelLabel: 'Dejarlo',
      danger: true,
    });
  }
  // This phone stops getting the notices meant for that name.
  if (await session.leaveName(dropVote)) await push.follow(t.id, null).catch(() => undefined);
}

/**
 * "Who are you?" before seeing the tournament. Each name belongs to one phone: names another phone
 * has are greyed out (the admin can free them). Anyone else follows as a guest.
 */
@Component({
  selector: 'app-identity-gate',
  imports: [Brand],
  template: `
    @if (session.tournament(); as t) {
      <main class="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
        <app-brand size="sm" />
        <div>
          <p class="eyebrow text-cyan">{{ t.name }}</p>
          <h1 class="heading mt-1 text-5xl">¿Quién eres?</h1>
          <p class="mt-2 text-mist">
            Tu nombre se queda en este móvil: verás tus partidos, te avisaremos cuando te toque y podrás votar.
          </p>
        </div>
        <ul class="grid grid-cols-2 gap-2">
          @for (p of people(); track p.id) {
            <li>
              @if (p.taken) {
                <div class="flex h-full items-center justify-between gap-2 bg-pitch px-3 py-3 text-mist">
                  <span class="min-w-0">
                    <span class="block truncate font-display text-lg font-bold uppercase line-through decoration-1">{{ p.name }}</span>
                    <span class="text-xs">En otro móvil</span>
                  </span>
                  @if (session.isAdmin()) {
                    <button type="button" class="tag shrink-0 bg-line text-chalk hover:bg-raised" (click)="free(p.id, p.name)">Liberar</button>
                  }
                </div>
              } @else {
                <button
                  type="button"
                  class="w-full bg-raised px-3 py-3 text-left font-display text-lg font-bold uppercase hover:bg-line disabled:opacity-50"
                  [disabled]="busy()"
                  (click)="pick(p.id)"
                >
                  {{ p.name }}
                </button>
              }
            </li>
          }
        </ul>
        <div class="border-t border-line pt-5">
          <button type="button" class="btn-secondary w-full" (click)="session.setGuest(true)">Entrar como invitado</button>
          <p class="mt-2 text-center text-xs text-mist">Los invitados ven el torneo pero no votan ni reciben avisos.</p>
          @if (anyTaken()) {
            <p class="mt-4 text-center text-xs text-mist">
              ¿Tu nombre está en otro móvil por error? Que lo suelte desde ahí con «Cambiar», o pide al admin que lo libere.
            </p>
          }
        </div>
      </main>
    }
  `,
})
export class IdentityGate {
  protected readonly session = inject(TournamentSession);
  private readonly push = inject(PushNotifications);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  protected readonly busy = signal(false);

  protected readonly people = computed(() => {
    const claimed = this.session.claimed();
    return (this.session.tournament()?.participants ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      taken: claimed.has(p.id),
    }));
  });
  protected readonly anyTaken = computed(() => this.people().some((p) => p.taken));

  protected async pick(participantId: string): Promise<void> {
    const t = this.session.tournament();
    if (!t || this.busy()) return;
    this.busy.set(true);
    try {
      if (await this.session.claim(participantId)) {
        void this.push.follow(t.id, participantId).catch((e) => this.toast.error(e));
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected async free(participantId: string, name: string): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Liberar a ${name}`,
      message: 'El móvil que lo tiene lo pierde y cualquiera podrá elegirlo. Su voto, si lo hay, se mantiene.',
      confirmLabel: 'Liberar',
    });
    if (ok) await this.session.releaseName(participantId);
  }
}
