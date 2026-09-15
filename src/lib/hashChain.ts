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
