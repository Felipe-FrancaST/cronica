'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Grid3X3, PanelsTopLeft } from 'lucide-react';
import type { Campaign } from '@/types';
import { PageHeading } from '@/components/shell';
import { Loading } from '@/components/ui';
const Grid = dynamic(() => import('@/features/vtt/tactical-table').then((m) => m.TacticalTable), {
  loading: () => <Loading />,
});
const Mural = dynamic(() => import('@/features/mural/mural').then((m) => m.Mural), {
  loading: () => <Loading />,
});
export function MesaPage({ campaign, view }: { campaign: Campaign; view: 'grid' | 'mural' }) {
  return (
    <>
      <PageHeading
        eyebrow={campaign.name}
        title="Mesa"
        description="O campo de batalha e as histórias que seus aventureiros vão descobrir."
      />
      <nav className="mesa-sections" aria-label="Áreas da Mesa">
        <Link
          href={`/campanhas/${campaign.id}/mesa/grid`}
          aria-current={view === 'grid' ? 'page' : undefined}
          className={view === 'grid' ? 'selected' : ''}
        >
          <Grid3X3 size={20} />
          <span>
            <strong>Grid</strong>
            <small>Combate e cenário</small>
          </span>
        </Link>
        <Link
          href={`/campanhas/${campaign.id}/mesa/mural`}
          aria-current={view === 'mural' ? 'page' : undefined}
          className={view === 'mural' ? 'selected' : ''}
        >
          <PanelsTopLeft size={20} />
          <span>
            <strong>Mural</strong>
            <small>Lugares, imagens e personagens</small>
          </span>
        </Link>
      </nav>
      {view === 'grid' ? (
        <Grid key={campaign.id} campaign={campaign} />
      ) : (
        <Mural key={campaign.id} campaign={campaign} />
      )}
    </>
  );
}
