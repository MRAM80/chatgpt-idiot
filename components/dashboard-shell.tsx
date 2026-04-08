'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'
import { LogOut } from 'lucide-react'

type NavItem = {
  href: string
  label: string
}

type DashboardShellProps = {
  title?: string
  subtitle?: string
  roleLabel?: string
  userName?: string
  navItems?: NavItem[]
  children: ReactNode
  onLogout?: () => void | Promise<void>
}

export default function DashboardShell({
  title = 'Dashboard',
  subtitle = 'Welcome back',
  roleLabel,
  userName,
  navItems = [],
  children,
  onLogout,
}: DashboardShellProps) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 hidden h-screen w-64 flex-col border-r border-gray-200 bg-white p-5 md:flex">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">SIMPLIITRASH</h1>
          <p className="text-xs text-gray-500">Operations System</p>
        </div>

        <nav className="flex flex-1 flex-col gap-2">
          {navItems.map((item) => {
            const active = pathname === item.href

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-xl px-4 py-3 text-sm font-medium transition ${
                  active
                    ? 'bg-black text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto space-y-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm">
            <div className="font-medium text-gray-900">
              {userName || 'User'}
            </div>
            <div className="text-xs text-gray-500">
              {roleLabel || 'Role'}
            </div>
          </div>

          <button
            onClick={onLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 transition hover:bg-red-100"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="md:ml-64">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {title}
              </h2>
              <p className="text-xs text-gray-500">{subtitle}</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden text-right md:block">
                <div className="text-sm font-medium text-gray-900">
                  {userName || 'User'}
                </div>
                <div className="text-xs text-gray-500">
                  {roleLabel || 'Role'}
                </div>
              </div>

              <button
                onClick={onLogout}
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition md:hidden"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 md:p-6">{children}</main>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="fixed bottom-0 left-0 z-40 w-full border-t border-gray-200 bg-white md:hidden">
        <div className="grid grid-cols-4 text-center text-xs font-medium">
          {navItems.map((item) => {
            const active = pathname === item.href

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`py-3 ${
                  active
                    ? 'bg-black text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}