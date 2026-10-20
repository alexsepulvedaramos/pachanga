import { Component, computed, inject, input } from '@angular/core';
import { ToastService } from './toast.service';
import { whatsappUrl } from '../domain/share-text';

/** WhatsApp, the phone's share sheet (when there is one) and copy, for a text with a link. */
@Component({
  selector: 'app-share-buttons',
  template: `
    <div class="flex flex-wrap gap-2" [class.justify-center]="center()">
      <a class="btn-primary gap-2 !bg-[#25d366] !text-ink" [href]="whatsapp()" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" class="size-5 fill-current" aria-hidden="true">
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.8-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/>
        </svg>
        WhatsApp
      </a>
      @if (canShare) {
        <button type="button" class="btn-secondary" (click)="shareNative()">Compartir…</button>
      }
      <button type="button" class="btn-secondary" (click)="copy()">Copiar enlace</button>
    </div>
  `,
})
export class ShareButtons {
  private readonly toast = inject(ToastService);

  readonly text = input.required<string>();
  readonly url = input.required<string>();
  readonly title = input('Pachanga');
  readonly center = input(false);

  protected readonly canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  protected readonly whatsapp = computed(() => whatsappUrl(this.text()));

  protected async shareNative(): Promise<void> {
    try {
      // The link is already in the text; passing it twice makes some apps repeat it.
      await navigator.share({ title: this.title(), text: this.text() });
    } catch {
      // Closed without sharing.
    }
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.url());
      this.toast.info('Enlace copiado.');
    } catch {
      this.toast.info(this.url());
    }
  }
}
