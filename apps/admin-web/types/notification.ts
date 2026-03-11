/**
 * 알림 타입
 */

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  channels: NotificationChannel[];
  targetType: 'all' | 'group' | 'individual';
  targetIds?: string[];
  scheduledAt?: string;
  sentAt?: string;
  status: 'draft' | 'scheduled' | 'sent' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export type NotificationType =
  | 'announcement'
  | 'settlement_complete'
  | 'new_property'
  | 'system'
  | 'promotion';

export type NotificationChannel =
  | 'push'
  | 'sms'
  | 'email'
  | 'in_app';
