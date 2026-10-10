'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setError(signInError.message)
        setLoading(false)
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background font-sans text-on-surface antialiased flex items-center justify-center p-4 sm:p-gutter lg:p-margin-lg selection:bg-primary-container selection:text-on-primary-container">
      <div className="w-full max-w-6xl bg-surface-container-lowest bg-[radial-gradient(ellipse_at_top_right,rgba(195,244,0,0.12),transparent_60%)] border border-outline-variant/40 rounded-3xl p-6 sm:p-space-xl shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden">
        {/* Ambient Glow */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-lg items-stretch w-full">
          {/* LEFT SIDE: Brand & Optical Reticle Hero */}
          <section className="lg:col-span-7 flex flex-col justify-between py-space-sm space-y-space-lg">
            <div className="space-y-space-md">
              {/* Badge */}
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-surface-container-high border border-primary/30 text-on-surface w-fit">
                <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_#c3f400]" />
                <span className="font-mono text-[9px] uppercase text-primary-fixed tracking-widest font-bold">
                  BIOMETRIC ATTENDANCE STUDIO
                </span>
              </div>

              {/* Hero Typography */}
              <h1 className="font-display text-3xl sm:text-5xl lg:text-6xl uppercase tracking-tighter text-white font-black leading-none">
                ATTENDANCE AT THE{' '}
                <span className="text-primary-fixed text-glow-lime">
                  SPEED OF SIGHT.
                </span>
              </h1>
              <p className="font-sans text-sm sm:text-base text-on-surface-variant max-w-xl leading-relaxed">
                Facial recognition attendance management with client-side liveness detection and cryptographic hash-chain verification.
              </p>
            </div>

            {/* Signature Motif: Visual Reticle Box */}
            <div className="relative w-full rounded-2xl bg-surface-container-low/70 border border-outline-variant/40 p-space-md overflow-hidden shadow-2xl">
              {/* SVG Scanning Beam & Mesh */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-40" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="scanBeam" x1="0%" x2="0%" y1="0%" y2="100%">
                    <stop offset="0%" stopColor="#c3f400" stopOpacity="0" />
                    <stop offset="50%" stopColor="#c3f400" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#c3f400" stopOpacity="0" />
                  </linearGradient>
                  <pattern id="meshGrid" width="24" height="24" patternUnits="userSpaceOnUse">
                    <circle cx="12" cy="12" r="0.75" fill="#00eefc" fillOpacity="0.3" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#meshGrid)" />
                <rect x="0" y="0" width="100%" height="4" fill="url(#scanBeam)">
                  <animate attributeName="y" values="-10;220;-10" dur="4.2s" repeatCount="indefinite" />
                </rect>
              </svg>

              {/* Reticle Inner Details */}
              <div className="relative flex flex-col justify-between h-44 sm:h-48 z-10 font-mono text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="text-secondary font-semibold">FACIAL RECOGNITION PIPELINE</span>
                  <span className="px-2 py-0.5 rounded bg-surface-container-high text-primary-fixed font-bold border border-primary/30">
                    REAL-TIME
                  </span>
                </div>

                {/* Central Tracking Reticle Target */}
                <div className="self-center flex items-center justify-center relative w-20 h-20">
                  <span className="absolute top-0 left-0 text-primary-fixed text-lg leading-none select-none font-black drop-shadow-[0_0_8px_#c3f400]">⌜</span>
                  <span className="absolute top-0 right-0 text-primary-fixed text-lg leading-none select-none font-black drop-shadow-[0_0_8px_#c3f400]">⌝</span>
                  <span className="absolute bottom-0 left-0 text-primary-fixed text-lg leading-none select-none font-black drop-shadow-[0_0_8px_#c3f400]">⌞</span>
                  <span className="absolute bottom-0 right-0 text-primary-fixed text-lg leading-none select-none font-black drop-shadow-[0_0_8px_#c3f400]">⌟</span>
                  <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center border border-primary/50 shadow-[0_0_16px_rgba(195,244,0,0.45)]">
                    <span className="material-symbols-outlined text-secondary text-base pointer-events-none">center_focus_strong</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-on-surface-variant font-mono">
                  <span>128-D VECTOR MATCHING</span>
                  <span>IMMUTABLE HASH-CHAIN LEDGER</span>
                </div>
              </div>
            </div>

            {/* Architecture Highlights */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-[11px]">
              <div className="p-2.5 rounded-lg bg-surface-container-low text-center text-white border border-outline-variant/30">
                LIVENESS CHECK
              </div>
              <div className="p-2.5 rounded-lg bg-surface-container-low text-center text-white border border-outline-variant/30">
                SHA-256 LEDGER
              </div>
              <div className="p-2.5 rounded-lg bg-surface-container-low text-center text-white border border-outline-variant/30 col-span-2 sm:col-span-1">
                INSTANT EXPORT
              </div>
            </div>
          </section>

          {/* RIGHT SIDE: Tactical Auth Portal */}
          <section className="lg:col-span-5 flex flex-col justify-between bg-surface-container-high/80 rounded-2xl p-6 sm:p-space-lg shadow-2xl relative z-20 border border-outline-variant/40">
            <div className="space-y-space-md relative z-10">
              {/* Card Header */}
              <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/30">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_10px_#c3f400]" />
                  <span className="font-display text-base font-black uppercase tracking-tight text-white">
                    LAB ACCESS
                  </span>
                </div>
                <span className="font-mono text-[9px] text-secondary font-bold uppercase tracking-wider bg-surface-container-lowest px-2.5 py-1 rounded-full border border-secondary/30">
                  PROCTOR AUTH // 01
                </span>
              </div>

              {/* Error Banner */}
              {error && (
                <div className="p-3.5 rounded-xl bg-surface-container-highest border border-error/40 text-error-dim text-xs flex items-start gap-2 font-mono">
                  <span className="material-symbols-outlined text-[16px] flex-shrink-0">error</span>
                  <span className="leading-relaxed">{error}</span>
                </div>
              )}

              {/* Login Form */}
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider block font-bold">
                    INSTITUTIONAL_HANDLE // EMAIL
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="researcher@stanford.edu"
                      className="w-full bg-surface-container-lowest text-white placeholder:text-on-surface-variant/50 font-sans text-xs px-4 py-3 rounded-xl border border-outline-variant focus:outline-none focus:border-primary focus:shadow-[0_0_15px_rgba(195,244,0,0.25)] transition-all cursor-text relative z-10"
                    />
                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline-variant text-[16px] pointer-events-none select-none z-20">
                      alternate_email
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider block font-bold">
                      SESSION_TOKEN // PASSWORD
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••••••"
                      className="w-full bg-surface-container-lowest text-white placeholder:text-on-surface-variant/50 font-sans text-xs px-4 py-3 rounded-xl border border-outline-variant focus:outline-none focus:border-primary focus:shadow-[0_0_15px_rgba(195,244,0,0.25)] transition-all cursor-text relative z-10"
                    />
                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline-variant text-[16px] pointer-events-none select-none z-20">
                      lock
                    </span>
                  </div>
                </div>

                {/* Primary CTA Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-5 rounded-xl bg-primary text-black font-mono text-xs font-black uppercase tracking-wider hover:bg-primary/90 hover:scale-[1.01] active:scale-[0.99] shadow-[0_0_25px_rgba(195,244,0,0.45)] hover:shadow-[0_0_35px_rgba(195,244,0,0.7)] transition-all flex items-center justify-center space-x-2 disabled:opacity-50 mt-2 cursor-pointer relative z-10"
                >
                  {loading ? (
                    <>
                      <span className="w-3 h-3 rounded-full bg-black animate-ping" />
                      <span>INITIALIZING SECURE ENCLAVE...</span>
                    </>
                  ) : (
                    <>
                      <span>INITIALIZE SECURE WORKSPACE</span>
                      <span className="material-symbols-outlined text-[16px] pointer-events-none">arrow_forward</span>
                    </>
                  )}
                </button>
              </form>

              {/* Link to Signup */}
              <div className="text-center pt-2 border-t border-surface-container-high/40">
                <span className="font-mono text-[11px] text-on-surface-variant">
                  Need new operator credentials?{' '}
                </span>
                <Link
                  href="/signup"
                  className="font-mono text-[11px] text-primary-fixed hover:underline font-semibold"
                >
                  Register Enclave
                </Link>
              </div>
            </div>

            {/* Micro Security Telemetry Footer */}
            <div className="mt-space-lg pt-space-xs border-t border-surface-container-high/40 text-left space-y-1 font-mono text-[10px]">
              <div className="flex items-center space-x-1.5 text-on-surface-variant">
                <span className="material-symbols-outlined text-[14px] text-primary-fixed">verified_user</span>
                <span>FIDO2 / WebAuthn Compliant · Zero-Knowledge Encryption</span>
              </div>
              <p className="font-sans text-[11px] text-outline">
                Biometric vectors never stored unhashed. Cryptographic SHA-256 signatures computed client-side.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
