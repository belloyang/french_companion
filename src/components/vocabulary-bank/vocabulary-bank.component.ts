import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VocabularyItem } from '../../services/gemini.service';

@Component({
  selector: 'app-vocabulary-bank',
  templateUrl: './vocabulary-bank.component.html',
  imports: [CommonModule],
})
export class VocabularyBankComponent {
  vocabulary = input.required<VocabularyItem[]>();
  close = output<void>();

  closeModal(): void {
    this.close.emit();
  }
}
