import type { WorldEntry, WorldKind } from '@/types';

export const WORLD_LABELS: Record<WorldKind, string> = {
  region: 'Região',
  city: 'Cidade',
  location: 'Local',
};

export function worldEntryMatches(entry: WorldEntry, query: string) {
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR');
  const needle = normalize(query.trim());
  if (!needle) return true;
  return [entry.name, entry.type, entry.description, entry.location, entry.government]
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .includes(needle);
}

export function worldHierarchy(entries: WorldEntry[], query = '') {
  const sorted = [...entries].sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }),
  );
  const regions = sorted.filter((entry) => entry.kind === 'region');
  const regionIds = new Set(regions.map((entry) => entry.id));
  const children = sorted.filter((entry) => entry.kind !== 'region');
  return {
    regions: regions
      .map((region) => {
        const allChildren = children.filter((child) => child.region_id === region.id);
        const regionMatches = worldEntryMatches(region, query);
        return {
          region,
          cities: allChildren.filter(
            (entry) => entry.kind === 'city' && (regionMatches || worldEntryMatches(entry, query)),
          ),
          locations: allChildren.filter(
            (entry) =>
              entry.kind === 'location' && (regionMatches || worldEntryMatches(entry, query)),
          ),
          visible: regionMatches || allChildren.some((child) => worldEntryMatches(child, query)),
        };
      })
      .filter((group) => group.visible),
    unassigned: children.filter(
      (entry) =>
        (!entry.region_id || !regionIds.has(entry.region_id)) && worldEntryMatches(entry, query),
    ),
  };
}

export function worldBreadcrumb(entry: WorldEntry, entries: WorldEntry[]) {
  if (entry.kind === 'region') return 'Região';
  const region = entries.find(
    (record) =>
      record.id === entry.region_id &&
      record.kind === 'region' &&
      record.campaign_id === entry.campaign_id,
  );
  return region
    ? `${region.name} · ${WORLD_LABELS[entry.kind]}`
    : `Sem região · ${WORLD_LABELS[entry.kind]}`;
}

/** Only public presentation data goes to Mural. GM notes are never copied. */
export function worldMuralSummary(entry: WorldEntry) {
  return [
    entry.type ? `${WORLD_LABELS[entry.kind]} · ${entry.type}` : WORLD_LABELS[entry.kind],
    entry.description,
    entry.notes,
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 12000);
}
