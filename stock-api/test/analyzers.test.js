const { computeMetrics, hhiClassification } = require('../src/analyzers/computeConcentration');
const { extractValueCrore, classify, THRESHOLDS } = require('../src/analyzers/catalystRules');
const { sniffAndParse } = require('../src/analyzers/parseTweetDump');

describe('computeConcentration', () => {
  it('hhiClassification', () => {
    expect(hhiClassification(1000)).toBe('Competitive/Fragmented');
    expect(hhiClassification(2000)).toBe('Moderately Concentrated');
    expect(hhiClassification(3000)).toBe('Highly Concentrated');
    expect(hhiClassification(6000)).toBe('Near-Monopoly');
  });

  it('computeMetrics', () => {
    const named = [22.5, 18.3, 14.1, 9.8, 7.2, 5.5, 4.1, 3.0, 2.5, 2.0];
    const metrics = computeMetrics(named, 11.0);
    expect(metrics.CR3).toBe(54.9);
    expect(metrics.sum_check).toBe(100);
    expect(metrics.n_named).toBe(10);
  });
});

describe('catalystRules', () => {
  it('extractValueCrore', () => {
    expect(extractValueCrore('Rs. 1,500 crore')).toBe(1500);
    expect(extractValueCrore('INR 50.5 million')).toBe(5.05);
    expect(extractValueCrore('$2 billion')).toBe(2 * 1e9 * 86 / 1e7);
  });

  it('classify', () => {
    const ann = {
      title: 'Award of Order',
      description: 'The company has bagged an order worth Rs 1,000 crore from Reliance.',
      companyId: '123'
    };
    const company = {
      Revenue: 2000,
      'Market Capitalization': 5000
    };
    const res = classify(ann, company);
    expect(res).not.toBeNull();
    expect(res.category).toBe('ORDER WIN');
    expect(res.severity).toBe('HIGH');
    expect(res.value_cr).toBe(1000);
  });
});

describe('parseTweetDump', () => {
  it('sniffAndParse api_v2', () => {
    const raw = JSON.stringify({
      data: [{ id: "123", text: "Hello", created_at: "2025-01-01T00:00:00Z" }]
    });
    const parsed = sniffAndParse(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("123");
    expect(parsed[0].source_format).toBe("api_v2");
  });
  
  it('sniffAndParse csv', () => {
    const raw = `tweet_id,text,date\n123,Hello,2025-01-01T00:00:00Z`;
    const parsed = sniffAndParse(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("123");
    expect(parsed[0].source_format).toBe("csv");
  });
});
