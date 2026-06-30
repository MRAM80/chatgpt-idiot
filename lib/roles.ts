export type Role = 'owner' | 'manager' | 'admin' | 'dispatcher' | 'driver'

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  manager: 'Manager',
  admin: 'Admin',
  dispatcher: 'Dispatcher',
  driver: 'Driver',
}

type Permissions = {
  canDelete: boolean
  canManageUsers: boolean
  canViewReports: boolean
  canDispatch: boolean
  canViewDashboard: boolean
  canManageDrivers: boolean
}

export const ROLE_PERMISSIONS: Record<Role, Permissions> = {
  owner:      { canDelete: true,  canManageUsers: true,  canViewReports: true,  canDispatch: true,  canViewDashboard: true,  canManageDrivers: true  },
  manager:    { canDelete: true,  canManageUsers: false, canViewReports: true,  canDispatch: true,  canViewDashboard: true,  canManageDrivers: true  },
  admin:      { canDelete: false, canManageUsers: false, canViewReports: true,  canDispatch: false, canViewDashboard: true,  canManageDrivers: false },
  dispatcher: { canDelete: false, canManageUsers: false, canViewReports: false, canDispatch: true,  canViewDashboard: false, canManageDrivers: false },
  driver:     { canDelete: false, canManageUsers: false, canViewReports: false, canDispatch: false, canViewDashboard: false, canManageDrivers: false },
}

export function can(role: Role | null, permission: keyof Permissions): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role][permission] ?? false
}
