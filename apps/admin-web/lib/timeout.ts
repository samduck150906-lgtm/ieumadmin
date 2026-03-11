/** 데이터 로딩용 기본 타임아웃 (ms) */
export const DATA_FETCH_TIMEOUT_MS = 25_000;

/** 엑셀 다운로드용 타임아웃 (대량 조회 허용) */
export const EXCEL_FETCH_TIMEOUT_MS = 60_000;

/**
 * Promise를 주어진 시간 내에 완료되지 않으면 reject.
 * Netlify 등에서 Supabase 응답 지연 시 로딩이 끝나지 않는 문제 방지.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = '요청이 시간 초과되었습니다. 네트워크와 Supabase 연결을 확인한 뒤 다시 시도해 주세요.'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ]);
}

/** 타임아웃 에러 시 사용자 안내 문구 반환 */
export function getTimeoutFriendlyMessage(err: unknown): string {
  if (err instanceof Error && (err.message === 'TIMEOUT' || err.message.includes('시간 초과'))) {
    return '데이터 연결이 지연되고 있습니다. Supabase 프로젝트가 일시정지 상태이거나 네트워크 문제일 수 있습니다. 잠시 후 [새로고침]을 눌러 주세요.';
  }
  return '';
}

/**
 * 로딩 무한루프 방지: 비동기 로딩 시 타임아웃 적용 후 반드시 setLoading(false) 호출.
 * 사용: loadData 내부에서 runWithLoadingGuard(() => fetch(...), setLoading) 호출.
 */
export async function runWithLoadingGuard<T>(
  run: () => Promise<T>,
  setLoading: (value: boolean) => void,
  timeoutMs: number = DATA_FETCH_TIMEOUT_MS
): Promise<T> {
  setLoading(true);
  try {
    return await withTimeout(run(), timeoutMs);
  } finally {
    setLoading(false);
  }
}
