import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatComponent } from './components/chat/chat.component';
import { SplashScreenComponent } from './components/splash-screen/splash-screen.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ChatComponent, SplashScreenComponent],
})
export class AppComponent {
  showSplash = signal(true);

  onSplashAnimationDone(): void {
    this.showSplash.set(false);
  }
}
