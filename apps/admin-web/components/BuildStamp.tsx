'use client';

/**
 * 페이지 하단 빌드 스탬프 — 배포 반영 여부 확인용.
 * Build: <COMMIT_REF> / <BUILD_ID> / <date>
 * 값이 바뀌지 않으면 다른 배포/캐시를 보고 있을 가능성이 높습니다.
 */
export function BuildStamp() {
  const commitRef =
    process.env.NEXT_PUBLIC_BUILD_ID || process.env.COMMIT_REF || process.env.NEXT_PUBLIC_BUILD_SHA || 'local';
  const buildId = process.env.NEXT_PUBLIC_BUILD_NUMBER || process.env.BUILD_ID || 'local';
  const buildDate = process.env.NEXT_PUBLIC_BUILD_TIME || 'local';

  return (
    <footer className="mt-auto py-3 text-center border-t border-slate-200/60">
      <p
        className="text-[11px] font-mono text-slate-400"
        title={`Build: ${commitRef} / ${buildId} / ${buildDate}`}
      >
        Build: {commitRef} / {buildId} / {buildDate}
      </p>
    </footer>
  );
}
