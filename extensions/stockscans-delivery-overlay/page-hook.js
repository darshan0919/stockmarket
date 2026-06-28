(function stockscansDeliveryOverlayPageHook() {
  "use strict";

  const SOURCE = "stockscans-delivery-overlay";
  const FROM_PAGE = "page";
  const FROM_CONTENT = "content";
  const MAX_CAPTURED_BARS = 1600;
  const VOLUME_COLORS = new Set(["#8bd0c9", "#f6a3a2"]);

  if (window.__stockscansDeliveryOverlayHookInstalled) return;
  window.__stockscansDeliveryOverlayHookInstalled = true;

  const state = {
    ohlcv: null,
    bars: [],
    barsSeq: 0,
  };

  let drawBuffer = [];
  let flushTimer = 0;

  patchFetch();
  patchXhr();
  patchCanvasFillRect();

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.source !== SOURCE || message.from !== FROM_CONTENT) return;
    if (message.type === "REQUEST_STATE") {
      postState();
    }
  });

  function patchFetch() {
    if (typeof window.fetch !== "function") return;
    const nativeFetch = window.fetch;

    window.fetch = async function stockscansDeliveryOverlayFetch(input, init) {
      const requestInfo = getRequestInfo(input, init);
      const response = await nativeFetch.apply(this, arguments);

      if (isOhlcvUrl(requestInfo.url)) {
        response
          .clone()
          .json()
          .then((data) => handleOhlcv(data, requestInfo))
          .catch(() => {});
      }

      return response;
    };
  }

  function patchXhr() {
    const nativeOpen = XMLHttpRequest.prototype.open;
    const nativeSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function stockscansDeliveryOverlayOpen(method, url) {
      this.__ssdvRequest = { method, url: String(url || ""), body: null };
      return nativeOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function stockscansDeliveryOverlaySend(body) {
      if (this.__ssdvRequest) this.__ssdvRequest.body = body;
      this.addEventListener("load", () => {
        const requestInfo = this.__ssdvRequest || {};
        if (!isOhlcvUrl(requestInfo.url)) return;
        try {
          handleOhlcv(JSON.parse(this.responseText), requestInfo);
        } catch {
          // Ignore non-JSON responses.
        }
      });
      return nativeSend.apply(this, arguments);
    };
  }

  function patchCanvasFillRect() {
    const nativeFillRect = CanvasRenderingContext2D.prototype.fillRect;

    CanvasRenderingContext2D.prototype.fillRect = function stockscansDeliveryOverlayFillRect(
      x,
      y,
      width,
      height
    ) {
      tryCaptureVolumeBar(this, x, y, width, height);
      return nativeFillRect.apply(this, arguments);
    };
  }

  function tryCaptureVolumeBar(ctx, x, y, width, height) {
    const canvas = ctx?.canvas;
    const fillStyle = normalizeColor(ctx?.fillStyle);

    if (!canvas || !VOLUME_COLORS.has(fillStyle)) return;
    if (canvas.width < 200 || canvas.height < 200) return;
    if (!isFiniteRect(x, y, width, height)) return;
    if (width <= 0 || height <= 0 || width > 32) return;

    const cssRect = getCanvasCssRect(canvas);

    drawBuffer.push({
      x: round2(x),
      y: round2(y),
      w: round2(width),
      h: round2(height),
      style: fillStyle,
      cw: Math.round(canvas.width),
      ch: Math.round(canvas.height),
      cssW: cssRect.width,
      cssH: cssRect.height,
      z: String(canvas.style?.zIndex || ""),
    });

    if (drawBuffer.length > MAX_CAPTURED_BARS) {
      drawBuffer = drawBuffer.slice(-MAX_CAPTURED_BARS);
    }

    scheduleBarFlush();
  }

  function scheduleBarFlush() {
    if (flushTimer) return;
    flushTimer = window.setTimeout(() => {
      flushTimer = 0;
      flushBars();
    }, 80);
  }

  function flushBars() {
    if (drawBuffer.length < 5) return;
    state.bars = drawBuffer.slice();
    state.barsSeq += 1;
    drawBuffer = [];
    post("VOLUME_BARS", { bars: state.bars, seq: state.barsSeq });
  }

  function handleOhlcv(data, requestInfo) {
    if (!data || !Array.isArray(data.prices)) return;

    state.ohlcv = {
      companyId: String(data.companyId || requestInfo?.companyId || ""),
      name: String(data.name || ""),
      exchange: String(data.exchange || ""),
      tf: String(data.tf || requestInfo?.tf || ""),
      prices: data.prices,
    };

    post("OHLCV_RESPONSE", state.ohlcv);
  }

  function postState() {
    if (state.ohlcv) post("OHLCV_RESPONSE", state.ohlcv);
    if (state.bars.length) post("VOLUME_BARS", { bars: state.bars, seq: state.barsSeq });
  }

  function post(type, payload) {
    window.postMessage({ source: SOURCE, from: FROM_PAGE, type, payload }, "*");
  }

  function getRequestInfo(input, init) {
    const url =
      typeof input === "string"
        ? input
        : input?.url
          ? input.url
          : "";
    const body = init?.body || input?.body || null;
    const parsedBody = parseRequestBody(body);
    return { url: String(url || ""), body, ...parsedBody };
  }

  function parseRequestBody(body) {
    if (!body || typeof body !== "string") return {};
    try {
      const parsed = JSON.parse(body);
      return {
        companyId: typeof parsed.companyId === "string" ? parsed.companyId : "",
        tf: typeof parsed.tf === "string" ? parsed.tf : "",
      };
    } catch {
      return {};
    }
  }

  function isOhlcvUrl(url) {
    return /\/api\/company\/(?:custom-index-)?ohlcv(?:\?|$)/.test(String(url || ""));
  }

  function normalizeColor(value) {
    if (typeof value !== "string") return "";
    const normalized = value.trim().toLowerCase();
    if (VOLUME_COLORS.has(normalized)) return normalized;

    const rgb = normalized.match(/^rgba?\(([^)]+)\)$/);
    if (!rgb) return normalized;

    const [r, g, b] = rgb[1]
      .split(",")
      .slice(0, 3)
      .map((part) => Number(part.trim()));
    if (![r, g, b].every(Number.isFinite)) return normalized;

    return classifyVolumeColor(r, g, b) || normalized;
  }

  function classifyVolumeColor(r, g, b) {
    const upDistance = colorDistance(r, g, b, 139, 208, 201);
    const downDistance = colorDistance(r, g, b, 246, 163, 162);
    if (Math.min(upDistance, downDistance) <= 34) {
      return upDistance <= downDistance ? "#8bd0c9" : "#f6a3a2";
    }

    return "";
  }

  function colorDistance(r, g, b, targetR, targetG, targetB) {
    return Math.abs(r - targetR) + Math.abs(g - targetG) + Math.abs(b - targetB);
  }

  function isFiniteRect(x, y, width, height) {
    return [x, y, width, height].every((value) => Number.isFinite(Number(value)));
  }

  function getCanvasCssRect(canvas) {
    const rect = canvas.getBoundingClientRect?.();
    return {
      width: Math.round(rect?.width || canvas.clientWidth || canvas.width),
      height: Math.round(rect?.height || canvas.clientHeight || canvas.height),
    };
  }

  function round2(value) {
    return Math.round(Number(value) * 100) / 100;
  }
})();
