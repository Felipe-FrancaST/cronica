import test from 'node:test';
import assert from 'node:assert/strict';
import { readMigration } from '../scripts/migration-sources.mjs';

test('migration 036 stays within its 256 KiB browser SQL Editor request budget', () => {
  const sql = readMigration('202610220036_character_creation_and_book_options.sql');
  assert.ok(
    Buffer.byteLength(sql, 'utf8') <= 256 * 1024,
    'Keep the complete migration compact, including all catalog values.',
  );
});
