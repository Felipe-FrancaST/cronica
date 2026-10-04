import type { Spell } from './types';
import type { CatalogSpell } from './spell-catalog';
export function spellFromCatalog(
  entry: CatalogSpell,
  id: string,
  classId?: string,
  arcanum = false,
): Spell {
  return {
    id,
    catalog_id: entry.id,
    name: entry.name,
    english_name: entry.english_name,
    level: entry.level,
    school: entry.school,
    casting_time: entry.casting_time,
    range: entry.range,
    components: entry.components,
    duration: entry.duration,
    description: entry.description,
    ritual: entry.ritual,
    concentration: entry.concentration,
    source: entry.source,
    source_page: entry.source_page,
    source_reference_page: entry.source_reference_page,
    source_pages: entry.source_pages,
    catalog_classes: entry.classes,
    class_id: classId,
    prepared: arcanum || entry.level === 0,
    casting_mode: arcanum ? 'arcanum' : 'class',
    always_prepared: false,
    notes: '',
  };
}
