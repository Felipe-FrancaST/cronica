'use client';
import { useEffect, useRef, useState } from 'react';
import { KeyRound, PackageOpen, Hand } from 'lucide-react';
import { Button, Modal, Field, Select, ErrorBox, Loading, Badge } from '@/components/ui';
import type { InventoryItem } from '@/systems/dnd5e/types';
import { errorMessage } from '@/lib/utils';
import { sceneryLabel } from './scenery';
import {
  configurableScenery,
  withinSceneryReach,
  getSceneryContents,
  playerSceneryInteraction,
  type SceneryContents,
} from './scenery-gameplay';
import type { BattleMapObject, BattleToken } from './types';

export function SceneryPlayerInteractions({
  objects,
  actor,
  inventory,
  busy,
  onChanged,
  onPick,
  selecting,
  focusObject,
  onFocusHandled,
}: {
  objects: BattleMapObject[];
  actor: BattleToken | null;
  inventory: InventoryItem[];
  busy: boolean;
  onChanged(): Promise<void>;
  onPick(): void;
  selecting: boolean;
  focusObject: BattleMapObject | null;
  onFocusHandled(): void;
}) {
  const nearby = actor
    ? objects.filter(
        (o) => o.visible && configurableScenery(o.object_type) && withinSceneryReach(o, actor),
      )
    : [];
  const [selected, setSelected] = useState<BattleMapObject | null>(null);
  useEffect(() => setSelected(null), [actor?.id, actor?.map_id]);
  useEffect(() => {
    if (focusObject) {
      setSelected(focusObject);
      onFocusHandled();
    }
  }, [focusObject?.id]);
  if (!actor) return null;
  return (
    <section className="scenery-player-panel" aria-label="Elementos próximos">
      <strong>
        <Hand size={16} /> Interagir com elementos próximos
      </strong>
      <Button
        variant={selecting ? 'gold' : 'secondary'}
        disabled={busy}
        aria-pressed={selecting}
        onClick={onPick}
      >
        {selecting ? 'Voltar a mover personagem' : 'Selecionar elemento no Grid'}
      </Button>
      {!nearby.length && (
        <p className="subtle">Aproxime seu personagem de um baú ou passagem para interagir.</p>
      )}
      <div className="scenery-player-list">
        {nearby.map((o) => (
          <Button
            key={o.id}
            variant="secondary"
            disabled={busy}
            aria-label={`Interagir com ${sceneryLabel(o)}`}
            onClick={() => setSelected(o)}
          >
            {o.metadata.interaction_locked ? <KeyRound size={15} /> : <PackageOpen size={15} />}{' '}
            {sceneryLabel(o)}
            <small>
              {o.metadata.interaction_locked
                ? 'Trancado'
                : o.metadata.variant === 'open' || o.metadata.variant === 'iron-open'
                  ? 'Aberto'
                  : 'Fechado'}
            </small>
          </Button>
        ))}
      </div>
      {selected && (
        <SceneryInteractionDialog
          key={`${selected.id}:${actor.id}`}
          object={selected}
          actor={actor}
          inventory={inventory}
          onClose={() => setSelected(null)}
          onChanged={onChanged}
        />
      )}
    </section>
  );
}
function SceneryInteractionDialog({
  object,
  actor,
  inventory,
  onClose,
  onChanged,
}: {
  object: BattleMapObject;
  actor: BattleToken;
  inventory: InventoryItem[];
  onClose(): void;
  onChanged(): Promise<void>;
}) {
  const [contents, setContents] = useState<SceneryContents | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [key, setKey] = useState('');
  const request = useRef(crypto.randomUUID());
  const keys = inventory.filter(
    (i) => i.quantity > 0 && i.campaign_item_id && i.tags?.includes('chave'),
  );
  useEffect(() => {
    let alive = true;
    void getSceneryContents(object.id)
      .then((c) => {
        if (alive) setContents(c);
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [object.id]);
  async function interact(intent: 'open' | 'close' | 'take') {
    if (busy || !contents) return;
    setBusy(true);
    setError(null);
    try {
      const result = await playerSceneryInteraction(
        contents.object,
        actor.id,
        intent,
        key || null,
        request.current,
      );
      setContents(result);
      await onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const label =
    object.object_type === 'chest'
      ? 'Baú'
      : object.object_type === 'door'
        ? 'Porta'
        : sceneryLabel(object);
  return (
    <Modal
      open
      title={`Interagir com ${sceneryLabel(object)}`}
      onClose={() => {
        if (!busy) onClose();
      }}
      portalContainer={
        typeof document !== 'undefined'
          ? (document.fullscreenElement as HTMLElement | null)
          : undefined
      }
    >
      <div className="form-stack">
        <ErrorBox message={error} />
        {!contents ? (
          <Loading />
        ) : (
          <>
            <p role="status">
              {contents.message ??
                (contents.locked
                  ? `${label} ${object.object_type === 'door' ? 'trancada' : 'trancado'}. Você precisa da chave correta.`
                  : contents.opened
                    ? `${label} aberto.`
                    : `${label} fechado. Você pode abrir sem chave.`)}
            </p>
            {contents.locked && (
              <Field label="Chave do inventário">
                <Select value={key} onChange={(e) => setKey(e.target.value)} disabled={busy}>
                  <option value="">Sem chave selecionada</option>
                  {keys.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {contents.loot && (
              <section className="scenery-loot-card">
                <Badge tone="gold">Item revelado</Badge>
                <h3>{contents.loot.name}</h3>
                <p>{contents.loot.data.notes || 'Um tesouro para a sua aventura.'}</p>
                <small>
                  {contents.loot.quantity} unidade(s) · {contents.loot.data.rarity ?? 'Comum'}
                </small>
                <Button
                  disabled={busy || !actor.character_id}
                  onClick={() => void interact('take')}
                >
                  <PackageOpen size={16} /> Pegar item
                </Button>
              </section>
            )}
            {contents.opened && !contents.loot && (
              <p className="subtle">
                {contents.taken ? 'O conteúdo já foi recolhido.' : 'Nenhum item para recolher.'}
              </p>
            )}
            <div className="form-actions">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void interact(contents.opened ? 'close' : 'open')}
              >
                {contents.opened
                  ? 'Fechar elemento'
                  : contents.locked
                    ? 'Usar chave e abrir'
                    : 'Abrir elemento'}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={onClose}>
                Concluir
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
