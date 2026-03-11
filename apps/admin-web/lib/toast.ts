import toast from 'react-hot-toast';

/** 성공 메시지 (토스트) */
export function showSuccess(message: string) {
  toast.success(message);
}

/** 오류 메시지 (토스트) */
export function showError(message: string) {
  toast.error(message);
}

/** 로딩 토스트 시작 → 완료/실패 시 dismiss 후 success/error 호출용 */
export function showLoading(message: string) {
  return toast.loading(message);
}

export function dismiss(toastId?: string) {
  toast.dismiss(toastId);
}

export { toast };
