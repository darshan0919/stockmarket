const https = require('https');

const DEFAULT_MODEL = 'claude-3-haiku-20240307';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * @typedef {Object} AnthropicMessagesResponse
 * @property {string} id
 * @property {'message'} type
 * @property {'assistant'} role
 * @property {Array<{type: 'text', text: string}>} content
 * @property {string} model
 * @property {'end_turn'|'max_tokens'|'stop_sequence'|'tool_use'} stop_reason
 * @property {string|null} stop_sequence
 * @property {{input_tokens: number, output_tokens: number}} usage
 * @see {@link docs/anthropic-api-schemas.md} for the full endpoint contract
 */

/**
 * Call the Anthropic Messages API with a single user-turn prompt and return
 * the first text block.
 *
 * Canonical replacement for the per-job `callAnthropic()` copies previously
 * duplicated in `orderBookDigest.js`, `mnaTracker.js`, and
 * `weeklyPptInsights.js` (AGENTS.md §4/§7 — one client per provider, reused
 * by every caller, never re-implemented per job).
 *
 * @param {string} prompt - Full prompt text, already assembled by the caller.
 * @param {Object} [options]
 * @param {string} [options.model] - Anthropic model id. Defaults to `claude-3-haiku-20240307`.
 * @param {number} [options.maxTokens] - `max_tokens` for the response. Defaults to 1500.
 * @returns {Promise<string|null>} The assistant's text reply, `null` if
 *   `ANTHROPIC_API_KEY` is unset, or an error-message string if the response
 *   couldn't be parsed (matches prior per-job behavior — callers already
 *   treat this as a best-effort summary, not a hard dependency).
 */
async function callAnthropic(prompt, options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('ANTHROPIC_API_KEY not found in .env, skipping AI summary.');
    return null;
  }
  const { model = DEFAULT_MODEL, maxTokens = 1500 } = options;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            /** @type {AnthropicMessagesResponse} */
            const parsed = JSON.parse(data);
            resolve(parsed.content[0].text);
          } catch (e) {
            resolve('Error parsing Anthropic response');
          }
        });
      }
    );
    req.on('error', reject);
    req.write(
      JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      })
    );
    req.end();
  });
}

module.exports = { callAnthropic, DEFAULT_MODEL };
