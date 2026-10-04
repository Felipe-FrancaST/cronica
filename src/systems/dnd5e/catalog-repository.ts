import { getSupabase } from '@/lib/supabase/client';
import { SPELL_CATALOG, type CatalogSpell } from './spell-catalog';
/** The bundled reference is also the migration seed: demo/offline stays usable. */
export async function loadSpellCatalog(
  demo: boolean,
): Promise<{ spells: CatalogSpell[]; local: boolean }> {
  if (demo) return { spells: SPELL_CATALOG, local: false };
  try {
    const result: CatalogSpell[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await getSupabase()
        .from('dnd_spells')
        .select(
          'id,name,english_name,level,school,ritual,concentration,data,dnd_spell_classes(class_id)',
        )
        .eq('edition', '2014')
        .order('id')
        .range(offset, offset + 499);
      if (error) throw new Error(error.message);
      for (const row of data ?? [])
        result.push({
          ...row.data,
          id: row.id,
          name: row.name,
          english_name: row.english_name,
          level: row.level,
          school: row.school,
          ritual: row.ritual,
          concentration: row.concentration,
          classes: row.dnd_spell_classes.map((c: { class_id: string }) => c.class_id),
        } as CatalogSpell);
      if ((data ?? []).length < 500) break;
    }
    if (!result.length) throw new Error('Empty catalog');
    return { spells: result, local: false };
  } catch {
    return { spells: SPELL_CATALOG, local: true };
  }
}
