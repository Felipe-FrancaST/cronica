'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Button,
  Modal,
  Field,
  Input,
  Select,
  Textarea,
  ErrorBox,
  Loading,
  Badge,
} from '@/components/ui';
import { useCampaignItems } from '@/features/items/use-items';
import { COIN_TYPES, MAX_REWARD_COINS, emptyCurrency } from '@/systems/dnd5e/currency';
import { errorMessage } from '@/lib/utils';
import { sceneryLabel } from './scenery';
import { loadScenerySetup, saveSceneryElement, type ScenerySetup } from './scenery-gameplay';
import {
  CONTAINER_KINDS,
  PASSAGE_KINDS,
  REWARD_KINDS,
  MECHANISM_KINDS,
  LIGHT_KINDS,
} from './scenery-capabilities';
import type { BattleMapObject } from './types';

export function SceneryConfiguration({
  object,
  campaignId,
  objects,
  onClose,
  onSaved,
}: {
  object: BattleMapObject;
  campaignId: string;
  objects: BattleMapObject[];
  onClose(): void;
  onSaved(object: BattleMapObject, message: string): Promise<void>;
}) {
  const catalog = useCampaignItems(campaignId, false);
  const [setup, setSetup] = useState<ScenerySetup | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void loadScenerySetup(object)
      .then((s) => {
        if (alive) setSetup(s);
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [object.id]);
  const change = (values: Partial<ScenerySetup>) =>
    setSetup((old) => (old ? { ...old, ...values } : old));
  const items = catalog.items.filter((i) => !i.archived || i.id === setup?.loot_item_id);
  const container = CONTAINER_KINDS.includes(object.object_type);
  const rewards = REWARD_KINDS.includes(object.object_type);
  const lockable = container || PASSAGE_KINDS.includes(object.object_type);
  const mechanism = MECHANISM_KINDS.includes(object.object_type);
  const targets = objects.filter(
    (o) =>
      o.id !== object.id &&
      o.map_id === object.map_id &&
      [...PASSAGE_KINDS, ...LIGHT_KINDS].includes(o.object_type),
  );
  return (
    <Modal
      open
      wide
      title={`Configurar ${sceneryLabel(object)}`}
      onClose={() => {
        if (!busy) onClose();
      }}
      portalContainer={
        typeof document !== 'undefined'
          ? (document.fullscreenElement as HTMLElement | null)
          : undefined
      }
    >
      <ErrorBox message={error ?? catalog.error} />
      {!setup ? (
        <Loading />
      ) : (
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError(null);
            try {
              const result = await saveSceneryElement(object, setup);
              if (result.key_item_id)
                window.dispatchEvent(
                  new CustomEvent('cronica:items-change', { detail: campaignId }),
                );
              await onSaved(result.object, result.message);
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy} className="item-form-fields form-stack">
            <p className="subtle">
              {container
                ? 'Defina o que será revelado ao abrir este recipiente.'
                : rewards
                  ? 'Prepare itens e moedas para serem descobertos ao examinar este elemento.'
                  : mechanism
                    ? 'Conecte o mecanismo a uma passagem ou luz para criar um desafio no mapa.'
                    : 'Defina o que os jogadores descobrem ao interagir com este elemento.'}
            </p>
            <label className="vtt-check">
              <input
                type="checkbox"
                checked={setup.player_enabled !== false}
                onChange={(e) => change({ player_enabled: e.target.checked })}
              />
              Permitir interação dos jogadores
            </label>
            {rewards && (
              <section className="scenery-config-section" aria-label="Recompensa do elemento">
                <h3>Recompensa</h3>
                {setup.taken && (
                  <p role="status">
                    <Badge tone="muted">Conteúdo recolhido</Badge> Marque a reposição abaixo para
                    disponibilizar uma nova recompensa.
                  </p>
                )}
                <Field
                  label={container ? 'Item dentro do recipiente' : 'Item para recolher'}
                  hint={
                    container
                      ? 'O nome e as regras ficam ocultos dos jogadores até abrir.'
                      : 'O nome e as regras ficam ocultos até examinar ou procurar recursos.'
                  }
                >
                  <Select
                    value={setup.loot_item_id ?? ''}
                    onChange={(e) =>
                      change({
                        loot_item_id: e.target.value || null,
                        loot_version: items.find((i) => i.id === e.target.value)?.version,
                      })
                    }
                  >
                    <option value="">Sem item</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                {setup.loot_item_id && (
                  <Field label={container ? 'Quantidade no recipiente' : 'Quantidade do item'}>
                    <Input
                      type="number"
                      min={1}
                      max={items.find((i) => i.id === setup.loot_item_id)?.data.charges ? 1 : 9999}
                      step={1}
                      value={setup.quantity}
                      onChange={(e) => change({ quantity: Number(e.target.value) })}
                    />
                  </Field>
                )}
                <fieldset className="scenery-coins-fields">
                  <legend>Moedas da recompensa</legend>
                  <p className="subtle">
                    Combine as cinco moedas da ficha. Ao recolher, cada quantia é somada à mesma
                    denominação.
                  </p>
                  <div className="scenery-coins-grid">
                    {COIN_TYPES.map(({ id, name, short }) => (
                      <Field key={id} label={`${name} (${short})`}>
                        <Input
                          type="number"
                          min={0}
                          max={MAX_REWARD_COINS}
                          step={1}
                          value={setup.coins?.[id] ?? 0}
                          onChange={(e) =>
                            change({
                              coins: {
                                ...(setup.coins ?? emptyCurrency()),
                                [id]: Number(e.target.value),
                              },
                            })
                          }
                        />
                      </Field>
                    ))}
                  </div>
                </fieldset>
                {setup.taken && (
                  <label className="vtt-check">
                    <input
                      type="checkbox"
                      checked={setup.refill}
                      onChange={(e) => change({ refill: e.target.checked })}
                    />{' '}
                    Repor o conteúdo já recolhido
                  </label>
                )}
                <small>
                  A coleta entrega o item e todas as moedas juntos, uma única vez. A recompensa vai
                  para a ficha do personagem que a recolher.
                </small>
              </section>
            )}
            {mechanism && (
              <section className="scenery-config-section">
                <h3>Ligação do mecanismo</h3>
                <Field
                  label="Controlar elemento"
                  hint="Acionar abre a passagem (inclusive sua fechadura) ou acende a luz; repor fecha ou apaga. Tudo é desfeito se houver um personagem bloqueando a passagem."
                >
                  <Select
                    value={setup.linked_object_id ?? ''}
                    onChange={(e) => change({ linked_object_id: e.target.value || null })}
                  >
                    <option value="">Sem ligação: somente estado e mensagem</option>
                    {targets.map((o) => (
                      <option key={o.id} value={o.id}>
                        {sceneryLabel(o)} · {String(o.geometry.x)}, {String(o.geometry.y)}
                        {!o.visible ? ' · oculto' : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
              </section>
            )}
            <section className="scenery-config-section">
              <h3>Pista ou descrição</h3>
              <Field
                label="Texto ao interagir"
                hint="Pode ser uma inscrição, pista, descrição de recursos ou resposta do mecanismo. Só é revelado ao abrir ou examinar; escreva aqui apenas o texto destinado aos jogadores."
              >
                <Textarea
                  rows={4}
                  maxLength={4000}
                  value={setup.discovery_text ?? ''}
                  placeholder="Ex.: A inscrição diz: siga a luz azul até a cripta…"
                  onChange={(e) => change({ discovery_text: e.target.value })}
                />
              </Field>
            </section>
            {lockable && (
              <section className="scenery-config-section">
                <h3>Fechadura</h3>
                <label className="vtt-check">
                  <input
                    type="checkbox"
                    checked={setup.requires_key}
                    onChange={(e) =>
                      change({ requires_key: e.target.checked, locked: e.target.checked })
                    }
                  />{' '}
                  Exigir chave para abrir
                </label>
                {setup.requires_key && (
                  <>
                    <Field
                      label="Nome da chave"
                      hint="A chave será criada automaticamente na seção Itens; você poderá entregá-la a um personagem."
                    >
                      <Input
                        required
                        maxLength={100}
                        value={setup.key_name}
                        onChange={(e) => change({ key_name: e.target.value })}
                      />
                    </Field>
                    <label className="vtt-check">
                      <input
                        type="checkbox"
                        checked={setup.locked}
                        onChange={(e) => change({ locked: e.target.checked })}
                      />{' '}
                      Manter trancado ao salvar
                    </label>
                  </>
                )}
              </section>
            )}
            {(rewards || lockable) && (
              <Link href={`/campanhas/${campaignId}/itens`} target="_blank" className="text-link">
                Criar itens e entregar chaves na oficina de Itens ↗
              </Link>
            )}
            <small>
              O jogador precisa estar perto do elemento e respeitar o turno do personagem durante o
              combate.
              {lockable && ' A chave correta abre a fechadura e permanece no inventário.'}
            </small>
          </fieldset>
          <div className="form-actions">
            <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy || catalog.loading}>
              {busy ? 'Salvando…' : 'Salvar elemento'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
