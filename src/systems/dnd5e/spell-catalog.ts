import data from './data/spells.json';
export interface CatalogSpell {
  id: string;
  name: string;
  english_name: string;
  level: number;
  school: string;
  ritual: boolean;
  concentration: boolean;
  casting_time: string;
  range: string;
  components: string;
  duration: string;
  description: string;
  classes: string[];
  source: string;
  source_page: number;
  source_reference_page: number;
  source_pages: number[];
  edition: string;
  class_sources?: Record<string, string>;
}
export const SPELL_CATALOG: CatalogSpell[] = data;
export const SPELL_SCHOOLS = [...new Set(SPELL_CATALOG.map((s) => s.school))].sort((a, b) =>
  a.localeCompare(b, 'pt-BR'),
);
export const normalizeSearch = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export function filterSpells(
  catalog: CatalogSpell[],
  filters: {
    query?: string;
    classId?: string;
    level?: string;
    school?: string;
    ritual?: boolean;
    concentration?: boolean;
    maxLevel?: number;
  },
) {
  const words = normalizeSearch(filters.query ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return catalog
    .filter(
      (s) =>
        (!filters.classId || s.classes.includes(filters.classId)) &&
        (!filters.level || s.level === Number(filters.level)) &&
        (!filters.school || s.school === filters.school) &&
        (!filters.ritual || s.ritual) &&
        (!filters.concentration || s.concentration) &&
        (filters.maxLevel === undefined || s.level <= filters.maxLevel) &&
        words.every((w) => normalizeSearch(`${s.name} ${s.english_name}`).includes(w)),
    )
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'pt-BR'));
}
export { spellFromCatalog } from './spell-record';
