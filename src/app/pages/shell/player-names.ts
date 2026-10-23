import { Component, computed, inject, output } from '@angular/core';
import { TournamentSession } from '../../data/tournament-session';
import { renameParticipant } from '../../domain/tournament';
import { Modal } from '../../ui/modal';

/** Admin sheet to fix a typo or give someone their nickname, at any point of the tournament. */
@Component({
  selector: 'app-player-names',
  imports: [Modal],
  template: `
    <app-modal heading="Nombres" eyebrow="Jugadores" (closed)="closed.emit()">
      <p class="text-sm text-mist">Cambia el nombre de quien haga falta: se actualiza en todas las pantallas.</p>
      <ul class="mt-4 space-y-2">
        @for (p of people(); track p.id) {
          <li>
            <form class="flex gap-2" (submit)="$event.preventDefault(); save(p.id, p.name, input.value)">
              <input
                #input
                class="field min-w-0 flex-1 py-1.5"
                [class.line-through]="p.disqualified"
                [value]="p.name"
                [attr.aria-label]="'Nombre de ' + p.name"
                autocomplete="off"
              />
              <button type="submit" class="tag bg-line px-3 text-chalk hover:bg-raised" [disabled]="session.saving()">Guardar</button>
            </form>
          </li>
        }
      </ul>
    </app-modal>
  `,
})
export class PlayerNames {
  protected readonly session = inject(TournamentSession);
  readonly closed = output<void>();

  protected readonly people = computed(() => this.session.tournament()?.participants ?? []);

  protected async save(id: string, current: string, name: string): Promise<void> {
    if (name.trim() === current) return;
    await this.session.apply((t) => renameParticipant(t, id, name));
  }
}
