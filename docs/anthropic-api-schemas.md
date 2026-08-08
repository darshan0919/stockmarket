# Anthropic API — Schemas

> **Document Type**: External API Contract
> **Client**: [`packages/jobs-runtime/lib/anthropicClient.js`](../packages/jobs-runtime/lib/anthropicClient.js)
> **Confirmed**: yes — this is the public, versioned Anthropic Messages API; shape below matches the [official spec](https://docs.anthropic.com/en/api/messages), not inferred from a single sample call.

Callers: `packages/jobs-runtime/orderBookDigest.js`, `mnaTracker.js`,
`weeklyPptInsights.js` (all via the shared client — see AGENTS.md §4, "reuse
before writing").

## POST /v1/messages

```http
POST https://api.anthropic.com/v1/messages
```

**Auth**: header `x-api-key: <ANTHROPIC_API_KEY>` (env var, resolved via each
job's own `process.env` read — not yet routed through the jobs-runtime `Env`
abstraction; see punch list). Also requires header
`anthropic-version: 2023-06-01`.

**Request body** (fields this repo's client actually sends):

```json
{
  "model": "claude-3-haiku-20240307",
  "max_tokens": 1500,
  "messages": [{ "role": "user", "content": "<prompt text>" }]
}
```

| Field        | Type   | Required | Notes                                                                                                                     |
| ------------ | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `model`      | string | Yes      | This repo currently only ever passes `claude-3-haiku-20240307`. Other valid Anthropic model ids work but are unused here. |
| `max_tokens` | number | Yes      | Repo default is `1500` for all three current callers.                                                                     |
| `messages`   | array  | Yes      | Repo only ever sends a single `{role: "user", content: "..."}` turn — no multi-turn or system-prompt usage yet.           |

**Response body** (success, `200`):

```json
{
  "id": "msg_...",
  "type": "message",
  "role": "assistant",
  "content": [{ "type": "text", "text": "..." }],
  "model": "claude-3-haiku-20240307",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": { "input_tokens": 123, "output_tokens": 456 }
}
```

| Field         | Type   | Notes                                                                                                                                                                                                          |
| ------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content`     | array  | This repo's client only reads `content[0].text` — a multi-block response (e.g. tool use) is not handled and would throw when accessed, caught and turned into the string `"Error parsing Anthropic response"`. |
| `stop_reason` | enum   | `end_turn` \| `max_tokens` \| `stop_sequence` \| `tool_use` — not currently inspected by this repo's client.                                                                                                   |
| `usage`       | object | `input_tokens`, `output_tokens` — not currently logged or persisted anywhere in this repo; a follow-up could log this for cost tracking (see `docs/MODEL_COST_ORCHESTRATION.md`).                              |

**Error response** (4xx/5xx): standard Anthropic error envelope
`{"type": "error", "error": {"type": "<error_type>", "message": "..."}}`.
This repo's client does not branch on error type — any non-parseable body
resolves to the string `"Error parsing Anthropic response"` rather than
rejecting, so callers treat a failed call as "no summary" rather than a hard
failure. This is intentional (these are best-effort AI-summary features in
digest jobs, not user-facing critical paths) but means error type/message are
currently swallowed, not logged — worth revisiting if failures need to be
debuggable.

## Punch list (not fixed in this pass)

- Route `ANTHROPIC_API_KEY` through `packages/jobs-runtime/lib/env.js` (the
  unified Env abstraction) instead of a direct `process.env` read, per
  `skills/_shared/conventions.md` §2.
- Log/surface `usage.input_tokens`/`usage.output_tokens` for cost tracking.
- Consider rejecting (not resolving to an error string) on parse failure, so
  callers can distinguish "no summary produced" from "API call failed" if
  that distinction ever matters to a caller.
