'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LogoutButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleLogout = async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    } catch (err) {
      console.error('Logout error:', err)
      router.push('/login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-container-high hover:bg-surface-variant text-on-surface font-mono text-[11px] uppercase tracking-wider border border-outline-variant/40 hover:text-primary-fixed hover:border-primary-fixed/40 transition-all disabled:opacity-50"
      title="Terminate secure session"
    >
      {loading ? (
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-primary-fixed animate-ping" />
          <span>TERMINATING...</span>
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[14px]">logout</span>
          <span>DISCONNECT</span>
        </span>
      )}
    </button>
  )
}
