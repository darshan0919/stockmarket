# Answer ladder — how to find answers (cheapest, most reliable first)

Walk rungs in order; stop at the first rung that answers with confidence ≥ 0.6 and a citation.
Record every rung tried in `route` (questions-apply accepts one `route` per call; call again per rung
or pass the final rung).

| #   | Rung (`route` value) | How                                                                                                                                                                                                                                                                               | Good for lenses                       |
| --- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1   | `corpus`             | `yarn ask-expert:search --data-root data --query "<q>"` restricted to the source (or `python3 skills/equity-research/ask-expert/scripts/search_xposts.py --data-root data --query "<q>" --handles <handle>`), plus `questions.follower.jsonl` (follower Q → expert A, same topic) | L1 L2 L3 L5 L6 L9                     |
| 2   | `experts`            | `ask-expert` (SOIC, Anil Lamba, other X experts) — mechanism and opposing views                                                                                                                                                                                                   | L4 L6 L7                              |
| 3   | `data`               | Stockscans / Screener fields to turn vague terms into numbers (e.g. free-float % across the stocks he named) — platform-reuse-first (conventions §26)                                                                                                                             | L1 L5 L8 L10                          |
| 4   | `track-record`       | Price action after his dated calls — `tweet-investor-playbook` track_record_methodology.md                                                                                                                                                                                        | L3 L10                                |
| 5   | `web`                | His talks/interviews/YouTube linked from tweets (WebSearch/WebFetch, cited)                                                                                                                                                                                                       | L4 L2                                 |
| 6   | `darshan`            | Judgment/preference only — via the session frontier                                                                                                                                                                                                                               | L11 L12 L13, low-confidence leftovers |
| 7   | `ask-expert-on-x`    | Draft ONE short public question for Darshan to post to the expert (he answers followers often). The weekly refresh picks up the reply                                                                                                                                             | high-value unresolved L1/L5           |
| 8   | `park`               | `status: "parked"` + `parkReason` (what was tried, why unresolved)                                                                                                                                                                                                                | anything left                         |

## Answer record (input to `lna questions-apply`)

```json
{
  "qId": "kbq_…",
  "status": "auto-answered",
  "answer": "≈ <15% free float; he exits names where he can't verify the plant",
  "citations": [{ "url": "https://x.com/…", "date": "2026-10-06" }],
  "confidence": 0.7,
  "route": "corpus",
  "modelUsed": "<model>"
}
```

`status`: `auto-answered` (agent, cited) · `user-decided` (Darshan; set `decidedBy: "darshan"`) · `parked`.
Facts are the engine's job; decisions are Darshan's. Never mark a decision lens auto-answered.
Dated material: answers carry the date of the newest supporting citation; when citations disagree,
the newest wins and the older view is cited as "earlier view (<date>)" (`skills/_shared/recency.py`).
