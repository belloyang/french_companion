import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  effect,
  viewChild,
  ElementRef,
  afterNextRender,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { GeminiService, Message, VocabularyItem, VocabularyBankItem } from '../../services/gemini.service';
import { VocabularyBankComponent } from '../vocabulary-bank/vocabulary-bank.component';
import { ScenarioSelectionComponent, Scenario } from '../scenario-selection/scenario-selection.component';
import { LevelUpComponent } from '../level-up/level-up.component';

interface UserProgress {
  levelIndex: number;
  xp: number;
}

interface UserSettings {
  speakingRate: number; // 0.75 (slow), 1 (normal), 1.5 (fast)
}

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  imports: [CommonModule, VocabularyBankComponent, ScenarioSelectionComponent, LevelUpComponent],
})
export class ChatComponent {
  private geminiService = inject(GeminiService);
  
  messages = signal<Message[]>([]);
  isLoading = signal(true);
  error = signal<string | null>(null);
  
  // Input mode state
  chatMode = signal<'voice' | 'text'>('voice');
  textInputValue = signal('');
  
  // Voice-specific state
  isRecording = signal(false);
  isSpeaking = signal(false);

  vocabularyBank = signal<VocabularyBankItem[]>([]);
  showVocabularyBank = signal(false);
  showScenarioSelection = signal(false);
  activeScenario = signal<Scenario | null>(null);
  
  // User Progress
  userProgress = signal<UserProgress>({ levelIndex: 0, xp: 0 });
  showLevelUp = signal(false);
  justLeveledUpTo = signal<string | null>(null);

  // Settings
  userSettings = signal<UserSettings>({ speakingRate: 1 });
  showSettings = signal(false);

  chatContainer = viewChild<ElementRef<HTMLDivElement>>('chatContainer');

  private recognition: any = null;
  private frenchVoice: SpeechSynthesisVoice | null = null;
  private readonly VOCAB_STORAGE_KEY = 'french-companion-vocab-bank';
  private readonly PROGRESS_STORAGE_KEY = 'french-companion-progress';
  private readonly SETTINGS_STORAGE_KEY = 'french-companion-settings';
  private readonly srsIntervalsDays = [1, 3, 7, 14, 30, 60, 120];

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

  readonly scenarios: Scenario[] = [
    {
      icon: 'fa-utensils',
      title: 'At the Café',
      description: 'Practice ordering drinks and snacks.',
      objective: 'Your goal is to successfully order a coffee and a croissant.',
      systemInstruction: `You are a friendly but busy waiter in a Parisian café. I am a customer.
Your goal is to take my order. Start by greeting me and asking what I would like.
Respond naturally to my requests, and if I ask for the bill, provide a total.
Keep your language authentic to a café setting.
IMPORTANT: Your response MUST be a JSON object with "response", "vocabulary", and optional "pronunciationFeedback" properties as previously defined.`,
      openingPrompt: 'Start the conversation by greeting me as a waiter would.'
    },
    {
      icon: 'fa-map-location-dot',
      title: 'Asking for Directions',
      description: 'Learn to ask for and understand directions.',
      objective: 'Your goal is to find your way to the Eiffel Tower from a random location.',
      systemInstruction: `You are a helpful Parisian local, and I am a lost tourist.
I will ask you for directions to a landmark. You should provide clear, step-by-step directions in French.
Use common directional phrases (e.g., 'allez tout droit', 'tournez à gauche').
Start by asking me where I would like to go.
IMPORTANT: Your response MUST be a JSON object with "response", "vocabulary", and optional "pronunciationFeedback" properties as previously defined.`,
      openingPrompt: 'Start the conversation by asking me where I want to go.'
    },
    {
      icon: 'fa-briefcase',
      title: 'Job Interview',
      description: 'Practice answering common interview questions.',
      objective: 'Your goal is to answer 3-4 interview questions confidently.',
      systemInstruction: `You are a hiring manager for a tech company in France, and I am a job applicant.
Your task is to conduct a short interview. Ask me typical interview questions one by one, like "Parlez-moi de vous" or "Quelles sont vos plus grandes qualités?".
Keep your tone professional and encouraging.
IMPORTANT: Your response MUST be a JSON object with "response", "vocabulary", and optional "pronunciationFeedback" properties as previously defined.`,
      openingPrompt: 'Start the interview by introducing yourself and asking me to tell you about myself.'
    }
  ];

  // --- Computed Signals ---
  wordsDueForReview = computed(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Compare dates only, not times
    return this.vocabularyBank().filter(item => new Date(item.nextReviewDate) <= now)
                                .sort((a, b) => new Date(a.nextReviewDate).getTime() - new Date(b.nextReviewDate).getTime());
  });

  otherWordsInBank = computed(() => {
    const dueWordsSet = new Set(this.wordsDueForReview());
    return this.vocabularyBank().filter(item => !dueWordsSet.has(item))
                                .sort((a, b) => a.word.localeCompare(b.word));
  });

  currentLevel = computed(() => this.levels[this.userProgress().levelIndex]);

  nextLevel = computed(() => {
      const currentLevelIndex = this.userProgress().levelIndex;
      if (currentLevelIndex >= this.levels.length - 1) {
          return null;
      }
      return this.levels[currentLevelIndex + 1];
  });

  progressPercentage = computed(() => {
      const current = this.currentLevel();
      const next = this.nextLevel();
      const progress = this.userProgress();

      if (!next) return 100; // Max level

      const xpInCurrentLevel = progress.xp - current.xpThreshold;
      const xpForNextLevel = next.xpThreshold - current.xpThreshold;

      if (xpForNextLevel <= 0) return 100;

      return Math.min(100, (xpInCurrentLevel / xpForNextLevel) * 100);
  });

  // --- Component Lifecycle ---
  constructor() {
    afterNextRender(() => {
      this.initializeChat();
      this.initializeSpeechRecognition();
      this.initializeSpeechSynthesis();
      this.loadVocabularyFromStorage();
      this.loadProgressFromStorage();
      this.loadSettingsFromStorage();
    });
    
    // Auto-scroll effect
    effect(() => {
      if (this.chatContainer() && this.messages().length > 0) {
        this.scrollToBottom();
      }
    });

    // Auto-save effects
    effect(() => {
      this.saveToStorage(this.VOCAB_STORAGE_KEY, this.vocabularyBank());
    });
    effect(() => {
      this.saveToStorage(this.PROGRESS_STORAGE_KEY, this.userProgress());
    });
     effect(() => {
      this.saveToStorage(this.SETTINGS_STORAGE_KEY, this.userSettings());
    });
  }

  // --- Initialization ---
  async initializeChat(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    this.activeScenario.set(null);
    try {
      const initialMessage = await this.geminiService.getInitialMessage();
      this.messages.set([initialMessage]);
    } catch(e) {
      this.error.set('Could not start a chat session. Please check your API key and network connection.');
      console.error(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  private loadVocabularyFromStorage(): void {
    const storedData = this.loadFromStorage<VocabularyBankItem[]>(this.VOCAB_STORAGE_KEY);
    if (storedData) {
      this.vocabularyBank.set(storedData);
    }
  }

  private loadProgressFromStorage(): void {
    const storedData = this.loadFromStorage<UserProgress>(this.PROGRESS_STORAGE_KEY);
    if (storedData && storedData.levelIndex < this.levels.length) {
      this.userProgress.set(storedData);
    }
  }

  private loadSettingsFromStorage(): void {
    const storedData = this.loadFromStorage<UserSettings>(this.SETTINGS_STORAGE_KEY);
    if (storedData) {
      this.userSettings.set(storedData);
    }
  }

  initializeSpeechSynthesis(): void {
    if ('speechSynthesis' in window) {
      const setVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        this.frenchVoice = voices.find(voice => voice.lang.startsWith('fr')) || null;
      };
      
      setVoice();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = setVoice;
      }
    } else {
      console.error('Speech synthesis not supported in this browser.');
      this.error.set('Your browser does not support speech synthesis, which is required for this app.');
    }
  }
  
  initializeSpeechRecognition(): void {
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = 'fr-FR';

        this.recognition.onstart = () => this.isRecording.set(true);
        this.recognition.onend = () => this.isRecording.set(false);

        this.recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          if (transcript) {
            this.sendMessage(transcript);
          }
        };
        
        this.recognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          this.error.set(`Speech recognition error: ${event.error}. Please ensure microphone permission is granted.`);
          this.isRecording.set(false);
        };
      } else {
         throw new Error('Speech recognition not supported');
      }
    } catch (e) {
      console.error('Speech recognition not supported in this browser.');
      this.error.set('Your browser does not support voice input, which is required for this app.');
    }
  }

  // --- User Interaction Handlers ---
  toggleRecording(): void {
    if (!this.recognition) {
        this.error.set('Voice input is not available.');
        return;
    }

    if (this.isRecording()) {
      this.recognition.stop();
    } else {
      if (this.isSpeaking()) {
        window.speechSynthesis.cancel();
        this.isSpeaking.set(false);
      }
      try {
        this.recognition.start();
      } catch (e) {
        console.error("Could not start recognition:", e);
        this.error.set("Could not start voice recognition. Please try again.");
      }
    }
  }

  sendTextMessage(event: Event): void {
    event.preventDefault();
    const text = this.textInputValue().trim();
    if (text) {
      this.sendMessage(text);
      this.textInputValue.set('');
    }
  }

  onTextInput(event: Event) {
    this.textInputValue.set((event.target as HTMLInputElement).value);
  }

  toggleChatMode(): void {
    this.chatMode.update(current => (current === 'voice' ? 'text' : 'voice'));
    // Stop any ongoing speech or recording when switching modes
    if (this.isSpeaking()) {
      window.speechSynthesis.cancel();
      this.isSpeaking.set(false);
    }
    if (this.isRecording() && this.chatMode() === 'text') {
      this.recognition.stop();
    }
  }

  async sendMessage(messageText: string): Promise<void> {
    const userMessage: Message = { role: 'user', text: messageText.trim() };
    if (!userMessage.text || this.isLoading()) {
      return;
    }

    this.messages.update(current => [...current, userMessage]);
    this.addXp(1); // +1 XP for sending a message
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const { modelResponse, userFeedback } = await this.geminiService.sendMessage(userMessage.text);
      
      this.messages.update(current => {
        const newMessages = [...current];
        let lastUserMsgIndex = -1;
        for (let i = newMessages.length - 1; i >= 0; i--) {
          if (newMessages[i].role === 'user' && !newMessages[i].pronunciationFeedback) {
            lastUserMsgIndex = i;
            break;
          }
        }

        if (lastUserMsgIndex !== -1 && userFeedback) {
          newMessages[lastUserMsgIndex] = { ...newMessages[lastUserMsgIndex], pronunciationFeedback: userFeedback };
          this.addXp(userFeedback.score); // +1-5 XP for pronunciation
        }
        
        return [...newMessages, modelResponse];
      });
      
      if (this.chatMode() === 'voice') {
        this.speak(modelResponse.text);
      }
    } catch(e) {
      const errorMessage = 'Désolé, une erreur est survenue.';
      this.messages.update(current => [...current, {role: 'model', text: errorMessage}]);
      this.error.set('Failed to get a response. Please try again.');
      console.error(e);
      if (this.chatMode() === 'voice') {
        this.speak(errorMessage);
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async selectScenario(scenario: Scenario): Promise<void> {
    this.showScenarioSelection.set(false);
    this.activeScenario.set(scenario);
    this.isLoading.set(true);
    this.messages.set([]);
    this.error.set(null);

    try {
      const { modelResponse } = await this.geminiService.startNewConversation(scenario.systemInstruction, scenario.openingPrompt);
      this.messages.set([modelResponse]);
      if (this.chatMode() === 'voice') {
        this.speak(modelResponse.text);
      }
    } catch (e) {
      this.error.set('Could not start the scenario. Please try again.');
      console.error(e);
    } finally {
      this.isLoading.set(false);
    }
  }
  
  private speak(text: string): void {
    if (!('speechSynthesis' in window)) return;
    
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = this.userSettings().speakingRate;
    if (this.frenchVoice) {
      utterance.voice = this.frenchVoice;
    }
    utterance.lang = 'fr-FR';
    utterance.onstart = () => this.isSpeaking.set(true);
    utterance.onend = () => this.isSpeaking.set(false);
    utterance.onerror = (event) => {
      if (event.error === 'interrupted') {
        console.log('Speech synthesis interrupted by user action.');
      } else {
        console.error('Speech synthesis error:', event.error);
        this.error.set(`An error occurred during speech playback: ${event.error}`);
      }
      this.isSpeaking.set(false);
    };
    window.speechSynthesis.speak(utterance);
  }

  private scrollToBottom(): void {
    const container = this.chatContainer()?.nativeElement;
    if (container) {
      setTimeout(() => {
        container.scrollTop = container.scrollHeight;
      }, 0);
    }
  }

  // --- Vocabulary & SRS Logic ---
  addWordToBank(wordToAdd: VocabularyItem): void {
    this.vocabularyBank.update(currentBank => {
      if (currentBank.some(item => item.word.toLowerCase() === wordToAdd.word.toLowerCase())) {
        return currentBank;
      }

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const newItem: VocabularyBankItem = {
        ...wordToAdd,
        srsLevel: 0,
        nextReviewDate: tomorrow.toISOString().split('T')[0],
      };

      return [...currentBank, newItem];
    });
  }
  
  isWordInBank(word: VocabularyItem): boolean {
    return this.vocabularyBank().some(item => item.word.toLowerCase() === word.word.toLowerCase());
  }

  reviewWord(wordToReview: VocabularyBankItem): void {
    this.vocabularyBank.update(currentBank => {
      const wordIndex = currentBank.findIndex(item => item.word.toLowerCase() === wordToReview.word.toLowerCase());
      if (wordIndex === -1) {
        return currentBank;
      }

      const updatedWord = { ...currentBank[wordIndex] };
      updatedWord.srsLevel += 1;
      
      const interval = this.srsIntervalsDays[Math.min(updatedWord.srsLevel, this.srsIntervalsDays.length - 1)];
      
      const nextReview = new Date();
      nextReview.setHours(0, 0, 0, 0);
      nextReview.setDate(nextReview.getDate() + interval);
      updatedWord.nextReviewDate = nextReview.toISOString().split('T')[0];

      const newBank = [...currentBank];
      newBank[wordIndex] = updatedWord;
      return newBank;
    });
    this.addXp(15); // +15 XP for reviewing a word
  }

  // --- XP & Leveling Logic ---
  addXp(amount: number): void {
    const currentProgress = this.userProgress();
    const newXp = currentProgress.xp + amount;
    this.userProgress.set({ ...currentProgress, xp: newXp });

    const nextLevel = this.nextLevel();

    if (nextLevel && newXp >= nextLevel.xpThreshold) {
      const newLevelIndex = currentProgress.levelIndex + 1;
      this.userProgress.update(progress => ({ ...progress, levelIndex: newLevelIndex }));
      this.justLeveledUpTo.set(this.levels[newLevelIndex].name);
      this.showLevelUp.set(true);
    }
  }

  // --- Modal Toggles ---
  toggleVocabularyBank(): void {
    this.showVocabularyBank.update(v => !v);
  }

  toggleScenarioSelection(): void {
    this.showScenarioSelection.update(v => !v);
  }

  toggleSettings(): void {
    this.showSettings.update(v => !v);
  }

  changeSpeakingRate(rate: number): void {
    this.userSettings.update(settings => ({ ...settings, speakingRate: rate }));
    this.showSettings.set(false); // Hide panel after selection
  }

  exitScenario(): void {
    this.initializeChat();
  }

  closeLevelUpModal(): void {
    this.showLevelUp.set(false);
  }

  // --- Utility ---
  private saveToStorage(key: string, data: any): void {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error(`Failed to save to local storage (key: ${key}):`, e);
    }
  }

  private loadFromStorage<T>(key: string): T | null {
    try {
      const storedData = localStorage.getItem(key);
      if (storedData) {
        return JSON.parse(storedData) as T;
      }
    } catch (e) {
      console.error(`Failed to load from local storage (key: ${key}):`, e);
    }
    return null;
  }
}