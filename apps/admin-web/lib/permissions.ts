export type UserRole = 'staff' | 'partner' | 'realtor' | 'admin';

export interface Permissions {
  customers: { view: boolean; viewPhone: boolean; edit: boolean; delete: boolean };
  requests: { view: boolean; assign: boolean; cancel: boolean };
  partners: { view: boolean; approve: boolean; suspend: boolean };
  settlements: { view: boolean; approve: boolean };
  staff: { view: boolean; manage: boolean };
  pricing: { view: boolean; edit: boolean };
}

export const ROLE_PERMISSIONS: Record<UserRole, Permissions> = {
  admin: {
    customers: { view: true, viewPhone: true, edit: true, delete: true },
    requests: { view: true, assign: true, cancel: true },
    partners: { view: true, approve: true, suspend: true },
    settlements: { view: true, approve: true },
    staff: { view: true, manage: true },
    pricing: { view: true, edit: true },
  },
  staff: {
    customers: { view: true, viewPhone: true, edit: true, delete: false },
    requests: { view: true, assign: true, cancel: true },
    partners: { view: true, approve: true, suspend: true },
    settlements: { view: true, approve: true },
    staff: { view: true, manage: false }, // manage는 admin만
    pricing: { view: true, edit: true },
  },
  partner: {
    customers: { view: true, viewPhone: true, edit: false, delete: false },
    requests: { view: true, assign: false, cancel: false },
    partners: { view: false, approve: false, suspend: false },
    settlements: { view: true, approve: false },
    staff: { view: false, manage: false },
    pricing: { view: true, edit: false },
  },
  realtor: {
    customers: { view: true, viewPhone: false, edit: false, delete: false },
    requests: { view: true, assign: false, cancel: false },
    partners: { view: false, approve: false, suspend: false },
    settlements: { view: true, approve: false },
    staff: { view: false, manage: false },
    pricing: { view: false, edit: false },
  },
};

export function hasPermission(
  role: UserRole,
  resource: keyof Permissions,
  action: string
): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  const resourcePerms = perms[resource] as Record<string, boolean>;
  return resourcePerms?.[action] === true;
}
