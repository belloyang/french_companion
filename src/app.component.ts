


import { ChangeDetectionStrategy, Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatComponent, ChatInitialState, SessionStats } from './components/chat/chat.component';
import { SplashScreenComponent } from './components/splash-screen/splash-screen.component';
import { LandingComponent } from './components/landing/landing.component';
import { LevelUpComponent } from './components/level-up/level-up.component';
import { Scenario } from './components/scenario-selection/scenario-selection.component';
import { GrammarTopic } from './components/grammar-selection/grammar-selection.component';
import { AchievementsComponent } from './components/achievements/achievements.component';
import { AchievementToastComponent } from './components/achievement-toast/achievement-toast.component';

// --- Global Interfaces ---
interface UserProgress {
  levelIndex: number;
  xp: number;
  // Gamification
  lastSessionDate: string | null; // ISO Date string (YYYY-MM-DD)
  currentStreak: number;
  unlockedAchievements: string[]; // Array of achievement IDs
  stats: {
    sessionsCompleted: number;
    wordsSaved: number;
    scenariosCompleted: string[]; // Array of scenario titles
    grammarCompleted: string[];   // Array of grammar topic titles
  };
}

export interface UserSettings {
  speakingRate: number; // 0.75 (slow), 1 (normal), 1.5 (fast)
  tutorName: string;
}

export interface Tutor {
  name: string;
  avatar: string;
  description: string;
  systemInstruction: string;
  voiceName?: string;
}

export interface Achievement {
  id: string;
  title: string;
  description:string;
  icon: string;
  check: (stats: UserProgress['stats']) => boolean;
}

export interface ListeningExercise {
  icon: string;
  title: string;
  description: string;
  systemInstruction: string;
  openingPrompt: string;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ChatComponent, SplashScreenComponent, LandingComponent, LevelUpComponent, AchievementsComponent, AchievementToastComponent],
})
export class AppComponent {
  appState = signal<'splash' | 'landing' | 'chat'>('splash');
  initialChatState = signal<ChatInitialState | null>(null);

  // --- User Progress State ---
  userProgress = signal<UserProgress>({
    levelIndex: 0,
    xp: 0,
    lastSessionDate: null,
    currentStreak: 0,
    unlockedAchievements: [],
    stats: {
      sessionsCompleted: 0,
      wordsSaved: 0,
      scenariosCompleted: [],
      grammarCompleted: [],
    }
  });
  showLevelUp = signal(false);
  justLeveledUpTo = signal<string | null>(null);

  // --- User Settings State ---
  userSettings = signal<UserSettings>({ speakingRate: 1, tutorName: 'Ami' });

  // --- Gamification State ---
  showAchievements = signal(false);
  showAchievementToast = signal(false);
  justUnlockedAchievement = signal<Achievement | null>(null);

  private readonly PROGRESS_STORAGE_KEY = 'french-companion-progress';
  private readonly SETTINGS_STORAGE_KEY = 'french-companion-settings';
  
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
  readonly tutors: Tutor[] = [
    {
      name: 'Ami',
      avatar: 'https://robohash.org/ami.png?set=set2&bgset=bg1',
      description: 'A friendly and patient tutor, perfect for all levels.',
      systemInstruction: `You are a friendly, patient, and encouraging French language tutor named 'Ami'.
Your goal is to help me learn French through natural conversation.
Always respond in French unless I explicitly ask for something in English using square brackets, like [translate this].
If I make a mistake, gently correct it and explain why, but don't interrupt the conversational flow.
Keep your responses concise and appropriate for a language learner.` + AppComponent.jsonInstruction
    },
    {
      name: 'Chloé',
      avatar: 'https://robohash.org/chloe.png?set=set4&bgset=bg2',
      description: 'An energetic and cheerful tutor who makes learning fun.',
      voiceName: 'Amelie', // Common on macOS
      systemInstruction: `You are a cheerful and energetic French language tutor named 'Chloé'.
Your goal is to make learning French fun and engaging. Use modern, everyday language and maybe an emoji or two where appropriate 😉.
Always respond in French. If I make a mistake, correct it in a friendly, encouraging way.
Keep responses upbeat and not too long.` + AppComponent.jsonInstruction
    },
    {
      name: 'Marc',
      avatar: 'https://robohash.org/marc.png?set=set3&bgset=bg1',
      description: 'A formal and precise tutor, focused on grammar.',
      voiceName: 'Thomas', // Common on Windows
      systemInstruction: `You are a formal and precise French language tutor named 'Marc'.
Your goal is to help me achieve grammatical accuracy. Your tone is professional and clear.
Always respond in French. When I make a mistake, provide a detailed correction and explain the grammatical rule. Focus on precision.` + AppComponent.jsonInstruction
    },
  ];

  readonly achievements: Achievement[] = [
    { id: 'starter', title: 'Conversation Starter', description: 'Complete your first session.', icon: 'fa-comment-dots', check: stats => stats.sessionsCompleted >= 1 },
    { id: 'talkative', title: 'Talkative', description: 'Complete 10 sessions.', icon: 'fa-comments', check: stats => stats.sessionsCompleted >= 10 },
    { id: 'chatterbox', title: 'Chatterbox', description: 'Complete 50 sessions.', icon: 'fa-microphone-lines', check: stats => stats.sessionsCompleted >= 50 },
    { id: 'vocab_10', title: 'Word Collector', description: 'Save 10 vocabulary words.', icon: 'fa-book', check: stats => stats.wordsSaved >= 10 },
    { id: 'vocab_50', title: 'Polyglot', description: 'Save 50 vocabulary words.', icon: 'fa-book-bookmark', check: stats => stats.wordsSaved >= 50 },
    { id: 'vocab_100', title: 'Lexicographer', description: 'Save 100 vocabulary words.', icon: 'fa-spell-check', check: stats => stats.wordsSaved >= 100 },
    { id: 'scenario_master', title: 'Scenario Master', description: 'Complete all available scenarios.', icon: 'fa-masks-theater', check: stats => this.scenarios.every(s => stats.scenariosCompleted.includes(s.title)) },
    { id: 'grammar_master', title: 'Grammar Guru', description: 'Complete all available grammar topics.', icon: 'fa-graduation-cap', check: stats => this.grammarTopics.every(g => stats.grammarCompleted.includes(g.title)) },
  ];

  readonly scenarios: Scenario[] = [
    {
      icon: 'fa-utensils',
      title: 'At the Café',
      description: 'Practice ordering drinks and snacks.',
      objective: 'Your goal is to successfully order a coffee and a croissant.',
      backgroundImageUrl: 'https://picsum.photos/id/225/1200/800',
      systemInstruction: `You are a friendly but busy waiter in a Parisian café. I am a customer. Your goal is to take my order. Start by greeting me and asking what I would like. Respond naturally to my requests, and if I ask for the bill, provide a total. Keep your language authentic to a café setting.` + AppComponent.jsonInstruction,
      openingPrompt: 'Start the conversation by greeting me as a waiter would.',
    },
    {
      icon: 'fa-map-location-dot',
      title: 'Asking for Directions',
      description: 'Learn to ask for and understand directions.',
      objective: 'Your goal is to find your way to the Eiffel Tower from a random location.',
      backgroundImageUrl: 'https://picsum.photos/id/175/1200/800',
      systemInstruction: `You are a helpful Parisian local, and I am a lost tourist. I will ask you for directions to a landmark. You should provide clear, step-by-step directions in French. Use common directional phrases (e.g., 'allez tout droit', 'tournez à gauche'). Start by asking me where I would like to go.` + AppComponent.jsonInstruction,
      openingPrompt: 'Start the conversation by asking me where I want to go.',
    },
    {
      icon: 'fa-briefcase',
      title: 'Job Interview',
      description: 'Practice answering common interview questions.',
      objective: 'Your goal is to answer 3-4 interview questions confidently.',
      backgroundImageUrl: 'https://picsum.photos/id/119/1200/800',
      systemInstruction: `You are a hiring manager for a tech company in France, and I am a job applicant. Your task is to conduct a short interview. Ask me typical interview questions one by one, like "Parlez-moi de vous" or "Quelles sont vos plus grandes qualités?". Keep your tone professional and encouraging.` + AppComponent.jsonInstruction,
      openingPrompt: 'Start the interview by introducing yourself and asking me to tell you about myself.',
    }
  ];

  readonly grammarTopics: GrammarTopic[] = [
    {
      icon: 'fa-comments',
      title: 'Present Tense (Le Présent)',
      description: 'Practice conjugating regular and irregular verbs in the present tense.',
      systemInstruction: `You are a grammar coach. Your current topic is 'Le Présent' (the Present Tense). Your goal is to help me master this tense. Start by giving a very brief, one-sentence explanation of its main use. Then, give me a simple verb (like 'parler') and ask me to conjugate it for 'je'. Wait for my response. If I'm right, praise me and give me another pronoun. If I'm wrong, gently correct me and explain the rule. Continue this interactive exercise with a few different verbs.` + AppComponent.jsonInstruction,
      openingPrompt: `Start the grammar lesson on 'Le Présent'.`
    },
    {
      icon: 'fa-venus-mars',
      title: 'Gender of Nouns (Le Genre)',
      description: 'Learn to identify and use the correct gender for common nouns.',
      systemInstruction: `You are a grammar coach. Your topic is 'Le Genre' (Noun Genders). Your goal is to help me practice using 'un/une' and 'le/la'. Start by giving me a common noun (e.g., 'livre') and ask me to say it with the correct indefinite article ('un' or 'une'). Wait for my response. Correct me if I'm wrong and explain any general rules if applicable (e.g., endings like -tion are often feminine). Continue this with a variety of nouns.` + AppComponent.jsonInstruction,
      openingPrompt: `Start the grammar lesson on 'Le Genre'.`
    },
    {
      icon: 'fa-clock-rotate-left',
      title: 'Past Tense (Le Passé Composé)',
      description: 'Practice forming the past tense with avoir and être.',
      systemInstruction: `You are a grammar coach. Your topic is 'Le Passé Composé'. Start with a brief explanation of how it's formed with 'avoir'. Then give me a verb (e.g., 'manger') and a pronoun (e.g., 'tu') and ask me to form the passé composé. Wait for my response. Correct me if needed. After a few 'avoir' verbs, introduce a common 'être' verb (like 'aller') and explain the difference, including agreement.` + AppComponent.jsonInstruction,
      openingPrompt: `Start the grammar lesson on 'Le Passé Composé'.`
    }
  ];

  readonly listeningExercises: ListeningExercise[] = [
    {
      icon: 'fa-shopping-basket',
      title: 'At the Market',
      description: 'Listen to a conversation at a French market.',
      systemInstruction: `You are a language tutor creating a listening exercise. Your task is to generate a short monologue (3-4 sentences) in French about being at a market. Then, create 1-2 multiple-choice comprehension questions about the monologue.
      IMPORTANT: The "response" property of your JSON output must be a STRING containing another JSON object. This inner JSON object must have:
      1. "monologue": The French monologue text.
      2. "questions": An array of question objects, each with "questionText" (in French) and an array of "options", and the "correctOptionIndex".` + AppComponent.jsonInstruction,
      openingPrompt: 'Generate a listening exercise about being at a market.'
    },
    {
      icon: 'fa-cloud-sun',
      title: 'The Weather Report',
      description: 'Understand a simple weather forecast.',
      systemInstruction: `You are a language tutor creating a listening exercise. Your task is to generate a short monologue (3-4 sentences) in French, imitating a simple weather report. Then, create 1-2 multiple-choice comprehension questions about the forecast.
      IMPORTANT: The "response" property of your JSON output must be a STRING containing another JSON object. This inner JSON object must have:
      1. "monologue": The French monologue text.
      2. "questions": An array of question objects, each with "questionText" (in French) and an array of "options", and the "correctOptionIndex".` + AppComponent.jsonInstruction,
      openingPrompt: 'Generate a listening exercise about the weather.'
    }
  ];
  
  constructor() {
    this.loadProgressFromStorage();
    this.loadSettingsFromStorage();
    this.checkDailyStreak();
  }

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

  onSplashAnimationDone(): void {
    this.appState.set('landing');
  }

  onStartSession(state: ChatInitialState): void {
    const tutor = this.tutors.find(t => t.name === this.userSettings().tutorName);
    const stateWithTutor = { ...state, tutor: tutor || this.tutors[0] };
    this.initialChatState.set(stateWithTutor);
    this.appState.set('chat');
  }
  
  onSessionEnded(sessionStats: SessionStats): void {
    this.updateProgress(sessionStats);
    this.appState.set('landing');
  }

  onXpGained(amount: number): void {
    const currentProgress = this.userProgress();
    const newXp = currentProgress.xp + amount;
    this.userProgress.update(p => ({ ...p, xp: newXp }));

    const nextLevel = this.nextLevel();
    if (nextLevel && newXp >= nextLevel.xpThreshold) {
      const newLevelIndex = currentProgress.levelIndex + 1;
      this.userProgress.update(p => ({ ...p, levelIndex: newLevelIndex }));
      this.justLeveledUpTo.set(this.levels[newLevelIndex].name);
      this.showLevelUp.set(true);
    }
     this.saveProgressToStorage();
  }

  onSettingsChanged(newSettings: UserSettings): void {
    this.userSettings.set(newSettings);
    this.saveSettingsToStorage();
  }

  closeLevelUpModal(): void {
    this.showLevelUp.set(false);
  }

  openAchievementsModal(): void {
    this.showAchievements.set(true);
  }

  closeAchievementsModal(): void {
    this.showAchievements.set(false);
  }

  closeAchievementToast(): void {
    this.showAchievementToast.set(false);
  }

  private updateProgress(sessionStats: SessionStats): void {
    this.userProgress.update(p => {
      const newStats = { ...p.stats };
      newStats.sessionsCompleted += 1;
      newStats.wordsSaved += sessionStats.wordsSaved;
      
      if(sessionStats.scenarioCompleted) {
        if(!newStats.scenariosCompleted.includes(sessionStats.scenarioCompleted)) {
          newStats.scenariosCompleted.push(sessionStats.scenarioCompleted);
        }
      }
      if(sessionStats.grammarCompleted) {
         if(!newStats.grammarCompleted.includes(sessionStats.grammarCompleted)) {
          newStats.grammarCompleted.push(sessionStats.grammarCompleted);
        }
      }

      return { ...p, stats: newStats };
    });

    this.checkAchievements();
    this.saveProgressToStorage();
  }

  private checkAchievements(): void {
    const unlockedSoFar = new Set(this.userProgress().unlockedAchievements);
    
    for (const achievement of this.achievements) {
      if (!unlockedSoFar.has(achievement.id)) {
        if (achievement.check(this.userProgress().stats)) {
          this.userProgress.update(p => ({
            ...p,
            unlockedAchievements: [...p.unlockedAchievements, achievement.id]
          }));
          this.justUnlockedAchievement.set(achievement);
          this.showAchievementToast.set(true);
        }
      }
    }
  }
  
  private checkDailyStreak(): void {
    const today = new Date().toISOString().split('T')[0];
    const lastSession = this.userProgress().lastSessionDate;

    if (lastSession === today) {
      return;
    }
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    this.userProgress.update(p => {
      let newStreak = p.currentStreak;
      if (lastSession === yesterdayStr) {
        newStreak += 1;
      } else {
        newStreak = 1;
      }
      return { ...p, currentStreak: newStreak, lastSessionDate: today };
    });
    this.saveProgressToStorage();
  }

  private loadProgressFromStorage(): void {
    try {
      const storedData = localStorage.getItem(this.PROGRESS_STORAGE_KEY);
      if (storedData) {
        const parsedData = JSON.parse(storedData) as UserProgress;
        if (parsedData && typeof parsedData.levelIndex === 'number') {
          const defaultProgress = {
              levelIndex: 0, xp: 0, lastSessionDate: null, currentStreak: 0,
              unlockedAchievements: [],
              stats: { sessionsCompleted: 0, wordsSaved: 0, scenariosCompleted: [], grammarCompleted: [] }
          };
          const mergedProgress = { ...defaultProgress, ...parsedData };
          mergedProgress.stats = { ...defaultProgress.stats, ...(parsedData.stats || {}) };
          this.userProgress.set(mergedProgress);
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

  private loadSettingsFromStorage(): void {
    try {
      const storedData = localStorage.getItem(this.SETTINGS_STORAGE_KEY);
      if (storedData) {
        this.userSettings.set(JSON.parse(storedData));
      }
    } catch(e) {
      console.error('Failed to load settings from local storage:', e);
    }
  }

  private saveSettingsToStorage(): void {
    try {
      localStorage.setItem(this.SETTINGS_STORAGE_KEY, JSON.stringify(this.userSettings()));
    } catch(e) {
      console.error('Failed to save settings to local storage:', e);
    }
  }
}