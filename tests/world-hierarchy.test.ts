import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorldEntry } from '../src/types';
import {
  worldHierarchy,
  worldEntryMatches,
  worldBreadcrumb,
  worldMuralSummary,
  worldChildrenFor,
} from '../src/lib/world-hierarchy';

const entry = (
  kind: WorldEntry['kind'],
  name: string,
  overrides: Partial<WorldEntry> = {},
): WorldEntry => ({
  id: name.toLowerCase().replace(/\s/g, '-'),
  campaign_id: 'c1',
  kind,
  name,
  description: '',
  image_path: null,
  type: '',
  location: '',
  notes: '',
  region_id: null,
  city_id: null,
  population: null,
  government: '',
  visible_to_players: false,
  secrets: '',
  private_notes: '',
  created_at: '',
  updated_at: '',
  ...overrides,
});

test('region hierarchy groups child cities and places without losing unassigned entries', () => {
  const region = entry('region', 'Terras do Norte');
  const city = entry('city', 'Valória', { region_id: region.id });
  const tavern = entry('location', 'Taverna Azul', { region_id: region.id });
  const floating = entry('city', 'Porto Livre');
  const tree = worldHierarchy([tavern, floating, city, region]);
  assert.equal(tree.regions.length, 1);
  assert.deepEqual(
    tree.regions[0].cities.map((x) => x.name),
    ['Valória'],
  );
  assert.deepEqual(
    tree.regions[0].locations.map((x) => x.name),
    ['Taverna Azul'],
  );
  assert.deepEqual(
    tree.unassigned.map((x) => x.name),
    ['Porto Livre'],
  );
  assert.equal(worldBreadcrumb(city, [region]), 'Terras do Norte · Cidade');
});

test('finding a city shows its parent region and keeps unrelated children hidden', () => {
  const region = entry('region', 'Terras do Norte');
  const city = entry('city', 'Valória', { region_id: region.id });
  const tavern = entry('location', 'Taverna Azul', { region_id: region.id });
  const tree = worldHierarchy([region, city, tavern], 'valória');
  assert.equal(tree.regions[0].region.name, 'Terras do Norte');
  assert.equal(tree.regions[0].cities.length, 1);
  assert.equal(tree.regions[0].locations.length, 0);
  assert.equal(worldEntryMatches(city, 'valória'), true);
});

test('mural publication includes only public presentation, never master secrets', () => {
  const city = entry('city', 'Valória', {
    type: 'Capital',
    description: 'Pontes sobre um rio.',
    notes: 'Mercado de artesãos',
    secrets: 'Traidor entre os guardas',
    private_notes: 'Invasão na próxima sessão',
  });
  const published = worldMuralSummary(city);
  assert.match(published, /Valória|Capital/);
  assert.match(published, /Mercado de artesãos/);
  assert.doesNotMatch(published, /Traidor|Invasão/);
});

test('a city contains its places; direct regional places remain at regional level', () => {
  const north = entry('region', 'Norte');
  const capital = entry('city', 'Áuria', { region_id: north.id });
  const inn = entry('location', 'Taverna das Estrelas', { city_id: capital.id });
  const forest = entry('location', 'Bosque Ancestral', { region_id: north.id });
  const tree = worldHierarchy([forest, inn, capital, north]);
  assert.deepEqual(
    tree.regions[0].cities.map((e) => e.name),
    ['Áuria'],
  );
  assert.deepEqual(
    tree.regions[0].locations.map((e) => e.name),
    ['Bosque Ancestral'],
  );
  assert.deepEqual(
    tree.regions[0].cityNodes[0].locations.map((e) => e.name),
    ['Taverna das Estrelas'],
  );
  assert.deepEqual(worldChildrenFor(capital, [inn, forest]), [inn]);
  assert.equal(worldBreadcrumb(inn, [north, capital]), 'Norte · Áuria · Local');
  assert.equal(tree.regions[0].locationCount, 2);
});

test('finding a nested place reveals its parent city and region without unrelated siblings', () => {
  const region = entry('region', 'Norte');
  const city = entry('city', 'Áuria', { region_id: region.id });
  const inner = entry('location', 'Taverna Brilhante', { city_id: city.id });
  const another = entry('location', 'Estábulo do Sul', { city_id: city.id });
  const tree = worldHierarchy([region, city, inner, another], 'brilhante');
  assert.equal(tree.regions.length, 1);
  assert.deepEqual(
    tree.regions[0].cityNodes[0].locations.map((e) => e.id),
    [inner.id],
  );
  assert.equal(tree.regions[0].cityNodes[0].city.id, city.id);
  assert.equal(tree.regions[0].locations.length, 0);
});

test('moving city between regions carries nested places without modifying their parent', () => {
  const first = entry('region', 'Norte');
  const second = entry('region', 'Sul');
  const city = entry('city', 'Áuria', { region_id: second.id });
  const inn = entry('location', 'Taverna', { city_id: city.id });
  const tree = worldHierarchy([first, second, city, inn]);
  assert.equal(
    tree.regions.find((g) => g.region.id === second.id)?.cityNodes[0].locations[0].id,
    inn.id,
  );
  assert.equal(tree.regions.find((g) => g.region.id === first.id)?.cities.length, 0);
  assert.equal(worldBreadcrumb(inn, [first, second, city]), 'Sul · Áuria · Local');
});

test('an unassigned city still displays its nested locations without duplicates', () => {
  const city = entry('city', 'Cidade livre');
  const location = entry('location', 'Estalagem', { city_id: city.id });
  const tree = worldHierarchy([city, location]);
  assert.deepEqual(
    tree.unassigned.map((e) => e.id),
    [city.id],
  );
  assert.deepEqual(
    tree.unassignedCityNodes[0].locations.map((e) => e.id),
    [location.id],
  );
});
