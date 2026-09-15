'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { loadModels, getFaceDescriptor, faceapi } from '@/lib/faceRecognition'
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
              const box = resized.box
              ctx.strokeStyle = '#6366f1'
              ctx.lineWidth = 3
              ctx.strokeRect(box.x, box.y, box.width, box.height)

              // Corner accents
              ctx.fillStyle = '#818cf8'
              const cornerSize = 8
              ctx.fillRect(box.x - 2, box.y - 2, cornerSize, cornerSize)
              ctx.fillRect(box.x + box.width - cornerSize + 2, box.y - 2, cornerSize, cornerSize)
              ctx.fillRect(box.x - 2, box.y + box.height - cornerSize + 2, cornerSize, cornerSize)
              ctx.fillRect(box.x + box.width - cornerSize + 2, box.y + box.height - cornerSize + 2, cornerSize, cornerSize)
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
      } catch (err: unknown) {
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
    if (!confirm(`Are you sure you want to delete student "${name}" (${roll_no})?`)) return

    setDeletingId(id)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('students').delete().eq('id', id)
      if (error) throw error

      showToast(`Student ${name} deleted successfully.`, 'success')
      setStudents((prev) => prev.filter((s) => s.id !== id))
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
    <div className="space-y-8 pb-16">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border transition-all animate-bounce ${
            toast.type === 'success'
              ? 'bg-emerald-950/95 border-emerald-500/40 text-emerald-200'
              : 'bg-red-950/95 border-red-500/40 text-red-200'
          }`}
        >
          <span className="text-lg">{toast.type === 'success' ? '✓' : '⚠️'}</span>
          <span className="text-sm font-medium">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 text-xs opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Student Enrollment</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Capture face embeddings and register student identities for automated attendance.
          </p>
        </div>

        {/* Model status indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-400 w-fit">
          <span
            className={`w-2 h-2 rounded-full ${
              modelsReady ? 'bg-emerald-400' : loadingModels ? 'bg-amber-400 animate-ping' : 'bg-red-400'
            }`}
          />
          <span>{modelsReady ? 'Face Models Loaded' : loadingModels ? 'Loading Models...' : 'Model Error'}</span>
        </div>
      </div>

      {/* Mode Tabs */}
      <div className="flex border-b border-slate-800 space-x-4">
        <button
          onClick={() => setActiveTab('live')}
          className={`pb-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'live'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Live Capture
        </button>

        <button
          onClick={() => setActiveTab('bulk')}
          className={`pb-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'bulk'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Bulk Upload
        </button>
      </div>

      {/* MODE 1: LIVE CAPTURE */}
      {activeTab === 'live' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Camera Viewport & Controls */}
          <div className="lg:col-span-7 space-y-4">
            <div className="relative aspect-video w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center">
              {cameraError ? (
                <div className="text-center p-6 space-y-2">
                  <div className="text-red-400 text-3xl mb-2">📷</div>
                  <h3 className="text-sm font-semibold text-white">Camera Access Error</h3>
                  <p className="text-xs text-slate-400 max-w-sm">{cameraError}</p>
                  <button
                    onClick={startCamera}
                    className="mt-3 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs transition"
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

                  {/* Top floating detection badge */}
                  <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-950/80 backdrop-blur-md border border-slate-700/60 text-xs">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        faceDetected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                      }`}
                    />
                    <span className="text-slate-300 font-medium">
                      {faceDetected ? 'Face in Frame' : 'Detecting Face...'}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Camera Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 border border-slate-800/80 p-3.5 rounded-xl">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCaptureFace}
                  disabled={!streamActive || !modelsReady}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Capture Face
                </button>

                {streamActive ? (
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                  >
                    Pause Video
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                  >
                    Start Video
                  </button>
                )}
              </div>

              {capturedEmbedding && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Embedding ready (128-d)
                </div>
              )}
            </div>
          </div>

          {/* Live Form & Face Preview */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-5">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <span>Student Details</span>
              </h2>

              {/* Captured snapshot preview */}
              {capturedSnapshot ? (
                <div className="flex items-center gap-4 p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={capturedSnapshot}
                    alt="Captured face preview"
                    className="w-16 h-16 object-cover rounded-lg border border-indigo-500/40"
                  />
                  <div>
                    <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                      <span>✓</span> Face Captured
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      128-element descriptor calculated and stored in memory.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-slate-800 text-center space-y-1">
                  <p className="text-xs text-slate-400 font-medium">No face captured yet</p>
                  <p className="text-[11px] text-slate-500">
                    Align your face with the camera feed and click &quot;Capture Face&quot;.
                  </p>
                </div>
              )}

              <form onSubmit={handleSubmitLive} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={liveName}
                    onChange={(e) => setLiveName(e.target.value)}
                    placeholder="e.g. Srijan Paul"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
                    Roll Number / ID *
                  </label>
                  <input
                    type="text"
                    required
                    value={liveRollNo}
                    onChange={(e) => setLiveRollNo(e.target.value)}
                    placeholder="e.g. 21CS042"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Must be unique per student</p>
                </div>

                <button
                  type="submit"
                  disabled={submittingLive || !capturedEmbedding}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-semibold text-white shadow-lg shadow-indigo-600/30 transition text-sm flex items-center justify-center gap-2"
                >
                  {submittingLive ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>Enrolling Student...</span>
                    </>
                  ) : (
                    'Enroll Student'
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
          <div className="p-8 border-2 border-dashed border-slate-800 hover:border-indigo-500/60 rounded-2xl bg-slate-900/40 text-center transition">
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
              <div className="w-12 h-12 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-2xl">
                📁
              </div>
              <div>
                <span className="text-sm font-semibold text-indigo-400 hover:text-indigo-300 underline">
                  Click to select images
                </span>{' '}
                <span className="text-sm text-slate-400">or drag and drop multiple student photos</span>
                <p className="text-xs text-slate-500 mt-1">
                  Tip: Name files as <code className="text-indigo-300 font-mono">RollNo_Name.jpg</code> (e.g.{' '}
                  <code className="text-indigo-300 font-mono">21_Srijan.jpg</code>) for automated extraction.
                </p>
              </div>
            </label>
          </div>

          {/* Bulk Items Review Grid */}
          {bulkItems.length > 0 && (
            <div className="bg-slate-900/80 border border-slate-800 p-6 rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-base font-semibold text-white">Batch Queue ({bulkItems.length} files)</h2>
                  <p className="text-xs text-slate-400">
                    Review and verify detected faces and metadata before saving to Supabase.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBulkItems([])}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition"
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
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition flex items-center gap-2"
                  >
                    {submittingBulk ? 'Saving to Supabase...' : `Enroll Ready Students (${bulkItems.filter((i) => i.status === 'ready').length})`}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                {bulkItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 space-y-3 relative flex flex-col justify-between"
                  >
                    <div className="flex items-start gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.previewUrl}
                        alt={item.file.name}
                        className="w-14 h-14 object-cover rounded-lg border border-slate-800 flex-shrink-0"
                      />

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono text-slate-300 truncate" title={item.file.name}>
                          {item.file.name}
                        </p>

                        {/* Status Badge */}
                        <div className="mt-1">
                          {item.status === 'processing' && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-medium">
                              <span className="animate-spin text-xs">⟳</span> Detecting face...
                            </span>
                          )}
                          {item.status === 'ready' && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                              ✓ Face detected (128-d)
                            </span>
                          )}
                          {item.status === 'error' && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-red-400 font-medium">
                              ✕ {item.errorMsg || 'Error'}
                            </span>
                          )}
                          {item.status === 'pending' && (
                            <span className="text-[11px] text-slate-500">Queued</span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => setBulkItems((curr) => curr.filter((i) => i.id !== item.id))}
                        className="text-slate-500 hover:text-red-400 text-xs p-1"
                        title="Remove from queue"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Metadata fields */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-slate-400 block mb-1">
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
                          placeholder="e.g. 21"
                          className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-slate-400 block mb-1">
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
                          className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-white focus:outline-none focus:border-indigo-500"
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

      {/* SECTION 5: ENROLLED STUDENTS LIST */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span>Enrolled Students</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                {students.length} Total
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Verified face representations stored in Supabase with vector embeddings.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or roll number..."
              className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs w-64"
            />
            <button
              onClick={fetchStudents}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
              title="Refresh list"
            >
              🔄
            </button>
          </div>
        </div>

        {/* Student Table */}
        {loadingStudents ? (
          <div className="py-12 text-center text-xs text-slate-400 space-y-2">
            <div className="animate-spin text-xl inline-block">⏳</div>
            <p>Loading enrolled students from database...</p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            {searchQuery ? 'No enrolled students match your search.' : 'No students enrolled yet. Use Live Capture or Bulk Upload above to enroll.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Roll Number</th>
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Biometric Status</th>
                  <th className="py-3 px-4">Enrolled On</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 px-4 font-mono font-medium text-indigo-300">
                      {student.roll_no}
                    </td>
                    <td className="py-3 px-4 font-medium text-white">
                      {student.name}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        128-d Vector
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {new Date(student.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleDeleteStudent(student.id, student.name, student.roll_no)}
                        disabled={deletingId === student.id}
                        className="px-2.5 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs transition disabled:opacity-40"
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
