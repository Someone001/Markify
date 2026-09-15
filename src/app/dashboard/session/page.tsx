'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Session, SessionLocation } from '@/types/database'

const LOCATIONS: { id: SessionLocation; label: string; icon: string }[] = [
  { id: 'classroom', label: 'Classroom', icon: '🏫' },
  { id: 'canteen', label: 'Canteen', icon: '☕' },
  { id: 'library', label: 'Library', icon: '📚' },
  { id: 'auditorium', label: 'Auditorium', icon: '🎭' },
]

export default function SessionIndexPage() {
  const router = useRouter()
  const [className, setClassName] = useState('')
  const [location, setLocation] = useState<SessionLocation>('classroom')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [loadingSessions, setLoadingSessions] = useState(true)

  // Fetch recent sessions
  const fetchSessions = async () => {
    try {
      setLoadingSessions(true)
      const supabase = createClient()
      const { data, error: fetchErr } = await supabase
        .from('sessions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)

      if (fetchErr) throw fetchErr
      setSessions(data || [])
    } catch (err: unknown) {
      console.error('Error fetching sessions:', err)
    } finally {
      setLoadingSessions(false)
    }
  }

  useEffect(() => {
    fetchSessions()
  }, [])

  // Create new session
  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!className.trim()) return

    setIsCreating(true)
    setError(null)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      // Insert with location column (fallback safely if migration not yet applied)
      let insertResult = await supabase
        .from('sessions')
        .insert({
          class_name: className.trim(),
          location: location,
          created_by: user?.id || null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .select('id')
        .single()

      if (insertResult.error && insertResult.error.message?.includes('location')) {
        // Retry without location if column doesn't exist yet on remote db
        insertResult = await supabase
          .from('sessions')
          .insert({
            class_name: className.trim(),
            created_by: user?.id || null,
          })
          .select('id')
          .single()
      }

      if (insertResult.error) throw insertResult.error

      router.push(`/dashboard/session/${insertResult.data.id}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create session.'
      setError(msg)
      setIsCreating(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="border-b border-outline-variant/30 pb-4">
        <h1 className="font-display text-2xl sm:text-3xl font-black text-white tracking-tight uppercase flex items-center gap-3">
          <span>Attendance Sessions</span>
        </h1>
        <p className="font-mono text-xs text-on-surface-variant mt-1">
          Start a new real-time biometric attendance capture session or review previous sessions.
        </p>
      </div>

      {/* New Session Card with Radial Lime Gradient */}
      <div className="bg-surface-container-high bg-[radial-gradient(ellipse_at_top_right,rgba(195,244,0,0.12),transparent_70%)] rounded-2xl p-7 shadow-2xl relative overflow-hidden border border-outline-variant/40 space-y-5">
        <div>
          <h2 className="font-display text-lg font-bold text-white uppercase tracking-tight flex items-center gap-2">
            <span>Start New Attendance Session</span>
          </h2>
          <p className="font-sans text-xs text-on-surface-variant mt-0.5">
            Enter course code or class designation to begin real-time attendance verification.
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-surface-container-highest border border-error/50 text-error-dim font-mono text-xs shadow-[0_0_15px_rgba(255,180,171,0.2)]">
            {error}
          </div>
        )}

        <form onSubmit={handleCreateSession} className="flex flex-col sm:flex-row gap-3 pt-1">
          <input
            type="text"
            required
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            placeholder="e.g. CS231N - Lecture 08 (Biometric Vision)"
            className="flex-1 px-4 py-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant text-white placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary focus:shadow-[0_0_18px_rgba(195,244,0,0.25)] text-xs font-mono transition-all"
          />

          {/* Location Dropdown */}
          <div className="relative min-w-[170px]">
            <select
              id="location-select"
              required
              value={location}
              onChange={(e) => setLocation(e.target.value as SessionLocation)}
              className="w-full px-4 py-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary focus:shadow-[0_0_18px_rgba(195,244,0,0.25)] text-xs font-mono transition-all cursor-pointer appearance-none"
            >
              {LOCATIONS.map((loc) => (
                <option key={loc.id} value={loc.id} className="bg-surface-container-lowest text-white">
                  {loc.icon} {loc.label}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-on-surface-variant font-mono text-xs">
              ▼
            </div>
          </div>

          <button
            type="submit"
            disabled={isCreating || !className.trim()}
            className="px-7 py-3.5 bg-primary text-black hover:bg-primary/90 hover:scale-[1.02] shadow-[0_0_25px_rgba(195,244,0,0.45)] hover:shadow-[0_0_35px_rgba(195,244,0,0.7)] disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-mono text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 whitespace-nowrap"
          >
            {isCreating ? (
              <>
                <svg className="animate-spin h-4 w-4 text-black" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>INITIALIZING...</span>
              </>
            ) : (
              <>
                <span>LAUNCH LIVE ATTENDANCE</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Existing Sessions List with Subtle Cyan Gradient */}
      <div className="card-interactive bg-surface-container-lowest bg-[radial-gradient(ellipse_at_bottom_left,rgba(0,238,252,0.08),transparent_70%)] border border-outline-variant/40 rounded-2xl p-7 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-outline-variant/30 pb-4">
          <div>
            <h2 className="font-display text-base font-bold text-white tracking-tight uppercase flex items-center gap-2">
              <span>Recent Sessions Ledger</span>
              <span className="font-mono text-[10px] font-black px-2.5 py-0.5 rounded-full bg-surface-container-high text-primary-fixed border border-primary/30 text-glow-lime">
                {sessions.length} RECORDED
              </span>
            </h2>
            <p className="font-mono text-xs text-on-surface-variant mt-0.5">
              Archived biometric attendance sessions with immutable cryptographic chain hashes.
            </p>
          </div>
          <button
            onClick={fetchSessions}
            className="p-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-primary-fixed text-xs transition border border-outline-variant/40 hover:border-primary/40"
            title="Refresh sessions list"
          >
            🔄
          </button>
        </div>

        {loadingSessions ? (
          <div className="py-12 text-center text-xs font-mono text-on-surface-variant space-y-2">
            <div className="animate-spin text-xl inline-block text-primary">⏳</div>
            <p>Loading session logs from database...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="py-12 text-center text-xs font-mono text-on-surface-variant">
            No sessions recorded yet. Enter a class name above to initiate your first capture session.
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/20">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="py-4 px-3 rounded-xl flex items-center justify-between gap-4 hover:bg-surface-container-high/50 border border-transparent hover:border-primary/40 hover:scale-[1.01] hover:shadow-[0_0_18px_rgba(195,244,0,0.15)] transition-all duration-200 group"
              >
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_#c3f400]" />
                    <h3 className="font-mono text-sm font-bold text-white group-hover:text-primary-fixed transition">
                      {session.class_name}
                    </h3>
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-surface-container-high text-secondary border border-secondary/30 uppercase tracking-wider flex items-center gap-1">
                      <span>{session.location === 'canteen' ? '☕' : session.location === 'library' ? '📚' : session.location === 'auditorium' ? '🎭' : '🏫'}</span>
                      <span>{session.location || 'classroom'}</span>
                    </span>
                  </div>
                  <p className="font-mono text-[11px] text-on-surface-variant mt-1.5 pl-4 flex items-center gap-2">
                    <span>SESSION_ID: {session.id.slice(0, 8)}...</span>
                    <span>·</span>
                    <span>
                      CREATED: {new Date(session.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </p>
                </div>

                <Link
                  href={`/dashboard/session/${session.id}`}
                  className="px-4 py-2 rounded-lg bg-surface-container-high hover:bg-primary hover:text-black text-white font-mono text-xs font-black uppercase border border-outline-variant/40 hover:border-primary transition-all duration-200 hover:shadow-[0_0_18px_rgba(195,244,0,0.5)] flex items-center gap-2"
                >
                  <span>OPEN SESSION</span>
                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
