#!/usr/bin/env node
'use strict';

const mod_documentsFetcher = require('../src/fetchers/documentsFetcher.js');

function main() {
  const argv = process.argv.slice(2);
  
  if (argv.includes('--help')) {
    console.log(`Usage: consecutive-filings-diff [options]`);
    console.log(`Options:
  --help     Show this help message`);
    process.exit(0);
  }

  // TODO: implement actual parsing and logic here
  
  const result = {
    ok: true,
    outputs: [],
    warnings: []
  };

  console.log(JSON.stringify(result));
}

if (require.main === module) {
  main();
}
