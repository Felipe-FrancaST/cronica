import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSheet } from '../src/systems/dnd5e';
import { lifeState } from '../src/features/vtt/life-state';
import { TOKEN_ICONS, SYMBOLS } from '../src/features/atlas/types';
import { TOKEN_GLYPHS, SYMBOL_GLYPHS } from '../src/features/atlas/glyphs';
import { generateAtlas } from '../src/features/atlas/generator';
import { featureBase, parseAtlasFile, serializeAtlas } from '../src/features/atlas/model';
import { combatAreaPoints, combatEffectStyle } from '../src/features/vtt/combat-effect-style';
import { EMPTY_EFFECT } from '../src/features/vtt/effects';
import type { BattleActionRequest, BattleMap, BattleToken } from '../src/features/vtt/types';
test('life states distinguish prone, dying, stable and dead', () => {
  const s = defaultSheet();
  assert.equal(lifeState({ ...s, hp_current: 0 }), 'dying');
  assert.equal(
    lifeState({ ...s, hp_current: 0, conditions: ['Estável', 'Inconsciente'] }),
    'stable',
  );
  assert.equal(lifeState({ ...s, hp_current: 0, death_failures: 3 }), 'dead');
  assert.equal(lifeState({ ...s, hp_current: 1, conditions: ['Caído'] }), 'prone');
});
test('all 24 tokens have unique authored paths and all added symbols roundtrip', () => {
  assert.equal(TOKEN_ICONS.length, 24);
  assert.equal(Object.keys(TOKEN_GLYPHS).length, 24);
  assert.equal(new Set(Object.values(TOKEN_GLYPHS)).size, 24);
  assert.equal(SYMBOLS.length, 68);
  const d = generateAtlas('blank', 640, 480, 'same', 'Biblioteca');
  d.objects = Object.keys(SYMBOL_GLYPHS).map((id) => ({
    ...featureBase({ x: 100, y: 100 }, id),
    kind: 'symbol',
    symbol: id as (typeof SYMBOLS)[number][0],
    size: 80,
    color: '#66543c',
  }));
  assert.deepEqual(parseAtlasFile(serializeAtlas(d)), d);
});
test('combat differentiates melee, ranged, lightning and healing with bounded area geometry', () => {
  const q = {
    kind: 'weapon',
    definition: { ...EMPTY_EFFECT, kind: 'damage', range: 1.5 },
    target: { x: 4, y: 0 },
  } as BattleActionRequest;
  assert.equal(combatEffectStyle(q).kind, 'slash');
  assert.equal(
    combatEffectStyle({ ...q, definition: { ...q.definition, range: 30 } }).kind,
    'arrow',
  );
  assert.equal(
    combatEffectStyle({
      ...q,
      kind: 'spell',
      definition: { ...q.definition, damageType: 'Elétrico' },
    }).kind,
    'bolt',
  );
  assert.equal(
    combatEffectStyle({ ...q, definition: { ...q.definition, kind: 'healing' } }).kind,
    'heal',
  );
  const actor = { x: 0, y: 0, size: 1 } as BattleToken,
    map = { scale_per_cell: 1.5, scale_unit: 'm' } as BattleMap;
  const points = combatAreaPoints(
    { ...q, definition: { ...q.definition, shape: 'sphere', size: 6 } },
    actor,
    map,
  );
  assert.equal(points.length, 24);
  assert.equal(points[0].x, 8);
  assert.equal(
    combatAreaPoints(
      { ...q, definition: { ...q.definition, shape: 'cone', size: 9, origin: 'self' } },
      actor,
      map,
    ).length,
    14,
  );
});
