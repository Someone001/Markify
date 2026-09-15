'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Session } from '@/types/database'

export default function SessionIndexPage() {
  const router = useRouter()
  const [className, setClassName] = useState('')
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

      const { data, error: insertErr } = await supabase
        .from('sessions')
        .insert({
          class_name: className.trim(),
          created_by: user?.id || null,
        })
        .select('id')
        .single()

      if (insertErr) throw insertErr

      router.push(`/dashboard/session/${data.id}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create session.'
      setError(msg)
      setIsCreating(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Attendance Sessions</h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Create a new real-time attendance session or resume an existing one.
        </p>
      </div>

      {/* New Session Card */}
      <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-500" />
          <span>Start New Attendance Session</span>
        </h2>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleCreateSession} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            required
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            placeholder="e.g. CS101 - Lecture 4 (Computer Vision)"
            className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
          <button
            type="submit"
            disabled={isCreating || !className.trim()}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold text-white shadow-lg shadow-indigo-600/30 transition text-sm flex items-center justify-center gap-2 whitespace-nowrap"
          >
            {isCreating ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Creating...</span>
              </>
            ) : (
              <span>Launch Live Attendance →</span>
            )}
          </button>
        </form>
      </div>

      {/* Existing Sessions List */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-base font-semibold text-white">Recent Sessions</h2>
          <span className="text-xs text-slate-400">{sessions.length} recorded</span>
        </div>

        {loadingSessions ? (
          <div className="py-8 text-center text-xs text-slate-400 space-y-2">
            <div className="animate-spin text-xl inline-block">⏳</div>
            <p>Loading sessions...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            No sessions created yet. Enter a class name above to start your first session.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="py-3.5 flex items-center justify-between gap-4 hover:bg-slate-800/20 px-2 rounded-lg transition"
              >
                <div>
                  <h3 className="text-sm font-semibold text-white">{session.class_name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Created {new Date(session.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>

                <Link
                  href={`/dashboard/session/${session.id}`}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 hover:text-white text-slate-300 text-xs font-medium border border-slate-700/80 transition flex items-center gap-1.5"
                >
                  <span>Open Session</span>
                  <span>→</span>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
