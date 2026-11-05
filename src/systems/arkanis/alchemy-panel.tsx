'use client';
import { useMemo, useState } from 'react';
import { PotionWorkbench } from './potion-workbench';
import { potionByName } from './potions';
import { FlaskConical, Search, Plus, PackageOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Field, Input, Select, Badge } from '@/components/ui';
import type { InventoryItem } from '../dnd5e/types';
import {
  INGREDIENTS,
  HABITATS,
  availableIngredients,
  ingredientById,
  normalizeSearch,
} from './ingredients';
import type { Ingredient } from './types';

export function IngredientIcon({
  item,
  size = 56,
}: {
  item: { ingredient_id?: string; name: string };
  size?: number;
}) {
  const ingredient = ingredientById(item.ingredient_id);
  const potion = potionByName(item.name);
  if (potion)
    return (
      <img
        src={potion.icon}
        alt=""
        width={size}
        height={size}
        className="arkanis-ingredient-icon"
      />
    );
  return ingredient ? (
    <img
      className="arkanis-ingredient-icon"
      src={ingredient.icon}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
    />
  ) : (
    <span className="arkanis-item-icon" aria-hidden="true">
      <FlaskConical size={size / 2} />
    </span>
  );
}
export function AlchemyPanel({
  inventory,
  onAdd,
  onChange,
  readOnly,
}: {
  inventory: InventoryItem[];
  onChange(items: InventoryItem[]): void;
  onAdd(ingredient: Ingredient, quantity: number): void;
  readOnly: boolean;
}) {
  const [view, setView] = useState<'owned' | 'catalog'>('owned');
  const [query, setQuery] = useState(''),
    [habitat, setHabitat] = useState(''),
    [page, setPage] = useState(0),
    [quantity, setQuantity] = useState(1);
  const owned = availableIngredients(inventory);
  const term = normalizeSearch(query.trim());
  const catalog = useMemo(
    () =>
      INGREDIENTS.filter(
        (i) =>
          (!habitat || i.habitat_id === habitat) &&
          normalizeSearch(`${i.name} ${i.affinities} ${i.habitat}`).includes(term),
      ),
    [habitat, term],
  );
  const visibleOwned = owned.filter((i) => {
    const ref = ingredientById(i.ingredient_id);
    return (
      (!habitat || ref?.habitat_id === habitat) &&
      normalizeSearch(`${i.name} ${i.notes} ${ref?.affinities ?? ''}`).includes(term)
    );
  });
  const pages = Math.max(1, Math.ceil(catalog.length / 24));
  const stock = (id: string) =>
    owned.filter((i) => i.ingredient_id === id).reduce((sum, i) => sum + i.quantity, 0);
  return (
    <section className="arkanis-alchemy">
      <PotionWorkbench inventory={inventory} onChange={onChange} readOnly={readOnly} />
      <header className="arkanis-section-heading">
        <div>
          <span className="arkanis-kicker">A ARTE DE TRANSFORMAR</span>
          <h2>
            <FlaskConical size={23} /> Bancada de poções
          </h2>
          <p>Conheça os ingredientes e abasteça sua bancada.</p>
        </div>
        <Badge>
          {INGREDIENTS.length} ingredientes · {HABITATS.length} habitats
        </Badge>
      </header>
      <div className="arkanis-alchemy-summary">
        <div>
          <strong>{owned.reduce((n, i) => n + i.quantity, 0)}</strong>
          <span>unidades na bolsa</span>
        </div>
        <div>
          <strong>{new Set(owned.map((i) => i.ingredient_id ?? i.id)).size}</strong>
          <span>ingredientes disponíveis</span>
        </div>
        <p>
          Itens com a tag <b>ingredientes</b> e quantidade maior que zero aparecem aqui. As
          afinidades são referências narrativas. Use as receitas da bancada para preparar poções.
        </p>
      </div>
      <div className="arkanis-switch" role="tablist" aria-label="Biblioteca de alquimia">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'owned'}
          onClick={() => setView('owned')}
        >
          Meus ingredientes ({owned.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'catalog'}
          onClick={() => setView('catalog')}
        >
          Catálogo completo ({INGREDIENTS.length})
        </button>
      </div>
      <div className="arkanis-catalog-filters">
        <Field label="Buscar ingrediente ou afinidade">
          <div className="arkanis-search">
            <Search size={17} />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Pérola, cura, floresta…"
              aria-label="Buscar ingrediente ou afinidade"
            />
          </div>
        </Field>
        <Field label="Habitat">
          <Select
            value={habitat}
            onChange={(e) => {
              setHabitat(e.target.value);
              setPage(0);
            }}
            aria-label="Filtrar por habitat"
          >
            <option value="">Todos os habitats</option>
            {HABITATS.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
        </Field>
        {view === 'catalog' && !readOnly && (
          <Field label="Unidades a adicionar">
            <Input
              type="number"
              min={1}
              max={9999}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </Field>
        )}
      </div>
      {view === 'owned' ? (
        <>
          {visibleOwned.length ? (
            <div className="arkanis-ingredient-grid">
              {visibleOwned.map((item) => {
                const ref = ingredientById(item.ingredient_id);
                return (
                  <article className="arkanis-ingredient-card" key={item.id}>
                    <IngredientIcon item={item} />
                    <div>
                      <span className="arkanis-kicker">
                        {ref?.habitat ?? 'Ingrediente personalizado'}
                      </span>
                      <h3>{item.name}</h3>
                      <p>{ref?.affinities ?? item.notes}</p>
                      <Badge tone="green">
                        {item.quantity} {item.quantity === 1 ? 'unidade' : 'unidades'}
                      </Badge>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="arkanis-empty">
              <PackageOpen size={32} />
              <h3>
                {owned.length
                  ? 'Nenhum ingrediente corresponde à busca.'
                  : 'Sua bolsa de ingredientes começa aqui.'}
              </h3>
              <p>
                Explore os habitats e adicione os materiais que seu personagem possui. Você também
                pode marcar um item da bolsa com a tag ingredientes.
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setQuery('');
                  setHabitat('');
                  setView('catalog');
                }}
              >
                Explorar o catálogo
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="subtle" role="status">
            {catalog.length} ingredientes encontrados. Adições são confirmadas ao salvar a ficha.
          </p>
          <div className="arkanis-ingredient-grid">
            {catalog.slice(page * 24, page * 24 + 24).map((i) => (
              <article className="arkanis-ingredient-card" key={i.id}>
                <IngredientIcon item={{ ingredient_id: i.id, name: i.name }} />
                <div>
                  <span className="arkanis-kicker">{i.habitat}</span>
                  <h3>{i.name}</h3>
                  <p>{i.affinities}</p>
                  <div className="arkanis-card-bottom">
                    <small>
                      {stock(i.id) > 0 ? `${stock(i.id)} na bolsa` : 'Ainda não está na bolsa'}
                    </small>
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="secondary"
                        aria-label={`Adicionar ${i.name}`}
                        onClick={() => onAdd(i, quantity)}
                      >
                        <Plus size={14} />
                        Adicionar
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
          {!catalog.length && <p>Nenhum ingrediente encontrado. Tente outro nome ou habitat.</p>}
          <nav className="arkanis-pagination" aria-label="Páginas do catálogo">
            <Button
              type="button"
              variant="ghost"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={16} />
              Anterior
            </Button>
            <span>
              Página {page + 1} de {pages}
            </span>
            <Button
              type="button"
              variant="ghost"
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
              <ChevronRight size={16} />
            </Button>
          </nav>
        </>
      )}
    </section>
  );
}
