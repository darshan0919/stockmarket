"use strict";

import { getDeliveryVolume } from "./delivery-volume-api.js";

const MESSAGE_TYPES = Object.freeze({
  FETCH_DELIVERY_VOLUME: "FETCH_DELIVERY_VOLUME",
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== MESSAGE_TYPES.FETCH_DELIVERY_VOLUME) {
    return false;
  }

  fetchDeliveryVolume(message.payload)
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function fetchDeliveryVolume(payload = {}) {
  const symbol = normalizeSymbol(payload.symbol);
  const from = normalizeDate(payload.from);
  const to = normalizeDate(payload.to);

  if (!symbol) throw new Error("Missing NSE symbol");
  if (!from || !to) throw new Error("Missing delivery date range");

  return getDeliveryVolume(symbol, { from, to, interval: "daily" });
}

function normalizeSymbol(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  return raw.includes(":") ? raw.split(":").pop() : raw;
}

function normalizeDate(value) {
  const raw = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}
