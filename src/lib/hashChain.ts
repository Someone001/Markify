import { createClient } from '@/lib/supabase/client'
import type { Attendance } from '@/types/database'

export async function sha256(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface ConfirmAttendanceResult {
  success: boolean
  record?: Attendance
  alreadyMarked: boolean
  error?: string
}

/**
 * Confirms attendance with cryptographic hash-chaining in Supabase (Liveness verified)
 */
export async function confirmAttendance(
  studentId: string,
  sessionId: string,
  confidence: number
): Promise<ConfirmAttendanceResult> {
  try {
    const supabase = createClient()

    // 1. Query for existing attendance record for this student in this session
    const { data: existing, error: existErr } = await supabase
      .from('attendance')
      .select('*')
      .eq('student_id', studentId)
      .eq('session_id', sessionId)
      .maybeSingle()

    if (existErr) {
      console.warn('Attendance lookup notice:', existErr.message)
    }

    if (existing) {
      return {
        success: true,
        record: existing as Attendance,
        alreadyMarked: true,
      }
    }

    // 2. Fetch the latest attendance row for this session to retrieve prev_hash
    const { data: lastRow, error: lastErr } = await supabase
      .from('attendance')
      .select('hash')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastErr) {
      console.warn('Previous hash lookup notice:', lastErr.message)
    }

    const prevHash = lastRow?.hash || null
    const timestamp = new Date().toISOString()

    // 3. Compute hash = SHA256(prev_hash + student_id + timestamp + confidence)
    const rawData = `${prevHash || ''}${studentId}${timestamp}${confidence}`
    const hash = await sha256(rawData)

    // 4. Insert new verified attendance entry into Supabase
    const { data: inserted, error: insertErr } = await supabase
      .from('attendance')
      .insert({
        student_id: studentId,
        session_id: sessionId,
        timestamp,
        confidence,
        status: 'present',
        hash,
        prev_hash: prevHash,
      })
      .select()
      .single()

    if (insertErr) {
      if (insertErr.code === '23505') {
        return { success: true, alreadyMarked: true }
      }
      throw insertErr
    }

    return {
      success: true,
      record: inserted as Attendance,
      alreadyMarked: false,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to confirm attendance'
    console.error('confirmAttendance error:', err)
    return {
      success: false,
      alreadyMarked: false,
      error: msg,
    }
  }
}

/**
 * Manual override for borderline or low-confidence matches (status='manual_override')
 */
export async function confirmManualOverride(
  studentId: string,
  sessionId: string,
  confidence: number,
  overriddenByUserId: string
): Promise<ConfirmAttendanceResult> {
  try {
    const supabase = createClient()

    // 1. Check if already marked
    const { data: existing } = await supabase
      .from('attendance')
      .select('*')
      .eq('student_id', studentId)
      .eq('session_id', sessionId)
      .maybeSingle()

    if (existing) {
      return {
        success: true,
        record: existing as Attendance,
        alreadyMarked: true,
      }
    }

    // 2. Retrieve previous hash in the session chain
    const { data: lastRow } = await supabase
      .from('attendance')
      .select('hash')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const prevHash = lastRow?.hash || null
    const timestamp = new Date().toISOString()

    // 3. Compute hash = SHA256(prev_hash + student_id + timestamp + confidence)
    const rawData = `${prevHash || ''}${studentId}${timestamp}${confidence}`
    const hash = await sha256(rawData)

    // 4. Insert with status='manual_override' and overridden_by
    const { data: inserted, error: insertErr } = await supabase
      .from('attendance')
      .insert({
        student_id: studentId,
        session_id: sessionId,
        timestamp,
        confidence,
        status: 'manual_override',
        overridden_by: overriddenByUserId || null,
        hash,
        prev_hash: prevHash,
      })
      .select()
      .single()

    if (insertErr) {
      if (insertErr.code === '23505') {
        return { success: true, alreadyMarked: true }
      }
      throw insertErr
    }

    return {
      success: true,
      record: inserted as Attendance,
      alreadyMarked: false,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to execute manual override'
    console.error('confirmManualOverride error:', err)
    return {
      success: false,
      alreadyMarked: false,
      error: msg,
    }
  }
}

/**
 * Degraded-mode fallback for manual roll-call (status='manual_fallback', confidence=null)
 */
export async function confirmManualFallback(
  studentId: string,
  sessionId: string,
  markedByUserId: string
): Promise<ConfirmAttendanceResult> {
  try {
    const supabase = createClient()

    // 1. Check if already marked
    const { data: existing } = await supabase
      .from('attendance')
      .select('*')
      .eq('student_id', studentId)
      .eq('session_id', sessionId)
      .maybeSingle()

    if (existing) {
      return {
        success: true,
        record: existing as Attendance,
        alreadyMarked: true,
      }
    }

    // 2. Retrieve previous hash in the session chain
    const { data: lastRow } = await supabase
      .from('attendance')
      .select('hash')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const prevHash = lastRow?.hash || null
    const timestamp = new Date().toISOString()

    // 3. Compute hash without confidence value
    const rawData = `${prevHash || ''}${studentId}${timestamp}`
    const hash = await sha256(rawData)

    // 4. Insert with status='manual_fallback', confidence=null, overridden_by=markedByUserId
    const { data: inserted, error: insertErr } = await supabase
      .from('attendance')
      .insert({
        student_id: studentId,
        session_id: sessionId,
        timestamp,
        confidence: null,
        status: 'manual_fallback',
        overridden_by: markedByUserId || null,
        hash,
        prev_hash: prevHash,
      })
      .select()
      .single()

    if (insertErr) {
      if (insertErr.code === '23505') {
        return { success: true, alreadyMarked: true }
      }
      throw insertErr
    }

    return {
      success: true,
      record: inserted as Attendance,
      alreadyMarked: false,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to execute manual fallback'
    console.error('confirmManualFallback error:', err)
    return {
      success: false,
      alreadyMarked: false,
      error: msg,
    }
  }
}

export interface CheckFailureDetail {
  type: 'hash_mismatch' | 'chain_link_mismatch'
  message: string
  storedValue: string | null
  expectedValue: string | null
}

export interface RowVerificationFailure {
  index: number
  rowId: string
  studentId: string | null
  studentName?: string
  rollNo?: string
  status: string
  timestamp: string
  confidence: number | null
  failures: CheckFailureDetail[]
}

export interface VerifyIntegrityResult {
  verified: boolean
  totalRecords: number
  failures: RowVerificationFailure[]
  message: string
}

/**
 * Audits and verifies the cryptographic hash-chain integrity for all attendance records in a session.
 * 1. Verifies each row's SHA256 matches its payload (using its own prev_hash).
 * 2. Verifies each row's prev_hash matches the preceding row's stored hash.
 */
export async function verifySessionIntegrity(sessionId: string): Promise<VerifyIntegrityResult> {
  try {
    const supabase = createClient()
    const { data: rows, error } = await supabase
      .from('attendance')
      .select('*, students(name, roll_no)')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    if (error) throw error

    if (!rows || rows.length === 0) {
      return {
        verified: true,
        totalRecords: 0,
        failures: [],
        message: '✓ Chain verified — 0 records, no tampering detected',
      }
    }

    const failures: RowVerificationFailure[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowFailures: CheckFailureDetail[] = []

      // 1. Chain link integrity: row.prev_hash must equal the previous row's stored hash
      const expectedPrevHash = i === 0 ? null : rows[i - 1].hash
      const actualPrevHash = row.prev_hash || null

      if (actualPrevHash !== expectedPrevHash) {
        rowFailures.push({
          type: 'chain_link_mismatch',
          message: 'Chain link mismatch: prev_hash does not match the previous record hash (record reordered, missing, or injected).',
          storedValue: actualPrevHash,
          expectedValue: expectedPrevHash,
        })
      }

      // 2. Row hash integrity: recompute SHA256(prev_hash + student_id + timestamp + confidence)
      const tsCandidates = [
        new Date(row.timestamp).toISOString(),
        row.timestamp,
      ]

      let hashMatched = false
      let lastComputedHash = ''

      for (const ts of tsCandidates) {
        const confStr = row.confidence !== null && row.confidence !== undefined ? `${row.confidence}` : ''
        const raw1 = `${row.prev_hash || ''}${row.student_id}${ts}${confStr}`
        const h1 = await sha256(raw1)
        if (h1 === row.hash) {
          hashMatched = true
          break
        }
        lastComputedHash = h1

        if (row.confidence === null) {
          const raw2 = `${row.prev_hash || ''}${row.student_id}${ts}`
          const h2 = await sha256(raw2)
          if (h2 === row.hash) {
            hashMatched = true
            break
          }
        }
      }

      if (!hashMatched) {
        rowFailures.push({
          type: 'hash_mismatch',
          message: 'Hash mismatch: computed SHA256 signature does not match stored hash (data payload modified).',
          storedValue: row.hash,
          expectedValue: lastComputedHash,
        })
      }

      if (rowFailures.length > 0) {
        const studentInfo = row.students as { name?: string; roll_no?: string } | null
        failures.push({
          index: i + 1,
          rowId: row.id,
          studentId: row.student_id,
          studentName: studentInfo?.name || 'Unknown',
          rollNo: studentInfo?.roll_no || 'N/A',
          status: row.status,
          timestamp: row.timestamp || row.created_at,
          confidence: row.confidence,
          failures: rowFailures,
        })
      }
    }

    if (failures.length === 0) {
      return {
        verified: true,
        totalRecords: rows.length,
        failures: [],
        message: `✓ Chain verified — ${rows.length} record${rows.length === 1 ? '' : 's'}, no tampering detected`,
      }
    } else {
      return {
        verified: false,
        totalRecords: rows.length,
        failures,
        message: `Integrity check failed: ${failures.length} tampered record${failures.length === 1 ? '' : 's'} detected`,
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Integrity verification failed'
    console.error('verifySessionIntegrity error:', err)
    return {
      verified: false,
      totalRecords: 0,
      failures: [],
      message: `Verification error: ${msg}`,
    }
  }
}

