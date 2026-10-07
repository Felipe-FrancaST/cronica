'use client';
import { useState } from 'react';
import { Badge, Field, Input, Select } from '@/components/ui';
import { ITEM_CATALOG, ITEM_TYPES } from './items';
export function ItemReference() {
  const [type, setType] = useState(''),
    [query, setQuery] = useState('');
  const results = ITEM_CATALOG.filter(
    (i) =>
      (!type || i.category === type) &&
      i.name.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')),
  );
  return (
    <div className="form-stack">
      <div className="form-grid">
        <Field label="Tipo de equipamento">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Todos os tipos</option>
            {Object.entries(ITEM_TYPES).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Buscar item">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Arma, ferramenta, poção…"
          />
        </Field>
      </div>
      <p className="subtle" role="status">
        {results.length} itens · D&D 5e de 2014 / SRD 5.1. Armas e armaduras usam suas propriedades;
        itens com efeito definido podem ser usados na Mesa. Ferramentas, focos e equipamentos de
        aventura seguem a descrição, com decisões do mestre.
      </p>
      <div className="reference-grid">
        {results.map((i) => (
          <section key={i.catalog_id} className="panel reference-card">
            <div className="panel-heading">
              <h3>{i.name}</h3>
              <Badge tone="muted">{ITEM_TYPES[i.category]}</Badge>
            </div>
            {i.weapon_type && (
              <Badge tone="blue">
                {i.weapon_type === 'martial' ? 'Arma marcial' : 'Arma simples'} ·{' '}
                {i.weapon_mode === 'ranged' ? 'à distância' : 'corpo a corpo'}
              </Badge>
            )}
            {i.damage && (
              <p>
                Dano: {i.damage}
                {i.versatile_damage ? ` · duas mãos: ${i.versatile_damage}` : ''}
              </p>
            )}
            {i.armor_base && (
              <p>
                {i.armor_type === 'shield' ? '+' : ''}
                {i.armor_base} CA
                {i.armor_type === 'light'
                  ? ' + Destreza'
                  : i.armor_type === 'medium'
                    ? ' + Destreza (máximo +2)'
                    : ''}
              </p>
            )}
            <p>{i.notes}</p>
            {i.use && (
              <div className="info-box">
                <strong>{i.use.dice || 'Efeito de utilidade'}</strong>
                <p>{i.use.note}</p>
                <small>
                  {i.charges
                    ? `${i.charges} usos por kit`
                    : i.use.consumed
                      ? 'Consome 1 unidade'
                      : 'Não consome o item'}{' '}
                  · usa uma ação, com decisão do mestre.
                </small>
              </div>
            )}
            <small className="subtle">
              {i.weight} kg{i.cost_gp ? ` · ${i.cost_gp} PO` : ' · preço definido pelo mestre'}
              {i.rarity ? ` · ${i.rarity}` : ''}
            </small>
          </section>
        ))}
      </div>
    </div>
  );
}
