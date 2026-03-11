'use client';

import { memo } from 'react';
import { Calendar, MapPin } from 'lucide-react';
import { DbListRow } from './DbListRow';

interface Assignment {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  installation_date: string | null;
  partner_memo: string | null;
  service_request: {
    id?: string;
    category: string;
    customer: {
      name: string;
      phone: string;
      moving_address: string;
      area_size: string;
      moving_type: string;
      moving_date: string;
    };
  };
}

const ABSENT_SMS_TEMPLATES = [
  '안녕하세요. 방금 연락드렸으나 부재중이셔서 문자 남깁니다. 편하실 때 연락 부탁드립니다.',
  '안녕하세요. 상담 연락 드렸으나 받지 못하셨습니다. 가능하신 시간에 연락 주시면 감사하겠습니다.',
  '[이음] 신청해 주신 상담 건으로 연락드렸으나 부재중이셨습니다. 편하실 때 회신 부탁드립니다.',
];

const CATEGORY_LABELS: Record<string, string> = {
  moving: '이사',
  cleaning: '입주청소',
  internet_tv: '인터넷·TV',
  interior: '인테리어',
  appliance_rental: '가전렌탈',
  kiosk: '키오스크',
};

const STATUS_FILTERS = [
  { value: '', label: '전체' },
  { value: 'unread', label: '상담전' },
  { value: 'read', label: '상담중' },
  { value: 'consulting', label: '상담예정' },
  { value: 'reserved', label: '예약완료' },
  { value: 'completed', label: '전체완료' },
  { value: 'cancelled', label: '취소' },
  { value: 'pending', label: '부재중/보류' },
];

export const AssignmentCard = memo(function AssignmentCard({
  assignment,
  onStatusChange,
}: {
  assignment: Assignment;
  onStatusChange: (a: Assignment) => void;
}) {
  const a = assignment;
  const customer = a.service_request?.customer;

  return (
    <div className="mb-3">
      <DbListRow
        phone={customer?.phone}
        onStatusChange={() => onStatusChange(a)}
        quickActions={ABSENT_SMS_TEMPLATES.map((t, i) => ({
          id: `sms-${i}`,
          label: `부재중 문자 ${i + 1}`,
          onClick: () => {
            if (customer?.phone) window.location.href = `sms:${customer.phone}?body=${encodeURIComponent(t)}`;
          },
        }))}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                {CATEGORY_LABELS[a.service_request?.category] || a.service_request?.category}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  a.status === 'unread'
                    ? 'bg-red-50 text-red-700'
                    : a.status === 'reserved'
                      ? 'bg-green-50 text-green-700'
                      : a.status === 'completed'
                        ? 'bg-emerald-50 text-emerald-700'
                        : a.status === 'cancelled'
                          ? 'bg-gray-100 text-gray-500'
                          : 'bg-yellow-50 text-yellow-700'
                }`}
              >
                {STATUS_FILTERS.find((f) => f.value === a.status)?.label || a.status}
              </span>
            </div>
            <p className="font-semibold text-lg">{customer?.name}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-600">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-brand-primary font-medium">{customer?.phone}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 shrink-0" />
            {customer?.moving_address}
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 shrink-0" />
            이사일: {customer?.moving_date || '미정'}
          </div>
          <div>
            평수: {customer?.area_size} / {customer?.moving_type || '-'}
          </div>
        </div>

        {a.installation_date && (
          <div className="mt-3 p-3 bg-green-50 rounded-xl text-sm text-green-700">
            📅 예약일: {a.installation_date}
          </div>
        )}
        {a.partner_memo && (
          <div className="mt-2 p-3 bg-gray-50 rounded-xl text-sm text-gray-600">
            📝 {a.partner_memo}
          </div>
        )}
      </DbListRow>
    </div>
  );
});
