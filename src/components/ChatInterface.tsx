/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, BrainCircuit, Mic } from 'lucide-react';
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { Message, EmotionData } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Props {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isLoading: boolean;
  currentEmotion: EmotionData;
}

export function ChatInterface({ messages, onSendMessage, isLoading, currentEmotion }: Props) {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && ('WebkitSpeechRecognition' in window || 'speechRecognition' in window)) {
      const SpeechRecognition = (window as any).WebkitSpeechRecognition || (window as any).speechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setIsListening(true);
      recognitionRef.current?.start();
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input);
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full glass-panel overflow-hidden border-[#E8E4D9]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#E8E4D9] bg-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#5A5A40]/10 rounded-xl text-[#5A5A40]">
            <BrainCircuit size={20} className={cn(isLoading && "animate-pulse")} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#2D2D2A] font-serif">Sentient Architecture</h2>
            <p className="text-[10px] text-[#5A5A40]/60 uppercase tracking-widest font-bold">Neural Link Active</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
           <AnimatePresence mode="wait">
             <motion.div
               key={currentEmotion.facialEmotion}
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: -10 }}
               className="flex flex-col items-end"
             >
               <span className="text-[10px] font-bold text-[#2D2D2A]/30 uppercase">Neural Scan</span>
               <span className="text-xs text-[#8A9A5B] font-medium capitalize">{currentEmotion.facialEmotion}</span>
             </motion.div>
           </AnimatePresence>
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 chat-scrollbar bg-[#FDFBF7]"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40 grayscale">
            <Bot size={48} className="text-[#5A5A40]" />
            <div className="max-w-xs space-y-1 text-[#2D2D2A]">
              <p className="text-sm font-medium">Hello there. I'm SentientChat.</p>
              <p className="text-xs">I can see and hear how you're feeling. Let's talk about whatever's on your mind.</p>
            </div>
          </div>
        )}

        <AnimatePresence>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={cn(
                "flex gap-4",
                m.role === 'user' ? "flex-row-reverse" : "flex-row"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border",
                m.role === 'user' 
                  ? "bg-[#5A5A40] border-[#5A5A40] text-white" 
                  : "bg-white border-[#E8E4D9] text-[#5A5A40]"
              )}>
                {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              
              <div className={cn(
                "max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed",
                m.role === 'user'
                  ? "bg-[#5A5A40] text-white rounded-tr-none shadow-sm"
                  : "bg-white text-[#2D2D2A] border border-[#E8E4D9] rounded-tl-none shadow-sm"
              )}>
                <div className="prose prose-sm max-w-none prose-stone">
                  <Markdown>{m.content}</Markdown>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-white border border-[#E8E4D9] text-[#5A5A40] flex items-center justify-center animate-pulse">
              <Bot size={16} />
            </div>
            <div className="flex items-center gap-1 px-4 py-3 rounded-2xl bg-white border border-[#E8E4D9]">
              <div className="w-1.5 h-1.5 rounded-full bg-[#8A9A5B] animate-bounce [animation-delay:-0.3s]" />
              <div className="w-1.5 h-1.5 rounded-full bg-[#8A9A5B] animate-bounce [animation-delay:-0.15s]" />
              <div className="w-1.5 h-1.5 rounded-full bg-[#8A9A5B] animate-bounce" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-6 bg-white border-t border-[#E8E4D9]">
        <div className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isLoading ? "Neural processing..." : "Speak or type..."}
              disabled={isLoading}
              className="w-full bg-[#F5F2ED] border border-[#E8E4D9] rounded-[99px] px-6 py-4 pr-12 text-sm focus:outline-none focus:border-[#5A5A40]/50 placeholder:text-[#2D2D2A]/30 transition-all outline-none text-[#2D2D2A]"
            />
            <button
              type="button"
              onClick={toggleListening}
              className={cn(
                "absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all",
                isListening ? "bg-red-500 text-white animate-pulse" : "text-[#5A5A40] hover:bg-[#5A5A40]/10"
              )}
            >
              <Mic size={18} />
            </button>
          </div>
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="p-4 bg-[#5A5A40] text-white rounded-full hover:bg-[#4A4A30] disabled:opacity-50 transition-colors shadow-lg shadow-[#5A5A40]/10"
          >
            <Send size={18} />
          </button>
        </div>
        <p className="mt-3 text-[10px] text-center text-[#2D2D2A]/20 uppercase tracking-[0.2em] font-medium">
          Sovereign AI Architecture • Real-time Multimodal Scan
        </p>
      </form>
    </div>
  );
}
