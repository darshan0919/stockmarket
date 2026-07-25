# Signal Rules — deterministic scoring → signal

Apply top-down. First matching hard rule wins; otherwise use the weighted score bands.
Any deviation must be logged in `overrides[]` with a reason.

## Hard gates (evaluated first, in order)

| #   | Condition                                                                       | Action                                                  |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------- |
| G1  | Auditor resignation without explanation (or 2 consecutive auditor resignations) | **AVOID** — instant, non-negotiable (Manpasand pattern) |
| G2  | Forensic gate = RED                                                             | **AVOID** (existing holding: **SELL**)                  |
| G3  | Promoter pledge > 30% AND D/E > 0.7 ("lethal combination")                      | **AVOID** / **SELL**                                    |
| G4  | Forensic gate = AMBER                                                           | Signal capped at **HOLD**; conviction capped at 5       |
| G5  | Credibility score ≤ −2 over last 4–8 quarters                                   | Signal capped at **HOLD**                               |
| G6  | 2 consecutive quarters of guidance misses                                       | Downgrade current signal by one notch                   |

## Weighted pillar score

`W = 0.20·Theme + 0.30·Growth + 0.25·Valuation + 0.25·Promoter` (each pillar 0–10).

Credibility adjustment: add +0.5 to W if credibility ≥ +2; subtract 0.5 if ≤ −1.

| W         | Base signal                          |
| --------- | ------------------------------------ |
| ≥ 7.5     | BUY                                  |
| 6.5 – 7.4 | ACCUMULATE                           |
| 5.0 – 6.4 | HOLD                                 |
| 3.5 – 4.9 | REDUCE                               |
| < 3.5     | SELL (holding) / AVOID (no position) |

## Modifiers (after base signal)

- **Valuation brake:** if Valuation pillar ≤ 3 (euphoric pricing), cap at HOLD regardless of W
  — "don't overpay, ever".
- **Trigger decay:** if all HIGH-conviction triggers are `done` or `derailed` and no new ones
  added for 2 quarters, downgrade one notch (thesis exhausted).
- **Technical overlay (timing only, never thesis):** Stage 2 confirmed may upgrade
  HOLD → ACCUMULATE _for entry timing_ when W ≥ 6.0; Stage 3/4 breakdown
  (close below 30-WEMA on volume + CRS loss) forces a `review` run within a week but does
  not by itself change the fundamental signal.
- **Monitorable breach:** any BREACH forces re-scoring of its pillar in the same run.

## Conviction (0–10)

`conviction = round(W)` then: −1 if >40% of evidence is [E]-tagged; −1 if newest evidence
for any pillar is older than 2 quarters; +1 if credibility ≥ +2 AND forensic CLEAN.
Position bucket: 8–10 High conviction · 6–7 Standard · ≤5 Tracking.

## Signal-change hygiene

- A signal may move at most one notch per run unless a hard gate fires.
- Every change records: rule id, evidence id(s), date — reproducibility is the point.
