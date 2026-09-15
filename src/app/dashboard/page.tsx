import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/80 border border-slate-800 p-8 rounded-2xl shadow-xl">
        <h1 className="text-2xl font-bold text-white mb-2">
          Dashboard - logged in as {user?.email}
        </h1>
        <p className="text-sm text-slate-400">
          Markify attendance system is ready. Use the navigation to manage student attendance, sessions, and facial verification.
        </p>
      </div>
    </div>
  )
}
