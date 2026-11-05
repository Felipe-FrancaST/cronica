'use client';
import { useState } from 'react';
import { FlaskConical, Plus, ArrowRight } from 'lucide-react';
import { Button, Input, Select, Field } from '@/components/ui';
import type { InventoryItem } from '../dnd5e/types';
import { POTIONS, potionByName, potionFor, brewPotion } from './potions';
import { isIngredient, normalizeSearch } from './ingredients';
import { IngredientIcon } from './alchemy-panel';

export function PotionWorkbench({
  inventory,
  onChange,
  readOnly,
}: {
  inventory: InventoryItem[];
  onChange(items: InventoryItem[]): void;
  readOnly: boolean;
}) {
  const [slots, setSlots] = useState(['', '']);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const materials = inventory.filter(
    (i) => i.quantity > 0 && (isIngredient(i) || potionByName(i.name)),
  );
  const selected = slots.map((id) => materials.find((i) => i.id === id));
  const recipe = selected.every(Boolean) ? potionFor(selected as InventoryItem[]) : undefined;
  const available = slots.every(
    (id) =>
      id &&
      materials.some((i) => i.id === id && i.quantity >= slots.filter((s) => s === id).length),
  );
  const choose = (index: number, id: string) => {
    if (!readOnly && (!id || materials.some((i) => i.id === id)))
      setSlots((s) => s.map((v, n) => (n === index ? id : v)));
  };
  return (
    <section className="arkanis-workbench" aria-label="Preparar poções">
      <header>
        <span className="arkanis-kicker">LABORATÓRIO ALQUÍMICO</span>
        <h2>
          <FlaskConical /> A transformação começa aqui
        </h2>
        <p>
          Arraste os materiais da bolsa ou selecione nos espaços. Cada preparo usa uma unidade de
          cada material e produz uma poção.
        </p>
      </header>
      <div className="arkanis-mixing">
        {[0, 1].map((index) => (
          <div
            className="arkanis-slot"
            key={index}
            onDragOver={(e) => {
              if (!readOnly) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              choose(index, e.dataTransfer.getData('text/plain'));
            }}
          >
            {selected[index] ? (
              <IngredientIcon item={selected[index]!} size={56} />
            ) : (
              <Plus size={30} aria-hidden="true" />
            )}
            <Field label={`Ingrediente ${index + 1}`}>
              <Select
                disabled={readOnly}
                value={slots[index]}
                onChange={(e) => choose(index, e.target.value)}
              >
                <option value="">Arraste ou selecione</option>
                {materials.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.quantity})
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              type="button"
              variant="ghost"
              disabled={readOnly || !slots[index]}
              onClick={() => choose(index, '')}
            >
              Remover
            </Button>
          </div>
        ))}
        <div className="arkanis-result" aria-live="polite">
          {recipe ? (
            <>
              <img src={recipe.icon} alt={`Frasco de ${recipe.name}`} width={64} height={76} />
              <span className="arkanis-kicker">NÍVEL {recipe.level}</span>
              <h3>{recipe.name}</h3>
              <p>{recipe.effect}</p>
              <small>
                Duração: {recipe.duration}
                <br />
                Uso: {recipe.use}
              </small>
            </>
          ) : (
            <>
              <FlaskConical size={40} />
              <h3>Resultado</h3>
              <p>
                {selected.every(Boolean)
                  ? 'Combinação sem receita. Seus materiais serão preservados.'
                  : 'Escolha dois materiais para descobrir a poção.'}
              </p>
            </>
          )}
        </div>
      </div>
      <Button
        type="button"
        disabled={readOnly || !recipe || !available}
        onClick={() => {
          try {
            const next = brewPotion(inventory, slots, crypto.randomUUID());
            onChange(next);
            setSlots(['', '']);
            setMessage(
              `${recipe!.name} preparada! Salve a ficha para confirmar o consumo e o resultado na bolsa.`,
            );
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        <FlaskConical size={18} /> Preparar poção
      </Button>
      <p role="status">
        {message ||
          'O preparo será confirmado ao salvar a ficha. Efeitos e uso são resolvidos pela mesa.'}
      </p>
      <div className="arkanis-materials" aria-label="Materiais disponíveis para arrastar">
        {materials.map((i) => (
          <button
            type="button"
            key={i.id}
            draggable={!readOnly}
            disabled={readOnly}
            onDragStart={(e) => e.dataTransfer.setData('text/plain', i.id)}
            onClick={() => choose(slots[0] ? 1 : 0, i.id)}
          >
            <IngredientIcon item={i} size={32} />
            <span>
              {i.name}
              <small>{i.quantity} na bolsa</small>
            </span>
          </button>
        ))}
        {!materials.length && (
          <p>A bolsa está vazia. Adicione ingredientes no catálogo ou receba-os do mestre.</p>
        )}
      </div>
      <details className="arkanis-record">
        <summary>Livro de receitas · {POTIONS.length} poções</summary>
        <Field label="Buscar receita">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nome, ingrediente ou efeito…"
          />
        </Field>
        <div className="arkanis-recipes">
          {POTIONS.filter((p) =>
            normalizeSearch(`${p.name} ${p.ingredients.join(' ')} ${p.effect}`).includes(
              normalizeSearch(query),
            ),
          ).map((p) => (
            <article key={p.id}>
              <img src={p.icon} alt="" width={42} height={52} />
              <div>
                <span className="arkanis-kicker">Nível {p.level}</span>
                <h3>{p.name}</h3>
                <p>{p.ingredients.join(' + ')}</p>
                <small>
                  {p.effect}
                  <br />
                  Duração: {p.duration}
                  <br />
                  Uso: {p.use}
                </small>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={readOnly}
                  onClick={() => {
                    const ids = p.ingredients.map(
                      (name) =>
                        materials.find((i) => normalizeSearch(i.name) === normalizeSearch(name))
                          ?.id ?? '',
                    );
                    setSlots(ids);
                    setMessage(
                      ids.every(Boolean)
                        ? 'Receita selecionada. Confira e prepare.'
                        : 'Faltam materiais na bolsa para esta receita.',
                    );
                  }}
                >
                  Selecionar receita <ArrowRight size={14} />
                </Button>
              </div>
            </article>
          ))}
        </div>
      </details>
    </section>
  );
}
