/**
 * @fileoverview Local file store for app-only announcement scan ignore keywords.
 */

const fs = require('fs/promises');
const path = require('path');

const STORE_PATH = path.resolve(__dirname, '../../data/announcement-scan-ignore-keywords.json');

function normalizeKeywordArray(value) {
  return Array.isArray(value)
    ? value
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .filter((keyword, index, arr) => {
          const lower = keyword.toLowerCase();
          return arr.findIndex((item) => item.toLowerCase() === lower) === index;
        })
        .slice(0, 50)
    : [];
}

function normalizeRecord(record = {}) {
  return {
    scanName: String(record.scanName || '').trim(),
    titleKeywordsToIgnore: normalizeKeywordArray(record.titleKeywordsToIgnore),
    descriptionKeywordsToIgnore: normalizeKeywordArray(record.descriptionKeywordsToIgnore),
    updatedAt: record.updatedAt || null,
  };
}

async function ensureStoreDir() {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
}

async function readIgnoreStore() {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const scans = parsed?.scans && typeof parsed.scans === 'object' ? parsed.scans : {};
    return {
      version: 1,
      scans: Object.fromEntries(
        Object.entries(scans).map(([key, record]) => [key, normalizeRecord(record)])
      ),
    };
  } catch (err) {
    if (err.code === 'ENOENT') return { version: 1, scans: {} };
    throw err;
  }
}

async function writeIgnoreStore(store) {
  await ensureStoreDir();
  await fs.writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

async function saveIgnoreKeywords({
  scanKey,
  scanName,
  titleKeywordsToIgnore,
  descriptionKeywordsToIgnore,
}) {
  const key = String(scanKey || '').trim();
  if (!key) {
    const err = new Error('scanKey is required');
    err.code = 'SCAN_KEY_REQUIRED';
    throw err;
  }
  const store = await readIgnoreStore();
  store.scans[key] = {
    scanName: String(scanName || '').trim() || key,
    titleKeywordsToIgnore: normalizeKeywordArray(titleKeywordsToIgnore),
    descriptionKeywordsToIgnore: normalizeKeywordArray(descriptionKeywordsToIgnore),
    updatedAt: new Date().toISOString(),
  };
  await writeIgnoreStore(store);
  return { scanKey: key, ...store.scans[key], path: STORE_PATH };
}

module.exports = {
  STORE_PATH,
  readIgnoreStore,
  saveIgnoreKeywords,
  normalizeKeywordArray,
};
