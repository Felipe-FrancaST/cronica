'use client';
import { Plus, Trash2, BookOpen, Swords } from 'lucide-react';
import { Button, Field, Input, Textarea, Select, Badge } from '@/components/ui';
import { uid } from '@/lib/utils';
import { MAGIC_ORDERS } from './rules';
import type {
  ArkanisSheet,
  ArkanisSpell,
  ArkanisTechnique,
  ArkanisWeapon,
  MagicOrder,
} from './types';

const emptyOrder = () => ({
  mana: 0,
  damage: '',
  area: '',
  requirements: '',
  materials: '',
  casting_time: '',
  duration: '',
  effects: '',
});
export function GrimoirePanel({
  sheet,
  onChange,
  readOnly,
}: {
  sheet: ArkanisSheet;
  onChange(changes: Partial<ArkanisSheet>): void;
  readOnly: boolean;
}) {
  const update = (id: string, change: Partial<ArkanisSpell>) =>
    onChange({ grimoire: sheet.grimoire.map((s) => (s.id === id ? { ...s, ...change } : s)) });
  return (
    <section>
      <header className="arkanis-section-heading">
        <div>
          <span className="arkanis-kicker">CONHECIMENTO CONQUISTADO</span>
          <h2>
            <BookOpen size={22} /> Grimório pessoal
          </h2>
          <p>
            Registre o ensino ou grimório de origem, o NA e cada ordem dominada. O aprendizado e a
            progressão são confirmados pelo mestre.
          </p>
        </div>
        {!readOnly && (
          <Button
            type="button"
            onClick={() =>
              onChange({
                grimoire: [
                  ...sheet.grimoire,
                  {
                    id: uid(),
                    name: 'Nova magia',
                    learning_level: 0,
                    source: '',
                    learned: false,
                    highest_order: 'primaria',
                    description: '',
                    orders: { primaria: emptyOrder() },
                  },
                ],
              })
            }
          >
            <Plus size={16} />
            Registrar magia
          </Button>
        )}
      </header>
      {!sheet.grimoire.length && (
        <div className="arkanis-empty">
          <BookOpen size={30} />
          <h3>Seu grimório espera a primeira descoberta.</h3>
          <p>
            Em Arkanis, magia é aprendida com ensino ou acesso a um grimório. Não há espaços de
            magia ou listas de classe.
          </p>
        </div>
      )}
      {sheet.grimoire.map((spell) => (
        <details className="arkanis-record" key={spell.id} open>
          <summary>
            <span>{spell.name}</span>
            <Badge>
              {spell.learned ? 'Aprendida' : 'Em estudo'} · NA {spell.learning_level}
            </Badge>
          </summary>
          <fieldset disabled={readOnly} className="form-stack">
            <div className="arkanis-grid-3">
              <Field label="Nome da magia">
                <Input
                  value={spell.name}
                  maxLength={120}
                  onChange={(e) => update(spell.id, { name: e.target.value })}
                />
              </Field>
              <Field label="Nível de aprendizado (NA)">
                <Input
                  type="number"
                  min={0}
                  max={999}
                  value={spell.learning_level}
                  onChange={(e) => update(spell.id, { learning_level: Number(e.target.value) })}
                />
              </Field>
              <Field label="Maior ordem dominada">
                <Select
                  value={spell.highest_order}
                  onChange={(e) =>
                    update(spell.id, { highest_order: e.target.value as MagicOrder })
                  }
                >
                  {MAGIC_ORDERS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Quem ensinou / grimório de origem">
              <Input
                value={spell.source}
                onChange={(e) => update(spell.id, { source: e.target.value })}
              />
            </Field>
            <label className="arkanis-checkbox">
              <input
                type="checkbox"
                checked={spell.learned}
                onChange={(e) => update(spell.id, { learned: e.target.checked })}
              />
              Aprendizado confirmado na mesa
            </label>
            <Field label="Descrição da magia">
              <Textarea
                value={spell.description}
                onChange={(e) => update(spell.id, { description: e.target.value })}
              />
            </Field>
            <div className="arkanis-orders">
              {MAGIC_ORDERS.map((order) => {
                const data = spell.orders[order.id] ?? emptyOrder();
                const set = (key: keyof typeof data, value: string | number) =>
                  update(spell.id, {
                    orders: { ...spell.orders, [order.id]: { ...data, [key]: value } },
                  });
                return (
                  <details key={order.id} className="arkanis-order">
                    <summary>
                      {order.name}
                      <small>{spell.orders[order.id] ? `${data.mana} Mana` : 'Sem registro'}</small>
                    </summary>
                    <div className="arkanis-grid-3">
                      <Field label={`Mana · ${order.name}`}>
                        <Input
                          type="number"
                          min={0}
                          max={99999}
                          value={data.mana}
                          onChange={(e) => set('mana', Number(e.target.value))}
                        />
                      </Field>
                      <Field label="Dano">
                        <Input
                          value={data.damage}
                          onChange={(e) => set('damage', e.target.value)}
                          placeholder="Conforme o grimório"
                        />
                      </Field>
                      <Field label="Área / alcance">
                        <Input value={data.area} onChange={(e) => set('area', e.target.value)} />
                      </Field>
                      <Field label="Materiais">
                        <Input
                          value={data.materials}
                          onChange={(e) => set('materials', e.target.value)}
                        />
                      </Field>
                      <Field label="Tempo de conjuração">
                        <Input
                          value={data.casting_time}
                          onChange={(e) => set('casting_time', e.target.value)}
                        />
                      </Field>
                      <Field label="Duração">
                        <Input
                          value={data.duration}
                          onChange={(e) => set('duration', e.target.value)}
                        />
                      </Field>
                    </div>
                    <Field label="Requisitos da ordem">
                      <Textarea
                        rows={2}
                        value={data.requirements}
                        onChange={(e) => set('requirements', e.target.value)}
                      />
                    </Field>
                    <Field label="Efeitos especiais">
                      <Textarea
                        rows={2}
                        value={data.effects}
                        onChange={(e) => set('effects', e.target.value)}
                      />
                    </Field>
                  </details>
                );
              })}
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                onChange({ grimoire: sheet.grimoire.filter((s) => s.id !== spell.id) })
              }
            >
              <Trash2 size={15} />
              Remover magia
            </Button>
          </fieldset>
        </details>
      ))}
    </section>
  );
}
export function ArsenalPanel({
  sheet,
  onChange,
  readOnly,
}: {
  sheet: ArkanisSheet;
  onChange(changes: Partial<ArkanisSheet>): void;
  readOnly: boolean;
}) {
  const weapon = (id: string, changes: Partial<ArkanisWeapon>) =>
    onChange({ weapons: sheet.weapons.map((w) => (w.id === id ? { ...w, ...changes } : w)) });
  const technique = (id: string, changes: Partial<ArkanisTechnique>) =>
    onChange({ techniques: sheet.techniques.map((w) => (w.id === id ? { ...w, ...changes } : w)) });
  return (
    <section>
      <header className="arkanis-section-heading">
        <div>
          <span className="arkanis-kicker">TREINO, INSTINTO E DOMÍNIO</span>
          <h2>
            <Swords size={22} /> Arsenal e técnicas
          </h2>
          <p>
            A maestria pertence à arma. Técnicas têm NA e requisitos próprios, sem custo de Mana.
          </p>
        </div>
      </header>
      <div className="arkanis-inline">
        <h3>Maestrias de armas</h3>
        {!readOnly && (
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              onChange({
                weapons: [
                  ...sheet.weapons,
                  {
                    id: uid(),
                    name: 'Nova arma',
                    die: 8,
                    mastery: 1,
                    dice_at_third: null,
                    range: '',
                    requirements: '',
                    notes: '',
                  },
                ],
              })
            }
          >
            <Plus size={16} />
            Registrar arma
          </Button>
        )}
      </div>
      {sheet.weapons.map((w) => (
        <article className="arkanis-record" key={w.id}>
          <fieldset disabled={readOnly} className="form-stack">
            <div className="arkanis-grid-3">
              <Field label="Arma">
                <Input
                  value={w.name}
                  maxLength={120}
                  onChange={(e) => weapon(w.id, { name: e.target.value })}
                />
              </Field>
              <Field label="Dado-base">
                <Select
                  value={w.die}
                  onChange={(e) => weapon(w.id, { die: Number(e.target.value) })}
                >
                  {[4, 6, 8, 10, 12, 20].map((d) => (
                    <option key={d} value={d}>
                      d{d}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Nível de maestria">
                <Select
                  value={w.mastery}
                  onChange={(e) => weapon(w.id, { mastery: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      Maestria {n}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {w.mastery === 3 && (
              <Field
                label="Dados na maestria 3"
                hint="A tabela informa 3 dados, mas o exemplo usa 4. Registre a escolha do mestre."
              >
                <Select
                  value={w.dice_at_third ?? ''}
                  onChange={(e) =>
                    weapon(w.id, {
                      dice_at_third: e.target.value ? (Number(e.target.value) as 3 | 4) : null,
                    })
                  }
                >
                  <option value="">Escolher com o mestre</option>
                  <option value={3}>3 dados (tabela)</option>
                  <option value={4}>4 dados (exemplo)</option>
                </Select>
              </Field>
            )}
            <Badge>
              {w.mastery === 3 ? (w.dice_at_third ?? '?') : [0, 1, 2, 3, 6, 8][w.mastery]}d{w.die}
            </Badge>
            <div className="form-grid">
              <Field label="Alcance">
                <Input value={w.range} onChange={(e) => weapon(w.id, { range: e.target.value })} />
              </Field>
              <Field label="Requisitos / treino aprovado">
                <Input
                  value={w.requirements}
                  onChange={(e) => weapon(w.id, { requirements: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Observações da arma">
              <Textarea
                rows={2}
                value={w.notes}
                onChange={(e) => weapon(w.id, { notes: e.target.value })}
              />
            </Field>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onChange({ weapons: sheet.weapons.filter((a) => a.id !== w.id) })}
            >
              <Trash2 size={15} />
              Remover arma
            </Button>
          </fieldset>
        </article>
      ))}
      <div className="arkanis-inline">
        <h3>Técnicas aprendidas e em estudo</h3>
        {!readOnly && (
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              onChange({
                techniques: [
                  ...sheet.techniques,
                  {
                    id: uid(),
                    name: 'Nova técnica',
                    learning_level: 0,
                    attribute: 'for',
                    source: '',
                    learned: false,
                    requirements: '',
                    description: '',
                  },
                ],
              })
            }
          >
            <Plus size={16} />
            Registrar técnica
          </Button>
        )}
      </div>
      {sheet.techniques.map((t) => (
        <article className="arkanis-record" key={t.id}>
          <fieldset disabled={readOnly} className="form-stack">
            <div className="arkanis-grid-3">
              <Field label="Nome da técnica">
                <Input value={t.name} onChange={(e) => technique(t.id, { name: e.target.value })} />
              </Field>
              <Field label="NA da técnica">
                <Input
                  type="number"
                  min={0}
                  max={999}
                  value={t.learning_level}
                  onChange={(e) => technique(t.id, { learning_level: Number(e.target.value) })}
                />
              </Field>
              <Field label="Atributo de aprendizado">
                <Select
                  value={t.attribute}
                  onChange={(e) => technique(t.id, { attribute: e.target.value as 'for' | 'agi' })}
                >
                  <option value="for">Força</option>
                  <option value="agi">Agilidade</option>
                </Select>
              </Field>
            </div>
            <Field label="Instrutor / experiência / pergaminho">
              <Input
                value={t.source}
                onChange={(e) => technique(t.id, { source: e.target.value })}
              />
            </Field>
            <Field label="Requisitos da técnica">
              <Textarea
                rows={2}
                value={t.requirements}
                onChange={(e) => technique(t.id, { requirements: e.target.value })}
              />
            </Field>
            <Field label="Efeito e ação necessária">
              <Textarea
                value={t.description}
                onChange={(e) => technique(t.id, { description: e.target.value })}
              />
            </Field>
            <label className="arkanis-checkbox">
              <input
                type="checkbox"
                checked={t.learned}
                onChange={(e) => technique(t.id, { learned: e.target.checked })}
              />
              Aprendizado confirmado na mesa
            </label>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                onChange({ techniques: sheet.techniques.filter((a) => a.id !== t.id) })
              }
            >
              <Trash2 size={15} />
              Remover técnica
            </Button>
          </fieldset>
        </article>
      ))}
    </section>
  );
}
