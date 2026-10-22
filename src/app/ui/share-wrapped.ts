import { inject, Injectable, signal } from '@angular/core';
import { ClubCrests } from '../data/club-crests';
import { Tournament } from '../domain/types';
import { ToastService } from './toast.service';
import { renderWrapped, shareImage } from './wrapped';

/** Draws the night's summary picture and shares it (or downloads it). */
@Injectable({ providedIn: 'root' })
export class ShareWrapped {
  private readonly crests = inject(ClubCrests);
  private readonly toast = inject(ToastService);
  readonly busy = signal(false);

  async share(t: Tournament): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.crests.load();
      const blob = await renderWrapped(t, (club) => this.crests.urlFor(club));
      const slug = t.name.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
      const outcome = await shareImage(blob, `${slug || 'pachanga'}.png`, t.name);
      if (outcome === 'downloaded') this.toast.info('Imagen descargada: mándala al grupo.');
    } catch (error) {
      this.toast.error(error);
    } finally {
      this.busy.set(false);
    }
  }
}
