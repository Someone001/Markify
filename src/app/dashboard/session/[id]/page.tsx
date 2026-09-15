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
import {
  confirmAttendance,
  confirmManualOverride,
  confirmManualFallback,
} from '@/lib/hashChain'
import type { Student, Session, Attendance, AttendanceStatus } from '@/types/database'

interface ConfirmedItem {
  student: Student
  attendanceRecord?: Attendance
  confirmedAt: Date
  confidence: number | null
  status: AttendanceStatus
  hash?: string
  prevHash?: string | null
  overriddenBy?: string | null
}

interface WaitingItem {
  student: Student
  firstSeen: number
  lastSeen: number
  currentEAR: number
  confidence: number
  isEyesClosed: boolean
}

interface ReviewItem {
  student: Student
  firstSeen: number
  lastSeen: number
  confidence: number
  distance: number
  selectedStudentId: string
}

export default function SessionLivePage({ params }: { params: { id: string } }) {
  const sessionId = params.id

  // Session & database state
  const [session, setSession] = useState<Session | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [modelsReady, setModelsReady] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Camera & Detection state
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [streamActive, setStreamActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [detectedFacesCount, setDetectedFacesCount] = useState(0)
  const [fps, setFps] = useState(0)

  // Degraded Mode (Fallback to Manual Roll Call)
  const [isDegradedMode, setIsDegradedMode] = useState(false)
  const [degradedReason, setDegradedReason] = useState<string | null>(null)
  const [checklistSelection, setChecklistSelection] = useState<Record<string, boolean>>({})
  const [submittingRollCall, setSubmittingRollCall] = useState(false)

  // Attendance tracking state
  const [confirmedRecords, setConfirmedRecords] = useState<ConfirmedItem[]>([])
  const confirmedStudentIdsRef = useRef<Set<string>>(new Set())
  const isConfirmingRef = useRef<Set<string>>(new Set())

  // Waiting for blink tracking
  const [waitingStudents, setWaitingStudents] = useState<Record<string, WaitingItem>>({})
  const earBuffersRef = useRef<Map<string, number[]>>(new Map())

  // Needs Review (Manual Override for Low Confidence: 0.5 <= distance <= 0.6)
  const [reviewStudents, setReviewStudents] = useState<Record<string, ReviewItem>>({})
  const [processingOverrideId, setProcessingOverrideId] = useState<string | null>(null)

  // Toast feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null)

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev))
    }, 4500)
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
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(783.99, audioCtx.currentTime + 0.12)
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.28)
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start()
      osc.stop(audioCtx.currentTime + 0.28)
    } catch {
      // Audio not allowed without interaction
    }
  }, [])

  // 1. Load Models on Mount with graceful degradation catch
  useEffect(() => {
    let active = true
    async function initModels() {
      try {
        await loadModels()
        if (active) setModelsReady(true)
      } catch (err: unknown) {
        console.error('Failed to load face detection models:', err)
        if (active) {
          setIsDegradedMode(true)
          setDegradedReason('Face recognition models failed to load. Switched to manual roll call.')
        }
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

        // Get current user id
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (user && active) {
          setCurrentUserId(user.id)
        }

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
                confidence: att.confidence !== null ? Math.round(att.confidence * 100) : null,
                status: att.status as AttendanceStatus,
                hash: att.hash,
                prevHash: att.prev_hash,
                overriddenBy: att.overridden_by,
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

  // 3. Start Webcam with Try/Catch for Degraded Mode Fallback
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
        setIsDegradedMode(false)
        setDegradedReason(null)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Camera unavailable or permission denied.'
      console.warn('Camera initialization notice:', msg)
      setCameraError(msg)
      setStreamActive(false)
      setIsDegradedMode(true)
      setDegradedReason('Camera unavailable or permission denied — switched to manual roll call.')
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
    if (modelsReady && !loadingInitial && !isDegradedMode) {
      startCamera()
    }
    return () => {
      stopCamera()
    }
  }, [modelsReady, loadingInitial, isDegradedMode, startCamera, stopCamera])

  // Liveness Attendance Confirmation (status='present')
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
            status: 'present',
            hash: result.record?.hash,
            prevHash: result.record?.prev_hash,
          }

          setConfirmedRecords((prev) => [newConfirmed, ...prev.filter((r) => r.student.id !== student.id)])
          setWaitingStudents((prev) => {
            const copy = { ...prev }
            delete copy[student.id]
            return copy
          })
          setReviewStudents((prev) => {
            const copy = { ...prev }
            delete copy[student.id]
            return copy
          })

          playChime()
          showToast(`Liveness verified: ${student.name} marked present!`, 'success')
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

  // PART A — Manual Override Confirmation (status='manual_override')
  const handleConfirmManualOverride = async (reviewKey: string) => {
    const item = reviewStudents[reviewKey]
    if (!item) return

    const targetStudentId = item.selectedStudentId
    if (targetStudentId === 'skip') {
      // Dismiss review item
      setReviewStudents((prev) => {
        const copy = { ...prev }
        delete copy[reviewKey]
        return copy
      })
      showToast('Dismissed review item.', 'info')
      return
    }

    const targetStudent = students.find((s) => s.id === targetStudentId)
    if (!targetStudent) return

    setProcessingOverrideId(reviewKey)

    try {
      const confDecimal = item.confidence / 100
      const result = await confirmManualOverride(
        targetStudentId,
        sessionId,
        confDecimal,
        currentUserId || ''
      )

      if (result.success) {
        confirmedStudentIdsRef.current.add(targetStudentId)
        earBuffersRef.current.delete(targetStudentId)

        const newConfirmed: ConfirmedItem = {
          student: targetStudent,
          attendanceRecord: result.record,
          confirmedAt: new Date(),
          confidence: item.confidence,
          status: 'manual_override',
          hash: result.record?.hash,
          prevHash: result.record?.prev_hash,
          overriddenBy: currentUserId,
        }

        setConfirmedRecords((prev) => [newConfirmed, ...prev.filter((r) => r.student.id !== targetStudentId)])
        setReviewStudents((prev) => {
          const copy = { ...prev }
          delete copy[reviewKey]
          return copy
        })

        playChime()
        showToast(`Manual override confirmed for ${targetStudent.name}!`, 'success')
      } else {
        showToast(`Error saving override: ${result.error}`, 'error')
      }
    } catch (err) {
      console.error('Manual override error:', err)
      showToast('Failed to save manual override.', 'error')
    } finally {
      setProcessingOverrideId(null)
    }
  }

  // PART B — Manual Fallback Roll-Call Submission (status='manual_fallback')
  const handleSubmitRollCall = async () => {
    const selectedIds = Object.entries(checklistSelection)
      .filter(([id, selected]) => selected && !confirmedStudentIdsRef.current.has(id))
      .map(([id]) => id)

    if (selectedIds.length === 0) {
      showToast('Please select at least one unmarked student.', 'info')
      return
    }

    setSubmittingRollCall(true)

    try {
      let successCount = 0

      for (const studentId of selectedIds) {
        const student = students.find((s) => s.id === studentId)
        if (!student) continue

        const result = await confirmManualFallback(studentId, sessionId, currentUserId || '')

        if (result.success) {
          confirmedStudentIdsRef.current.add(studentId)
          successCount++

          const newConfirmed: ConfirmedItem = {
            student,
            attendanceRecord: result.record,
            confirmedAt: new Date(),
            confidence: null,
            status: 'manual_fallback',
            hash: result.record?.hash,
            prevHash: result.record?.prev_hash,
            overriddenBy: currentUserId,
          }

          setConfirmedRecords((prev) => [newConfirmed, ...prev.filter((r) => r.student.id !== studentId)])
        }
      }

      playChime()
      showToast(`Roll call submitted: ${successCount} student(s) marked present.`, 'success')
      setChecklistSelection({})
    } catch (err) {
      console.error('Roll call submit error:', err)
      showToast('Error during roll call submission.', 'error')
    } finally {
      setSubmittingRollCall(false)
    }
  }

  // 4. Detection & Recognition Loop with Multi-Face, Blink Liveness, and Low-Confidence Borderline Handling
  useEffect(() => {
    if (isDegradedMode) return

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
        frameCount++
        const now = performance.now()
        if (now - lastFpsTime >= 1000) {
          setFps(Math.round((frameCount * 1000) / (now - lastFpsTime)))
          frameCount = 0
          lastFpsTime = now
        }

        // Detect all faces
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
        const currentFrameReview: Record<string, ReviewItem> = {}

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

            // Console log raw distance for closest match on every detection cycle
            const categoryLabel =
              minDistance < 0.5
                ? 'GREEN (<0.50 match)'
                : minDistance <= 0.6
                ? 'BLUE (0.50-0.60 low-confidence review)'
                : 'RED (>0.60 unknown)'

            console.log(
              `[Face Match] Name: "${bestMatch?.name || 'None'}" (${bestMatch?.roll_no || '-'}) | Raw Dist: ${minDistance === Infinity ? 'Infinity' : minDistance.toFixed(4)} | Category: ${categoryLabel}`
            )

            // CASE 1: High Confidence Match (distance < 0.50) -> Green/Amber
            if (minDistance < 0.5 && bestMatch) {
              const studentId = bestMatch.id
              const isAlreadyConfirmed = confirmedStudentIdsRef.current.has(studentId)

              const ear = calculateEAR(landmarks)
              const confidence = Math.max(0, Math.min(100, Math.round((1 - minDistance / 0.6) * 100)))
              const isEyesClosed = ear < EAR_BLINK_THRESHOLD

              if (isAlreadyConfirmed) {
                // Confirmed Present -> Green Box
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
                // Buffer EAR & Check Blink
                const buffer = earBuffersRef.current.get(studentId) || []
                buffer.push(ear)
                if (buffer.length > 20) buffer.shift()
                earBuffersRef.current.set(studentId, buffer)

                const hasBlink = isBlinkDetected(buffer)

                if (hasBlink) {
                  earBuffersRef.current.delete(studentId)

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

                  handleConfirmAttendance(bestMatch, confidence)
                } else if (isEyesClosed) {
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
            }
            // CASE 2: Borderline Low Confidence Match (0.50 <= distance <= 0.60) -> Distinct Blue Box & Needs Review
            else if (minDistance <= 0.6 && bestMatch) {
              const studentId = bestMatch.id
              const confidence = Math.max(0, Math.min(100, Math.round((1 - minDistance / 0.6) * 100)))

              // Distinct Blue Box for Low Confidence / Needs Review
              ctx.strokeStyle = '#3b82f6'
              ctx.lineWidth = 3
              ctx.strokeRect(box.x, box.y, box.width, box.height)

              // Corner pins
              ctx.fillStyle = '#60a5fa'
              const cs = 7
              ctx.fillRect(box.x - 2, box.y - 2, cs, cs)
              ctx.fillRect(box.x + box.width - cs + 2, box.y - 2, cs, cs)
              ctx.fillRect(box.x - 2, box.y + box.height - cs + 2, cs, cs)
              ctx.fillRect(box.x + box.width - cs + 2, box.y + box.height - cs + 2, cs, cs)

              const label = `Low confidence - tap to confirm (${confidence}%) [d: ${minDistance.toFixed(2)}]`
              ctx.font = 'bold 12px sans-serif'
              const textWidth = ctx.measureText(label).width
              const tagY = Math.max(22, box.y)
              ctx.fillStyle = 'rgba(37, 99, 235, 0.95)'
              ctx.fillRect(box.x, tagY - 22, textWidth + 14, 22)
              ctx.fillStyle = '#ffffff'
              ctx.fillText(label, box.x + 7, tagY - 6)

              currentFrameReview[studentId] = {
                student: bestMatch,
                firstSeen: Date.now(),
                lastSeen: Date.now(),
                confidence,
                distance: minDistance,
                selectedStudentId: studentId,
              }
            }
            // CASE 3: Unknown Face (distance > 0.60) -> Red Box
            // CASE 3: Unknown Face (distance > 0.60) -> Red Box
            else {
              ctx.strokeStyle = '#ef4444'
              ctx.lineWidth = 3
              ctx.strokeRect(box.x, box.y, box.width, box.height)

              const distStr = minDistance === Infinity ? '' : ` [d: ${minDistance.toFixed(2)}]`
              const label = `Unknown Face${distStr}`
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

        // Update review list (retain user's selected dropdown choice if already modified)
        setReviewStudents((prev) => {
          const updated = { ...prev }
          for (const [id, item] of Object.entries(currentFrameReview)) {
            if (updated[id]) {
              updated[id] = {
                ...item,
                selectedStudentId: updated[id].selectedStudentId || item.selectedStudentId,
              }
            } else {
              updated[id] = item
            }
          }
          const now = Date.now()
          for (const [id, item] of Object.entries(updated)) {
            if (now - item.lastSeen > 15000) {
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
  }, [streamActive, modelsReady, students, isDegradedMode, handleConfirmAttendance])

  const waitingList = Object.values(waitingStudents).filter(
    (w) => !confirmedStudentIdsRef.current.has(w.student.id)
  )
  const reviewList = Object.entries(reviewStudents)

  return (
    <div className="space-y-6 pb-16 font-sans">
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

      {/* Top Header & Breadcrumb Bar */}
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
            {isDegradedMode ? (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Degraded Mode: Manual Roll Call
              </span>
            ) : (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                AI Live Scanning Active
              </span>
            )}
          </h1>
        </div>

        {/* Mode Toggle Button & Stats */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <span className="text-slate-400">Total Enrolled:</span>
            <span className="font-semibold text-white">{students.length}</span>
          </div>

          <button
            onClick={() => {
              if (isDegradedMode) {
                setIsDegradedMode(false)
                setDegradedReason(null)
                startCamera()
              } else {
                stopCamera()
                setIsDegradedMode(true)
                setDegradedReason('Switched to manual roll call mode by instructor.')
              }
            }}
            className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition ${
              isDegradedMode
                ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            {isDegradedMode ? 'Switch to Camera Mode' : 'Switch to Manual Roll Call'}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Area: Either Webcam Viewport OR Degraded Mode Fallback Checklist */}
        <div className="lg:col-span-8 space-y-4">
          {isDegradedMode ? (
            /* PART B: DEGRADED MODE FALLBACK UI */
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                <span className="text-xl">⚠️</span>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-amber-300">
                    Camera unavailable — switched to manual roll call
                  </h3>
                  <p className="text-xs text-amber-200/70 mt-0.5">
                    {degradedReason || 'Camera access or face models unavailable. Mark attendance manually using the checklist below.'}
                  </p>
                </div>
              </div>

              {/* Checklist Actions */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="text-xs text-slate-400">
                  Select students present and click &quot;Submit Roll Call&quot;
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const all: Record<string, boolean> = {}
                      students.forEach((s) => {
                        if (!confirmedStudentIdsRef.current.has(s.id)) {
                          all[s.id] = true
                        }
                      })
                      setChecklistSelection(all)
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                  >
                    Select All Unmarked
                  </button>
                  <button
                    type="button"
                    onClick={() => setChecklistSelection({})}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Student Checklist Table */}
              <div className="overflow-y-auto max-h-[460px] divide-y divide-slate-800/60 border border-slate-800 rounded-xl bg-slate-950/60">
                {students.map((student) => {
                  const isAlreadyMarked = confirmedStudentIdsRef.current.has(student.id)
                  const isChecked = checklistSelection[student.id] || false

                  return (
                    <div
                      key={student.id}
                      onClick={() => {
                        if (!isAlreadyMarked) {
                          setChecklistSelection((prev) => ({
                            ...prev,
                            [student.id]: !prev[student.id],
                          }))
                        }
                      }}
                      className={`p-3 flex items-center justify-between gap-3 transition cursor-pointer ${
                        isAlreadyMarked
                          ? 'opacity-50 cursor-not-allowed bg-slate-900/40'
                          : isChecked
                          ? 'bg-indigo-950/30'
                          : 'hover:bg-slate-800/30'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          disabled={isAlreadyMarked}
                          checked={isAlreadyMarked || isChecked}
                          onChange={(e) => {
                            if (!isAlreadyMarked) {
                              setChecklistSelection((prev) => ({
                                ...prev,
                                [student.id]: e.target.checked,
                              }))
                            }
                          }}
                          className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div>
                          <span className="text-xs font-semibold text-white block truncate">
                            {student.name}
                          </span>
                          <span className="text-[10px] font-mono text-indigo-400">
                            {student.roll_no}
                          </span>
                        </div>
                      </div>

                      <div>
                        {isAlreadyMarked ? (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                            ✓ Already Confirmed
                          </span>
                        ) : isChecked ? (
                          <span className="text-[11px] text-indigo-400 font-medium">Ready to Submit</span>
                        ) : (
                          <span className="text-[11px] text-slate-500">Unmarked</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Submit Roll Call Button */}
              <button
                type="button"
                onClick={handleSubmitRollCall}
                disabled={
                  submittingRollCall ||
                  Object.values(checklistSelection).filter(Boolean).length === 0
                }
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-semibold text-white shadow-lg shadow-indigo-600/30 transition text-sm flex items-center justify-center gap-2"
              >
                {submittingRollCall ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Saving Hash-Chained Roll Call...</span>
                  </>
                ) : (
                  `Submit Roll Call (${Object.values(checklistSelection).filter(Boolean).length} Selected)`
                )}
              </button>
            </div>
          ) : (
            /* CAMERA VIEWPORT */
            <>
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

                    {/* Telemetry Badge */}
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

                    {/* Bottom Legend */}
                    <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between text-[11px] px-3 py-1.5 rounded-xl bg-slate-950/85 backdrop-blur-md border border-slate-800 text-slate-300 gap-2">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
                          Blink to Confirm
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
                          Low Confidence (Needs Review)
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                          Confirmed
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-red-500" />
                          Unknown
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Camera Controls */}
              <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 p-3 rounded-xl text-xs">
                <div className="flex items-center gap-3">
                  {streamActive ? (
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                    >
                      Pause Camera
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startCamera}
                      className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
                    >
                      Resume Camera
                    </button>
                  )}
                </div>

                <div className="text-slate-400 text-[11px]">
                  Borderline matches (0.5–0.6 dist) are highlighted in blue for instructor verification.
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right Area: Sidebar containing Needs Review, Waiting for Blink, and Confirmed Records */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col h-full min-h-[500px]">
            {/* Header */}
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

            {/* Scrollable Container */}
            <div className="flex-1 overflow-y-auto space-y-4 max-h-[560px] pr-1">
              {/* PART A: NEEDS REVIEW (Low Confidence: 0.5 <= dist <= 0.6) */}
              {reviewList.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-blue-400 uppercase tracking-wider px-1">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                      Needs Review — Low Confidence ({reviewList.length})
                    </span>
                  </div>

                  <div className="space-y-2">
                    {reviewList.map(([key, item]) => (
                      <div
                        key={key}
                        className="p-3 bg-blue-950/30 border border-blue-500/40 rounded-xl space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs font-semibold text-white block">
                              Borderline Match ({item.confidence}%)
                            </span>
                            <span className="text-[10px] text-slate-400">
                              Distance: {item.distance.toFixed(3)} (0.50 - 0.60)
                            </span>
                          </div>

                          <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            Needs Review
                          </span>
                        </div>

                        {/* Student Selector Dropdown */}
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-1">
                            Assign to Student:
                          </label>
                          <select
                            value={item.selectedStudentId}
                            onChange={(e) => {
                              const val = e.target.value
                              setReviewStudents((prev) => ({
                                ...prev,
                                [key]: { ...prev[key], selectedStudentId: val },
                              }))
                            }}
                            className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white focus:outline-none focus:border-blue-500"
                          >
                            <option value={item.student.id}>
                              {item.student.name} ({item.student.roll_no}) [Closest Match]
                            </option>
                            <option disabled>──────────</option>
                            {students
                              .filter((s) => s.id !== item.student.id)
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name} ({s.roll_no})
                                </option>
                              ))}
                            <option value="skip">✕ Not a match / Skip</option>
                          </select>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setReviewStudents((prev) => {
                                const copy = { ...prev }
                                delete copy[key]
                                return copy
                              })
                            }}
                            className="px-2.5 py-1 rounded text-[11px] text-slate-400 hover:text-white transition"
                          >
                            Dismiss
                          </button>
                          <button
                            type="button"
                            disabled={processingOverrideId === key}
                            onClick={() => handleConfirmManualOverride(key)}
                            className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium transition shadow-sm disabled:opacity-50"
                          >
                            {processingOverrideId === key ? 'Saving...' : 'Confirm Override'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SECTION: Waiting for Blink (Confident Matches) */}
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

              {/* SECTION: Confirmed Records */}
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider px-1">
                  Confirmed Present ({confirmedRecords.length})
                </div>

                {confirmedRecords.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center p-8 text-slate-400 space-y-2 border border-dashed border-slate-800 rounded-xl">
                    <div className="text-2xl opacity-40">👤</div>
                    <p className="text-xs font-medium text-slate-300">No confirmed attendance yet</p>
                    <p className="text-[11px] text-slate-500 max-w-xs">
                      Students will appear here once verified via camera blink or manual roll call.
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

                          {/* Distinct Status Badges */}
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px]">
                            {record.status === 'manual_override' ? (
                              <span className="text-blue-400 font-medium px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20">
                                👤 Manually confirmed by admin
                              </span>
                            ) : record.status === 'manual_fallback' ? (
                              <span className="text-purple-400 font-medium px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20">
                                📋 Manual Roll Call
                              </span>
                            ) : (
                              <span className="text-emerald-400 font-medium flex items-center gap-1">
                                <span>✓</span> Liveness Verified
                              </span>
                            )}

                            {record.confidence !== null && (
                              <span className="text-slate-400">{record.confidence}%</span>
                            )}

                            <span className="text-slate-500">•</span>
                            <span className="text-slate-400">
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

                        <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold border border-emerald-500/30 flex-shrink-0">
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
