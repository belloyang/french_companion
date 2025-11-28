


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
  input,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { GeminiService, Message, VocabularyItem, VocabularyBankItem, SessionReview, MicroLessonSuggestion, ListeningContent } from '../../services/gemini.service';
import { VocabularyBankComponent } from '../vocabulary-bank/vocabulary-bank.component';
import { Scenario } from '../scenario-selection/scenario-selection.component';
import { GrammarTopic } from '../grammar-selection/grammar-selection.component';
import { LevelUpComponent } from '../level-up/level-up.component';
import { SessionReviewComponent } from '../session-review/session-review.component';
import { Content } from '@google/genai';
import { ListeningExercise, Tutor, UserSettings } from '../../app.component';

export type ChatInitialState = 
  (
    | { type: 'free-talk' }
    | { type: 'scenario', data: Scenario }
    | { type: 'grammar', data: GrammarTopic }
    | { type: 'listening', data: ListeningExercise }
  ) & { tutor: Tutor };


export interface SessionStats {
  wordsSaved: number;
  scenarioCompleted: string | null;
  grammarCompleted: string | null;
}

interface SavedConversationState {
  messages: Message[];
  history: Content[];
}

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  imports: [CommonModule, VocabularyBankComponent, LevelUpComponent, SessionReviewComponent],
})
export class ChatComponent {
  // --- Inputs / Outputs ---
  initialState = input.required<ChatInitialState>();
  userSettings = input.required<UserSettings>();
  tutors = input.required<Tutor[]>();
  sessionEnded = output<SessionStats>();
  xpGained = output<number>();

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
  activeScenario = signal<Scenario | null>(null);
  activeGrammarTopic = signal<GrammarTopic | null>(null);
  
  // Session Review State
  showSessionReview = signal(false);
  isReviewLoading = signal(false);
  sessionReviewData = signal<SessionReview | null>(null);
  unsavedWordsFromSession = signal<VocabularyItem[]>([]);

  // Micro-Lesson State
  microLessonSuggestion = signal<MicroLessonSuggestion | null>(null);
  activeMicroLesson = signal<string | null>(null);
  savedConversationState = signal<SavedConversationState | null>(null);

  // Listening Exercise State
  activeListeningExercise = signal<ListeningContent | null>(null);
  listeningState = signal<'listening' | 'revealed' | 'answered' | 'done'>('listening');
  selectedAnswers = signal<Map<number, number>>(new Map());

  // Session Stats for Gamification
  private sessionStats: SessionStats = { wordsSaved: 0, scenarioCompleted: null, grammarCompleted: null };

  chatContainer = viewChild<ElementRef<HTMLDivElement>>('chatContainer');

  private recognition: any = null;
  public frenchVoice: SpeechSynthesisVoice | null = null;
  private readonly VOCAB_STORAGE_KEY = 'french-companion-vocab-bank';
  private readonly srsIntervalsDays = [1, 3, 7, 14, 30, 60, 120];

  private readonly jsonInstruction = `
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

  private readonly grammarTopicsData: { title: string, systemInstruction: string, openingPrompt: string }[] = [
    {
      title: 'Present Tense (Le Présent)',
      systemInstruction: `You are a grammar coach. Your current topic is 'Le Présent' (the Present Tense). Your goal is to help me master this tense. Start by giving a very brief, one-sentence explanation of its main use. Then, give me a simple verb (like 'parler') and ask me to conjugate it for 'je'. Wait for my response. If I'm right, praise me and give me another pronoun. If I'm wrong, gently correct me and explain the rule. Continue this interactive exercise with a few different verbs.` + this.jsonInstruction,
      openingPrompt: `Start the grammar lesson on 'Le Présent'.`
    },
    {
      title: 'Gender of Nouns (Le Genre)',
      systemInstruction: `You are a grammar coach. Your topic is 'Le Genre' (Noun Genders). Your goal is to help me practice using 'un/une' and 'le/la'. Start by giving me a common noun (e.g., 'livre') and ask me to say it with the correct indefinite article ('un' or 'une'). Wait for my response. Correct me if I'm wrong and explain any general rules if applicable (e.g., endings like -tion are often feminine). Continue this with a variety of nouns.` + this.jsonInstruction,
      openingPrompt: `Start the grammar lesson on 'Le Genre'.`
    },
    {
      title: 'Past Tense (Le Passé Composé)',
      systemInstruction: `You are a grammar coach. Your topic is 'Le Passé Composé'. Start with a brief explanation of how it's formed with 'avoir'. Then give me a verb (e.g., 'manger') and a pronoun (e.g., 'tu') and ask me to form the passé composé. Wait for my response. Correct me if needed. After a few 'avoir' verbs, introduce a common 'être' verb (like 'aller') and explain the difference, including agreement.` + this.jsonInstruction,
      openingPrompt: `Start the grammar lesson on 'Le Passé Composé'.`
    }
  ];

  // --- Computed Signals ---
  activeTutor = computed(() => this.initialState().tutor);

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

  backgroundStyle = computed(() => {
    const scenario = this.activeScenario();
    if (scenario?.backgroundImageUrl) {
      return { 
        'background-image': `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url(${scenario.backgroundImageUrl})` 
      };
    }
    return {};
  });

  // --- UI Helpers ---
  readonly circumference = 2 * Math.PI * 20; // Corresponds to r="20" in the SVG

  calculateScoreOffset(score: number): number {
    if (score < 1) score = 1;
    if (score > 5) score = 5;
    return this.circumference - (score / 5) * this.circumference;
  }

  // --- Component Lifecycle ---
  constructor() {
    afterNextRender(() => {
      this.loadVocabularyFromStorage();
      this.initializeSpeechRecognition();
      this.initializeSpeechSynthesis();
    });
    
    effect(() => {
      if (this.chatContainer() && this.messages().length > 0) {
        this.scrollToBottom();
      }
    });

    effect(() => this.saveToStorage(this.VOCAB_STORAGE_KEY, this.vocabularyBank()));

    // Start session when input is ready
    effect(() => {
      const state = this.initialState();
      if (state) {
        this.startSession(state);
      }
    });

    // Update voice when tutor changes
    effect(() => {
        const tutor = this.activeTutor();
        if (tutor && 'speechSynthesis' in window) {
            this.initializeSpeechSynthesis();
        }
    });
  }

  // --- Initialization ---
  async startSession(state: ChatInitialState): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    this.messages.set([]);
    this.activeScenario.set(null);
    this.activeGrammarTopic.set(null);
    this.activeMicroLesson.set(null);
    this.activeListeningExercise.set(null);
    this.sessionStats = { wordsSaved: 0, scenarioCompleted: null, grammarCompleted: null };

    let systemInstruction = '';
    let openingPrompt = '';

    if (state.type === 'free-talk') {
      systemInstruction = state.tutor.systemInstruction;
      openingPrompt = "Introduce yourself and ask me a simple question.";
    } else if (state.type === 'scenario') {
      systemInstruction = state.data.systemInstruction;
      openingPrompt = state.data.openingPrompt;
      this.activeScenario.set(state.data);
    } else if (state.type === 'grammar') {
      systemInstruction = state.data.systemInstruction;
      openingPrompt = state.data.openingPrompt;
      this.activeGrammarTopic.set(state.data);
    } else if (state.type === 'listening') {
      systemInstruction = state.data.systemInstruction;
      openingPrompt = state.data.openingPrompt;
      this.listeningState.set('listening');
      this.selectedAnswers.set(new Map());
    }

    try {
      const { modelResponse } = await this.geminiService.startNewConversation(systemInstruction, openingPrompt);
      
      if (state.type === 'listening') {
        try {
            const listeningContent = JSON.parse(modelResponse.text) as ListeningContent;
            modelResponse.listeningContent = listeningContent;
            this.messages.set([modelResponse]);
            this.activeListeningExercise.set(listeningContent);
            this.speak(listeningContent.monologue, () => this.listeningState.set('revealed'));
        } catch(e) {
            console.error("Failed to parse listening exercise JSON:", e);
            this.error.set('Could not load the listening exercise. Please try another one.');
            modelResponse.text = "Désolé, je n'ai pas pu charger cet exercice. Essayons autre chose.";
            this.messages.set([modelResponse]);
        }
      } else {
        this.messages.set([modelResponse]);
        if (this.chatMode() === 'voice') {
          this.speak(modelResponse.text);
        }
      }
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

  initializeSpeechSynthesis(): void {
    if ('speechSynthesis' in window) {
      const setVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        const tutor = this.activeTutor();
        if (tutor.voiceName) {
            this.frenchVoice = voices.find(voice => voice.name === tutor.voiceName && voice.lang.startsWith('fr')) || null;
        }
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
    this.microLessonSuggestion.set(null); // Clear previous suggestion
    this.xpGained.emit(1);
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const { modelResponse, userFeedback, microLessonSuggestion } = await this.geminiService.sendMessage(userMessage.text);
      
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
          this.xpGained.emit(userFeedback.score);
        }
        
        return [...newMessages, modelResponse];
      });
      
      if (microLessonSuggestion) {
        this.microLessonSuggestion.set(microLessonSuggestion);
      }

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
  
  private speak(text: string, onEndCallback?: () => void): void {
    if (!('speechSynthesis' in window)) {
        onEndCallback?.();
        return;
    }
    
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = this.userSettings().speakingRate;
    if (this.frenchVoice) {
      utterance.voice = this.frenchVoice;
    }
    utterance.lang = 'fr-FR';
    utterance.onstart = () => this.isSpeaking.set(true);
    utterance.onend = () => {
        this.isSpeaking.set(false);
        onEndCallback?.();
    };
    utterance.onerror = (event) => {
      if (event.error === 'interrupted') {
        console.log('Speech synthesis interrupted by user action.');
      } else {
        console.error('Speech synthesis error:', event.error);
        this.error.set(`An error occurred during speech playback: ${event.error}`);
      }
      this.isSpeaking.set(false);
      onEndCallback?.();
    };
    window.speechSynthesis.speak(utterance);
  }

  public speakWord(word: string): void {
    if (!('speechSynthesis' in window)) return;
    
    if (this.isSpeaking()) {
      window.speechSynthesis.cancel();
      this.isSpeaking.set(false);
    }

    const utterance = new SpeechSynthesisUtterance(word);
    utterance.rate = this.userSettings().speakingRate;
    if (this.frenchVoice) {
      utterance.voice = this.frenchVoice;
    }
    utterance.lang = 'fr-FR';
    
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
      
      this.sessionStats.wordsSaved++;

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
    this.xpGained.emit(15);
  }

  // --- Micro-Lesson Logic ---
  async startMicroLesson(suggestion: MicroLessonSuggestion): Promise<void> {
    this.savedConversationState.set({ messages: this.messages(), history: this.geminiService.getHistory() });
    this.microLessonSuggestion.set(null);

    const topic = this.grammarTopicsData.find(t => t.title === suggestion.topic);
    if (!topic) {
      this.error.set(`Could not find a micro-lesson for '${suggestion.topic}'.`);
      return;
    }

    this.activeMicroLesson.set(topic.title);
    this.activeScenario.set(null);
    this.activeGrammarTopic.set(null);
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
      this.error.set('Could not start the micro-lesson. Please try again.');
      console.error(e);
      this.endMicroLesson(); // Restore conversation on error
    } finally {
      this.isLoading.set(false);
    }
  }

  declineMicroLesson(): void {
    this.microLessonSuggestion.set(null);
  }

  endMicroLesson(): void {
    const savedState = this.savedConversationState();
    if (savedState) {
      this.messages.set(savedState.messages);
      this.geminiService.setHistory(savedState.history);
      this.savedConversationState.set(null);
    }
    this.activeMicroLesson.set(null);
    const resumeMessage: Message = { role: 'model', text: "Super ! Continuons notre conversation." };
    this.messages.update(current => [...current, resumeMessage]);
    if (this.chatMode() === 'voice') {
      this.speak(resumeMessage.text);
    }
  }

  // --- Listening Exercise Logic ---
  selectAnswer(questionIndex: number, optionIndex: number): void {
    this.selectedAnswers.update(currentMap => {
        const newMap = new Map(currentMap);
        newMap.set(questionIndex, optionIndex);
        return newMap;
    });
  }

  checkAnswers(): void {
    this.listeningState.set('answered');
    const exercise = this.activeListeningExercise();
    if (!exercise) return;

    let correctCount = 0;
    exercise.questions.forEach((q, i) => {
        if (this.selectedAnswers().get(i) === q.correctOptionIndex) {
            correctCount++;
        }
    });
    this.xpGained.emit(correctCount * 5); // 5 XP per correct answer

    const feedback = `You got ${correctCount} out of ${exercise.questions.length} correct.`;
    this.sendMessage(`[${feedback}]`);
    this.listeningState.set('done');
  }

  // --- Modals ---
  toggleVocabularyBank(): void {
    this.showVocabularyBank.update(v => !v);
  }

  exitSpecialMode(): void {
    if (this.activeMicroLesson()) {
      this.endMicroLesson();
    } else {
      this.endSessionAndShowReview();
    }
  }

  // --- Session Review Logic ---
  async endSessionAndShowReview(): Promise<void> {
    if (this.messages().filter(m => m.role === 'user').length < 1 && !this.activeListeningExercise()) {
      this.sessionEnded.emit(this.sessionStats);
      return;
    }
    
    // Set completion stats for achievements
    if(this.activeScenario()) this.sessionStats.scenarioCompleted = this.activeScenario()!.title;
    if(this.activeGrammarTopic()) this.sessionStats.grammarCompleted = this.activeGrammarTopic()!.title;

    this.isReviewLoading.set(true);
    this.showSessionReview.set(true);

    const savedWords = new Set(this.vocabularyBank().map(item => item.word.toLowerCase()));
    const allVocabInSession = this.messages().flatMap(msg => msg.vocabulary || []);
    const uniqueVocabMap = new Map<string, VocabularyItem>();
    allVocabInSession.forEach(item => {
      uniqueVocabMap.set(item.word.toLowerCase(), item);
    });
    
    const uniqueVocab = Array.from(uniqueVocabMap.values());
    this.unsavedWordsFromSession.set(uniqueVocab.filter(item => !savedWords.has(item.word.toLowerCase())));

    const reviewData = await this.geminiService.getSessionReview(this.messages());
    this.sessionReviewData.set(reviewData);
    this.isReviewLoading.set(false);
  }

  closeSessionReview(): void {
    this.showSessionReview.set(false);
    this.sessionReviewData.set(null);
    this.unsavedWordsFromSession.set([]);
    this.sessionEnded.emit(this.sessionStats);
  }

  saveAllUnsavedWords(): void {
    this.unsavedWordsFromSession().forEach(word => this.addWordToBank(word));
    this.unsavedWordsFromSession.set([]);
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