import test from 'node:test';
import assert from 'node:assert/strict';
import { computeVision, visionCell, characterVision, observerFromToken, normalizeDarkness, activeSpellLights } from '../src/features/vtt/vision';
import type { BattleMap, BattleMapCell, BattleMapObject, BattleToken, BattleSpellEffect } from '../src/features/vtt/types';
import type { Character } from '../src/types';

const map = { id: 'map', width: 28, height: 20, scale_per_cell: 1.5, scale_unit: 'm',
  lighting: 'night', vision_enabled: true, darkness_level: 'dark' } as BattleMap;
const eye = { x: 5.5, y: 5.5, darkvision: 18, devilSight: 0, trueSight: 0 };
const wall = (x: number, y: number) => ({ x, y, blocked: true } as BattleMapCell);
const visibility = (overrides: Partial<BattleMap> = {}, cells: BattleMapCell[] = [], observers = [eye]) =>
  computeVision({ ...map, ...overrides }, cells, [], [], [], observers);

test('night vision is opt-in, metre-based, and never reveals unknown cells', () => {
  assert.equal(visionCell(visibility(), 17, 5), true); // 12 cells = 18m
  assert.equal(visionCell(visibility(), 18, 5), false);
  assert.equal(visibility({ vision_enabled: false }).enabled, false);
  assert.equal(visionCell(visibility({ vision_enabled: false }), 26, 12), true);
  assert.equal(visibility({}, [], []).visible.some(Boolean), false);
  assert.equal(normalizeDarkness('broken'), 'dark');
});
test('walls block rays, and fog blocks even visible cells', () => {
  const wallCells = Array.from({ length: 20 }, (_, y) => wall(7, y));
  assert.equal(visionCell(visibility({}, wallCells), 9, 5), false);
  assert.equal(visionCell(visibility({}, wallCells), 7, 5), true);
  const withFog = computeVision(map, [], [], [{ id: 'f', map_id: 'map', x: 6, y: 5 }], [], [eye]);
  assert.equal(visionCell(withFog, 6, 5), false);
});
test('normal darkness, dim light, magical darkness, and local light', () => {
  const mortal = [{ ...eye, darkvision: 0 }];
  assert.equal(visionCell(visibility({}, [], mortal), 6, 5), false);
  assert.equal(visionCell(visibility({ darkness_level: 'dim' }, [], mortal), 10, 5), true);
  assert.equal(visionCell(visibility({ darkness_level: 'magical' }, [], [eye]), 6, 5), false);
  assert.equal(visionCell(visibility({ darkness_level: 'magical' }, [], [eye]), 5, 5), false, 'the magical shadow stays opaque even under the player');
  assert.equal(visionCell(visibility({ darkness_level: 'magical' }, [], [{ ...eye, devilSight: 36 }]), 18, 5), true);
  const lit = computeVision(map, [], [], [], [{id: 'light', x: 7, y: 5, height: 1, radius: 5, strength: 1, color: '#ffffff'}], mortal);
  assert.equal(visionCell(lit, 7, 5), true);
});
test('racial range and live spell enhancements are combined for the target', () => {
  const character = { id: 'hero', sheet: { race_id: 'anao', race: 'Anão', class_levels: [{ class_id: 'warlock', level: 2, choices: { invocations: ['devil-sight'] } }], features: '' } } as unknown as Character;
  assert.equal(characterVision(character, undefined).darkvision, 18);
  assert.equal(characterVision(character, undefined).devilSight, 36);
  const token = {id:'hero-token', character_id:'hero', npc_id:null, x:5, y:5, size:1} as BattleToken;
  const spell = { id:'fx', request_id:'request', active:true, name:'Visão da Verdade', target:{x:5,y:5} } as BattleSpellEffect;
  const observer = observerFromToken(token,[character],[],[spell],[],[token]);
  assert.equal(observer.trueSight,36);
  assert.equal(observer.darkvision,18);
});
test('active light spells reveal local cells, follow a token, and expire cleanly', () => {
  const target = { id: 'target', x: 6, y: 7, size: 1 } as BattleToken;
  const spell = { id: 'light-spell', request_id: 'spell-request', active: true, name: 'Luz', target: { x: 6, y: 7 } } as BattleSpellEffect;
  const requests = [{ id: 'spell-request', target_ids: ['target'] }] as unknown as import('../src/features/vtt/types').BattleActionRequest[];
  const light = activeSpellLights([spell], requests, [target], map);
  assert.equal(light.length, 1);
  assert.equal(light[0].radius, 8); // 12 metres / 1.5 metres per cell
  assert.equal(light[0].x, 6.5);
  const mundane = [{ ...eye, darkvision: 0 }];
  assert.equal(visionCell(computeVision(map, [], [], [], light, mundane), 7, 7), true);
  const moved = { ...target, x: 9 };
  assert.equal(activeSpellLights([spell], requests, [moved], map)[0].x, 9.5);
  assert.equal(activeSpellLights([{ ...spell, active: false }], requests, [target], map).length, 0);
});
