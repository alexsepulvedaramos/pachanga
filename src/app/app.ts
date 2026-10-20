import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastService } from './ui/toast.service';
import { InstallBanner } from './ui/install-banner';
import { ConfirmDialog } from './ui/confirm-dialog';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, InstallBanner, ConfirmDialog],
  template: `
    <router-outlet />
    <app-install-banner />
    <app-confirm-dialog />
    <div
      class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      aria-live="polite"
    >
      @for (toast of toasts.toasts(); track toast.id) {
        <button
          type="button"
          class="cut-sm pointer-events-auto max-w-md animate-rise px-4 py-3 text-left text-sm font-medium"
          [class]="toast.tone === 'error' ? 'bg-flare text-ink' : 'bg-chalk text-ink'"
          (click)="toasts.dismiss(toast.id)"
        >
          {{ toast.text }}
        </button>
      }
    </div>
  `,
})
export class App {
  protected readonly toasts = inject(ToastService);
}
