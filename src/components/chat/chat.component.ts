import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  effect,
  viewChild,
  ElementRef,
  afterNextRender,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { GeminiService, Message, VocabularyItem } from '../../services/gemini.service';
import { VocabularyBankComponent } from '../vocabulary-bank/vocabulary-bank.component';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  imports: [CommonModule, VocabularyBankComponent],
})
export class ChatComponent {
  private geminiService = inject(GeminiService);
  
  messages = signal<Message[]>([]);
  userInput = signal(''); // Will hold transcribed text
  isLoading = signal(true);
  error = signal<string | null>(null);
  isRecording = signal(false);
  isSpeaking = signal(false);
  vocabularyBank = signal<VocabularyItem[]>([]);
  showVocabularyBank = signal(false);
  
  chatContainer = viewChild<ElementRef<HTMLDivElement>>('chatContainer');

  private recognition: any = null;
  private frenchVoice: SpeechSynthesisVoice | null = null;

  constructor() {
    afterNextRender(() => {
      this.initializeChat();
      this.initializeSpeechRecognition();
      this.initializeSpeechSynthesis();
    });
    
    effect(() => {
      if (this.chatContainer() && this.messages().length > 0) {
        this.scrollToBottom();
      }
    });
  }

  async initializeChat(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const initialMessage = await this.geminiService.getInitialMessage();
      this.messages.set([initialMessage]);
      // Do not speak the initial message automatically to avoid browser autoplay policy errors.
      // User interaction (tapping the mic) is required to initiate speech.
    } catch(e) {
      this.error.set('Could not start a chat session. Please check your API key and network connection.');
      console.error(e);
    } finally {
      this.isLoading.set(false);
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
            this.userInput.set(transcript);
            this.sendMessage();
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

  async sendMessage(): Promise<void> {
    const userMessage = this.userInput().trim();
    if (!userMessage || this.isLoading()) {
      return;
    }

    this.messages.update(current => [...current, { role: 'user', text: userMessage }]);
    this.userInput.set('');
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
      console.error('Speech synthesis error:', event.error);
      this.error.set(`An error occurred during speech playback.`);
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
      return [...currentBank, wordToAdd];
    });
  }
  
  isWordInBank(word: VocabularyItem): boolean {
    return this.vocabularyBank().some(item => item.word.toLowerCase() === word.word.toLowerCase());
  }

  toggleVocabularyBank(): void {
    this.showVocabularyBank.update(v => !v);
  }
}
