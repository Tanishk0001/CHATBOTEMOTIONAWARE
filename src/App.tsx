/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, Heart, Mic, Video, Coffee, ShieldCheck } from 'lucide-react';

import { EmotionMonitor } from './components/EmotionMonitor';
import { ChatInterface } from './components/ChatInterface';
import { Message, EmotionData } from './types';
import { getChatResponse } from './lib/gemini';

function AudioVisualizer({ isActive }: { isActive: boolean }) {
  const [bars, setBars] = useState(new Array(12).fill(0));
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  
  useEffect(() => {
    if (!isActive) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    const startAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const context = new AudioContext();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        
        audioContextRef.current = context;
        analyserRef.current = analyser;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const update = () => {
          analyser.getByteFrequencyData(dataArray);
          const newBars = Array.from(dataArray.slice(0, 12)).map(v => (v / 255) * 100);
          setBars(newBars);
          animationRef.current = requestAnimationFrame(update);
        };
        update();
      } catch (err) {
        console.error("Microphone access denied:", err);
      }
    };

    startAudio();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [isActive]);

  return (
    <div className="flex items-center gap-1 h-8 px-2 bg-[#F5F2ED] rounded-lg border border-[#E8E4D9]">
      {bars.map((height, i) => (
        <motion.div
          key={i}
          animate={{ height: `${10 + height * 0.8}%` }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="w-1.5 bg-[#5A5A40] rounded-full opacity-60"
        />
      ))}
    </div>
  );
}

export default function App() {
  const [hasStarted, setHasStarted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState<EmotionData>({
    facialEmotion: 'neutral',
    vocalTone: 'Soft',
    overallMood: 'Waiting to connect...',
    confidence: 1
  });
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    
    // Stop any existing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    // Find a robot-like or at least neutral voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.name.includes("Google UK English Male") || v.name.includes("Samantha")) || voices[0];
    if (preferredVoice) utterance.voice = preferredVoice;
    
    utterance.pitch = 0.9;
    utterance.rate = 1.05;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    window.speechSynthesis.speak(utterance);
  }, []);

  useEffect(() => {
    // Warm up voices
    window.speechSynthesis.getVoices();
  }, []);

  const handleSendMessage = useCallback(async (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      emotion: currentEmotion.facialEmotion,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await getChatResponse([...messages, userMessage], currentEmotion);
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: Date.now()
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      speak(response.replace(/[#*`]/g, '')); // Strip markdown for cleaner speech
    } catch (error) {
      console.error("Failed to get response:", error);
      if (error instanceof Error && error.message.includes("GEMINI_API_KEY")) {
        setError("The app is not configured correctly. Please set GEMINI_API_KEY in your deployment environment variables.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [messages, currentEmotion]);

  const handleEmotionUpdate = useCallback((data: EmotionData) => {
    setCurrentEmotion(data);
  }, []);

  return (
    <div className="min-h-screen relative font-sans text-[#2D2D2A] selection:bg-[#5A5A40]/10">
      <div className="atmosphere" />
      
      <AnimatePresence mode="wait">
        {error && (
          <div className="fixed top-0 left-0 right-0 z-50 p-4 bg-red-500 text-white text-center text-sm font-bold shadow-lg">
             {error}
             <button onClick={() => setError(null)} className="ml-4 underline">Dismiss</button>
          </div>
        )}
        {!hasStarted ? (
          <motion.main
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center justify-center min-h-screen p-6 text-center bg-[#F5F2ED]"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mb-8"
            >
              <div className="relative inline-block">
                <div className="absolute inset-0 bg-[#5A5A40] blur-3xl opacity-10 animate-pulse" />
                <div className="relative p-6 bg-white border border-[#E8E4D9] rounded-[2.5rem] shadow-sm">
                  <Brain className="w-16 h-16 text-[#5A5A40]" />
                </div>
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-5xl md:text-7xl font-serif italic tracking-tighter mb-4 text-[#2D2D2A]"
            >
              aura.sentient
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="max-w-md text-lg text-[#2D2D2A]/60 mb-12 leading-relaxed"
            >
              A sovereign cybernetic intellect that sees your face, hears your voice, and speaks with a robotic soul. Experience true digital empathy.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16 max-w-2xl"
            >
              {[
                { icon: Video, label: "Facial Tracking" },
                { icon: Heart, label: "Empathy Engine" },
                { icon: Mic, label: "Vocal Nuance" },
                { icon: ShieldCheck, label: "Private & Secure" }
              ].map((feature, i) => (
                <div key={i} className="flex flex-col items-center gap-3">
                  <div className="p-3 bg-white rounded-2xl border border-[#E8E4D9] shadow-sm">
                    <feature.icon className="w-5 h-5 text-[#5A5A40]" />
                  </div>
                  <span className="text-[10px] uppercase tracking-widest font-bold text-[#5A5A40]/50">{feature.label}</span>
                </div>
              ))}
            </motion.div>

            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1 }}
              onClick={() => setHasStarted(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="group relative px-10 py-5 bg-[#5A5A40] text-white font-bold rounded-2xl shadow-xl hover:bg-[#4A4A30] transition-all overflow-hidden"
            >
              <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              <span className="relative">Begin Session</span>
            </motion.button>
          </motion.main>
        ) : (
          <motion.main
            key="app"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="container mx-auto max-w-6xl h-screen flex flex-col md:flex-row gap-6 p-4 md:p-8"
          >
            {/* Sidebar / Status */}
            <div className="flex flex-col gap-6 md:w-80 shrink-0">
              <div className="flex items-center gap-3 px-2">
                <Brain className="text-[#5A5A40] w-8 h-8" />
                <h1 className="text-xl font-serif italic tracking-tight text-[#2D2D2A]">aura</h1>
              </div>

              <EmotionMonitor 
                isStreaming={hasStarted} 
                onEmotionUpdate={handleEmotionUpdate} 
              />

              <div className="glass-panel flex-1 p-6 space-y-6">
                <div>
                  <h3 className="text-[10px] font-bold text-[#5A5A40] uppercase tracking-[0.2em] mb-4">Mood Signature</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-end">
  <div className="space-y-1">
    <span className="text-xs text-[#2D2D2A]/60">Vocal Tone</span>
    <AudioVisualizer isActive={hasStarted} />
  </div>
  <span className="text-sm font-medium text-[#8A9A5B]">{currentEmotion.vocalTone}</span>
</div>
                    <div className="w-full h-1 bg-[#E8E4D9] rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${currentEmotion.confidence * 100}%` }}
                        className="h-full bg-[#8A9A5B]" 
                      />
                    </div>
                  </div>
                </div>

                <div>
                   <h3 className="text-[10px] font-bold text-[#5A5A40] uppercase tracking-[0.2em] mb-4">Environment</h3>
                   <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-[#F5F2ED] border border-[#E8E4D9] rounded-xl space-y-1">
                        <Coffee size={14} className="text-[#5A5A40]/40" />
                        <p className="text-[10px] text-[#2D2D2A]/60">Session Flow</p>
                        <p className="text-xs font-bold text-[#2D2D2A]">Optimal</p>
                      </div>
                      <div className="p-3 bg-[#F5F2ED] border border-[#E8E4D9] rounded-xl space-y-1">
                        <ShieldCheck size={14} className="text-[#8A9A5B]" />
                        <p className="text-[10px] text-[#2D2D2A]/60">Privacy</p>
                        <p className="text-xs font-bold text-[#2D2D2A]">Active</p>
                      </div>
                   </div>
                </div>

                <div className="pt-4 border-t border-[#E8E4D9]">
                   <p className="text-xs text-[#2D2D2A]/40 italic font-serif leading-relaxed">
                     "The emotion is not a byproduct, it is the language of truth."
                   </p>
                </div>
              </div>

              <button
                onClick={() => setHasStarted(false)}
                className="w-full py-3 text-xs font-bold text-[#2D2D2A]/30 hover:text-[#2D2D2A]/60 uppercase tracking-widest transition-colors"
              >
                End Session
              </button>
            </div>

            {/* Chat Area */}
            <div className="flex-1 min-h-0 relative">
              <ChatInterface 
                messages={messages} 
                onSendMessage={handleSendMessage}
                isLoading={isLoading}
                currentEmotion={currentEmotion}
              />
            </div>
          </motion.main>
        )}
      </AnimatePresence>
    </div>
  );
}

