/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useInterval } from 'react-use';
import { EmotionData } from '../types';
import { analyzeEmotion } from '../lib/gemini';

interface Props {
  onEmotionUpdate: (data: EmotionData) => void;
  isStreaming: boolean;
}

export function EmotionMonitor({ onEmotionUpdate, isStreaming }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isStreaming) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isStreaming]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 },
        audio: false 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const captureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current || !isStreaming || isProcessing) return;

    setIsProcessing(true);
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      
      const emotionData = await analyzeEmotion(dataUrl);
      onEmotionUpdate(emotionData);
    }
    setIsProcessing(false);
  };

  // Analyze every 3 seconds for background context
  useInterval(() => {
    captureAndAnalyze();
  }, isStreaming ? 3000 : null);

  return (
    <div className="relative overflow-hidden glass-panel w-full aspect-video md:w-64 md:aspect-square group bg-white">
      {!isStreaming ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#E8E4D9]/20 text-[#2D2D2A]/30 space-y-2">
          <CameraOff size={32} />
          <span className="text-xs font-medium uppercase tracking-widest">Sense Idle</span>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover rounded-3xl"
          />
          <div className="absolute top-3 left-3 flex items-center gap-2 px-2 py-1 bg-white/80 backdrop-blur-md rounded-full border border-[#5A5A40]/10">
            <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-[#8A9A5B] animate-pulse' : 'bg-[#5A5A40]'}`} />
            <span className="text-[10px] font-bold text-[#5A5A40] uppercase tracking-tighter">
              {isProcessing ? 'Analyzing...' : 'Sentient Eye'}
            </span>
          </div>
        </>
      )}
      <canvas ref={canvasRef} className="hidden" />
      
      <AnimatePresence>
        {isStreaming && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-3 right-3"
          >
            <Sparkles className="text-[#8A9A5B] w-5 h-5 animate-pulse-soft" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
