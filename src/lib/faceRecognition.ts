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

export interface ReticleOptions {
  color?: string
  label?: string
  subLabel?: string
  showCrosshair?: boolean
  lineWidth?: number
}

/**
 * Draws four L-shaped corner reticle brackets with a center crosshair and
 * biometric tactical status badge matching the Stitch design system.
 */
export function drawCornerReticle(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; width: number; height: number },
  options: ReticleOptions = {}
): void {
  const {
    color = '#c3f400',
    label,
    subLabel,
    showCrosshair = true,
    lineWidth = 2.5,
  } = options

  const { x, y, width, height } = box
  const arm = Math.max(16, Math.min(36, Math.min(width, height) * 0.22))

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'square'
  ctx.lineJoin = 'miter'
  ctx.shadowColor = color
  ctx.shadowBlur = 6

  // 1. Four L-shaped corner brackets (⌜ ⌝ ⌞ ⌟)
  ctx.beginPath()
  // Top-Left corner
  ctx.moveTo(x, y + arm)
  ctx.lineTo(x, y)
  ctx.lineTo(x + arm, y)

  // Top-Right corner
  ctx.moveTo(x + width - arm, y)
  ctx.lineTo(x + width, y)
  ctx.lineTo(x + width, y + arm)

  // Bottom-Left corner
  ctx.moveTo(x, y + height - arm)
  ctx.lineTo(x, y + height)
  ctx.lineTo(x + arm, y + height)

  // Bottom-Right corner
  ctx.moveTo(x + width - arm, y + height)
  ctx.lineTo(x + width, y + height)
  ctx.lineTo(x + width, y + height - arm)
  ctx.stroke()

  // 2. Center target crosshair
  if (showCrosshair) {
    const cx = x + width / 2
    const cy = y + height / 2
    const crossRadius = 7
    const crossGap = 3

    ctx.lineWidth = 1.5
    ctx.shadowBlur = 4
    ctx.beginPath()
    // Horizontal
    ctx.moveTo(cx - crossRadius, cy)
    ctx.lineTo(cx - crossGap, cy)
    ctx.moveTo(cx + crossGap, cy)
    ctx.lineTo(cx + crossRadius, cy)
    // Vertical
    ctx.moveTo(cx, cy - crossRadius)
    ctx.lineTo(cx, cy - crossGap)
    ctx.moveTo(cx, cy + crossGap)
    ctx.lineTo(cx, cy + crossRadius)
    ctx.stroke()

    // Micro center node dot
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(cx, cy, 1.2, 0, Math.PI * 2)
    ctx.fill()
  }

  // 3. Status Badge Label
  if (label) {
    ctx.shadowBlur = 0
    ctx.font = '600 11px "JetBrains Mono", monospace, monospace'
    const paddingX = 8
    const badgeHeight = 20
    const fullText = subLabel ? `${label} // ${subLabel}` : label
    const textWidth = ctx.measureText(fullText).width
    const badgeWidth = textWidth + paddingX * 2
    const badgeY = Math.max(badgeHeight + 2, y - 4)

    // Dark pill container
    ctx.fillStyle = 'rgba(12, 14, 19, 0.94)'
    ctx.fillRect(x, badgeY - badgeHeight, badgeWidth, badgeHeight)

    // Left color bar accent
    ctx.fillStyle = color
    ctx.fillRect(x, badgeY - badgeHeight, 3, badgeHeight)

    // Label text
    ctx.fillStyle = color
    ctx.fillText(fullText, x + paddingX + 1, badgeY - 6)
  }

  ctx.restore()
}

export { faceapi }
