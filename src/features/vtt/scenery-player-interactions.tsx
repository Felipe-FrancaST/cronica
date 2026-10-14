'use client';
import { useEffect, useRef, useState } from 'react';
import { KeyRound, PackageOpen, Hand, Coins, ScrollText } from 'lucide-react';
import { Button, Modal, Field, Select, ErrorBox, Loading, Badge } from '@/components/ui';
import type { InventoryItem } from '@/systems/dnd5e/types';
import { errorMessage } from '@/lib/utils';
import { sceneryLabel } from './scenery';
import { formatCoins, hasCoins } from '@/systems/dnd5e/currency';
import {
  CONTAINER_KINDS,
  PASSAGE_KINDS,
  LIGHT_KINDS,
  MECHANISM_KINDS,
  REWARD_KINDS,
  playerSceneryAction,
  type SceneryIntent,
} from './scenery-capabilities';
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
  onChanged(contents: SceneryContents, intent: SceneryIntent): Promise<void>;
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
        <p className="subtle">
          Aproxime seu personagem de um tesouro, recipiente, luz ou mecanismo para interagir.
        </p>
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
              {o.metadata.player_interaction === false
                ? 'Controlado pelo mestre'
                : o.metadata.loot_taken && REWARD_KINDS.includes(o.object_type)
                  ? 'Recolhido'
                  : o.metadata.interaction_locked
                    ? 'Trancado'
                    : o.metadata.variant === 'open' || o.metadata.variant === 'iron-open'
                      ? 'Aberto'
                      : [...CONTAINER_KINDS, ...PASSAGE_KINDS].includes(o.object_type)
                        ? 'Fechado'
                        : 'Interagir'}
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
  onChanged(contents: SceneryContents, intent: SceneryIntent): Promise<void>;
}) {
  const [contents, setContents] = useState<SceneryContents | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [key, setKey] = useState(''),
    [reload, setReload] = useState(0);
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
  }, [object.id, reload]);
  async function interact(intent: SceneryIntent) {
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
      if (intent === 'take') request.current = crypto.randomUUID();
      await onChanged(result, intent);
    } catch (e) {
      setError(errorMessage(e));
      if (errorMessage(e).includes('mudou')) setReload((value) => value + 1);
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
  const feminine = PASSAGE_KINDS.includes(object.object_type);
  const current = contents?.object ?? object;
  const action = playerSceneryAction(current);
  const openable = [...CONTAINER_KINDS, ...PASSAGE_KINDS].includes(current.object_type);
  const coins = hasCoins(contents?.coins);
  const reward = !!contents?.loot || coins;
  const enabled = contents?.can_interact !== false;
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
          error ? (
            <div className="form-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  setError(null);
                  setReload((value) => value + 1);
                }}
              >
                Tentar novamente
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Concluir
              </Button>
            </div>
          ) : (
            <Loading />
          )
        ) : (
          <>
            <p role="status">
              {!enabled
                ? 'Este elemento é controlado pelo mestre.'
                : (contents.message ??
                  (openable
                    ? contents.locked
                      ? `${label} ${feminine ? 'trancada' : 'trancado'}. Você precisa da chave correta.`
                      : contents.opened
                        ? `${label} ${feminine ? 'aberta' : 'aberto'}.`
                        : `${label} ${feminine ? 'fechada' : 'fechado'}. Você pode abrir sem chave.`
                    : contents.taken
                      ? 'O conteúdo deste elemento já foi recolhido.'
                      : 'Escolha uma ação para interagir com este elemento.'))}
            </p>
            {contents.locked && enabled && (
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
            {contents.description && (
              <section className="scenery-clue-card" aria-label="Pista revelada">
                <Badge tone="gold">
                  <ScrollText size={14} /> Descoberta
                </Badge>
                <p>{contents.description}</p>
              </section>
            )}
            {reward && (
              <section className="scenery-loot-card">
                {contents.loot && (
                  <>
                    <Badge tone="gold">Item revelado</Badge>
                    <h3>{contents.loot.name}</h3>
                    <p>{contents.loot.data.notes || 'Um tesouro para a sua aventura.'}</p>
                    <small>
                      {contents.loot.quantity} unidade(s) · {contents.loot.data.rarity ?? 'Comum'}
                    </small>
                  </>
                )}
                {coins && (
                  <div className="scenery-coin-reward">
                    <strong>
                      <Coins size={17} /> Moedas encontradas
                    </strong>
                    <p>{formatCoins(contents.coins)}</p>
                    <small>Serão somadas às moedas de {actor.name}, na ficha.</small>
                  </div>
                )}
                <Button
                  disabled={busy || !actor.character_id || !enabled}
                  onClick={() => void interact('take')}
                >
                  <PackageOpen size={16} />{' '}
                  {coins
                    ? contents.loot
                      ? 'Recolher item e moedas'
                      : 'Recolher moedas'
                    : 'Pegar item'}
                </Button>
              </section>
            )}
            {(contents.opened || current.metadata.interaction_revealed === true) &&
              !reward &&
              REWARD_KINDS.includes(current.object_type) && (
                <p className="subtle">
                  {contents.taken
                    ? 'O conteúdo já foi recolhido.'
                    : 'Nenhum item ou moeda para recolher.'}
                </p>
              )}
            <div className="form-actions">
              <Button
                variant="secondary"
                disabled={busy || !enabled}
                onClick={() => void interact(action.intent)}
              >
                {action.label}
              </Button>
              {[...LIGHT_KINDS, ...MECHANISM_KINDS].includes(current.object_type) &&
                current.metadata.has_clue === true &&
                !contents.description && (
                  <Button
                    variant="secondary"
                    disabled={busy || !enabled}
                    onClick={() => void interact('inspect')}
                  >
                    Examinar elemento
                  </Button>
                )}
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
