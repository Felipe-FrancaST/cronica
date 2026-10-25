import test from 'node:test';
import assert from 'node:assert/strict';
import {
  characterVision,
  computeVision,
  observerFromToken,
  visionCell,
  visionToken,
  withCreatureVision,
} from '../src/features/vtt/vision';
import { conditionMovementCells } from '../src/features/vtt/condition-movement';
import { defaultSheet, calculate } from '../src/systems/dnd5e';
import { characterRest } from '../src/systems/dnd5e/character-rest';
import { CONDITION_NAMES, conditionSpeed } from '../src/systems/dnd5e/conditions';
import type { Character, Npc } from '../src/types';
import type {
  BattleMap,
  BattleMapCell,
  BattleToken,
  BattleSpellEffect,
} from '../src/features/vtt/types';
const map = {
  id: 'map',
  width: 100,
  height: 10,
  scale_per_cell: 1.5,
  scale_unit: 'm',
  lighting: 'night',
  vision_enabled: true,
  darkness_level: 'dark',
} as BattleMap;
const eye = { x: 5.5, y: 5.5, darkvision: 18, devilSight: 0, trueSight: 0 };
const view = (overrides: Partial<BattleMap> = {}, observer = eye, cells: BattleMapCell[] = []) =>
  computeVision({ ...map, ...overrides }, cells, [], [], [], [observer]);
test('2014 penumbra and darkness have distinct perception, including grey darkvision', () => {
  const dv = view(),
    dim = view({ darkness_level: 'dim' }),
    human = view({ darkness_level: 'dim' }, { ...eye, darkvision: 0 });
  assert.equal(dv.perceived![5 * map.width + 10], 2);
  assert.equal(dim.perceived![5 * map.width + 10], 0);
  assert.equal(human.perceived![5 * map.width + 10], 1);
  assert.equal(
    view({ darkness_level: 'dim' }, { ...eye, darkvision: 0, devilSight: 36 }).perceived![
      5 * map.width + 10
    ],
    1,
  );
  assert.equal(visionCell(view({ darkness_level: 'magical' }), 5, 5), false);
});
test('walls block daylight, while ordinary darkness allows sight of distant lit areas', () => {
  const walls = Array.from({ length: 10 }, (_, y) => ({ x: 7, y, blocked: true }) as BattleMapCell);
  assert.equal(visionCell(view({ lighting: 'day' }, eye, walls), 9, 5), false);
  const far = computeVision(
    map,
    [],
    [],
    [],
    [
      {
        id: 'distant',
        x: 90.5,
        y: 5.5,
        radius: 4,
        brightRadius: 2,
        height: 1,
        color: '#ffffff',
        strength: 1,
      },
    ],
    [{ ...eye, darkvision: 0 }],
  );
  assert.equal(visionCell(far, 90, 5), true);
  assert.equal(far.perceived![5 * map.width + 90], 0);
});
test('blindsight works without eyes, while unconsciousness removes perception', () => {
  const npc = {
      id: 'npc',
      race: 'Humano',
      hp_current: 20,
      abilities_text: '',
      stat_block: { senses: { blindsight: 9, trueSight: 18 }, conditions: ['Cego'] },
    } as Npc,
    token = { id: 'token', npc_id: 'npc', x: 5, y: 5, size: 1 } as BattleToken;
  const observer = observerFromToken(token, [], [npc], [], [], [token]);
  assert.equal(observer.blindsight, 9);
  assert.equal(
    visionCell(
      computeVision({ ...map, darkness_level: 'magical' }, [], [], [], [], [observer]),
      10,
      5,
    ),
    true,
  );
  assert.equal(
    visionCell(computeVision(map, [], [], [], [], [{ ...observer, unconscious: true }]), 5, 5),
    false,
  );
  assert.equal(characterVision(undefined, npc).trueSight, 18);
});
test('invisibility needs the correct senses and See Invisibility does not create light', () => {
  const token = { id: 'hidden', x: 10, y: 5, size: 1 } as BattleToken,
    normal = computeVision({ ...map, lighting: 'day' }, [], [], [], [], [eye]);
  assert.equal(
    visionToken(withCreatureVision(normal, [token], { hidden: ['Invisível'] }, []), token),
    false,
  );
  const truth = computeVision(
    { ...map, lighting: 'day' },
    [],
    [],
    [],
    [],
    [{ ...eye, trueSight: 18 }],
  );
  assert.equal(
    visionToken(withCreatureVision(truth, [token], { hidden: ['Invisível'] }, []), token),
    true,
  );
  const fx = {
      active: true,
      definition: { entry: { catalog_id: 'ver-o-invisivel' }, scene_targets: ['viewer'] },
      name: 'Ver o Invisível',
    } as unknown as BattleSpellEffect,
    viewer = { id: 'viewer', character_id: 'hero', x: 5, y: 5, size: 1 } as BattleToken,
    character = { id: 'hero', sheet: defaultSheet() } as Character;
  const boosted = observerFromToken(viewer, [character], [], [fx], [], [viewer, token]);
  assert.equal(boosted.seeInvisible, true);
  assert.equal(boosted.darkvision, 0);
  assert.equal(visionCell(computeVision(map, [], [], [], [], [boosted]), 10, 5), false);
  const outlined = {
    active: true,
    definition: { entry: { catalog_id: 'fogo-das-fadas' }, light_targets: ['hidden'] },
  } as unknown as BattleSpellEffect;
  assert.equal(
    visionToken(withCreatureVision(normal, [token], { hidden: ['Invisível'] }, [outlined]), token),
    true,
  );
});
test('fifteen conditions and cumulative exhaustion affect derived stats and resting', () => {
  assert.equal(CONDITION_NAMES.length, 15);
  assert.equal(conditionSpeed(9, ['Incapacitado']), 9);
  assert.equal(conditionSpeed(9, ['Agarrado']), 0);
  const sheet = { ...defaultSheet(), hp_max_override: 40, hp_current: 20, exhaustion: 4 };
  assert.equal(calculate(sheet).hpMax, 20);
  assert.equal(calculate(sheet).speed, 4.5);
  assert.equal(calculate(sheet).saveDisadvantage, true);
  const rested = characterRest(sheet, 'long').sheet;
  assert.equal(rested.exhaustion, 3);
  assert.equal(rested.hp_current, 40);
  assert.equal(calculate(rested).hpMax, 40);
});
test('crawl previews add one terrain unit and preserve the original terrain', () => {
  const terrain = [
      {
        id: 'difficult',
        map_id: 'map',
        x: 1,
        y: 1,
        z: 0,
        movement_cost: 2,
        terrain_type: 'difficult',
        blocked: false,
        metadata: {},
      },
    ] as BattleMapCell[],
    result = conditionMovementCells(terrain, { ...map, width: 3, height: 3 }, ['Caído']);
  assert.equal(result.find((c) => c.x === 1 && c.y === 1)!.movement_cost, 3);
  assert.equal(result.find((c) => c.x === 0 && c.y === 0)!.movement_cost, 2);
  assert.equal(terrain[0].movement_cost, 2);
});
