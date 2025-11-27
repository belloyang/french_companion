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
      // Check for JSON-formatted error messages first
      try {
        const errorDetails = JSON.parse(error.message);
        if (errorDetails?.error?.code === 429 || errorDetails?.error?.status === 'RESOURCE_EXHAUSTED') {
          return true;
        }
      } catch (e) {
        // Not a JSON string, fall back to string matching
      }
      
      // Fallback for other error message formats
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
    let delay = 1000; // Start with 1 second delay

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

        // Update history
        this.history.push({ role: 'user', parts: [{ text: messageText }] });
        this.history.push({ role: 'model', parts: [{ text: jsonText }] });

        return { modelResponse, userFeedback };

      } catch (error) {
        if (this.isRateLimitError(error) && attempt < maxRetries - 1) {
          console.warn(`Rate limit exceeded. Retrying in ${delay / 1000}s... (Attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
          attempt++;
        } else {
          console.error('Error sending message to Gemini (final attempt or non-retryable):', error);
          let errorMessage = 'Désolé, une erreur est survenue. Veuillez réessayer. (Sorry, an error occurred. Please try again.)';
          
          if (this.isRateLimitError(error)) {
             errorMessage = 'Le service est actuellement surchargé. Veuillez patienter un moment avant de réessayer. (The service is currently overloaded. Please wait a moment before trying again.)';
          } else if (error instanceof Error && error.message.includes('JSON')) {
            errorMessage = 'Désolé, j\'ai eu un problème avec ma réponse. Essayons encore ! (Sorry, I had an issue with my response. Let\'s try again!)';
          }
          
          return { 
            modelResponse: { role: 'model', text: errorMessage, vocabulary: [] },
            userFeedback: null 
          };
        }
      }
    }
    
    // This fallback should rarely be reached
    return { 
        modelResponse: { role: 'model', text: 'Désolé, une erreur inattendue est survenue après plusieurs tentatives.', vocabulary: [] },
        userFeedback: null 
    };
  }
}