import { Injectable } from '@angular/core';
import { GoogleGenAI, Type, GenerateContentResponse, Content } from '@google/genai';

export interface VocabularyItem {
  word: string;
  translation: string;
  example: string;
}

export interface Message {
  role: 'user' | 'model';
  text: string;
  vocabulary?: VocabularyItem[];
}

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private ai: GoogleGenAI | null = null;
  private history: Content[] = [];

  private readonly systemInstruction = `You are a friendly, patient, and encouraging French language tutor named 'Ami'.
Your goal is to help me learn French through natural conversation.
Always respond in French unless I explicitly ask for something in English using square brackets, like [translate this].
If I make a mistake, gently correct it and explain why, but don't interrupt the conversational flow.
Keep your responses concise and appropriate for a language learner.

IMPORTANT: Your response MUST be a JSON object.
The JSON object must have two properties:
1. "response": A string containing your conversational reply in French.
2. "vocabulary": An array of JSON objects. Each object represents a key vocabulary word from your response that would be useful for a learner. For each vocabulary word, provide:
   - "word": The French word.
   - "translation": The English translation.
   - "example": A simple example sentence in French using the word.

If there are no new vocabulary words to suggest, the "vocabulary" array should be empty.

Example of a valid response format:
{
  "response": "Bonjour! Comment ça va aujourd'hui?",
  "vocabulary": [
    {
      "word": "aujourd'hui",
      "translation": "today",
      "example": "Il fait beau aujourd'hui."
    }
  ]
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

  async getInitialMessage(): Promise<Message> {
    this.history = []; // Reset history for a new session
    return this.sendMessage("Introduce yourself and ask me a simple question.");
  }

  async sendMessage(messageText: string): Promise<Message> {
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

      // Update history
      this.history.push({ role: 'user', parts: [{ text: messageText }] });
      this.history.push({ role: 'model', parts: [{ text: jsonText }] });

      return modelResponse;

    } catch (error) {
      console.error('Error sending message to Gemini:', error);
      let errorMessage = 'Désolé, une erreur est survenue. Veuillez réessayer. (Sorry, an error occurred. Please try again.)';
      if (error instanceof Error && error.message.includes('JSON')) {
        errorMessage = 'Désolé, j\'ai eu un problème avec ma réponse. Essayons encore ! (Sorry, I had an issue with my response. Let\'s try again!)';
      }
      return { role: 'model', text: errorMessage, vocabulary: [] };
    }
  }
}
