import { Component, computed, inject, output } from '@angular/core';
import { TournamentSession } from '../../data/tournament-session';
import { formatGuide } from '../../domain/format-guide';
import { Modal } from '../../ui/modal';

/** The format of this tournament and its rules in plain words, for everybody to read. */
@Component({
  selector: 'app-format-info',
  imports: [Modal],
  template: `
    <app-modal heading="Formato y reglas" [eyebrow]="session.tournament()?.name ?? ''" (closed)="closed.emit()">
      <div class="space-y-6">
        @for (section of guide(); track section.title) {
          <section>
            <h3 class="eyebrow text-cyan">{{ section.title }}</h3>
            <ul class="mt-2 space-y-2">
              @for (item of section.items; track item) {
                <li class="flex gap-3 text-chalk/90">
                  <span class="mt-2 size-1.5 shrink-0 bg-volt" aria-hidden="true"></span>
                  <span>{{ item }}</span>
                </li>
              }
            </ul>
          </section>
        }
      </div>
    </app-modal>
  `,
})
export class FormatInfo {
  protected readonly session = inject(TournamentSession);
  readonly closed = output<void>();

  protected readonly guide = computed(() => {
    const t = this.session.tournament();
    return t ? formatGuide(t) : [];
  });
}
