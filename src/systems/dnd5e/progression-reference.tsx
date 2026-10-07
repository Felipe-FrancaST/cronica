'use client';
import { useState } from 'react';
import { combatApplication } from './combat-features';
import { Badge, Field, Select } from '@/components/ui';
import { ABILITIES, CLASSES, SKILLS } from './catalog';
import {
  classFeatures,
  pathsFor,
  CLASS_TRAINING,
  MULTICLASS_REQUIREMENTS,
  featureChoices,
} from './progression-catalog';
import { BACKGROUNDS, POINT_COST, STANDARD_ARRAY } from './creation';

export function ProgressionReference() {
  const [id, setId] = useState('fighter'),
    [sub, setSub] = useState('champion');
  const c = CLASSES[id];
  return (
    <section className="panel progression-reference">
      <h2>Progressão, caminhos e escolhas</h2>
      <div className="form-grid">
        <Field label="Classe da progressão">
          <Select
            value={id}
            onChange={(e) => {
              setId(e.target.value);
              setSub(pathsFor(e.target.value)[0]?.id ?? '');
            }}
          >
            {Object.values(CLASSES).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Caminho da progressão">
          <Select value={sub} onChange={(e) => setSub(e.target.value)}>
            <option value="">Sem caminho</option>
            {pathsFor(id).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.source}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <p>
        Dados de Vida d{c.hitDie} · salvaguardas iniciais{' '}
        {c.saves.map((a) => ABILITIES.find((x) => x.id === a)?.label).join(' e ')}.
      </p>
      <p className="subtle">
        Treinamento inicial: {CLASS_TRAINING[id].initial.join(' · ')}. Ao entrar por multiclasse:{' '}
        {CLASS_TRAINING[id].multi.join(' · ') || 'nenhuma proficiência adicional'}.
      </p>
      <div className="feature-timeline">
        {[...classFeatures(id), ...(pathsFor(id).find((p) => p.id === sub)?.features ?? [])]
          .sort((a, b) => a.level - b.level)
          .map((f, i) => (
            <details key={`${f.id}-${i}`}>
              <summary>
                <Badge tone="muted">Nv. {f.level}</Badge>
                {f.name}
              </summary>
              <p>{f.description}</p>
              <small className="feature-application">{combatApplication(f.name)}</small>
            </details>
          ))}
      </div>
      <h3>Escolhas até o nível 20</h3>
      {featureChoices(id, 20, sub).map((ch) => (
        <details key={ch.id}>
          <summary>
            {ch.name} · {ch.count} escolha(s), a partir do nível {ch.level}
          </summary>
          <dl className="builder-option-reference">
            {ch.options.map((o) => (
              <div key={o.id}>
                <dt>
                  {o.name}
                  {o.level ? ` · nível ${o.level}` : ''}
                  {o.pact ? ' · exige pacto' : ''}
                </dt>
                <dd>{o.description}</dd>
              </div>
            ))}
          </dl>
        </details>
      ))}
      <small className="subtle">
        As 12 classes do SRD têm habilidades e um caminho de referência. Artífice e opções
        adicionais usam o livro da mesa; caminhos personalizados podem ser registrados na ficha.
      </small>
    </section>
  );
}
export function BackgroundReference() {
  return (
    <div className="reference-grid">
      {BACKGROUNDS.map((b) => (
        <section className="panel reference-card" key={b.id}>
          <div className="panel-heading">
            <h3>{b.name}</h3>
            <Badge>{b.gp} PO</Badge>
          </div>
          <p>
            <strong>{b.feature}</strong> · {b.description}
          </p>
          <dl className="spell-facts">
            <div>
              <dt>Perícias</dt>
              <dd>
                {b.skills.map((id) => SKILLS.find((s) => s.id === id)?.label).join(', ') ||
                  'Duas à escolha'}
              </dd>
            </div>
            <div>
              <dt>Idiomas e ferramentas</dt>
              <dd>
                {b.languages} idiomas à escolha · {b.tools.join(', ')}
                {b.toolChoices ? ` · ${b.toolChoices} ferramentas à escolha` : ''}
              </dd>
            </div>
            <div>
              <dt>Equipamento</dt>
              <dd>{b.items.join(', ') || 'Acordado com o mestre'}</dd>
            </div>
          </dl>
          <small className="subtle">{b.source}</small>
        </section>
      ))}
    </div>
  );
}
export function CreationReference() {
  return (
    <div className="form-stack">
      <section className="panel">
        <h2>Atributos e criação</h2>
        <p>
          Conjunto padrão: {STANDARD_ARRAY.join(', ')}. Distribua cada resultado em um atributo,
          antes dos bônus de origem.
        </p>
        <p>
          Rolagem: seis resultados de 4d6, somando os três maiores dados de cada grupo. Os dados
          descartados e os resultados são registrados.
        </p>
        <p>Compra de pontos: 27 pontos, valores entre 8 e 15 antes dos bônus de origem.</p>
        <div className="table-scroll">
          <table>
            <caption>Custo dos atributos</caption>
            <thead>
              <tr>
                <th>Valor</th>
                {Object.keys(POINT_COST).map((n) => (
                  <th key={n}>{n}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Pontos</th>
                {Object.entries(POINT_COST).map(([n, c]) => (
                  <td key={n}>{c}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Em 2014, o antecedente concede treinamento, equipamentos e uma habilidade narrativa; os
          aumentos iniciais de atributo vêm da origem. Melhorias de +2 ou +1/+1 são obtidas no nível
          de cada classe, com limite 20.
        </p>
      </section>
      <section className="panel">
        <h2>Regras de multiclasse</h2>
        <p>
          Nível total = soma dos níveis das classes, até 20. Proficiência, experiência e evolução de
          truques usam o total; habilidades, escolhas, círculo aprendido e magias
          preparadas/conhecidas usam o nível da respectiva classe.
        </p>
        <p>
          É preciso cumprir os atributos mínimos tanto das classes atuais como da nova classe. Só a
          primeira classe fornece salvaguardas e equipamento inicial. Dados de Vida são separados
          por classe; apenas o primeiro nível do personagem recebe o dado máximo.
        </p>
        <div className="table-scroll">
          <table>
            <caption>Pré-requisitos · atributo mínimo 13</caption>
            <thead>
              <tr>
                <th>Classe</th>
                <th>Atributos</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(CLASSES).map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>
                    {MULTICLASS_REQUIREMENTS[c.id]
                      .map((group) =>
                        group.map((a) => ABILITIES.find((x) => x.id === a)?.label).join(' ou '),
                      )
                      .join(' e ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Com duas classes com Conjuração, os espaços comuns usam: níveis completos de bardo,
          clérigo, druida, feiticeiro e mago; metade arredondada para baixo de paladino e
          patrulheiro; um terço arredondado para baixo dos arquétipos arcanos. Artífice usa metade
          arredondada para cima. Com apenas uma classe com Conjuração, use sua progressão normal.
        </p>
        <p>
          Pacto do bruxo mantém uma reserva separada, recuperada em descanso curto. As duas reservas
          podem conjurar magias conhecidas/preparadas das classes. Um espaço superior permite elevar
          uma magia aprendida, sem conceder acesso a novas magias desse círculo.
        </p>
        <p>
          Ataque Extra não soma entre classes. Canalizar Divindade compartilha a reserva, usando o
          maior número de usos disponível. Defesa sem Armadura não é obtida novamente se já foi
          adquirida.
        </p>
      </section>
      <section className="panel">
        <h3>Fontes da referência</h3>
        <p>
          SRD 5.1 e Regras Básicas de 2014. Resumos em português; suplementos não incluídos podem
          ser registrados como opções personalizadas.
        </p>
        <p>
          <a href="https://www.dndbeyond.com/srd" target="_blank" rel="noreferrer">
            SRD oficial e licença
          </a>{' '}
          ·{' '}
          <a
            href="https://www.dndbeyond.com/sources/dnd/basic-rules-2014/step-by-step-characters"
            target="_blank"
            rel="noreferrer"
          >
            Criação de personagens
          </a>
        </p>
        <small>
          This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by
          Wizards of the Coast LLC and available at
          https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed
          under the Creative Commons Attribution 4.0 International License available at
          https://creativecommons.org/licenses/by/4.0/legalcode.
        </small>
      </section>
    </div>
  );
}
