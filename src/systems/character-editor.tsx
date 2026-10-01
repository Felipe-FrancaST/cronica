'use client';
import type { Character } from '@/types';
import { SheetEditor } from './dnd5e/sheet-editor';
import { Empty } from '@/components/ui';
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
    case 'dnd5e':
      return <SheetEditor {...props} />;
    default:
      return <Empty title="A ficha deste sistema ainda não está disponível." />;
  }
}
