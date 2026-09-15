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
  drawCornerReticle,
} from '@/lib/faceRecognition'
import {
  confirmAttendance,
  confirmManualOverride,
  confirmManualFallback,
  verifySessionIntegrity,
  type VerifyIntegrityResult,
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

  // CSV Export & Hash-Chain Integrity Verification
  const [exportingCSV, setExportingCSV] = useState(false)
  const [verifyingIntegrity, setVerifyingIntegrity] = useState(false)
  const [integrityResult, setIntegrityResult] = useState<VerifyIntegrityResult | null>(null)
  const [isIntegrityPanelOpen, setIsIntegrityPanelOpen] = useState(false)

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

  // Check if current user is the session creator
  const isCreator = Boolean(currentUserId && session?.created_by && currentUserId === session.created_by)

  // PART A — Export CSV Handler
  const handleExportCSV = async () => {
    try {
      setExportingCSV(true)
      const supabase = createClient()
      const { data: rows, error } = await supabase
        .from('attendance')
        .select('*, students(name, roll_no)')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })

      if (error) throw error

      if (!rows || rows.length === 0) {
        showToast('No attendance records to export for this session.', 'info')
        return
      }

      // Format CSV with columns: Roll No, Name, Status, Timestamp, Confidence, Hash
      const headers = ['Roll No', 'Name', 'Status', 'Timestamp', 'Confidence', 'Hash']
      const csvLines = [headers.join(',')]

      for (const r of rows) {
        const studentInfo = r.students as { name?: string; roll_no?: string } | null
        const rollNo = `"${(studentInfo?.roll_no || 'N/A').replace(/"/g, '""')}"`
        const name = `"${(studentInfo?.name || 'Unknown').replace(/"/g, '""')}"`
        const status = r.status || 'present'
        const timestamp = r.timestamp || r.created_at || ''
        const confidence = r.confidence !== null && r.confidence !== undefined ? r.confidence : 'N/A'
        const hash = r.hash || ''

        csvLines.push([rollNo, name, status, timestamp, confidence, hash].join(','))
      }

      const csvContent = csvLines.join('\r\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)

      const cleanClassName = (session?.class_name || 'session')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
      const dateStr = new Date().toISOString().split('T')[0]
      const fileName = `attendance_${cleanClassName}_${dateStr}.csv`

      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute('download', fileName)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      showToast(`Exported ${fileName}`, 'success')
    } catch (err: unknown) {
      console.error('Error exporting CSV:', err)
      const msg = err instanceof Error ? err.message : 'Failed to export CSV'
      showToast(msg, 'error')
    } finally {
      setExportingCSV(false)
    }
  }

  // PART B — Hash-Chain Integrity Verification Handler
  const handleVerifyIntegrity = async () => {
    try {
      setVerifyingIntegrity(true)
      const result = await verifySessionIntegrity(sessionId)
      setIntegrityResult(result)
      setIsIntegrityPanelOpen(true)
      if (result.verified) {
        showToast(result.message, 'success')
      } else {
        showToast(`Integrity check failed: ${result.failures.length} tampered record(s)`, 'error')
      }
    } catch (err: unknown) {
      console.error('Verification error:', err)
      showToast('Failed to run chain verification', 'error')
    } finally {
      setVerifyingIntegrity(false)
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
                // Confirmed Present -> Lime Reticle
                drawCornerReticle(ctx, box, {
                  color: '#c3f400',
                  label: `${bestMatch.name} (${bestMatch.roll_no})`,
                  subLabel: 'CONFIRMED ✓',
                  showCrosshair: true,
                })
              } else {
                // Buffer EAR & Check Blink
                const buffer = earBuffersRef.current.get(studentId) || []
                buffer.push(ear)
                if (buffer.length > 20) buffer.shift()
                earBuffersRef.current.set(studentId, buffer)

                const hasBlink = isBlinkDetected(buffer)

                if (hasBlink) {
                  earBuffersRef.current.delete(studentId)

                  drawCornerReticle(ctx, box, {
                    color: '#c3f400',
                    label: `${bestMatch.name}`,
                    subLabel: 'BLINK CONFIRMED ✓',
                    showCrosshair: true,
                    lineWidth: 3.5,
                  })

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

                  drawCornerReticle(ctx, box, {
                    color: '#00eefc',
                    label: `${bestMatch.name}`,
                    subLabel: `EYES CLOSED (EAR: ${ear.toFixed(2)})`,
                    showCrosshair: true,
                  })
                } else {
                  currentFrameWaiting[studentId] = {
                    student: bestMatch,
                    firstSeen: Date.now(),
                    lastSeen: Date.now(),
                    currentEAR: ear,
                    confidence,
                    isEyesClosed: false,
                  }

                  drawCornerReticle(ctx, box, {
                    color: '#f59e0b',
                    label: `${bestMatch.name} (${bestMatch.roll_no})`,
                    subLabel: `BLINK TO CONFIRM (EAR: ${ear.toFixed(2)})`,
                    showCrosshair: true,
                  })
                }
              }
            }
            // CASE 2: Borderline Low Confidence Match (0.50 <= distance <= 0.60) -> Distinct Cyan Reticle & Needs Review
            else if (minDistance <= 0.6 && bestMatch) {
              const studentId = bestMatch.id
              const confidence = Math.max(0, Math.min(100, Math.round((1 - minDistance / 0.6) * 100)))

              drawCornerReticle(ctx, box, {
                color: '#00eefc',
                label: 'LOW CONFIDENCE // TAP TO CONFIRM',
                subLabel: `${confidence}% [d: ${minDistance.toFixed(2)}]`,
                showCrosshair: true,
              })

              currentFrameReview[studentId] = {
                student: bestMatch,
                firstSeen: Date.now(),
                lastSeen: Date.now(),
                confidence,
                distance: minDistance,
                selectedStudentId: studentId,
              }
            }
            // CASE 3: Unknown Face (distance > 0.60) -> Red Reticle
            else {
              const distStr = minDistance === Infinity ? '' : `d: ${minDistance.toFixed(2)}`
              drawCornerReticle(ctx, box, {
                color: '#ffb4ab',
                label: 'UNKNOWN VECTOR',
                subLabel: distStr || undefined,
                showCrosshair: true,
              })
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

  const attendancePercent = students.length > 0
    ? Math.round((confirmedRecords.length / students.length) * 100)
    : 0

  return (
    <div className="space-y-6 pb-16 font-sans">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.8)] border transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 ${
            toast.type === 'success'
              ? 'bg-surface-container-highest/95 border-primary/60 text-primary-fixed shadow-[0_0_25px_rgba(195,244,0,0.3)]'
              : toast.type === 'error'
              ? 'bg-surface-container-highest/95 border-error/60 text-error-dim shadow-[0_0_25px_rgba(255,180,171,0.3)]'
              : 'bg-surface-container-highest/95 border-secondary/60 text-secondary shadow-[0_0_25px_rgba(0,238,252,0.3)]'
          }`}
        >
          <span className="text-base font-bold">
            {toast.type === 'success' ? '✓' : toast.type === 'error' ? '⚠️' : 'ℹ️'}
          </span>
          <span className="text-xs font-mono font-semibold tracking-wide">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 text-xs opacity-60 hover:opacity-100 transition-opacity">
            ✕
          </button>
        </div>
      )}

      {/* Top Header & Breadcrumb Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant/30 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-on-surface-variant font-mono mb-1.5 uppercase tracking-wider">
            <Link href="/dashboard/session" className="hover:text-primary transition flex items-center gap-1">
              <span>←</span>
              <span>All Sessions</span>
            </Link>
            <span className="text-outline">/</span>
            <span className="text-primary-fixed/80 font-mono text-[11px] truncate max-w-xs">{sessionId}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight flex items-center gap-3">
              <span>{session?.class_name || 'Live Attendance Session'}</span>
            </h1>
            <span className="text-[11px] font-mono font-bold px-3 py-1 rounded-full bg-secondary/10 text-secondary border border-secondary/30 flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,238,252,0.2)] uppercase tracking-wider">
              <span>{session?.location === 'canteen' ? '☕' : session?.location === 'library' ? '📚' : session?.location === 'auditorium' ? '🎭' : '🏫'}</span>
              <span>{session?.location || 'Classroom'}</span>
            </span>
            {isDegradedMode ? (
              <span className="text-[11px] font-mono font-bold px-3 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-2 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                DEGRADED: MANUAL ROLL CALL
              </span>
            ) : (
              <span className="text-[11px] font-mono font-bold px-3 py-1 rounded-full bg-primary/10 text-primary-fixed border border-primary/30 flex items-center gap-2 animate-pulse-lime">
                <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_#c3f400] animate-ping" />
                <span>AI LIVE SCANNING ACTIVE</span>
              </span>
            )}
          </div>
        </div>

        {/* Top Controls: Mode Toggle, CSV Export, Verification */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-surface-container-high border border-outline-variant/30 text-xs font-mono">
            <span className="text-on-surface-variant uppercase tracking-wider text-[10px]">Enrolled:</span>
            <span className="font-bold text-primary-fixed text-glow-lime">{students.length}</span>
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
            className={`px-3.5 py-1.5 rounded-xl border text-xs font-mono font-bold uppercase tracking-wider transition-all duration-200 ${
              isDegradedMode
                ? 'bg-secondary/15 border-secondary/50 text-secondary hover:bg-secondary/25 shadow-[0_0_15px_rgba(0,238,252,0.25)]'
                : 'bg-surface-container-high border-outline-variant/40 text-on-surface hover:border-primary/50 hover:text-white hover:shadow-[0_0_15px_rgba(195,244,0,0.2)]'
            }`}
          >
            {isDegradedMode ? '▶ Camera Mode' : '📋 Manual Mode'}
          </button>

          {/* Export CSV Button */}
          <button
            onClick={handleExportCSV}
            disabled={exportingCSV}
            id="export-csv-button"
            className="px-3.5 py-1.5 rounded-xl border border-secondary/40 bg-surface-container-high text-secondary hover:bg-secondary/15 hover:border-secondary hover:shadow-[0_0_18px_rgba(0,238,252,0.3)] text-xs font-mono font-bold uppercase tracking-wider transition-all duration-200 flex items-center gap-2 disabled:opacity-50"
            title="Download full attendance records as CSV"
          >
            <span>📥</span>
            <span>{exportingCSV ? 'Exporting...' : 'Export CSV'}</span>
          </button>

          {/* Verify Log Integrity Button */}
          {isCreator && (
            <button
              onClick={handleVerifyIntegrity}
              disabled={verifyingIntegrity}
              id="verify-chain-button"
              className="px-3.5 py-1.5 rounded-xl border border-primary/50 bg-primary/10 text-primary-fixed hover:bg-primary/20 hover:border-primary hover:shadow-[0_0_20px_rgba(195,244,0,0.4)] text-xs font-mono font-bold uppercase tracking-wider transition-all duration-200 flex items-center gap-2 disabled:opacity-50"
              title="Verify SHA-256 hash-chain integrity of this session"
            >
              <span className="text-primary">🛡️</span>
              <span>{verifyingIntegrity ? 'Verifying...' : 'Verify Ledger'}</span>
            </button>
          )}
        </div>
      </div>

      {/* HASH-CHAIN INTEGRITY RESULT PANEL */}
      {isIntegrityPanelOpen && integrityResult && (
        <div
          id="integrity-result-panel"
          className={`p-6 rounded-2xl border transition-all duration-300 animate-in fade-in slide-in-from-top-2 ${
            integrityResult.verified
              ? 'bg-surface-container-high/90 border-primary/50 text-emerald-100 shadow-[0_0_35px_rgba(195,244,0,0.2)]'
              : 'bg-surface-container-high/90 border-error/60 text-rose-100 shadow-[0_0_35px_rgba(255,180,171,0.25)]'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-outline-variant/30">
            <div className="flex items-center gap-3.5">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl font-black flex-shrink-0 ${
                  integrityResult.verified
                    ? 'bg-primary/20 text-primary border border-primary/40 shadow-[0_0_15px_rgba(195,244,0,0.3)]'
                    : 'bg-error/20 text-error-dim border border-error/40 animate-pulse'
                }`}
              >
                {integrityResult.verified ? '✓' : '⚠️'}
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black font-mono uppercase tracking-wide text-white flex items-center gap-2">
                  <span>{integrityResult.message}</span>
                </h3>
                <p className="text-xs text-on-surface-variant font-mono mt-0.5">
                  {integrityResult.verified
                    ? 'Cryptographic SHA-256 signatures and backward-linkage pointers verified across all ledger records.'
                    : 'Database tampering or record manipulation detected! Stored ledger hashes or chain pointers do not match recomputation.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                type="button"
                onClick={handleVerifyIntegrity}
                disabled={verifyingIntegrity}
                className="px-3.5 py-1.5 rounded-lg bg-surface-container-highest border border-outline-variant/40 hover:border-primary/50 text-xs font-mono font-bold text-white transition flex items-center gap-1.5"
              >
                <span>🔄</span>
                <span>Re-verify</span>
              </button>
              <button
                type="button"
                onClick={() => setIsIntegrityPanelOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-highest text-xs font-mono text-on-surface-variant transition"
              >
                ✕ Close
              </button>
            </div>
          </div>

          {/* Clean Verification Specs */}
          {integrityResult.verified && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 text-xs font-mono">
              <div className="p-3 rounded-xl bg-surface-container/70 border border-primary/25 flex items-center gap-3">
                <span className="text-primary text-lg">🔒</span>
                <div>
                  <div className="font-bold text-white uppercase">SHA-256 Signatures Valid</div>
                  <div className="text-[11px] text-on-surface-variant">All {integrityResult.totalRecords} record payloads intact</div>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-surface-container/70 border border-primary/25 flex items-center gap-3">
                <span className="text-secondary text-lg">🔗</span>
                <div>
                  <div className="font-bold text-white uppercase">Chain Continuity Valid</div>
                  <div className="text-[11px] text-on-surface-variant">Zero broken prev_hash links</div>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-surface-container/70 border border-primary/25 flex items-center gap-3">
                <span className="text-primary text-lg">🛡️</span>
                <div>
                  <div className="font-bold text-white uppercase">Reorder &amp; Deletion Proof</div>
                  <div className="text-[11px] text-on-surface-variant">Ledger sequence verified</div>
                </div>
              </div>
            </div>
          )}

          {/* Tampering List */}
          {!integrityResult.verified && integrityResult.failures.length > 0 && (
            <div className="mt-4 space-y-3 font-mono">
              <div className="text-xs font-bold text-error-dim uppercase tracking-wider">
                Compromised Records ({integrityResult.failures.length}):
              </div>

              <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                {integrityResult.failures.map((fail) => (
                  <div
                    key={fail.rowId}
                    className="p-3.5 rounded-xl bg-surface-container-highest border border-error/40 text-xs space-y-2"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-outline-variant/30 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-error/20 text-error-dim font-mono text-[10px] font-bold">
                          Row #{fail.index}
                        </span>
                        <span className="font-bold text-white">{fail.studentName}</span>
                        <span className="font-mono text-secondary text-[11px]">({fail.rollNo})</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-surface-container text-on-surface-variant">
                          {fail.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-on-surface-variant font-mono">
                        ID: {fail.rowId.slice(0, 8)}...
                      </div>
                    </div>

                    <div className="space-y-2">
                      {fail.failures.map((f, idx) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-surface-container border border-error/30 text-[11px] space-y-1">
                          <div className="flex items-center gap-2 font-bold text-error-dim">
                            <span>❌</span>
                            <span>{f.type === 'hash_mismatch' ? 'Hash Mismatch (Payload altered)' : 'Chain-Link Mismatch (Pointer broken)'}</span>
                          </div>
                          <p className="text-on-surface-variant text-[11px]">{f.message}</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1.5 pt-1.5 border-t border-error/20 font-mono text-[10px]">
                            <div className="p-2 rounded bg-black/60 text-on-surface-variant break-all">
                              <span className="text-on-surface-variant/70 block font-sans font-semibold mb-0.5">Stored DB Hash:</span>
                              <span className="text-error-dim font-mono">{f.storedValue || 'null'}</span>
                            </div>
                            <div className="p-2 rounded bg-black/60 text-on-surface-variant break-all">
                              <span className="text-on-surface-variant/70 block font-sans font-semibold mb-0.5">Calculated Hash:</span>
                              <span className="text-primary-fixed font-mono">{f.expectedValue || 'null'}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Grid Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Area: Camera Viewport OR Degraded Mode */}
        <div className="lg:col-span-8 space-y-4">
          {isDegradedMode ? (
            /* DEGRADED MODE UI */
            <div className="card-interactive bg-surface-container-high border border-outline-variant/40 rounded-2xl p-6 shadow-2xl space-y-6">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3.5">
                <span className="text-2xl">⚠️</span>
                <div className="flex-1 font-mono">
                  <h3 className="text-sm font-bold text-amber-300 uppercase tracking-wide">
                    Camera Offline — Switched to Manual Roll Call
                  </h3>
                  <p className="text-xs text-amber-200/70 mt-1">
                    {degradedReason || 'Camera access or face models unavailable. Mark attendance manually using the checklist below.'}
                  </p>
                </div>
              </div>

              {/* Checklist Actions */}
              <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3">
                <div className="text-xs font-mono text-on-surface-variant uppercase tracking-wider">
                  Check present students &amp; submit:
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
                    className="px-3 py-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-container-highest/80 text-primary-fixed text-xs font-mono font-bold border border-primary/30 transition-all hover:shadow-[0_0_12px_rgba(195,244,0,0.25)]"
                  >
                    Select All Unmarked
                  </button>
                  <button
                    type="button"
                    onClick={() => setChecklistSelection({})}
                    className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-highest text-on-surface-variant text-xs font-mono transition"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Student Checklist Table */}
              <div className="overflow-y-auto max-h-[460px] divide-y divide-outline-variant/20 border border-outline-variant/30 rounded-xl bg-surface-container/60">
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
                      className={`p-3.5 flex items-center justify-between gap-3 transition-all cursor-pointer ${
                        isAlreadyMarked
                          ? 'opacity-45 cursor-not-allowed bg-surface-container/30'
                          : isChecked
                          ? 'bg-primary/10 border-l-2 border-primary'
                          : 'hover:bg-surface-container-highest/40'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
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
                          className="w-4 h-4 rounded bg-surface-container-highest border-outline-variant text-primary focus:ring-primary accent-[#c3f400]"
                        />
                        <div>
                          <span className="text-xs font-bold text-white block truncate">
                            {student.name}
                          </span>
                          <span className="text-[10px] font-mono text-secondary">
                            {student.roll_no}
                          </span>
                        </div>
                      </div>

                      <div>
                        {isAlreadyMarked ? (
                          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary-fixed font-bold">
                            ✓ Confirmed
                          </span>
                        ) : isChecked ? (
                          <span className="text-[11px] font-mono text-primary-fixed font-bold">Ready</span>
                        ) : (
                          <span className="text-[11px] font-mono text-on-surface-variant/60">Unmarked</span>
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
                className="w-full py-3 px-5 bg-primary hover:bg-primary/90 text-on-primary font-black uppercase font-mono tracking-wider rounded-xl shadow-[0_0_25px_rgba(195,244,0,0.45)] hover:shadow-[0_0_35px_rgba(195,244,0,0.65)] hover:scale-[1.01] transition-all disabled:opacity-40 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2"
              >
                {submittingRollCall ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-black" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Saving Chained Ledger...</span>
                  </>
                ) : (
                  `Submit Roll Call (${Object.values(checklistSelection).filter(Boolean).length} Selected)`
                )}
              </button>
            </div>
          ) : (
            /* CAMERA VIEWPORT WITH RETICLE HUD & LASER BEAM */
            <>
              <div className="relative aspect-video w-full bg-surface-container-lowest border-2 border-outline-variant/50 hover:border-primary/40 transition-colors rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.9)] flex items-center justify-center group">
                {cameraError ? (
                  <div className="text-center p-8 space-y-3 font-mono">
                    <div className="text-error-dim text-4xl mb-2">📷</div>
                    <h3 className="text-base font-bold text-white uppercase">Camera Access Failed</h3>
                    <p className="text-xs text-on-surface-variant max-w-sm">{cameraError}</p>
                    <button
                      onClick={startCamera}
                      className="mt-3 px-4 py-2 rounded-xl bg-primary text-black font-black uppercase tracking-wider text-xs shadow-[0_0_20px_rgba(195,244,0,0.4)] hover:shadow-[0_0_30px_rgba(195,244,0,0.6)] transition"
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
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10"
                    />

                    {/* Animated Sweeping Laser Beam */}
                    <div className="laser-beam pointer-events-none z-20" />

                    {/* Corner Frame Accents on Viewport */}
                    <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-primary/70 pointer-events-none z-20" />
                    <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-primary/70 pointer-events-none z-20" />
                    <div className="absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-primary/70 pointer-events-none z-20" />
                    <div className="absolute bottom-2 right-2 w-6 h-6 border-b-2 border-r-2 border-primary/70 pointer-events-none z-20" />

                    {/* Top Telemetry HUD */}
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-30">
                      <div className="flex items-center gap-2">
                        {/* Hot Magenta Pulsing REC badge */}
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/80 backdrop-blur-md border border-red-500/60 animate-pulse-magenta shadow-[0_0_15px_rgba(255,0,127,0.45)]">
                          <span className="w-2 h-2 rounded-full bg-[#ff007f] animate-ping" />
                          <span className="font-mono text-[10px] tracking-widest font-black text-[#ff007f]">
                            REC [LIVE]
                          </span>
                        </div>

                        {/* Faces Detected */}
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-highest/90 backdrop-blur-md border border-primary/40 text-xs shadow-[0_0_14px_rgba(195,244,0,0.25)]">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              detectedFacesCount > 0 ? 'bg-primary shadow-[0_0_8px_#c3f400] animate-pulse' : 'bg-amber-400'
                            }`}
                          />
                          <span className="text-white font-mono font-bold text-[11px]">
                            {detectedFacesCount} {detectedFacesCount === 1 ? 'FACE' : 'FACES'}
                          </span>
                        </div>

                        {fps > 0 && (
                          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/80 backdrop-blur-md border border-cyan-500/40 text-[11px] text-secondary font-mono shadow-[0_0_12px_rgba(0,238,252,0.25)]">
                            <span>⚡ {fps} FPS</span>
                          </div>
                        )}
                      </div>

                      {/* Real Model Status Indicator */}
                      <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-outline-variant/30 text-[10px] font-mono text-on-surface-variant">
                        <span>CAMERA ACTIVE</span>
                      </div>
                    </div>

                    {/* Bottom Telemetry & Status HUD */}
                    <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between text-[10px] font-mono px-3.5 py-2 rounded-xl bg-surface-container-lowest/90 backdrop-blur-md border border-outline-variant/40 text-on-surface-variant gap-2 z-30 shadow-[0_0_20px_rgba(0,0,0,0.7)]">
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1.5 text-amber-300 font-bold">
                          <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 shadow-[0_0_6px_#f59e0b]" />
                          Blink
                        </span>
                        <span className="flex items-center gap-1.5 text-secondary font-bold">
                          <span className="w-2.5 h-2.5 rounded-sm bg-secondary shadow-[0_0_6px_#00eefc]" />
                          Review (Low Conf)
                        </span>
                        <span className="flex items-center gap-1.5 text-primary-fixed font-bold">
                          <span className="w-2.5 h-2.5 rounded-sm bg-primary shadow-[0_0_6px_#c3f400]" />
                          Confirmed
                        </span>
                        <span className="flex items-center gap-1.5 text-error-dim font-bold">
                          <span className="w-2.5 h-2.5 rounded-sm bg-error shadow-[0_0_6px_#ffb4ab]" />
                          Unknown
                        </span>
                      </div>

                      <div className="font-mono text-xs font-black text-primary-fixed text-glow-lime">
                        {confirmedRecords.length} / {students.length} LOGGED
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Camera Controls Bar */}
              <div className="card-interactive flex items-center justify-between bg-surface-container-high border border-outline-variant/40 p-3.5 rounded-xl text-xs font-mono">
                <div className="flex items-center gap-3">
                  {streamActive ? (
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="px-4 py-2 rounded-lg bg-surface-container-highest hover:bg-surface-container-highest/80 border border-outline-variant/40 hover:border-error/40 text-on-surface font-bold uppercase transition"
                    >
                      ⏸ Pause Sensor
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startCamera}
                      className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-black font-black uppercase tracking-wider transition shadow-[0_0_20px_rgba(195,244,0,0.35)] hover:shadow-[0_0_30px_rgba(195,244,0,0.55)]"
                    >
                      ▶ Resume Sensor
                    </button>
                  )}
                </div>

                <div className="text-on-surface-variant text-[11px] hidden sm:block">
                  Borderline candidates (0.50–0.60 dist) trigger cyan manual confirmation cards.
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right Area: Sidebar containing Attendance Ledger & Queues */}
        <div className="lg:col-span-4 space-y-4">
          <div className="card-interactive bg-surface-container-high border border-outline-variant/40 rounded-2xl p-5 shadow-2xl flex flex-col h-full min-h-[520px]">
            {/* Sidebar Header & Live Attendance Meter */}
            <div className="border-b border-outline-variant/30 pb-4 mb-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-black text-white font-mono uppercase tracking-wide flex items-center gap-2">
                    <span>Attendance Ledger</span>
                  </h2>
                  <p className="text-[11px] font-mono text-on-surface-variant mt-0.5">
                    Chained SHA-256 State
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-2xl font-mono font-black text-primary-fixed text-glow-lime block">
                    {attendancePercent}%
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-on-surface-variant">
                    {confirmedRecords.length} / {students.length} PRESENT
                  </span>
                </div>
              </div>

              {/* Glowing Linear Progress Meter */}
              <div className="w-full bg-surface-container-lowest h-2 rounded-full mt-3 overflow-hidden border border-outline-variant/30">
                <div
                  className="bg-primary h-full transition-all duration-500 rounded-full shadow-[0_0_12px_#c3f400]"
                  style={{ width: `${Math.min(100, Math.max(0, attendancePercent))}%` }}
                />
              </div>
            </div>

            {/* Scrollable Container */}
            <div className="flex-1 overflow-y-auto space-y-4 max-h-[540px] pr-1">
              {/* NEEDS REVIEW (Low Confidence: 0.5 <= dist <= 0.6) */}
              {reviewList.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-mono font-black text-secondary uppercase tracking-wider px-1">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-secondary animate-pulse shadow-[0_0_8px_#00eefc]" />
                      Needs Review ({reviewList.length})
                    </span>
                  </div>

                  <div className="space-y-2">
                    {reviewList.map(([key, item]) => (
                      <div
                        key={key}
                        className="p-3.5 bg-cyan-950/20 border border-secondary/50 rounded-xl space-y-3 shadow-[0_0_16px_rgba(0,238,252,0.15)] hover:border-secondary transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs font-bold text-white block">
                              Borderline Match ({item.confidence}%)
                            </span>
                            <span className="text-[10px] font-mono text-secondary/80">
                              Dist: {item.distance.toFixed(3)} (0.50–0.60)
                            </span>
                          </div>

                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-secondary/20 text-secondary border border-secondary/40 animate-pulse-cyan">
                            LOW CONF
                          </span>
                        </div>

                        {/* Student Selector Dropdown */}
                        <div>
                          <label className="text-[10px] font-mono text-on-surface-variant block mb-1 uppercase tracking-wider">
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
                            className="w-full px-2.5 py-1.5 bg-surface-container-lowest border border-outline-variant rounded-lg text-xs font-mono text-white focus:outline-none focus:border-secondary"
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
                        <div className="flex items-center justify-end gap-2 pt-1 font-mono">
                          <button
                            type="button"
                            onClick={() => {
                              setReviewStudents((prev) => {
                                const copy = { ...prev }
                                delete copy[key]
                                return copy
                              })
                            }}
                            className="px-3 py-1 rounded text-[11px] text-on-surface-variant hover:text-white transition"
                          >
                            Dismiss
                          </button>
                          <button
                            type="button"
                            disabled={processingOverrideId === key}
                            onClick={() => handleConfirmManualOverride(key)}
                            className="px-3.5 py-1 rounded-lg bg-secondary hover:bg-secondary/90 text-black text-[11px] font-bold uppercase transition shadow-[0_0_12px_rgba(0,238,252,0.4)] disabled:opacity-50"
                          >
                            {processingOverrideId === key ? 'Saving...' : 'Confirm'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Waiting for Blink (Confident Matches) */}
              {waitingList.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-mono font-bold text-amber-300 uppercase tracking-wider px-1">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                      Detected — Blink to Verify ({waitingList.length})
                    </span>
                  </div>

                  <div className="space-y-2">
                    {waitingList.map((item) => (
                      <div
                        key={item.student.id}
                        className={`p-3.5 rounded-xl border transition-all ${
                          item.isEyesClosed
                            ? 'bg-secondary/10 border-secondary shadow-[0_0_20px_rgba(0,238,252,0.3)] animate-pulse-cyan'
                            : 'bg-amber-500/10 border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-white block truncate">
                              {item.student.name}
                            </span>
                            <span className="text-[10px] font-mono text-on-surface-variant">
                              {item.student.roll_no}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleConfirmAttendance(item.student, item.confidence)}
                            className="px-3 py-1 rounded-lg bg-primary hover:bg-primary/90 text-black text-[11px] font-mono font-bold uppercase transition shadow-[0_0_12px_rgba(195,244,0,0.3)]"
                            title="Bypass blink and mark present immediately"
                          >
                            Bypass
                          </button>
                        </div>

                        <div className="mt-2.5 pt-2 border-t border-outline-variant/20 flex items-center justify-between text-[10px] font-mono">
                          <span className={item.isEyesClosed ? 'text-secondary font-bold' : 'text-amber-300'}>
                            {item.isEyesClosed ? '😑 EYES CLOSED DETECTED' : '👁️ BLINK EYES TO CONFIRM'}
                          </span>
                          <span className="text-on-surface-variant">
                            EAR: <span className="text-primary-fixed font-bold">{item.currentEAR.toFixed(2)}</span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Confirmed Records */}
              <div className="space-y-2.5">
                <div className="text-[11px] font-mono font-bold text-primary-fixed uppercase tracking-wider px-1 flex items-center justify-between">
                  <span>Confirmed Present</span>
                  <span className="font-mono text-[10px] text-on-surface-variant font-normal">
                    {confirmedRecords.length} records
                  </span>
                </div>

                {confirmedRecords.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center p-8 text-on-surface-variant space-y-2 border border-dashed border-outline-variant/30 rounded-xl bg-surface-container-lowest/40 font-mono">
                    <div className="text-2xl opacity-40">👤</div>
                    <p className="text-xs font-bold text-white uppercase">No Records Logged Yet</p>
                    <p className="text-[11px] text-on-surface-variant/70 max-w-xs">
                      Faces verified via camera blink or manual roll call will appear here in the real-time cryptographic ledger.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 font-mono">
                    {confirmedRecords.map((record) => (
                      <div
                        key={record.student.id}
                        className="p-3 bg-surface-container-lowest/80 border border-outline-variant/30 rounded-xl hover:border-primary/60 hover:scale-[1.01] hover:shadow-[0_0_15px_rgba(195,244,0,0.15)] transition-all flex items-center justify-between gap-3 group"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white truncate font-sans">
                              {record.student.name}
                            </span>
                            <span className="text-[10px] font-mono text-primary-fixed bg-primary/10 px-1.5 py-0.5 rounded border border-primary/25">
                              {record.student.roll_no}
                            </span>
                          </div>

                          {/* Distinct Status Badges */}
                          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px]">
                            {record.status === 'manual_override' ? (
                              <span className="text-secondary font-bold px-2 py-0.5 rounded bg-secondary/15 border border-secondary/30">
                                👤 OVERRIDE
                              </span>
                            ) : record.status === 'manual_fallback' ? (
                              <span className="text-amber-300 font-bold px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30">
                                📋 MANUAL ROLL
                              </span>
                            ) : (
                              <span className="text-primary-fixed font-bold flex items-center gap-1">
                                <span className="text-primary">✓</span> LIVENESS OK
                              </span>
                            )}

                            {record.confidence !== null && (
                              <span className="text-on-surface-variant">{record.confidence}%</span>
                            )}

                            <span className="text-outline">•</span>
                            <span className="text-on-surface-variant">
                              {record.confirmedAt.toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </span>
                          </div>

                          {record.hash && (
                            <div className="mt-1 font-mono text-[9px] text-on-surface-variant/70 truncate" title={`Hash: ${record.hash}`}>
                              SHA: {record.hash.slice(0, 16)}...
                            </div>
                          )}
                        </div>

                        <div className="w-6 h-6 rounded-full bg-primary/20 text-primary-fixed flex items-center justify-center text-xs font-black border border-primary/40 flex-shrink-0 shadow-[0_0_8px_rgba(195,244,0,0.3)]">
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
