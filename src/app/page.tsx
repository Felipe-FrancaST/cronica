import { Suspense } from 'react';
import { Dashboard } from '@/components/dashboard';
import { Loading } from '@/components/ui';
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Dashboard />
    </Suspense>
  );
}
