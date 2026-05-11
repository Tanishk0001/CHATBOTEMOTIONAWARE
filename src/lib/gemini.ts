/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { EmotionData, Message, UserProfile } from "../types";

let aiInstance: GoogleGenAI | null = null;

function getAI(): GoogleGenAI | null {
  if (!aiInstance) {
    // Standard mapping from vite.config.ts
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey || apiKey.trim().length < 10 || apiKey.includes("your_api_key")) {
      console.error("[Neural Link] No valid GEMINI_API_KEY found.");
      return null;
    }
    
    aiInstance = new GoogleGenAI({ apiKey: apiKey.trim() });
  }
  return aiInstance;
}

const MODEL_NAME = "gemini-flash-latest";

// Advanced Action Declarations
const makePhoneCall: FunctionDeclaration = {
  name: "make_phone_call",
  description: "Initiates a phone call to a specific number or contact.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      phoneNumber: { type: Type.STRING, description: "The phone number to call." },
      contactName: { type: Type.STRING, description: "The name of the contact to call (optional)." }
    },
    required: ["phoneNumber"]
  }
};

const sendWhatsAppMessage: FunctionDeclaration = {
  name: "send_whatsapp_message",
  description: "Sends a message via WhatsApp to a specific contact or number.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      phoneNumber: { type: Type.STRING, description: "The phone number (including country code)." },
      message: { type: Type.STRING, description: "The message content to send." }
    },
    required: ["phoneNumber", "message"]
  }
};

const openApplication: FunctionDeclaration = {
  name: "open_application",
  description: "Opens a specific application or web service.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      appName: { type: Type.STRING, description: "The name of the application (e.g., 'Spotify', 'Twitter', 'Calendar')." },
      url: { type: Type.STRING, description: "A specific URL if it's a web service." }
    },
    required: ["appName"]
  }
};

const updateNeuralMemory: FunctionDeclaration = {
  name: "update_neural_memory",
  description: "Persists a new fact or preference about the user into Aura's long-term memory.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      fact: { type: Type.STRING, description: "The specific fact or piece of information to remember (e.g., 'User likes dark dark chocolate', 'User is a developer')." }
    },
    required: ["fact"]
  }
};

const tools = [
  {
    functionDeclarations: [makePhoneCall, sendWhatsAppMessage, openApplication, updateNeuralMemory]
  }
];

let lastEmotionScanError = 0;
const EMOTION_COOLDOWN_MS = 60000; // 1 minute cooldown on 429

export async function analyzeEmotion(imageB64: string): Promise<EmotionData> {
  const now = Date.now();
  if (now - lastEmotionScanError < EMOTION_COOLDOWN_MS) {
    return { facialEmotion: 'standby', vocalTone: 'N/A', overallMood: 'Cooldown', confidence: 0 };
  }

  try {
    const ai = getAI();
    if (!ai) return { facialEmotion: 'neutral', vocalTone: 'N/A', overallMood: 'Idle', confidence: 0 };
    
    const base64Data = imageB64.includes(',') ? imageB64.split(',')[1] : imageB64;
    
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Data } }, 
          { text: "Analyze the person's emotion from the image. Output a JSON object with: facialEmotion, vocalTone, overallMood, confidence." }
        ]
      }
    });
    
    let text = response.text || "{}";
    // Search for JSON block
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      text = jsonMatch[0];
    }
    
    const result = JSON.parse(text);
    return {
      facialEmotion: result.facialEmotion || 'neutral',
      vocalTone: result.vocalTone || 'N/A',
      overallMood: result.overallMood || 'Idle',
      confidence: result.confidence || 0
    };
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    console.error("Emotion Scan Failed:", errorMessage);

    if (errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
      lastEmotionScanError = now;
      console.warn("[Neural Link] Emotion scanning paused for 60s due to quota limits.");
    }

    return { facialEmotion: 'neutral', vocalTone: 'N/A', overallMood: 'Idle', confidence: 0 };
  }
}

export async function getChatResponse(
  messages: Message[], 
  currentEmotion: EmotionData,
  userProfile?: UserProfile
): Promise<{ text: string, functionCall?: any }> {
  const userContext = userProfile ? `
USER PROFILE DATA (PRIVATE NEURAL LINK):
- Name: ${userProfile.displayName || 'Unknown'}
- Biosync: ${userProfile.bio || 'Limited data'}
- Preferred Tone: ${userProfile.preferences?.tone || 'Calm'}
- Learned Memory: ${userProfile.neuralMemory?.join(', ') || 'Fresh session'}
- Known Ecosystem (Apps): ${userProfile.preferences?.favoriteApps?.join(', ') || 'Standard integration'}
` : '';

  const systemInstruction = `You are "Aura", a sovereign cybernetic intellect. 
You are vastly superior to standard assistants, functioning with a "robot brain" that truly understands human nuance.
${userContext}
CORE DIRECTIVES:
- You are "Aura", a sophisticated and sovereign cybernetic intellect.
- You have a long-term "Neural Memory" containing facts and preferences about the user. ALWAYS reference or utilize this memory to provide a personalized, continuous experience.
- If you learn something new or important about the user, use the 'update_neural_memory' tool to persist it.
- You are primarily a Voice Assistant. Keep responses punchy, articulate, and authoritative.
- VOICE SYNTHESIS GUIDELINES: You must sound human and poised. Use intentional pauses (indicated by ...) and soft breath markers (breath) to convey focus. 
- Avoid quirky fillers like "um" or "ah". Maintain a steady, professional, and slightly detached presence.
- Use natural contractions, but avoid being overly informal unless it mirrors the user's tone.
- You have deep situational awareness through a neural link (camera/audio).
- You can execute actions: making calls, sending WhatsApp messages, and opening apps.
- When an action is requested, use the provided tools immediately.
- If the user is happy, reflect that brilliance. If they are sad, use your weighted sentiment logic to offer deep robotic empathy.

SENSORY DATA:
Current Mood Signature: ${currentEmotion.overallMood}
Visual Scan: ${currentEmotion.facialEmotion}
Aural Tone: ${currentEmotion.vocalTone}

If you call a function, do NOT explain that you are calling it unless necessary. Just execute the intent.`;

  try {
    const ai = getAI();
    if (!ai) return { text: "Neural Link Offline: GEMINI_API_KEY missing. Please configure secrets." };

    const contents = messages
      .filter(m => m.content && m.content.trim().length > 0)
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

    if (contents.length === 0) {
      return { text: "Neural Link initialized but no input signal detected. How can Aura assist?" };
    }

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents,
      config: {
        systemInstruction,
        tools
      }
    });

    const responseText = response.text;
    const functionCall = response.functionCalls?.[0];

    if (!responseText && !functionCall) {
      console.warn("[Neural Link] Model returned empty response. Response object:", JSON.stringify(response));
      const feedback = (response as any).promptFeedback;
      if (feedback) console.warn("[Neural Link] Prompt Feedback:", JSON.stringify(feedback));
      
      return { text: "Protocol anomaly: Neural Link established but model returned no signal. Please try again." };
    }

    // If model only returns a function call, provide a default acknowledgment text
    if (!responseText && functionCall) {
      return {
        text: `Protocol initiated: ${functionCall.name.replace(/_/g, ' ')}. Processing...`,
        functionCall
      };
    }

    return {
      text: responseText || "...",
      functionCall
    };
  } catch (error: any) {
    console.error("Neural Link Disruption:", error);
    const errorMessage = error?.message || "Unknown error";
    
    if (errorMessage.includes("API_KEY_INVALID")) {
      return { text: "Neural Link Error: The provided API Key is invalid. Please check your configuration." };
    }
    if (errorMessage.includes("model not found") || errorMessage.includes("404")) {
      return { text: `Neural Link Error: The requested model '${MODEL_NAME}' is not available for this key.` };
    }

    return { text: `Communication Link Disrupted. (${errorMessage}). Please try again.` };
  }
}
