'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SignUpPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const supabase = createClient()
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (signUpError) {
        setError(signUpError.message)
        setLoading(false)
        return
      }

      setSuccess(true)
      setLoading(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background font-sans text-on-surface antialiased flex items-center justify-center p-4 sm:p-gutter lg:p-margin-lg selection:bg-primary-container selection:text-on-primary-container">
      <div className="w-full max-w-6xl card-interactive bg-surface-container-lowest bg-[radial-gradient(ellipse_at_top_right,rgba(195,244,0,0.12),transparent_60%)] border border-outline-variant/40 rounded-3xl p-6 sm:p-space-xl shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden">
        {/* Ambient Glow */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-lg items-stretch w-full">
          {/* LEFT SIDE: Brand & Enclave Registration Philosophy */}
          <section className="lg:col-span-7 flex flex-col justify-between py-space-sm space-y-space-lg">
            <div className="space-y-space-md">
              {/* Badge */}
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-surface-container-high border border-primary/30 text-on-surface w-fit">
                <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_#c3f400]" />
                <span className="font-mono text-[9px] uppercase text-primary-fixed tracking-widest font-bold">
                  PROCTOR REGISTRATION
                </span>
              </div>

              {/* Hero Typography */}
              <h1 className="font-display text-3xl sm:text-5xl lg:text-6xl uppercase tracking-tighter text-white font-black leading-none">
                CREATE OPERATOR{' '}
                <span className="text-primary-fixed text-glow-lime">
                  ACCOUNT.
                </span>
              </h1>
              <p className="font-sans text-sm sm:text-base text-on-surface-variant max-w-xl leading-relaxed">
                Register a new proctor account to manage student biometric enrollments, conduct live attendance capture, and view verifiable attendance logs.
              </p>
            </div>

            {/* Visual Reticle Box */}
            <div className="relative w-full rounded-2xl bg-surface-container-low/70 border border-outline-variant/40 p-space-md overflow-hidden shadow-2xl">
              <div className="relative flex flex-col justify-between h-44 sm:h-48 z-10 font-mono text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="text-secondary font-semibold">SECURITY SPECIFICATION</span>
                  <span className="px-2 py-0.5 rounded bg-surface-container-high text-primary-fixed font-bold border border-primary/30">
                    CLIENT-SIDE
                  </span>
                </div>

                <div className="self-center flex items-center justify-center relative w-20 h-20">
                  <span className="absolute top-0 left-0 text-primary-fixed text-lg leading-none font-black drop-shadow-[0_0_8px_#c3f400]">⌜</span>
                  <span className="absolute top-0 right-0 text-primary-fixed text-lg leading-none font-black drop-shadow-[0_0_8px_#c3f400]">⌝</span>
                  <span className="absolute bottom-0 left-0 text-primary-fixed text-lg leading-none font-black drop-shadow-[0_0_8px_#c3f400]">⌞</span>
                  <span className="absolute bottom-0 right-0 text-primary-fixed text-lg leading-none font-black drop-shadow-[0_0_8px_#c3f400]">⌟</span>
                  <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center border border-primary/50 shadow-[0_0_16px_rgba(195,244,0,0.45)]">
                    <span className="material-symbols-outlined text-primary-fixed text-base">key</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-on-surface-variant font-mono">
                  <span>SHA-256 HASH CHAINS</span>
                  <span className="text-secondary font-bold">BLINK LIVENESS DETECTION</span>
                </div>
              </div>
            </div>

            {/* Architecture Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px]">
              <div className="p-2.5 rounded-lg bg-surface-container-low text-center text-white border border-outline-variant/30">
                128-D EMBEDDINGS
              </div>
              <div className="p-2.5 rounded-lg bg-surface-container-low text-center text-white border border-outline-variant/30">
                SUPABASE RLS
              </div>
              <div className="p-2.5 rounded-lg bg-surface-container-low text-center text-white border border-outline-variant/30">
                CSV EXPORT
              </div>
            </div>
          </section>

          {/* RIGHT SIDE: Onboarding Form */}
          <section className="lg:col-span-5 flex flex-col justify-between bg-surface-container-high/80 rounded-2xl p-6 sm:p-space-lg shadow-2xl relative z-20 border border-outline-variant/40">
            <div className="space-y-space-md relative z-10">
              <div className="flex items-center justify-between pb-space-xs border-b border-surface-container-high/60">
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-primary-fixed shadow-[0_0_8px_#c3f400]" />
                  <span className="font-display text-sm font-bold uppercase tracking-tight text-white">
                    PROCTOR ONBOARDING
                  </span>
                </div>
                <span className="font-mono text-[9px] text-secondary uppercase tracking-wider bg-surface-container-high px-2 py-0.5 rounded">
                  NEW REGISTRATION
                </span>
              </div>

              {error && (
                <div className="p-3 rounded bg-error-container/40 border border-error/30 text-error text-xs flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] flex-shrink-0">error</span>
                  <span className="font-mono leading-relaxed">{error}</span>
                </div>
              )}

              {success ? (
                <div className="p-6 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-center space-y-4">
                  <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto text-xl border border-emerald-500/40">
                    ✓
                  </div>
                  <div>
                    <h2 className="font-display text-base font-bold text-white uppercase tracking-tight">
                      Confirmation Link Dispatched
                    </h2>
                    <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">
                      We sent a confirmation link to{' '}
                      <span className="font-mono text-primary-fixed font-semibold">{email}</span>. Please verify your institutional address to activate proctor privileges.
                    </p>
                  </div>
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-surface-container-high hover:bg-surface-variant text-on-surface font-mono text-xs uppercase tracking-wider rounded border border-surface-container-highest transition"
                  >
                    <span>Proceed to Sign In</span>
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </Link>
                </div>
              ) : (
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-1">
                    <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider block">
                      INSTITUTIONAL_HANDLE // EMAIL
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="proctor@university.edu"
                        className="w-full bg-surface-container-lowest text-white placeholder:text-surface-variant font-sans text-xs px-3.5 py-2.5 rounded border border-surface-container-high focus:outline-none focus:border-primary focus:text-white transition-all cursor-text relative z-10"
                      />
                      <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline-variant text-[16px] pointer-events-none select-none z-20">
                        alternate_email
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider block">
                      MASTER_CIPHER // PASSWORD (MIN 6 CHARS)
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••••••"
                        className="w-full bg-surface-container-lowest text-white placeholder:text-surface-variant font-sans text-xs px-3.5 py-2.5 rounded border border-surface-container-high focus:outline-none focus:border-primary focus:text-white transition-all cursor-text relative z-10"
                      />
                      <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline-variant text-[16px] pointer-events-none select-none z-20">
                        lock
                      </span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 px-4 rounded-xl bg-primary text-black font-mono text-xs font-black uppercase tracking-wider hover:bg-primary/90 hover:scale-[1.01] active:scale-[0.99] shadow-[0_0_24px_rgba(195,244,0,0.4)] transition-all flex items-center justify-center space-x-2 disabled:opacity-50 mt-2 cursor-pointer relative z-10"
                  >
                    {loading ? (
                      <>
                        <span className="w-3 h-3 rounded-full bg-black animate-ping" />
                        <span>PROVISIONING ENCLAVE KEY...</span>
                      </>
                    ) : (
                      <>
                        <span>REGISTER PROCTOR KEY</span>
                        <span className="material-symbols-outlined text-[16px] pointer-events-none">arrow_forward</span>
                      </>
                    )}
                  </button>
                </form>
              )}

              <div className="text-center pt-2 border-t border-surface-container-high/40">
                <span className="font-mono text-[11px] text-on-surface-variant">
                  Already have access?{' '}
                </span>
                <Link
                  href="/login"
                  className="font-mono text-[11px] text-primary-fixed hover:underline font-semibold"
                >
                  Sign In to Terminal
                </Link>
              </div>
            </div>

            <div className="mt-space-lg pt-space-xs border-t border-surface-container-high/40 text-left space-y-1 font-mono text-[10px]">
              <div className="flex items-center space-x-1.5 text-on-surface-variant">
                <span className="material-symbols-outlined text-[14px] text-primary-fixed">shield</span>
                <span>Zero-Knowledge Authentication · Cryptographic Security</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
