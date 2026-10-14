'use client';
import { Hand, Move, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { sceneryInteraction, sceneryLabel, sceneryRect } from './scenery';
import type { BattleMapObject } from './types';

export function ScenerySelectionBar({
  object,
  editing,
  moving,
  busy,
  onMove,
  onCancelMove,
  onDelete,
  onInteract,
  onClose,
}: {
  object: BattleMapObject;
  editing: boolean;
  moving: boolean;
  busy: boolean;
  onMove(): void;
  onCancelMove(): void;
  onDelete(): void;
  onInteract(variant: string): void;
  onClose(): void;
}) {
  const rect = sceneryRect(object);
  const interaction = sceneryInteraction(object);
  return (
    <section className="vtt-selected-object-bar" aria-label="Elemento selecionado">
      <div className="vtt-selected-object-info" role="status">
        <strong>{sceneryLabel(object)}</strong>
        <small>
          {moving
            ? 'Toque na célula de destino. Cancelar mantém a posição atual.'
            : editing
              ? `${rect?.width ?? 1} × ${rect?.height ?? 1} células · escolha mover ou excluir`
              : interaction
                ? `Ação disponível: ${interaction.label}`
                : 'Este elemento não possui uma interação disponível.'}
        </small>
      </div>
      <div className="vtt-selected-object-actions">
        {moving ? (
          <Button variant="secondary" disabled={busy} onClick={onCancelMove}>
            Cancelar movimento
          </Button>
        ) : editing ? (
          <>
            <Button disabled={busy} onClick={onMove}>
              <Move size={16} /> Mover elemento selecionado
            </Button>
            <Button variant="danger" disabled={busy} onClick={onDelete}>
              <Trash2 size={16} /> Excluir elemento selecionado
            </Button>
          </>
        ) : (
          <Button
            disabled={busy || !interaction}
            disabledReason={
              !interaction ? 'Este elemento não possui uma interação disponível.' : undefined
            }
            aria-label={`Interagir com ${sceneryLabel(object)}`}
            onClick={() => interaction && onInteract(interaction.variant)}
          >
            <Hand size={16} /> Interagir{interaction ? `: ${interaction.label}` : ''}
          </Button>
        )}
        <Button
          variant="ghost"
          className="vtt-selection-dismiss"
          disabled={busy}
          aria-label="Fechar opções do elemento"
          onClick={onClose}
        >
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}
