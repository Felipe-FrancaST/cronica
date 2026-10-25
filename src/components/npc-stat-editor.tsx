'use client';
import type { Npc } from '@/types';
import { ABILITIES, SKILLS } from '@/systems/dnd5e/catalog';
import { getRace } from '@/systems/dnd5e/ancestries';
import { CONDITION_NAMES, CONDITION_RULES } from '@/systems/dnd5e/conditions';
import type { NpcStatBlock } from '@/systems/dnd5e/npc-stat-block';
import { Field, Input, Select, Textarea } from './ui';

export function NpcStatEditor({
  npc,
  readOnly,
  onChange,
  section,
}: {
  npc: Npc;
  readOnly: boolean;
  onChange(block: NpcStatBlock): void;
  section: 'identity' | 'training' | 'senses';
}) {
  const b = npc.stat_block ?? {},
    race = getRace(npc.race);
  const set = (patch: Partial<NpcStatBlock>) => onChange({ ...b, ...patch });
  const number = (
    label: string,
    value: number | undefined,
    change: (v: number | undefined) => void,
    placeholder = '',
    max = 1000,
  ) => (
    <Field label={label}>
      <Input
        type="number"
        min={label.includes('Bônus') && label !== 'Bônus de proficiência' ? -50 : 0}
        max={max}
        step={label.includes('(m)') ? 0.5 : 1}
        value={value ?? ''}
        placeholder={placeholder}
        disabled={readOnly}
        onChange={(e) => change(e.target.value === '' ? undefined : Number(e.target.value))}
      />
    </Field>
  );
  if (section === 'identity')
    return (
      <div className="form-grid">
        <Field label="Tipo de criatura">
          <Select
            value={b.creature_type ?? 'Humanoide'}
            disabled={readOnly}
            onChange={(e) => set({ creature_type: e.target.value })}
          >
            {[
              'Aberração',
              'Besta',
              'Celestial',
              'Constructo',
              'Corruptor',
              'Dragão',
              'Elemental',
              'Fada',
              'Gigante',
              'Humanoide',
              'Limo',
              'Monstruosidade',
              'Morto-vivo',
              'Planta',
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tamanho">
          <Select
            value={b.size ?? 'Médio'}
            disabled={readOnly}
            onChange={(e) => set({ size: e.target.value as NpcStatBlock['size'] })}
          >
            {['Miúdo', 'Pequeno', 'Médio', 'Grande', 'Enorme', 'Imenso'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </Select>
        </Field>
        <Field label="Alinhamento">
          <Select
            value={b.alignment ?? 'Neutro'}
            disabled={readOnly}
            onChange={(e) => set({ alignment: e.target.value })}
          >
            {[
              'Leal e bom',
              'Neutro e bom',
              'Caótico e bom',
              'Leal e neutro',
              'Neutro',
              'Caótico e neutro',
              'Leal e mau',
              'Neutro e mau',
              'Caótico e mau',
              'Sem alinhamento',
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </Select>
        </Field>
        <Field label="Nível de desafio (ND)" hint="Opcional; independente de nível de classe.">
          <Input
            value={b.challenge ?? ''}
            disabled={readOnly}
            placeholder="Ex.: 1/4, 2, 10"
            maxLength={20}
            onChange={(e) => set({ challenge: e.target.value })}
          />
        </Field>
      </div>
    );
  if (section === 'training')
    return (
      <div className="form-stack">
        {number(
          'Bônus de proficiência',
          b.proficiency,
          (v) => set({ proficiency: v }),
          `Automático: +${2 + Math.floor((Math.min(30, Math.max(1, npc.level)) - 1) / 4)}`,
          10,
        )}
        <details className="panel">
          <summary>Salvaguardas do bloco de estatísticas</summary>
          <p className="subtle">
            Informe o bônus total quando houver. Vazio usa o modificador do atributo.
          </p>
          <div className="form-grid">
            {ABILITIES.map((a) => (
              <div key={a.id}>
                {number(
                  'Bônus de ' + a.label,
                  b.saving_throws?.[a.id],
                  (v) => {
                    const saves = { ...b.saving_throws };
                    if (v === undefined) delete saves[a.id];
                    else saves[a.id] = v;
                    set({ saving_throws: saves });
                  },
                  'Modificador do atributo',
                  50,
                )}
              </div>
            ))}
          </div>
        </details>
        <details className="panel">
          <summary>Perícias do NPC</summary>
          <p className="subtle">Bônus totais do bloco, incluindo proficiência ou especialização.</p>
          <div className="form-grid">
            {[...SKILLS]
              .sort((a, c) => a.label.localeCompare(c.label, 'pt-BR'))
              .map((a) => (
                <div key={a.id}>
                  {number(
                    'Bônus de ' + a.label,
                    b.skills?.[a.id],
                    (v) => {
                      const skills = { ...b.skills };
                      if (v === undefined) delete skills[a.id];
                      else skills[a.id] = v;
                      set({ skills });
                    },
                    'Modificador do atributo',
                    50,
                  )}
                </div>
              ))}
          </div>
        </details>
      </div>
    );
  return (
    <div className="form-stack">
      <section className="panel form-stack">
        <h3>Deslocamento</h3>
        <div className="form-grid">
          {(
            [
              ['walk', 'Caminhada'],
              ['fly', 'Voo'],
              ['swim', 'Natação'],
              ['climb', 'Escalada'],
              ['burrow', 'Escavação'],
            ] as const
          ).map(([id, label]) => (
            <div key={id}>
              {number(
                label + ' (m)',
                b.movement?.[id],
                (v) => set({ movement: { ...b.movement, [id]: v } }),
                id === 'walk' ? String(race?.speed ?? 9) : '0',
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="panel form-stack">
        <h3>Sentidos</h3>
        <p className="subtle">
          Alcances em metros. Os sentidos são usados na visão e nas rolagens do grid.
        </p>
        <div className="form-grid">
          {(
            [
              ['darkvision', 'Visão no escuro'],
              ['blindsight', 'Percepção às cegas'],
              ['devilSight', 'Visão diabólica'],
              ['trueSight', 'Visão verdadeira'],
            ] as const
          ).map(([id, label]) => (
            <div key={id}>
              {number(
                label + ' (m)',
                b.senses?.[id],
                (v) => set({ senses: { ...b.senses, [id]: v } }),
                id === 'darkvision' ? String(race?.darkvision ?? 0) : '0',
              )}
            </div>
          ))}
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={b.senses?.seeInvisible ?? false}
            disabled={readOnly}
            onChange={(e) => set({ senses: { ...b.senses, seeInvisible: e.target.checked } })}
          />
          Enxerga criaturas invisíveis
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={b.senses?.blindBeyond ?? false}
            disabled={readOnly}
            onChange={(e) => set({ senses: { ...b.senses, blindBeyond: e.target.checked } })}
          />
          Naturalmente cego além da percepção às cegas
        </label>
        <Field label="Idiomas">
          <Input
            value={b.languages ?? ''}
            disabled={readOnly}
            onChange={(e) => set({ languages: e.target.value })}
            placeholder="Comum, Dracônico, telepatia…"
          />
        </Field>
      </section>
      <section className="panel form-stack">
        <h3>Imunidades</h3>
        <Field label="Imunidades a dano">
          <Textarea
            value={b.damage_immunities ?? ''}
            disabled={readOnly}
            onChange={(e) => set({ damage_immunities: e.target.value })}
            placeholder="Ex.: fogo, veneno"
          />
        </Field>
        <details>
          <summary>Imunidades a condições</summary>
          <div className="npc-condition-grid">
            {CONDITION_NAMES.map((c) => (
              <label className="check-label" key={c} title={CONDITION_RULES[c]}>
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={b.condition_immunities?.includes(c) ?? false}
                  onChange={(e) =>
                    set({
                      condition_immunities: e.target.checked
                        ? [...(b.condition_immunities ?? []), c]
                        : (b.condition_immunities ?? []).filter((x) => x !== c),
                    })
                  }
                />
                {c}
              </label>
            ))}
          </div>
        </details>
      </section>
    </div>
  );
}
