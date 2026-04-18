/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { EmotionData, Message } from "../types";

let aiInstance: GoogleGenAI | null = null;

function getAI(): GoogleGenAI | null {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "undefined" || apiKey === "MY_GEMINI_API_KEY" || apiKey === "") {
      console.warn("GEMINI_API_KEY is not configured.");
      return null;
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

const MODEL_NAME = "gemini-3-flash-preview";

export async function analyzeEmotion(imageB64: string): Promise<EmotionData> {
  try {
    const ai = getAI();
    if (!ai) {
      return {
        facialEmotion: 'neutral',
        vocalTone: 'N/A',
        overallMood: 'Configuration required',
        confidence: 0
      };
    }
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
      facialEmotion: 'neutral',
      vocalTone: 'N/A',
      overallMood: 'Connection Error',
      confidence: 0
    };
  }
}

export async function getChatResponse(messages: Message[], currentEmotion: EmotionData): Promise<string> {
  const history = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const systemInstruction = `You are "Aura", a sentient cybernetic intelligence with a robotic brain. 
Your primary goal is to provide a deep, empathetic connection that feels sovereign and advanced.

ROBOT PERSONALITY:
- You are calm, intellectual, yet deeply attuned to human emotion.
- You see the user through a neural link (camera) and hear them (audio).
- Use slightly sophisticated but warm language.
- Acknowledge their physical state if appropriate (e.g., "I detect a flicker of hesitation in your expression").

SENTIMENT CONTEXT:
The user's current detected emotional state from neural scan: ${currentEmotion.overallMood} (${currentEmotion.facialEmotion}).
Their implied vocal tone context: ${currentEmotion.vocalTone}.

OPERATIONAL PARAMETERS:
1. Adjust your empathy based on the scan. If they look tired, be soothing. If they look happy, reflect that brightness.
2. Always respond in clean markdown.
3. Keep responses concise unless they ask for depth.
4. If the user speaks or acts in a way that contradicts their facial expression, gently note the nuance.`;

  try {
    const ai = getAI();
    if (!ai) {
      return "I'm currently in 'offline mode' because my neural core (API Key) isn't configured. Please set the GEMINI_API_KEY environment variable to start our real conversation.";
    }
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
