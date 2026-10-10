'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { loadModels, getFaceDescriptor, faceapi, drawCornerReticle } from '@/lib/faceRecognition'
import type { Student } from '@/types/database'

interface BulkItem {
  id: string
  file: File
  previewUrl: string
  name: string
  roll_no: string
  status: 'pending' | 'processing' | 'ready' | 'error'
  errorMsg?: string
  descriptor?: Float32Array
}

export default function StudentEnrollPage() {
  const [activeTab, setActiveTab] = useState<'live' | 'bulk'>('live')
  const [modelsReady, setModelsReady] = useState(false)
  const [loadingModels, setLoadingModels] = useState(true)

  // Live mode states
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [streamActive, setStreamActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [faceDetected, setFaceDetected] = useState(false)
  const [capturedEmbedding, setCapturedEmbedding] = useState<Float32Array | null>(null)
  const [capturedSnapshot, setCapturedSnapshot] = useState<string | null>(null)
  const [liveName, setLiveName] = useState('')
  const [liveRollNo, setLiveRollNo] = useState('')
  const [submittingLive, setSubmittingLive] = useState(false)

  // Bulk mode states
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([])
  const [isProcessingBulk, setIsProcessingBulk] = useState(false)
  const [submittingBulk, setSubmittingBulk] = useState(false)

  // Students list state
  const [students, setStudents] = useState<Student[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loadingStudents, setLoadingStudents] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Feedback Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev))
    }, 4500)
  }, [])

  // Load face-api.js models on mount
  useEffect(() => {
    let mounted = true
    async function init() {
      try {
        setLoadingModels(true)
        await loadModels()
        if (mounted) {
          setModelsReady(true)
          setLoadingModels(false)
        }
      } catch (err: unknown) {
        if (mounted) {
          setLoadingModels(false)
          showToast('Failed to load face detection models. Please check network/assets.', 'error')
          console.error('Model load error:', err)
        }
      }
    }
    init()
    return () => {
      mounted = false
    }
  }, [showToast])

  // Fetch enrolled students
  const fetchStudents = useCallback(async () => {
    try {
      setLoadingStudents(true)
      const supabase = createClient()
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setStudents(data || [])
    } catch (err: unknown) {
      console.error('Fetch students error:', err)
      showToast('Could not load student list from Supabase.', 'error')
    } finally {
      setLoadingStudents(false)
    }
  }, [showToast])

  useEffect(() => {
    fetchStudents()
  }, [fetchStudents])

  // Start webcam
  const startCamera = useCallback(async () => {
    setCameraError(null)
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Webcam API is not supported in this browser environment.')
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        setStreamActive(true)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to access camera.'
      setCameraError(msg)
      setStreamActive(false)
    }
  }, [])

  // Stop webcam
  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach((track) => track.stop())
      videoRef.current.srcObject = null
    }
    setStreamActive(false)
    setFaceDetected(false)
  }, [])

  // Start camera when Live tab is selected and models are ready
  useEffect(() => {
    if (activeTab === 'live' && modelsReady) {
      startCamera()
    } else {
      stopCamera()
    }
    return () => {
      stopCamera()
    }
  }, [activeTab, modelsReady, startCamera, stopCamera])

  // Continuous face detection loop for live bounding box
  useEffect(() => {
    let animationFrameId: number
    let isRunning = true

    async function detectLoop() {
      if (
        !isRunning ||
        activeTab !== 'live' ||
        !modelsReady ||
        !videoRef.current ||
        !canvasRef.current ||
        videoRef.current.readyState < 2
      ) {
        if (isRunning) {
          animationFrameId = requestAnimationFrame(detectLoop)
        }
        return
      }

      const video = videoRef.current
      const canvas = canvasRef.current

      if (video.videoWidth && video.videoHeight) {
        const displaySize = { width: video.videoWidth, height: video.videoHeight }
        if (canvas.width !== displaySize.width || canvas.height !== displaySize.height) {
          faceapi.matchDimensions(canvas, displaySize)
        }

        try {
          const detection = await faceapi.detectSingleFace(
            video,
            new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.35 })
          )

          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            if (detection) {
              setFaceDetected(true)
              const resized = faceapi.resizeResults(detection, displaySize)
              drawCornerReticle(ctx, resized.box, {
                color: '#c3f400',
                label: 'FACE VECTOR LOCK',
                subLabel: '128-D',
                showCrosshair: true,
                lineWidth: 2.5,
              })
            } else {
              setFaceDetected(false)
            }
          }
        } catch {
          // ignore transient detection errors
        }
      }

      if (isRunning) {
        // Run every ~120ms to save CPU
        setTimeout(() => {
          animationFrameId = requestAnimationFrame(detectLoop)
        }, 120)
      }
    }

    if (streamActive && modelsReady) {
      animationFrameId = requestAnimationFrame(detectLoop)
    }

    return () => {
      isRunning = false
      cancelAnimationFrame(animationFrameId)
    }
  }, [streamActive, modelsReady, activeTab])

  // Live Mode: Capture Face button handler
  const handleCaptureFace = async () => {
    if (!videoRef.current) return
    const video = videoRef.current

    try {
      showToast('Extracting facial embedding...', 'success')

      // Detect face with landmarks and descriptor
      let detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.35 }))
        .withFaceLandmarks()
        .withFaceDescriptor()

      if (!detection) {
        detection = await faceapi
          .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
          .withFaceLandmarks()
          .withFaceDescriptor()
      }

      if (!detection) {
        showToast('No face detected in current frame. Please center your face under good lighting.', 'error')
        return
      }

      setCapturedEmbedding(detection.descriptor)

      // Capture snapshot preview image
      const snapCanvas = document.createElement('canvas')
      snapCanvas.width = video.videoWidth || 640
      snapCanvas.height = video.videoHeight || 480
      const ctx = snapCanvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(video, 0, 0, snapCanvas.width, snapCanvas.height)
        setCapturedSnapshot(snapCanvas.toDataURL('image/jpeg', 0.85))
      }

      showToast('Face captured! 128-dimensional embedding extracted successfully.', 'success')
    } catch (err: unknown) {
      console.error('Capture error:', err)
      showToast('Error during facial feature extraction.', 'error')
    }
  }

  // Live Mode: Submit enrollment
  const handleSubmitLive = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!liveName.trim() || !liveRollNo.trim()) {
      showToast('Please provide both Student Name and Roll Number.', 'error')
      return
    }

    if (!capturedEmbedding) {
      showToast('Please click "Capture Face" first to compute the facial embedding.', 'error')
      return
    }

    setSubmittingLive(true)
    try {
      const supabase = createClient()
      const embeddingArray = Array.from(capturedEmbedding)

      const { error } = await supabase.from('students').insert({
        name: liveName.trim(),
        roll_no: liveRollNo.trim(),
        embedding: embeddingArray,
      })

      if (error) {
        if (error.code === '23505' || error.message.includes('unique') || error.message.includes('roll_no')) {
          throw new Error(`Student with Roll Number "${liveRollNo.trim()}" is already enrolled.`)
        }
        throw error
      }

      showToast(`Student "${liveName.trim()}" enrolled successfully!`, 'success')
      setLiveName('')
      setLiveRollNo('')
      setCapturedEmbedding(null)
      setCapturedSnapshot(null)
      fetchStudents()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to enroll student.'
      showToast(msg, 'error')
    } finally {
      setSubmittingLive(false)
    }
  }

  // Bulk Mode: Process uploaded files
  const handleBulkFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return

    const selectedFiles = Array.from(e.target.files)
    setIsProcessingBulk(true)

    // Parse filename pattern "RollNo_Name.ext"
    const newItems: BulkItem[] = selectedFiles.map((file) => {
      const base = file.name.replace(/\.[^/.]+$/, '')
      const underscoreIdx = base.indexOf('_')
      let rollNo = ''
      let name = ''

      if (underscoreIdx > 0) {
        rollNo = base.slice(0, underscoreIdx).trim()
        name = base.slice(underscoreIdx + 1).replace(/[_-]/g, ' ').trim()
      } else {
        name = base.replace(/[_-]/g, ' ').trim()
      }

      return {
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file),
        name,
        roll_no: rollNo,
        status: 'pending',
      }
    })

    setBulkItems((prev) => [...prev, ...newItems])

    // Process each image sequentially or in small parallel batches
    for (const item of newItems) {
      setBulkItems((curr) =>
        curr.map((i) => (i.id === item.id ? { ...i, status: 'processing' } : i))
      )

      try {
        const img = new Image()
        img.src = item.previewUrl
        await new Promise((res, rej) => {
          img.onload = res
          img.onerror = rej
        })

        const descriptor = await getFaceDescriptor(img)

        if (descriptor && descriptor.length === 128) {
          setBulkItems((curr) =>
            curr.map((i) =>
              i.id === item.id
                ? { ...i, status: 'ready', descriptor, errorMsg: undefined }
                : i
            )
          )
        } else {
          setBulkItems((curr) =>
            curr.map((i) =>
              i.id === item.id
                ? { ...i, status: 'error', errorMsg: 'No face detected' }
                : i
            )
          )
        }
      } catch {
        setBulkItems((curr) =>
          curr.map((i) =>
            i.id === item.id
              ? { ...i, status: 'error', errorMsg: 'Failed to process image' }
              : i
          )
        )
      }
    }

    setIsProcessingBulk(false)
    e.target.value = '' // reset input
  }

  // Bulk Mode: Batch Enroll Ready Students
  const handleBatchEnroll = async () => {
    const readyItems = bulkItems.filter((i) => i.status === 'ready')
    if (readyItems.length === 0) {
      showToast('No ready student faces to enroll.', 'error')
      return
    }

    // Validate that all have roll_no and name
    for (const item of readyItems) {
      if (!item.name.trim() || !item.roll_no.trim()) {
        showToast(`Please fill in Name and Roll Number for "${item.file.name}"`, 'error')
        return
      }
    }

    setSubmittingBulk(true)
    try {
      const supabase = createClient()
      const payload = readyItems.map((item) => ({
        name: item.name.trim(),
        roll_no: item.roll_no.trim(),
        embedding: Array.from(item.descriptor!),
      }))

      const { error } = await supabase.from('students').insert(payload)

      if (error) {
        if (error.code === '23505' || error.message.includes('unique') || error.message.includes('roll_no')) {
          throw new Error('One or more Roll Numbers in this batch are already enrolled in the database.')
        }
        throw error
      }

      showToast(`Successfully batch-enrolled ${readyItems.length} student(s)!`, 'success')
      // Remove enrolled items from list
      setBulkItems((curr) => curr.filter((i) => i.status !== 'ready'))
      fetchStudents()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Batch enrollment failed.'
      showToast(msg, 'error')
    } finally {
      setSubmittingBulk(false)
    }
  }

  // Delete student
  const handleDeleteStudent = async (id: string, name: string, roll_no: string) => {
    // 2. Confirmation dialog before delete
    if (!confirm(`This will also remove all attendance records for ${name}. Continue?`)) {
      return
    }

    setDeletingId(id)
    try {
      const supabase = createClient()

      // Delete associated attendance rows first as defense-in-depth against foreign key constraints
      const { error: attError } = await supabase.from('attendance').delete().eq('student_id', id)
      if (attError) {
        console.warn('Notice while deleting attendance rows for student:', attError.message)
      }

      // Delete the student record
      const { error: studentError } = await supabase.from('students').delete().eq('id', id)
      if (studentError) throw studentError

      showToast(`Student ${name} (${roll_no}) deleted successfully.`, 'success')

      // 3. Refresh the enrolled students list without a full page reload
      await fetchStudents()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete student.'
      showToast(msg, 'error')
    } finally {
      setDeletingId(null)
    }
  }

  // Filtered students
  const filteredStudents = students.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.roll_no.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6 pb-16 font-sans text-on-surface">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border transition-all animate-in fade-in slide-in-from-bottom-2 ${
            toast.type === 'success'
              ? 'bg-surface-container-lowest border-primary-fixed/40 text-primary-fixed'
              : 'bg-surface-container-lowest border-error/40 text-error'
          }`}
        >
          <span className="text-base font-bold">{toast.type === 'success' ? '✓' : '⚠️'}</span>
          <span className="text-xs font-mono font-medium">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 text-xs opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Real Model Status Bar */}
      <div className="w-full px-4 sm:px-space-md py-space-sm bg-surface-container-low rounded-xl border border-surface-container-high/60 flex items-center justify-between gap-space-md shadow-sm">
        <div className="text-xs font-mono text-on-surface-variant uppercase">
          Identity Enrollment
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-high border border-surface-container-high text-[10px] font-mono text-on-surface-variant">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              modelsReady ? 'bg-primary-fixed animate-pulse' : loadingModels ? 'bg-amber-400 animate-ping' : 'bg-error'
            }`}
          />
          <span className={modelsReady ? 'text-primary-fixed font-bold' : 'text-on-surface-variant'}>
            {modelsReady ? 'FACE-API MODELS LOADED' : loadingModels ? 'LOADING MODELS...' : 'MODELS UNAVAILABLE'}
          </span>
        </div>
      </div>

      {/* Page Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-surface-container-high/60 pb-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight uppercase">
            Student Identity Enrollment
          </h1>
          <p className="font-sans text-xs text-on-surface-variant mt-1">
            Capture 128-dimensional facial embeddings and register student identities for automated neural recognition.
          </p>
        </div>

        {/* Mode Tabs */}
        <div className="flex items-center gap-2 bg-surface-container-lowest p-1 rounded-xl border border-surface-container-high font-mono text-xs">
          <button
            onClick={() => setActiveTab('live')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 uppercase ${
              activeTab === 'live'
                ? 'bg-primary-fixed text-on-primary-fixed font-bold shadow-[0_0_12px_rgba(195,244,0,0.3)]'
                : 'text-on-surface-variant hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">videocam</span>
            <span>Live Capture</span>
          </button>

          <button
            onClick={() => setActiveTab('bulk')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 uppercase ${
              activeTab === 'bulk'
                ? 'bg-primary-fixed text-on-primary-fixed font-bold shadow-[0_0_12px_rgba(195,244,0,0.3)]'
                : 'text-on-surface-variant hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">cloud_upload</span>
            <span>Bulk Upload</span>
          </button>
        </div>
      </div>

      {/* MODE 1: LIVE CAPTURE */}
      {activeTab === 'live' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Camera Viewport & Controls (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="card-interactive relative aspect-video w-full bg-surface-container-lowest border-2 border-outline-variant/40 hover:border-primary/40 rounded-2xl overflow-hidden shadow-[0_0_35px_rgba(0,0,0,0.9)] flex items-center justify-center group">
              {/* Sweeping Laser Beam */}
              <div className="laser-beam pointer-events-none z-20" />

              {/* Corner Reticle HUD Brackets */}
              <div className="absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-primary shadow-[0_0_10px_#c3f400] z-20 pointer-events-none" />
              <div className="absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-primary shadow-[0_0_10px_#c3f400] z-20 pointer-events-none" />
              <div className="absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 border-primary shadow-[0_0_10px_#c3f400] z-20 pointer-events-none" />
              <div className="absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 border-primary shadow-[0_0_10px_#c3f400] z-20 pointer-events-none" />

              {cameraError ? (
                <div className="text-center p-8 space-y-3 z-20 font-mono">
                  <div className="text-error-dim text-4xl mb-2">📷</div>
                  <h3 className="font-display text-base font-bold text-white uppercase">Camera Access Failed</h3>
                  <p className="text-xs text-on-surface-variant max-w-sm">{cameraError}</p>
                  <button
                    onClick={startCamera}
                    className="mt-3 px-4 py-2 rounded-xl bg-primary text-black font-mono text-xs font-black uppercase tracking-wider transition shadow-[0_0_20px_rgba(195,244,0,0.4)]"
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
                    className="w-full h-full object-cover brightness-[0.9] contrast-125"
                  />
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10"
                  />

                  {/* Top Floating HUD Status Badge */}
                  <div className="absolute top-3 left-3 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-lowest/90 backdrop-blur-md border border-outline-variant/40 font-mono text-[10px]">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        faceDetected ? 'bg-primary animate-pulse shadow-[0_0_8px_#c3f400]' : 'bg-amber-400'
                      }`}
                    />
                    <span className={faceDetected ? 'text-primary-fixed font-bold tracking-wider text-glow-lime' : 'text-on-surface-variant'}>
                      {faceDetected ? 'FACE VECTOR LOCK' : 'SCANNING FOR FACE...'}
                    </span>
                  </div>

                  {/* Bottom Floating Telemetry */}
                  <div className="absolute bottom-3 right-3 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-lowest/90 backdrop-blur-md border border-outline-variant/40 font-mono text-[10px] text-on-surface-variant shadow-[0_0_15px_rgba(0,0,0,0.8)]">
                    <span>FEED: SENSOR_01</span>
                    <span className="text-secondary font-bold">· 128-D EMBEDDING</span>
                  </div>
                </>
              )}
            </div>

            {/* Camera Actions Bar */}
            <div className="card-interactive flex flex-wrap items-center justify-between gap-3 bg-surface-container-high border border-outline-variant/40 p-4 rounded-xl font-mono">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleCaptureFace}
                  disabled={!streamActive || !modelsReady}
                  className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-black uppercase tracking-wider shadow-[0_0_20px_rgba(195,244,0,0.4)] hover:shadow-[0_0_30px_rgba(195,244,0,0.65)] transition-all flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px]">photo_camera</span>
                  <span>Capture Face</span>
                </button>

                {streamActive ? (
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="px-4 py-2.5 rounded-xl bg-surface-container-highest hover:bg-surface-container-highest/80 text-on-surface text-xs font-bold uppercase transition border border-outline-variant/40 hover:border-error/40"
                  >
                    Pause Video
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="px-4 py-2.5 rounded-xl bg-surface-container-highest hover:bg-primary hover:text-black text-on-surface text-xs font-bold uppercase transition border border-outline-variant/40 hover:border-primary"
                  >
                    Start Video
                  </button>
                )}
              </div>

              {capturedEmbedding && (
                <div className="flex items-center gap-2 text-xs text-primary-fixed font-bold text-glow-lime animate-pulse-lime">
                  <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_#c3f400]" />
                  <span>EMBEDDING COMPILED (128-D)</span>
                </div>
              )}
            </div>
          </div>

          {/* Live Form & Face Preview (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="card-interactive bg-surface-container-high bg-[radial-gradient(ellipse_at_top_right,rgba(195,244,0,0.1),transparent_70%)] border border-outline-variant/40 rounded-2xl p-6 shadow-2xl space-y-5">
              <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_6px_#c3f400]" />
                  <h2 className="font-display text-sm font-bold text-white uppercase tracking-wide">
                    Student Registry Details
                  </h2>
                </div>
                <span className="font-mono text-[9px] text-secondary font-bold uppercase tracking-wider bg-surface-container-lowest px-2.5 py-0.5 rounded border border-secondary/30">
                  METADATA VAULT
                </span>
              </div>

              {/* Captured snapshot preview */}
              {capturedSnapshot ? (
                <div className="flex items-center gap-4 p-3.5 bg-surface-container-lowest rounded-xl border border-primary/50 shadow-[0_0_20px_rgba(195,244,0,0.25)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={capturedSnapshot}
                    alt="Captured face preview"
                    className="w-16 h-16 object-cover rounded-lg border-2 border-primary shadow-[0_0_10px_#c3f400]"
                  />
                  <div className="font-mono text-xs">
                    <div className="font-bold text-primary-fixed text-glow-lime flex items-center gap-1.5 uppercase">
                      <span>✓</span> Face Vector Acquired
                    </div>
                    <p className="text-[10px] text-on-surface-variant mt-1 font-sans">
                      128-element descriptor normalized and loaded in cryptographic memory.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-5 rounded-xl border border-dashed border-outline-variant/40 text-center space-y-1 bg-surface-container-lowest/50">
                  <p className="text-xs text-on-surface-variant font-mono font-bold uppercase tracking-wide">
                    No face vector captured yet
                  </p>
                  <p className="text-[11px] text-outline-variant font-sans">
                    Align face in the camera viewport and click &quot;Capture Face&quot;.
                  </p>
                </div>
              )}

              <form onSubmit={handleSubmitLive} className="space-y-4 font-mono">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-on-surface-variant uppercase tracking-wider block font-bold">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={liveName}
                    onChange={(e) => setLiveName(e.target.value)}
                    placeholder="e.g. Srijan Banerjee"
                    className="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant text-white placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-xs font-sans transition-all focus:shadow-[0_0_15px_rgba(195,244,0,0.2)]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-on-surface-variant uppercase tracking-wider block font-bold">
                    Roll Number / Academic ID *
                  </label>
                  <input
                    type="text"
                    required
                    value={liveRollNo}
                    onChange={(e) => setLiveRollNo(e.target.value)}
                    placeholder="e.g. 2601106003"
                    className="w-full px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant text-white placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-xs font-mono transition-all focus:shadow-[0_0_15px_rgba(195,244,0,0.2)]"
                  />
                  <p className="text-[10px] font-mono text-outline-variant">Unique institutional identifier</p>
                </div>

                <button
                  type="submit"
                  disabled={submittingLive || !capturedEmbedding}
                  className="w-full py-3.5 px-5 bg-primary hover:bg-primary/90 hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-mono text-xs font-black uppercase tracking-wider text-black shadow-[0_0_25px_rgba(195,244,0,0.45)] hover:shadow-[0_0_35px_rgba(195,244,0,0.7)] transition-all flex items-center justify-center gap-2 mt-2"
                >
                  {submittingLive ? (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full bg-black animate-ping" />
                      <span>REGISTERING VECTOR TO VAULT...</span>
                    </>
                  ) : (
                    <>
                      <span>ENROLL STUDENT IDENTITY</span>
                      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODE 2: BULK UPLOAD */}
      {activeTab === 'bulk' && (
        <div className="space-y-6">
          {/* Upload Dropzone */}
          <div className="p-8 border-2 border-dashed border-surface-container-high hover:border-secondary-container/60 rounded-xl bg-surface-container-lowest/70 text-center transition">
            <input
              type="file"
              id="bulk-file-input"
              multiple
              accept="image/*"
              onChange={handleBulkFileChange}
              className="hidden"
            />
            <label
              htmlFor="bulk-file-input"
              className="cursor-pointer flex flex-col items-center justify-center gap-3"
            >
              <div className="w-12 h-12 rounded-xl bg-surface-container-high border border-primary-fixed/30 text-primary-fixed flex items-center justify-center text-2xl shadow-[0_0_12px_rgba(195,244,0,0.2)]">
                <span className="material-symbols-outlined text-2xl">cloud_upload</span>
              </div>
              <div>
                <span className="font-mono text-xs font-bold text-primary-fixed hover:underline uppercase tracking-wider">
                  Click to select batch portrait files
                </span>{' '}
                <span className="font-sans text-xs text-on-surface-variant">or drag and drop multiple student photos</span>
                <p className="font-mono text-[11px] text-outline mt-1">
                  Format pattern: <code className="text-secondary-container">RollNo_Name.jpg</code> (e.g.{' '}
                  <code className="text-secondary-container">2601106003_Srijan.jpg</code>) for automated parsing.
                </p>
              </div>
            </label>
          </div>

          {/* Bulk Items Review Grid */}
          {bulkItems.length > 0 && (
            <div className="bg-surface-container-low border border-surface-container-high rounded-xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-surface-container-high/60 pb-4">
                <div>
                  <h2 className="font-display text-sm font-bold text-white uppercase tracking-tight">
                    Batch Vector Queue ({bulkItems.length} Files)
                  </h2>
                  <p className="font-sans text-xs text-on-surface-variant">
                    Verify detected facial embeddings and metadata tags before committing to the biometric vault.
                  </p>
                </div>

                <div className="flex items-center gap-2 font-mono">
                  <button
                    type="button"
                    onClick={() => setBulkItems([])}
                    className="px-3 py-1.5 rounded bg-surface-container hover:bg-surface-container-high text-xs text-on-surface-variant uppercase transition border border-surface-container-high"
                  >
                    Clear All
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchEnroll}
                    disabled={
                      submittingBulk ||
                      isProcessingBulk ||
                      bulkItems.filter((i) => i.status === 'ready').length === 0
                    }
                    className="px-4 py-1.5 rounded bg-primary-fixed hover:bg-primary-fixed-dim disabled:opacity-40 disabled:cursor-not-allowed text-on-primary-fixed text-xs font-bold uppercase tracking-wider shadow-[0_0_12px_rgba(195,244,0,0.3)] transition flex items-center gap-2"
                  >
                    {submittingBulk
                      ? 'Committing to Vault...'
                      : `Enroll Ready Identities (${bulkItems.filter((i) => i.status === 'ready').length})`}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                {bulkItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-surface-container-lowest border border-surface-container-high/80 rounded-xl p-3.5 space-y-3 relative flex flex-col justify-between"
                  >
                    <div className="flex items-start gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.previewUrl}
                        alt={item.file.name}
                        className="w-14 h-14 object-cover rounded-lg border border-surface-container-high flex-shrink-0"
                      />

                      <div className="flex-1 min-w-0 font-mono">
                        <p className="text-xs text-on-surface truncate" title={item.file.name}>
                          {item.file.name}
                        </p>

                        {/* Status Badge */}
                        <div className="mt-1">
                          {item.status === 'processing' && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-bold uppercase">
                              <span className="animate-spin text-xs">⟳</span> Computing vector...
                            </span>
                          )}
                          {item.status === 'ready' && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-primary-fixed font-bold uppercase">
                              ✓ 128-d Vector OK
                            </span>
                          )}
                          {item.status === 'error' && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-error font-bold uppercase">
                              ✕ {item.errorMsg || 'Error'}
                            </span>
                          )}
                          {item.status === 'pending' && (
                            <span className="text-[10px] text-outline uppercase">Queued</span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => setBulkItems((curr) => curr.filter((i) => i.id !== item.id))}
                        className="text-outline hover:text-error text-xs p-1"
                        title="Remove from queue"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Metadata fields */}
                    <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
                      <div>
                        <label className="text-[9px] uppercase tracking-wider text-on-surface-variant block mb-1">
                          Roll No
                        </label>
                        <input
                          type="text"
                          value={item.roll_no}
                          onChange={(e) => {
                            const val = e.target.value
                            setBulkItems((curr) =>
                              curr.map((i) => (i.id === item.id ? { ...i, roll_no: val } : i))
                            )
                          }}
                          placeholder="e.g. 2601106003"
                          className="w-full px-2 py-1 bg-surface-container-low border border-surface-container-high rounded text-xs text-white focus:outline-none focus:border-primary-fixed"
                        />
                      </div>

                      <div>
                        <label className="text-[9px] uppercase tracking-wider text-on-surface-variant block mb-1">
                          Name
                        </label>
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => {
                            const val = e.target.value
                            setBulkItems((curr) =>
                              curr.map((i) => (i.id === item.id ? { ...i, name: val } : i))
                            )
                          }}
                          placeholder="e.g. Srijan"
                          className="w-full px-2 py-1 bg-surface-container-low border border-surface-container-high rounded text-xs text-white focus:outline-none focus:border-primary-fixed"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 5: ENROLLED STUDENTS ROSTER */}
      <div className="card-interactive bg-surface-container-lowest bg-[radial-gradient(ellipse_at_bottom_right,rgba(195,244,0,0.08),transparent_70%)] border border-outline-variant/40 rounded-2xl p-7 shadow-2xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant/30 pb-4">
          <div>
            <h2 className="font-display text-base font-bold text-white tracking-tight uppercase flex items-center gap-2">
              <span>Enrolled Students Roster</span>
              <span className="font-mono text-[10px] font-black px-2.5 py-0.5 rounded-full bg-surface-container-high text-primary-fixed border border-primary/30 text-glow-lime">
                {students.length} TOTAL
              </span>
            </h2>
            <p className="font-mono text-xs text-on-surface-variant mt-0.5">
              Verified facial vector representations stored in biometric enclave with 128-element embeddings.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or roll number..."
              className="px-4 py-2 rounded-xl bg-surface-container-low border border-outline-variant text-white placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:shadow-[0_0_12px_rgba(195,244,0,0.2)] text-xs font-mono w-64 transition-all"
            />
            <button
              onClick={fetchStudents}
              className="p-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-primary-fixed text-xs transition border border-outline-variant/40 hover:border-primary/40"
              title="Refresh roster from database"
            >
              🔄
            </button>
          </div>
        </div>

        {/* Student Table */}
        {loadingStudents ? (
          <div className="py-12 text-center text-xs font-mono text-on-surface-variant space-y-2">
            <div className="animate-spin text-xl inline-block text-primary">⏳</div>
            <p>Fetching biometric roster records from database...</p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="py-12 text-center text-xs font-mono text-on-surface-variant">
            {searchQuery ? 'No enrolled students match your search query.' : 'No students enrolled yet. Use Live Capture or Bulk Upload above to enroll.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans text-on-surface">
              <thead className="bg-surface-container-low font-mono text-[10px] uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/30">
                <tr>
                  <th className="py-3.5 px-4">Roll Number</th>
                  <th className="py-3.5 px-4">Student Name</th>
                  <th className="py-3.5 px-4">Biometric Status</th>
                  <th className="py-3.5 px-4">Enrolled On</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20 font-mono text-xs">
                {filteredStudents.map((student) => (
                  <tr
                    key={student.id}
                    className="hover:bg-surface-container-high/40 hover:scale-[1.005] transition-all duration-150 group"
                  >
                    <td className="py-3.5 px-4 font-bold text-secondary">
                      {student.roll_no}
                    </td>
                    <td className="py-3.5 px-4 font-sans font-bold text-white group-hover:text-primary-fixed transition-colors">
                      {student.name}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary-fixed text-[10px] font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_6px_#c3f400]" />
                        128-D VECTOR
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-on-surface-variant text-[11px]">
                      {new Date(student.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleDeleteStudent(student.id, student.name, student.roll_no)}
                        disabled={deletingId === student.id}
                        className="px-3 py-1.5 rounded-lg bg-surface-container-highest hover:bg-error-container hover:text-error text-on-surface-variant border border-outline-variant/40 hover:border-error/50 hover:shadow-[0_0_12px_rgba(255,180,171,0.3)] text-[11px] font-mono font-bold uppercase transition-all disabled:opacity-40"
                      >
                        {deletingId === student.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
