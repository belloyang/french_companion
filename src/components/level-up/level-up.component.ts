import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';

@Component({
  selector: 'app-level-up',
  templateUrl: './level-up.component.html',
})
export class LevelUpComponent {
  newLevelName = input.required<string>();
  close = output<void>();

  closeModal(): void {
    this.close.emit();
  }
}
