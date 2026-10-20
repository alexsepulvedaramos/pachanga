import { computed, DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Id, Tournament } from '../domain/types';
import { Rng } from '../domain/rng';
import { TournamentStore } from './tournament-store';
import { ConflictError, WrongPinError } from './tournament-repository';
import { ToastService } from '../ui/toast.service';

/** One open tournament: live state, admin rights and the actions that change it. */
@Injectable()
export class TournamentSession {
  private readonly store = inject(TournamentStore);
  private readonly toast = inject(ToastService);
  private stopWatching: (() => void) | null = null;
  private version = 0;

  readonly tournament = signal<Tournament | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly pin = signal<string | null>(null);
  readonly isAdmin = computed(() => this.pin() !== null);

  readonly teams = computed(() => new Map((this.tournament()?.teams ?? []).map((t) => [t.id, t])));
  readonly people = computed(
    () => new Map((this.tournament()?.participants ?? []).map((p) => [p.id, p])),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopWatching?.());
  }

  async open(id: string): Promise<void> {
    this.stopWatching?.();
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const stored = await this.store.load(id);
      this.version = stored.version;
      this.tournament.set(stored.tournament);
      this.pin.set(this.store.savedPin(id));
      this.stopWatching = (await this.store.repo(id)).watch(id, (next) => {
        if (next.version <= this.version) return;
        this.version = next.version;
        this.tournament.set(next.tournament);
      });
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.loading.set(false);
    }
  }

  async unlock(pin: string): Promise<boolean> {
    const t = this.tournament();
    if (!t) return false;
    const ok = await (await this.store.repo(t.id)).verifyPin(t.id, pin);
    if (ok) {
      this.store.rememberPin(t.id, pin);
      this.pin.set(pin);
    }
    return ok;
  }

  lock(): void {
    const t = this.tournament();
    if (t) this.store.forgetPin(t.id);
    this.pin.set(null);
  }

  /** Applies a domain action locally, then persists it. Rolls back if the save fails. */
  async apply(action: (t: Tournament, rng: Rng) => Tournament): Promise<boolean> {
    const current = this.tournament();
    const pin = this.pin();
    if (!current || !pin) {
      this.toast.error('Desbloquea el modo admin para hacer cambios.');
      return false;
    }
    let next: Tournament;
    try {
      next = action(current, Math.random);
    } catch (error) {
      this.toast.error(error);
      return false;
    }
    this.tournament.set(next);
    this.saving.set(true);
    try {
      const stored = await (await this.store.repo(next.id)).save(next, pin, this.version);
      this.version = stored.version;
      return true;
    } catch (error) {
      this.toast.error(error);
      if (error instanceof WrongPinError) this.lock();
      if (error instanceof ConflictError) {
        const fresh = await this.store.load(next.id);
        this.version = fresh.version;
        this.tournament.set(fresh.tournament);
      } else {
        this.tournament.set(current);
      }
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  teamName(id: Id): string {
    return this.teams().get(id)?.club ?? '—';
  }

  personName(id: Id): string {
    return this.people().get(id)?.name ?? '—';
  }

  memberNames(teamId: Id): string[] {
    const team = this.teams().get(teamId);
    return team ? team.memberIds.map((id) => this.personName(id)) : [];
  }
}
