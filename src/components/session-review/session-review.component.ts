import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SessionReview, VocabularyItem } from '../../services/gemini.service';

@Component({
  selector: 'app-session-review',
  templateUrl: './session-review.component.html',
  imports: [CommonModule],
})
export class SessionReviewComponent {
  isLoading = input.required<boolean>();
  reviewData = input.required<SessionReview | null>();
  unsavedWords = input.required<VocabularyItem[]>();

  close = output<void>();
  saveAll = output<void>();

  readonly circumference = 2 * Math.PI * 28; // Corresponds to r="28" in the SVG

  calculateScoreOffset(score: number): number {
    if (score < 0) score = 0;
    if (score > 100) score = 100;
    return this.circumference - (score / 100) * this.circumference;
  }

  onClose(): void {
    this.close.emit();
  }

  onSaveAll(): void {
    this.saveAll.emit();
  }
}
