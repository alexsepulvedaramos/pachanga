import { Component, effect, ElementRef, inject, viewChild } from '@angular/core';
import { ConfirmService } from './confirm.service';

@Component({
  selector: 'app-confirm-dialog',
  host: { '(document:keydown.escape)': 'confirm.answer(false)' },
  template: `
    @if (confirm.pending(); as request) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-4 backdrop-blur-sm" (click)="confirm.answer(false)">
        <section
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-message"
          class="cut w-full max-w-sm animate-rise border-t-4 bg-raised p-5"
          [class]="request.danger ? 'border-flare' : 'border-volt'"
          (click)="$event.stopPropagation()"
        >
          <h2 id="confirm-title" class="heading text-3xl">{{ request.title }}</h2>
          <p id="confirm-message" class="mt-2 text-mist">{{ request.message }}</p>
          <div class="mt-6 flex justify-end gap-2">
            <button #cancel type="button" class="btn-secondary" (click)="confirm.answer(false)">Cancelar</button>
            <button type="button" [class]="request.danger ? 'btn-danger' : 'btn-primary'" (click)="confirm.answer(true)">
              {{ request.confirmLabel }}
            </button>
          </div>
        </section>
      </div>
    }
  `,
})
export class ConfirmDialog {
  protected readonly confirm = inject(ConfirmService);
  private readonly cancel = viewChild<ElementRef<HTMLButtonElement>>('cancel');

  constructor() {
    // Focus "Cancelar" so a stray Enter never confirms a destructive action.
    effect(() => {
      if (this.confirm.pending()) queueMicrotask(() => this.cancel()?.nativeElement.focus());
    });
  }
}
