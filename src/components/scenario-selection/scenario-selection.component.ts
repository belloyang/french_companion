import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface Scenario {
  icon: string;
  title: string;
  description: string;
  objective: string;
  systemInstruction: string;
  openingPrompt: string;
}

@Component({
  selector: 'app-scenario-selection',
  templateUrl: './scenario-selection.component.html',
  imports: [CommonModule],
})
export class ScenarioSelectionComponent {
  scenarios = input.required<Scenario[]>();
  select = output<Scenario>();
  close = output<void>();

  onSelect(scenario: Scenario): void {
    this.select.emit(scenario);
  }

  closeModal(): void {
    this.close.emit();
  }
}
