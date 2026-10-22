import { Component, computed, input } from '@angular/core';
import { Stage } from '../domain/types';

const STAGES: Record<Stage, { label: string; tone: string }> = {
  setup: { label: 'Configuración', tone: 'bg-line text-mist' },
  draw: { label: 'Sorteo', tone: 'bg-gold text-ink' },
  groups: { label: 'Liguilla', tone: 'bg-cyan text-ink' },
  knockout: { label: 'Eliminatorias', tone: 'bg-flare text-ink' },
  finished: { label: 'Terminado', tone: 'bg-volt text-ink' },
};

export function stageLabel(stage: Stage): string {
  return STAGES[stage].label;
}

@Component({
  selector: 'app-stage-badge',
  template: `<span class="tag" [class]="info().tone">{{ info().label }}</span>`,
})
export class StageBadge {
  readonly stage = input.required<Stage>();
  protected readonly info = computed(() => STAGES[this.stage()]);
}
