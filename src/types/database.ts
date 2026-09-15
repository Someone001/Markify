export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type AttendanceStatus =
  | 'present'
  | 'flagged_duplicate'
  | 'manual_override'
  | 'manual_fallback'

export interface Database {
  public: {
    Tables: {
      students: {
        Row: {
          id: string
          name: string
          roll_no: string
          embedding: number[]
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          roll_no: string
          embedding: number[]
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          roll_no?: string
          embedding?: number[]
          created_at?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          id: string
          class_name: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          class_name: string
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          class_name?: string
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          id: string
          student_id: string | null
          session_id: string | null
          timestamp: string
          confidence: number | null
          status: AttendanceStatus
          overridden_by: string | null
          hash: string
          prev_hash: string | null
          created_at: string
        }
        Insert: {
          id?: string
          student_id?: string | null
          session_id?: string | null
          timestamp?: string
          confidence?: number | null
          status: AttendanceStatus
          overridden_by?: string | null
          hash: string
          prev_hash?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          student_id?: string | null
          session_id?: string | null
          timestamp?: string
          confidence?: number | null
          status?: AttendanceStatus
          overridden_by?: string | null
          hash?: string
          prev_hash?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'attendance_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'students'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'attendance_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'sessions'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      attendance_status: AttendanceStatus
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Student = Database['public']['Tables']['students']['Row']
export type Session = Database['public']['Tables']['sessions']['Row']
export type Attendance = Database['public']['Tables']['attendance']['Row']
