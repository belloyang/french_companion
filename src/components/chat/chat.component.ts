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
import { GrammarSelectionComponent, GrammarTopic } from '../grammar-selection/grammar-selection.component';
import { LevelUpComponent } from '../level-up/level-up.component';

interface UserProgress {
  levelIndex: number;
  xp: number;
}

interface UserSettings {
  speakingRate: number; // 0.75 (slow), 1 (normal), 1.5 (fast)
  tutorName: string;
}

interface Tutor {
  name: string;
  avatar: string;
  description: string;
  systemInstruction: string;
  voiceName?: string;
}


@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  imports: [CommonModule, VocabularyBankComponent, ScenarioSelectionComponent, LevelUpComponent, GrammarSelectionComponent],
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

  // Modals and active states
  vocabularyBank = signal<VocabularyBankItem[]>([]);
  showVocabularyBank = signal(false);
  showScenarioSelection = signal(false);
  activeScenario = signal<Scenario | null>(null);
  showGrammarSelection = signal(false);
  activeGrammarTopic = signal<GrammarTopic | null>(null);
  
  // User Progress
  userProgress = signal<UserProgress>({ levelIndex: 0, xp: 0 });
  showLevelUp = signal(false);
  justLeveledUpTo = signal<string | null>(null);

  // Settings
  userSettings = signal<UserSettings>({ speakingRate: 1, tutorName: 'Ami' });
  showSettings = signal(false);

  chatContainer = viewChild<ElementRef<HTMLDivElement>>('chatContainer');

  private recognition: any = null;
  private frenchVoice: SpeechSynthesisVoice | null = null;
  private readonly VOCAB_STORAGE_KEY = 'french-companion-vocab-bank';
  private readonly PROGRESS_STORAGE_KEY = 'french-companion-progress';
  private readonly SETTINGS_STORAGE_KEY = 'french-companion-settings';
  private readonly srsIntervalsDays = [1, 3, 7, 14, 30, 60, 120];

  private readonly jsonInstruction = `
IMPORTANT: Your response MUST be a JSON object.
The JSON object must have the following properties:
1. "response": A string containing your conversational reply in French.
2. "vocabulary": An array of JSON objects. Each object represents a key vocabulary word from your response that would be useful for a learner. For each vocabulary word, provide "word" (French), "translation" (English), and "example" (French sentence). If no new words, use an empty array.
3. "pronunciationFeedback": (Optional) An object providing feedback on the user's pronunciation based on their most recent message. If feedback is not applicable (e.g., first message, unintelligible input), omit this property. The object must contain:
   - "score": An integer from 1 to 5, where 1 is poor and 5 is excellent.
   - "feedback": A short, constructive string explaining what was good and what could be improved.
   - "tip": A single, practical tip for improvement.`;

  readonly tutors: Tutor[] = [
    {
      name: 'Ami',
      avatar: 'https://robohash.org/ami.png?set=set2&bgset=bg1',
      description: 'A friendly and patient tutor, perfect for all levels.',
      systemInstruction: `You are a friendly, patient, and encouraging French language tutor named 'Ami'.
Your goal is to help me learn French through natural conversation.
Always respond in French unless I explicitly ask for something in English using square brackets, like [translate this].
If I make a mistake, gently correct it and explain why, but don't interrupt the conversational flow.
Keep your responses concise and appropriate for a language learner.` + this.jsonInstruction
    },
    {
      name: 'Chloé',
      avatar: 'https://robohash.org/chloe.png?set=set4&bgset=bg2',
      description: 'An energetic and cheerful tutor who makes learning fun.',
      voiceName: 'Amelie', // Common on macOS
      systemInstruction: `You are a cheerful and energetic French language tutor named 'Chloé'.
Your goal is to make learning French fun and engaging. Use modern, everyday language and maybe an emoji or two where appropriate 😉.
Always respond in French. If I make a mistake, correct it in a friendly, encouraging way.
Keep responses upbeat and not too long.` + this.jsonInstruction
    },
    {
      name: 'Marc',
      avatar: 'https://robohash.org/marc.png?set=set3&bgset=bg1',
      description: 'A formal and precise tutor, focused on grammar.',
      voiceName: 'Thomas', // Common on Windows
      systemInstruction: `You are a formal and precise French language tutor named 'Marc'.
Your goal is to help me achieve grammatical accuracy. Your tone is professional and clear.
Always respond in French. When I make a mistake, provide a detailed correction and explain the grammatical rule. Focus on precision.` + this.jsonInstruction
    },
  ];

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
      backgroundImageUrl: 'https://picsum.photos/id/225/1200/800',
      systemInstruction: `You are a friendly but busy waiter in a Parisian café. I am a customer.
Your goal is to take my order. Start by greeting me and asking what I would like.
Respond naturally to my requests, and if I ask for the bill, provide a total.
Keep your language authentic to a café setting.` + this.jsonInstruction,
      openingPrompt: 'Start the conversation by greeting me as a waiter would.'
    },
    {
      icon: 'fa-map-location-dot',
      title: 'Asking for Directions',
      description: 'Learn to ask for and understand directions.',
      objective: 'Your goal is to find your way to the Eiffel Tower from a random location.',
      backgroundImageUrl: 'https://picsum.photos/id/175/1200/800',
      systemInstruction: `You are a helpful Parisian local, and I am a lost tourist.
I will ask you for directions to a landmark. You should provide clear, step-by-step directions in French.
Use common directional phrases (e.g., 'allez tout droit', 'tournez à gauche').
Start by asking me where I would like to go.` + this.jsonInstruction,
      openingPrompt: 'Start the conversation by asking me where I want to go.'
    },
    {
      icon: 'fa-briefcase',
      title: 'Job Interview',
      description: 'Practice answering common interview questions.',
      objective: 'Your goal is to answer 3-4 interview questions confidently.',
      backgroundImageUrl: 'https://picsum.photos/id/119/1200/800',
      systemInstruction: `You are a hiring manager for a tech company in France, and I am a job applicant.
Your task is to conduct a short interview. Ask me typical interview questions one by one, like "Parlez-moi de vous" or "Quelles sont vos plus grandes qualités?".
Keep your tone professional and encouraging.` + this.jsonInstruction,
      openingPrompt: 'Start the interview by introducing yourself and asking me to tell you about myself.'
    }
  ];

  readonly grammarTopics: GrammarTopic[] = [
    {
      icon: 'fa-comments',
      title: 'Present Tense (Le Présent)',
      description: 'Practice conjugating regular and irregular verbs in the present tense.',
      systemInstruction: `You are a grammar coach. Your current topic is 'Le Présent' (the Present Tense).
Your goal is to help me master this tense. Start by giving a very brief, one-sentence explanation of its main use.
Then, give me a simple verb (like 'parler') and ask me to conjugate it for 'je'.
Wait for my response. If I'm right, praise me and give me another pronoun. If I'm wrong, gently correct me and explain the rule.
Continue this interactive exercise with a few different verbs.` + this.jsonInstruction,
      openingPrompt: `Start the grammar lesson on 'Le Présent'.`
    },
    {
      icon: 'fa-venus-mars',
      title: 'Gender of Nouns (Le Genre)',
      description: 'Learn to identify and use the correct gender for common nouns.',
      systemInstruction: `You are a grammar coach. Your topic is 'Le Genre' (Noun Genders).
Your goal is to help me practice using 'un/une' and 'le/la'.
Start by giving me a common noun (e.g., 'livre') and ask me to say it with the correct indefinite article ('un' or 'une').
Wait for my response. Correct me if I'm wrong and explain any general rules if applicable (e.g., endings like -tion are often feminine).
Continue this with a variety of nouns.` + this.jsonInstruction,
      openingPrompt: `Start the grammar lesson on 'Le Genre'.`
    },
    {
      icon: 'fa-clock-rotate-left',
      title: 'Past Tense (Le Passé Composé)',
      description: 'Practice forming the past tense with avoir and être.',
      systemInstruction: `You are a grammar coach. Your topic is 'Le Passé Composé'.
Start with a brief explanation of how it's formed with 'avoir'.
Then give me a verb (e.g., 'manger') and a pronoun (e.g., 'tu') and ask me to form the passé composé.
Wait for my response. Correct me if needed. After a few 'avoir' verbs, introduce a common 'être' verb (like 'aller') and explain the difference, including agreement.` + this.jsonInstruction,
      openingPrompt: `Start the grammar lesson on 'Le Passé Composé'.`
    }
  ];

  // --- Computed Signals ---
  activeTutor = computed(() => this.tutors.find(t => t.name === this.userSettings().tutorName) || this.tutors[0]);

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

  backgroundStyle = computed(() => {
    const scenario = this.activeScenario();
    if (scenario?.backgroundImageUrl) {
      return { 
        'background-image': `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url(${scenario.backgroundImageUrl})` 
      };
    }
    return {};
  });

  // --- Component Lifecycle ---
  constructor() {
    afterNextRender(() => {
      this.loadVocabularyFromStorage();
      this.loadProgressFromStorage();
      this.loadSettingsFromStorage();
      this.initializeSpeechRecognition();
      this.initializeSpeechSynthesis(); // Depends on settings
      this.initializeChat(); // Depends on settings
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
    this.activeGrammarTopic.set(null);
    this.messages.set([]);
    try {
      const tutor = this.activeTutor();
      const { modelResponse } = await this.geminiService.startNewConversation(tutor.systemInstruction, "Introduce yourself and ask me a simple question.");
      this.messages.set([modelResponse]);
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
        const tutor = this.activeTutor();
        // Try to find the specific voice for the tutor
        if (tutor.voiceName) {
            this.frenchVoice = voices.find(voice => voice.name === tutor.voiceName && voice.lang.startsWith('fr')) || null;
        }
        // If not found, fall back to the first available French voice
        if (!this.frenchVoice) {
            this.frenchVoice = voices.find(voice => voice.lang.startsWith('fr')) || null;
        }
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
    this.activeGrammarTopic.set(null);
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

  async selectGrammarTopic(topic: GrammarTopic): Promise<void> {
    this.showGrammarSelection.set(false);
    this.activeGrammarTopic.set(topic);
    this.activeScenario.set(null);
    this.isLoading.set(true);
    this.messages.set([]);
    this.error.set(null);

    try {
      const { modelResponse } = await this.geminiService.startNewConversation(topic.systemInstruction, topic.openingPrompt);
      this.messages.set([modelResponse]);
      if (this.chatMode() === 'voice') {
        this.speak(modelResponse.text);
      }
    } catch (e) {
      this.error.set('Could not start the grammar lesson. Please try again.');
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

  // --- Settings & Modals ---
  toggleVocabularyBank(): void {
    this.showVocabularyBank.update(v => !v);
  }

  toggleScenarioSelection(): void {
    this.showScenarioSelection.update(v => !v);
  }

  toggleGrammarSelection(): void {
    this.showGrammarSelection.update(v => !v);
  }

  toggleSettings(): void {
    this.showSettings.update(v => !v);
  }

  changeSpeakingRate(rate: number): void {
    this.userSettings.update(settings => ({ ...settings, speakingRate: rate }));
  }

  changeTutor(tutorName: string): void {
    if (this.userSettings().tutorName === tutorName) {
      this.showSettings.set(false);
      return;
    }
    this.userSettings.update(settings => ({ ...settings, tutorName }));
    this.initializeSpeechSynthesis(); // Update voice
    this.initializeChat(); // Restart conversation
    this.showSettings.set(false);
  }

  exitSpecialMode(): void {
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