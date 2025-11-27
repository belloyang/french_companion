import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VocabularyBankItem } from '../../services/gemini.service';

@Component({
  selector: 'app-vocabulary-bank',
  templateUrl: './vocabulary-bank.component.html',
  imports: [CommonModule],
})
export class VocabularyBankComponent {
  wordsForReview = input.required<VocabularyBankItem[]>();
  otherWords = input.required<VocabularyBankItem[]>();
  close = output<void>();
  review = output<VocabularyBankItem>();

  closeModal(): void {
    this.close.emit();
  }

  onReview(item: VocabularyBankItem): void {
    this.review.emit(item);
  }

  getDaysUntilReview(dateString: string): string {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const reviewDate = new Date(dateString);
    const diffTime = reviewDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'Due today';
    if (diffDays === 1) return 'Due tomorrow';
    return `Due in ${diffDays} days`;
  }
}
