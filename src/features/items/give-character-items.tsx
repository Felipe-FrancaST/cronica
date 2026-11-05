'use client';
import { useRef, useState } from 'react';
import { Gift } from 'lucide-react';
import type { Character } from '@/types';
import { useWorkspace } from '@/hooks/use-workspace';
import { Button, Modal, Field, Input, Select, ErrorBox } from '@/components/ui';
import { useCampaignItems } from './use-items';
import { giveCampaignItem } from './repository';
import { errorMessage } from '@/lib/utils';
export function GiveCharacterItems({
  character,
  onClose,
}: {
  character: Character;
  onClose(): void;
}) {
  const w = useWorkspace();
  const catalog = useCampaignItems(character.campaign_id, w.demo);
  const [query, setQuery] = useState(''),
    [itemId, setItemId] = useState(''),
    [quantity, setQuantity] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const request = useRef({ signature: '', id: '' });
  const items = catalog.items.filter(
    (i) => !i.archived && i.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const item = catalog.items.find((i) => i.id === itemId && !i.archived);
  const lock = useRef(false);
  return (
    <Modal
      open
      title={`Dar itens a ${character.name}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (lock.current || !item) return;
          lock.current = true;
          setBusy(true);
          setError(null);
          const signature = `${item.id}:${item.version}:${quantity}`;
          if (request.current.signature !== signature)
            request.current = { signature, id: crypto.randomUUID() };
          try {
            await giveCampaignItem(item, character.id, quantity, request.current.id, w.demo);
            await w.refresh();
            w.notify(`${quantity} × ${item.name} entregue a ${character.name}.`);
            onClose();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        <ErrorBox message={error || catalog.error} />
        <Field label="Buscar item">
          <Input value={query} disabled={busy} onChange={(e) => setQuery(e.target.value)} />
        </Field>
        <Field label="Item para entregar">
          <Select
            value={itemId}
            disabled={busy || catalog.loading}
            onChange={(e) => setItemId(e.target.value)}
          >
            <option value="">Selecione um item da campanha</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </Field>
        {!catalog.loading && !catalog.items.some((i) => !i.archived) && (
          <p>
            Cadastre os itens e ingredientes na área Itens da campanha para disponibilizá-los aqui.
          </p>
        )}
        {item && <p>{item.data.notes}</p>}
        <Field label="Quantidade entregue">
          <Input
            type="number"
            min={1}
            max={item?.data.charges ? 1 : 9999}
            step={1}
            value={quantity}
            disabled={busy}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </Field>
        <div className="form-actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || !item || catalog.loading}>
            <Gift size={16} /> {busy ? 'Entregando…' : 'Entregar itens'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
