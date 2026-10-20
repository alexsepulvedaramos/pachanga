import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Brand } from '../../ui/brand';
import { TournamentStore } from '../../data/tournament-store';
import { buildDemoTournament, DEMO_PIN } from '../../data/demo';
import { ToastService } from '../../ui/toast.service';

@Component({
  selector: 'app-home-page',
  imports: [Brand, RouterLink],
  template: `
    <main class="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-10 sm:py-16">
      <section class="animate-rise">
        <p class="eyebrow text-cyan">Torneos 2 contra 2 · una consola</p>
        <h1 class="mt-3"><app-brand size="xl" /></h1>
        <p class="mt-5 max-w-lg text-lg text-mist">
          Sorteo de parejas con ruleta, liguilla con clasificación en directo, repesca y cuadro final.
          Todo el grupo lo sigue desde el móvil y la tele.
        </p>
        <div class="mt-8 flex flex-wrap gap-3">
          <a routerLink="/nuevo" class="btn-primary text-lg">Crear torneo</a>
          <button type="button" class="btn-secondary text-lg" (click)="openDemo()">Ver demo</button>
        </div>
      </section>

      <section class="mt-14 grid gap-6 sm:grid-cols-2">
        <form class="panel animate-rise" (submit)="$event.preventDefault(); join()">
          <h2 class="eyebrow text-mist">Entrar con código</h2>
          <div class="mt-3 flex gap-2">
            <input
              class="field font-display text-xl uppercase tracking-[0.2em]"
              placeholder="K7Q2XM"
              maxlength="12"
              autocomplete="off"
              aria-label="Código del torneo"
              [value]="code()"
              (input)="code.set($any($event.target).value)"
            />
            <button type="submit" class="btn-secondary shrink-0">Ir</button>
          </div>
        </form>

        @if (recent.length) {
          <div class="panel animate-rise">
            <h2 class="eyebrow text-mist">Tus torneos</h2>
            <ul class="mt-2 divide-y divide-line">
              @for (r of recent; track r.id) {
                <li>
                  <a
                    [routerLink]="['/t', r.id]"
                    class="flex items-center justify-between py-2.5 hover:text-volt"
                  >
                    <span class="font-display text-lg font-bold uppercase">{{ r.name }}</span>
                    <span class="font-display text-sm tracking-widest text-mist">{{ r.id }}</span>
                  </a>
                </li>
              }
            </ul>
          </div>
        }
      </section>

      <footer class="mt-auto pt-16 text-sm text-mist">
        <span class="font-display font-bold uppercase tracking-widest">Pachanga</span> · Hecho para
        jugar en casa con los colegas.
      </footer>
    </main>
  `,
})
export class HomePage {
  private readonly store = inject(TournamentStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly code = signal('');
  protected readonly recent = this.store.recent();

  protected join(): void {
    const code = this.code().trim().toUpperCase();
    if (code.length < 4) {
      this.toast.error('Escribe el código del torneo.');
      return;
    }
    void this.router.navigate(['/t', code]);
  }

  protected async openDemo(): Promise<void> {
    const demo = buildDemoTournament();
    await this.store.create(demo, DEMO_PIN);
    void this.router.navigate(['/t', demo.id, 'partidos']);
  }
}
