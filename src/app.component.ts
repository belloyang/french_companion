import { ChangeDetectionStrategy, Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatComponent, ChatInitialState } from './components/chat/chat.component';
import { SplashScreenComponent } from './components/splash-screen/splash-screen.component';
import { LandingComponent } from './components/landing/landing.component';
import { LevelUpComponent } from './components/level-up/level-up.component';
import { Scenario } from './components/scenario-selection/scenario-selection.component';
import { GrammarTopic } from './components/grammar-selection/grammar-selection.component';

interface UserProgress {
  levelIndex: number;
  xp: number;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ChatComponent, SplashScreenComponent, LandingComponent, LevelUpComponent],
})
export class AppComponent {
  appState = signal<'splash' | 'landing' | 'chat'>('splash');
  initialChatState = signal<ChatInitialState | null>(null);

  // --- User Progress State (lifted from ChatComponent) ---
  userProgress = signal<UserProgress>({ levelIndex: 0, xp: 0 });
  showLevelUp = signal(false);
  justLeveledUpTo = signal<string | null>(null);

  private readonly PROGRESS_STORAGE_KEY = 'french-companion-progress';
  private readonly levels = [
    { name: 'Beginner I', xpThreshold: 0 },
    { name: 'Beginner II', xpThreshold: 100 },
    { name: 'Beginner III', xpThreshold: 250 },
    { name: 'Intermediate I', xpThreshold: 500 },
    { name: 'Intermediate II', xpThreshold: 800 },
    { name: 'Intermediate III', xpThreshold: 1200 },
    { name: 'Advanced I', xpThreshold: 2000 },
    { name: 'Advanced II', xpThreshold: 3000 },
    { name: 'Fluent', xpThreshold: 5000 },
  ];

  currentLevel = computed(() => this.levels[this.userProgress().levelIndex]);

  nextLevel = computed(() => {
      const currentLevelIndex = this.userProgress().levelIndex;
      if (currentLevelIndex >= this.levels.length - 1) return null;
      return this.levels[currentLevelIndex + 1];
  });

  progressPercentage = computed(() => {
      const current = this.currentLevel();
      const next = this.nextLevel();
      const progress = this.userProgress();
      if (!next) return 100;
      const xpInCurrentLevel = progress.xp - current.xpThreshold;
      const xpForNextLevel = next.xpThreshold - current.xpThreshold;
      if (xpForNextLevel <= 0) return 100;
      return Math.min(100, (xpInCurrentLevel / xpForNextLevel) * 100);
  });

  // Fix: Added jsonInstruction as a static property to be used in data definitions.
  private static readonly jsonInstruction = `
IMPORTANT: Your response MUST be a JSON object.
The JSON object must have the following properties:
1. "response": A string containing your conversational reply in French.
2. "vocabulary": An array of JSON objects. Each object represents a key vocabulary word from your response that would be useful for a learner. For each vocabulary word, provide "word" (French), "translation" (English), and "example" (French sentence). If no new words, use an empty array.
3. "pronunciationFeedback": (Optional) An object providing feedback on the user's pronunciation based on their most recent message. If feedback is not applicable (e.g., first message, unintelligible input), omit this property. The object must contain:
   - "score": An integer from 1 to 5, where 1 is poor and 5 is excellent.
   - "feedback": A short, constructive string explaining what was good and what could be improved.
   - "tip": A single, practical tip for improvement.
4. "microLessonSuggestion": (Optional) If you detect that the user is making the same grammatical mistake multiple times (at least 2-3 times), suggest a micro-lesson. Do NOT suggest a lesson after only one mistake. The object must contain:
   - "topic": A string that EXACTLY matches the title of one of these available grammar topics: 'Present Tense (Le Présent)', 'Gender of Nouns (Le Genre)', 'Past Tense (Le Passé Composé)'.
   - "reason": A short, friendly string in English explaining why you're suggesting this lesson.`;

  // --- Data for child components ---
  readonly scenarios: Scenario[] = [
    {
      icon: 'fa-utensils',
      title: 'At the Café',
      description: 'Practice ordering drinks and snacks.',
      objective: 'Your goal is to successfully order a coffee and a croissant.',
      backgroundImageUrl: 'https://picsum.photos/id/225/1200/800',
      // Fix: Added missing properties systemInstruction and openingPrompt to satisfy the Scenario interface.
      systemInstruction: `You are a friendly but busy waiter in a Parisian café. I am a customer. Your goal is to take my order. Start by greeting me and asking what I would like. Respond naturally to my requests, and if I ask for the bill, provide a total. Keep your language authentic to a café setting.` + AppComponent.jsonInstruction,
      openingPrompt: 'Start the conversation by greeting me as a waiter would.',
    },
    {
      icon: 'fa-map-location-dot',
      title: 'Asking for Directions',
      description: 'Learn to ask for and understand directions.',
      objective: 'Your goal is to find your way to the Eiffel Tower from a random location.',
      backgroundImageUrl: 'https://picsum.photos/id/175/1200/800',
      // Fix: Added missing properties systemInstruction and openingPrompt to satisfy the Scenario interface.
      systemInstruction: `You are a helpful Parisian local, and I am a lost tourist. I will ask you for directions to a landmark. You should provide clear, step-by-step directions in French. Use common directional phrases (e.g., 'allez tout droit', 'tournez à gauche'). Start by asking me where I would like to go.` + AppComponent.jsonInstruction,
      openingPrompt: 'Start the conversation by asking me where I want to go.',
    },
    {
      icon: 'fa-briefcase',
      title: 'Job Interview',
      description: 'Practice answering common interview questions.',
      objective: 'Your goal is to answer 3-4 interview questions confidently.',
      backgroundImageUrl: 'https://picsum.photos/id/119/1200/800',
      // Fix: Added missing properties systemInstruction and openingPrompt to satisfy the Scenario interface.
      systemInstruction: `You are a hiring manager for a tech company in France, and I am a job applicant. Your task is to conduct a short interview. Ask me typical interview questions one by one, like "Parlez-moi de vous" or "Quelles sont vos plus grandes qualités?". Keep your tone professional and encouraging.` + AppComponent.jsonInstruction,
      openingPrompt: 'Start the interview by introducing yourself and asking me to tell you about myself.',
    }
  ];

  readonly grammarTopics: GrammarTopic[] = [
    {
      icon: 'fa-comments',
      title: 'Present Tense (Le Présent)',
      description: 'Practice conjugating regular and irregular verbs in the present tense.',
      // Fix: Added missing properties systemInstruction and openingPrompt to satisfy the GrammarTopic interface.
      systemInstruction: `You are a grammar coach. Your current topic is 'Le Présent' (the Present Tense). Your goal is to help me master this tense. Start by giving a very brief, one-sentence explanation of its main use. Then, give me a simple verb (like 'parler') and ask me to conjugate it for 'je'. Wait for my response. If I'm right, praise me and give me another pronoun. If I'm wrong, gently correct me and explain the rule. Continue this interactive exercise with a few different verbs.` + AppComponent.jsonInstruction,
      openingPrompt: `Start the grammar lesson on 'Le Présent'.`
    },
    {
      icon: 'fa-venus-mars',
      title: 'Gender of Nouns (Le Genre)',
      description: 'Learn to identify and use the correct gender for common nouns.',
      // Fix: Added missing properties systemInstruction and openingPrompt to satisfy the GrammarTopic interface.
      systemInstruction: `You are a grammar coach. Your topic is 'Le Genre' (Noun Genders). Your goal is to help me practice using 'un/une' and 'le/la'. Start by giving me a common noun (e.g., 'livre') and ask me to say it with the correct indefinite article ('un' or 'une'). Wait for my response. Correct me if I'm wrong and explain any general rules if applicable (e.g., endings like -tion are often feminine). Continue this with a variety of nouns.` + AppComponent.jsonInstruction,
      openingPrompt: `Start the grammar lesson on 'Le Genre'.`
    },
    {
      icon: 'fa-clock-rotate-left',
      title: 'Past Tense (Le Passé Composé)',
      description: 'Practice forming the past tense with avoir and être.',
      // Fix: Added missing properties systemInstruction and openingPrompt to satisfy the GrammarTopic interface.
      systemInstruction: `You are a grammar coach. Your topic is 'Le Passé Composé'. Start with a brief explanation of how it's formed with 'avoir'. Then give me a verb (e.g., 'manger') and a pronoun (e.g., 'tu') and ask me to form the passé composé. Wait for my response. Correct me if needed. After a few 'avoir' verbs, introduce a common 'être' verb (like 'aller') and explain the difference, including agreement.` + AppComponent.jsonInstruction,
      openingPrompt: `Start the grammar lesson on 'Le Passé Composé'.`
    }
  ];
  
  constructor() {
    this.loadProgressFromStorage();
  }

  onSplashAnimationDone(): void {
    this.appState.set('landing');
  }

  onStartSession(state: ChatInitialState): void {
    this.initialChatState.set(state);
    this.appState.set('chat');
  }
  
  onSessionEnded(): void {
    this.appState.set('landing');
  }

  onXpGained(amount: number): void {
    const currentProgress = this.userProgress();
    const newXp = currentProgress.xp + amount;
    this.userProgress.set({ ...currentProgress, xp: newXp });
    this.saveProgressToStorage();

    const nextLevel = this.nextLevel();
    if (nextLevel && newXp >= nextLevel.xpThreshold) {
      const newLevelIndex = currentProgress.levelIndex + 1;
      this.userProgress.update(progress => ({ ...progress, levelIndex: newLevelIndex }));
      this.saveProgressToStorage();
      this.justLeveledUpTo.set(this.levels[newLevelIndex].name);
      this.showLevelUp.set(true);
    }
  }

  closeLevelUpModal(): void {
    this.showLevelUp.set(false);
  }

  private loadProgressFromStorage(): void {
    try {
      const storedData = localStorage.getItem(this.PROGRESS_STORAGE_KEY);
      if (storedData) {
        const parsedData = JSON.parse(storedData) as UserProgress;
        if (parsedData && parsedData.levelIndex < this.levels.length) {
          this.userProgress.set(parsedData);
        }
      }
    } catch (e) {
      console.error('Failed to load progress from local storage:', e);
    }
  }

  private saveProgressToStorage(): void {
    try {
      localStorage.setItem(this.PROGRESS_STORAGE_KEY, JSON.stringify(this.userProgress()));
    } catch (e) {
      console.error('Failed to save progress to local storage:', e);
    }
  }
}
