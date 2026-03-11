import type { Metadata } from 'next';

/** 제휴업체 전용 영역 메타데이터 — 관리자와 완전 분리된 대시보드 정체성 */
export const metadata: Metadata = {
  title: '이음 파트너스',
  description: '이음 제휴업체 전용 포털 — 대시보드, 결제(미수), DB 관리, DB 구매',
};

export default function PartnerSegmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
