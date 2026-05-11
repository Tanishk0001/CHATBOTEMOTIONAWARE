/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as faceapi from '@vladmandic/face-api';

let isModelLoaded = false;
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

export async function loadFaceModels() {
  if (isModelLoaded) return;
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
    ]);
    isModelLoaded = true;
    console.log("[Neural Link] Local face models synchronized.");
  } catch (err) {
    console.error("[Neural Link] Failed to load local face models:", err);
  }
}

export async function detectEmotionLocally(videoElement: HTMLVideoElement): Promise<{ emotion: string, confidence: number } | null> {
  if (!isModelLoaded) return null;

  try {
    const detection = await faceapi.detectSingleFace(
      videoElement, 
      new faceapi.TinyFaceDetectorOptions()
    ).withFaceExpressions();

    if (detection) {
      const expressions = detection.expressions;
      // Sort expressions to find the dominant one
      const sorted = Object.entries(expressions).sort((a, b) => b[1] - a[1]);
      return {
        emotion: sorted[0][0],
        confidence: sorted[0][1]
      };
    }
  } catch (err) {
    console.error("[Neural Link] Local detection failure:", err);
  }
  return null;
}
