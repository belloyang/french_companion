



import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Scenario } from '../scenario-selection/scenario-selection.component';
import { GrammarTopic } from '../grammar-selection/grammar-selection.component';
import { ChatInitialState } from '../chat/chat.component';
import { ListeningExercise, Tutor, UserSettings } from '../../app.component';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  imports: [CommonModule],
})
export class LandingComponent {
  scenarios = input.required<Scenario[]>();
  grammarTopics = input.required<GrammarTopic[]>();
  listeningExercises = input.required<ListeningExercise[]>();
  userProgress = input.required<any>();
  currentLevel = input.required<any>();
  nextLevel = input.required<any | null>();
  progressPercentage = input.required<number>();
  currentStreak = input.required<number>();
  tutors = input.required<Tutor[]>();
  userSettings = input.required<UserSettings>();

  startSession = output<ChatInitialState>();
  viewAchievements = output<void>();
  settingsChanged = output<UserSettings>();

  activeTutor = computed(() => {
    const tutors = this.tutors();
    const settings = this.userSettings();
    // The || tutors[0] is a safeguard against invalid stored settings
    return tutors.find(t => t.name === settings.tutorName) || tutors[0];
  });

  onStartFreeTalk(): void {
    this.startSession.emit({ type: 'free-talk' } as ChatInitialState);
  }

  onStartScenario(scenario: Scenario): void {
    this.startSession.emit({ type: 'scenario', data: scenario });
  }

  onStartGrammar(topic: GrammarTopic): void {
    this.startSession.emit({ type: 'grammar', data: topic });
  }

  onStartListening(exercise: ListeningExercise): void {
    this.startSession.emit({ type: 'listening', data: exercise });
  }

  onViewAchievements(): void {
    this.viewAchievements.emit();
  }

  changeTutor(tutorName: string): void {
    if (this.userSettings().tutorName === tutorName) return;
    this.settingsChanged.emit({ ...this.userSettings(), tutorName });
  }

  changeSpeakingRate(rate: number): void {
    this.settingsChanged.emit({ ...this.userSettings(), speakingRate: rate });
  }
}