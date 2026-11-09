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
  return normalize(
    [entry.name, entry.type, entry.description, entry.location, entry.government].join(' '),
  ).includes(needle);
}

export function worldChildrenFor(entry: WorldEntry, entries: WorldEntry[]) {
  return entries
    .filter(
      (item) =>
        item.campaign_id === entry.campaign_id &&
        (entry.kind === 'region'
          ? (item.kind === 'city' && item.region_id === entry.id) ||
            (item.kind === 'location' && !item.city_id && item.region_id === entry.id)
          : entry.kind === 'city' && item.kind === 'location' && item.city_id === entry.id),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
}

/** Locations belong to exactly one explicit parent; a city's region is inherited. */
export function worldHierarchy(entries: WorldEntry[], query = '') {
  const sorted = [...entries].sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }),
  );
  const regions = sorted.filter((e) => e.kind === 'region');
  const cities = sorted.filter((e) => e.kind === 'city');
  const locations = sorted.filter((e) => e.kind === 'location');
  const regionIds = new Set(regions.map((e) => e.id));
  const cityIds = new Set(cities.map((e) => e.id));
  const cityNodes = (list: WorldEntry[], parentMatches: boolean) =>
    list
      .map((city) => {
        const allLocations = locations.filter((place) => place.city_id === city.id);
        const cityMatches = parentMatches || worldEntryMatches(city, query);
        const visibleLocations = allLocations.filter(
          (place) => cityMatches || worldEntryMatches(place, query),
        );
        return {
          city,
          locations: visibleLocations,
          visible: cityMatches || visibleLocations.length > 0,
          total: allLocations.length,
        };
      })
      .filter((node) => node.visible);
  const tree = regions
    .map((region) => {
      const allCities = cities.filter((city) => city.region_id === region.id);
      const allLocations = locations.filter(
        (place) => !place.city_id && place.region_id === region.id,
      );
      const regionMatches = worldEntryMatches(region, query);
      const nested = cityNodes(allCities, regionMatches);
      const direct = allLocations.filter(
        (place) => regionMatches || worldEntryMatches(place, query),
      );
      return {
        region,
        cityNodes: nested,
        cities: nested.map((node) => node.city),
        locations: direct,
        visible: regionMatches || nested.length > 0 || direct.length > 0,
        cityCount: allCities.length,
        locationCount:
          allLocations.length +
          allCities.reduce(
            (total, city) => total + locations.filter((p) => p.city_id === city.id).length,
            0,
          ),
      };
    })
    .filter((group) => group.visible);
  const orphanCities = cities.filter((city) => !city.region_id || !regionIds.has(city.region_id));
  const unassignedCityNodes = cityNodes(orphanCities, false);
  const unassignedLocations = locations
    .filter(
      (place) =>
        (!place.city_id && (!place.region_id || !regionIds.has(place.region_id))) ||
        (place.city_id && !cityIds.has(place.city_id)),
    )
    .filter((place) => worldEntryMatches(place, query));
  return {
    regions: tree,
    unassignedCityNodes,
    unassignedLocations,
    unassigned: [...unassignedCityNodes.map((node) => node.city), ...unassignedLocations],
  };
}

export function worldBreadcrumb(entry: WorldEntry, entries: WorldEntry[]) {
  if (entry.kind === 'region') return 'Região';
  const sameCampaign = entries.filter((row) => row.campaign_id === entry.campaign_id);
  const city =
    entry.kind === 'location' && entry.city_id
      ? sameCampaign.find((row) => row.kind === 'city' && row.id === entry.city_id)
      : undefined;
  const regionId = city ? city.region_id : entry.region_id;
  const region = sameCampaign.find((row) => row.id === regionId && row.kind === 'region');
  return (
    [region?.name, city?.name, WORLD_LABELS[entry.kind]].filter(Boolean).join(' · ') ||
    WORLD_LABELS[entry.kind]
  );
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
