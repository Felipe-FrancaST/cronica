import type { DndSheet, InventoryItem } from './types';
import { classLevel, classLevels, featureResources } from './progression';
import type { CombatEffect } from '@/features/vtt/effects';

export interface WeaponOptions {
  two_handed?: boolean;
  sneak?: boolean;
  hunter?: boolean;
  offhand?: boolean;
  smite_level?: number;
  smite_kind?: 'slot' | 'pact';
  smite_special?: boolean;
}
export interface CombatFeature {
  id: string;
  name: string;
  resource: string;
  cost: 'action' | 'bonus' | 'reaction' | 'free';
  operation: 'rage' | 'end-rage' | 'surge' | 'dash' | 'disengage' | 'dodge' | 'heal' | 'manual';
  kind: 'healing' | 'utility';
  dice: string;
  range: number;
  self: boolean;
  variable?: boolean;
  note: string;
}
const feature = (
  id: string,
  name: string,
  resource: string,
  cost: CombatFeature['cost'],
  operation: CombatFeature['operation'],
  dice = '',
  self = true,
  range = 0,
  note = '',
  variable = false,
): CombatFeature => ({
  id,
  name,
  resource,
  cost,
  operation,
  kind: operation === 'heal' ? 'healing' : 'utility',
  dice,
  self,
  range,
  note,
  variable,
});
export function combatFeatures(sheet: DndSheet, raging = false): CombatFeature[] {
  const result: CombatFeature[] = [],
    fighter = classLevel(sheet, 'fighter'),
    monk = classLevel(sheet, 'monk');
  if (classLevel(sheet, 'barbarian'))
    result.push(
      raging
        ? feature('barbarian:end-rage', 'Encerrar Fúria', '', 'bonus', 'end-rage')
        : feature(
            'barbarian:rage',
            'Entrar em Fúria',
            'barbarian:rage',
            'bonus',
            'rage',
            '',
            true,
            0,
            'Resistência a dano físico e bônus em ataques corpo a corpo com Força. Impede conjuração e encerra concentração; não funciona com armadura pesada.',
          ),
    );
  if (fighter)
    result.push(
      feature(
        'fighter:second-wind',
        'Retomar o Fôlego',
        'fighter:second-wind',
        'bonus',
        'heal',
        `1d10+${fighter}`,
      ),
    );
  if (fighter >= 2)
    result.push(
      feature(
        'fighter:action-surge',
        'Surto de Ação',
        'fighter:action-surge',
        'free',
        'surge',
        '',
        true,
        0,
        'Libera uma nova ação, preservando ataques pendentes, movimento e ação bônus. Máximo uma vez por turno.',
      ),
    );
  if (monk >= 2)
    result.push(
      feature(
        'monk:dash',
        'Passo do Vento · Disparada',
        'monk:ki',
        'bonus',
        'dash',
        '',
        true,
        0,
        'Gasta 1 ki; dobra a distância de salto neste turno.',
      ),
      feature(
        'monk:disengage',
        'Passo do Vento · Desengajar',
        'monk:ki',
        'bonus',
        'disengage',
        '',
        true,
        0,
        'Gasta 1 ki; dobra a distância de salto neste turno.',
      ),
      feature(
        'monk:dodge',
        'Defesa Paciente',
        'monk:ki',
        'bonus',
        'dodge',
        '',
        true,
        0,
        'Gasta 1 ki; o mestre aplica as vantagens da esquiva.',
      ),
    );
  if (classLevel(sheet, 'paladin'))
    result.push(
      feature(
        'paladin:lay-hands',
        'Impor as Mãos',
        'paladin:lay-hands',
        'action',
        'heal',
        'amount',
        false,
        1.5,
        'Escolha quantos PV da reserva distribuir. Não afeta construtos ou mortos-vivos; o mestre verifica o alvo.',
        true,
      ),
    );
  if (
    monk >= 6 &&
    classLevels(sheet).some((c) => c.class_id === 'monk' && c.subclass_id === 'open-hand')
  )
    result.push(
      feature(
        'monk:wholeness',
        'Integridade Corporal',
        'monk:wholeness',
        'action',
        'heal',
        String(3 * monk),
      ),
    );
  const existing = new Set(result.map((f) => f.resource));
  for (const r of featureResources(sheet))
    if (
      !existing.has(r.id) &&
      !['wizard:arcane-recovery', 'druid:natural-recovery', 'monk:ki', 'barbarian:rage'].includes(
        r.id,
      )
    ) {
      const bard = r.id === 'bard:inspiration';
      result.push(
        feature(
          r.id,
          r.name,
          r.id,
          bard
            ? 'bonus'
            : [
                  'sorcerer:points',
                  'fighter:indomitable',
                  'warlock:luck',
                  'warlock:hell',
                  'rogue:luck',
                ].includes(r.id)
              ? 'free'
              : 'action',
          'manual',
          '',
          !bard,
          bard ? 18 : 0,
          `${r.description} Registra o gasto e a ação; o mestre aplica o efeito descrito na ficha.`,
          r.id === 'sorcerer:points',
        ),
      );
    }
  return result;
}
export const hasStyle = (sheet: DndSheet, style: string) =>
  classLevels(sheet).some((c) =>
    [...(c.choices?.style ?? []), ...(c.choices?.['second-style'] ?? [])].includes(style),
  );
export function weaponProficient(item: InventoryItem, sheet: DndSheet): boolean {
  if (item.weapon_proficiency === 'proficient') return true;
  if (item.weapon_proficiency === 'untrained') return false;
  if (item.catalog_id === 'unarmed') return true;
  const classes = classLevels(sheet),
    primary = classes[0]?.class_id ?? sheet.class_id;
  const simple = (item.weapon_type ?? 'simple') === 'simple';
  if (classes.some((c) => ['barbarian', 'fighter', 'paladin', 'ranger'].includes(c.class_id)))
    return true;
  if (classes.some((c) => c.class_id === 'monk') && (simple || item.catalog_id === 'shortsword'))
    return true;
  if (classes.some((c) => c.class_id === 'warlock') && simple) return true;
  if (['bard', 'rogue'].includes(primary))
    return (
      simple ||
      ['hand-crossbow', 'longsword', 'rapier', 'shortsword'].includes(item.catalog_id ?? '')
    );
  if (['cleric', 'artificer'].includes(primary)) return simple;
  if (primary === 'druid')
    return [
      'club',
      'dagger',
      'dart',
      'javelin',
      'mace',
      'quarterstaff',
      'scimitar',
      'sickle',
      'sling',
      'spear',
    ].includes(item.catalog_id ?? '');
  if (['wizard', 'sorcerer'].includes(primary))
    return ['dagger', 'dart', 'sling', 'quarterstaff', 'light-crossbow'].includes(
      item.catalog_id ?? '',
    );
  return false;
}
export function weaponTraits(item: InventoryItem, sheet: DndSheet) {
  const text = `${item.name} ${item.notes} ${(item.properties ?? []).join(' ')}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const ranged = item.weapon_mode === 'ranged' || /arco|besta|funda|zarabatana/.test(text);
  const finesse = /acuidade|adaga|rapieira|cimitarra|espada curta|chicote/.test(text);
  const unarmed = item.catalog_id === 'unarmed';
  const martialArts =
    classLevel(sheet, 'monk') > 0 &&
    !sheet.inventory.some((i) => i.equipped && i.quantity > 0 && i.category === 'armor') &&
    (unarmed ||
      (!ranged &&
        !/pesada|duas maos/.test(text) &&
        (item.weapon_type === 'simple' ||
          /bordao|lanca|clava|adaga|machadinha|martelo leve|foice|espada curta/.test(text))));
  const str = Math.floor((sheet.abilities.str - 10) / 2),
    dex = Math.floor((sheet.abilities.dex - 10) / 2);
  const ability =
    item.weapon_ability ??
    (item.catalog_id === 'net'
      ? 'dex'
      : ranged && !/arremesso/.test(text)
        ? 'dex'
        : finesse || martialArts
          ? dex > str
            ? 'dex'
            : 'str'
          : 'str');
  return {
    ranged,
    finesse,
    unarmed,
    martialArts,
    ability,
    twoHanded: /duas maos/.test(text),
    light: /leve/.test(text),
  };
}
export function weaponClassEffect(
  base: CombatEffect,
  item: InventoryItem,
  sheet: DndSheet,
  options: WeaponOptions = {},
  raging = false,
): CombatEffect {
  const t = weaponTraits(item, sheet),
    monk = classLevel(sheet, 'monk');
  const mod = Math.floor((sheet.abilities[t.ability] - 10) / 2);
  let die =
    options.two_handed && item.versatile_damage
      ? item.versatile_damage
      : (item.damage?.match(/\d+d\d+(?:\s*[+-]\s*\d+)?/)?.[0].replace(/\s/g, '') ?? '1');
  if (t.martialArts) {
    const sides = monk >= 17 ? 10 : monk >= 11 ? 8 : monk >= 5 ? 6 : 4;
    if (t.unarmed || (die.match(/^1d(\d+)$/) && Number(die.slice(2)) < sides)) die = `1d${sides}`;
  }
  let bonus = options.offhand && !hasStyle(sheet, 'two-weapon') ? Math.min(0, mod) : mod;
  if (raging && !t.ranged && t.ability === 'str') {
    const b = classLevel(sheet, 'barbarian');
    bonus += b >= 16 ? 4 : b >= 9 ? 3 : 2;
  }
  const otherWeapons = sheet.inventory.filter(
    (i) => i.id !== item.id && i.equipped && i.quantity > 0 && i.category === 'weapon',
  );
  if (
    hasStyle(sheet, 'dueling') &&
    !t.ranged &&
    !t.unarmed &&
    !t.twoHanded &&
    !options.two_handed &&
    !otherWeapons.length
  )
    bonus += 2;
  const parts = [{ dice: `${die}${bonus >= 0 ? '+' : ''}${bonus}`, damageType: base.damageType }];
  if (options.sneak && classLevel(sheet, 'rogue') && (t.ranged || t.finesse))
    parts.push({
      dice: `${Math.ceil(classLevel(sheet, 'rogue') / 2)}d6`,
      damageType: base.damageType,
    });
  if (options.hunter) parts.push({ dice: '1d8', damageType: base.damageType });
  if (!t.ranged && !t.unarmed && classLevel(sheet, 'paladin') >= 11)
    parts.push({ dice: '1d8', damageType: 'radiante' });
  if (options.smite_level && !t.ranged && classLevel(sheet, 'paladin') >= 2)
    parts.push({
      dice: `${Math.min(5, options.smite_level + 1) + (options.smite_special ? 1 : 0)}d8`,
      damageType: 'radiante',
    });
  const prof = 2 + Math.floor((sheet.level - 1) / 4);
  return {
    ...base,
    dice: item.catalog_id === 'net' ? '' : parts.map((p) => p.dice).join('+'),
    damageParts: item.catalog_id === 'net' ? [] : parts,
    kind: item.catalog_id === 'net' ? 'utility' : base.kind,
    review: item.catalog_id === 'net' ? true : base.review,
    note:
      item.catalog_id === 'net'
        ? 'Rede não causa dano. O mestre aplica a condição contido e as restrições de tamanho e de ataque descritas no item.'
        : base.note,
    attackBonus:
      mod +
      (weaponProficient(item, sheet) ? prof : 0) +
      (item.weapon_attack_bonus ?? 0) +
      (t.ranged && hasStyle(sheet, 'archery') ? 2 : 0),
    rerollWeaponDice:
      hasStyle(sheet, 'great-weapon') && !t.ranged && (t.twoHanded || options.two_handed)
        ? Number(die.match(/^(\d+)d/)?.[1] ?? 0)
        : 0,
    criticalAt: classLevels(sheet).some(
      (c) => c.class_id === 'fighter' && c.subclass_id === 'champion' && c.level >= 15,
    )
      ? 18
      : classLevels(sheet).some(
            (c) => c.class_id === 'fighter' && c.subclass_id === 'champion' && c.level >= 3,
          )
        ? 19
        : 20,
  };
}
/** Audit all feature cards; conditional effects are never presented as automatic. */
export function combatApplication(name: string): string {
  if (/Aura de proteção/i.test(name))
    return 'Bônus automático nas próprias salvaguardas enquanto consciente. O mestre confere alcance e bônus dos aliados no grid.';
  if (/Evasão|Pureza corporal|Discípulo da vida|Curandeiro abençoado|Cura suprema/i.test(name))
    return 'Aplicação automática no dano ou cura da Mesa, conforme tipo, nível e salvaguarda informada pelo mestre.';
  if (
    /Ataque extra|Defesa sem armadura|Movimento sem armadura|Movimento rápido|Resiliência dracônica|Pau para toda obra|Especialização|Mente escorregadia|Alma de diamante|Campeão primordial/i.test(
      name,
    )
  )
    return 'Aplicação automática nos valores da ficha e da Mesa.';
  if (/Fúria$|Retomar o fôlego|Surto de ação|Ki$|Impor as mãos|Integridade corporal/i.test(name))
    return 'Disponível em Habilidades na Mesa; consome o recurso com a decisão do mestre.';
  if (
    /Ataque furtivo|Destruição divina|Estilo de luta|Ação ardilosa|Crítico aprimorado|Crítico superior|Discípulo da vida|Evocação potencializada|Afinidade elemental/i.test(
      name,
    )
  )
    return 'Integrada às ações da Mesa. Condições de acerto, vantagem e tipo de alvo são conferidas pelo mestre.';
  return 'Consulte a descrição. Efeitos condicionais, transformações e reações especiais são aplicados pelo mestre; os recursos disponíveis podem ser registrados na Mesa.';
}
