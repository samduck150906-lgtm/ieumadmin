import dynamic from 'next/dynamic';

const RequestsPage = dynamic(() => import('../RequestsPageClient').then((m) => m.RequestsPage), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="animate-pulse text-slate-500">로딩 중...</div>
    </div>
  ),
});

/** DB 분배 전용 경로 — 미배정 DB를 제휴업체에 배정하는 전용 뷰 */
export default function DistributionPage() {
  return <RequestsPage mode="distribution" />;
}
