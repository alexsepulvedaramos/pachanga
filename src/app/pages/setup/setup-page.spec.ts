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
});
