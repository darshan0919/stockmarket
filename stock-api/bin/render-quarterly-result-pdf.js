#!/usr/bin/env node
'use strict';

/**
 * @fileoverview CLI runner for render-quarterly-result-pdf.
 * Takes a quarterly-result JSON DTO and produces a deterministic institutional HTML or PDF report.
 * Conforms to Monorepo Workspace Facade Pattern and pdf-design-guide.md.
 */

const fs = require('fs');
const path = require('path');
const { Command } = require('commander');
const { createQuarterlyResultPdf } = require('../src/generators/generateQuarterlyResultPdf');

async function main() {
  const program = new Command();
  program
    .description(
      'Render a quarterly-result DTO to a deterministic institutional PDF or HTML report'
    )
    .requiredOption('--input <path>', 'Path to input quarterly-result JSON DTO')
    .requiredOption('--output <path>', 'Path to output .html or .pdf file')
    .option('--model <name>', 'Model used for analytical generation (optional)')
    .parse(process.argv);

  const opts = program.opts();
  const inputPath = path.resolve(opts.input);
  const outputPath = path.resolve(opts.output);

  if (!fs.existsSync(inputPath)) {
    console.error(`[render-quarterly-result-pdf] Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  let data;
  try {
    const raw = fs.readFileSync(inputPath, 'utf8');
    data = JSON.parse(raw);
  } catch (err) {
    console.error(
      `[render-quarterly-result-pdf] Error parsing JSON from ${inputPath}: ${err.message}`
    );
    process.exit(1);
  }

  try {
    const result = await createQuarterlyResultPdf(data, {
      outputPath,
      modelUsed: opts.model,
    });
    console.log(`[render-quarterly-result-pdf] ✅ Successfully generated: ${result.outputPath}`);
  } catch (err) {
    console.error(`[render-quarterly-result-pdf] ❌ Error generating report: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
