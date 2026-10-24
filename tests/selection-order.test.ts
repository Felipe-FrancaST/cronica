import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, Fragment } from 'react';
import { sortedOptions } from '../src/components/ui';
const names = (options: any[]) => options.map((o) => o.props.children);
test('Portuguese alphabetical order keeps placeholders first and quantities numeric', () => {
  assert.deepEqual(
    names(
      sortedOptions([
        h('option', { value: 'z' }, 'Zumbi'),
        h('option', { value: '' }, 'Escolher'),
        h('option', { value: 'a' }, 'Águia'),
        h('option', { value: 'b' }, 'Bárbaro'),
      ]) as any[],
    ),
    ['Escolher', 'Águia', 'Bárbaro', 'Zumbi'],
  );
  assert.deepEqual(
    names(
      sortedOptions([
        h('option', { value: 10 }, '10'),
        h('option', { value: 2 }, '2'),
        h('option', { value: 1 }, '1'),
      ]) as any[],
    ),
    ['1', '2', '10'],
  );
});
test('fragments and optgroups sort without changing option IDs', () => {
  const options = sortedOptions(
    h(Fragment, null, h('option', { value: 'b' }, 'Bardo'), h('option', { value: 'a' }, 'Anão')),
  ) as any[];
  assert.deepEqual(
    options.map((o) => o.props.value),
    ['a', 'b'],
  );
  const group = sortedOptions(
    h(
      'optgroup',
      { label: 'Raças' },
      h('option', { value: 'elf' }, 'Elfo'),
      h('option', { value: 'dwarf' }, 'Anão'),
    ),
  ) as any[];
  assert.deepEqual(names(group[0].props.children), ['Anão', 'Elfo']);
});
