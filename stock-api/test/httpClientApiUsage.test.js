'use strict';

const { HttpClient, apiLabelFor } = require('../src/http/HttpClient');
const apiUsageCounter = require('@stock/cloud-utils/src/apiUsageCounter');

describe('apiLabelFor', () => {
  test('maps known hosts to short labels', () => {
    expect(apiLabelFor('https://api.stockscans.in/api/company/search')).toBe('stockscans');
    expect(apiLabelFor('https://www.screener.in/api/x')).toBe('screener');
    expect(apiLabelFor('https://www.nseindia.com/api/x')).toBe('nse');
    expect(apiLabelFor('https://www.bseindia.com/x')).toBe('bse');
    expect(apiLabelFor('https://api.perplexity.ai/chat')).toBe('perplexity');
  });

  test('falls back to "other" for an unrecognized host', () => {
    expect(apiLabelFor('https://example.com/x')).toBe('other');
    expect(apiLabelFor()).toBe('other');
  });
});

describe('HttpClient API-usage tracking (jobName lives on the instance, no shared global)', () => {
  afterEach(() => {
    apiUsageCounter.reset();
  });

  function fakeAxios({ getOk = true } = {}) {
    return {
      get: getOk ? async () => ({ data: {} }) : async () => { throw new Error('boom'); },
      post: async () => ({ data: {} }),
      put: async () => ({ data: {} }),
      delete: async () => ({ data: {} }),
    };
  }

  test('does not record anything when the instance has no jobName', async () => {
    const http = new HttpClient({ axiosInstance: fakeAxios() });
    await http.get('https://api.stockscans.in/x');
    expect(apiUsageCounter.activeJobs()).toEqual([]);
  });

  test('records a successful GET under the derived api label, for this instance\'s jobName', async () => {
    const http = new HttpClient({
      jobName: 'daily-gainers-signal-stockmarket',
      axiosInstance: fakeAxios(),
    });
    await http.get('https://api.stockscans.in/x');
    const summary = apiUsageCounter.getSummary('daily-gainers-signal-stockmarket');
    expect(summary.byApi.stockscans).toEqual({ count: 1, ok: 1, failed: 0 });
  });

  test('records a failed call and still rethrows the original error', async () => {
    const http = new HttpClient({
      jobName: 'daily-gainers-signal-stockmarket',
      axiosInstance: fakeAxios({ getOk: false }),
    });
    await expect(http.get('https://www.nseindia.com/x')).rejects.toThrow('boom');
    const summary = apiUsageCounter.getSummary('daily-gainers-signal-stockmarket');
    expect(summary.byApi.nse).toEqual({ count: 1, ok: 0, failed: 1 });
  });

  test('post/put/delete are all tracked under the same api label', async () => {
    const http = new HttpClient({
      jobName: 'watchlist-sync-stockmarket',
      axiosInstance: fakeAxios(),
    });
    await http.post('https://api.stockscans.in/a', {});
    await http.put('https://api.stockscans.in/b', {});
    await http.delete('https://api.stockscans.in/c');
    expect(apiUsageCounter.getSummary('watchlist-sync-stockmarket').byApi.stockscans.count).toBe(3);
  });

  test('two HttpClient instances with different jobNames in the same process never interfere', async () => {
    // The concurrency scenario this design targets: two jobs' HttpClient
    // instances co-existing (even used concurrently via Promise.all) in one
    // process must attribute independently — no shared/global "active job".
    const httpA = new HttpClient({ jobName: 'job-a', axiosInstance: fakeAxios() });
    const httpB = new HttpClient({ jobName: 'job-b', axiosInstance: fakeAxios() });

    await Promise.all([
      httpA.get('https://api.stockscans.in/a1'),
      httpB.get('https://api.stockscans.in/b1'),
      httpA.get('https://api.stockscans.in/a2'),
    ]);

    expect(apiUsageCounter.totalCalls('job-a')).toBe(2);
    expect(apiUsageCounter.totalCalls('job-b')).toBe(1);
  });

  test('mutating jobName on an existing instance (e.g. via a client\'s setJobName) changes future attribution', async () => {
    const http = new HttpClient({ axiosInstance: fakeAxios() });
    await http.get('https://api.stockscans.in/untracked');
    expect(apiUsageCounter.activeJobs()).toEqual([]);

    http.jobName = 'daily-gainers-signal-stockmarket'; // what StockscansClient.setJobName does internally
    await http.get('https://api.stockscans.in/tracked');
    expect(apiUsageCounter.totalCalls('daily-gainers-signal-stockmarket')).toBe(1);
  });
});
