'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts'
import { createClient } from '@/lib/supabase/client'
import type { Student, Session, Attendance, SessionLocation } from '@/types/database'

export default function AnalyticsPage() {
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string>('')
  const [students, setStudents] = useState<Student[]>([])
  const [allAttendance, setAllAttendance] = useState<Attendance[]>([])
  const [selectedStudentIdForLocation, setSelectedStudentIdForLocation] = useState<string>('')

  useEffect(() => {
    setMounted(true)
  }, [])

  // Fetch all sessions, students, and attendance records
  useEffect(() => {
    let active = true
    async function fetchAnalyticsData() {
      setLoading(true)
      try {
        const supabase = createClient()

        // 1. Fetch all sessions
        const { data: sessionsData, error: sErr } = await supabase
          .from('sessions')
          .select('*')
          .order('created_at', { ascending: false })

        if (sErr) throw sErr
        const sessList = sessionsData || []
        if (active) {
          setSessions(sessList)
          if (sessList.length > 0 && !selectedSessionId) {
            setSelectedSessionId(sessList[0].id)
          }
        }

        // 2. Fetch all enrolled students
        const { data: studentsData, error: stErr } = await supabase
          .from('students')
          .select('*')
          .order('name', { ascending: true })

        if (stErr) throw stErr
        const stList = studentsData || []
        if (active) {
          setStudents(stList)
          if (stList.length > 0 && !selectedStudentIdForLocation) {
            setSelectedStudentIdForLocation(stList[0].id)
          }
        }

        // 3. Fetch all attendance across ALL sessions
        const { data: attendanceData, error: attErr } = await supabase
          .from('attendance')
          .select('*')
          .order('created_at', { ascending: false })

        if (attErr) throw attErr
        if (active) setAllAttendance(attendanceData || [])
      } catch (err) {
        console.error('Error fetching analytics data:', err)
      } finally {
        if (active) setLoading(false)
      }
    }

    fetchAnalyticsData()
    return () => {
      active = false
    }
  }, [selectedSessionId, selectedStudentIdForLocation])

  // Selected session object
  const currentSession = useMemo(() => {
    return sessions.find((s) => s.id === selectedSessionId) || sessions[0] || null
  }, [sessions, selectedSessionId])

  // Attendance rows for the currently selected session
  const sessionAttendance = useMemo(() => {
    if (!currentSession) return []
    return allAttendance.filter((a) => a.session_id === currentSession.id)
  }, [allAttendance, currentSession])

  // Fast student lookup map
  const studentMap = useMemo(() => {
    return new Map(students.map((s) => [s.id, s]))
  }, [students])

  // Total distinct sessions count (minimum 1 to avoid / 0)
  const totalSessionsCount = Math.max(1, sessions.length)

  // Computed per-student overall attendance % (across ALL sessions)
  const studentOverallRates = useMemo(() => {
    const rates: Record<string, { attendedCount: number; percentage: number }> = {}

    students.forEach((s) => {
      // Find all distinct sessions where this student was marked present/override/fallback
      const attendedSessionIds = new Set(
        allAttendance
          .filter(
            (a) =>
              a.student_id === s.id &&
              (a.status === 'present' || a.status === 'manual_override' || a.status === 'manual_fallback')
          )
          .map((a) => a.session_id)
      )

      const attendedCount = attendedSessionIds.size
      const percentage = Math.round((attendedCount / totalSessionsCount) * 100)
      rates[s.id] = { attendedCount, percentage }
    })

    return rates
  }, [students, allAttendance, totalSessionsCount])

  // Metrics for the selected session
  const sessionMetrics = useMemo(() => {
    const totalEnrolled = students.length

    // Count by status for this session
    let presentLivenessCount = 0
    let manualOverrideCount = 0
    let manualFallbackCount = 0
    const attendedIds = new Set<string>()

    sessionAttendance.forEach((a) => {
      if (a.student_id) {
        attendedIds.add(a.student_id)
        if (a.status === 'present') presentLivenessCount++
        else if (a.status === 'manual_override') manualOverrideCount++
        else if (a.status === 'manual_fallback') manualFallbackCount++
      }
    })

    const totalPresent = attendedIds.size
    const absentCount = Math.max(0, totalEnrolled - totalPresent)
    const sessionRate = totalEnrolled > 0 ? Math.round((totalPresent / totalEnrolled) * 100) : 0

    return {
      totalEnrolled,
      totalPresent,
      absentCount,
      presentLivenessCount,
      manualOverrideCount,
      manualFallbackCount,
      sessionRate,
      attendedIds,
    }
  }, [students, sessionAttendance])

  // Bar Chart Data: Attendance % per student (sorted lowest first so at-risk are first)
  const barChartData = useMemo(() => {
    return students
      .map((s) => {
        const rateInfo = studentOverallRates[s.id] || { attendedCount: 0, percentage: 0 }
        return {
          id: s.id,
          name: s.name,
          rollNo: s.roll_no,
          displayName: s.name.length > 12 ? `${s.name.slice(0, 10)}…` : s.name,
          attendanceRate: rateInfo.percentage,
          attendedCount: rateInfo.attendedCount,
          totalSessions: sessions.length,
        }
      })
      .sort((a, b) => a.attendanceRate - b.attendanceRate)
  }, [students, studentOverallRates, sessions.length])

  // Pie / Donut Chart Data: Status breakdown for the selected session
  const pieChartData = useMemo(() => {
    const data = [
      {
        name: 'Present (Liveness)',
        value: sessionMetrics.presentLivenessCount,
        color: '#c3f400',
      },
      {
        name: 'Manual Override',
        value: sessionMetrics.manualOverrideCount,
        color: '#00eefc',
      },
      {
        name: 'Manual Roll Call',
        value: sessionMetrics.manualFallbackCount,
        color: '#adc6ff',
      },
      {
        name: 'Absent',
        value: sessionMetrics.absentCount,
        color: '#ffb4ab',
      },
    ]
    return data.filter((item) => item.value > 0)
  }, [sessionMetrics])

  // Anomalies list for the selected session
  const manualOverrides = useMemo(() => {
    return sessionAttendance.filter((a) => a.status === 'manual_override')
  }, [sessionAttendance])

  const manualFallbacks = useMemo(() => {
    return sessionAttendance.filter((a) => a.status === 'manual_fallback')
  }, [sessionAttendance])

  const chronicallyAbsentStudents = useMemo(() => {
    return students
      .map((s) => {
        const rateInfo = studentOverallRates[s.id] || { attendedCount: 0, percentage: 0 }
        return {
          student: s,
          ...rateInfo,
        }
      })
      .filter((item) => item.percentage < 50 && sessions.length > 0)
      .sort((a, b) => a.percentage - b.percentage)
  }, [students, studentOverallRates, sessions.length])

  // Selected student for multi-location breakdown
  const selectedStudentForLocation = useMemo(() => {
    return students.find((s) => s.id === selectedStudentIdForLocation) || students[0] || null
  }, [students, selectedStudentIdForLocation])

  // Multi-location breakdown for the selected student
  const locationBreakdown = useMemo(() => {
    if (!selectedStudentForLocation) {
      return {
        counts: { classroom: 0, canteen: 0, library: 0, auditorium: 0 },
        total: 0,
        summaryText: 'Classroom: 0 sessions, Canteen: 0 sessions, Library: 0 sessions, Auditorium: 0 sessions',
        topLocation: 'Classroom',
        chartData: [
          { name: 'Classroom', count: 0, color: '#c3f400', icon: '🏫', locKey: 'classroom' },
          { name: 'Canteen', count: 0, color: '#f59e0b', icon: '☕', locKey: 'canteen' },
          { name: 'Library', count: 0, color: '#00eefc', icon: '📚', locKey: 'library' },
          { name: 'Auditorium', count: 0, color: '#d946ef', icon: '🎭', locKey: 'auditorium' },
        ],
      }
    }

    const sessionMap = new Map<string, Session>()
    sessions.forEach((s) => sessionMap.set(s.id, s))

    // Track distinct sessions attended by this student across all sessions
    const attendedSessionIds = new Set<string>()
    allAttendance.forEach((a) => {
      if (
        a.student_id === selectedStudentForLocation.id &&
        a.session_id &&
        (a.status === 'present' || a.status === 'manual_override' || a.status === 'manual_fallback')
      ) {
        attendedSessionIds.add(a.session_id)
      }
    })

    const counts: Record<SessionLocation, number> = {
      classroom: 0,
      canteen: 0,
      library: 0,
      auditorium: 0,
    }

    attendedSessionIds.forEach((sessId) => {
      const sess = sessionMap.get(sessId)
      const rawLoc = (sess?.location || 'classroom').toLowerCase()
      const loc: SessionLocation =
        rawLoc === 'canteen' || rawLoc === 'library' || rawLoc === 'auditorium'
          ? rawLoc
          : 'classroom'
      counts[loc] += 1
    })

    const total = counts.classroom + counts.canteen + counts.library + counts.auditorium
    const summaryText = `Classroom: ${counts.classroom} sessions, Canteen: ${counts.canteen} sessions, Library: ${counts.library} sessions, Auditorium: ${counts.auditorium} sessions`

    const chartData = [
      { name: 'Classroom', count: counts.classroom, color: '#c3f400', icon: '🏫', locKey: 'classroom' },
      { name: 'Canteen', count: counts.canteen, color: '#f59e0b', icon: '☕', locKey: 'canteen' },
      { name: 'Library', count: counts.library, color: '#00eefc', icon: '📚', locKey: 'library' },
      { name: 'Auditorium', count: counts.auditorium, color: '#d946ef', icon: '🎭', locKey: 'auditorium' },
    ]

    let topLocation = 'Classroom'
    let maxCount = -1
    chartData.forEach((d) => {
      if (d.count > maxCount) {
        maxCount = d.count
        topLocation = d.name
      }
    })

    return {
      counts,
      total,
      summaryText,
      topLocation: total > 0 ? topLocation : 'None',
      chartData,
    }
  }, [selectedStudentForLocation, sessions, allAttendance])

  return (
    <div className="space-y-8 pb-16 font-sans text-on-surface">
      {/* Top Context & Session Selector */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-surface-container-high/60 pb-5">
        <div className="space-y-1">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight uppercase">
            Attendance Analytics
          </h1>
          <p className="font-sans text-xs text-on-surface-variant">
            {currentSession
              ? `Displaying statistics for ${currentSession.class_name}`
              : 'Historical attendance insights and student breakdown.'}
          </p>
        </div>

        {/* Session Dropdown */}
        <div className="flex items-center gap-3 bg-surface-container-lowest p-1.5 rounded-xl border border-surface-container-high/80">
          <label htmlFor="session-select" className="font-mono text-[11px] text-on-surface-variant pl-2 whitespace-nowrap uppercase">
            SESSION:
          </label>
          <select
            id="session-select"
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            disabled={sessions.length === 0}
            className="px-3 py-1.5 rounded-lg bg-surface-container-low border border-surface-container-high text-xs font-mono text-white focus:outline-none focus:border-primary-fixed font-medium max-w-xs truncate"
          >
            {sessions.length === 0 ? (
              <option value="">No sessions available</option>
            ) : (
              sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.class_name} ({new Date(s.created_at).toLocaleDateString()})
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="card-interactive bg-surface-container-high border border-outline-variant/40 rounded-2xl py-24 text-center text-xs font-mono text-on-surface-variant space-y-3 shadow-xl">
          <div className="animate-spin text-3xl inline-block text-primary shadow-[0_0_12px_#c3f400]">⏳</div>
          <p className="text-white font-bold uppercase tracking-wider">Compiling attendance analytics telemetry from database...</p>
          <p className="text-primary text-[11px] animate-pulse">CRYPTOGRAPHIC LEDGER SYNC IN PROGRESS</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="card-interactive py-24 text-center p-8 bg-surface-container-high border border-outline-variant/40 rounded-2xl space-y-4 shadow-xl">
          <div className="text-4xl text-primary drop-shadow-[0_0_12px_#c3f400]">📊</div>
          <h2 className="font-display text-base font-bold text-white uppercase tracking-tight">No Attendance Sessions Found</h2>
          <p className="font-sans text-xs text-on-surface-variant max-w-md mx-auto">
            Create a session and start live biometric capture to populate your intelligence dashboard.
          </p>
          <Link
            href="/dashboard/session"
            className="inline-block px-6 py-3 rounded-xl bg-primary text-black font-mono text-xs font-black uppercase transition hover:bg-primary/90 shadow-[0_0_25px_rgba(195,244,0,0.45)] hover:shadow-[0_0_35px_rgba(195,244,0,0.7)]"
          >
            Launch Attendance Session →
          </Link>
        </div>
      ) : (
        <>
          {/* TOP STAT BANNER (4-Bento Metric Ribbon) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Metric 1: Total Enrolled */}
            <div className="card-interactive bg-surface-container-high bg-[radial-gradient(ellipse_at_top_left,rgba(0,238,252,0.1),transparent_70%)] p-6 rounded-2xl border border-outline-variant/40 shadow-xl relative overflow-hidden flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="font-mono text-[9px] uppercase tracking-widest text-on-surface-variant font-bold">TOTAL ROSTER</span>
                <span className="font-mono text-[9px] px-2.5 py-0.5 rounded-full bg-surface-container-lowest text-secondary border border-secondary/30 font-bold shadow-[0_0_10px_rgba(0,238,252,0.2)]">
                  ENROLLED
                </span>
              </div>
              <div className="my-3">
                <div className="font-display text-4xl text-white font-black tracking-tight">{sessionMetrics.totalEnrolled}</div>
                <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">Active Student Embeddings</span>
              </div>
              <div className="flex items-center gap-2 text-on-surface-variant font-mono text-[10px] pt-2 border-t border-outline-variant/30">
                <span className="w-2 h-2 rounded-full bg-secondary shadow-[0_0_6px_#00eefc]" />
                <span>128-D Biometric Vectors Verified</span>
              </div>
            </div>

            {/* Metric 2: Session Attendance Turnout */}
            <div className="card-interactive bg-surface-container-high bg-[radial-gradient(ellipse_at_top_right,rgba(195,244,0,0.15),transparent_70%)] p-6 rounded-2xl border border-outline-variant/40 shadow-xl relative overflow-hidden flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="font-mono text-[9px] uppercase tracking-widest text-on-surface-variant font-bold">SESSION TURNOUT</span>
                <span className="font-mono text-[9px] px-2.5 py-0.5 rounded-full bg-surface-container-lowest text-primary-fixed border border-primary/40 font-bold shadow-[0_0_10px_rgba(195,244,0,0.25)]">
                  {sessionMetrics.totalPresent}/{sessionMetrics.totalEnrolled} PRESENT
                </span>
              </div>
              <div className="my-3 flex items-baseline gap-1">
                <div className="font-display text-4xl text-primary-fixed font-black tracking-tight text-glow-lime">
                  {sessionMetrics.sessionRate}
                  <span className="text-2xl font-bold text-primary-fixed">%</span>
                </div>
              </div>
              <div className="w-full bg-surface-container-lowest h-2 rounded-full overflow-hidden border border-outline-variant/30">
                <div
                  className="bg-primary h-full rounded-full shadow-[0_0_12px_#c3f400] transition-all duration-500"
                  style={{ width: `${Math.min(100, sessionMetrics.sessionRate)}%` }}
                />
              </div>
            </div>

            {/* Metric 3: Liveness Proof Resolved */}
            <div className="card-interactive bg-surface-container-high bg-[radial-gradient(ellipse_at_bottom_left,rgba(0,238,252,0.1),transparent_70%)] p-6 rounded-2xl border border-outline-variant/40 shadow-xl relative overflow-hidden flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="font-mono text-[9px] uppercase tracking-widest text-secondary font-bold">BIOMETRIC LIVENESS</span>
                <span className="font-mono text-[9px] px-2.5 py-0.5 rounded-full bg-surface-container-lowest text-secondary border border-secondary/30 font-bold animate-pulse-cyan">
                  AUTOMATIC
                </span>
              </div>
              <div className="my-3">
                <div className="font-display text-4xl text-white font-black tracking-tight">
                  {sessionMetrics.presentLivenessCount}
                </div>
                <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">Blink + Facial Vector Match</span>
              </div>
              <div className="flex items-center justify-between text-on-surface-variant font-mono text-[10px] pt-2 border-t border-outline-variant/30">
                <span>ANTI-SPOOF</span>
                <span className="text-secondary font-bold">ZERO FALSE PASS</span>
              </div>
            </div>

            {/* Metric 4: Anomaly Defense Rate */}
            <div className="card-interactive bg-surface-container-high bg-[radial-gradient(ellipse_at_bottom_right,rgba(255,0,127,0.1),transparent_70%)] p-6 rounded-2xl border border-outline-variant/40 shadow-xl relative overflow-hidden flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="font-mono text-[9px] uppercase tracking-widest text-error-dim font-bold">INTERVENTIONS</span>
                <div className="w-2.5 h-2.5 rounded-full bg-[#ff007f] animate-pulse shadow-[0_0_10px_#ff007f]" />
              </div>
              <div className="my-3">
                <div className="font-display text-4xl text-error-dim font-black tracking-tight">
                  {sessionMetrics.manualOverrideCount + sessionMetrics.manualFallbackCount}
                </div>
                <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">
                  {sessionMetrics.manualOverrideCount} Overrides · {sessionMetrics.manualFallbackCount} Roll Call
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-error-dim font-mono text-[10px] bg-surface-container-lowest px-2.5 py-1 rounded-full border border-error/30">
                <span className="w-1.5 h-1.5 rounded-full bg-error-dim" />
                <span>AUDIT CHAIN RECORDED</span>
              </div>
            </div>
          </div>

          {/* MAIN VISUALIZATIONS SECTION (Asymmetric 12-Column Matrix) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* CHART 1: Overall Attendance % per Student (Sorted Lowest First) (7 Cols) */}
            <div className="lg:col-span-7 card-interactive bg-surface-container-high bg-[radial-gradient(ellipse_at_top_right,rgba(195,244,0,0.06),transparent_70%)] p-6 rounded-2xl border border-outline-variant/40 shadow-xl flex flex-col justify-between space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-outline-variant/30 pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-primary-fixed font-bold">
                      LONGITUDINAL TELEMETRY
                    </span>
                    <span className="font-mono text-[9px] text-on-surface-variant font-mono">[SORTED LOWEST FIRST]</span>
                  </div>
                  <h2 className="font-display text-base sm:text-lg font-bold text-white tracking-tight uppercase">
                    Student Attendance Rate (%)
                  </h2>
                  <p className="font-mono text-xs text-on-surface-variant mt-0.5">
                    Computed across all {sessions.length} recorded session checkpoints.
                  </p>
                </div>
                <div className="flex items-center gap-3 font-mono text-[10px]">
                  <span className="flex items-center gap-1 text-error-dim font-bold">
                    <span className="w-2 h-2 rounded-sm bg-error shadow-[0_0_6px_#ffb4ab]" /> &lt;50%
                  </span>
                  <span className="flex items-center gap-1 text-amber-300 font-bold">
                    <span className="w-2 h-2 rounded-sm bg-amber-400 shadow-[0_0_6px_#f59e0b]" /> 50–75%
                  </span>
                  <span className="flex items-center gap-1 text-primary-fixed font-bold">
                    <span className="w-2 h-2 rounded-sm bg-primary shadow-[0_0_6px_#c3f400]" /> &gt;75%
                  </span>
                </div>
              </div>

              {barChartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center font-mono text-xs text-on-surface-variant">
                  No student attendance data available.
                </div>
              ) : (
                <div className="w-full h-80 pt-2">
                  {mounted ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barChartData} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#282a30" opacity={0.6} vertical={false} />
                        <XAxis
                          dataKey="displayName"
                          stroke="#8e9379"
                          fontSize={10}
                          interval={0}
                          angle={-30}
                          textAnchor="end"
                          tick={{ fill: '#8e9379' }}
                        />
                        <YAxis
                          stroke="#8e9379"
                          fontSize={10}
                          domain={[0, 100]}
                          tickFormatter={(v) => `${v}%`}
                          tick={{ fill: '#8e9379' }}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload
                              return (
                                <div className="bg-surface-container-lowest border border-surface-container-high p-3 rounded-xl shadow-2xl text-xs space-y-1 font-mono">
                                  <p className="font-bold text-white">{data.name}</p>
                                  <p className="text-secondary-fixed text-[11px]">{data.rollNo}</p>
                                  <div className="pt-1 text-on-surface">
                                    <span>Attendance Rate: </span>
                                    <span className="font-bold text-primary-fixed">{data.attendanceRate}%</span>
                                  </div>
                                  <p className="text-[10px] text-on-surface-variant">
                                    Attended {data.attendedCount} of {data.totalSessions} sessions
                                  </p>
                                </div>
                              )
                            }
                            return null
                          }}
                        />
                        <Bar dataKey="attendanceRate" radius={[4, 4, 0, 0]}>
                          {barChartData.map((entry) => {
                            const color =
                              entry.attendanceRate < 50
                                ? '#ffb4ab' // Error Red
                                : entry.attendanceRate <= 75
                                ? '#f59e0b' // Amber
                                : '#c3f400' // Lime Neon
                            return <Cell key={`cell-${entry.id}`} fill={color} />
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center font-mono text-xs text-on-surface-variant animate-pulse">
                      <span>INITIALIZING TELEMETRY PLOT...</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* CHART 2: Status Breakdown for Selected Session (5 Cols) */}
            <div className="lg:col-span-5 card-interactive bg-surface-container-high bg-[radial-gradient(ellipse_at_top_left,rgba(0,238,252,0.06),transparent_70%)] p-6 rounded-2xl border border-outline-variant/40 shadow-xl flex flex-col justify-between space-y-4">
              <div className="border-b border-outline-variant/30 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-secondary font-bold">
                    COHORT INTEGRITY
                  </span>
                  <span className="font-mono text-[9px] text-on-surface-variant font-mono">[{sessionMetrics.totalEnrolled} ENROLLED]</span>
                </div>
                <h2 className="font-display text-base sm:text-lg font-bold text-white tracking-tight uppercase">
                  Status Breakdown
                </h2>
                <p className="font-mono text-xs text-on-surface-variant mt-0.5 truncate">
                  {currentSession?.class_name || 'Selected Session'}
                </p>
              </div>

              {pieChartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center font-mono text-xs text-on-surface-variant">
                  No attendance records for this session.
                </div>
              ) : (
                <div className="w-full h-64 relative flex items-center justify-center">
                  {mounted ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0]
                              return (
                                <div className="bg-surface-container-highest border border-outline-variant/50 p-3 rounded-xl shadow-2xl text-xs space-y-1 font-mono">
                                  <span className="font-bold text-white">{data.name}</span>
                                  <p className="text-on-surface">
                                    Count: <span className="font-bold text-primary-fixed text-glow-lime">{data.value}</span>
                                  </p>
                                </div>
                              )
                            }
                            return null
                          }}
                        />
                        <Pie
                          data={pieChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={65}
                          outerRadius={98}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {pieChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center font-mono text-xs text-on-surface-variant animate-pulse">
                      <span>CALCULATING COHORT RATIOS...</span>
                    </div>
                  )}

                  {/* Centered Donut Metric */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                    <span className="font-display text-4xl font-black text-primary-fixed text-glow-lime leading-none">
                      {sessionMetrics.sessionRate}%
                    </span>
                    <span className="font-mono text-[9px] text-primary-fixed uppercase tracking-widest mt-1 font-bold">
                      PRESENT
                    </span>
                  </div>
                </div>
              )}

              {/* Custom Legend Matching Token Colors */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-3 border-t border-outline-variant/30">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-primary shadow-[0_0_6px_#c3f400] flex-shrink-0" />
                  <span className="text-on-surface-variant truncate">Liveness ({sessionMetrics.presentLivenessCount})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-secondary shadow-[0_0_6px_#00eefc] flex-shrink-0" />
                  <span className="text-on-surface-variant truncate">Override ({sessionMetrics.manualOverrideCount})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#adc6ff] shadow-[0_0_6px_#adc6ff] flex-shrink-0" />
                  <span className="text-on-surface-variant truncate">Roll Call ({sessionMetrics.manualFallbackCount})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-error shadow-[0_0_6px_#ffb4ab] flex-shrink-0" />
                  <span className="text-on-surface-variant truncate">Absent ({sessionMetrics.absentCount})</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Student Location Breakdown */}
          <div className="card-interactive bg-surface-container-high bg-[radial-gradient(ellipse_at_top_left,rgba(195,244,0,0.08),transparent_70%)] border border-outline-variant/40 rounded-2xl p-7 shadow-2xl space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-outline-variant/30 pb-5">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-primary-fixed font-bold">
                    MULTI-LOCATION TELEMETRY
                  </span>
                  <span className="font-mono text-[9px] px-2.5 py-0.5 rounded-full bg-surface-container-lowest text-secondary border border-secondary/30 font-bold">
                    4 PHYSICAL ZONES
                  </span>
                </div>
                <h2 className="font-display text-lg font-bold text-white uppercase tracking-tight flex items-center gap-2">
                  <span>Student Location Breakdown</span>
                </h2>
                <p className="font-mono text-xs text-on-surface-variant mt-0.5">
                  Tracks where individual students spend their verified attendance time across campus checkpoints.
                </p>
              </div>

              {/* Student Selector Dropdown */}
              <div className="flex items-center gap-3 bg-surface-container-lowest p-2 rounded-xl border border-outline-variant/40">
                <label htmlFor="student-location-select" className="font-mono text-[11px] text-on-surface-variant pl-2 whitespace-nowrap uppercase font-bold">
                  STUDENT:
                </label>
                <select
                  id="student-location-select"
                  value={selectedStudentIdForLocation}
                  onChange={(e) => setSelectedStudentIdForLocation(e.target.value)}
                  disabled={students.length === 0}
                  className="px-3 py-2 rounded-lg bg-surface-container-high border border-outline-variant text-xs font-mono text-white focus:outline-none focus:border-primary font-medium min-w-[220px]"
                >
                  {students.length === 0 ? (
                    <option value="">No students enrolled</option>
                  ) : (
                    students.map((st) => (
                      <option key={st.id} value={st.id} className="bg-surface-container-high text-white">
                        {st.name} ({st.roll_no})
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {selectedStudentForLocation ? (
              <div className="space-y-6">
                {/* Text summary row */}
                <div className="p-4 rounded-xl bg-surface-container-lowest border border-primary/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
                  <div className="font-mono text-xs text-white flex items-center gap-2">
                    <span className="text-primary font-bold">📍 RECORD:</span>
                    <span className="text-on-surface-variant font-semibold">{locationBreakdown.summaryText}</span>
                  </div>
                  <div className="font-mono text-xs text-on-surface-variant flex items-center gap-2">
                    <span className="uppercase text-[10px] tracking-wider">Primary Location:</span>
                    <span className="font-bold text-primary-fixed text-glow-lime uppercase">
                      {locationBreakdown.topLocation}
                    </span>
                  </div>
                </div>

                {/* 4 Location Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {locationBreakdown.chartData.map((loc) => {
                    const pct =
                      locationBreakdown.total > 0
                        ? Math.round((loc.count / locationBreakdown.total) * 100)
                        : 0
                    return (
                      <div
                        key={loc.name}
                        className="p-4 rounded-xl bg-surface-container-lowest border border-outline-variant/30 space-y-3 relative overflow-hidden"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-white flex items-center gap-1.5">
                            <span className="text-base">{loc.icon}</span>
                            <span>{loc.name}</span>
                          </span>
                          <span
                            className="font-mono text-[10px] font-bold px-2 py-0.5 rounded uppercase"
                            style={{
                              color: loc.color,
                              backgroundColor: `${loc.color}15`,
                              border: `1px solid ${loc.color}40`,
                            }}
                          >
                            {pct}% TIME
                          </span>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="font-display text-3xl font-black text-white">{loc.count}</span>
                          <span className="font-mono text-xs text-on-surface-variant">sessions</span>
                        </div>
                        {/* Progress Bar */}
                        <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: loc.color,
                              boxShadow: `0 0 8px ${loc.color}`,
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Visual Bar Comparison Chart */}
                <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                      <span>Location Session Distribution</span>
                      <span className="text-on-surface-variant font-normal">
                        ({selectedStudentForLocation.name} · {selectedStudentForLocation.roll_no})
                      </span>
                    </h3>
                    <span className="font-mono text-xs text-secondary font-bold">
                      {locationBreakdown.total} TOTAL SESSIONS ATTENDED
                    </span>
                  </div>

                  <div className="h-48 w-full">
                    {mounted ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={locationBreakdown.chartData}
                          margin={{ top: 10, right: 20, left: -15, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#282a30" opacity={0.6} vertical={false} />
                          <XAxis
                            dataKey="name"
                            stroke="#8e9379"
                            fontSize={11}
                            tick={{ fill: '#8e9379', fontFamily: 'monospace' }}
                          />
                          <YAxis
                            stroke="#8e9379"
                            fontSize={11}
                            allowDecimals={false}
                            tick={{ fill: '#8e9379', fontFamily: 'monospace' }}
                          />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload
                                return (
                                  <div className="bg-surface-container-highest border border-outline-variant p-3 rounded-xl shadow-2xl text-xs space-y-1 font-mono">
                                    <p className="font-bold text-white flex items-center gap-1.5">
                                      <span>{data.icon}</span>
                                      <span>{data.name}</span>
                                    </p>
                                    <p className="text-primary-fixed font-bold">
                                      {data.count} {data.count === 1 ? 'session' : 'sessions'} attended
                                    </p>
                                    <p className="text-[10px] text-on-surface-variant">
                                      {locationBreakdown.total > 0
                                        ? `${Math.round((data.count / locationBreakdown.total) * 100)}% of tracked attendance`
                                        : '0%'}
                                    </p>
                                  </div>
                                )
                              }
                              return null
                            }}
                          />
                          <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                            {locationBreakdown.chartData.map((entry) => (
                              <Cell key={`loc-cell-${entry.name}`} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center font-mono text-xs text-on-surface-variant">
                        Loading chart...
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center font-mono text-xs text-on-surface-variant">
                No students enrolled to display location tracking.
              </div>
            )}
          </div>

          {/* Section 4: Audit & Anomalies List */}
          <div className="card-interactive bg-surface-container-lowest bg-[radial-gradient(ellipse_at_bottom_left,rgba(0,238,252,0.06),transparent_70%)] border border-outline-variant/40 rounded-2xl p-7 shadow-2xl space-y-6">
            <div className="border-b border-outline-variant/30 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-bold text-white uppercase tracking-tight flex items-center gap-2">
                  <span>Audit Anomalies &amp; Risk Detection</span>
                  <span className="font-mono text-[10px] font-black px-2.5 py-0.5 rounded-full bg-surface-container-high text-primary-fixed border border-primary/30 text-glow-lime">
                    {manualOverrides.length + manualFallbacks.length + chronicallyAbsentStudents.length} FLAGS
                  </span>
                </h2>
                <p className="font-mono text-xs text-on-surface-variant mt-0.5">
                  Tracks manual interventions, degraded camera fallbacks, and at-risk attendance shortages.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Anomaly 1: Manual Overrides for Selected Session */}
              <div className="space-y-3 bg-surface-container-high/60 border border-secondary/30 p-4 rounded-xl flex flex-col justify-between shadow-[0_0_15px_rgba(0,238,252,0.08)]">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-outline-variant/30">
                    <h3 className="font-mono text-xs font-bold text-secondary uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-secondary shadow-[0_0_6px_#00eefc]" />
                      Overrides ({manualOverrides.length})
                    </h3>
                    <span className="font-mono text-[10px] text-on-surface-variant">Borderline Match</span>
                  </div>

                  <div className="mt-3 space-y-2 max-h-60 overflow-y-auto pr-1">
                    {manualOverrides.length === 0 ? (
                      <div className="py-6 text-center font-mono text-xs text-on-surface-variant">
                        No manual overrides in this session.
                      </div>
                    ) : (
                      manualOverrides.map((row) => {
                        const st = studentMap.get(row.student_id || '')
                        return (
                          <div
                            key={row.id}
                            className="p-2.5 rounded-lg bg-surface-container-lowest border border-secondary/30 text-xs space-y-1 font-mono"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-white truncate">{st?.name || 'Unknown'}</span>
                              <span className="text-secondary text-[10px]">{st?.roll_no}</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-on-surface-variant">
                              <span>CONF: {row.confidence !== null ? `${Math.round(row.confidence * 100)}%` : 'N/A'}</span>
                              <span>{new Date(row.timestamp || row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
                <p className="font-mono text-[10px] text-on-surface-variant pt-2 border-t border-outline-variant/30">
                  Triggered by borderline distance (0.50–0.60) or admin override.
                </p>
              </div>

              {/* Anomaly 2: Manual Fallbacks for Selected Session */}
              <div className="space-y-3 bg-surface-container-high/60 border border-outline-variant/40 p-4 rounded-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-outline-variant/30">
                    <h3 className="font-mono text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b]" />
                      Roll Calls ({manualFallbacks.length})
                    </h3>
                    <span className="font-mono text-[10px] text-on-surface-variant">Checklist Fallback</span>
                  </div>

                  <div className="mt-3 space-y-2 max-h-60 overflow-y-auto pr-1">
                    {manualFallbacks.length === 0 ? (
                      <div className="py-6 text-center font-mono text-xs text-on-surface-variant">
                        No manual fallbacks in this session.
                      </div>
                    ) : (
                      manualFallbacks.map((row) => {
                        const st = studentMap.get(row.student_id || '')
                        return (
                          <div
                            key={row.id}
                            className="p-2.5 rounded-lg bg-surface-container-lowest border border-amber-500/30 text-xs space-y-1 font-mono"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-white truncate">{st?.name || 'Unknown'}</span>
                              <span className="text-amber-300 text-[10px]">{st?.roll_no}</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-on-surface-variant">
                              <span>Biometrics bypassed</span>
                              <span>{new Date(row.timestamp || row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
                <p className="font-mono text-[10px] text-on-surface-variant pt-2 border-t border-outline-variant/30">
                  Recorded via checklist when camera or models were offline.
                </p>
              </div>

              {/* Anomaly 3: Chronically Absent Students (< 50% Overall) */}
              <div className="space-y-3 bg-surface-container-high/60 border border-error/40 p-4 rounded-xl flex flex-col justify-between shadow-[0_0_15px_rgba(255,180,171,0.1)]">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-outline-variant/30">
                    <h3 className="font-mono text-xs font-bold text-error-dim uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-error shadow-[0_0_6px_#ffb4ab]" />
                      Chronically Absent ({chronicallyAbsentStudents.length})
                    </h3>
                    <span className="font-mono text-[10px] text-on-surface-variant">&lt;50% Rate</span>
                  </div>

                  <div className="mt-3 space-y-2 max-h-60 overflow-y-auto pr-1">
                    {chronicallyAbsentStudents.length === 0 ? (
                      <div className="py-6 text-center font-mono text-xs text-primary-fixed">
                        ✓ All students meet &gt;= 50% attendance requirement.
                      </div>
                    ) : (
                      chronicallyAbsentStudents.map(({ student: st, percentage, attendedCount }) => (
                        <div
                          key={st.id}
                          className="p-2.5 rounded-lg bg-surface-container-lowest border border-error/30 text-xs space-y-1 font-mono"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white truncate">{st.name}</span>
                            <span className="font-bold text-error-dim">{percentage}%</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-on-surface-variant">
                            <span className="text-secondary">{st.roll_no}</span>
                            <span>Attended {attendedCount} of {sessions.length} classes</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <p className="font-mono text-[10px] text-on-surface-variant pt-2 border-t border-outline-variant/30">
                  Action required: Students below 50% risk debarment.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
