import { redirect } from 'next/navigation';

/** 레거시 경로: 제휴업체는 /partner/dashboard로 통합됨 */
export default function AffiliatePage() {
  redirect('/partner/dashboard');
}
