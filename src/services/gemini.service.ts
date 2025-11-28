import { Injectable } from '@angular/core';
import { GoogleGenAI, Type, GenerateContentResponse, Content } from '@google/genai';

export interface VocabularyItem {
  word: string;
  translation: string;
  example: string;
}

export interface VocabularyBankItem extends VocabularyItem {
  srsLevel: number;
  nextReviewDate: string; // ISO Date String (YYYY-MM-DD)
}

export interface PronunciationFeedback {
  score: number; // 1-5
  feedback: string;
  tip: string;
}

export interface Message {
  role: 'user' | 'model';
  text: string;
  vocabulary?: VocabularyItem[];
  pronunciationFeedback?: PronunciationFeedback;
}

export interface GeminiResponse {
  modelResponse: Message;
  userFeedback: PronunciationFeedback | null;
}

// --- New Interfaces for Session Review ---
export interface Metric {
  score: number; // 0-100
  feedback: string;
}

export interface Mistake {
  user_text: string;
  correction: string;
  explanation: string;
}

export interface SessionReview {
  fluency: Metric;
  accuracy: Metric;
  vocabularyUsage: Metric;
  recurringMistakes: Mistake[];
  overallSummary: string;
}


@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private ai: GoogleGenAI | null = null;
  private history: Content[] = [];
  private systemInstruction: string = '';

  private readonly responseSchema = {
    type: Type.OBJECT,
    properties: {
      response: { type: Type.STRING, description: "The conversational reply in French." },
      vocabulary: {
        type: Type.ARRAY,
        description: "A list of key vocabulary words from the response.",
        items: {
          type: Type.OBJECT,
          properties: {
            word: { type: Type.STRING, description: "The French word." },
            translation: { type: Type.STRING, description: "The English translation." },
            example: { type: Type.STRING, description: "An example sentence in French." },
          },
          required: ["word", "translation", "example"]
        }
      },
      pronunciationFeedback: {
        type: Type.OBJECT,
        description: "Feedback on the user's pronunciation.",
        properties: {
            score: { type: Type.INTEGER, description: "An integer score from 1 to 5." },
            feedback: { type: Type.STRING, description: "Constructive feedback text." },
            tip: { type: Type.STRING, description: "A practical tip for improvement." }
        },
        required: ["score", "feedback", "tip"]
      }
    },
    required: ["response", "vocabulary"]
  };

  private readonly reviewSchema = {
    type: Type.OBJECT,
    properties: {
        fluency: { type: Type.OBJECT, properties: { score: { type: Type.INTEGER, description: "Score 0-100 for fluency." }, feedback: { type: Type.STRING, description: "Feedback on fluency." } }, required: ["score", "feedback"] },
        accuracy: { type: Type.OBJECT, properties: { score: { type: Type.INTEGER, description: "Score 0-100 for accuracy." }, feedback: { type: Type.STRING, description: "Feedback on accuracy." } }, required: ["score", "feedback"] },
        vocabularyUsage: { type: Type.OBJECT, properties: { score: { type: Type.INTEGER, description: "Score 0-100 for vocabulary usage." }, feedback: { type: Type.STRING, description: "Feedback on vocabulary." } }, required: ["score", "feedback"] },
        recurringMistakes: {
            type: Type.ARRAY,
            description: "A list of 1-3 of the learner's most common mistakes.",
            items: {
                type: Type.OBJECT,
                properties: {
                    user_text: { type: Type.STRING, description: "The original incorrect text from the user." },
                    correction: { type: Type.STRING, description: "The corrected version of the text." },
                    explanation: { type: Type.STRING, description: "A simple explanation of the mistake." }
                },
                required: ["user_text", "correction", "explanation"]
            }
        },
        overallSummary: { type: Type.STRING, description: "A brief, encouraging overall summary of the session." }
    },
    required: ["fluency", "accuracy", "vocabularyUsage", "recurringMistakes", "overallSummary"]
  };

  constructor() {
    try {
      this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    } catch (error) {
      console.error('Failed to initialize GoogleGenAI:', error);
    }
  }

  async startNewConversation(systemInstruction: string, openingPrompt: string): Promise<GeminiResponse> {
    this.systemInstruction = systemInstruction;
    this.history = []; // Reset history for a new session
    return this.sendMessage(openingPrompt);
  }

  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error && error.message) {
      try {
        const errorDetails = JSON.parse(error.message);
        if (errorDetails?.error?.code === 429 || errorDetails?.error?.status === 'RESOURCE_EXHAUSTED') {
          return true;
        }
      } catch (e) {
        // Not a JSON string, fall back to string matching
      }
      return error.message.includes('429') || error.message.toLowerCase().includes('resource_exhausted');
    }
    return false;
  }

  async sendMessage(messageText: string): Promise<GeminiResponse> {
    if (!this.ai) {
      throw new Error('AI service is not initialized.');
    }

    const maxRetries = 3;
    let attempt = 0;
    let delay = 1000;

    while (attempt < maxRetries) {
      try {
        const response: GenerateContentResponse = await this.ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [...this.history, { role: 'user', parts: [{ text: messageText }] }],
          config: {
            systemInstruction: this.systemInstruction,
            responseMimeType: "application/json",
            responseSchema: this.responseSchema,
          },
        });
        
        const jsonText = response.text.trim();
        const data = JSON.parse(jsonText);

        const modelResponse: Message = {
          role: 'model',
          text: data.response,
          vocabulary: data.vocabulary,
        };
        
        const userFeedback = data.pronunciationFeedback || null;

        this.history.push({ role: 'user', parts: [{ text: messageText }] });
        this.history.push({ role: 'model', parts: [{ text: jsonText }] });

        return { modelResponse, userFeedback };

      } catch (error) {
        if (this.isRateLimitError(error) && attempt < maxRetries - 1) {
          console.warn(`Rate limit exceeded. Retrying in ${delay / 1000}s... (Attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
          attempt++;
        } else {
          console.error('Error sending message to Gemini (final attempt or non-retryable):', error);
          let errorMessage = 'Désolé, une erreur est survenue. Veuillez réessayer.';
          
          if (this.isRateLimitError(error)) {
             errorMessage = 'Le service est actuellement surchargé. Veuillez patienter un moment avant de réessayer.';
          } else if (error instanceof Error && error.message.includes('JSON')) {
            errorMessage = 'Désolé, j\'ai eu un problème avec ma réponse. Essayons encore !';
          }
          
          return { 
            modelResponse: { role: 'model', text: errorMessage, vocabulary: [] },
            userFeedback: null 
          };
        }
      }
    }
    
    return { 
        modelResponse: { role: 'model', text: 'Désolé, une erreur inattendue est survenue après plusieurs tentatives.', vocabulary: [] },
        userFeedback: null 
    };
  }

  async getSessionReview(chatHistory: Message[]): Promise<SessionReview | null> {
    if (!this.ai) {
      throw new Error('AI service is not initialized.');
    }

    const conversationText = chatHistory
      .map(msg => `${msg.role === 'user' ? 'Learner' : 'Tutor'}: ${msg.text}`)
      .join('\n');

    const reviewPrompt = `
    Analyze the following French conversation between a 'Tutor' and a 'Learner'. The learner is trying to improve their French.
    Provide a detailed session review based on the learner's performance.
    Your analysis MUST be a JSON object that strictly follows the provided schema.
    - Provide scores from 0 to 100 for fluency, accuracy, and vocabulary usage.
    - Fluency: How naturally and smoothly the learner communicates.
    - Accuracy: Grammatical correctness, verb conjugations, gender agreement, etc.
    - Vocabulary Usage: Range and appropriateness of words used.
    - Identify 1-3 of the learner's most common recurring mistakes. For each, provide the original text, a correction, and a simple explanation.
    - Provide a brief, encouraging overall summary.
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: reviewPrompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: this.reviewSchema,
        },
      });

      const jsonText = response.text.trim();
      return JSON.parse(jsonText) as SessionReview;

    } catch (error) {
      console.error('Error getting session review from Gemini:', error);
      return null;
    }
  }
}
