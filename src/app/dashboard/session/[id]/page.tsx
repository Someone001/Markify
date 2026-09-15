'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  loadModels,
  euclideanDistance,
  calculateEAR,
  isBlinkDetected,
  EAR_BLINK_THRESHOLD,
  faceapi,
} from '@/lib/faceRecognition'
import { confirmAttendance } from '@/lib/hashChain'
import type { Student, Session, Attendance } from '@/types/database'

interface ConfirmedItem {
  student: Student
  attendanceRecord?: Attendance
  confirmedAt: Date
  confidence: number
  hash?: string
  prevHash?: string | null
}

interface WaitingItem {
  student: Student
  firstSeen: number
  lastSeen: number
  currentEAR: number
  confidence: number
  isEyesClosed: boolean
}

export default function SessionLivePage({ params }: { params: { id: string } }) {
  const sessionId = params.id

  // Session & database state
  const [session, setSession] = useState<Session | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [modelsReady, setModelsReady] = useState(false)

  // Camera & Detection state
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [streamActive, setStreamActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [detectedFacesCount, setDetectedFacesCount] = useState(0)
  const [fps, setFps] = useState(0)

  // Attendance tracking state
  const [confirmedRecords, setConfirmedRecords] = useState<ConfirmedItem[]>([])
  const confirmedStudentIdsRef = useRef<Set<string>>(new Set())
  const isConfirmingRef = useRef<Set<string>>(new Set())

  // Waiting for blink tracking
  const [waitingStudents, setWaitingStudents] = useState<Record<string, WaitingItem>>({})
  const earBuffersRef = useRef<Map<string, number[]>>(new Map())

  // Toast feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null)

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev))
    }, 4000)
  }, [])

  // Audio chime for confirmation
  const playChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AudioCtx) return
      const audioCtx = new AudioCtx()
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime) // C5
      osc.frequency.exponentialRampToValueAtTime(783.99, audioCtx.currentTime + 0.12) // G5
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.28)
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start()
      osc.stop(audioCtx.currentTime + 0.28)
    } catch {
      // Audio not allowed without prior interaction
    }
  }, [])

  // 1. Load Models on Mount
  useEffect(() => {
    let active = true
    async function initModels() {
      try {
        await loadModels()
        if (active) setModelsReady(true)
      } catch (err) {
        console.error('Failed to load face detection models:', err)
      }
    }
    initModels()
    return () => {
      active = false
    }
  }, [])

  // 2. Fetch Session, Enrolled Students, and Existing Attendance from Supabase
  useEffect(() => {
    let active = true
    async function fetchData() {
      setLoadingInitial(true)
      try {
        const supabase = createClient()

        // Fetch Session Details
        const { data: sessionData, error: sessionErr } = await supabase
          .from('sessions')
          .select('*')
          .eq('id', sessionId)
          .single()

        if (sessionErr) throw sessionErr
        if (active) setSession(sessionData)

        // Fetch Enrolled Students
        const { data: studentsData, error: studentsErr } = await supabase
          .from('students')
          .select('*')
          .order('name', { ascending: true })

        if (studentsErr) throw studentsErr
        const studentList = studentsData || []
        if (active) setStudents(studentList)

        // Fetch Existing Confirmed Attendance for this session
        const { data: existingAttendance, error: attErr } = await supabase
          .from('attendance')
          .select('*')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: false })

        if (!attErr && existingAttendance && active) {
          const studentMap = new Map(studentList.map((s) => [s.id, s]))
          const restored: ConfirmedItem[] = []

          for (const att of existingAttendance) {
            if (att.student_id && studentMap.has(att.student_id)) {
              confirmedStudentIdsRef.current.add(att.student_id)
              restored.push({
                student: studentMap.get(att.student_id)!,
                attendanceRecord: att,
                confirmedAt: new Date(att.timestamp || att.created_at),
                confidence: Math.round((att.confidence || 0.9) * 100),
                hash: att.hash,
                prevHash: att.prev_hash,
              })
            }
          }
          setConfirmedRecords(restored)
        }
      } catch (err) {
        console.error('Error fetching session data:', err)
      } finally {
        if (active) setLoadingInitial(false)
      }
    }

    fetchData()
    return () => {
      active = false
    }
  }, [sessionId])

  // 3. Start Webcam
  const startCamera = useCallback(async () => {
    setCameraError(null)
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Webcam API is not supported in this browser.')
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
          frameRate: { ideal: 30 },
        },
        audio: false,
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        setStreamActive(true)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to access camera.'
      setCameraError(msg)
      setStreamActive(false)
    }
  }, [])

  // Stop Webcam
  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach((track) => track.stop())
      videoRef.current.srcObject = null
    }
    setStreamActive(false)
    setDetectedFacesCount(0)

    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    }
  }, [])

  useEffect(() => {
    if (modelsReady && !loadingInitial) {
      startCamera()
    }
    return () => {
      stopCamera()
    }
  }, [modelsReady, loadingInitial, startCamera, stopCamera])

  // Liveness Confirmation Handler (Writes to Supabase with SHA-256 Hash Chain)
  const handleConfirmAttendance = useCallback(
    async (student: Student, confidence: number) => {
      if (confirmedStudentIdsRef.current.has(student.id)) return
      if (isConfirmingRef.current.has(student.id)) return

      isConfirmingRef.current.add(student.id)

      try {
        const confDecimal = confidence / 100
        const result = await confirmAttendance(student.id, sessionId, confDecimal)

        if (result.success) {
          confirmedStudentIdsRef.current.add(student.id)
          earBuffersRef.current.delete(student.id)

          const newConfirmed: ConfirmedItem = {
            student,
            attendanceRecord: result.record,
            confirmedAt: new Date(),
            confidence,
            hash: result.record?.hash,
            prevHash: result.record?.prev_hash,
          }

          setConfirmedRecords((prev) => [newConfirmed, ...prev.filter((r) => r.student.id !== student.id)])
          setWaitingStudents((prev) => {
            const copy = { ...prev }
            delete copy[student.id]
            return copy
          })

          playChime()
          showToast(`Liveness verified: ${student.name} confirmed present!`, 'success')
        } else {
          showToast(`Error confirming ${student.name}: ${result.error}`, 'error')
        }
      } catch (err) {
        console.error('Attendance write error:', err)
      } finally {
        isConfirmingRef.current.delete(student.id)
      }
    },
    [sessionId, playChime, showToast]
  )

  // 4. Fast Detection & Recognition Loop with EAR Blink Liveness
  useEffect(() => {
    let isMounted = true
    let isProcessing = false
    let frameCount = 0
    let lastFpsTime = performance.now()

    const runDetectionCycle = async () => {
      if (
        !isMounted ||
        isProcessing ||
        !streamActive ||
        !modelsReady ||
        !videoRef.current ||
        !canvasRef.current ||
        videoRef.current.readyState < 2
      ) {
        return
      }

      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      if (!ctx || !video.videoWidth || !video.videoHeight) return

      const displaySize = { width: video.videoWidth, height: video.videoHeight }
      if (canvas.width !== displaySize.width || canvas.height !== displaySize.height) {
        faceapi.matchDimensions(canvas, displaySize)
      }

      isProcessing = true

      try {
        // Track processing FPS
        frameCount++
        const now = performance.now()
        if (now - lastFpsTime >= 1000) {
          setFps(Math.round((frameCount * 1000) / (now - lastFpsTime)))
          frameCount = 0
          lastFpsTime = now
        }

        // Detect all faces with landmarks and descriptors
        const detections = await faceapi
          .detectAllFaces(
            video,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.32 })
          )
          .withFaceLandmarks()
          .withFaceDescriptors()

        setDetectedFacesCount(detections.length)
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        const currentFrameWaiting: Record<string, WaitingItem> = {}

        if (detections.length > 0) {
          const resizedDetections = faceapi.resizeResults(detections, displaySize)

          for (const detection of resizedDetections) {
            const descriptor = detection.descriptor
            const landmarks = detection.landmarks
            const box = detection.detection.box

            // Find closest match among enrolled students
            let bestMatch: Student | null = null
            let minDistance = Infinity

            for (const student of students) {
              if (!student.embedding || student.embedding.length !== 128) continue
              const dist = euclideanDistance(descriptor, student.embedding)
              if (dist < minDistance) {
                minDistance = dist
                bestMatch = student
              }
            }

            const isMatch = minDistance < 0.5 && bestMatch !== null

            if (isMatch && bestMatch) {
              const studentId = bestMatch.id
              const isAlreadyConfirmed = confirmedStudentIdsRef.current.has(studentId)

              // Compute Eye Aspect Ratio (EAR) for liveness
              const ear = calculateEAR(landmarks)
              const confidence = Math.max(0, Math.min(100, Math.round((1 - minDistance / 0.6) * 100)))
              const isEyesClosed = ear < EAR_BLINK_THRESHOLD

              if (isAlreadyConfirmed) {
                // CASE 1: ALREADY CONFIRMED PRESENT -> Green Box
                ctx.strokeStyle = '#10b981'
                ctx.lineWidth = 3
                ctx.strokeRect(box.x, box.y, box.width, box.height)

                const label = `${bestMatch.name} (${bestMatch.roll_no}) - Confirmed ✓`
                ctx.font = 'bold 12px sans-serif'
                const textWidth = ctx.measureText(label).width
                const tagY = Math.max(22, box.y)
                ctx.fillStyle = 'rgba(16, 185, 129, 0.95)'
                ctx.fillRect(box.x, tagY - 22, textWidth + 14, 22)
                ctx.fillStyle = '#ffffff'
                ctx.fillText(label, box.x + 7, tagY - 6)
              } else {
                // CASE 2: MATCHED BUT NOT CONFIRMED YET -> Buffer EAR & Check for Blink
                const buffer = earBuffersRef.current.get(studentId) || []
                buffer.push(ear)
                if (buffer.length > 20) buffer.shift()
                earBuffersRef.current.set(studentId, buffer)

                // Detect Blink using robust absolute & relative drop criteria
                const hasBlink = isBlinkDetected(buffer)

                if (hasBlink) {
                  // Blink detected! Liveness confirmed!
                  earBuffersRef.current.delete(studentId)

                  // Render confirmation box
                  ctx.strokeStyle = '#10b981'
                  ctx.lineWidth = 4
                  ctx.strokeRect(box.x, box.y, box.width, box.height)

                  const label = `${bestMatch.name} - Blink Confirmed ✓`
                  ctx.font = 'bold 12px sans-serif'
                  const textWidth = ctx.measureText(label).width
                  const tagY = Math.max(22, box.y)
                  ctx.fillStyle = 'rgba(16, 185, 129, 0.95)'
                  ctx.fillRect(box.x, tagY - 22, textWidth + 14, 22)
                  ctx.fillStyle = '#ffffff'
                  ctx.fillText(label, box.x + 7, tagY - 6)

                  // Trigger asynchronous hash-chain write
                  handleConfirmAttendance(bestMatch, confidence)
                } else if (isEyesClosed) {
                  // Eyes currently closed -> Cyan Box (Visual immediate feedback!)
                  currentFrameWaiting[studentId] = {
                    student: bestMatch,
                    firstSeen: Date.now(),
                    lastSeen: Date.now(),
                    currentEAR: ear,
                    confidence,
                    isEyesClosed: true,
                  }

                  ctx.strokeStyle = '#06b6d4'
                  ctx.lineWidth = 3
                  ctx.strokeRect(box.x, box.y, box.width, box.height)

                  const label = `${bestMatch.name} - Eyes Closed (EAR: ${ear.toFixed(2)}) → Reopen to confirm`
                  ctx.font = 'bold 12px sans-serif'
                  const textWidth = ctx.measureText(label).width
                  const tagY = Math.max(22, box.y)
                  ctx.fillStyle = 'rgba(6, 182, 212, 0.95)'
                  ctx.fillRect(box.x, tagY - 22, textWidth + 14, 22)
                  ctx.fillStyle = '#083344'
                  ctx.fillText(label, box.x + 7, tagY - 6)
                } else {
                  // Eyes open, waiting for blink -> Amber Box
                  currentFrameWaiting[studentId] = {
                    student: bestMatch,
                    firstSeen: Date.now(),
                    lastSeen: Date.now(),
                    currentEAR: ear,
                    confidence,
                    isEyesClosed: false,
                  }

                  ctx.strokeStyle = '#f59e0b'
                  ctx.lineWidth = 3
                  ctx.strokeRect(box.x, box.y, box.width, box.height)

                  // Corner indicators
                  ctx.fillStyle = '#fbbf24'
                  const cs = 7
                  ctx.fillRect(box.x - 2, box.y - 2, cs, cs)
                  ctx.fillRect(box.x + box.width - cs + 2, box.y - 2, cs, cs)
                  ctx.fillRect(box.x - 2, box.y + box.height - cs + 2, cs, cs)
                  ctx.fillRect(box.x + box.width - cs + 2, box.y + box.height - cs + 2, cs, cs)

                  const label = `${bestMatch.name} (${bestMatch.roll_no}) - Blink eyes to confirm (EAR: ${ear.toFixed(2)})`
                  ctx.font = 'bold 12px sans-serif'
                  const textWidth = ctx.measureText(label).width
                  const tagY = Math.max(22, box.y)
                  ctx.fillStyle = 'rgba(245, 158, 11, 0.95)'
                  ctx.fillRect(box.x, tagY - 22, textWidth + 14, 22)
                  ctx.fillStyle = '#1e1e1e'
                  ctx.fillText(label, box.x + 7, tagY - 6)
                }
              }
            } else {
              // CASE 3: UNKNOWN FACE -> Red Box
              ctx.strokeStyle = '#ef4444'
              ctx.lineWidth = 3
              ctx.strokeRect(box.x, box.y, box.width, box.height)

              const label = 'Unknown Face'
              ctx.font = 'bold 12px sans-serif'
              const textWidth = ctx.measureText(label).width
              const tagY = Math.max(22, box.y)
              ctx.fillStyle = 'rgba(239, 68, 68, 0.92)'
              ctx.fillRect(box.x, tagY - 22, textWidth + 14, 22)
              ctx.fillStyle = '#ffffff'
              ctx.fillText(label, box.x + 7, tagY - 6)
            }
          }
        }

        // Update waiting list
        setWaitingStudents((prev) => {
          const updated = { ...prev }
          for (const [id, item] of Object.entries(currentFrameWaiting)) {
            updated[id] = item
          }
          const now = Date.now()
          for (const [id, item] of Object.entries(updated)) {
            if (confirmedStudentIdsRef.current.has(id) || now - item.lastSeen > 3500) {
              delete updated[id]
            }
          }
          return updated
        })
      } catch {
        // Ignore transient frame parsing errors
      } finally {
        isProcessing = false
      }
    }

    // High-cadence loop: executes next cycle with a minimal 50ms pause
    let timeoutId: NodeJS.Timeout
    const loop = async () => {
      if (!isMounted) return
      await runDetectionCycle()
      if (isMounted) {
        timeoutId = setTimeout(loop, 45)
      }
    }

    if (streamActive && modelsReady && students.length > 0) {
      loop()
    }

    return () => {
      isMounted = false
      clearTimeout(timeoutId)
    }
  }, [streamActive, modelsReady, students, handleConfirmAttendance])

  const waitingList = Object.values(waitingStudents).filter(
    (w) => !confirmedStudentIdsRef.current.has(w.student.id)
  )

  return (
    <div className="space-y-6 pb-16">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-950/95 border-emerald-500/40 text-emerald-200'
              : toast.type === 'error'
              ? 'bg-red-950/95 border-red-500/40 text-red-200'
              : 'bg-indigo-950/95 border-indigo-500/40 text-indigo-200'
          }`}
        >
          <span className="text-base">
            {toast.type === 'success' ? '✓' : toast.type === 'error' ? '⚠️' : 'ℹ️'}
          </span>
          <span className="text-xs font-medium">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 text-xs opacity-60 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* Top Breadcrumb & Session Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Link href="/dashboard/session" className="hover:text-indigo-400 transition">
              ← All Sessions
            </Link>
            <span>/</span>
            <span className="text-slate-300 font-mono text-[11px] truncate max-w-xs">{sessionId}</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <span>{session?.class_name || 'Live Attendance Session'}</span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Liveness Active
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <span className="text-slate-400">Enrolled in DB:</span>
            <span className="font-semibold text-white">{students.length} students</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Video Stream + Live Present Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Video Viewport */}
        <div className="lg:col-span-8 space-y-4">
          <div className="relative aspect-video w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center">
            {cameraError ? (
              <div className="text-center p-6 space-y-2">
                <div className="text-red-400 text-3xl mb-2">📷</div>
                <h3 className="text-sm font-semibold text-white">Camera Access Error</h3>
                <p className="text-xs text-slate-400 max-w-sm">{cameraError}</p>
                <button
                  onClick={startCamera}
                  className="mt-3 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition"
                >
                  Retry Camera
                </button>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                />

                {/* Floating Telemetry Badges */}
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-950/80 backdrop-blur-md border border-slate-700/60 text-xs">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        detectedFacesCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                      }`}
                    />
                    <span className="text-slate-200 font-medium">
                      {detectedFacesCount} {detectedFacesCount === 1 ? 'Face' : 'Faces'}
                    </span>
                  </div>

                  {fps > 0 && (
                    <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-950/80 backdrop-blur-md border border-indigo-700/60 text-[11px] text-indigo-300 font-mono">
                      <span>⚡ {fps} FPS</span>
                    </div>
                  )}
                </div>

                {/* Bottom Overlay Legend */}
                <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between text-[11px] px-3 py-1.5 rounded-xl bg-slate-950/85 backdrop-blur-md border border-slate-800 text-slate-300 gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
                      Waiting for Blink
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400" />
                      Eyes Closed
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                      Confirmed
                    </span>
                  </div>

                  <span className="text-slate-400 font-mono text-[10px]">
                    Blink / Close eyes briefly
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Camera Controls & Security Tip */}
          <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 p-3 rounded-xl text-xs">
            <div className="flex items-center gap-3">
              {streamActive ? (
                <button
                  type="button"
                  onClick={stopCamera}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  Pause Stream
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startCamera}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
                >
                  Resume Stream
                </button>
              )}
            </div>

            <div className="text-slate-400 text-[11px] flex items-center gap-1.5">
              <span>💡 Tip:</span>
              <span className="text-slate-300">Blink naturally or close eyes for ~0.5s. You can also manually confirm in the sidebar.</span>
            </div>
          </div>
        </div>

        {/* Right: Live Attendance Sidebar */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col h-full min-h-[500px]">
            {/* Sidebar Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Attendance Record</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {confirmedRecords.length} Confirmed
                  </span>
                </h2>
                <p className="text-[11px] text-slate-400">Cryptographically chained via SHA-256</p>
              </div>

              <div className="text-right">
                <span className="text-xs font-mono font-medium text-indigo-400">
                  {students.length > 0
                    ? `${Math.round((confirmedRecords.length / students.length) * 100)}%`
                    : '0%'}
                </span>
                <span className="text-[10px] text-slate-500 block">Attendance</span>
              </div>
            </div>

            {/* List Containers */}
            <div className="flex-1 overflow-y-auto space-y-4 max-h-[560px] pr-1">
              {/* SECTION A: Waiting for Blink */}
              {waitingList.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-amber-400 uppercase tracking-wider px-1">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                      Detected — Blink to Verify ({waitingList.length})
                    </span>
                  </div>

                  <div className="space-y-2">
                    {waitingList.map((item) => (
                      <div
                        key={item.student.id}
                        className={`p-3 rounded-xl border transition-all ${
                          item.isEyesClosed
                            ? 'bg-cyan-950/30 border-cyan-500/50'
                            : 'bg-amber-950/20 border-amber-500/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-white block truncate">
                              {item.student.name}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              {item.student.roll_no}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleConfirmAttendance(item.student, item.confidence)}
                            className="px-2.5 py-1 rounded bg-indigo-600/80 hover:bg-indigo-500 text-white text-[11px] font-medium transition shadow-sm"
                            title="Bypass blink and mark present immediately"
                          >
                            Confirm Now
                          </button>
                        </div>

                        {/* Live EAR Meter */}
                        <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px]">
                          <span className={item.isEyesClosed ? 'text-cyan-400 font-semibold' : 'text-amber-300'}>
                            {item.isEyesClosed ? '😑 Eyes Closed detected!' : '👁️ Blink eyes now'}
                          </span>
                          <span className="font-mono text-slate-400">
                            EAR: <span className="text-white font-bold">{item.currentEAR.toFixed(2)}</span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SECTION B: Confirmed Present Students */}
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider px-1">
                  Confirmed Present ({confirmedRecords.length})
                </div>

                {confirmedRecords.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center p-8 text-slate-400 space-y-2 border border-dashed border-slate-800 rounded-xl">
                    <div className="text-2xl opacity-40">👤</div>
                    <p className="text-xs font-medium text-slate-300">No confirmed attendance yet</p>
                    <p className="text-[11px] text-slate-500 max-w-xs">
                      Look into the camera and blink naturally to complete liveness verification.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {confirmedRecords.map((record) => (
                      <div
                        key={record.student.id}
                        className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl hover:border-emerald-500/40 transition flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white truncate">
                              {record.student.name}
                            </span>
                            <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-900/60">
                              {record.student.roll_no}
                            </span>
                          </div>

                          <div className="flex items-center gap-2.5 mt-1 text-[10px] text-slate-400">
                            <span className="text-emerald-400 font-medium flex items-center gap-1">
                              <span>✓</span> Present
                            </span>
                            <span>•</span>
                            <span>{record.confidence}% match</span>
                            <span>•</span>
                            <span>
                              {record.confirmedAt.toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </span>
                          </div>

                          {record.hash && (
                            <div className="mt-1 font-mono text-[9px] text-slate-400 truncate" title={`Hash: ${record.hash}`}>
                              Hash: {record.hash.slice(0, 14)}...
                            </div>
                          )}
                        </div>

                        <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold border border-emerald-500/30">
                          ✓
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
