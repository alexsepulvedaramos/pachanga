import { Component, input, OnDestroy, OnInit, output } from '@angular/core';

/**
 * Sheet over the page: slides up from the bottom on phones, centred on wider screens. Closes with
 * the ✕, a tap outside or Escape; the page behind doesn't scroll while it's open.
 */
@Component({
  selector: 'app-modal',
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div
      class="fixed inset-0 z-50 flex items-end justify-center bg-ink/85 backdrop-blur-sm sm:items-center sm:p-6"
      (click)="closed.emit()"
    >
      <div
        class="max-h-[92dvh] w-full max-w-xl animate-rise overflow-y-auto border-t-4 border-volt bg-pitch shadow-2xl"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="label() || heading()"
        (click)="$event.stopPropagation()"
      >
        <div class="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-pitch px-5 py-3">
          <div class="min-w-0">
            @if (eyebrow()) {
              <p class="eyebrow text-cyan">{{ eyebrow() }}</p>
            }
            <p class="heading truncate text-2xl">{{ heading() }}</p>
          </div>
          <button type="button" class="px-2 text-2xl text-mist hover:text-chalk" aria-label="Cerrar" (click)="closed.emit()">✕</button>
        </div>
        <div class="p-5">
          <ng-content />
        </div>
      </div>
    </div>
  `,
})
export class Modal implements OnInit, OnDestroy {
  readonly heading = input.required<string>();
  readonly eyebrow = input('');
  readonly label = input('');
  readonly closed = output<void>();

  ngOnInit(): void {
    document.body.style.overflow = 'hidden';
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
  }
}
