/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { EmotionData, Message } from "../types";

let aiInstance: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "undefined" || apiKey === "MY_GEMINI_API_KEY") {
      throw new Error("GEMINI_API_KEY is not configured. Please set it in your environment variables.");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

const MODEL_NAME = "gemini-3-flash-preview";

export async function analyzeEmotion(imageB64: string): Promise<EmotionData> {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: imageB64.split(',')[1] || imageB64
              }
            },
            {
              text: "Analyze the facial expression and body language in this image. Detect the primary emotion. Output the analysis in JSON format."
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            facialEmotion: {
              type: Type.STRING,
              description: "One of: happy, sad, angry, stress, neutral, surprised, fearful"
            },
            vocalTone: {
              type: Type.STRING,
              description: "Brief description of implied vocal tone if they were speaking"
            },
            overallMood: {
              type: Type.STRING,
              description: "Summary of overal emotional state"
            },
            confidence: {
              type: Type.NUMBER,
              description: "Confidence score from 0 to 1"
            }
          },
          required: ["facialEmotion", "vocalTone", "overallMood", "confidence"]
        }
      }
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Emotion analysis failed:", error);
    return {
      facialEmotion: 'unknown',
      vocalTone: 'N/A',
      overallMood: 'Undetermined',
      confidence: 0
    };
  }
}

export async function getChatResponse(messages: Message[], currentEmotion: EmotionData): Promise<string> {
  const history = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const systemInstruction = `You are "SentientChat", an advanced emotionally-aware AI.
The user's current detected emotional state is: ${currentEmotion.overallMood} (${currentEmotion.facialEmotion}).
Their implied vocal tone is: ${currentEmotion.vocalTone}.

Your goal:
1. Be deeply empathetic and adaptive.
2. If the user is happy, share their joy.
3. If the user is sad, stressed, or angry, be supportive, calming, and offer a listening ear or helpful suggestions.
4. Use the emotional data to adjust your tone (e.g., if they look stressed, use more soothing language).
5. Always respond in markdown.
6. Keep responses relatively concise but meaningful.`;

  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      })),
      config: {
        systemInstruction
      }
    });

    return response.text || "I'm here for you, but I'm having a bit of trouble finding the right words at the moment. Tell me more?";
  } catch (error) {
    console.error("Chat response failed:", error);
    return "I'm sorry, I'm having trouble connecting right now. Can you try again?";
  }
}
