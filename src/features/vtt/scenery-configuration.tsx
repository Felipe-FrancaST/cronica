'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Modal, Field, Input, Select, ErrorBox, Loading } from '@/components/ui';
import { useCampaignItems } from '@/features/items/use-items';
import { errorMessage } from '@/lib/utils';
import { sceneryLabel } from './scenery';
import {
  CONTAINER_KINDS,
  loadScenerySetup,
  saveSceneryElement,
  type ScenerySetup,
} from './scenery-gameplay';
import type { BattleMapObject } from './types';

export function SceneryConfiguration({
  object,
  campaignId,
  onClose,
  onSaved,
}: {
  object: BattleMapObject;
  campaignId: string;
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
              window.dispatchEvent(new CustomEvent('cronica:items-change', { detail: campaignId }));
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
              Escolha a fechadura e{' '}
              {container
                ? 'o que será revelado ao abrir este recipiente'
                : 'quem poderá abrir esta passagem'}
              . As alterações serão salvas juntas.
            </p>
            {container && (
              <>
                <Field
                  label="Item dentro do recipiente"
                  hint="O nome e as regras ficam ocultos dos jogadores até abrir."
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
                    <option value="">Recipiente vazio</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Quantidade no recipiente">
                  <Input
                    type="number"
                    min={1}
                    max={items.find((i) => i.id === setup.loot_item_id)?.data.charges ? 1 : 9999}
                    step={1}
                    value={setup.quantity}
                    onChange={(e) => change({ quantity: Number(e.target.value) })}
                  />
                </Field>
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
              </>
            )}
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
            <Link href={`/campanhas/${campaignId}/itens`} target="_blank" className="text-link">
              Criar itens e entregar chaves na oficina de Itens ↗
            </Link>
            <small>
              O jogador precisa estar perto do elemento. A chave correta abre a fechadura e
              permanece no inventário. A recompensa só pode ser recolhida uma vez, até o mestre
              repor o conteúdo.
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
