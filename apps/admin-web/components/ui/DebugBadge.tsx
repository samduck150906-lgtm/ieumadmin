'use client';

/**
 * 개발 모드에서만 표시되는 디버그 배지.
 * 파일명/커밋해시/빌드타임 표시 — 코드 반영 증거용.
 * SHOW_DEBUG_BADGE=true 또는 __DEV__(NODE_ENV!=='production')일 때만 표시.
 */
const SHOW_DEBUG_BADGE =
  typeof process !== 'undefined' &&
  process.env?.NEXT_PUBLIC_SHOW_DEBUG_BADGE === 'true';

const IS_DEV =
  typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

export function DebugBadge({
  file,
  commit = 'DEV',
  buildTime,
}: {
  file: string;
  commit?: string;
  buildTime?: string;
}) {
  if (!SHOW_DEBUG_BADGE && !IS_DEV) return null;

  const displayTime = buildTime || new Date().toISOString().slice(0, 19);
  const displayCommit = commit || 'DEV';

  return (
    <div
      className="fixed top-0 right-0 z-[9999] px-2 py-1 text-[10px] font-mono bg-amber-400/95 text-black rounded-bl-lg shadow-md border border-amber-600 pointer-events-none"
      title={`${file} | ${displayCommit} | ${displayTime}`}
    >
      <div className="font-semibold">PROOF</div>
      <div className="opacity-90 truncate max-w-[180px]" title={file}>
        {file.split('/').pop()}
      </div>
      <div>
        COMMIT {displayCommit} · BUILD {displayTime.replace('T', ' ')}
      </div>
    </div>
  );
}
