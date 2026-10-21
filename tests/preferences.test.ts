import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readPreferences,
  preferencesEqual,
  DEFAULT_PREFERENCES,
  tablePreferenceKey,
} from '../src/lib/preferences';
import {
  readBrowserValue,
  writeBrowserValue,
  removeBrowserValue,
} from '../src/lib/browser-storage';
import { localImageSource, isStorageImagePath } from '../src/lib/media-path';
import { validateImage } from '../src/services/storage';

test('legacy and invalid preferences fall back to supported defaults without coercing strings', () => {
  for (const value of [
    null,
    [],
    '',
    42,
    {},
    { compact_cards: 'false', dice_animation: 'false', vtt_view: 'webgl', text_size: 99 },
  ])
    assert.deepEqual(readPreferences(value), DEFAULT_PREFERENCES);
  const preferences = readPreferences({
    compact_cards: true,
    text_size: 'large',
    motion: 'reduced',
    vtt_view: '2d',
    vtt_quality: 'low',
    dice_animation: false,
    custom: 'preserve in database',
  });
  assert.equal(preferences.vtt_view, '2d');
  assert.equal(preferences.dice_animation, false);
  assert.equal(preferencesEqual(preferences, DEFAULT_PREFERENCES), false);
  assert.equal(preferencesEqual(readPreferences(null), DEFAULT_PREFERENCES), true);
  assert.notEqual(tablePreferenceKey('user-a', 'view'), tablePreferenceKey('user-b', 'view'));
});

test('blocked browser storage cannot throw from login or optional view preferences', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('blocked');
    },
  });
  try {
    assert.equal(readBrowserValue('mode'), null);
    assert.equal(writeBrowserValue('mode', 'master'), false);
    assert.doesNotThrow(() => removeBrowserValue('view'));
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('media rejects network-relative URLs, unsafe data and control-character URL normalization', () => {
  assert.equal(localImageSource('/images/fortress.webp'), '/images/fortress.webp');
  for (const path of [
    '//example.test/track.png',
    '/\\example.test/x',
    '/\t/example.test/x',
    'https://example.test/x',
    'javascript:alert(1)',
    'data:image/svg+xml,<svg/>',
  ])
    assert.equal(localImageSource(path, true), null, path);
  assert.equal(localImageSource('data:image/png;base64,AA=='), null);
  assert.equal(localImageSource('data:image/png;base64,AA==', true), 'data:image/png;base64,AA==');
  assert.equal(isStorageImagePath('profiles/user-id/avatar.webp'), true);
  for (const path of [
    '//example.test/x',
    'profiles/../secret.png',
    'profiles/user/x/../../y',
    'https://example.test/p.png',
  ])
    assert.equal(isStorageImagePath(path), false);
});

test('empty, unsupported and oversized images fail before an upload', () => {
  assert.throws(() => validateImage(new File([], 'empty.png', { type: 'image/png' })), /vazia/);
  assert.throws(
    () => validateImage(new File(['x'], 'unsafe.svg', { type: 'image/svg+xml' })),
    /JPG/,
  );
  assert.throws(
    () =>
      validateImage(
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' }),
      ),
    /5 MB/,
  );
  assert.doesNotThrow(() => validateImage(new File(['png'], 'ok.png', { type: 'image/png' })));
});
