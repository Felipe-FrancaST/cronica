import { Suspense } from 'react';
import { Shell } from '@/components/shell';
import { Loading } from '@/components/ui';
import { CharacterCollection } from '@/components/characters';
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Shell>
        <CharacterCollection />
      </Shell>
    </Suspense>
  );
}
