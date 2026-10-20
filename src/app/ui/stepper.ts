import { Component, input, model } from '@angular/core';

@Component({
  selector: 'app-stepper',
  template: `
    <div class="flex items-center gap-1">
      <button
        type="button"
        class="slant-sm h-12 w-11 bg-raised font-display text-2xl font-bold text-mist hover:text-chalk disabled:opacity-30"
        [disabled]="value() <= 0"
        [attr.aria-label]="'Restar ' + label()"
        (click)="value.set(value() - 1)"
      >
        −
      </button>
      <span class="heading w-14 text-center text-5xl tabular-nums" [attr.aria-label]="label()">{{ value() }}</span>
      <button
        type="button"
        class="slant-sm h-12 w-11 bg-raised font-display text-2xl font-bold text-volt hover:bg-line"
        [attr.aria-label]="'Sumar ' + label()"
        (click)="value.set(value() + 1)"
      >
        +
      </button>
    </div>
  `,
})
export class Stepper {
  readonly value = model(0);
  readonly label = input('');
}
