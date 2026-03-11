const isDev = process.env.NODE_ENV === 'development';

export const logger = {
  error: (message: string, error?: unknown) => {
    if (isDev && error != null) {
      // eslint-disable-next-line no-console
      console.error(`[${message}]`, error);
    }
  },
};

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  const o = error && typeof error === 'object';
  if (o && 'message' in error && typeof (error as { message: unknown }).message === 'string') return (error as { message: string }).message;
  if (o && 'error_description' in error && typeof (error as { error_description: unknown }).error_description === 'string') return (error as { error_description: string }).error_description;
  if (o && 'error' in error && typeof (error as { error: unknown }).error === 'string') return (error as { error: string }).error;
  return '오류가 발생했습니다.';
}
