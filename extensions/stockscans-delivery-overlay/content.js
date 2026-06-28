(function stockscansDeliveryOverlayContent() {
  "use strict";

  const SOURCE = "stockscans-delivery-overlay";
  const FROM_PAGE = "page";
  const FROM_CONTENT = "content";
  const UP_VOLUME_COLOR = "#8bd0c9";
  const DOWN_VOLUME_COLOR = "#f6a3a2";
  const DELIVERY_UP = "rgba(38, 166, 154, 0.94)";
  const DELIVERY_DOWN = "rgba(239, 83, 80, 0.92)";
  const MIN_BAR_COUNT = 12;
  const PIXEL_SCAN_START_RATIO = 0.68;
  const MAX_STORED_BAR_BATCHES = 6;

  const state = {
    ohlcv: null,
    bars: [],
    barBatches: [],
    updateTimer: 0,
    overlayCanvas: null,
    statusEl: null,
    activePane: null,
    deliveryCache: new Map(),
    inFlightRanges: new Map(),
    lastDrawKey: "",
    lastUrl: location.href,
  };

  window.addEventListener("message", handlePageMessage);
  window.addEventListener("resize", scheduleUpdate, { passive: true });
  window.addEventListener("visibilitychange", scheduleUpdate, { passive: true });

  const observer = new MutationObserver(() => {
    if (location.href !== state.lastUrl) {
      state.lastUrl = location.href;
      state.ohlcv = null;
      state.bars = [];
      state.barBatches = [];
      state.lastDrawKey = "";
      hideOverlay();
      requestPageState();
    }
    scheduleUpdate();
  });

  waitForBody().then(() => {
    observer.observe(document.body, { childList: true, subtree: true });
    requestPageState();
    scheduleUpdate();
  });

  function handlePageMessage(event) {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.source !== SOURCE || message.from !== FROM_PAGE) return;

    if (message.type === "OHLCV_RESPONSE") {
      state.ohlcv = normalizeOhlcv(message.payload);
      state.barBatches = [];
      state.bars = [];
      state.lastDrawKey = "";
      scheduleUpdate();
      return;
    }

    if (message.type === "VOLUME_BARS") {
      rememberBarBatch(message.payload?.bars);
      scheduleUpdate();
    }
  }

  function requestPageState() {
    window.postMessage({ source: SOURCE, from: FROM_CONTENT, type: "REQUEST_STATE" }, "*");
  }

  function scheduleUpdate() {
    if (state.updateTimer) return;
    state.updateTimer = window.setTimeout(() => {
      state.updateTimer = 0;
      updateOverlay().catch((error) => {
        showStatus(error.message, "error");
      });
    }, 100);
  }

  async function updateOverlay() {
    const surface = findChartSurface();
    const pane = surface?.pane;
    const ohlcv = state.ohlcv;

    if (!pane || !ohlcv?.prices?.length) {
      hideOverlay();
      return;
    }

    if (ohlcv.tf !== "1D") {
      hideOverlay();
      return;
    }

    let bars = findCapturedVolumeBars(pane);
    if (bars.length < MIN_BAR_COUNT) {
      const scannedBars = scanVolumeBarsFromCanvas(surface.canvas, pane);
      if (scannedBars.length >= MIN_BAR_COUNT) {
        bars = scannedBars;
      }
    }

    if (bars.length < MIN_BAR_COUNT) {
      showStatus("Waiting for volume bars", "muted");
      return;
    }

    const slice = findVisiblePriceSlice(ohlcv.prices, bars);
    if (!slice) {
      showStatus("Matching delivery range", "muted");
      return;
    }

    const companyId = ohlcv.companyId || parseCompanyIdFromUrl();
    const symbol = normalizeNseSymbol(companyId);
    if (!symbol) {
      hideOverlay();
      return;
    }

    const from = slice.rows[0][0];
    const to = slice.rows[slice.rows.length - 1][0];
    await ensureDeliveryRange(symbol, from, to);

    const deliveryMap = state.deliveryCache.get(symbol) || new Map();
    drawOverlay({ pane, bars, rows: slice.rows, deliveryMap, symbol, from, to });
  }

  function findChartSurface() {
    const canvases = [...document.querySelectorAll("canvas")];
    const chartCanvas = canvases.find((canvas) => {
      if (canvas.classList.contains("ssdv-overlay-canvas")) return false;
      const rect = canvas.getBoundingClientRect();
      const zIndex = String(canvas.style?.zIndex || "");
      return rect.width > 500 && rect.height > 300 && zIndex === "2";
    });
    return chartCanvas ? { canvas: chartCanvas, pane: chartCanvas.parentElement } : null;
  }

  function findChartPane() {
    return findChartSurface()?.pane || null;
  }

  function ensureOverlay(pane) {
    if (state.activePane !== pane) {
      state.overlayCanvas?.remove();
      state.statusEl?.remove();
      state.overlayCanvas = null;
      state.statusEl = null;
      state.activePane = pane;
    }

    if (!state.overlayCanvas) {
      const canvas = document.createElement("canvas");
      canvas.className = "ssdv-overlay-canvas";
      canvas.setAttribute("aria-hidden", "true");
      pane.appendChild(canvas);
      state.overlayCanvas = canvas;
    }

    if (!state.statusEl) {
      const status = document.createElement("div");
      status.className = "ssdv-status";
      status.textContent = "Delivery volume";
      pane.appendChild(status);
      state.statusEl = status;
    }

    sizeOverlayCanvas(pane, state.overlayCanvas);
    return state.overlayCanvas;
  }

  function sizeOverlayCanvas(pane, canvas) {
    const rect = pane.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
  }

  function drawOverlay({ pane, bars, rows, deliveryMap, symbol, from, to }) {
    const canvas = ensureOverlay(pane);
    const ctx = canvas.getContext("2d");
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const drawKey = [
      symbol,
      from,
      to,
      bars.length,
      Math.round(pane.getBoundingClientRect().width),
      Math.round(pane.getBoundingClientRect().height),
    ].join("|");

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    let painted = 0;
    for (let index = 0; index < bars.length && index < rows.length; index += 1) {
      const bar = bars[index];
      const row = rows[index];
      const date = row[0];
      const delivery = deliveryMap.get(date);
      const ratio = getDeliveryRatio(delivery, row);

      if (!(ratio > 0)) continue;

      const height = Math.max(1, Math.round(bar.h * ratio));
      const y = Math.round(bar.y + bar.h - height);
      const x = Math.round(bar.x);
      const width = Math.max(1, Math.round(bar.w));

      ctx.fillStyle = bar.style === DOWN_VOLUME_COLOR ? DELIVERY_DOWN : DELIVERY_UP;
      ctx.fillRect(x, y, width, height);
      painted += 1;
    }

    if (painted) {
      state.lastDrawKey = drawKey;
      showStatus(`Delivery volume ${from} to ${to}`, "ok");
    } else {
      showStatus("No delivery data for visible bars", "muted");
    }
  }

  function getDeliveryRatio(delivery, priceRow) {
    if (!delivery) return 0;

    const deliveryVolume = toNumber(delivery.deliveryVolume);
    const tradedVolume = toNumber(priceRow?.[5]);
    if (deliveryVolume > 0 && tradedVolume > 0) {
      return clamp(deliveryVolume / tradedVolume, 0, 1);
    }

    const deliveryPercent = toNumber(delivery.deliveryPercent);
    if (deliveryPercent > 0) return clamp(deliveryPercent / 100, 0, 1);

    return 0;
  }

  async function ensureDeliveryRange(symbol, from, to) {
    const key = `${symbol}|${from}|${to}`;
    if (hasCachedDeliveryRange(symbol, from, to)) return;
    if (state.inFlightRanges.has(key)) return state.inFlightRanges.get(key);

    showStatus("Loading delivery volume", "muted");
    const promise = fetchDeliveryRange(symbol, from, to)
      .then((candles) => {
        const symbolCache = state.deliveryCache.get(symbol) || new Map();
        for (const candle of candles) {
          if (candle?.time) symbolCache.set(candle.time, candle);
        }
        symbolCache.__ranges = [...(symbolCache.__ranges || []), { from, to }];
        state.deliveryCache.set(symbol, symbolCache);
      })
      .finally(() => {
        state.inFlightRanges.delete(key);
      });

    state.inFlightRanges.set(key, promise);
    return promise;
  }

  function fetchDeliveryRange(symbol, from, to) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "FETCH_DELIVERY_VOLUME",
          payload: { symbol, from, to },
        },
        (response) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            reject(new Error(lastError.message));
            return;
          }
          if (!response?.ok) {
            reject(new Error(response?.error || "Delivery fetch failed"));
            return;
          }
          resolve(response.payload?.candles || []);
        }
      );
    });
  }

  function hasCachedDeliveryRange(symbol, from, to) {
    const cache = state.deliveryCache.get(symbol);
    if (!cache?.__ranges) return false;
    return cache.__ranges.some((range) => range.from <= from && range.to >= to);
  }

  function rememberBarBatch(rawBars) {
    if (!Array.isArray(rawBars) || !rawBars.length) return;
    state.barBatches.push(rawBars);
    if (state.barBatches.length > MAX_STORED_BAR_BATCHES) {
      state.barBatches = state.barBatches.slice(-MAX_STORED_BAR_BATCHES);
    }
    state.bars = rawBars;
  }

  function findCapturedVolumeBars(pane) {
    for (let index = state.barBatches.length - 1; index >= 0; index -= 1) {
      const bars = normalizeVolumeBars(state.barBatches[index], pane);
      if (bars.length >= MIN_BAR_COUNT) return bars;
    }

    return normalizeVolumeBars(state.barBatches.flat(), pane);
  }

  function normalizeVolumeBars(rawBars, pane) {
    const rect = pane.getBoundingClientRect();
    const paneWidth = Math.round(rect.width);
    const paneHeight = Math.round(rect.height);
    const byX = new Map();

    for (const raw of rawBars) {
      const bar = normalizeBar(raw);
      if (!bar) continue;
      if (
        Math.abs(bar.spaceW - paneWidth) > 3 ||
        Math.abs(bar.spaceH - paneHeight) > 3
      ) {
        continue;
      }
      if (bar.y < paneHeight * 0.72) continue;
      if (bar.x < -bar.w || bar.x > paneWidth) continue;
      if (bar.x + bar.w > paneWidth - 44) continue;

      byX.set(Math.round(bar.x), bar);
    }

    return [...byX.values()].sort((a, b) => a.x - b.x);
  }

  function normalizeBar(raw) {
    const style = String(raw?.style || "").toLowerCase();
    if (style !== UP_VOLUME_COLOR && style !== DOWN_VOLUME_COLOR) return null;

    const backingW = Math.round(toNumber(raw.cw));
    const backingH = Math.round(toNumber(raw.ch));
    const cssW = Math.round(toNumber(raw.cssW)) || backingW;
    const cssH = Math.round(toNumber(raw.cssH)) || backingH;
    let x = toNumber(raw.x);
    let y = toNumber(raw.y);
    let w = toNumber(raw.w);
    let h = toNumber(raw.h);

    if (![x, y, w, h, backingW, backingH, cssW, cssH].every(Number.isFinite)) return null;
    if (!(backingW > 0 && backingH > 0 && cssW > 0 && cssH > 0)) return null;

    if (
      backingW !== cssW &&
      backingH !== cssH &&
      (x > cssW + 2 || y > cssH + 2 || x + w > cssW + 2 || y + h > cssH + 2)
    ) {
      x *= cssW / backingW;
      w *= cssW / backingW;
      y *= cssH / backingH;
      h *= cssH / backingH;
    }

    const bar = {
      x,
      y,
      w,
      h,
      cw: backingW,
      ch: backingH,
      spaceW: cssW,
      spaceH: cssH,
      style,
    };

    if (![bar.x, bar.y, bar.w, bar.h].every(Number.isFinite)) return null;
    if (bar.w <= 0 || bar.h <= 0 || bar.w > 32) return null;

    return bar;
  }

  function scanVolumeBarsFromCanvas(canvas, pane) {
    if (!canvas || !pane) return [];

    const paneRect = pane.getBoundingClientRect();
    const cssW = Math.round(paneRect.width);
    const cssH = Math.round(paneRect.height);
    const backingW = Math.round(canvas.width);
    const backingH = Math.round(canvas.height);
    if (!(cssW > 0 && cssH > 0 && backingW > 0 && backingH > 0)) return [];

    const scanY = Math.floor(backingH * PIXEL_SCAN_START_RATIO);
    const scanH = Math.max(1, backingH - scanY);
    let image;

    try {
      image = canvas.getContext("2d", { willReadFrequently: true }).getImageData(
        0,
        scanY,
        backingW,
        scanH
      );
    } catch {
      return [];
    }

    const columns = [];
    const data = image.data;

    for (let x = 0; x < backingW; x += 1) {
      let minY = Infinity;
      let maxY = -Infinity;
      let upHits = 0;
      let downHits = 0;

      for (let y = 0; y < scanH; y += 1) {
        const offset = (y * backingW + x) * 4;
        const match = matchVolumePixel(
          data[offset],
          data[offset + 1],
          data[offset + 2],
          data[offset + 3]
        );

        if (!match) continue;
        if (match === UP_VOLUME_COLOR) upHits += 1;
        if (match === DOWN_VOLUME_COLOR) downHits += 1;
        minY = Math.min(minY, scanY + y);
        maxY = Math.max(maxY, scanY + y);
      }

      if (maxY >= minY) {
        columns.push({
          x,
          minY,
          maxY,
          style: upHits >= downHits ? UP_VOLUME_COLOR : DOWN_VOLUME_COLOR,
        });
      }
    }

    return normalizeScannedColumns(columns, {
      backingW,
      backingH,
      cssW,
      cssH,
    });
  }

  function normalizeScannedColumns(columns, dimensions) {
    const bars = [];
    let group = null;

    for (const column of columns) {
      if (!group || column.x > group.endX + 1 || column.style !== group.style) {
        finishScannedGroup(group, dimensions, bars);
        group = {
          startX: column.x,
          endX: column.x,
          minY: column.minY,
          maxY: column.maxY,
          style: column.style,
        };
        continue;
      }

      group.endX = column.x;
      group.minY = Math.min(group.minY, column.minY);
      group.maxY = Math.max(group.maxY, column.maxY);
    }

    finishScannedGroup(group, dimensions, bars);
    return bars.sort((a, b) => a.x - b.x);
  }

  function finishScannedGroup(group, dimensions, bars) {
    if (!group) return;

    const scaleX = dimensions.cssW / dimensions.backingW;
    const scaleY = dimensions.cssH / dimensions.backingH;
    const x = group.startX * scaleX;
    const y = group.minY * scaleY;
    const w = (group.endX - group.startX + 1) * scaleX;
    const h = (group.maxY - group.minY + 1) * scaleY;

    if (w < 1 || w > 32 || h < 1) return;
    if (y < dimensions.cssH * 0.72) return;
    if (x < -w || x > dimensions.cssW) return;
    if (x + w > dimensions.cssW - 44) return;

    bars.push({
      x,
      y,
      w,
      h,
      cw: dimensions.backingW,
      ch: dimensions.backingH,
      spaceW: dimensions.cssW,
      spaceH: dimensions.cssH,
      style: group.style,
    });
  }

  function matchVolumePixel(r, g, b, a) {
    if (a < 40) return "";

    return classifyVolumeColor(r, g, b);
  }

  function classifyVolumeColor(r, g, b) {
    const upDistance = colorDistance(r, g, b, 139, 208, 201);
    const downDistance = colorDistance(r, g, b, 246, 163, 162);
    if (Math.min(upDistance, downDistance) <= 34) {
      return upDistance <= downDistance ? UP_VOLUME_COLOR : DOWN_VOLUME_COLOR;
    }

    return "";
  }

  function colorDistance(r, g, b, targetR, targetG, targetB) {
    return Math.abs(r - targetR) + Math.abs(g - targetG) + Math.abs(b - targetB);
  }

  function findVisiblePriceSlice(prices, bars) {
    const rows = prices.filter(isValidPriceRow);
    const count = bars.length;
    if (rows.length < count || count < MIN_BAR_COUNT) return null;

    const observedMax = Math.max(...bars.map((bar) => bar.h));
    if (!(observedMax > 0)) return null;

    const observed = bars.map((bar) => bar.h / observedMax);
    const observedDirections = bars.map((bar) => (bar.style === DOWN_VOLUME_COLOR ? -1 : 1));

    let best = null;

    for (let start = 0; start <= rows.length - count; start += 1) {
      let maxVolume = 0;
      for (let i = 0; i < count; i += 1) {
        maxVolume = Math.max(maxVolume, toNumber(rows[start + i][5]));
      }
      if (!(maxVolume > 0)) continue;

      let score = 0;
      let weight = 0;

      for (let i = 0; i < count; i += 1) {
        const row = rows[start + i];
        const volume = toNumber(row[5]);
        const predicted = volume / maxVolume;
        const actual = observed[i];
        const sampleWeight = 0.35 + actual;
        const diff = predicted - actual;
        const expectedDirection = toNumber(row[4]) >= toNumber(row[1]) ? 1 : -1;

        score += diff * diff * sampleWeight;
        if (expectedDirection !== observedDirections[i]) score += 0.035;
        weight += sampleWeight;
      }

      const normalizedScore = score / Math.max(1, weight);
      if (!best || normalizedScore < best.score) {
        best = { start, score: normalizedScore };
      }
    }

    if (!best) return null;
    return {
      start: best.start,
      score: best.score,
      rows: rows.slice(best.start, best.start + count),
    };
  }

  function isValidPriceRow(row) {
    return (
      Array.isArray(row) &&
      typeof row[0] === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(row[0]) &&
      Number.isFinite(toNumber(row[5]))
    );
  }

  function normalizeOhlcv(payload) {
    if (!payload || !Array.isArray(payload.prices)) return null;
    return {
      companyId: String(payload.companyId || parseCompanyIdFromUrl()),
      name: String(payload.name || ""),
      exchange: String(payload.exchange || ""),
      tf: String(payload.tf || "").toUpperCase(),
      prices: payload.prices,
    };
  }

  function parseCompanyIdFromUrl() {
    const match = location.pathname.match(/\/charts\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]).toUpperCase() : "";
  }

  function normalizeNseSymbol(companyId) {
    const normalized = String(companyId || "").trim().toUpperCase();
    if (!normalized) return "";
    if (normalized.startsWith("NSE:")) return normalized.slice(4);
    if (!normalized.includes(":")) return normalized;
    return "";
  }

  function hideOverlay() {
    if (state.overlayCanvas) {
      const ctx = state.overlayCanvas.getContext("2d");
      ctx.clearRect(0, 0, state.overlayCanvas.width, state.overlayCanvas.height);
      state.overlayCanvas.remove();
      state.overlayCanvas = null;
    }
    if (state.statusEl) {
      state.statusEl.remove();
      state.statusEl = null;
    }
    state.activePane = null;
    state.lastDrawKey = "";
  }

  function showStatus(text, tone) {
    const pane = findChartPane();
    if (!pane || state.ohlcv?.tf !== "1D") return;
    ensureOverlay(pane);
    if (!state.statusEl) return;

    state.statusEl.textContent = text;
    state.statusEl.dataset.tone = tone === "error" ? "error" : tone === "muted" ? "muted" : "ok";
  }

  function waitForBody() {
    if (document.body) return Promise.resolve();
    return new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", resolve, { once: true });
    });
  }

  function toNumber(value) {
    if (value === null || value === undefined || value === "") return 0;
    const number = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
    return Number.isFinite(number) ? number : 0;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
})();
