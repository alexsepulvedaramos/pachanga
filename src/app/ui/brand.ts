import { Component, input } from '@angular/core';

@Component({
  selector: 'app-brand',
  template: `
    <span class="heading select-none" [class]="sizes[size()]">
      P<span class="text-volt">0</span>PPER <span class="text-volt">CUP</span>
    </span>
  `,
})
export class Brand {
  readonly size = input<'sm' | 'md' | 'xl'>('md');
  protected readonly sizes = { sm: 'text-xl', md: 'text-3xl', xl: 'text-6xl sm:text-8xl' };
}
