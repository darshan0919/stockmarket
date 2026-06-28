"use strict";

import { getPriceVolumeDeliverable, getSymbolData } from "./nse-api.js";

export async function getDeliveryVolume(symbol, { from, to, interval = "daily" } = {}) {
  const upper = String(symbol || "").trim().toUpperCase();
  const fromDate = parseIsoDate(from);
  const toDate = parseIsoDate(to);

  if (!upper) throw new Error("Symbol required");
  if (!fromDate || !toDate) throw new Error("from and to must be YYYY-MM-DD");
  if (fromDate > toDate) throw new Error("from must be <= to");
  if (interval !== "daily") throw new Error("Only daily delivery overlay is supported");

  const allRows = [];
  for (const [chunkFrom, chunkTo] of chunkDateRange(fromDate, toDate, 365)) {
    const rows = await getPriceVolumeDeliverable(
      upper,
      formatNseDate(chunkFrom),
      formatNseDate(chunkTo)
    );
    allRows.push(...normalizeRows(rows));
  }

  const seen = new Map();
  for (const row of allRows) {
    const candle = normalizeHistoricalRow(row);
    if (candle) seen.set(candle.time, candle);
  }

  const candles = [...seen.values()].sort((a, b) => a.time.localeCompare(b.time));
  await appendLiveCandle(candles, upper, fromDate, toDate);

  return {
    symbol: upper,
    interval: "daily",
    from: toIsoDate(fromDate),
    to: toIsoDate(toDate),
    candles,
  };
}

async function appendLiveCandle(candles, symbol, fromDate, toDate) {
  const today = new Date();
  const todayStr = toIsoDate(today);
  if (today < startOfDay(fromDate) || today > endOfDay(toDate)) return;
  if (candles[candles.length - 1]?.time === todayStr) return;

  try {
    const liveData = await getSymbolData(symbol);
    const open = toNumber(liveData?.metaData?.open);
    const high = toNumber(liveData?.metaData?.dayHigh);
    const low = toNumber(liveData?.metaData?.dayLow);
    const close = toNumber(liveData?.tradeInfo?.lastPrice);
    const volume = toNumber(liveData?.tradeInfo?.totalTradedVolume);
    const deliveryVolume = toNumber(liveData?.tradeInfo?.deliveryquantity);
    const deliveryPercent = toNumber(liveData?.tradeInfo?.deliveryToTradedQuantity);

    if (open && high && low && close) {
      candles.push({ time: todayStr, open, high, low, close, volume, deliveryVolume, deliveryPercent });
    }
  } catch {
    // Live data is best-effort; historical delivery rows remain useful without it.
  }
}

function normalizeRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function normalizeHistoricalRow(row) {
  const date = parseNseDateToIso(row.mTIMESTAMP || row.CH_TIMESTAMP);
  if (!date) return null;

  const open = toNumber(row.CH_OPENING_PRICE);
  const high = toNumber(row.CH_TRADE_HIGH_PRICE);
  const low = toNumber(row.CH_TRADE_LOW_PRICE);
  const close = toNumber(row.CH_CLOSING_PRICE);

  if (!open && !high && !low && !close) return null;

  return {
    time: date,
    open,
    high,
    low,
    close,
    volume: toNumber(row.CH_TOT_TRADED_QTY ?? row.COP_TRADED_QTY),
    deliveryVolume: toNumber(row.COP_DELIV_QTY),
    deliveryPercent: toNumber(row.COP_DELIV_PERC),
  };
}

function parseNseDateToIso(value) {
  if (!value) return "";
  const raw = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return toIsoDate(date);

  const match = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) return "";

  const months = {
    JAN: 0,
    FEB: 1,
    MAR: 2,
    APR: 3,
    MAY: 4,
    JUN: 5,
    JUL: 6,
    AUG: 7,
    SEP: 8,
    OCT: 9,
    NOV: 10,
    DEC: 11,
  };
  const month = months[match[2].toUpperCase()];
  if (month === undefined) return "";

  return toIsoDate(new Date(Number(match[3]), month, Number(match[1])));
}

function chunkDateRange(fromDate, toDate, maxDays) {
  const chunks = [];
  let cursor = new Date(fromDate);

  while (cursor <= toDate) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + maxDays - 1);
    if (chunkEnd > toDate) chunkEnd.setTime(toDate.getTime());
    chunks.push([new Date(cursor), new Date(chunkEnd)]);
    cursor = new Date(chunkEnd);
    cursor.setDate(cursor.getDate() + 1);
  }

  return chunks;
}

function parseIsoDate(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatNseDate(date) {
  return `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear()}`;
}

function toIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "" || value === "-") return 0;
  const number = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : 0;
}
