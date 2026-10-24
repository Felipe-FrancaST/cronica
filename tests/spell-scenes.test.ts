import test from 'node:test';
import assert from 'node:assert/strict';
import { spellZones, spellTerrainCells } from '../src/features/vtt/spell-scenes';
import { activeSpellLights, computeVision, visionCell } from '../src/features/vtt/vision';
import { spellEffect, pointInEffect } from '../src/features/vtt/effects';
import { SPELL_CATALOG } from '../src/systems/dnd5e/spell-catalog';
import type { BattleMap, BattleSpellEffect, BattleToken } from '../src/features/vtt/types';
import audit from '../docs/auditoria-magias-grid.json';
const map = {
  id: 'm',
  width: 30,
  height: 20,
  scale_unit: 'm',
  scale_per_cell: 1.5,
  lighting: 'day',
  vision_enabled: true,
} as BattleMap;
const caster = { id: 'caster', map_id: 'm', x: 2, y: 2, size: 1 } as BattleToken;
const effect = (id: string, target = { x: 8, y: 8 }): BattleSpellEffect => ({
  id,
  request_id: id,
  map_id: 'm',
  campaign_id: 'c',
  token_id: 'caster',
  active: true,
  name: id,
  concentration: false,
  duration: '1 minuto',
  pulses: 0,
  created_at: '2026-10-24T00:00:00Z',
  updated_at: '2026-10-24T00:00:00Z',
  definition: {
    ...spellEffect({ catalog_id: id }),
    entry: { catalog_id: id },
    scene_origin: { x: 2, y: 2 },
  },
  target,
});
test('all 361 descriptions are traceable and instant fire never becomes a persistent zone', () => {
  assert.equal(audit.length, SPELL_CATALOG.length);
  assert.equal(new Set(audit.map((a) => a.id)).size, audit.length);
  for (const row of audit) {
    assert.equal(row.description, SPELL_CATALOG.find((s) => s.id === row.id)!.description);
    assert.equal(row.description_sha256.length, 64);
  }
  assert.equal(spellZones([effect('bola-de-fogo')], [caster], map).length, 0);
  assert.equal(spellZones([effect('muralha-de-fogo')], [caster], map)[0].visual, 'fire');
});
test('light uses catalogue metadata, metres, mobile caster attachment and failed faerie-fire targets only', () => {
  const flame = effect('produzir-chama'),
    lights = activeSpellLights([flame], [], [caster], map);
  assert.equal(lights[0].radius, 4);
  assert.equal(lights[0].brightRadius, 2);
  assert.equal(lights[0].x, 2.5);
  assert.equal(activeSpellLights([flame], [], [{ ...caster, x: 12 }], map)[0].x, 12.5);
  const orbs = activeSpellLights([effect('globos-de-luz')], [], [caster], map);
  assert.equal(orbs[0].radius, 2);
  assert.ok(orbs[0].strength < 1);
  assert.equal(activeSpellLights([{ ...flame, active: false }], [], [caster], map).length, 0);
  const faerie = effect('fogo-das-fadas');
  faerie.definition.light_targets = ['one', 'two'];
  assert.equal(
    activeSpellLights(
      [faerie],
      [],
      [
        { ...caster, id: 'one' },
        { ...caster, id: 'two' },
        { ...caster, id: 'saved' },
      ],
      map,
    ).length,
    2,
  );
});
test('fixed zones stay in place, auras follow the caster, and terrain leaves the original map intact', () => {
  const fixed = effect('teia'),
    zones = spellZones([fixed], [caster], map);
  assert.deepEqual(zones[0].cells, spellZones([fixed], [{ ...caster, x: 18 }], map)[0].cells);
  const base: any[] = [];
  assert.ok(spellTerrainCells(base, zones, map).every((c) => c.movement_cost === 2));
  assert.equal(base.length, 0);
  assert.equal(spellTerrainCells(base, [], map).length, 0);
  const aura = effect('guardioes-espirituais');
  assert.notDeepEqual(
    spellZones([aura], [caster], map)[0].cells,
    spellZones([aura], [{ ...caster, x: 18 }], map)[0].cells,
  );
});
test('fog blocks daylight sight and Devil Sight sees magical darkness', () => {
  const eye = { x: 2.5, y: 8.5, darkvision: 0, devilSight: 0, trueSight: 0 };
  const fog = spellZones([effect('nevoa')], [caster], map);
  assert.equal(visionCell(computeVision(map, [], [], [], [], [eye], fog), 8, 8), false);
  const darkness = spellZones([effect('escuridao')], [caster], map);
  assert.equal(visionCell(computeVision(map, [], [], [], [], [eye], darkness), 8, 8), false);
  assert.equal(
    visionCell(computeVision(map, [], [], [], [], [{ ...eye, devilSight: 36 }], darkness), 8, 8),
    true,
  );
});
test('wall footprints are point-centred and rotation changes orientation', () => {
  const wall = { ...spellEffect({ catalog_id: 'muralha-de-fogo' }), rotation: 90 };
  assert.equal(pointInEffect({ x: 8, y: 10 }, caster, { x: 8, y: 8 }, wall, 1.5), true);
  assert.equal(pointInEffect({ x: 10, y: 8 }, caster, { x: 8, y: 8 }, wall, 1.5), false);
});
