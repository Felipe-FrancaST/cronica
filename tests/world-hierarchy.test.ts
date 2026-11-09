import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorldEntry } from '../src/types';
import {
  worldHierarchy,
  worldEntryMatches,
  worldBreadcrumb,
  worldMuralSummary,
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
