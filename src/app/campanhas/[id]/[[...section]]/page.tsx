import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { CampaignPage } from '@/components/campaign-page';
import { Loading } from '@/components/ui';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; section?: string[] }>;
}) {
  const p = await params;
  if ((p.section?.length ?? 0) > 1) notFound();
  return (
    <Suspense fallback={<Loading />}>
      <CampaignPage id={p.id} section={p.section?.[0] || ''} />
    </Suspense>
  );
}
