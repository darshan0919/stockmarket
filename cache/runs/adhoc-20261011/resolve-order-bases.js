const {
  recordLlmResolution,
} = require('../../../packages/jobs-runtime/scripts/orderbook/extractOrderBook.js');

// FABCLEAN: bullet only gives quarterly new-orders (Rs96.5cr) and inquiry
// pipeline (Rs9,300cr) -- neither is a stated company-wide outstanding
// order-book TOTAL, so per the prompt's own instruction this resolves to null.
const fab = recordLlmResolution('BSE:FABCLEAN', '202606', {
  valueCr: null,
  unit: 'cr',
  label: 'no company-wide order-book total stated',
  reasoning:
    'Bullet gives only Q1 new-orders added (Rs96.5cr) and inquiry pipeline (Rs9,300cr); neither is a stated outstanding backlog total.',
});
console.log('FABCLEAN resolution:', JSON.stringify(fab));

// VIVIANA: bullet 1 explicitly states the company-wide current order book
// total (Rs1,312.53cr); bullet 2 is FY27 forward guidance, not current backlog.
const viv = recordLlmResolution('NSE:VIVIANA', '202606', {
  valueCr: 1312.53,
  unit: 'cr',
  label: 'Order book crossed a milestone: Rs1,312.53 crores',
  reasoning:
    'Explicit company-wide current order-book total stated; the Rs500-600cr figure is FY27 forward guidance, not current backlog.',
});
console.log('VIVIANA resolution:', JSON.stringify(viv));
