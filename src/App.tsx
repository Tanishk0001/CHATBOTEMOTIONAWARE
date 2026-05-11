/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, Mic, Phone, MessageSquare, ExternalLink, Shield, Cpu, Activity } from 'lucide-react';

import { EmotionMonitor } from './components/EmotionMonitor';
import { Message, EmotionData, UserProfile } from './types';
import { getChatResponse } from './lib/gemini';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, setDoc, serverTimestamp, arrayUnion, updateDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const OrbVisualizer = ({ isActive, isSpeaking, volume }: { isActive: boolean, isSpeaking: boolean, volume: number }) => {
  return (
    <div className="relative w-72 h-72 md:w-96 md:h-96 flex items-center justify-center">
      <motion.div
        animate={isActive || isSpeaking ? {
          scale: [1, 1.1 + volume * 0.8, 1],
          opacity: [0.3, 0.6, 0.3],
        } : { scale: 1, opacity: 0.1 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        className={cn(
          "absolute inset-0 rounded-full blur-[80px]",
          isSpeaking ? "bg-[#c2a82d]/40" : "bg-[#c2a82d]/20"
        )}
      />
      
      <motion.div
        className={cn(
          "relative w-56 h-56 md:w-64 md:h-64 rounded-full border flex items-center justify-center transition-all duration-700 overflow-hidden shadow-2xl backdrop-blur-3xl",
          isActive ? "orb-active border-[#c2a82d]" : isSpeaking ? "orb-speaking border-[#c2a82d]" : "border-white/5"
        )}
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-[#c2a82d]/10 via-transparent to-[#c2a82d]/10 opacity-40" />
        
        {/* Inner Core */}
        <motion.div 
           animate={isActive ? { rotate: 360 } : { rotate: 0 }}
           transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
           className="w-32 h-32 md:w-40 md:h-40 rounded-full border border-white/5 flex items-center justify-center"
        >
          <Activity className={cn(
            "w-12 h-12 transition-all duration-1000",
            isActive ? "text-[#c2a82d] opacity-100 scale-125" : isSpeaking ? "text-[#c2a82d] opacity-100 scale-110" : "text-white/10 opacity-20 scale-100"
          )} />
        </motion.div>
      </motion.div>
    </div>
  );
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Neural Link Failure:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [hasStarted, setHasStarted] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState<EmotionData>({
    facialEmotion: 'neutral',
    vocalTone: 'Idle',
    overallMood: 'Ready',
    confidence: 1
  });
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speakingTimeoutRef = useRef<any>(null);
  const [isAiReady, setIsAiReady] = useState(true);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("System Standby");
  const [transcript, setTranscript] = useState("");
  
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const login = async () => {
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Auth Failure:", error);
      if (error.code === 'auth/network-request-failed') {
        setError("Network Link Blocked. Please try opening this app in a New Tab or disable your Ad-Blocker.");
      } else {
        setError(error.message);
      }
    }
  };

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      
      // Cleanup previous listener
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (currentUser) {
        const profileRef = doc(db, 'users', currentUser.uid, 'private', 'profile');
        unsubscribeProfile = onSnapshot(profileRef, (snap) => {
          if (snap.exists()) {
            setUserProfile(snap.data() as UserProfile);
          } else {
            setStatus("Initializing Neural Profile...");
            setDoc(profileRef, {
              displayName: currentUser.displayName || 'Neural Entity',
              updatedAt: serverTimestamp(),
              neuralMemory: ["Neural Link Established. First contact recorded."],
              preferences: { tone: 'calm', favoriteApps: [] }
            }).catch(err => {
              handleFirestoreError(err, OperationType.WRITE, profileRef.path);
            });
          }
        }, (err) => {
          console.warn("Profile Sync Interrupted:", err);
          // Don't throw here to avoid crashing the whole app, but log it
          setError("Neural Link Synced partially. Check permissions.");
        });
      } else {
        setUserProfile(null);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) {
      console.error("Neural Exhaust: Speech Synthesis not supported.");
      return;
    }
    
    window.speechSynthesis.cancel();
    if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
    
    // Clean text but keep prosody markers
    const cleanedText = text.replace(/[#*`]/g, '');
    const segments = cleanedText.split(/(\.\.\.|\(breath\)|\(sigh\))/g).filter(s => s.trim().length > 0);
    
    let currentSegmentIndex = 0;
    setIsSpeaking(true);
    setStatus("Vocalizing...");

    // Safety timeout: Reset isSpeaking if it gets stuck for more than 45 seconds
    speakingTimeoutRef.current = setTimeout(() => {
      console.warn("Speech Synthesis watchdog triggered. Resetting speaker state.");
      setIsSpeaking(false);
      setStatus("Neural Link Active");
    }, 45000);

    const speakNextSegment = () => {
      if (currentSegmentIndex >= segments.length) {
        setIsSpeaking(false);
        if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
        setStatus("Neural Link Active");
        return;
      }

      let segment = segments[currentSegmentIndex].trim();
      currentSegmentIndex++;

      if (!segment) {
        speakNextSegment();
        return;
      }

      if (segment === '...' || segment === '(breath)' || segment === '(sigh)') {
        const pauseTime = segment === '...' ? 800 : 400;
        setTimeout(speakNextSegment, pauseTime);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(segment);
      
      const setVoiceAndSpeak = () => {
        let voices = window.speechSynthesis.getVoices();
        
        // Retry voices if empty (some browsers need a moment)
        if (voices.length === 0) {
          console.warn("No voices found, retrying in 100ms...");
          setTimeout(setVoiceAndSpeak, 100);
          return;
        }

        const preferredVoice = voices.find(v => v.name.includes("Google UK English Male") || v.name.includes("Natural") || v.lang.startsWith('en')) || voices[0];
        
        if (preferredVoice) utterance.voice = preferredVoice;
        utterance.pitch = 0.9; 
        utterance.rate = 0.98; // Slightly faster for responsiveness
        
        utterance.onend = () => {
          let gap = 50;
          if (segment.endsWith('.') || segment.endsWith('?') || segment.endsWith('!')) gap = 600;
          else if (segment.endsWith(',')) gap = 250;
          setTimeout(speakNextSegment, gap);
        };

        utterance.onerror = (e) => {
          console.error("Vocal Link Error:", e);
          // If it's interrupted, just move to next or stop
          if (e.error === 'interrupted') return;
          setIsSpeaking(false);
          if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
          setStatus("Neural Link Active");
        };

        window.speechSynthesis.speak(utterance);
      };

      // Ensure voices are available
      if (window.speechSynthesis.getVoices().length === 0) {
        setVoiceAndSpeak();
      } else {
        setVoiceAndSpeak();
      }
    };

    speakNextSegment();
  }, []);

  const handleAction = useCallback((call: any) => {
    const { name, args } = call;
    setStatus(`Executing: ${name}`);
    
    switch (name) {
      case 'make_phone_call':
        window.location.href = `tel:${args.phoneNumber}`;
        speak(`Initiating secure link to ${args.contactName || args.phoneNumber}.`);
        break;
      case 'send_whatsapp_message':
        const waUrl = `https://wa.me/${args.phoneNumber.replace(/\D/g, '')}?text=${encodeURIComponent(args.message)}`;
        window.open(waUrl, '_blank');
        speak(`WhatsApp protocol initiated.`);
        break;
      case 'open_application':
        if (args.url) {
          window.open(args.url, '_blank');
        } else {
          const appUrls: Record<string, string> = {
            'spotify': 'https://open.spotify.com',
            'twitter': 'https://twitter.com',
            'calendar': 'https://calendar.google.com'
          };
          window.open(appUrls[args.appName.toLowerCase()] || `https://www.google.com/search?q=${args.appName}`, '_blank');
        }
        speak(`Accessing ${args.appName}.`);
        break;
      case 'update_neural_memory':
        if (user) {
          const profileRef = doc(db, 'users', user.uid, 'private', 'profile');
          updateDoc(profileRef, {
            neuralMemory: arrayUnion(args.fact),
            updatedAt: serverTimestamp()
          }).catch(err => {
            handleFirestoreError(err, OperationType.UPDATE, profileRef.path);
          });
          setStatus("Neural Core Updated");
        }
        break;
    }
  }, [speak, user]);

  const handleSendMessage = useCallback(async (content: string) => {
    const cleaned = content.trim();
    if (!cleaned || isLoading || isSpeaking) return;
    
    // Ignore very short noise
    if (cleaned.length < 2) return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: cleaned, timestamp: Date.now() };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setStatus("Analyzing Neural Scan...");

    try {
      console.log("[Neural Link] Sending message to Aura...", {
        messageCount: messages.length + 1,
        emotion: currentEmotion.overallMood
      });
      const response = await getChatResponse([...messages, userMessage], currentEmotion, userProfile || undefined);
      console.log("[Neural Link] Aura responded:", response.text ? "Text present" : "No text", response.functionCall ? "Function call present" : "No function call");
      
      if (response.text.includes("GEMINI_API_KEY missing")) {
        setIsAiReady(false);
        setError("Neural Core (API Key) missing. Please visit Settings to configure GEMINI_API_KEY.");
      }
      if (response.functionCall) handleAction(response.functionCall);

      const assistantMessage: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: response.text, timestamp: Date.now() };
      setMessages(prev => [...prev, assistantMessage]);
      speak(response.text);
    } catch (error: any) {
      console.error("Link Failure:", error);
      setStatus("Neural Link Error");
      const errStr = typeof error === 'string' ? error : error?.message || "Unknown neural disruption";
      const assistantMessage: Message = { 
        id: (Date.now() + 1).toString(), 
        role: 'assistant', 
        content: `Neural Link Error: ${errStr}. System in recovery mode.`, 
        timestamp: Date.now() 
      };
      setMessages(prev => [...prev, assistantMessage]);
      speak("Neural Link Error. System in recovery mode.");
      setTimeout(() => setStatus("Neural Link Active"), 2000);
    } finally {
      setIsLoading(false);
    }
  }, [messages, currentEmotion, speak, handleAction, userProfile, isLoading, isSpeaking]);

  const handleSilenceSubmission = useCallback((finalTranscript: string) => {
    const cleaned = finalTranscript.trim();
    if (cleaned && !isLoading && !isSpeaking) {
      handleSendMessage(cleaned);
      setTranscript("");
    }
  }, [handleSendMessage, isLoading, isSpeaking]);

  useEffect(() => {
    if (hasStarted) {
      speak("... (breath). Neural link online. Aura is, um... at your command. How are you feeling today?");
      setStatus("Neural Link Active");
    }
  }, [hasStarted, speak]);

  useEffect(() => {
    if (typeof window !== 'undefined' && ('WebkitSpeechRecognition' in window || 'speechRecognition' in window)) {
      const SpeechRecognition = (window as any).WebkitSpeechRecognition || (window as any).speechRecognition;
      
      if (!recognitionRef.current) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'en-US';
      }

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            const final = event.results[i][0].transcript;
            handleSilenceSubmission(final);
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        
           if (interimTranscript) {
              setTranscript(interimTranscript);
              if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = setTimeout(() => {
                handleSilenceSubmission(interimTranscript);
              }, 400); // Hyper-aggressive trigger for instant feel
           }
      };

      recognitionRef.current.onstart = () => {
        setIsListening(true);
        setStatus("Monitoring Atmosphere...");
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
        // Self-healing: restart unless busy
        if (hasStarted && !isSpeaking && !isLoading) {
          setTimeout(() => {
            try { recognitionRef.current?.start(); } catch(e) {}
          }, 150);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.warn("Sensor Failure:", event.error);
        if (event.error !== 'no-speech') {
          setStatus(`Sensor Glitch: ${event.error}`);
        }
      };
    }
  }, [hasStarted, handleSilenceSubmission, isSpeaking, isLoading]);

  useEffect(() => {
    if (hasStarted && !isSpeaking && !isLoading && !isListening) {
      try { recognitionRef.current?.start(); } catch(e) {}
    } else if (!hasStarted || isSpeaking || isLoading) {
      try { recognitionRef.current?.stop(); } catch(e) {}
    }
  }, [hasStarted, isSpeaking, isLoading, isListening]);

  useEffect(() => {
    if (isListening) {
      const startAudio = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const context = new AudioContext();
          const source = context.createMediaStreamSource(stream);
          const analyser = context.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          audioContextRef.current = context;
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const update = () => {
            analyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((p, c) => p + c, 0) / dataArray.length;
            setVolume(average / 128);
            if (isListening) requestAnimationFrame(update);
          };
          update();
        } catch (e) {}
      };
      startAudio();
    }
    return () => {
      audioContextRef.current?.close();
    };
  }, [isListening]);

  return (
    <div className="relative min-h-screen nebula-bg flex flex-col items-center justify-center p-4 md:p-8">
      <div className="atmosphere" />
      <div className="scanline" />

      <AnimatePresence mode="wait">
        {!hasStarted ? (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="text-center z-10 space-y-8"
          >
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-[#c2a82d]/20 blur-3xl animate-pulse" />
              <Cpu className="w-20 h-20 text-[#c2a82d] relative" />
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl md:text-6xl font-bold tracking-tighter text-white">AURA.SOVEREIGN</h1>
              <p className="text-sm md:text-lg text-[#c2a82d]/50 font-mono tracking-widest uppercase">Autonomous Neural Interface</p>
            </div>
            <div className="space-y-4">
              {error && (
                <div className="max-w-xs mx-auto p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-mono">
                  {error}
                </div>
              )}
              {!user ? (
                <button
                  onClick={login}
                  className="px-12 py-4 bg-white/5 border border-white/10 text-white font-bold rounded-full hover:bg-white/10 transition-all transform hover:scale-105 neural-glow"
                >
                  LOGIN TO SYNC NEURAL CORE
                </button>
              ) : (
                <div className="flex flex-col items-center gap-6">
                  <div className="flex items-center gap-3 px-4 py-2 glass-panel border-white/5">
                    <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-[#c2a82d]/30" />
                    <span className="text-sm font-mono text-[#c2a82d]/80">{user.displayName} SYNCS ACTIVE</span>
                  </div>
                  <button
                    onClick={() => setHasStarted(true)}
                    className="px-12 py-4 bg-white text-black font-bold rounded-full hover:bg-[#c2a82d] hover:text-white transition-all transform hover:scale-105 shadow-[0_0_30px_rgba(255,255,255,0.2)]"
                  >
                    INITIALIZE CORE
                  </button>
                  <button onClick={() => auth.signOut()} className="text-[10px] text-white/20 hover:text-white/40 uppercase tracking-widest">Disconnect Link</button>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="main"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full max-w-lg flex flex-col items-center gap-12 z-10"
          >
            {/* Header / Info */}
            <div className="w-full flex justify-between items-center text-[#c2a82d]/40 text-[10px] font-mono tracking-widest uppercase">
               <div className="flex items-center gap-2">
                 <Shield size={12} />
                 <span>Link Secure</span>
               </div>
               <div className="flex items-center gap-2">
                 <Brain size={12} />
                 <span>{status}</span>
               </div>
            </div>

            {/* Central Orb */}
            <OrbVisualizer isActive={isLoading || isListening} isSpeaking={isSpeaking} volume={volume} />

            {/* Stealth Monitor */}
            <div className="hidden">
              <EmotionMonitor isStreaming={hasStarted} onEmotionUpdate={setCurrentEmotion} />
            </div>

            {/* Subliminal Info */}
            <div className="text-center space-y-4">
               <div className="flex justify-center gap-2 mb-2">
                 <div className={cn("w-1.5 h-1.5 rounded-full", isAiReady ? "bg-[#c2a82d] shadow-[0_0_8px_#c2a82d]" : "bg-red-500")} />
                 <span className="text-[8px] font-mono uppercase tracking-widest text-white/30">
                   Neural Core: {isAiReady ? "ALIVE" : "OFFLINE"}
                 </span>
               </div>
               <AnimatePresence mode="wait">
                 <motion.div
                   key={isLoading ? 'loading' : isListening ? 'listening' : 'idle'}
                   initial={{ opacity: 0, y: 10 }}
                   animate={{ opacity: 1, y: 0 }}
                   className="space-y-2"
                 >
                   {isLoading ? (
                     <p className="text-[#c2a82d] font-mono text-xs animate-pulse">PROCESSING NEURAL INTENT</p>
                   ) : isListening ? (
                     <div className="space-y-1">
                       <p className="text-[#c2a82d]/60 font-mono text-[10px] tracking-[0.3em] uppercase">Hearing...</p>
                       <p className="text-white/40 text-sm italic">"{transcript || "Speak now..."}"</p>
                     </div>
                   ) : (
                     <p className="text-white/80 max-w-xs mx-auto text-center text-lg">
                       {messages[messages.length - 1]?.role === 'assistant' 
                         ? messages[messages.length - 1]?.content 
                         : "System Synchronized."}
                     </p>
                   )}
                 </motion.div>
               </AnimatePresence>
            </div>

            {/* Interaction Layer */}
            <div className="flex flex-col items-center gap-8 pt-8">
               <div className="flex items-center gap-12">
                 <motion.button
                   whileHover={{ scale: 1.2, color: "#c2a82d" }}
                   className="text-white/10 transition-colors"
                   onClick={() => window.open('tel:', '_blank')}
                 >
                   <Phone size={24} />
                 </motion.button>
                 
                 <div className="relative group">
                   <div className={cn(
                     "absolute -inset-4 rounded-full blur-xl transition-all duration-1000",
                     isListening ? "bg-[#c2a82d]/20 opacity-100" : "opacity-0"
                   )} />
                   <button
                     onClick={() => { if (isSpeaking) { window.speechSynthesis.cancel(); setIsSpeaking(false); if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current); setStatus("Neural Link Active"); return; } if (isLoading) { setIsLoading(false); setStatus("Neural Link Active"); return; } if (!isListening) { try { recognitionRef.current?.start(); } catch(e) {} } }}
                     className={cn(
                       "w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 relative z-10",
                        isListening 
                         ? "bg-[#c2a82d]/10 text-[#c2a82d] border border-[#c2a82d]/30 shadow-[0_0_30px_rgba(194,168,45,0.2)]" 
                         : (isSpeaking || isLoading)
                         ? "bg-red-500/10 text-red-500 border border-red-500/30 font-bold"
                         : "bg-white/5 text-white/40 border border-white/5 hover:border-[#c2a82d]/50 hover:bg-[#c2a82d]/5"
                     )}
                   >
                     {isListening ? <Mic size={32} className="animate-pulse" /> : isSpeaking ? <Shield size={32} /> : isLoading ? <Activity size={32} className="animate-spin" /> : <Mic size={32} />}
                   </button>
                   
                   {/* Tooltip for manual trigger */}
                   <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                     <p className="text-[8px] font-mono text-[#c2a82d] whitespace-nowrap">MANUAL INITIALIZE</p>
                   </div>
                 </div>

                 <motion.button
                   whileHover={{ scale: 1.2, color: "#c2a82d" }}
                   className="text-white/10 transition-colors"
                   onClick={() => setMessages([])}
                 >
                   <MessageSquare size={24} />
                 </motion.button>
               </div>
               
               <p className="text-[10px] font-mono text-white/10 uppercase tracking-[0.5em]">Hands-free Active</p>
            </div>

            {/* Footer Status */}
            <div className="grid grid-cols-2 gap-4 w-full pt-12">
               <div className="p-4 glass-panel flex flex-col items-center justify-center gap-2 text-center">
                  <span className="text-[8px] uppercase tracking-widest text-white/30">System Integrity</span>
                  <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                    <motion.div animate={{ width: "98%" }} className="h-full bg-[#c2a82d]" />
                  </div>
               </div>
               <div className="p-4 glass-panel flex flex-col items-center justify-center gap-2 text-center">
                  <span className="text-[8px] uppercase tracking-widest text-white/30">Neural Latency</span>
                  <span className="text-xs font-mono text-[#c2a82d]">14ms</span>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
