'use client';

import AdminLayout from '@/components/AdminLayout';

export default function AdminSpecLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminLayout>{children}</AdminLayout>;
}
