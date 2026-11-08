'use client';
import { useRef, useState } from 'react';
import { FlaskConical, Plus, Sparkles, BookOpen, Leaf, Check, X } from 'lucide-react';
import { Button, Input, Select, Field } from '@/components/ui';
import type { InventoryItem } from '../dnd5e/types';
import { POTIONS, potionByName, potionFor, brewPotion, materialName } from './potions';
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
  const [query, setQuery] = useState(''),
    [stockQuery, setStockQuery] = useState(''),
    [level, setLevel] = useState('');
  const [message, setMessage] = useState(''),
    [last, setLast] = useState<(typeof POTIONS)[number] | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const bench = useRef<HTMLDivElement>(null);
  const materials = inventory.filter(
    (i) => i.quantity > 0 && (isIngredient(i) || potionByName(i.name)),
  );
  const selected = slots.map((id) => materials.find((i) => i.id === id));
  const recipe = selected.every(Boolean) ? potionFor(selected as InventoryItem[]) : undefined;
  const result = recipe ?? (!slots.some(Boolean) ? last : null);
  const available = slots.every(
    (id) =>
      id &&
      materials.some((i) => i.id === id && i.quantity >= slots.filter((s) => s === id).length),
  );
  const filtered = materials.filter((i) =>
    normalizeSearch(i.name).includes(normalizeSearch(stockQuery)),
  );
  const recipes = POTIONS.filter(
    (p) =>
      (!level || String(p.level) === level) &&
      normalizeSearch(`${p.name} ${p.ingredients.join(' ')} ${p.effect}`).includes(
        normalizeSearch(query),
      ),
  );
  function choose(index: number, id: string) {
    if (!readOnly && (!id || materials.some((i) => i.id === id))) {
      setSlots((s) => s.map((v, n) => (n === index ? id : v)));
      setLast(null);
      setMessage('');
    }
  }
  function recipeSlots(p: (typeof POTIONS)[number]) {
    const used: Record<string, number> = {};
    return p.ingredients.map((name) => {
      const found = materials.find(
        (i) =>
          normalizeSearch(materialName(i)) === normalizeSearch(name) &&
          i.quantity > (used[i.id] ?? 0),
      );
      if (found) {
        used[found.id] = (used[found.id] ?? 0) + 1;
        return found.id;
      }
      return '';
    });
  }
  return (
    <section className="ark-lab" aria-label="Preparar poções">
      <header className="ark-lab-heading">
        <div>
          <span className="arkanis-kicker">ALQUIMIA · A ARTE DE TRANSFORMAR</span>
          <h2>Laboratório de poções</h2>
          <p>Dois materiais. Uma nova descoberta.</p>
        </div>
        <span className="ark-lab-seal">
          <FlaskConical size={26} />
        </span>
      </header>
      <div className="ark-lab-grid" ref={bench}>
        <aside className="ark-lab-stock">
          <div className="ark-lab-title">
            <h3>
              <Leaf size={16} /> Sua bolsa
            </h3>
            <small>{materials.length} materiais</small>
          </div>
          <Field label="Buscar na bolsa">
            <Input
              placeholder="Qual material procura?"
              value={stockQuery}
              onChange={(e) => setStockQuery(e.target.value)}
            />
          </Field>
          <p className="ark-lab-help">Arraste para um espaço ou toque para adicionar.</p>
          <div className="ark-lab-materials" aria-label="Materiais disponíveis para arrastar">
            {filtered.map((i) => (
              <button
                type="button"
                key={i.id}
                draggable={!readOnly}
                disabled={readOnly}
                aria-label={`Usar ${i.name}`}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', i.id);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => choose(slots[0] ? 1 : 0, i.id)}
              >
                <IngredientIcon item={i} size={38} />
                <span>
                  {i.name}
                  <small>{potionByName(i.name) ? 'Poção' : 'Ingrediente'}</small>
                </span>
                <b>×{i.quantity}</b>
              </button>
            ))}
            {!filtered.length && (
              <div className="ark-lab-empty">
                <Leaf size={28} />
                <p>
                  {materials.length
                    ? 'Nenhum material encontrado.'
                    : 'Sua bolsa ainda está vazia. Receba materiais do mestre ou use o catálogo abaixo.'}
                </p>
              </div>
            )}
          </div>
        </aside>
        <div className="ark-lab-station">
          <div className="ark-lab-title">
            <span className="arkanis-kicker">01 · COMBINE OS MATERIAIS</span>
            <Button
              type="button"
              variant="ghost"
              disabled={readOnly || !slots.some(Boolean)}
              onClick={() => {
                setSlots(['', '']);
                setLast(null);
                setMessage('');
              }}
            >
              Limpar
            </Button>
          </div>
          <div className="ark-lab-slots">
            {[0, 1].map((index) => (
              <div
                key={index}
                className={`ark-lab-slot ${selected[index] ? 'is-filled' : ''} ${over === index ? 'is-over' : ''}`}
                onDragOver={(e) => {
                  if (!readOnly) {
                    e.preventDefault();
                    setOver(index);
                  }
                }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  choose(index, e.dataTransfer.getData('text/plain'));
                }}
              >
                <div className="ark-lab-socket">
                  {selected[index] ? (
                    <IngredientIcon item={selected[index]!} size={58} />
                  ) : (
                    <Plus size={26} />
                  )}
                </div>
                <Field label={`Ingrediente ${index + 1}`}>
                  <Select
                    disabled={readOnly}
                    value={slots[index]}
                    onChange={(e) => choose(index, e.target.value)}
                  >
                    <option value="">Escolher material</option>
                    {materials.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.quantity})
                      </option>
                    ))}
                  </Select>
                </Field>
                {selected[index] && (
                  <button
                    type="button"
                    className="ark-lab-remove"
                    aria-label={`Remover ingrediente ${index + 1}`}
                    disabled={readOnly}
                    onClick={() => choose(index, '')}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className={`ark-lab-vessel ${recipe ? 'is-ready' : ''}`} aria-hidden="true">
            <span />
            <FlaskConical size={42} />
            <span />
          </div>
          <div
            className={`ark-lab-result ${last && !recipe ? 'is-brewed' : ''}`}
            aria-live="polite"
          >
            {result ? (
              <>
                <img src={result.icon} alt={`Frasco de ${result.name}`} width={66} height={80} />
                <div>
                  <span className="arkanis-kicker">
                    {last && !recipe
                      ? 'PREPARADA · ADICIONADA À BOLSA'
                      : `02 · RESULTADO · NÍVEL ${result.level}`}
                  </span>
                  <h3>{result.name}</h3>
                  <p>{result.effect}</p>
                  <small>
                    <b>Duração:</b> {result.duration}
                    <br />
                    <b>Uso:</b> {result.use}
                  </small>
                </div>
              </>
            ) : (
              <>
                <Sparkles size={30} />
                <div>
                  <span className="arkanis-kicker">02 · RESULTADO</span>
                  <h3>
                    {selected.every(Boolean)
                      ? 'Uma mistura desconhecida'
                      : 'O próximo frasco espera por você'}
                  </h3>
                  <p>
                    {selected.every(Boolean)
                      ? 'Não há receita para esta combinação. Nenhum material será consumido.'
                      : 'Adicione dois materiais para revelar a poção, seu efeito e sua duração.'}
                  </p>
                </div>
              </>
            )}
          </div>
          <Button
            type="button"
            disabled={readOnly || !recipe || !available}
            onClick={() => {
              try {
                onChange(brewPotion(inventory, slots, crypto.randomUUID()));
                setLast(recipe!);
                setSlots(['', '']);
                setMessage('Poção adicionada à bolsa. Salve a ficha para confirmar o preparo.');
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            <FlaskConical size={18} /> Preparar poção
          </Button>
          <p className="ark-lab-confirm" role="status">
            {message ||
              'Usa 1 unidade de cada material e produz 1 poção. Confirme ao salvar a ficha.'}
          </p>
        </div>
      </div>
      <details className="ark-lab-book">
        <summary>
          <BookOpen size={20} />
          <span>
            Livro de receitas<small>Explore combinações e prepare o próximo frasco</small>
          </span>
          <b>{POTIONS.length}</b>
        </summary>
        <div className="ark-lab-book-filters">
          <Field label="Buscar receita">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nome, ingrediente ou efeito…"
            />
          </Field>
          <Field label="Nível da receita">
            <Select value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">Todos</option>
              <option value="1">I · Básicas</option>
              <option value="2">II · Aprimoradas</option>
              <option value="3">III · Superiores</option>
            </Select>
          </Field>
        </div>
        <div className="ark-lab-recipes">
          {recipes.map((p) => {
            const ids = recipeSlots(p),
              ready = ids.every(Boolean);
            return (
              <article key={p.id}>
                <img src={p.icon} alt="" width={44} height={54} />
                <div>
                  <span className="arkanis-kicker">
                    Nível {p.level} {ready ? '· Materiais disponíveis' : ''}
                  </span>
                  <h3>{p.name}</h3>
                  <p>{p.ingredients.join(' + ')}</p>
                  <details>
                    <summary>Ver efeito e uso</summary>
                    <p>{p.effect}</p>
                    <small>
                      Duração: {p.duration}
                      <br />
                      Uso: {p.use}
                    </small>
                  </details>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={readOnly}
                    onClick={() => {
                      setSlots(ids);
                      setLast(null);
                      setMessage(
                        ready
                          ? 'Receita selecionada. Confira os materiais e prepare.'
                          : 'Faltam materiais: ' +
                              p.ingredients.filter((_, i) => !ids[i]).join(', '),
                      );
                      bench.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  >
                    {ready ? <Check size={14} /> : <Plus size={14} />} Selecionar receita
                  </Button>
                </div>
              </article>
            );
          })}
          {!recipes.length && <p>Nenhuma receita encontrada.</p>}
        </div>
      </details>
    </section>
  );
}
