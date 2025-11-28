
import { Component, ChangeDetectionStrategy, input, output, afterNextRender } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Achievement } from '../../app.component';

@Component({
  selector: 'app-achievement-toast',
  templateUrl: './achievement-toast.component.html',
  imports: [CommonModule],
})
export class AchievementToastComponent {
  achievement = input.required<Achievement>();
  close = output<void>();

  constructor() {
    afterNextRender(() => {
      setTimeout(() => {
        this.close.emit();
      }, 4000); // Automatically close after 4 seconds
    });
  }

  closeToast(): void {
    this.close.emit();
  }
}
