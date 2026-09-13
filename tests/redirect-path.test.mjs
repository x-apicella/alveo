import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeRedirectPath } from '../src/lib/redirect-path.ts';

test('SSO navigation preserves local destinations and blocks parsed external origins', () => {
  const origin = 'https://alveo.example.com';
  assert.equal(safeRedirectPath('/s/example?view=chat', origin), '/s/example?view=chat');
  for (const value of ['//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)', '/\n/evil.example']) {
    assert.equal(safeRedirectPath(value, origin), '/');
  }
});
