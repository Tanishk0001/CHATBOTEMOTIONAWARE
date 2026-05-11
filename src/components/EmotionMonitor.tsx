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
import { loadFaceModels, detectEmotionLocally } from '../lib/faceDetector';

interface Props {
  onEmotionUpdate: (data: EmotionData) => void;
  isStreaming: boolean;
}

export function EmotionMonitor({ onEmotionUpdate, isStreaming }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLocalModelReady, setIsLocalModelReady] = useState(false);

  useEffect(() => {
    loadFaceModels().then(() => setIsLocalModelReady(true));
  }, []);

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
    
    // 1. Try local detection first (Fast, No Quota)
    if (isLocalModelReady) {
      const localResult = await detectEmotionLocally(videoRef.current);
      if (localResult && localResult.confidence > 0.6) {
        onEmotionUpdate({
          facialEmotion: localResult.emotion,
          vocalTone: 'Analyzing...',
          overallMood: localResult.emotion.toUpperCase(),
          confidence: localResult.confidence
        });
        // We still occasionally want Gemini for "deeper" context, 
        // but we can skip it for simple expression updates.
        setIsProcessing(false);
        return;
      }
    }

    // 2. Fallback to Gemini if local fails or is unconfident
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      
      try {
        const emotionData = await analyzeEmotion(dataUrl);
        onEmotionUpdate(emotionData);
      } catch (err) {
        console.warn("[Neural Link] Gemini scan skipped or failed.");
      }
    }
    setIsProcessing(false);
  };

  // Analyze every 5 seconds (mixed mode)
  useInterval(() => {
    captureAndAnalyze();
  }, isStreaming ? 5000 : null);

  return (
    <div className="hidden opacity-0 pointer-events-none absolute -z-50">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-1 h-1"
      />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
