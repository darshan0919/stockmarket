'use strict';
const { filingClusterFlags } = require('./filingClusterFlags');
const n = (id, type, date, text) => ({ id, type, date, text });
test('flags clusters inside the window only', () => {
  const r = filingClusterFlags(
    [
      n('a', 'management_change', '2026-06-01', 'CFO resigned'),
      n('b', 'management_change', '2026-08-01', 'CEO steps down'),
      n('old', 'management_change', '2024-01-01', 'CS resigned'),
      n('c', 'fundraise', '2026-03-01', 'warrants issued to promoters'),
      n('d', 'fundraise', '2026-07-01', 'QIP of Rs 200 crore'),
      n('e', 'order_book', '2026-08-01', 'Order worth ₹180 crore from X'),
      n('f', 'order_book', '2026-08-10', 'Re-post: ₹180 crore order from X'),
    ],
    '2026-09-01'
  );
  const codes = r.flags.map((f) => f.code);
  expect(codes).toEqual(
    expect.arrayContaining(['KMP_EXIT_CLUSTER', 'REPEAT_DILUTION', 'POSSIBLE_DUPLICATE_ORDER'])
  );
  expect(r.flags.find((f) => f.code === 'KMP_EXIT_CLUSTER').ids).toEqual(['a', 'b']);
});
test('no flags for a single event', () => {
  expect(
    filingClusterFlags([n('a', 'management_change', '2026-06-01', 'CFO resigned')], '2026-09-01')
      .flags
  ).toEqual([]);
});
