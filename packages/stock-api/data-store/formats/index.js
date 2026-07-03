'use strict';

const fs = require('fs');
const path = require('path');
const duckdb = require('@duckdb/node-api');

async function getDb() {
  const db = await duckdb.Database.create(':memory:');
  const conn = await db.connect();
  return { db, conn };
}

async function csvToParquet(inputPath, outputPath) {
  const { db, conn } = await getDb();
  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    // Use COPY to write parquet
    await conn.run(`COPY (SELECT * FROM read_csv_auto('${inputPath}')) TO '${outputPath}' (FORMAT PARQUET)`);
  } finally {
    conn.close();
    db.close();
  }
}

async function jsonToParquet(inputPath, outputPath) {
  const { db, conn } = await getDb();
  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    await conn.run(`COPY (SELECT * FROM read_json_auto('${inputPath}')) TO '${outputPath}' (FORMAT PARQUET)`);
  } finally {
    conn.close();
    db.close();
  }
}

async function readAny(inputPath) {
  if (inputPath.endsWith('.json')) {
    return JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  }
  if (inputPath.endsWith('.csv')) {
    return fs.readFileSync(inputPath, 'utf8');
  }
  if (inputPath.endsWith('.parquet')) {
    const { db, conn } = await getDb();
    try {
      const result = await conn.run(`SELECT * FROM read_parquet('${inputPath}')`);
      return await result.getRows();
    } finally {
      conn.close();
      db.close();
    }
  }
  throw new Error(`Unsupported format: ${inputPath}`);
}

module.exports = {
  csvToParquet,
  jsonToParquet,
  readAny
};
