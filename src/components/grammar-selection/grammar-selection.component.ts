import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface GrammarTopic {
  icon: string;
  title: string;
  description: string;
  systemInstruction: string;
  openingPrompt: string;
}

@Component({
  selector: 'app-grammar-selection',
  templateUrl: './grammar-selection.component.html',
  imports: [CommonModule],
})
export class GrammarSelectionComponent {
  grammarTopics = input.required<GrammarTopic[]>();
  select = output<GrammarTopic>();
  close = output<void>();

  onSelect(topic: GrammarTopic): void {
    this.select.emit(topic);
  }

  closeModal(): void {
    this.close.emit();
  }
}
