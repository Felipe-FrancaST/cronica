'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Brand } from '@/components/brand';
import { Tabs } from '@/components/ui';
import { MapAssetLibrary } from './library';
import { ASSET_LABELS, type MapAssetKind } from './types';
export function AdminMapAssets() {
  const [kind, setKind] = useState<MapAssetKind>('symbol');
  return (
    <div className="admin-shell">
      <header className="admin-header">
        <Brand />
        <Link className="button button-secondary" href="/administracao">
          Voltar à administração
        </Link>
      </header>
      <main className="admin-main">
        <div className="page-heading">
          <div>
            <span className="eyebrow">BIBLIOTECA DO SISTEMA</span>
            <h1>Recursos para mapas</h1>
            <p>Publique símbolos, tokens e fundos para os mestres usarem em suas campanhas.</p>
          </div>
        </div>
        <Tabs
          label="Tipos de recurso"
          items={Object.entries(ASSET_LABELS).map(([id, label]) => ({ id, label }))}
          value={kind}
          onChange={(value) => setKind(value as MapAssetKind)}
          idPrefix="asset-kind"
          panelId="asset-panel"
        />
        <section id="asset-panel" role="tabpanel" aria-labelledby={'asset-kind-' + kind}>
          <MapAssetLibrary key={kind} kind={kind} admin />
        </section>
      </main>
    </div>
  );
}
