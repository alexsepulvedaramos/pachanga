import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Brand } from '../../ui/brand';
import { TournamentStore } from '../../data/tournament-store';
import { buildDemoTournament, DEMO_PIN } from '../../data/demo';
import { ToastService } from '../../ui/toast.service';
import { ConfirmService } from '../../ui/confirm.service';

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

        @if (recent().length) {
          <div class="panel animate-rise">
            <h2 class="eyebrow text-mist">Tus torneos</h2>
            <ul class="mt-2 divide-y divide-line">
              @for (r of recent(); track r.id) {
                <li class="flex items-center gap-2">
                  <a [routerLink]="['/t', r.id]" class="flex min-w-0 flex-1 items-center justify-between gap-3 py-2.5 hover:text-volt">
                    <span class="truncate font-display text-lg font-bold uppercase">{{ r.name }}</span>
                    <span class="shrink-0 font-display text-sm tracking-widest text-mist">{{ r.id }}</span>
                  </a>
                  @if (r.owner) {
                    <button
                      type="button"
                      class="shrink-0 px-2 py-2 text-mist hover:text-flare"
                      [attr.aria-label]="'Borrar ' + r.name"
                      title="Borrar torneo"
                      (click)="remove(r.id, r.name)"
                    >
                      <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>
                    </button>
                  } @else {
                    <button
                      type="button"
                      class="shrink-0 px-2 py-2 text-mist hover:text-chalk"
                      [attr.aria-label]="'Quitar ' + r.name + ' de la lista'"
                      title="Quitar de la lista"
                      (click)="hide(r.id, r.name)"
                    >
                      ✕
                    </button>
                  }
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

  private readonly confirm = inject(ConfirmService);

  protected readonly code = signal('');
  protected readonly recent = signal(this.list());

  private list() {
    return this.store.recent().map((r) => ({ ...r, owner: this.store.isOwner(r.id) }));
  }

  /** Deletes a tournament this device created, for everyone. */
  protected async remove(id: string, name: string): Promise<void> {
    const ok = await this.confirm.ask({
      title: '¿Borrar el torneo?',
      message: `Se borrará "${name}" para todos: partidos, resultados y avisos. No se puede deshacer.`,
      confirmLabel: 'Borrar',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.store.delete(id);
      this.recent.set(this.list());
      this.toast.info('Torneo borrado.');
    } catch (error) {
      this.toast.error(error);
    }
  }

  /** Someone else's tournament: only forget it on this device. */
  protected async hide(id: string, name: string): Promise<void> {
    const ok = await this.confirm.ask({
      title: '¿Quitar de la lista?',
      message: `"${name}" desaparecerá de este móvil, pero seguirá existiendo. Puedes volver a entrar con su código.`,
      confirmLabel: 'Quitar',
    });
    if (!ok) return;
    this.store.forget(id);
    this.recent.set(this.list());
  }

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
