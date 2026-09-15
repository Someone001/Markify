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
import type { Student, Session, Attendance } from '@/types/database'

export default function AnalyticsPage() {
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string>('')
  const [students, setStudents] = useState<Student[]>([])
  const [allAttendance, setAllAttendance] = useState<Attendance[]>([])

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
        if (active) setStudents(studentsData || [])

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
  }, [selectedSessionId])

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
        color: '#10b981',
      },
      {
        name: 'Manual Override',
        value: sessionMetrics.manualOverrideCount,
        color: '#3b82f6',
      },
      {
        name: 'Manual Roll Call',
        value: sessionMetrics.manualFallbackCount,
        color: '#a855f7',
      },
      {
        name: 'Absent',
        value: sessionMetrics.absentCount,
        color: '#ef4444',
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

  if (!mounted) {
    return null
  }

  return (
    <div className="space-y-8 pb-16 font-sans text-slate-100">
      {/* Top Controls & Session Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Attendance Analytics</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Real-time biometric attendance metrics, student risk detection, and audit breakdown.
          </p>
        </div>

        {/* Session Dropdown */}
        <div className="flex items-center gap-3">
          <label htmlFor="session-select" className="text-xs text-slate-400 whitespace-nowrap">
            Selected Session:
          </label>
          <select
            id="session-select"
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            disabled={sessions.length === 0}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium max-w-xs truncate"
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
        <div className="py-24 text-center text-xs text-slate-400 space-y-3">
          <div className="animate-spin text-2xl inline-block">⏳</div>
          <p>Compiling attendance analytics from Supabase...</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="py-24 text-center p-8 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-4">
          <div className="text-4xl">📊</div>
          <h2 className="text-base font-semibold text-white">No Attendance Sessions Found</h2>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Create a session and start live attendance capture to populate your analytics dashboard.
          </p>
          <Link
            href="/dashboard/session"
            className="inline-block px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
          >
            Launch Attendance Session →
          </Link>
        </div>
      ) : (
        <>
          {/* Key Summary Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Enrolled */}
            <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-lg flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Enrolled Students</p>
                <h3 className="text-2xl font-bold text-white mt-1">{sessionMetrics.totalEnrolled}</h3>
                <p className="text-[11px] text-slate-500 mt-1">Total active database roster</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-indigo-600/10 text-indigo-400 flex items-center justify-center text-lg font-bold border border-indigo-500/20">
                👥
              </div>
            </div>

            {/* Total Present */}
            <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-lg flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Session Attendance</p>
                <h3 className="text-2xl font-bold text-emerald-400 mt-1">
                  {sessionMetrics.totalPresent} <span className="text-sm font-normal text-slate-400">/ {sessionMetrics.totalEnrolled}</span>
                </h3>
                <p className="text-[11px] text-emerald-400/80 mt-1">{sessionMetrics.sessionRate}% turnout for this class</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-lg font-bold border border-emerald-500/20">
                ✓
              </div>
            </div>

            {/* Facial Liveness Verified */}
            <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-lg flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Biometric Verified</p>
                <h3 className="text-2xl font-bold text-white mt-1">{sessionMetrics.presentLivenessCount}</h3>
                <p className="text-[11px] text-slate-500 mt-1">Automatic face + blink liveness</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center text-lg font-bold border border-cyan-500/20">
                👁️
              </div>
            </div>

            {/* Manual Interventions */}
            <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-lg flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Manual Interventions</p>
                <h3 className="text-2xl font-bold text-blue-400 mt-1">
                  {sessionMetrics.manualOverrideCount + sessionMetrics.manualFallbackCount}
                </h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  {sessionMetrics.manualOverrideCount} overrides • {sessionMetrics.manualFallbackCount} roll call
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center text-lg font-bold border border-blue-500/20">
                🛡️
              </div>
            </div>
          </div>

          {/* Visualization Grid: Bar Chart & Donut Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* 1. Bar Chart: Overall Attendance % per Student (Sorted Lowest First) */}
            <div className="lg:col-span-8 bg-slate-900/80 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4 flex flex-col justify-between">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Overall Student Attendance Rate (%)</span>
                    <span className="text-xs font-normal text-slate-400">(Sorted lowest first)</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Computed across all {sessions.length} recorded sessions. Highlights at-risk students immediately.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> &lt;50%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> 50–75%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> &gt;75%
                  </span>
                </div>
              </div>

              {barChartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-xs text-slate-500">
                  No student attendance data available.
                </div>
              ) : (
                <div className="w-full h-80 pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barChartData} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} vertical={false} />
                      <XAxis
                        dataKey="displayName"
                        stroke="#94a3b8"
                        fontSize={11}
                        interval={0}
                        angle={-30}
                        textAnchor="end"
                        tick={{ fill: '#94a3b8' }}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={11}
                        domain={[0, 100]}
                        tickFormatter={(v) => `${v}%`}
                        tick={{ fill: '#94a3b8' }}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload
                            return (
                              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl shadow-2xl text-xs space-y-1">
                                <p className="font-bold text-white">{data.name}</p>
                                <p className="font-mono text-indigo-400 text-[11px]">{data.rollNo}</p>
                                <div className="pt-1 text-slate-300">
                                  <span>Overall Rate: </span>
                                  <span className="font-bold text-white">{data.attendanceRate}%</span>
                                </div>
                                <p className="text-[10px] text-slate-400">
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
                              ? '#ef4444' // Red
                              : entry.attendanceRate <= 75
                              ? '#f59e0b' // Amber
                              : '#10b981' // Green
                          return <Cell key={`cell-${entry.id}`} fill={color} />
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* 2. Donut Chart: Status Breakdown for Selected Session */}
            <div className="lg:col-span-4 bg-slate-900/80 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4 flex flex-col justify-between">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-base font-bold text-white">Status Breakdown</h2>
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  {currentSession?.class_name || 'Selected Session'}
                </p>
              </div>

              {pieChartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-xs text-slate-500">
                  No attendance records for this session.
                </div>
              ) : (
                <div className="w-full h-64 relative flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0]
                            return (
                              <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl shadow-xl text-xs space-y-1">
                                <span className="font-semibold text-white">{data.name}</span>
                                <p className="text-slate-300">
                                  Count: <span className="font-bold text-white">{data.value}</span>
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
                        innerRadius={62}
                        outerRadius={95}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>

                  {/* Centered Donut Stat */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                    <span className="text-2xl font-extrabold text-white">{sessionMetrics.sessionRate}%</span>
                    <span className="text-[10px] text-slate-400 uppercase font-medium">Turnout</span>
                  </div>
                </div>
              )}

              {/* Custom Legend */}
              <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-800/60">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 flex-shrink-0" />
                  <span className="text-slate-400 truncate">Liveness ({sessionMetrics.presentLivenessCount})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 flex-shrink-0" />
                  <span className="text-slate-400 truncate">Override ({sessionMetrics.manualOverrideCount})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-purple-500 flex-shrink-0" />
                  <span className="text-slate-400 truncate">Roll Call ({sessionMetrics.manualFallbackCount})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-red-500 flex-shrink-0" />
                  <span className="text-slate-400 truncate">Absent ({sessionMetrics.absentCount})</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Audit & Anomalies List */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="border-b border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>Audit Anomalies &amp; Risk Detection</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {manualOverrides.length + manualFallbacks.length + chronicallyAbsentStudents.length} Flags
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Identifies admin manual overrides, hardware fallbacks, and students at risk of attendance shortage.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Anomaly 1: Manual Overrides for Selected Session */}
              <div className="space-y-3 bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                      <span>👤</span> Manual Overrides ({manualOverrides.length})
                    </h3>
                    <span className="text-[10px] text-slate-500">Needed Admin Intervention</span>
                  </div>

                  <div className="mt-3 space-y-2 max-h-60 overflow-y-auto pr-1">
                    {manualOverrides.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-500">
                        No manual overrides in this session.
                      </div>
                    ) : (
                      manualOverrides.map((row) => {
                        const st = studentMap.get(row.student_id || '')
                        return (
                          <div
                            key={row.id}
                            className="p-2.5 rounded-lg bg-blue-950/20 border border-blue-500/20 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-white truncate">{st?.name || 'Unknown'}</span>
                              <span className="font-mono text-[10px] text-blue-400">{st?.roll_no}</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                              <span>Confidence: {row.confidence !== null ? `${Math.round(row.confidence * 100)}%` : 'N/A'}</span>
                              <span>{new Date(row.timestamp || row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 pt-2 border-t border-slate-800/60">
                  Triggered by borderline distance (0.50–0.60) or admin override.
                </p>
              </div>

              {/* Anomaly 2: Manual Fallbacks for Selected Session */}
              <div className="space-y-3 bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                      <span>📋</span> Manual Roll Calls ({manualFallbacks.length})
                    </h3>
                    <span className="text-[10px] text-slate-500">Camera Fallback</span>
                  </div>

                  <div className="mt-3 space-y-2 max-h-60 overflow-y-auto pr-1">
                    {manualFallbacks.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-500">
                        No manual fallbacks in this session.
                      </div>
                    ) : (
                      manualFallbacks.map((row) => {
                        const st = studentMap.get(row.student_id || '')
                        return (
                          <div
                            key={row.id}
                            className="p-2.5 rounded-lg bg-purple-950/20 border border-purple-500/20 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-white truncate">{st?.name || 'Unknown'}</span>
                              <span className="font-mono text-[10px] text-purple-400">{st?.roll_no}</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                              <span>Biometrics bypassed</span>
                              <span>{new Date(row.timestamp || row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 pt-2 border-t border-slate-800/60">
                  Recorded via checklist when camera or models were offline.
                </p>
              </div>

              {/* Anomaly 3: Chronically Absent Students (< 50% Overall) */}
              <div className="space-y-3 bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                      <span>⚠️</span> Chronically Absent ({chronicallyAbsentStudents.length})
                    </h3>
                    <span className="text-[10px] text-slate-500">&lt;50% Across Sessions</span>
                  </div>

                  <div className="mt-3 space-y-2 max-h-60 overflow-y-auto pr-1">
                    {chronicallyAbsentStudents.length === 0 ? (
                      <div className="py-6 text-center text-xs text-emerald-400">
                        ✓ All students meet &gt;= 50% attendance requirement.
                      </div>
                    ) : (
                      chronicallyAbsentStudents.map(({ student: st, percentage, attendedCount }) => (
                        <div
                          key={st.id}
                          className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-white truncate">{st.name}</span>
                            <span className="font-bold text-red-400">{percentage}%</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span className="font-mono text-slate-500">{st.roll_no}</span>
                            <span>Attended {attendedCount} of {sessions.length} classes</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 pt-2 border-t border-slate-800/60">
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
