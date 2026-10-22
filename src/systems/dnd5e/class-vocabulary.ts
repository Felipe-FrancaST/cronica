export const SUBCLASS_TERMS: Record<string, string> = {
  barbarian: 'Caminho Primitivo',
  bard: 'Colégio de Bardo',
  cleric: 'Domínio Divino',
  druid: 'Círculo Druídico',
  fighter: 'Arquétipo Marcial',
  monk: 'Tradição Monástica',
  paladin: 'Juramento Sagrado',
  ranger: 'Arquétipo de Patrulheiro',
  rogue: 'Arquétipo de Ladino',
  sorcerer: 'Origem de Feitiçaria',
  warlock: 'Patrono Transcendental',
  wizard: 'Tradição Arcana',
  artificer: 'Especialização de Artífice',
};
export const subclassTerm = (id: string) => SUBCLASS_TERMS[id] ?? 'Subclasse';
