/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Emotion = 
  | 'happy' 
  | 'sad' 
  | 'angry' 
  | 'stress' 
  | 'neutral' 
  | 'surprised' 
  | 'fearful'
  | 'unknown';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  emotion?: Emotion;
  timestamp: number;
}

export interface EmotionData {
  facialEmotion: Emotion;
  vocalTone: string;
  overallMood: string;
  confidence: number;
}

export interface ChatSession {
  messages: Message[];
  currentEmotion: EmotionData;
}
