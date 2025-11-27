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

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  imports: [CommonModule, VocabularyBankComponent, ScenarioSelectionComponent],
})
export class ChatComponent {
  private geminiService = inject(GeminiService);
  
  messages = signal<Message[]>([]);
  isLoading = signal(true);
  error = signal<string | null>(null);
  isRecording = signal(false);
  isSpeaking = signal(false);
  vocabularyBank = signal<VocabularyBankItem[]>([]);
  showVocabularyBank = signal(false);
  showScenarioSelection = signal(false);
  activeScenario = signal<Scenario | null>(null);
  
  chatContainer = viewChild<ElementRef<HTMLDivElement>>('chatContainer');

  private recognition: any = null;
  private frenchVoice: SpeechSynthesisVoice | null = null;
  private readonly STORAGE_KEY = 'french-companion-vocab-bank';
  private readonly srsIntervalsDays = [1, 3, 7, 14, 30, 60, 120];

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
IMPORTANT: Your response MUST be a JSON object with "response" and "vocabulary" properties as previously defined.`,
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
IMPORTANT: Your response MUST be a JSON object with "response" and "vocabulary" properties as previously defined.`,
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
IMPORTANT: Your response MUST be a JSON object with "response" and "vocabulary" properties as previously defined.`,
      openingPrompt: 'Start the interview by introducing yourself and asking me to tell you about myself.'
    }
  ];

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

  constructor() {
    afterNextRender(() => {
      this.initializeChat();
      this.initializeSpeechRecognition();
      this.initializeSpeechSynthesis();
      this.loadVocabularyFromStorage();
    });
    
    effect(() => {
      if (this.chatContainer() && this.messages().length > 0) {
        this.scrollToBottom();
      }
    });

    effect(() => {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.vocabularyBank()));
      } catch (e) {
        console.error('Failed to save vocabulary bank to local storage:', e);
      }
    });
  }

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
    try {
      const storedData = localStorage.getItem(this.STORAGE_KEY);
      if (storedData) {
        const parsedData = JSON.parse(storedData) as VocabularyBankItem[];
        this.vocabularyBank.set(parsedData);
      }
    } catch (e) {
      console.error('Failed to load vocabulary bank from local storage:', e);
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

  async sendMessage(messageText: string): Promise<void> {
    const userMessage = messageText.trim();
    if (!userMessage || this.isLoading()) {
      return;
    }

    this.messages.update(current => [...current, { role: 'user', text: userMessage }]);
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const aiResponse = await this.geminiService.sendMessage(userMessage);
      this.messages.update(current => [...current, aiResponse]);
      this.speak(aiResponse.text);
    } catch(e) {
      const errorMessage = 'Désolé, une erreur est survenue.';
      this.messages.update(current => [...current, {role: 'model', text: errorMessage}]);
      this.error.set('Failed to get a response. Please try again.');
      console.error(e);
      this.speak(errorMessage);
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
      const openingMessage = await this.geminiService.startNewConversation(scenario.systemInstruction, scenario.openingPrompt);
      this.messages.set([openingMessage]);
      this.speak(openingMessage.text);
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
    if (this.frenchVoice) {
      utterance.voice = this.frenchVoice;
    }
    utterance.lang = 'fr-FR';
    utterance.onstart = () => this.isSpeaking.set(true);
    utterance.onend = () => this.isSpeaking.set(false);
    utterance.onerror = (event) => {
      // The 'interrupted' error is expected when the user clicks the mic while the AI is speaking.
      // We can safely ignore it and not show an error to the user.
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
        nextReviewDate: tomorrow.toISOString().split('T')[0], // YYYY-MM-DD
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
  }

  toggleVocabularyBank(): void {
    this.showVocabularyBank.update(v => !v);
  }

  toggleScenarioSelection(): void {
    this.showScenarioSelection.update(v => !v);
  }

  exitScenario(): void {
    this.initializeChat();
  }
}