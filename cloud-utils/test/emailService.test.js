'use strict';

const { stockscansUrl, stockscansLink, sanitizeSymbol, appendApiUsageFooter, sendHtmlEmail } = require('../src/emailService');
const apiUsageCounter = require('../src/apiUsageCounter');
const deliveryUsageCounter = require('../src/deliveryUsageCounter');

describe('sanitizeSymbol', () => {
  test('strips a known series suffix', () => {
    expect(sanitizeSymbol('NSE:SOMECO-BE')).toBe('NSE:SOMECO');
    expect(sanitizeSymbol('SOMECO-SM')).toBe('SOMECO');
  });

  test('leaves an unsuffixed symbol untouched', () => {
    expect(sanitizeSymbol('NSE:NAZARA')).toBe('NSE:NAZARA');
  });

  test('handles empty/undefined input', () => {
    expect(sanitizeSymbol()).toBe('');
    expect(sanitizeSymbol(null)).toBe('');
  });
});

describe('stockscansUrl', () => {
  test('builds the URL from an exchange-prefixed symbol', () => {
    expect(stockscansUrl('NSE:NAZARA')).toBe('https://www.stockscans.in/company/NSE:NAZARA');
  });

  test('strips a series suffix before building the URL — the bug this fixes', () => {
    expect(stockscansUrl('NSE:SOMECO-BE')).toBe('https://www.stockscans.in/company/NSE:SOMECO');
  });

  test('defaults to NSE when the symbol has no exchange prefix, still sanitized', () => {
    expect(stockscansUrl('SOMECO-SM')).toBe('https://www.stockscans.in/company/NSE:SOMECO');
  });

  test('respects an explicit exchange override', () => {
    expect(stockscansUrl('500325-BE', 'BSE')).toBe('https://www.stockscans.in/company/BSE:500325');
  });

  test('returns empty string for falsy symbol', () => {
    expect(stockscansUrl('')).toBe('');
    expect(stockscansUrl(null)).toBe('');
  });
});

describe('stockscansLink', () => {
  test('wraps the name in an anchor pointing at the sanitized URL', () => {
    const html = stockscansLink('Nazara Technologies Ltd', 'NSE:NAZARA');
    expect(html).toContain('href="https://www.stockscans.in/company/NSE:NAZARA"');
    expect(html).toContain('>Nazara Technologies Ltd<');
    expect(html).toContain('target="_blank"');
  });

  test('a suffixed symbol still produces a working (sanitized) link', () => {
    const html = stockscansLink('Some SME Co', 'SOMECO-SM');
    expect(html).toContain('href="https://www.stockscans.in/company/NSE:SOMECO"');
  });

  test('HTML-escapes the company name', () => {
    const html = stockscansLink('A & B <Co>', 'NSE:AB');
    expect(html).toContain('A &amp; B &lt;Co&gt;');
    expect(html).not.toContain('<Co>');
  });

  test('falls back to plain name (no link) when symbol is missing', () => {
    expect(stockscansLink('No Symbol Co', '')).toBe('No Symbol Co');
  });
});

describe('appendApiUsageFooter (jobName is an explicit argument, no global)', () => {
  afterEach(() => {
    apiUsageCounter.reset();
  });

  test('returns the body unchanged when no jobName is given', () => {
    const html = '<html><body>hi</body></html>';
    expect(appendApiUsageFooter(html)).toBe(html);
    expect(appendApiUsageFooter(html, null)).toBe(html);
  });

  test('returns the body unchanged when the given job made zero calls', () => {
    const html = '<html><body>hi</body></html>';
    expect(appendApiUsageFooter(html, 'some-job')).toBe(html);
  });

  test('appends a per-API call-count table before </body> when calls were recorded for that job', () => {
    apiUsageCounter.record('daily-gainers-signal-stockmarket', { api: 'stockscans', ok: true });
    apiUsageCounter.record('daily-gainers-signal-stockmarket', { api: 'stockscans', ok: true });
    apiUsageCounter.record('daily-gainers-signal-stockmarket', { api: 'nse', ok: false });

    const html = appendApiUsageFooter(
      '<html><body><h1>Digest</h1></body></html>',
      'daily-gainers-signal-stockmarket'
    );
    expect(html).toContain('<h1>Digest</h1>');
    expect(html).toContain('API usage — daily-gainers-signal-stockmarket (3 calls)');
    expect(html).toContain('stockscans');
    expect(html).toContain('nse');
    expect(html).toContain('1 failed');
    // Footer lands before the closing body tag, not appended after it.
    expect(html.indexOf('API usage')).toBeLessThan(html.indexOf('</body>'));
  });

  test('only renders the requested job\'s summary, even if another job also has counts', () => {
    apiUsageCounter.record('job-a', { api: 'stockscans', ok: true });
    apiUsageCounter.record('job-b', { api: 'nse', ok: true });

    const html = appendApiUsageFooter('<html><body>hi</body></html>', 'job-a');
    expect(html).toContain('API usage — job-a (1 call)');
    expect(html).not.toContain('job-b');
    expect(html).not.toContain('nse');
  });

  test('HTML-escapes the job name', () => {
    apiUsageCounter.record('<script>alert(1)</script>', { api: 'stockscans', ok: true });
    const html = appendApiUsageFooter('<html><body>hi</body></html>', '<script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('appends the footer even when the body has no closing tag', () => {
    apiUsageCounter.record('daily-gainers-signal-stockmarket', { api: 'stockscans', ok: true });
    const html = appendApiUsageFooter('<div>no body tag here</div>', 'daily-gainers-signal-stockmarket');
    expect(html).toContain('<div>no body tag here</div>');
    expect(html).toContain('API usage — daily-gainers-signal-stockmarket');
  });
});

describe('sendHtmlEmail — deliveryUsageCounter wiring (conventions.md §25)', () => {
  const ORIGINAL_PWD = process.env.GOOGLE_APP_PASSWORD;

  beforeEach(() => {
    delete process.env.GOOGLE_APP_PASSWORD;
    deliveryUsageCounter.reset();
  });

  afterEach(() => {
    if (ORIGINAL_PWD === undefined) delete process.env.GOOGLE_APP_PASSWORD;
    else process.env.GOOGLE_APP_PASSWORD = ORIGINAL_PWD;
    deliveryUsageCounter.reset();
  });

  test('records a skipped outcome (with reason) when GOOGLE_APP_PASSWORD is unset', async () => {
    const result = await sendHtmlEmail({
      subject: 'test',
      htmlBody: '<p>hi</p>',
      jobName: 'test-delivery-job',
    });
    expect(result).toEqual({ status: 'skipped', reason: 'GOOGLE_APP_PASSWORD not set' });

    const summary = deliveryUsageCounter.getSummary('test-delivery-job');
    expect(summary.skipped).toBe(1);
    expect(summary.sent).toBe(0);
    expect(summary.bySkipReason).toEqual({ 'GOOGLE_APP_PASSWORD not set': 1 });
  });

  test('a falsy jobName is a silent no-op, same as apiUsageCounter', async () => {
    await sendHtmlEmail({ subject: 'test', htmlBody: '<p>hi</p>' });
    expect(deliveryUsageCounter.activeJobs()).toEqual([]);
  });
});

