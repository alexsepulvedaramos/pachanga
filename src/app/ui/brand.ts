import { Component, input } from '@angular/core';

@Component({
  selector: 'app-brand',
  template: `
    <span class="inline-flex select-none items-center gap-[0.3em]" [class]="sizes[size()]">
      <svg viewBox="0 0 96 96" class="h-[0.95em] w-[0.95em] shrink-0" aria-hidden="true">
        <circle cx="48" cy="48" r="40" fill="var(--color-volt)" />
        <path d="M48 26l17 12.5-6.5 20h-21L31 38.5z" fill="var(--color-ink)" />
        <path
          d="M48 10v16M65 38.5l15-5M58.5 58.5l9.5 13M37.5 58.5l-9.5 13M31 38.5l-15-5"
          stroke="var(--color-ink)"
          stroke-width="5"
        />
      </svg>
      <span class="heading">Pachang<span class="text-volt">a</span></span>
    </span>
  `,
})
export class Brand {
  readonly size = input<'sm' | 'md' | 'xl'>('md');
  protected readonly sizes = { sm: 'text-xl', md: 'text-3xl', xl: 'text-6xl sm:text-8xl' };
}
