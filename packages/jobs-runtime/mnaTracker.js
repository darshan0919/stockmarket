#!/usr/bin/env node
'use strict';

/**
 * mnaTracker.js — Weekly Mergers and Acquisitions tracker
 *
 * Uses Stockscans API to search for corporate announcements related to
 * "merger", "demerger", "acquisition", "spin-off", "amalgamation".
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

  const prompt = `You are a financial analyst tracking M&A activities. Extract and summarize all Mergers, Demergers, Acquisitions, Spin-offs, and Amalgamations from the following announcements. Focus on identifying the target companies, the deal values (if any), and most importantly, the "Strategic Rationale" behind each move:

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

async function runMnaTracker() {
  console.log('Starting M&A Tracker...');
  const client = new StockscansClient();

  const payload = {
    scan: {
      scanId: '',
      scanName: 'M&A Scan',
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
      query: 'merger OR demerger OR acquisition OR spin-off OR amalgamation',
    },
    offset: 0,
    quarterDate: '',
  };

  try {
    const data = await client.scanAnnouncements(payload, { optionalAuth: true });
    const items = data?.announcements || data?.items || [];
    console.log(`Found ${items.length} recent M&A announcements.`);

    if (items.length > 0) {
      const combinedText = items
        .map((i) => `[${i.companyName || i.ticker}] ${i.subject}\n${i.description}`)
        .join('\n\n');
      console.log('Generating AI Insights for M&A...');
      const insights = await callAnthropic(combinedText);
      if (insights) {
        console.log('\n--- M&A Insights ---\n');
        console.log(insights);
        console.log('\n--------------------\n');
      }
    }
    console.log('M&A Tracker completed successfully.');
  } catch (err) {
    console.error('Failed to run M&A Tracker:', err.message);
  }
}

if (require.main === module) {
  runMnaTracker().catch(console.error);
}

module.exports = { runMnaTracker };
