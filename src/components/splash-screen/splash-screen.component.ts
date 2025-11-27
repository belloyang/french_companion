import { Component, ChangeDetectionStrategy, output, signal, afterNextRender } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-splash-screen',
  templateUrl: './splash-screen.component.html',
  imports: [CommonModule],
})
export class SplashScreenComponent {
  animationDone = output<void>();

  animationState = signal<'fading-in' | 'visible' | 'fading-out'>('fading-in');

  constructor() {
    afterNextRender(() => {
      // This ensures the initial state is rendered before we start transitions.
      setTimeout(() => {
        this.animationState.set('visible');
        
        // Wait for 2 seconds then start fading out
        setTimeout(() => {
          this.animationState.set('fading-out');

          // After the fade-out transition (500ms), emit done
          setTimeout(() => {
            this.animationDone.emit();
          }, 500);
        }, 2000);
      }, 100);
    });
  }
}
