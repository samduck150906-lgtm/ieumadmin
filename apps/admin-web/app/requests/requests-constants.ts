import { SERVICE_CATEGORY_LABELS } from '@/types/database';

export const statusOptions: { value: string; label: string }[] = [
  { value: '', label: '상태 전체' },
  { value: 'unread', label: '미배정' },
  { value: 'read', label: '열람' },
  { value: 'assigned', label: '배정완료' },
  { value: 'settlement_check', label: '정산확인' },
  { value: 'settlement_done', label: '정산완료' },
  { value: 'hq_review_needed', label: '본사확인필요' },
  { value: 'cancelled', label: '취소' },
];

export const categoryOptions = [
  { value: '', label: '카테고리 전체' },
  ...Object.entries(SERVICE_CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
];

export const PAGE_SIZE_OPTIONS = [20, 50, 100, 300, 1000];
