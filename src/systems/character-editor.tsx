'use client';
import type { Character } from '@/types';
import { SheetEditor } from './dnd5e/sheet-editor';
import { Empty } from '@/components/ui';
import dynamic from 'next/dynamic';
import type { ArkanisSheet } from './arkanis/types';
const ArkanisEditor = dynamic(
  () => import('./arkanis/sheet-editor').then((m) => m.ArkanisSheetEditor),
  {
    loading: () => <p className="subtle">Abrindo o dossiê de Arkanis…</p>,
  },
);
export function SystemCharacterEditor({
  slug,
  ...props
}: {
  slug: string;
  character: Character;
  onSaved(): void;
  onCancel(): void;
  readOnly?: boolean;
}) {
  switch (slug) {
    case 'arkanis':
      return (
        <ArkanisEditor
          {...props}
          character={props.character as unknown as Character<ArkanisSheet>}
        />
      );
    case 'dnd5e':
      return <SheetEditor {...props} />;
    default:
      return <Empty title="A ficha deste sistema ainda não está disponível." />;
  }
}
