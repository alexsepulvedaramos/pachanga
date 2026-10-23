import { Component, computed, inject, output, signal } from '@angular/core';
import { TournamentSession } from '../data/tournament-session';
import { TournamentStore } from '../data/tournament-store';
import { apartFrom, drawIsPossible, toggleApart } from '../domain/apart';
import { Modal } from './modal';

const MIN_CODE = 4;

/**
 * Hidden admin panel: who must not share a team in the wheel. It sits behind a code that only
 * this phone knows (chosen the first time) and keeps its data on this phone, never in the
 * tournament, so nobody else can see it.
 */
@Component({
  selector: 'app-apart-panel',
  imports: [Modal],
  template: `
    <app-modal heading="Sin coincidir" eyebrow="Solo para ti" (closed)="closed.emit()">
      @if (!unlocked()) {
        <form class="space-y-3" (submit)="$event.preventDefault(); enter(code.value); code.value = ''">
          <label class="block">
            <span class="eyebrow text-mist">{{ hasCode ? 'Código' : 'Elige un código para este móvil' }}</span>
            <input #code type="password" class="field mt-1 w-full" autocomplete="off" [attr.aria-label]="'Código'" />
          </label>
          @if (error()) {
            <p class="text-sm text-flare">{{ error() }}</p>
          }
          <button type="submit" class="btn-primary w-full">{{ hasCode ? 'Entrar' : 'Guardar y entrar' }}</button>
        </form>
      } @else {
        <p class="text-sm text-mist">
          Elige con quién no debe caer cada uno en la ruleta. Solo se guarda en este móvil.
        </p>
        @if (!possible()) {
          <p class="mt-3 border-l-4 border-flare bg-flare/10 p-3 text-sm text-flare">
            Ahora mismo no se pueden cumplir todas: la ruleta girará al azar, sin avisar en pantalla.
          </p>
        }
        <ul class="mt-4 space-y-3">
          @for (p of people(); track p.id) {
            <li class="bg-ink/40 p-3">
              <div class="flex items-center justify-between gap-3">
                <p class="font-medium">{{ p.name }}</p>
                <label class="flex items-center gap-2 text-xs text-mist">
                  <input type="checkbox" [checked]="noSolo().includes(p.id)" (change)="toggleSolo(p.id)" />
                  No solo
                </label>
              </div>
              <div class="mt-2 flex flex-wrap items-center gap-1.5">
                @for (other of apartFrom(p.id); track other) {
                  <button
                    type="button"
                    class="tag bg-flare/15 px-3 py-1.5 text-flare hover:bg-flare hover:text-ink"
                    [attr.aria-label]="'Quitar a ' + name(other) + ' de ' + p.name"
                    (click)="toggle(p.id, other)"
                  >
                    {{ name(other) }} ✕
                  </button>
                }
                <select
                  class="field w-auto py-1.5 text-sm"
                  [attr.aria-label]="'No juntar a ' + p.name + ' con'"
                  (change)="add(p.id, $any($event.target))"
                >
                  <option value="">+ No con…</option>
                  @for (o of people(); track o.id) {
                    @if (o.id !== p.id && !apartFrom(p.id).includes(o.id)) {
                      <option [value]="o.id">{{ o.name }}</option>
                    }
                  }
                </select>
              </div>
            </li>
          }
        </ul>
      }
    </app-modal>
  `,
})
export class ApartPanel {
  private readonly session = inject(TournamentSession);
  private readonly store = inject(TournamentStore);

  readonly closed = output<void>();

  protected readonly unlocked = signal(false);
  protected readonly error = signal('');
  protected readonly hasCode = this.store.apartCode() !== null;

  protected readonly people = computed(() =>
    (this.session.tournament()?.participants ?? []).filter((p) => !p.disqualified),
  );
  protected readonly possible = computed(() => {
    const t = this.session.tournament();
    return !t || drawIsPossible(t, this.session.drawRules());
  });

  protected readonly noSolo = this.session.noSolo;

  protected toggleSolo(id: string): void {
    const now = this.session.noSolo();
    this.session.setNoSolo(now.includes(id) ? now.filter((x) => x !== id) : [...now, id]);
  }

  protected apartFrom(id: string): string[] {
    return apartFrom(this.session.apart(), id);
  }

  protected name(id: string): string {
    return this.session.personName(id);
  }

  protected enter(code: string): void {
    const saved = this.store.apartCode();
    if (saved === null) {
      if (code.length < MIN_CODE) {
        this.error.set(`Mínimo ${MIN_CODE} caracteres.`);
        return;
      }
      this.store.setApartCode(code);
    } else if (code !== saved) {
      this.error.set('Código incorrecto.');
      return;
    }
    this.error.set('');
    this.unlocked.set(true);
  }

  protected toggle(a: string, b: string): void {
    this.session.setApart(toggleApart(this.session.apart(), a, b));
  }

  protected add(id: string, select: HTMLSelectElement): void {
    if (select.value) this.toggle(id, select.value);
    select.value = '';
  }
}
