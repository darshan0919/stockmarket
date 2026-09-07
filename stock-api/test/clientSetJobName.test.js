'use strict';

const { StockscansClient } = require('../src/clients/StockscansClient');
const { ScreenerClient } = require('../src/clients/ScreenerClient');
const { PerplexityClient } = require('../src/clients/PerplexityClient');

// setJobName mutates the client's OWN HttpClient instance (this.http.jobName)
// — not any shared/global state. Verified here for all three clients that
// route through HttpClient (StockscansClient, ScreenerClient, PerplexityClient
// — NseClient/BseClient don't use HttpClient at all, see HttpClient.js's header).
describe('Client.setJobName (per-instance, no shared global)', () => {
  test('StockscansClient.setJobName sets this.http.jobName', () => {
    const client = new StockscansClient();
    expect(client.http.jobName).toBeNull();
    client.setJobName('daily-gainers-signal-stockmarket');
    expect(client.http.jobName).toBe('daily-gainers-signal-stockmarket');
  });

  test('StockscansClient.setJobName(null) clears it', () => {
    const client = new StockscansClient();
    client.setJobName('some-job');
    client.setJobName(null);
    expect(client.http.jobName).toBeNull();
  });

  test('ScreenerClient.setJobName sets this.http.jobName', () => {
    const client = new ScreenerClient();
    client.setJobName('watchlist-sync-stockmarket');
    expect(client.http.jobName).toBe('watchlist-sync-stockmarket');
  });

  test('PerplexityClient.setJobName sets this.http.jobName', () => {
    const client = new PerplexityClient();
    client.setJobName('manual-mna-tracker');
    expect(client.http.jobName).toBe('manual-mna-tracker');
  });

  test('two client instances have independent jobNames', () => {
    const clientA = new StockscansClient();
    const clientB = new StockscansClient();
    clientA.setJobName('job-a');
    clientB.setJobName('job-b');
    expect(clientA.http.jobName).toBe('job-a');
    expect(clientB.http.jobName).toBe('job-b');
  });
});
