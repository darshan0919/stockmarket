#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { program } = require('commander');
const { renderPdf } = require('../src/utils/pdfRenderer');

async function main() {
  program
    .requiredOption('--html <path>', 'Path to the input HTML file')
    .requiredOption('--pdf <path>', 'Path to the output PDF file')
    .option('--title <string>', 'Title string for the PDF header', '')
    .option('--footer <string>', 'Footer text for the PDF', '');

  program.parse(process.argv);
  const opts = program.opts();

  try {
    const htmlContent = fs.readFileSync(opts.html, 'utf8');
    console.log(`[render-pdf] Rendering ${opts.html} to ${opts.pdf} via Puppeteer...`);
    await renderPdf(htmlContent, opts.pdf, opts.title, opts.footer);
    console.log(`[render-pdf] ✅ Success: ${opts.pdf}`);
  } catch (err) {
    console.error(`[render-pdf] ❌ Error: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
