import test from 'node:test';
import assert from 'node:assert/strict';

import { formatMarkdown, formatMarkdownTables } from './markdown-format.js';

test('formatMarkdown renders code fences in terminal boxes', () => {
  const output = formatMarkdown('```js\nconst ok = true;\n```');

  assert.match(output, /js/);
  assert.match(output, /const/);
  assert(!output.includes('```'));
});

test('formatMarkdownTables converts pipe tables into boxed output', () => {
  const output = formatMarkdownTables('| A | B |\n| --- | --- |\n| one | two |');

  assert.match(output, /TABLE/);
  assert.match(output, /one/);
  assert(!output.includes('| --- |'));
});
