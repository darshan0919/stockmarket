#!/usr/bin/env node
'use strict';

/**
 * weeklyPptInsights.js — Weekly StockScans PPT Fetcher & Insight Generator
 * 
 * Fetches the latest weekly PPTs, extracts text using pdf-parse, and uses AI 
 * to generate a structured markdown report for Macro Developments, Sector Rotation, 
 * M&A, and Order Book updates.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const pdf = require('pdf-parse');
const { loadEnv } = require('./lib/env');

loadEnv(path.join(__dirname, '../../.env'));

const outputDir = path.join(__dirname, '..', '..', 'jobs', 'data', 'stockscans-ppts');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 303) {
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function callAnthropic(text) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('ANTHROPIC_API_KEY not found in .env, skipping AI summary.');
    return null;
  }

  const prompt = `You are a financial analyst. Summarize the following extracted text from weekly market presentations into these categories: 
1. Macro Developments & Sector Rotation
2. Order Book Updates
3. Financials (Banks and NBFCs)
4. Mergers, Demergers & Spin-offs
5. Interesting DRHPs/IPOs
6. Technical Setups & Scans

Text:
${text.substring(0, 80000)} // Truncating to avoid massive token usage for now
`;

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.content[0].text);
        } catch (e) {
          resolve('Error parsing Anthropic response');
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }]
    }));
    req.end();
  });
}

async function run() {
  console.log('Fetching root folder...');
  const rootUrl = 'https://www.stockscans.in/drive-folder-proxy?folderId=1eaCLucSjMY895w4ngLzUxDXnafbIA1Jw';
  
  try {
    const rootData = await fetchJson(rootUrl);
    const folders = rootData.items.filter(item => item.isFolder);
    console.log(`Found ${folders.length} folders.`);

    // Fetch the latest 2 folders
    let allPdfs = [];
    for (const folder of folders.slice(-2)) {
      console.log(`Fetching files for folder: ${folder.name} (${folder.id})`);
      const folderUrl = `https://www.stockscans.in/drive-folder-proxy?folderId=${folder.id}`;
      const folderData = await fetchJson(folderUrl);
      const files = folderData.items.filter(item => !item.isFolder && item.name.toLowerCase().endsWith('.pdf'));
      
      for (const file of files) {
        allPdfs.push({
          folderName: folder.name,
          fileName: file.name,
          fileId: file.id
        });
      }
    }
    
    let combinedText = '';
    
    for (const pdfItem of allPdfs) {
      const destPath = path.join(outputDir, pdfItem.fileName);
      if (!fs.existsSync(destPath)) {
        console.log(`Downloading ${pdfItem.fileName}...`);
        const downloadUrl = `https://drive.google.com/uc?export=download&id=${pdfItem.fileId}`;
        await downloadFile(downloadUrl, destPath);
      }
      
      console.log(`Parsing ${pdfItem.fileName}...`);
      const dataBuffer = fs.readFileSync(destPath);
      try {
        const parsed = await pdf(dataBuffer);
        combinedText += `\n\n=== ${pdfItem.fileName} ===\n\n${parsed.text}`;
      } catch (e) {
        console.error(`Error parsing ${pdfItem.fileName}:`, e.message);
      }
    }

    console.log('Generating AI Insights...');
    const insights = await callAnthropic(combinedText);
    
    if (insights) {
      const outPath = path.join(require('./lib/db').dataRoot(), 'runs', 'latest_stockscans_insights.md');
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, insights);
      console.log(`Saved insights to ${outPath}`);
    }

    console.log('Weekly PPT Insights pipeline completed.');
  } catch (error) {
    console.error('Error running pipeline:', error);
  }
}

if (require.main === module) {
  run();
}

module.exports = { run };
