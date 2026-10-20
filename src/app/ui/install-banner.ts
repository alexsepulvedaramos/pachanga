import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';

/** Chrome's install prompt event (not in the DOM typings). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'pachanga:install-dismissed';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Bottom banner inviting people to install the app: the browser's own prompt where there is one
 * (Android, desktop Chrome), and Add to Home Screen instructions on iPhone and iPad.
 */
@Component({
  selector: 'app-install-banner',
  template: `
    @if (visible()) {
      <aside
        class="cut fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-md animate-rise items-center gap-3 border-l-4 border-volt bg-raised p-3 shadow-2xl shadow-black/60"
        aria-label="Instalar Pachanga"
      >
        <img src="icons/icon-96x96.png" alt="" class="size-11 shrink-0" />
        <div class="min-w-0 flex-1">
          <p class="font-display text-lg font-extrabold uppercase italic leading-tight">Instala Pachanga</p>
          @if (ios()) {
            <p class="text-xs text-mist">
              Pulsa <span class="font-semibold text-chalk">Compartir</span> y luego
              <span class="font-semibold text-chalk">Añadir a pantalla de inicio</span>.
            </p>
          } @else {
            <p class="text-xs text-mist">Ábrela como una app, a pantalla completa.</p>
          }
        </div>
        @if (!ios()) {
          <button type="button" class="btn-primary shrink-0 px-4 py-2 text-sm" (click)="install()">Instalar</button>
        }
        <button type="button" class="shrink-0 px-1 text-mist hover:text-chalk" aria-label="Ahora no" (click)="dismiss()">✕</button>
      </aside>
    }
  `,
})
export class InstallBanner {
  private readonly router = inject(Router);
  private deferred: BeforeInstallPromptEvent | null = null;

  private readonly available = signal(false);
  private readonly url = signal(this.router.url);
  protected readonly ios = signal(false);

  /** Hidden on screens with their own bottom bar, and in TV mode. */
  protected readonly visible = computed(
    () => this.available() && !/^\/nuevo|\/tv$/.test(this.url()),
  );

  constructor() {
    if (this.installed() || this.snoozed()) return;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      this.deferred = event as BeforeInstallPromptEvent;
      this.available.set(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    const onInstalled = () => this.available.set(false);
    window.addEventListener('appinstalled', onInstalled);

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isIos) {
      this.ios.set(true);
      timer = setTimeout(() => this.available.set(true), 4000);
    }

    const sub = this.router.events.subscribe((e) => {
      if (e instanceof NavigationEnd) this.url.set(e.urlAfterRedirects);
    });
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      clearTimeout(timer);
      sub.unsubscribe();
    });
  }

  protected async install(): Promise<void> {
    if (!this.deferred) return;
    await this.deferred.prompt();
    await this.deferred.userChoice;
    this.deferred = null;
    this.available.set(false);
  }

  protected dismiss(): void {
    this.available.set(false);
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      /* the banner simply comes back next visit */
    }
  }

  private installed(): boolean {
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    return standalone || matchMedia('(display-mode: standalone)').matches;
  }

  private snoozed(): boolean {
    try {
      return Date.now() - Number(localStorage.getItem(DISMISSED_KEY) ?? 0) < SNOOZE_MS;
    } catch {
      return false;
    }
  }
}
