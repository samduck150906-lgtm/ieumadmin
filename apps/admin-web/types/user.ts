/**
 * 회원(사용자) 타입
 */

import type { StatusType } from './common';

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: UserRole;
  status: StatusType;
  profileImage?: string;
  provider: 'kakao' | 'apple' | 'email';
  lastLoginAt: string;
  createdAt: string;
  updatedAt: string;
}

export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'manager'
  | 'viewer';

export interface ActivityLog {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface UserDetail extends User {
  invitedCustomers: number;
  invitedPartners: number;
  totalCommission: number;
  recentActivity: ActivityLog[];
}
