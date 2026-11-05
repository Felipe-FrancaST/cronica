'use client';
import { useState, type FormEvent } from 'react';
import { Button, Field, Input, Select, Textarea, ErrorBox, Modal } from '@/components/ui';
import type { CampaignItem, ItemDefinition } from '@/features/items/types';
import { ingredientItem, INGREDIENTS, isIngredient } from './ingredients';
import { errorMessage, uid } from '@/lib/utils';
import { ImageField } from '@/components/media';
import { uploadImage } from '@/services/storage';
import { newItemDefinition } from '@/features/items/model';

export function ArkanisItemEditor({
  item,
  demo,
  onClose,
  onSave,
}: {
  item: CampaignItem;
  demo: boolean;
  onClose(): void;
  onSave(item: CampaignItem): Promise<void>;
}) {
  const [data, setData] = useState(() => structuredClone(item.data));
  const [visible, setVisible] = useState(item.visible_to_players),
    [notes, setNotes] = useState(item.private_notes ?? '');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [file, setFile] = useState<File | null>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const image_path = file
        ? await uploadImage(file, 'campaigns', item.campaign_id, demo)
        : data.image_path;
      await onSave({
        ...item,
        name: data.name.trim(),
        data: { ...data, name: data.name.trim(), image_path },
        visible_to_players: visible,
        private_notes: notes,
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      wide
      onClose={() => {
        if (!busy) onClose();
      }}
      title={item.version ? 'Editar item de Arkanis' : 'Criar item de Arkanis'}
      description="Objetos da campanha e ingredientes para a bolsa dos aventureiros."
    >
      <form className="form-stack" onSubmit={save}>
        <ErrorBox message={error} />
        <fieldset
          disabled={busy}
          className="form-stack"
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          {!item.version && (
            <Field label="Ingrediente do catálogo">
              <Select
                value={data.ingredient_id ?? ''}
                onChange={(e) => {
                  const ref = INGREDIENTS.find((i) => i.id === e.target.value);
                  if (!ref) {
                    setData(newItemDefinition());
                    return;
                  }
                  const {
                    id: _id,
                    quantity: _quantity,
                    equipped: _equipped,
                    ...definition
                  } = ingredientItem(ref, uid());
                  setData({ ...data, ...definition } as ItemDefinition);
                }}
              >
                <option value="">Criar um objeto personalizado</option>
                {INGREDIENTS.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} · {i.habitat}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Nome do item">
            <Input
              required
              maxLength={100}
              value={data.name}
              readOnly={Boolean(data.ingredient_id)}
              onChange={(e) => setData((v) => ({ ...v, name: e.target.value }))}
            />
          </Field>
          <div className="form-grid">
            <Field label="Tipo">
              <Select
                value={data.category}
                onChange={(e) =>
                  setData((v) => ({
                    ...v,
                    category: e.target.value as ItemDefinition['category'],
                    ...(e.target.value === 'weapon' ? { damage: v.damage || '1d8' } : {}),
                    ...(e.target.value === 'armor'
                      ? { armor_base: v.armor_base ?? 2, armor_type: v.armor_type ?? 'light' }
                      : {}),
                  }))
                }
              >
                {Object.entries({
                  consumable: 'Consumível',
                  potion: 'Poção',
                  gear: 'Equipamento',
                  weapon: 'Arma',
                  armor: 'Armadura',
                  tool: 'Ferramenta',
                  item: 'Outro objeto',
                  treasure: 'Tesouro',
                  container: 'Recipiente',
                  magic: 'Item mágico',
                  focus: 'Foco',
                  ammunition: 'Munição',
                }).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Peso por unidade">
              <Input
                type="number"
                min={0}
                max={99999}
                step="0.01"
                value={data.weight}
                onChange={(e) => setData((v) => ({ ...v, weight: Number(e.target.value) }))}
              />
            </Field>
          </div>
          {data.category === 'weapon' && (
            <Field label="Dano-base da arma">
              <Input
                value={data.damage ?? ''}
                placeholder="1d8"
                onChange={(e) => setData((v) => ({ ...v, damage: e.target.value }))}
              />
            </Field>
          )}
          {data.category === 'armor' && (
            <div className="form-grid">
              <Field label="Valor de armadura (VA)">
                <Input
                  type="number"
                  min={0}
                  max={50}
                  value={data.armor_base ?? 0}
                  onChange={(e) => setData((v) => ({ ...v, armor_base: Number(e.target.value) }))}
                />
              </Field>
              <Field label="Tipo de armadura">
                <Select
                  value={data.armor_type ?? 'light'}
                  onChange={(e) =>
                    setData((v) => ({
                      ...v,
                      armor_type: e.target.value as ItemDefinition['armor_type'],
                    }))
                  }
                >
                  <option value="light">Leve</option>
                  <option value="medium">Média</option>
                  <option value="heavy">Pesada</option>
                  <option value="shield">Escudo</option>
                </Select>
              </Field>
            </div>
          )}
          <label className="check-line">
            <input
              type="checkbox"
              checked={isIngredient(data)}
              onChange={(e) =>
                setData((v) => ({
                  ...v,
                  tags: e.target.checked
                    ? [...v.tags.filter((t) => t !== 'ingredientes'), 'ingredientes']
                    : v.tags.filter((t) => t !== 'ingredientes'),
                }))
              }
            />
            Marcar com a tag ingredientes
          </label>
          <Field label="Descrição e afinidades">
            <Textarea
              rows={4}
              value={data.notes}
              onChange={(e) => setData((v) => ({ ...v, notes: e.target.value }))}
            />
          </Field>
          <ImageField
            value={file}
            current={data.image_path}
            onChange={setFile}
            onError={setError}
            label="Imagem do item"
          />
          <label className="check-line">
            <input
              type="checkbox"
              checked={visible}
              onChange={(e) => setVisible(e.target.checked)}
            />
            Visível aos jogadores
          </label>
          <Field label="Notas privadas do mestre">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </fieldset>
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            Salvar item
          </Button>
        </div>
      </form>
    </Modal>
  );
}
