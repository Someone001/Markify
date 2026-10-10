import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = createClient()

  // 1. Total enrolled students
  const { count: studentCount } = await supabase
    .from('students')
    .select('id', { count: 'exact', head: true })
  const enrolledTotal = studentCount || 0

  // 2. All sessions
  const { data: allSessions } = await supabase
    .from('sessions')
    .select('*')
    .order('created_at', { ascending: false })
  const sessionsList = allSessions || []
  const totalSessions = sessionsList.length

  // Sessions this week (past 7 days)
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const sessionsThisWeek = sessionsList.filter(
    (s) => new Date(s.created_at) >= oneWeekAgo
  ).length

  // 3. Today's attendance % if a session ran today
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const todaySessions = sessionsList.filter(
    (s) => new Date(s.created_at) >= startOfToday
  )

  let todayAttendancePct: number | null = null
  let todayPresentCount = 0

  if (todaySessions.length > 0) {
    const todaySessionIds = todaySessions.map((s) => s.id)
    const { data: todayAttendance } = await supabase
      .from('attendance')
      .select('student_id, status')
      .in('session_id', todaySessionIds)

    if (todayAttendance && todayAttendance.length > 0) {
      const distinctPresentStudents = new Set(
        todayAttendance
          .filter(
            (a) =>
              a.status === 'present' ||
              a.status === 'manual_override' ||
              a.status === 'manual_fallback'
          )
          .map((a) => a.student_id)
      )
      todayPresentCount = distinctPresentStudents.size
      todayAttendancePct =
        enrolledTotal > 0 ? Math.round((todayPresentCount / enrolledTotal) * 100) : 0
    } else {
      todayAttendancePct = 0
    }
  }

  // Recent 5 sessions for the table
  const recentSessions = sessionsList.slice(0, 5)

  return (
    <div className="space-y-gutter-lg max-w-[1720px] mx-auto w-full">
      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-surface-container-high/60 pb-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-black text-white tracking-tight uppercase">
            Attendance Dashboard
          </h1>
          <p className="font-sans text-xs text-on-surface-variant mt-1">
            Real-time biometric attendance monitoring and session ledger.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/session"
            className="px-4 py-2 rounded-xl bg-primary text-black font-mono text-xs font-black uppercase tracking-wider hover:bg-primary/90 shadow-[0_0_20px_rgba(195,244,0,0.35)] transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px]">videocam</span>
            <span>Start Session</span>
          </Link>
          <Link
            href="/dashboard/enroll"
            className="px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/40 text-on-surface hover:text-white font-mono text-xs font-semibold uppercase transition"
          >
            Enroll Student
          </Link>
        </div>
      </div>

      {/* REAL FUNCTIONAL STAT CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter-lg">
        {/* Stat 1: Total Enrolled Students */}
        <div className="bg-surface-container-high/80 rounded-2xl p-6 border border-outline-variant/40 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase text-on-surface-variant font-bold tracking-wider">
              Enrolled Students
            </span>
            <span className="material-symbols-outlined text-primary text-[20px]">group</span>
          </div>

          <div className="my-4">
            <div className="font-display text-4xl sm:text-5xl font-black text-white tracking-tight">
              {enrolledTotal}
            </div>
            <p className="font-sans text-xs text-on-surface-variant mt-1.5">
              Registered facial profiles in database.
            </p>
          </div>

          <div className="pt-3 border-t border-outline-variant/30 flex items-center justify-between text-[11px] font-mono">
            <Link
              href="/dashboard/enroll"
              className="text-primary-fixed hover:underline flex items-center gap-1 font-semibold"
            >
              <span>Manage Enrollment</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </Link>
          </div>
        </div>

        {/* Stat 2: Sessions This Week / Total */}
        <div className="bg-surface-container-high/80 rounded-2xl p-6 border border-outline-variant/40 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase text-on-surface-variant font-bold tracking-wider">
              Sessions (Week / Total)
            </span>
            <span className="material-symbols-outlined text-secondary text-[20px]">calendar_month</span>
          </div>

          <div className="my-4">
            <div className="font-display text-4xl sm:text-5xl font-black text-white tracking-tight">
              {sessionsThisWeek}{' '}
              <span className="text-on-surface-variant font-normal text-2xl">
                / {totalSessions}
              </span>
            </div>
            <p className="font-sans text-xs text-on-surface-variant mt-1.5">
              {sessionsThisWeek} {sessionsThisWeek === 1 ? 'session' : 'sessions'} conducted in past 7 days.
            </p>
          </div>

          <div className="pt-3 border-t border-outline-variant/30 flex items-center justify-between text-[11px] font-mono">
            <Link
              href="/dashboard/session"
              className="text-primary-fixed hover:underline flex items-center gap-1 font-semibold"
            >
              <span>View All Sessions</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </Link>
          </div>
        </div>

        {/* Stat 3: Today's Attendance % */}
        <div className="bg-surface-container-high/80 rounded-2xl p-6 border border-outline-variant/40 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase text-on-surface-variant font-bold tracking-wider">
              Today&apos;s Attendance
            </span>
            <span className="material-symbols-outlined text-primary text-[20px]">pie_chart</span>
          </div>

          <div className="my-4">
            <div className="font-display text-4xl sm:text-5xl font-black text-white tracking-tight">
              {todayAttendancePct !== null ? `${todayAttendancePct}%` : '—'}
            </div>
            <p className="font-sans text-xs text-on-surface-variant mt-1.5">
              {todaySessions.length > 0
                ? `${todayPresentCount} of ${enrolledTotal} enrolled students verified today.`
                : 'No attendance sessions have run today.'}
            </p>
          </div>

          <div className="pt-3 border-t border-outline-variant/30 flex items-center justify-between text-[11px] font-mono">
            <Link
              href="/dashboard/analytics"
              className="text-primary-fixed hover:underline flex items-center gap-1 font-semibold"
            >
              <span>Full Analytics</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </Link>
          </div>
        </div>
      </div>

      {/* RECENT SESSIONS TABLE */}
      <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-outline-variant/30 pb-4">
          <div>
            <h2 className="font-display text-base font-bold text-white tracking-tight uppercase flex items-center gap-2">
              <span>Recent Sessions</span>
              <span className="font-mono text-[10px] px-2.5 py-0.5 rounded-full bg-surface-container-high text-primary-fixed border border-primary/30 font-bold">
                {recentSessions.length} RECENT
              </span>
            </h2>
            <p className="font-sans text-xs text-on-surface-variant mt-0.5">
              Attendance records recorded with cryptographic SHA-256 verification.
            </p>
          </div>

          <Link
            href="/dashboard/session"
            className="font-mono text-xs text-primary-fixed hover:underline flex items-center gap-1 font-semibold"
          >
            <span>Create Session</span>
            <span className="material-symbols-outlined text-[14px]">add</span>
          </Link>
        </div>

        {recentSessions.length === 0 ? (
          <div className="py-12 text-center text-xs font-mono text-on-surface-variant space-y-2 border border-dashed border-outline-variant/30 rounded-xl">
            <span className="material-symbols-outlined text-2xl text-on-surface-variant opacity-40">event_busy</span>
            <p>No attendance sessions created yet.</p>
            <Link
              href="/dashboard/session"
              className="inline-block mt-2 px-3 py-1.5 rounded-lg bg-primary text-black font-mono text-xs font-bold"
            >
              Create First Session
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans text-on-surface">
              <thead className="bg-surface-container-low font-mono text-[10px] uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/30">
                <tr>
                  <th className="py-3 px-4">Session Name</th>
                  <th className="py-3 px-4">Session ID</th>
                  <th className="py-3 px-4">Date &amp; Time</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20 font-mono text-xs">
                {recentSessions.map((sess) => (
                  <tr
                    key={sess.id}
                    className="hover:bg-surface-container-high/40 transition-colors group"
                  >
                    <td className="py-3 px-4 font-sans font-semibold text-white group-hover:text-primary-fixed transition-colors">
                      {sess.class_name}
                    </td>
                    <td className="py-3 px-4 text-secondary text-[11px] font-mono">
                      {sess.id.slice(0, 8)}...
                    </td>
                    <td className="py-3 px-4 text-on-surface-variant text-[11px] font-mono">
                      {new Date(sess.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/dashboard/session/${sess.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-primary hover:text-black text-white font-mono text-xs font-bold uppercase transition"
                      >
                        <span>Open Session</span>
                        <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                      </Link>
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
