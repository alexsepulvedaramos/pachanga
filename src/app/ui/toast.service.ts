import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 1;

  info(text: string): void {
    this.push(text, 'info');
  }

  error(error: unknown): void {
    this.push(error instanceof Error ? error.message : String(error), 'error');
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private push(text: string, tone: Toast['tone']): void {
    const id = this.nextId++;
    this.toasts.update((list) => [...list, { id, text, tone }]);
    setTimeout(() => this.dismiss(id), tone === 'error' ? 5000 : 3000);
  }
}
