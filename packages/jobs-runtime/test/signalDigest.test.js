'use strict';

const { formatDigest } = require('../lib/signalDigest');

describe('formatDigest', () => {
  test('returns null (no email) when there are no transitions', () => {
    expect(formatDigest([], [{ signalId: 'M3', entityId: 'IN', since: 'x' }])).toBeNull();
  });
  test('lists transitions, escapes html, shows active states', () => {
    const d = formatDigest(
      [
        {
          date: '2026-10-09',
          signalId: 'M3-weak-macro',
          entityType: 'market',
          entityId: 'IN',
          from: null,
          to: 'confirmed',
          evidence: { note: '<b>' },
        },
      ],
      [{ signalId: 'M3-weak-macro', entityId: 'IN', since: '2026-10-09' }],
      { label: 'since 2026-10-09' }
    );
    expect(d.subject).toBe('Signal changes since 2026-10-09 (1)');
    expect(d.html).toContain('none &rarr; <b>confirmed</b>');
    expect(d.html).toContain('&lt;b&gt;');
    expect(d.html).toContain('M3-weak-macro (IN) since 2026-10-09');
  });
});
