import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { SetupPage } from './setup-page';
import { LocalTournamentRepository } from '../../data/local-tournament-repository';

describe('SetupPage', () => {
  it('adds each typed name and clears the field, even before a re-render', async () => {
    TestBed.configureTestingModule({
      imports: [SetupPage],
      providers: [provideRouter([]), LocalTournamentRepository],
    });
    const fixture = TestBed.createComponent(SetupPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('input[aria-label="Nombre del participante"]')!;
    const form = input.closest('form')!;

    // Type and submit several names back to back without waiting for change detection.
    for (const name of ['Guille', 'Miguel', 'Alex']) {
      input.value = name;
      input.dispatchEvent(new Event('input'));
      form.dispatchEvent(new Event('submit'));
    }
    await fixture.whenStable();

    expect(input.value).toBe('');
    const chips = [...el.querySelectorAll('ul li span.font-medium')].map((s) => s.textContent?.trim());
    expect(chips).toEqual(['Guille', 'Miguel', 'Alex']);
  });

  describe('draft', () => {
    const setup = async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [SetupPage],
        providers: [provideRouter([]), LocalTournamentRepository],
      });
      const fixture = TestBed.createComponent(SetupPage);
      await fixture.whenStable();
      return fixture;
    };

    it('keeps what was typed when the page is reopened', async () => {
      localStorage.removeItem('pachanga:setup-draft');
      const first = await setup();
      const el = first.nativeElement as HTMLElement;
      const name = el.querySelector<HTMLInputElement>('input[aria-label="Nombre del torneo"]')!;
      name.value = 'Sábado';
      name.dispatchEvent(new Event('input'));
      const input = el.querySelector<HTMLInputElement>('input[aria-label="Nombre del participante"]')!;
      input.value = 'Guille';
      input.dispatchEvent(new Event('input'));
      input.closest('form')!.dispatchEvent(new Event('submit'));
      await first.whenStable();
      first.destroy();

      const second = await setup();
      const again = second.nativeElement as HTMLElement;
      expect(again.querySelector<HTMLInputElement>('input[aria-label="Nombre del torneo"]')!.value).toBe('Sábado');
      expect(again.textContent).toContain('Guille');
      expect(again.textContent).toContain('Empezar de cero');
      localStorage.removeItem('pachanga:setup-draft');
    });
  });
});
