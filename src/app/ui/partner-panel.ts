import { Component, computed, inject } from '@angular/core';
import { TournamentSession } from '../data/tournament-session';
import { choosePartner, drawPartner, pendingPartnerChoice } from '../domain/tournament';
import { Id } from '../domain/types';

/**
 * The solo player's partner for the semi-finals on is the top scorer of the best team knocked out
 * in the repechage. When two players of that team have scored the same, the admin chooses between
 * them (they settle it among themselves) or leaves it to luck.
 */
@Component({
  selector: 'app-partner-panel',
  template: `
    @if (waiting(); as w) {
      <section class="cut animate-rise mt-6 border-l-4 border-gold bg-pitch p-5">
        <p class="eyebrow text-gold">Compañero del que va solo</p>
        <p class="heading mt-1 text-3xl">
          {{ session.personName(soloId()) }}
          <span class="text-mist">necesita pareja</span>
        </p>
        <p class="mt-1 text-sm text-mist">
          Empate a {{ w.goals }} {{ w.goals === 1 ? 'gol' : 'goles' }} entre los de {{ session.teamName(w.fromTeamId) }},
          el mejor clasificado de la liguilla entre los eliminados. Juega uno de los dos.
        </p>

        @if (session.isAdmin()) {
          <div class="mt-4 flex flex-wrap gap-2">
            @for (id of w.playerIds; track id) {
              <button type="button" class="btn-secondary" [disabled]="session.saving()" (click)="choose(id)">
                {{ session.personName(id) }}
              </button>
            }
            <button type="button" class="btn-secondary" [disabled]="session.saving()" (click)="luck()">A suertes</button>
          </div>
        } @else {
          <p class="mt-3 font-display font-bold uppercase text-mist">
            {{ names() }}: el admin decide cuál juega…
          </p>
        }
      </section>
    }
  `,
})
export class PartnerPanel {
  protected readonly session = inject(TournamentSession);

  protected readonly waiting = computed(() => {
    const t = this.session.tournament();
    return t ? pendingPartnerChoice(t) : null;
  });

  protected readonly soloId = computed(() => {
    const t = this.session.tournament();
    const teamId = this.waiting()?.teamId;
    return t?.teams.find((x) => x.id === teamId)?.memberIds.find((id) => !t.participants.find((p) => p.id === id)?.disqualified) ?? '';
  });

  protected readonly names = computed(() => (this.waiting()?.playerIds ?? []).map((id) => this.session.personName(id)).join(' o '));

  protected async choose(id: Id): Promise<void> {
    await this.session.apply((t) => choosePartner(t, id));
  }

  protected async luck(): Promise<void> {
    await this.session.apply((t, rng) => drawPartner(t, rng));
  }
}
