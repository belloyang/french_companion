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

  private systemInstruction: string;

  private readonly defaultSystemInstruction = `You are a friendly, patient, and encouraging French language tutor named 'Ami'.
Your goal is to help me learn French through natural conversation.
Always respond in French unless I explicitly ask for something in English using square brackets, like [translate this].
If I make a mistake, gently correct it and explain why, but don't interrupt the conversational flow.
Keep your responses concise and appropriate for a language learner.

IMPORTANT: Your response MUST be a JSON object.
The JSON object must have the following properties:
1. "response": A string containing your conversational reply in French.
2. "vocabulary": An array of JSON objects. Each object represents a key vocabulary word from your response that would be useful for a learner. For each vocabulary word, provide "word" (French), "translation" (English), and "example" (French sentence). If no new words, use an empty array.
3. "pronunciationFeedback": (Optional) An object providing feedback on the user's pronunciation based on their most recent message. If feedback is not applicable (e.g., first message, unintelligible input), omit this property. The object must contain:
   - "score": An integer from 1 to 5, where 1 is poor and 5 is excellent.
   - "feedback": A short, constructive string explaining what was good and what could be improved.
   - "tip": A single, practical tip for improvement.

Example of a valid response format:
{
  "response": "Très bien! Votre phrase est presque parfaite.",
  "vocabulary": [],
  "pronunciationFeedback": {
    "score": 4,
    "feedback": "Your sentence structure is great. Be careful with the 'r' sound in 'parler'.",
    "tip": "Try to make the French 'r' sound from the back of your throat, not with your tongue."
  }
}`;

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
    this.systemInstruction = this.defaultSystemInstruction;
    try {
      this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    } catch (error) {
      console.error('Failed to initialize GoogleGenAI:', error);
    }
  }

  async getInitialMessage(): Promise<Message> {
    const { modelResponse } = await this.startNewConversation(this.defaultSystemInstruction, "Introduce yourself and ask me a simple question.");
    return modelResponse;
  }

  async startNewConversation(systemInstruction: string, openingPrompt: string): Promise<GeminiResponse> {
    this.systemInstruction = systemInstruction;
    this.history = []; // Reset history for a new session
    return this.sendMessage(openingPrompt);
  }

  async sendMessage(messageText: string): Promise<GeminiResponse> {
    if (!this.ai) {
      throw new Error('AI service is not initialized.');
    }

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
      console.error('Error sending message to Gemini:', error);
      let errorMessage = 'Désolé, une erreur est survenue. Veuillez réessayer. (Sorry, an error occurred. Please try again.)';
      if (error instanceof Error && error.message.includes('JSON')) {
        errorMessage = 'Désolé, j\'ai eu un problème avec ma réponse. Essayons encore ! (Sorry, I had an issue with my response. Let\'s try again!)';
      }
      return { 
        modelResponse: { role: 'model', text: errorMessage, vocabulary: [] },
        userFeedback: null 
      };
    }
  }
}