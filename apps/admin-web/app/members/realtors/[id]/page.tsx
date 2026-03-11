import RealtorDetailClient from './RealtorDetailClient';

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RealtorDetailClient id={id} />;
}
