import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import LogoutButton from '@/components/LogoutButton'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-md shadow-indigo-600/30 text-sm">
                M
              </div>
              <span className="font-bold text-lg tracking-tight text-white">
                Markify
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-1 text-sm">
              <Link
                href="/dashboard"
                className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition font-medium"
              >
                Dashboard
              </Link>
              <Link
                href="/dashboard/enroll"
                className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition font-medium"
              >
                Enroll Students
              </Link>
              <Link
                href="/dashboard/session"
                className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition font-medium"
              >
                Attendance Sessions
              </Link>
              <Link
                href="/dashboard/analytics"
                className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition font-medium"
              >
                Analytics
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-400 hidden sm:inline">Signed in:</span>
              <span className="font-medium text-slate-200 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/60 max-w-[200px] truncate">
                {user.email}
              </span>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  )
}
