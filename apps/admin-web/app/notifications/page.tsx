import { redirect } from 'next/navigation';

/** 알림 내역·트리거·크론은 통합 알림 관리 페이지에서 제공 */
export default function NotificationsPage() {
  redirect('/admin/notifications');
}
