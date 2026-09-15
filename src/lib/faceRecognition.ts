import * as faceapi from 'face-api.js'

let modelsLoaded = false
let loadingPromise: Promise<void> | null = null

export const EAR_BLINK_THRESHOLD = 0.27

export async function loadModels(): Promise<void> {
  if (typeof window === 'undefined') return
  if (modelsLoaded) return
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    const MODEL_URL = '/models'
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
    ])
    modelsLoaded = true
  })()

  return loadingPromise
}

export async function getFaceDescriptor(
  input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): Promise<Float32Array | null> {
  await loadModels()

  // First attempt with TinyFaceDetector
  let detection = await faceapi
    .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.4 }))
    .withFaceLandmarks()
    .withFaceDescriptor()

  // Fallback to SSD Mobilenet if available
  if (!detection) {
    detection = await faceapi
      .detectSingleFace(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptor()
  }

  return detection ? detection.descriptor : null
}

export function euclideanDistance(
  a: number[] | Float32Array,
  b: number[] | Float32Array
): number {
  if (!a || !b || a.length !== b.length) {
    if (!a || !b) return Infinity
    const len = Math.min(a.length, b.length)
    let sum = 0
    for (let i = 0; i < len; i++) {
      const diff = a[i] - b[i]
      sum += diff * diff
    }
    return Math.sqrt(sum)
  }

  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i]
    sum += diff * diff
  }
  return Math.sqrt(sum)
}

/**
 * Calculates the Eye Aspect Ratio (EAR) from 68-point facial landmarks.
 * Computes average EAR across both eyes using Soukupová & Čech formula.
 */
export function calculateEAR(landmarks: faceapi.FaceLandmarks68): number {
  if (!landmarks || typeof landmarks.getLeftEye !== 'function') return 0

  const leftEye = landmarks.getLeftEye()
  const rightEye = landmarks.getRightEye()

  const eyeEAR = (eye: { x: number; y: number }[]): number => {
    if (!eye || eye.length < 6) return 0
    // Landmark points: [p1, p2, p3, p4, p5, p6]
    // Vertical distances: p2-p6 and p3-p5
    const v1 = Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y)
    const v2 = Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y)
    // Horizontal distance: p1-p4
    const h = Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y)
    if (h === 0) return 0
    return (v1 + v2) / (2.0 * h)
  }

  const leftEAR = eyeEAR(leftEye)
  const rightEAR = eyeEAR(rightEye)

  return (leftEAR + rightEAR) / 2.0
}

/**
 * Robust blink detection supporting both absolute EAR threshold and relative drop from baseline.
 * Detects blinks across diverse eye shapes and lighting conditions while rejecting static photos.
 */
export function isBlinkDetected(earBuffer: number[]): boolean {
  if (earBuffer.length < 2) return false

  const maxEAR = Math.max(...earBuffer)
  const minEAR = Math.min(...earBuffer)
  const currentEAR = earBuffer[earBuffer.length - 1]

  // Criterion A: Absolute drop below threshold, then reopened
  let hadAbsoluteDrop = false
  for (let i = 0; i < earBuffer.length - 1; i++) {
    if (earBuffer[i] < EAR_BLINK_THRESHOLD) {
      hadAbsoluteDrop = true
      break
    }
  }
  const absoluteBlink = hadAbsoluteDrop && currentEAR >= EAR_BLINK_THRESHOLD - 0.02

  // Criterion B: Adaptive relative drop (at least 20% drop from recent open-eye baseline)
  const relativeDrop = maxEAR >= 0.18 && minEAR <= maxEAR * 0.80
  const reopened = currentEAR >= minEAR + 0.035

  return absoluteBlink || (relativeDrop && reopened)
}

export { faceapi }
