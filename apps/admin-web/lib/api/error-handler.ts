import { NextResponse } from 'next/server';
import { captureError } from '@/lib/monitoring';

export class ApiError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}

export interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export function apiSuccess<T>(data: T): ApiResult<T> {
  return { success: true, data };
}

export function apiError(message: string): ApiResult<never> {
  return { success: false, error: message };
}

export function handleSupabaseError(error: unknown, context: string): never {
  const message = error instanceof Error ? error.message : '알 수 없는 오류';
  console.error(`[${context}] Supabase Error:`, error);
  throw new ApiError(`${context}: ${message}`);
}

export function withErrorHandler(
  handler: (request: Request) => Promise<Response>
) {
  return async (request: Request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof ApiError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.statusCode }
        );
      }
      captureError(error, { route: 'admin-web API withErrorHandler' });
      console.error('Unhandled error:', error);
      const detail = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        {
          success: false,
          error: '서버 오류가 발생했습니다.',
          detail: detail || undefined,
        },
        { status: 500 }
      );
    }
  };
}
