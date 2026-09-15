'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  name: string
  href: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: 'grid_view',
  },
  {
    name: 'Live Capture',
    href: '/dashboard/session',
    icon: 'videocam',
  },
  {
    name: 'Enroll Student',
    href: '/dashboard/enroll',
    icon: 'person_add',
  },
  {
    name: 'Analytics',
    href: '/dashboard/analytics',
    icon: 'monitoring',
  },
]

export default function SidebarNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1.5">
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(item.href)

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`group relative flex items-center gap-3 px-3.5 py-2.5 rounded-lg font-mono text-xs uppercase transition-all duration-200 ${
              isActive
                ? 'bg-primary-fixed text-on-primary-fixed font-bold shadow-[0_0_22px_rgba(195,244,0,0.5)] scale-[1.02]'
                : 'text-on-surface-variant hover:text-white hover:bg-surface-container hover:border-l-2 hover:border-primary-fixed hover:shadow-[inset_0_0_12px_rgba(195,244,0,0.1)]'
            }`}
          >
            {/* Active Glow Accent Bar on Left */}
            {isActive && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r bg-on-primary-fixed" />
            )}

            <span
              className={`material-symbols-outlined text-[18px] transition-transform group-hover:scale-110 ${
                isActive ? 'text-on-primary-fixed' : 'text-on-surface-variant group-hover:text-primary-fixed'
              }`}
            >
              {item.icon}
            </span>

            <span className="tracking-wider">{item.name}</span>
          </Link>
        )
      })}
    </nav>
  )
}
