/**
 * sidepanel.js — Walk the Talk v2.1 · Fully automated management credibility pipeline
 * @file extensions/wtt-extension/sidepanel.js
 * @description Side panel entry point. Orchestrates the 5-step pipeline: fetch docs,
 *   download PDFs, extract claims via Claude, score management credibility, and render results.
 * @see {@link extensions/wtt-extension/IMPLEMENTATION.md} for architecture docs
 */
"use strict";

// ── Constants ─────────────────────────────────────────────────────────────────
const S3_BASE = "https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/";
const MAX_QUARTERS = 8;
const MAX_PDF_MB = 8;
const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_MAX_TOKENS = 4096;
const CLAUDE_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 1;

// dateToQuarter() and qtrSort() are provided by utils.js (loaded before this file)

// ── State ─────────────────────────────────────────────────────────────────────
let S = {
  phase:       "idle",   // idle | setup | running | done | error
  apiKey:      "",
  symbol:      "",
  steps:       [],       // [{ id, label, status:"wait"|"active"|"done"|"err", detail }]
  progress:    0,        // 0–100
  results:     null,
  error:       null,
  warnings:    [],       // non-fatal issues surfaced to the user
  expandedQ:   null,
};

chrome.storage.sync.get(["wtt_api_key"], r => {
  if (r.wtt_api_key) S.apiKey = r.wtt_api_key;
  render();
});

// ── UI Helpers ────────────────────────────────────────────────────────────────

/**
 * Map a numeric score (0–100) to a CSS color variable.
 * @param {number|null} s - Score value
 * @returns {string} CSS color string
 */
function scoreColor(s) {
  if (s === null || s === undefined) return "var(--textM)";
  return s >= 70 ? "var(--green)" : s >= 50 ? "var(--amber)" : "var(--red)";
}

/**
 * Map a numeric score to a tag CSS class (green/amber/red).
 * @param {number} s - Score value
 * @returns {string} CSS class name
 */
function scoreTagCls(s) {
  return s >= 70 ? "tg" : s >= 50 ? "ta" : "tr";
}

/**
 * Update a pipeline step's status and optional detail text, then re-render.
 * @param {string} id - Step identifier
 * @param {string} status - "wait" | "active" | "done" | "err"
 * @param {string} [detail] - Optional detail string
 */
function setStep(id, status, detail) {
  const s = S.steps.find(x => x.id === id);
  if (s) {
    s.status = status;
    if (detail !== undefined) s.detail = detail;
  }
  render();
}

/**
 * Update the global progress percentage and re-render.
 * @param {number} pct - Progress percentage (0–100)
 */
function setProgress(pct) { S.progress = pct; render(); }

// ── Message from background (triggered by button click) ───────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "BEGIN_ANALYSIS") {
    const symbol = msg.payload?.symbol;
    if (symbol) startPipeline(symbol);
  }
});

// ── Relay: call content script via background ─────────────────────────────────

/**
 * Send a message to the content script via the background service worker relay.
 * @param {Object} inner - The message payload for the content script
 * @returns {Promise<Object>} Response from the content script
 */
async function callContent(inner) {
  return chrome.runtime.sendMessage({ type: "RELAY_TO_CONTENT", inner });
}

// ── JSON Extraction ───────────────────────────────────────────────────────────

/**
 * Robustly extract a JSON object or array from a string that may contain
 * markdown fences, preamble text, or other non-JSON content.
 * Strategy: direct parse -> brace/bracket matching -> fence extraction.
 * @param {string} raw - Raw text possibly containing JSON
 * @returns {Object|Array} Parsed JSON value
 * @throws {SyntaxError} If no valid JSON can be extracted
 */
function extractJSON(raw) {
  const trimmed = raw.trim();

  // 1. Try direct parse
  try { return JSON.parse(trimmed); } catch {}

  // 2. Try extracting from markdown code fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch {}
  }

  // 3. Find outermost { ... } or [ ... ] using brace matching
  const startIdx = Math.min(
    trimmed.indexOf("{") === -1 ? Infinity : trimmed.indexOf("{"),
    trimmed.indexOf("[") === -1 ? Infinity : trimmed.indexOf("[")
  );
  if (startIdx < Infinity) {
    const open = trimmed[startIdx];
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = startIdx; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(trimmed.slice(startIdx, i + 1)); } catch {}
          break;
        }
      }
    }
  }

  throw new SyntaxError(`Failed to extract JSON from response (length=${raw.length}): ${raw.slice(0, 120)}...`);
}

// ── PDF Fetching ──────────────────────────────────────────────────────────────

/**
 * Fetch a PDF from S3 and return it as a base64-encoded string.
 * @param {string} ssUrl - The S3 object key (appended to S3_BASE)
 * @returns {Promise<string>} Base64-encoded PDF content
 * @throws {Error} If fetch fails or PDF exceeds MAX_PDF_MB
 */
async function fetchPdfAsBase64(ssUrl) {
  const url = S3_BASE + ssUrl;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`S3 ${res.status} for ${ssUrl}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_PDF_MB * 1024 * 1024) {
    throw new Error(`PDF too large (${(buf.byteLength / 1e6).toFixed(1)}MB)`);
  }
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// ── Concall Notes ─────────────────────────────────────────────────────────────

/**
 * Fetch structured analyst/concall notes for a transcript from stockscans.
 * @param {string} symbol - Company symbol (e.g. "NSE:INFY")
 * @param {string} ssUrl - The S3 URL key identifying the transcript
 * @returns {Promise<string|null>} Plain-text notes or null if unavailable
 */
async function fetchNotes(symbol, ssUrl) {
  try {
    const resp = await callContent({ type: "FETCH_NOTES", symbol, ssUrl });
    if (resp?.error || !resp?.data) return null;
    const data = resp.data;
    if (typeof data === "string") return data.trim() || null;
    const parts = [];
    if (data.summary)    parts.push("SUMMARY:\n" + data.summary);
    if (data.notes)      parts.push("NOTES:\n" + (Array.isArray(data.notes) ? data.notes.join("\n") : data.notes));
    if (data.keyPoints)  parts.push("KEY POINTS:\n" + (Array.isArray(data.keyPoints) ? data.keyPoints.map((p, i) => `${i + 1}. ${p}`).join("\n") : data.keyPoints));
    if (data.highlights) parts.push("HIGHLIGHTS:\n" + (Array.isArray(data.highlights) ? data.highlights.join("\n") : data.highlights));
    if (data.content)    parts.push(typeof data.content === "string" ? data.content : JSON.stringify(data.content, null, 2));
    if (!parts.length)   parts.push(JSON.stringify(data, null, 2));
    return parts.join("\n\n").trim() || null;
  } catch (e) {
    console.warn("[WTT] fetchNotes failed:", e);
    return null;
  }
}

// ── Claude API ────────────────────────────────────────────────────────────────

/**
 * Custom error class for Claude API failures. Carries a `fatal` flag
 * indicating whether retrying is pointless (e.g. billing, auth).
 */
class ClaudeAPIError extends Error {
  constructor(message, status, fatal = false) {
    super(message);
    this.name = "ClaudeAPIError";
    this.status = status;
    this.fatal = fatal;
  }
}

/**
 * Call the Claude Messages API with configurable parameters.
 * Includes timeout handling, error classification, and the PDF beta header.
 * @param {string} system - System prompt
 * @param {string|Array} userContent - User content (text string or content blocks array)
 * @param {Object} [opts] - Options
 * @param {number} [opts.maxTokens=4096] - Max tokens for the response
 * @param {number} [opts.timeoutMs=120000] - Request timeout in milliseconds
 * @returns {Promise<string>} Raw text response from Claude
 * @throws {ClaudeAPIError} Classified error (auth/billing/rate-limit/server/timeout)
 */
async function callClaude(system, userContent, opts = {}) {
  const maxTokens = opts.maxTokens || DEFAULT_MAX_TOKENS;
  const timeoutMs = opts.timeoutMs || CLAUDE_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": S.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userContent }]
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 401) throw new ClaudeAPIError(`Authentication failed — check your API key`, res.status, true);
      if (res.status === 429) throw new ClaudeAPIError(`Rate limited — wait a moment and retry`, res.status, false);
      if (res.status >= 500) throw new ClaudeAPIError(`Claude server error (${res.status})`, res.status, false);
      const isBilling = body.includes("credit balance") || body.includes("billing") || body.includes("purchase credits");
      if (isBilling) throw new ClaudeAPIError(`Anthropic API credits exhausted — add credits at console.anthropic.com`, res.status, true);
      throw new ClaudeAPIError(`Claude ${res.status}: ${body.slice(0, 200)}`, res.status, false);
    }

    const data = await res.json();
    return data.content?.find(c => c.type === "text")?.text || "";
  } catch (e) {
    if (e.name === "AbortError") throw new ClaudeAPIError(`Claude request timed out after ${timeoutMs / 1000}s`, 0, false);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call Claude with one or more PDF documents plus a text prompt.
 * @param {string} system - System prompt
 * @param {Array<{base64: string, label: string}>} pdfs - PDF documents as base64
 * @param {string} textPrompt - The text portion of the user message
 * @param {Object} [opts] - Options passed to callClaude
 * @returns {Promise<string>} Raw text response from Claude
 */
async function callClaudeWithDocs(system, pdfs, textPrompt, opts = {}) {
  const content = [
    ...pdfs.map(p => ({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: p.base64 },
      title: p.label
    })),
    { type: "text", text: textPrompt }
  ];
  return callClaude(system, content, opts);
}

/**
 * Call Claude and parse the response as JSON with retry support.
 * Uses extractJSON for robust parsing. Retries once on failure.
 * @param {string} system - System prompt
 * @param {string|Array} userContent - User content
 * @param {Object} [opts] - Options passed to callClaude
 * @returns {Promise<Object>} Parsed JSON response
 * @throws {Error} If all attempts fail
 */
async function callClaudeJSON(system, userContent, opts = {}) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const raw = await callClaude(system, userContent, opts);
      return extractJSON(raw);
    } catch (e) {
      lastError = e;
      console.warn(`[WTT] Claude JSON attempt ${attempt + 1} failed:`, e.message);
      if (e.fatal) break;
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

/**
 * Call Claude with PDF docs and parse the response as JSON with retry support.
 * @param {string} system - System prompt
 * @param {Array<{base64: string, label: string}>} pdfs - PDF documents
 * @param {string} textPrompt - Text prompt
 * @param {Object} [opts] - Options passed to callClaude
 * @returns {Promise<Object>} Parsed JSON response
 * @throws {Error} If all attempts fail
 */
async function callClaudeWithDocsJSON(system, pdfs, textPrompt, opts = {}) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const raw = await callClaudeWithDocs(system, pdfs, textPrompt, opts);
      return extractJSON(raw);
    } catch (e) {
      lastError = e;
      console.warn(`[WTT] Claude docs JSON attempt ${attempt + 1} failed:`, e.message);
      if (e.fatal) break;
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

/**
 * Normalise quarter score fields: coerce to numbers, recompute wtt_score.
 * Ensures the weighted formula is applied correctly regardless of what Claude returns.
 * @param {Object} q - Quarter score object from Claude
 * @returns {Object} The same object with normalised numeric fields
 */
function normaliseQuarterScore(q) {
  q.execution_score = Math.round(Number(q.execution_score) || 0);
  q.language_score = Math.round(Number(q.language_score) || 0);
  q.consistency_score = Math.round(Number(q.consistency_score) || 0);
  q.wtt_score = Math.round(
    q.execution_score * 0.5 + q.language_score * 0.3 + q.consistency_score * 0.2
  );
  q.delivered = Array.isArray(q.delivered) ? q.delivered : [];
  q.missed = Array.isArray(q.missed) ? q.missed : [];
  q.red_flags = Array.isArray(q.red_flags) ? q.red_flags : [];
  q.verdict = String(q.verdict || "");
  return q;
}

// ── Main Pipeline ─────────────────────────────────────────────────────────────

/**
 * Run the full Walk the Talk analysis pipeline for a company symbol.
 * Steps: fetch docs -> download PDFs -> extract claims -> score quarters -> verdict.
 * @param {string} symbol - Company symbol (e.g. "NSE:INFY")
 */
async function startPipeline(symbol) {
  if (S.phase === "running") return;

  if (!S.apiKey) { S.phase = "setup"; S.symbol = symbol; render(); return; }

  S.phase    = "running";
  S.symbol   = symbol;
  S.error    = null;
  S.results  = null;
  S.warnings = [];
  S.progress = 0;
  S.steps = [
    { id: "docs",    label: "Fetching document list",   status: "wait" },
    { id: "pdfs",    label: "Downloading PDFs",          status: "wait", detail: "" },
    { id: "extract", label: "Extracting claims & data",  status: "wait", detail: "" },
    { id: "score",   label: "Scoring Walk the Talk",     status: "wait", detail: "" },
    { id: "report",  label: "Generating report",         status: "wait" },
  ];
  render();

  try {
    // ── Step 1: Fetch document list ──────────────────────────────────────────
    setStep("docs", "active");
    const resp = await callContent({ type: "FETCH_DOCS_LIST" });
    if (resp?.error) throw new Error(resp.error);

    const allDocs = resp.data.documents || [];
    const byDate = {};
    allDocs.forEach(d => {
      if (!["Transcript", "Result", "PPT"].includes(d.documentType)) return;
      if (d.date.length !== 6) return;
      const mo = parseInt(d.date.slice(4));
      if (![3, 6, 9, 12].includes(mo)) return;
      if (!byDate[d.date]) byDate[d.date] = {};
      byDate[d.date][d.documentType] = d;
    });

    const sortedDates = Object.keys(byDate)
      .sort((a, b) => parseInt(b) - parseInt(a))
      .slice(0, MAX_QUARTERS);
    if (sortedDates.length < 2) throw new Error("Need at least 2 quarters of data on stockscans.in");

    const quarters = sortedDates.map(d => ({ date: d, label: dateToQuarter(d), docs: byDate[d] }));
    setStep("docs", "done", `${quarters.length} quarters found`);
    setProgress(10);

    // ── Step 2: Download PDFs + fetch notes ──────────────────────────────────
    setStep("pdfs", "active", `0 / ${quarters.length * 2}`);
    let downloaded = 0;
    const totalPdfs = quarters.length * 2;
    const quarterData = [];

    for (const q of quarters) {
      const pdfs = [];
      let notesText = null;

      if (q.docs.Transcript) {
        try {
          const b64 = await fetchPdfAsBase64(q.docs.Transcript.ssUrl);
          pdfs.push({ base64: b64, label: `${q.label} Transcript` });
        } catch (e) {
          console.warn(`[WTT] Transcript download failed for ${q.label}:`, e.message);
        }
        downloaded++;
        setStep("pdfs", "active", `${downloaded} / ${totalPdfs}`);
        setProgress(10 + (downloaded / totalPdfs) * 25);

        if (q.docs.Transcript.hasNotes) {
          setStep("pdfs", "active", `${downloaded} / ${totalPdfs} · fetching notes for ${q.label}`);
          notesText = await fetchNotes(S.symbol, q.docs.Transcript.ssUrl);
        }
      }

      if (q.docs.Result) {
        try {
          const b64 = await fetchPdfAsBase64(q.docs.Result.ssUrl);
          pdfs.push({ base64: b64, label: `${q.label} Results` });
        } catch (e) {
          console.warn(`[WTT] Result PDF download failed for ${q.label}:`, e.message);
        }
        downloaded++;
        setStep("pdfs", "active", `${downloaded} / ${totalPdfs}`);
        setProgress(10 + (downloaded / totalPdfs) * 25);
      }

      if (!q.docs.Transcript && q.docs.PPT) {
        try {
          const b64 = await fetchPdfAsBase64(q.docs.PPT.ssUrl);
          pdfs.push({ base64: b64, label: `${q.label} Presentation` });
        } catch (e) {
          console.warn(`[WTT] PPT download failed for ${q.label}:`, e.message);
        }
      }

      quarterData.push({ label: q.label, date: q.date, pdfs, notesText });
    }

    const notesCount = quarterData.filter(q => q.notesText).length;
    const notesLabel = notesCount ? ` + ${notesCount} notes` : "";
    setStep("pdfs", "done", `${downloaded} PDFs${notesLabel} downloaded`);
    setProgress(35);

    const finResp = await callContent({ type: "GET_FINANCIALS" });
    const domTables = finResp?.tables || {};

    // ── Step 3: Extract claims & financials per quarter ───────────────────────
    setStep("extract", "active", `0 / ${quarterData.length}`);

    const EXTRACT_SYS = `You are a senior equity analyst. Analyse the provided earnings documents and extract:
1. All forward-looking management claims and guidance (quantitative and qualitative)
2. Key financial metrics from the results

Return ONLY valid JSON — no markdown fences, no preamble.`;

    const allClaims = {};
    const allFin    = {};
    let extractFails = 0;

    for (let i = 0; i < quarterData.length; i++) {
      const q = quarterData[i];
      const hasNotes = !!q.notesText;
      setStep("extract", "active", `${i + 1} / ${quarterData.length} · ${q.label}${hasNotes ? " + notes" : ""}`);
      setProgress(35 + (i / quarterData.length) * 25);

      if (!q.pdfs.length && !q.notesText) {
        allClaims[q.label] = [];
        allFin[q.label]    = {};
        continue;
      }

      const domSupp = domTables[q.label]
        ? `\n\nSupplementary financial table data from website:\n${Object.values(domTables[q.label]).join("\n")}`
        : "";

      const notesSupp = q.notesText
        ? `\n\nSTOCKSCANS ANALYST NOTES (curated key points — treat as high-confidence signal):\n${q.notesText}`
        : "";

      const prompt = `Company: ${symbol}  Quarter: ${q.label}
${notesSupp}${domSupp}

Analyse ALL attached documents and any supplementary notes above for this quarter and return JSON:
{
  "claims": [
    {
      "claim": "exact claim in plain English",
      "metric": "what is being measured e.g. revenue_growth / opm / headcount / capex",
      "direction": "up | down | stable | vague",
      "specificity": "high | medium | low",
      "value": "numeric target if stated, else null"
    }
  ],
  "financials": {
    "revenue_cr": null,
    "revenue_growth_yoy_pct": null,
    "opm_pct": null,
    "opm_change_bps": null,
    "pat_cr": null,
    "pat_growth_yoy_pct": null,
    "fcf_cr": null,
    "net_debt_cr": null,
    "capex_cr": null,
    "ocf_to_pat_pct": null,
    "deal_wins_cr": null,
    "headcount": null,
    "attrition_pct": null
  }
}`;

      try {
        const parsed = await callClaudeWithDocsJSON(EXTRACT_SYS, q.pdfs, prompt, { maxTokens: 4096 });
        allClaims[q.label] = parsed.claims    || [];
        allFin[q.label]    = parsed.financials || {};
      } catch (e) {
        extractFails++;
        console.warn(`[WTT] Extraction failed for ${q.label}:`, e.message);
        allClaims[q.label] = [];
        allFin[q.label]    = {};
        if (e.fatal) throw new Error(e.message);
      }
    }

    if (extractFails > 0) {
      const msg = `${extractFails}/${quarterData.length} quarters had extraction failures`;
      S.warnings.push(msg);
      console.warn(`[WTT] ${msg}`);
    }

    const successCount = quarterData.length - extractFails;
    setStep("extract", "done", `${successCount}/${quarterData.length} quarters analysed${extractFails ? ` (${extractFails} failed)` : ""}`);
    setProgress(60);

    // ── Step 4: Score each quarter (prior guidance vs current actuals) ────────
    setStep("score", "active", "");

    const chronoLabels = quarterData.map(q => q.label).reverse();
    const quarterScores = [];
    let scoreFails = 0;

    const SCORE_SYS = `You are a senior equity analyst scoring management credibility.
Compare what management promised in the prior quarter against what they actually delivered.
Be specific and evidence-based. Return ONLY valid JSON — no markdown, no preamble.`;

    for (let i = 1; i < chronoLabels.length; i++) {
      const prevQ = chronoLabels[i - 1];
      const thisQ = chronoLabels[i];
      const claims  = allClaims[prevQ] || [];
      const actuals = allFin[thisQ]    || {};

      setStep("score", "active", `${prevQ} → ${thisQ}`);
      setProgress(60 + ((i - 1) / (chronoLabels.length - 1)) * 25);

      if (!claims.length && !Object.keys(actuals).length) continue;

      const prompt = `Prior quarter promises (${prevQ}):
${JSON.stringify(claims, null, 2)}

Actuals delivered (${thisQ}):
${JSON.stringify(actuals, null, 2)}

Current quarter financial context: ${JSON.stringify(allFin[thisQ])}

Return JSON:
{
  "quarter": "${thisQ}",
  "execution_score": 0,
  "language_score": 0,
  "consistency_score": 0,
  "wtt_score": 0,
  "delivered": ["specific things with evidence — be concrete"],
  "missed": ["specific things with evidence — be concrete"],
  "red_flags": ["concerning language patterns, narrative shifts, blame-shifting"],
  "verdict": "1 direct sentence"
}

Scoring rubric (0–100 scale):
- execution_score (50% weight): Did numeric guidance match actuals? Over-delivery = high, consistent misses = low
- language_score (30% weight): Clear specific language = high; vague, hedge-heavy, blame-shifting = low
- consistency_score (20% weight): Stable narrative across quarters = high; story changes when results disappoint = low
- wtt_score = execution_score × 0.5 + language_score × 0.3 + consistency_score × 0.2`;

      try {
        const raw = await callClaudeJSON(SCORE_SYS, prompt);
        quarterScores.push(normaliseQuarterScore(raw));
      } catch (e) {
        scoreFails++;
        console.warn(`[WTT] Scoring failed for ${prevQ} → ${thisQ}:`, e.message);
        if (e.fatal) throw new Error(e.message);
      }
    }

    if (scoreFails > 0) {
      const msg = `${scoreFails} quarter comparisons failed during scoring`;
      S.warnings.push(msg);
      console.warn(`[WTT] ${msg}`);
    }

    setStep("score", "done", `${quarterScores.length} quarters scored${scoreFails ? ` (${scoreFails} failed)` : ""}`);
    setProgress(85);

    // ── Step 5: Overall verdict ───────────────────────────────────────────────
    setStep("report", "active");

    const VERDICT_SYS = `Senior equity analyst. Provide a rigorous, investment-grade management credibility assessment.
Be direct, specific, and evidence-driven. Return ONLY valid JSON — no markdown, no preamble.`;

    const verdictPrompt = `Company: ${symbol}
Periods analysed: ${quarterData.map(q => q.label).join(", ")}
Quarter-by-quarter scores: ${JSON.stringify(quarterScores, null, 2)}

Return JSON:
{
  "overall_score": 0,
  "trend": "improving | declining | stable | volatile",
  "credibility_rating": "High | Medium | Low | Very Low",
  "top_red_flags": ["up to 3 specific, cross-quarter concerns with evidence"],
  "strengths": ["up to 2 things management consistently does well"],
  "overall_verdict": "2–3 sentences. Direct, investment-grade, specific."
}`;

    let overall = {
      overall_score: 50, trend: "stable", credibility_rating: "Medium",
      top_red_flags: [], strengths: [], overall_verdict: "Analysis complete."
    };
    try {
      overall = await callClaudeJSON(VERDICT_SYS, verdictPrompt);
      overall.overall_score = Math.round(Number(overall.overall_score) || 0);
      overall.top_red_flags = Array.isArray(overall.top_red_flags) ? overall.top_red_flags : [];
      overall.strengths = Array.isArray(overall.strengths) ? overall.strengths : [];
    } catch (e) {
      console.warn("[WTT] Verdict generation failed, using defaults:", e.message);
      if (e.fatal) throw new Error(e.message);
      S.warnings.push("Overall verdict generation failed — using fallback");
    }

    setStep("report", "done");
    setProgress(100);

    S.results = { symbol, quarters: quarterData.map(q => q.label), quarterScores, overall };
    S.phase   = "done";
    render();

    setTimeout(() => downloadReport(S.results), 500);

  } catch (e) {
    S.error = e.message;
    S.phase = "error";
    const active = S.steps.find(s => s.status === "active");
    if (active) active.status = "err";
    console.error("[WTT] Pipeline failed:", e);
    render();
  }
}

// ── HTML Report Generator ─────────────────────────────────────────────────────

/**
 * Generate and trigger download of a standalone HTML report.
 * @param {Object} results - The S.results object containing scores and verdict
 */
function downloadReport(results) {
  const { symbol, quarters, quarterScores, overall } = results;
  const sc = overall.overall_score;
  const color = sc >= 70 ? "#3dd68c" : sc >= 50 ? "#e5b84a" : "#f87171";

  const qRows = quarterScores.map(q => {
    const c = q.wtt_score >= 70 ? "#3dd68c" : q.wtt_score >= 50 ? "#e5b84a" : "#f87171";
    const dl = (q.delivered || []).map(d => `<li class="green">${d}</li>`).join("");
    const ms = (q.missed || []).map(m => `<li class="red">${m}</li>`).join("");
    const rf = (q.red_flags || []).map(f => `<li class="amber">${f}</li>`).join("");
    return `
    <div class="qcard">
      <div class="qhead">
        <span class="mono">${q.quarter}</span>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="tag" style="color:${c};border-color:${c}">WTT ${q.wtt_score}</span>
          <span class="tag muted">Exec ${q.execution_score}</span>
          <span class="tag muted">Lang ${q.language_score}</span>
          <span class="tag muted">Cons ${q.consistency_score}</span>
        </div>
      </div>
      <p class="verdict-txt">${q.verdict || ""}</p>
      ${dl ? `<div class="sec-label green-l">Delivered</div><ul>${dl}</ul>` : ""}
      ${ms ? `<div class="sec-label red-l">Missed</div><ul>${ms}</ul>` : ""}
      ${rf ? `<div class="sec-label amber-l">Red flags</div><ul>${rf}</ul>` : ""}
    </div>`;
  }).join("");

  const flags = (overall.top_red_flags || []).map(f => `<li>${f}</li>`).join("");
  const strengths = (overall.strengths || []).map(s => `<li>${s}</li>`).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Walk the Talk — ${symbol}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;500&family=DM+Sans:wght@400;500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#07090e;color:#dde4ef;font-family:'DM Sans',sans-serif;padding:32px 24px;max-width:900px;margin:0 auto}
  h1{font-family:'Syne',sans-serif;font-size:28px;font-weight:800;color:#e5b84a;margin-bottom:4px}
  .sub{color:#7a8fa8;font-size:13px;margin-bottom:28px}
  .hero{background:#0d1420;border:1px solid #1c2b3e;border-radius:12px;padding:24px;display:flex;align-items:center;gap:28px;margin-bottom:20px}
  .big{font-family:'Syne',sans-serif;font-size:60px;font-weight:800;color:${color};line-height:1}
  .rating{font-family:'Syne',sans-serif;font-size:22px;font-weight:800;color:${color}}
  .trend{font-size:13px;color:#7a8fa8;margin:6px 0 12px}
  .verdict{border-left:2px solid #1c2b3e;padding-left:14px;font-size:14px;line-height:1.75;color:#dde4ef}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px}
  .card{background:#0d1420;border:1px solid #1c2b3e;border-radius:10px;padding:16px}
  .clabel{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px}
  .clabel.red-l{color:#f87171} .clabel.green-l{color:#3dd68c} .clabel.amber-l{color:#fbbf24} .clabel.gold{color:#e5b84a}
  ul{padding-left:16px;display:flex;flex-direction:column;gap:5px}
  li{font-size:13px;line-height:1.55;color:#7a8fa8}
  li.red  {color:#f87171} li.green{color:#3dd68c} li.amber{color:#fbbf24}
  .qcard{background:#0d1420;border:1px solid #1c2b3e;border-radius:10px;padding:16px;margin-bottom:10px}
  .qhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px}
  .mono{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:500}
  .tag{font-family:'JetBrains Mono',monospace;font-size:10px;padding:2px 8px;border-radius:4px;border:1px solid #1c2b3e}
  .muted{color:#3d506a;border-color:#1c2b3e}
  .verdict-txt{font-size:13px;color:#7a8fa8;margin-bottom:10px;line-height:1.6}
  .sec-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:8px 0 5px}
  .sec-label.green-l{color:#3dd68c} .sec-label.red-l{color:#f87171} .sec-label.amber-l{color:#fbbf24}
  .footer{margin-top:32px;font-size:11px;color:#3d506a;text-align:center}
  .sub-scores{display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap}
  .sscard{background:#0d1420;border:1px solid #1c2b3e;border-radius:8px;padding:12px;flex:1;min-width:140px}
  .sslabel{font-size:11px;color:#7a8fa8;margin-bottom:4px}
  .ssval{font-family:'Syne',sans-serif;font-size:24px;font-weight:800}
  .sswt{font-size:10px;color:#3d506a}
</style>
</head>
<body>
  <h1>Walk the Talk</h1>
  <div class="sub">${symbol} · Analysed ${quarters.join(", ")} · Generated ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>

  <div class="hero">
    <div class="big">${overall.overall_score}</div>
    <div>
      <div class="rating">${overall.credibility_rating} Credibility</div>
      <div class="trend">Trend: ${overall.trend}</div>
      <div class="verdict">${overall.overall_verdict}</div>
    </div>
  </div>

  ${quarterScores.length ? (() => {
    const avg = k => Math.round(quarterScores.reduce((s, q) => s + (q[k] || 0), 0) / quarterScores.length);
    const e = avg("execution_score"), l = avg("language_score"), c2 = avg("consistency_score");
    const ec = e >= 70 ? "#3dd68c" : e >= 50 ? "#e5b84a" : "#f87171";
    const lc = l >= 70 ? "#3dd68c" : l >= 50 ? "#e5b84a" : "#f87171";
    const cc = c2 >= 70 ? "#3dd68c" : c2 >= 50 ? "#e5b84a" : "#f87171";
    return `<div class="sub-scores">
      <div class="sscard"><div class="sslabel">Execution</div><div class="ssval" style="color:${ec}">${e}</div><div class="sswt">weight 50%</div></div>
      <div class="sscard"><div class="sslabel">Language clarity</div><div class="ssval" style="color:${lc}">${l}</div><div class="sswt">weight 30%</div></div>
      <div class="sscard"><div class="sslabel">Consistency</div><div class="ssval" style="color:${cc}">${c2}</div><div class="sswt">weight 20%</div></div>
    </div>`;
  })() : ""}

  ${(flags || strengths) ? `<div class="grid">
    ${flags ? `<div class="card"><div class="clabel red-l">Cross-Quarter Red Flags</div><ul>${flags}</ul></div>` : "<div></div>"}
    ${strengths ? `<div class="card"><div class="clabel green-l">Management Strengths</div><ul>${strengths}</ul></div>` : "<div></div>"}
  </div>` : ""}

  <div class="card" style="margin-bottom:20px">
    <div class="clabel gold">Quarter by Quarter</div>
    ${qRows}
  </div>

  <div class="footer">Walk the Talk · stockscans.in + Claude AI · Not investment advice</div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `WTT_${symbol.replace(":", "_")}_${new Date().toISOString().slice(0, 10)}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Render ─────────────────────────────────────────────────────────────────────

/** Re-render the entire side panel UI based on current state. */
function render() {
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = "";

  const panel = mk("div", "panel");

  const tb = mk("div", "topbar");
  const tbr = mk("div", "", { style: "display:flex;align-items:center;justify-content:space-between" });
  tbr.append(mk("span", "logo", { textContent: "Walk the Talk" }));
  if (S.symbol) tbr.append(mk("span", "mono muted", { style: "font-size:11px", textContent: S.symbol }));
  tb.append(tbr);
  panel.append(tb);

  const body = mk("div", "body");

  if      (S.phase === "idle")    renderIdle(body);
  else if (S.phase === "setup")   renderSetup(body);
  else if (S.phase === "running") renderRunning(body);
  else if (S.phase === "done")    renderDone(body);
  else if (S.phase === "error")   renderError(body);

  panel.append(body);
  app.append(panel);
}

/**
 * Render the idle state — waiting for the user to navigate and click.
 * @param {HTMLElement} body - The panel body container
 */
function renderIdle(body) {
  body.append(mk("div", "card", {
    innerHTML: `<div class="clabel">Ready</div>
    <div style="font-size:13px;color:var(--textM);line-height:1.7">
      Navigate to a company page on <strong style="color:var(--text)">stockscans.in</strong>
      and click the <strong style="color:var(--gold)">Walk the Talk</strong> button to start.
    </div>`
  }));
}

/**
 * Render the API key setup form.
 * @param {HTMLElement} body - The panel body container
 */
function renderSetup(body) {
  body.append(mk("div", "card", {
    innerHTML: `<div class="clabel">One-time setup</div>
    <div style="font-size:12px;color:var(--textM);margin-bottom:10px;line-height:1.6">
      Enter your Anthropic API key. It's stored locally in Chrome and never sent anywhere except <code style="color:var(--text)">api.anthropic.com</code>.
    </div>`
  }));

  const inp = mk("input", "", { type: "password", placeholder: "sk-ant-api03-..." });
  inp.value = S.apiKey;
  inp.addEventListener("input", e => { S.apiKey = e.target.value.trim(); });
  body.append(inp);

  const btn = mk("button", "btn", { textContent: "Save & Start Analysis →", style: "margin-top:10px" });
  btn.disabled = !S.apiKey;
  inp.addEventListener("input", () => { btn.disabled = !inp.value.trim(); });
  btn.addEventListener("click", () => {
    chrome.storage.sync.set({ wtt_api_key: S.apiKey });
    startPipeline(S.symbol);
  });
  body.append(btn);
}

/**
 * Render the running/progress state with step indicators.
 * @param {HTMLElement} body - The panel body container
 */
function renderRunning(body) {
  const progCard = mk("div", "card");
  progCard.append(mk("div", "clabel", { textContent: `Analysing ${S.symbol}` }));
  const track = mk("div", "progress-track");
  const fill = mk("div", "progress-fill", { style: `width:${S.progress}%` });
  track.append(fill);
  progCard.append(track);
  progCard.append(mk("div", "", {
    style: "font-size:11px;color:var(--textD);margin-top:6px;text-align:right",
    textContent: `${Math.round(S.progress)}%`
  }));

  S.steps.forEach(s => {
    const row = mk("div", "step-row");
    const iconCls = s.status === "done" ? "step-done" :
                    s.status === "active" ? "step-active" :
                    s.status === "err" ? "step-done" : "step-wait";
    const icon = mk("div", `step-icon ${iconCls}`);
    if (s.status === "done") {
      icon.textContent = "\u2713";
    } else if (s.status === "err") {
      icon.style.background = "rgba(248,113,113,.15)";
      icon.style.color = "var(--red)";
      icon.textContent = "\u2717";
    } else if (s.status === "active") {
      icon.append(mk("div", "spinner"));
    } else {
      icon.textContent = "\u00B7";
    }

    const label = mk("div", "", { style: "flex:1" });
    const labelColor = s.status === "active" ? "var(--text)" :
                       s.status === "done" ? "var(--textM)" : "var(--textD)";
    label.append(mk("span", "", { textContent: s.label, style: `color:${labelColor}` }));
    if (s.detail) label.append(mk("span", "muted", { style: "font-size:11px;margin-left:8px", textContent: s.detail }));

    row.append(icon, label);
    progCard.append(row);
  });

  body.append(progCard);
}

/**
 * Render the completed results view with scores, quarter details, and action buttons.
 * @param {HTMLElement} body - The panel body container
 */
function renderDone(body) {
  const { quarterScores, overall } = S.results;
  const sc = overall.overall_score;
  const col = scoreColor(sc);

  // Warnings banner
  if (S.warnings.length) {
    const warnBox = mk("div", "warn-box", {
      innerHTML: `<strong>Warnings:</strong> ${S.warnings.join("; ")}`
    });
    body.append(warnBox);
  }

  // Hero score card
  const hero = mk("div", "card fade");
  const heroRow = mk("div", "", { style: "display:flex;align-items:center;gap:16px" });
  heroRow.append(makeSVGGauge(sc));
  const right = mk("div", "", { style: "flex:1;min-width:0" });
  right.append(
    mk("div", "", { style: "font-size:10px;color:var(--textM);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px", textContent: "Walk the Talk Score" }),
    mk("div", "", { style: `font-family:var(--ff-d);font-size:20px;font-weight:800;color:${col}`, textContent: overall.credibility_rating + " Credibility" }),
    mk("div", "muted", {
      style: "font-size:11px;margin:4px 0 8px",
      innerHTML: `Trend: <span style="color:${{ improving: "var(--green)", declining: "var(--red)" }[overall.trend] || "var(--textM)"}">${{ improving: "\u2191", declining: "\u2193", stable: "\u2192", volatile: "\u27F7" }[overall.trend] || "\u2192"} ${overall.trend}</span>`
    }),
    mk("div", "verdict", { textContent: overall.overall_verdict })
  );
  heroRow.append(right);
  hero.append(heroRow);
  body.append(hero);

  // Sub-score breakdown
  if (quarterScores.length) {
    const avg = k => Math.round(quarterScores.reduce((s, q) => s + (q[k] || 0), 0) / quarterScores.length);
    const ss = mk("div", "card");
    ss.append(mk("div", "clabel", { textContent: "Score breakdown (avg)" }));
    [["Execution", "execution_score", "50%"], ["Language", "language_score", "30%"], ["Consistency", "consistency_score", "20%"]].forEach(([lbl, key, wt]) => {
      const v = avg(key);
      const c = scoreColor(v);
      const row = mk("div", "sub-row");
      const left = mk("div");
      left.append(
        mk("div", "", { style: "font-size:12px", textContent: lbl }),
        mk("div", "", { style: "font-size:10px;color:var(--textD)", textContent: `weight ${wt}` })
      );
      row.append(left, mk("span", "mono", { style: `font-size:16px;font-weight:500;color:${c}`, textContent: v }));
      const bt = mk("div", "score-bar");
      bt.append(mk("div", "score-fill", { style: `width:${Math.min(100, v)}%;background:${c}` }));
      const wrap = mk("div", "", { style: "margin-bottom:6px" });
      wrap.append(row, bt);
      ss.append(wrap);
    });
    body.append(ss);
  }

  // Quarter-by-quarter rows
  if (quarterScores.length) {
    const qc = mk("div", "card");
    qc.append(mk("div", "clabel", { textContent: "Quarter by quarter" }));
    quarterScores.forEach(q => qc.append(makeQRow(q)));
    body.append(qc);
  }

  // Red flags & strengths grid
  const gr = mk("div", "", { style: "display:grid;grid-template-columns:1fr 1fr;gap:10px" });
  let gridHasContent = false;
  if (overall.top_red_flags?.length) {
    const c = mk("div", "card");
    c.append(mk("div", "", { style: "font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--red);margin-bottom:8px", textContent: "Red Flags" }));
    overall.top_red_flags.forEach(f => c.append(mk("div", "item item-r", { style: "margin-bottom:4px", textContent: f })));
    gr.append(c);
    gridHasContent = true;
  }
  if (overall.strengths?.length) {
    const c = mk("div", "card");
    c.append(mk("div", "", { style: "font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--green);margin-bottom:8px", textContent: "Strengths" }));
    overall.strengths.forEach(s => c.append(mk("div", "item item-g", { style: "margin-bottom:4px", textContent: s })));
    gr.append(c);
    gridHasContent = true;
  }
  if (gridHasContent) body.append(gr);

  // Action buttons
  const dlBtn = mk("button", "btn-ghost", { textContent: "\u2193 Re-download Report", style: "margin-top:4px" });
  dlBtn.addEventListener("click", () => downloadReport(S.results));
  body.append(dlBtn);

  const newBtn = mk("button", "btn-ghost", { textContent: "\u2190 New analysis", style: "margin-top:4px" });
  newBtn.addEventListener("click", () => {
    S.phase = "idle"; S.results = null; S.symbol = ""; S.expandedQ = null; S.warnings = [];
    render();
  });
  body.append(newBtn);
}

/**
 * Render the error state with pipeline log and retry button.
 * @param {HTMLElement} body - The panel body container
 */
function renderError(body) {
  body.append(mk("div", "err-box", { textContent: "Error: " + S.error }));
  const steps = mk("div", "card");
  steps.append(mk("div", "clabel", { textContent: "Pipeline log" }));
  S.steps.forEach(s => {
    const row = mk("div", "step-row");
    const icon = mk("div", `step-icon ${s.status === "err" ? "" : "step-done"}`, {
      style: s.status === "err" ? "background:rgba(248,113,113,.15);color:var(--red)" : ""
    });
    icon.textContent = s.status === "done" ? "\u2713" : s.status === "err" ? "\u2717" : "\u00B7";
    row.append(icon, mk("span", "", {
      textContent: s.label,
      style: `color:${s.status === "err" ? "var(--red)" : "var(--textD)"}`
    }));
    steps.append(row);
  });
  body.append(steps);
  const retryBtn = mk("button", "btn", { textContent: "Retry", style: "margin-top:8px" });
  retryBtn.addEventListener("click", () => startPipeline(S.symbol));
  body.append(retryBtn);
}

// ── DOM Sub-renderers ─────────────────────────────────────────────────────────

/**
 * Render a collapsible quarter score row with expandable detail.
 * @param {Object} q - Quarter score object
 * @returns {HTMLElement} The quarter row element
 */
function makeQRow(q) {
  const isOpen = S.expandedQ === q.quarter;
  const sc = q.wtt_score || 0;

  const wrap = mk("div", "qrow");
  const head = mk("div", "qhead");
  const left = mk("div", "", { style: "display:flex;align-items:center;gap:8px" });
  left.append(
    mk("span", "mono", { style: "font-size:11px;font-weight:500", textContent: q.quarter }),
    mk("span", `tag ${scoreTagCls(sc)}`, { textContent: `WTT ${sc}` })
  );
  const right = mk("div", "", { style: "display:flex;align-items:center;gap:6px" });
  right.append(
    mk("span", "", { style: "font-size:10px;color:var(--textD)", textContent: `E:${q.execution_score} L:${q.language_score} C:${q.consistency_score}` }),
    mk("span", "", { style: "color:var(--textD);font-size:11px", textContent: isOpen ? "\u25B2" : "\u25BC" })
  );
  head.append(left, right);
  head.addEventListener("click", () => { S.expandedQ = isOpen ? null : q.quarter; render(); });
  wrap.append(head);

  if (isOpen) {
    const detailBody = mk("div", "qbody");
    if (q.verdict) {
      detailBody.append(mk("div", "", {
        style: "font-size:12px;color:var(--textM);line-height:1.55;margin-bottom:4px",
        textContent: q.verdict
      }));
    }
    const sec = (label, cls, arr) => {
      if (!arr?.length) return;
      const colorVar = cls === "item-g" ? "var(--green)" : cls === "item-r" ? "var(--red)" : "var(--amber)";
      detailBody.append(mk("div", "", {
        style: `font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${colorVar};margin-bottom:4px`,
        textContent: label
      }));
      arr.forEach(t => detailBody.append(mk("div", `item ${cls}`, { style: "margin-bottom:3px", textContent: t })));
    };
    sec("Delivered", "item-g", q.delivered);
    sec("Missed", "item-r", q.missed);
    sec("Red flags", "item-a", q.red_flags);
    wrap.append(detailBody);
  }
  return wrap;
}

/**
 * Create a 270-degree SVG gauge arc for displaying a score.
 * @param {number} score - Score value (0–100)
 * @returns {SVGElement} The SVG gauge element
 */
function makeSVGGauge(score) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", "90");
  svg.setAttribute("height", "90");
  svg.setAttribute("viewBox", "0 0 90 90");
  const r = 34, circ = 2 * Math.PI * r, pct = Math.min(1, Math.max(0, (score || 0) / 100));
  const col = scoreColor(score);

  const bg = document.createElementNS(NS, "circle");
  bg.setAttribute("cx", "45"); bg.setAttribute("cy", "45"); bg.setAttribute("r", r);
  bg.setAttribute("fill", "none"); bg.setAttribute("stroke", "var(--bg3)"); bg.setAttribute("stroke-width", "7");
  bg.setAttribute("stroke-dasharray", `${circ * .75} ${circ * .25}`);
  bg.setAttribute("stroke-dashoffset", `${circ * .875}`);
  bg.setAttribute("transform", "rotate(135 45 45)");

  const fg = document.createElementNS(NS, "circle");
  fg.setAttribute("cx", "45"); fg.setAttribute("cy", "45"); fg.setAttribute("r", r);
  fg.setAttribute("fill", "none"); fg.setAttribute("stroke", col); fg.setAttribute("stroke-width", "7");
  fg.setAttribute("stroke-linecap", "round");
  fg.setAttribute("stroke-dasharray", `${circ * .75} ${circ * .25}`);
  fg.setAttribute("stroke-dashoffset", `${circ * .875 + circ * .75 * (1 - pct)}`);
  fg.setAttribute("transform", "rotate(135 45 45)");
  fg.style.transition = "stroke-dashoffset 1.2s ease";

  const num = document.createElementNS(NS, "text");
  num.setAttribute("x", "45"); num.setAttribute("y", "40"); num.setAttribute("text-anchor", "middle");
  num.setAttribute("font-family", "Syne,sans-serif"); num.setAttribute("font-weight", "800");
  num.setAttribute("font-size", "20"); num.setAttribute("fill", col);
  num.textContent = score ?? "\u2013";

  const lbl = document.createElementNS(NS, "text");
  lbl.setAttribute("x", "45"); lbl.setAttribute("y", "52"); lbl.setAttribute("text-anchor", "middle");
  lbl.setAttribute("font-family", "DM Sans,sans-serif"); lbl.setAttribute("font-size", "8");
  lbl.setAttribute("fill", "var(--textM)");
  lbl.textContent = "/100";

  svg.append(bg, fg, num, lbl);
  return svg;
}

// ── DOM Helper ────────────────────────────────────────────────────────────────

/**
 * Create an HTML element with optional class and properties.
 * @param {string} tag - Tag name
 * @param {string} [cls=""] - CSS class(es)
 * @param {Object} [props={}] - Properties to assign (style string gets applied via cssText)
 * @returns {HTMLElement}
 */
function mk(tag, cls = "", props = {}) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  Object.entries(props).forEach(([k, v]) => {
    if (k === "style" && typeof v === "string") el.style.cssText = v;
    else el[k] = v;
  });
  return el;
}

// ── Boot ──────────────────────────────────────────────────────────────────────
render();
