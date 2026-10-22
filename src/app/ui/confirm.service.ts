import { Injectable, signal } from '@angular/core';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  /** Label of the other choice, "Cancelar" unless given. */
  cancelLabel?: string;
  /** Destructive actions get the red button. */
  danger?: boolean;
}

interface Pending extends ConfirmRequest {
  resolve: (ok: boolean) => void;
}

/** In-app confirmation dialog: `await confirm.ask({...})` resolves true when confirmed. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly pending = signal<Pending | null>(null);

  ask(request: ConfirmRequest): Promise<boolean> {
    this.pending()?.resolve(false);
    return new Promise((resolve) => this.pending.set({ ...request, resolve }));
  }

  answer(ok: boolean): void {
    const pending = this.pending();
    this.pending.set(null);
    pending?.resolve(ok);
  }
}
