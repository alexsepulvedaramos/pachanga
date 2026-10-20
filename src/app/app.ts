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
    <!-- Notices drop in from the top, clear of the install banner, bottom bars and sheets. -->
    <div
      class="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[60] flex flex-col items-center gap-2 px-4"
      aria-live="polite"
    >
      @for (toast of toasts.toasts(); track toast.id) {
        <button
          type="button"
          class="cut-sm pointer-events-auto w-full max-w-md animate-drop border-l-4 px-4 py-3 text-left text-sm font-medium shadow-2xl shadow-black/60"
          [class]="toast.tone === 'error' ? 'border-ink/30 bg-flare text-ink' : 'border-volt bg-raised text-chalk'"
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
