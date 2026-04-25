import assert from 'node:assert/strict';
import { test } from 'node:test';

import { prependReleaseNotes, renderReleaseNotes } from '../src/foundation/changelog.mjs';

test('release notes group merged pull requests and link referenced issues', () => {
  const notes = renderReleaseNotes({
    version: '0.2.0',
    date: '2026-04-25',
    entries: [
      {
        number: 12,
        title: 'Document release process',
        url: 'https://github.com/xlabtg/Teleton-Client/pull/12',
        labels: [{ name: 'documentation' }],
        body: 'Fixes #9'
      },
      {
        number: 10,
        title: 'Add proxy settings',
        url: 'https://github.com/xlabtg/Teleton-Client/pull/10',
        labels: [{ name: 'enhancement' }],
        body: 'Refs #3'
      }
    ]
  });

  assert.match(notes, /^## \[0\.2\.0] - 2026-04-25/m);
  assert.match(notes, /Review required before publication/);
  assert.match(notes, /### Features\n- Add proxy settings \(\[#10]\(https:\/\/github.com\/xlabtg\/Teleton-Client\/pull\/10\); refs #3\)/);
  assert.match(notes, /### Documentation\n- Document release process \(\[#12]\(https:\/\/github.com\/xlabtg\/Teleton-Client\/pull\/12\); refs #9\)/);
});

test('release notes redact common token formats from pull request titles', () => {
  const notes = renderReleaseNotes({
    version: '0.1.1',
    date: '2026-04-25',
    entries: [
      {
        number: 14,
        title: 'Remove leaked ghp_abcdefghijklmnopqrstuvwxyz1234567890 token',
        url: 'https://github.com/xlabtg/Teleton-Client/pull/14',
        labels: ['security']
      }
    ]
  });

  assert.doesNotMatch(notes, /ghp_/);
  assert.match(notes, /\[REDACTED_TOKEN]/);
});

test('release notes can be prepended without replacing existing reviewed entries', () => {
  const existing = '# Changelog\n\n## [0.1.0] - 2026-04-01\n\n### Maintenance\n- Initial foundation ([#1](https://github.com/xlabtg/Teleton-Client/pull/1))\n';
  const next = renderReleaseNotes({
    version: '0.1.1',
    date: '2026-04-25',
    entries: [
      {
        number: 2,
        title: 'Validate release metadata',
        url: 'https://github.com/xlabtg/Teleton-Client/pull/2',
        labels: ['ci']
      }
    ]
  });

  const updated = prependReleaseNotes(existing, next);

  assert.match(updated, /^# Changelog\n\n## \[0\.1\.1] - 2026-04-25/);
  assert.match(updated, /## \[0\.1\.0] - 2026-04-01/);
  assert.throws(() => prependReleaseNotes(updated, next), /already contains/);
});
