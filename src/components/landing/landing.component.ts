import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Scenario } from '../scenario-selection/scenario-selection.component';
import { GrammarTopic } from '../grammar-selection/grammar-selection.component';
import { ChatInitialState } from '../chat/chat.component';
import { ListeningExercise } from '../../app.component';

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

  startSession = output<ChatInitialState>();

  onStartFreeTalk(): void {
    this.startSession.emit({ type: 'free-talk' });
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
}
