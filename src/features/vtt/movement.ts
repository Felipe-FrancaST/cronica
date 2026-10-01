import type {
  BattleMapCell,
  BattleToken,
  DiagonalRule,
  GridPoint,
  GridUnit,
  MovementResult,
  MovementRules,
} from './types';

const key = (p: GridPoint) => `${p.x}:${p.y}`;
type SearchState = { point: GridPoint; diagonals: number };
const stateKey = (state: SearchState, rule: DiagonalRule) =>
  rule === 'five-ten-five' ? `${key(state.point)}:${state.diagonals % 2}` : key(state.point);
const same = (a: GridPoint, b: GridPoint) => a.x === b.x && a.y === b.y;
const SQRT2 = Math.SQRT2;

class MinHeap<T> {
  private data: Array<{ value: T; priority: number }> = [];
  get size() {
    return this.data.length;
  }
  push(value: T, priority: number) {
    const item = { value, priority };
    this.data.push(item);
    let index = this.data.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.data[parent].priority <= item.priority) break;
      this.data[index] = this.data[parent];
      index = parent;
    }
    this.data[index] = item;
  }
  pop(): T | undefined {
    if (!this.data.length) return undefined;
    const root = this.data[0].value;
    const last = this.data.pop()!;
    if (!this.data.length) return root;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.data.length) break;
      let child = left;
      if (right < this.data.length && this.data[right].priority < this.data[left].priority)
        child = right;
      if (this.data[child].priority >= last.priority) break;
      this.data[index] = this.data[child];
      index = child;
    }
    this.data[index] = last;
    return root;
  }
}

export function convertDistance(value: number, from: GridUnit, to: GridUnit) {
  if (from === to) return value;
  return from === 'm' ? value * 3.280839895 : value / 3.280839895;
}

export function cellsToDistance(cells: number, scalePerCell: number) {
  return cells * scalePerCell;
}

export function distanceToCells(distance: number, scalePerCell: number) {
  return scalePerCell > 0 ? distance / scalePerCell : 0;
}

export function pathDistanceInCells(from: GridPoint, path: GridPoint[], rule: DiagonalRule) {
  let previous = from;
  let diagonalCount = 0;
  let distance = 0;
  for (const point of path) {
    const diagonal = point.x !== previous.x && point.y !== previous.y;
    if (diagonal) diagonalCount += 1;
    distance += diagonal ? diagonalFactor(rule, diagonalCount) : 1;
    previous = point;
  }
  return distance;
}

function diagonalFactor(rule: DiagonalRule, diagonalIndex: number) {
  if (rule === 'sqrt2') return SQRT2;
  if (rule === 'five-ten-five') return diagonalIndex % 2 === 1 ? 1 : 2;
  return 1;
}

function heuristic(a: GridPoint, b: GridPoint, rule: DiagonalRule) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  if (rule === 'one' || rule === 'five-ten-five') return Math.max(dx, dy);
  const diagonal = Math.min(dx, dy);
  return diagonal * SQRT2 + Math.abs(dx - dy);
}

function neighbors(point: GridPoint, width: number, height: number) {
  const out: GridPoint[] = [];
  for (let y = -1; y <= 1; y += 1) {
    for (let x = -1; x <= 1; x += 1) {
      if ((!x && !y) || point.x + x < 0 || point.y + y < 0) continue;
      if (point.x + x >= width || point.y + y >= height) continue;
      out.push({ x: point.x + x, y: point.y + y });
    }
  }
  return out;
}

function terrainIndex(cells: BattleMapCell[]) {
  return new Map(cells.map((cell) => [key(cell), cell]));
}

function occupiedIndex(tokens: BattleToken[], ignoredTokenId?: string) {
  return new Set(
    tokens
      .filter((token) => token.id !== ignoredTokenId && token.visible)
      .map((token) => key(token)),
  );
}

function isBlocked(point: GridPoint, terrain: Map<string, BattleMapCell>, occupied: Set<string>) {
  return Boolean(terrain.get(key(point))?.blocked || occupied.has(key(point)));
}

function cutsBlockedCorner(
  from: GridPoint,
  to: GridPoint,
  terrain: Map<string, BattleMapCell>,
  occupied: Set<string>,
) {
  if (from.x === to.x || from.y === to.y) return false;
  return (
    isBlocked({ x: to.x, y: from.y }, terrain, occupied) ||
    isBlocked({ x: from.x, y: to.y }, terrain, occupied)
  );
}

export function calculateMovementCost(input: {
  from: GridPoint;
  to: GridPoint;
  width: number;
  height: number;
  cells: BattleMapCell[];
  tokens: BattleToken[];
  rules: MovementRules;
  movingTokenId?: string;
  maxCost?: number;
}): MovementResult {
  const { from, to, width, height, cells, tokens, rules, movingTokenId, maxCost } = input;
  if (to.x < 0 || to.y < 0 || to.x >= width || to.y >= height)
    return { distance: 0, cost: 0, path: [], allowed: false, reason: 'Destino fora do mapa.' };
  if (same(from, to)) return { distance: 0, cost: 0, path: [], allowed: true };

  const terrain = terrainIndex(cells);
  const occupied = occupiedIndex(tokens, movingTokenId);
  if (!rules.allowOccupiedDestination && occupied.has(key(to)))
    return { distance: 0, cost: 0, path: [], allowed: false, reason: 'A célula está ocupada.' };

  const open = new MinHeap<SearchState>();
  const cameFrom = new Map<string, string>();
  const states = new Map<string, SearchState>();
  const g = new Map<string, number>();
  const initial: SearchState = { point: from, diagonals: 0 };
  const initialKey = stateKey(initial, rules.diagonalRule);
  g.set(initialKey, 0);
  states.set(initialKey, initial);
  const minimumTerrainCost = cells.reduce(
    (minimum, cell) => Math.min(minimum, Math.max(0.01, cell.movement_cost)),
    1,
  );
  open.push(initial, heuristic(from, to, rules.diagonalRule) * minimumTerrainCost);

  while (open.size) {
    const current = open.pop()!;
    const currentKey = stateKey(current, rules.diagonalRule);
    if (same(current.point, to)) {
      const path: GridPoint[] = [];
      let cursorKey = currentKey;
      while (cursorKey !== initialKey) {
        const cursor = states.get(cursorKey);
        if (!cursor) break;
        path.unshift(cursor.point);
        const previous = cameFrom.get(cursorKey);
        if (!previous) break;
        cursorKey = previous;
      }
      const cost = g.get(currentKey) ?? 0;
      return {
        distance: path.length,
        cost,
        path,
        allowed: maxCost === undefined || cost <= maxCost + Number.EPSILON,
        reason:
          maxCost !== undefined && cost > maxCost
            ? 'Movimento acima do limite disponível.'
            : undefined,
      };
    }

    for (const next of neighbors(current.point, width, height)) {
      const nextCellKey = key(next);
      const cell = terrain.get(nextCellKey);
      if (cell?.blocked || cutsBlockedCorner(current.point, next, terrain, occupied)) continue;
      if (occupied.has(nextCellKey) && !same(next, to)) continue;
      if (occupied.has(nextCellKey) && same(next, to) && !rules.allowOccupiedDestination) continue;

      const diagonal = next.x !== current.point.x && next.y !== current.point.y;
      const diagonalCount = current.diagonals + (diagonal ? 1 : 0);
      const nextState: SearchState = { point: next, diagonals: diagonalCount };
      const nextStateKey = stateKey(nextState, rules.diagonalRule);
      const stepBase = Math.max(0.01, cell?.movement_cost ?? 1);
      const factor = diagonal ? diagonalFactor(rules.diagonalRule, diagonalCount) : 1;
      const tentative = (g.get(currentKey) ?? Infinity) + stepBase * factor;
      if (tentative >= (g.get(nextStateKey) ?? Infinity)) continue;

      cameFrom.set(nextStateKey, currentKey);
      states.set(nextStateKey, nextState);
      g.set(nextStateKey, tentative);
      open.push(nextState, tentative + heuristic(next, to, rules.diagonalRule) * minimumTerrainCost);
    }
  }

  return { distance: 0, cost: 0, path: [], allowed: false, reason: 'Não existe caminho disponível.' };
}

export function reachableCells(input: {
  from: GridPoint;
  width: number;
  height: number;
  cells: BattleMapCell[];
  tokens: BattleToken[];
  rules: MovementRules;
  movingTokenId?: string;
  maxCost: number;
}) {
  const result = new Map<string, number>();
  const stateCosts = new Map<string, number>();
  const terrain = terrainIndex(input.cells);
  const occupied = occupiedIndex(input.tokens, input.movingTokenId);
  const queue = new MinHeap<{ state: SearchState; cost: number }>();
  const initial: SearchState = { point: input.from, diagonals: 0 };
  const initialStateKey = stateKey(initial, input.rules.diagonalRule);
  queue.push({ state: initial, cost: 0 }, 0);
  stateCosts.set(initialStateKey, 0);
  result.set(key(input.from), 0);

  while (queue.size) {
    const current = queue.pop()!;
    const currentStateKey = stateKey(current.state, input.rules.diagonalRule);
    if (current.cost > (stateCosts.get(currentStateKey) ?? Infinity)) continue;
    for (const next of neighbors(current.state.point, input.width, input.height)) {
      const nextCellKey = key(next);
      const cell = terrain.get(nextCellKey);
      if (
        cell?.blocked ||
        occupied.has(nextCellKey) ||
        cutsBlockedCorner(current.state.point, next, terrain, occupied)
      )
        continue;
      const diagonal = next.x !== current.state.point.x && next.y !== current.state.point.y;
      const diagonalCount = current.state.diagonals + (diagonal ? 1 : 0);
      const nextState: SearchState = { point: next, diagonals: diagonalCount };
      const nextStateKey = stateKey(nextState, input.rules.diagonalRule);
      const step =
        Math.max(0.01, cell?.movement_cost ?? 1) *
        (diagonal ? diagonalFactor(input.rules.diagonalRule, diagonalCount) : 1);
      const cost = current.cost + step;
      if (
        cost > input.maxCost + Number.EPSILON ||
        cost >= (stateCosts.get(nextStateKey) ?? Infinity)
      )
        continue;
      stateCosts.set(nextStateKey, cost);
      if (cost < (result.get(nextCellKey) ?? Infinity)) result.set(nextCellKey, cost);
      queue.push({ state: nextState, cost }, cost);
    }
  }
  return result;
}

