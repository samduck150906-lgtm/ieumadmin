/**
 * 역할별 권한 체크
 */

import type { UserRole } from '@/types/user';

export type Permission =
  | 'users.read'
  | 'users.write'
  | 'users.delete'
  | 'partners.read'
  | 'partners.write'
  | 'partners.verify'
  | 'partners.delete'
  | 'settlements.read'
  | 'settlements.write'
  | 'settlements.process'
  | 'properties.read'
  | 'properties.write'
  | 'properties.delete'
  | 'commissions.read'
  | 'commissions.write'
  | 'commissions.approve'
  | 'payments.read'
  | 'payments.refund'
  | 'reports.read'
  | 'reports.export'
  | 'settings.read'
  | 'settings.write'
  | 'audit.read';

const rolePermissions: Record<UserRole, Permission[]> = {
  super_admin: [
    'users.read',
    'users.write',
    'users.delete',
    'partners.read',
    'partners.write',
    'partners.verify',
    'partners.delete',
    'settlements.read',
    'settlements.write',
    'settlements.process',
    'properties.read',
    'properties.write',
    'properties.delete',
    'commissions.read',
    'commissions.write',
    'commissions.approve',
    'payments.read',
    'payments.refund',
    'reports.read',
    'reports.export',
    'settings.read',
    'settings.write',
    'audit.read',
  ],
  admin: [
    'users.read',
    'users.write',
    'partners.read',
    'partners.write',
    'partners.verify',
    'settlements.read',
    'settlements.write',
    'settlements.process',
    'properties.read',
    'properties.write',
    'commissions.read',
    'commissions.write',
    'commissions.approve',
    'payments.read',
    'payments.refund',
    'reports.read',
    'reports.export',
    'settings.read',
    'audit.read',
  ],
  manager: [
    'users.read',
    'partners.read',
    'partners.write',
    'settlements.read',
    'properties.read',
    'properties.write',
    'commissions.read',
    'commissions.write',
    'payments.read',
    'reports.read',
  ],
  viewer: [
    'users.read',
    'partners.read',
    'settlements.read',
    'properties.read',
    'commissions.read',
    'payments.read',
    'reports.read',
  ],
};

export function hasPermission(
  role: UserRole,
  permission: Permission
): boolean {
  return rolePermissions[role]?.includes(permission) ?? false;
}

export function hasAnyPermission(
  role: UserRole,
  permissions: Permission[]
): boolean {
  return permissions.some((p) => hasPermission(role, p));
}
