import { Component, input } from '@angular/core';

@Component({
  selector: 'app-brand',
  template: `
    <span class="inline-flex select-none items-center gap-[0.3em]" [class]="sizes[size()]">
      <img src="favicon.svg" alt="" class="h-[1.05em] w-[1.05em] shrink-0" />
      <span class="heading">Pachang<span class="text-volt">a</span></span>
    </span>
  `,
})
export class Brand {
  readonly size = input<'sm' | 'md' | 'xl'>('md');
  protected readonly sizes = { sm: 'text-xl', md: 'text-3xl', xl: 'text-6xl sm:text-8xl' };
}
