/**
 * Micro Interaction Haptic Feedback — 웹 (navigator.vibrate)
 * 모바일 브라우저에서 짧은 진동 피드백
 */
export function hapticLight(): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(10);
  }
}

export function hapticImpactMedium(): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([5, 30, 5]);
  }
}
