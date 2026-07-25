#!/usr/bin/env node
'use strict';

/**
 * orderBookDigest.js — Daily/Weekly Order Book updates tracker
 *
 * Uses Stockscans API to search for corporate announcements related to
 * "order", "contract", "award", "LOA", "L1 bidder", etc.
 */

const { StockscansClient } = require('@stock/api');
const https = require('https');
const path = require('path');
const { loadEnv } = require('./lib/env');

loadEnv(path.join(__dirname, '../../.env'));

async function callAnthropic(text) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('ANTHROPIC_API_KEY not found in .env, skipping AI summary.');
    return null;
  }

  const prompt = `You are a financial analyst tracking order books. Extract all specific order wins, contracts awarded, and LOAs from the following announcements. Detail the client name, order value (if any), and the company winning the order:

Announcements:
${text.substring(0, 80000)}
`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.content[0].text);
          } catch (e) {
            resolve('Error parsing Anthropic response');
          }
        });
      }
    );
    req.on('error', reject);
    req.write(
      JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      })
    );
    req.end();
  });
}

async function runOrderBookDigest() {
  console.log('Starting Order Book Digest...');
  const client = new StockscansClient();

  const payload = {
    scan: {
      scanId: '',
      scanName: 'Order Book Scan',
      filters: [],
      industry: [],
      index: [],
      watchlistIds: [],
      searchFilters: [],
      announcementType: 'All',
      alerts: false,
      searchMode: 'full',
      companyIds: [],
      companyFilters: [],
      query: 'order OR contract OR award OR LOA OR L1 bidder',
    },
    offset: 0,
    quarterDate: '',
  };

  try {
    const data = await client.scanAnnouncements(payload, { optionalAuth: true });
    const items = data?.announcements || data?.items || [];
    console.log(`Found ${items.length} recent order announcements.`);

    if (items.length > 0) {
      const combinedText = items
        .map((i) => `[${i.companyName || i.ticker}] ${i.subject}\n${i.description}`)
        .join('\n\n');
      console.log('Generating AI Insights for Order Book...');
      const insights = await callAnthropic(combinedText);
      if (insights) {
        console.log('\n--- Order Book Insights ---\n');
        console.log(insights);
        console.log('\n---------------------------\n');
      }
    }
    console.log('Order Book Digest completed successfully.');
  } catch (err) {
    console.error('Failed to run Order Book Digest:', err.message);
  }
}

if (require.main === module) {
  runOrderBookDigest().catch(console.error);
}

module.exports = { runOrderBookDigest };
