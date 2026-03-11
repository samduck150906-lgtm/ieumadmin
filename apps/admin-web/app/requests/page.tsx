import dynamic from 'next/dynamic';

const RequestsPage = dynamic(() => import('./RequestsPageClient').then((m) => m.RequestsPage), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="animate-pulse text-slate-500">로딩 중...</div>
    </div>
  ),
});

export default function RequestsDefaultPage() {
  return <RequestsPage mode="requests" />;
}
