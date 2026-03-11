import { redirect } from 'next/navigation';

/** DB 분배 — /requests/distribution으로 통합됨. 기존 링크 호환용 리다이렉트 */
export default function DbDistributionPage() {
  redirect('/requests/distribution');
}
