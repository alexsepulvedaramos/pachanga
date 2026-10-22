import { DOCUMENT, inject, Injectable } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';

/**
 * Puts a new release in place without anyone having to close the installed app. The service worker
 * downloads it in the background; the app then switches to it on the next tab change, or when it
 * comes back to the screen, so nobody loses what they were typing.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdates {
  private readonly updates = inject(SwUpdate);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private ready = false;

  start(): void {
    if (!this.updates.isEnabled) return;
    this.updates.versionUpdates
      .pipe(filter((event) => event.type === 'VERSION_READY'))
      .subscribe(() => (this.ready = true));
    this.router.events.pipe(filter((event) => event instanceof NavigationStart)).subscribe((event) => {
      if (this.ready) this.document.location.assign(event.url);
    });
    this.document.addEventListener('visibilitychange', () => {
      if (this.document.visibilityState !== 'visible') return;
      if (this.ready) this.document.location.reload();
      else void this.updates.checkForUpdate().catch(() => undefined);
    });
  }
}
