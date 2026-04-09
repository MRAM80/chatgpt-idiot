'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ReactNode, useMemo, useState } from 'react'
import {
  LayoutDashboard,
  Truck,
  Users,
  MapPin,
  CalendarDays,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  Bell,
  Search,
  ChevronRight,
} from 'lucide-react'

type NavItem = {
  href: string
  label: string
  icon?: ReactNode
}

type DashboardShellProps = {
  title?: string
  subtitle?: string
  roleLabel?: string
  userName?: string
  navItems?: NavItem[]
  children: ReactNode
}

function getInitials(name?: string) {
  if (!name) return 'ST'
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default function DashboardShell({
  title = 'Dashboard',
  subtitle = 'Welcome back to SimpliiTrash',
  roleLabel = 'Admin',
  userName = 'SimpliiTrash User',
  navItems = [],
  children,
}: DashboardShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleLogout() {
    router.push('/login')
  }

  const defaultNavItems: NavItem[] = useMemo(
    () => [
      {
        href: '/admin',
        label: 'Overview',
        icon: <LayoutDashboard className="h-5 w-5" />,
      },
      {
        href: '/admin/jobs',
        label: 'Jobs',
        icon: <CalendarDays className="h-5 w-5" />,
      },
      {
        href: '/admin/drivers',
        label: 'Drivers',
        icon: <Truck className="h-5 w-5" />,
      },
      {
        href: '/admin/customers',
        label: 'Customers',
        icon: <Users className="h-5 w-5" />,
      },
      {
        href: '/admin/bins',
        label: 'Bins',
        icon: <MapPin className="h-5 w-5" />,
      },
      {
        href: '/admin/reports',
        label: 'Reports',
        icon: <BarChart3 className="h-5 w-5" />,
      },
      {
        href: '/admin/settings',
        label: 'Settings',
        icon: <Settings className="h-5 w-5" />,
      },
    ],
    []
  )

  const finalNavItems = navItems.length
    ? navItems.map((item) => ({
        ...item,
        icon:
          item.icon ??
          defaultNavItems.find((defaultItem) => defaultItem.href === item.href)?.icon ??
          <ChevronRight className="h-5 w-5" />,
      }))
    : defaultNavItems

  const initials = getInitials(userName)

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        {mobileOpen && (
          <button
            className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close sidebar overlay"
          />
        )}

        <aside
          className={`fixed inset-y-0 left-0 z-50 w-72 transform border-r border-slate-200 bg-white shadow-xl transition-transform duration-300 lg:static lg:z-auto lg:translate-x-0 lg:shadow-none ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex h-20 items-center justify-between border-b border-slate-200 px-6">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                SimpliiTrash
              </h1>
              <p className="text-sm text-slate-500">Operations Platform</p>
            </div>
            <button
              onClick={() => setMobileOpen(false)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
              aria-label="Close menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>

          <div className="border-b border-slate-200 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white">
                {initials}
              </div>
              <div>
                <p className="font-semibold text-slate-900">{userName}</p>
                <p className="text-sm text-slate-500">{roleLabel}</p>
              </div>
            </div>
          </div>

          <nav className="px-4 py-5">
            <p className="px-3 pb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Main Menu
            </p>

            <div className="space-y-1">
              {finalNavItems.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`)

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                      active
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                    onClick={() => setMobileOpen(false)}
                  >
                    <span
                      className={`transition ${
                        active
                          ? 'text-white'
                          : 'text-slate-400 group-hover:text-slate-700'
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span className="flex-1">{item.label}</span>
                    {active && <ChevronRight className="h-4 w-4" />}
                  </Link>
                )
              })}
            </div>
          </nav>

          <div className="mt-auto px-4 pb-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                System Status
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Platform connected and ready for dispatch operations.
              </p>
              <div className="mt-4 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span className="text-xs font-medium text-emerald-700">
                  All systems normal
                </span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
            <div className="flex h-20 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  onClick={() => setMobileOpen(true)}
                  className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-100 lg:hidden"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </button>

                <div className="min-w-0">
                  <h2 className="truncate text-2xl font-bold tracking-tight text-slate-900">
                    {title}
                  </h2>
                  <p className="truncate text-sm text-slate-500">{subtitle}</p>
                </div>
              </div>

              <div className="hidden items-center gap-3 md:flex">
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search..."
                    className="w-48 bg-transparent text-sm outline-none placeholder:text-slate-400"
                  />
                </div>

                <button className="relative rounded-2xl border border-slate-200 bg-white p-3 text-slate-600 hover:bg-slate-50">
                  <Bell className="h-5 w-5" />
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-emerald-500" />
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-7xl">
              <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-sm font-medium text-slate-500">Active Jobs</p>
                  <p className="mt-3 text-3xl font-bold text-slate-900">128</p>
                  <p className="mt-2 text-sm text-emerald-600">
                    +12% from last week
                  </p>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-sm font-medium text-slate-500">
                    Drivers Available
                  </p>
                  <p className="mt-3 text-3xl font-bold text-slate-900">24</p>
                  <p className="mt-2 text-sm text-slate-500">
                    Ready for assignment
                  </p>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-sm font-medium text-slate-500">
                    Bins In Service
                  </p>
                  <p className="mt-3 text-3xl font-bold text-slate-900">342</p>
                  <p className="mt-2 text-sm text-slate-500">
                    Across all active locations
                  </p>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-sm font-medium text-slate-500">Revenue</p>
                  <p className="mt-3 text-3xl font-bold text-slate-900">$18.4K</p>
                  <p className="mt-2 text-sm text-emerald-600">
                    +8.4% monthly growth
                  </p>
                </div>
              </section>

              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}