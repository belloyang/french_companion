
import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Achievement } from '../../app.component';

@Component({
  selector: 'app-achievements',
  templateUrl: './achievements.component.html',
  imports: [CommonModule],
})
export class AchievementsComponent {
  achievements = input.required<Achievement[]>();
  unlockedAchievementIds = input.required<string[]>();
  close = output<void>();

  isUnlocked(achievementId: string): boolean {
    return this.unlockedAchievementIds().includes(achievementId);
  }

  closeModal(): void {
    this.close.emit();
  }
}
