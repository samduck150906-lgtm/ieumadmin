import { Eye, Phone, MapPin, UserX, CheckCircle, Ban, Clock } from 'lucide-react';

export const STATUS_ORDER = ['unread', 'read', 'consulting', 'visiting', 'absent', 'reserved', 'completed', 'cancelled'];

/** 추가 입력 없이 바로 변경 가능한 단순 전환 (모달 불필요) */
export const QUICK_TRANSITIONS: Record<string, string> = {
  read: 'consulting',
  consulting: 'visiting',
  visiting: 'absent',
  absent: 'reserved',
};

export const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Eye }> = {
  unread: { label: '상담전(미열람)', color: 'bg-red-50 text-red-700 border-red-200', icon: Eye },
  read: { label: '진행중(열람)', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Eye },
  consulting: { label: '상담중', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: Phone },
  visiting: { label: '방문상담', color: 'bg-purple-50 text-purple-700 border-purple-200', icon: MapPin },
  absent: { label: '부재중', color: 'bg-orange-50 text-orange-700 border-orange-200', icon: UserX },
  reserved: { label: '예약완료', color: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle },
  completed: { label: '전체완료', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle },
  cancelled: { label: '취소', color: 'bg-gray-100 text-gray-500 border-gray-200', icon: Ban },
  pending: { label: '보류', color: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Clock },
};

export const CATEGORY_LABELS: Record<string, string> = {
  moving: '이사',
  cleaning: '입주청소',
  internet_tv: '인터넷·TV',
  interior: '인테리어',
  appliance_rental: '가전렌탈',
  kiosk: '키오스크',
};

export const CANCEL_REASONS: Record<string, string> = {
  customer_cancel: '고객 일방 취소',
  other_vendor: '타 업체에 하기로 함',
  other_partner: '타 업체에 하기로 함',
  partner_reason: '본 업체 사정 (DB 반환)',
  partner_issue: '본 업체 사정 (DB 반환)',
};

export const STATUS_FILTERS = [
  { value: '', label: '전체' },
  { value: 'unread', label: '상담전' },
  { value: 'read', label: '진행중' },
  { value: 'consulting', label: '상담중' },
  { value: 'visiting', label: '방문상담' },
  { value: 'absent', label: '부재중' },
  { value: 'reserved', label: '예약완료' },
  { value: 'completed', label: '완료' },
  { value: 'cancelled', label: '취소' },
];
