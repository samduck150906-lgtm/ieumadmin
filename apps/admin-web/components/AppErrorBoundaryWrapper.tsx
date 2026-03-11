'use client';

import { ErrorBoundary } from '@/components/ErrorBoundary';

export function AppErrorBoundaryWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
