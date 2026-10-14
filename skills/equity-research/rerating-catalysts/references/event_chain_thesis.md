# Event Chain Thesis — growth-story hypotheses from a filing (Phase 3h)

> Phase 2 asks "what is NEW in the business?". This phase asks the questions a smart
> investor asks next: _"so what does that set in motion, who else sees it, and why would
> the market pay up for it?"_ Follow that chain from a filed fact, through the expert
> lenses in our KB, to a theme with live tailwinds and a reason for the market to
> re-price. Then write down how each chain would be proven or killed.

The output is **2-3 hypotheses**. They are not catalysts and not recommendations. They
read between the lines without leaving reality: every chain starts from a filed fact,
every inference is labelled as one, and every thesis names a market precedent and a
dated way to confirm or kill it.

---

## 1. Inputs (all already in hand by 3g, plus one script and a few searches)

| Input                                                                                                                 | From                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Anchor facts: ranked catalysts, weekly flow, interviews, spike-day WHYs                                               | 3b, 3c, Phase 2.5                                                                                              |
| Quality guardrails: `health`, `fakeJCurveAudit`, `spentFlags`, `jCurveTag`                                            | Phase 2, 3g                                                                                                    |
| Prior thesis / notes on this company                                                                                  | `buildCompanyContext` (`contextUsed`)                                                                          |
| **KB evidence pack**: SureshKBN, SOIC (+ @ishmohit1), other followed X experts, Dr. Lamba, with dated quotes per lens | `yarn rerating:thesis-evidence --dto <draft.json> [--query "<theme words>"]` (zero-LLM; see §6)                |
| Sector/theme playbook sections the pack points to                                                                     | `data/assets/sector-theme-playbook-soic-handles.md`, sector sections of `data/assets/knowledge-x-sureshkbn.md` |
| Live market evidence: theme tailwind data, peers that already re-rated, consensus coverage                            | 2-4 targeted `WebSearch` calls, cited                                                                          |

Read only the playbook sections the pack points to, not the whole 4,000-line KB.

## 2. The question bank — ask all of them, answer from evidence

Treat these as prompts for your own reasoning. Answer each one in a line, internally, before
drafting any thesis. A question with no grounded answer is a gap; never fill it with
invention. Expert lenses use the expert's own stated rules, cited from the evidence pack. Never
put words in an expert's mouth.

### A. Expert lenses

**Q1 — How would SureshKBN see this?** Use his top-down chain (`data/assets/suresh-top-down-vs-bottom-up-2026-10-09.md`):
Market → Sector → Capex + Re-rating → Peers → Trend → Momentum → Entry valuation → Future triggers → FY27/FY28 EPS. His recurring tests (`knowledge-x-sureshkbn.md` frameworks + cycles-themes):

- Has policy or story converted into **actual orders** ("follow where the money is actually being spent")?
- Is this a **first-order proxy** or a proxy-of-proxy? Is it early in the value chain where payers are slow?
- Is the tailwind **structural** (persists 3-4 quarters), or a transient 2-3 month rotation?
- Which year does the market price: FY27 by default, FY28 only if the sector is hot? Can earnings sustain 12-18 months?
- Does **price confirm** (near 52-week high, RS vs sector)? "Tailwinds must show in price."
- Is leadership strong? (Tailwinds cannot rescue weak leadership.)

**Q2 — How would SOIC see this?** (`growth_catalyst_framework.md`, `ask-soic` hits)

- Which C-A-T-A-L-Y-S-T letter(s)? Is it NEW information or already known (announcement-info-classifier lens)?
- Train A / B / C timing (§1d)? J-curve stage (§5a)? Concave or convex payoff (§1c)?
- TGPV order (§4c): is the **Theme** right before Growth, Promoter, Valuation?
- What is the EPS-accrual path, and is it young or old momentum (§1e)?

**Q3 — Can the balance sheet carry the chain?** (Dr. Lamba lens, only when the chain needs capex, working capital or debt.)
Does operating leverage turn the revenue story into PAT? Is the working-capital cycle funded?

### B. Theme lenses

**Q4 — How can this become part of a larger theme or sub-theme with ongoing tailwinds?**
Map it as event → sub-theme → theme → macro tailwind (India / global capex, policy, supply-chain shift). Then date the theme's phase with evidence: how many sector names are at 52-week highs, whether the sector index is in Stage 2, and whether "late chasers" are visible (playbook §9).

**Q5 — Where does the company sit in the value chain?** Who earns first? Is it supplying a **missing piece or a bottleneck**? (Moat signal; bottleneck pricing is temporary, playbook §6.)

**Q6 — What does this event reveal about customers, suppliers and competitors?**
For example, an order from a marquee client implies that client's capex plan. An import-substitution win implies a regulation or cost shift that benefits peers too.

### C. "Why would the market pay up?" lenses

**Q7 — Why would this news attract investors to pay almost any price?** Name the mechanism(s), not adjectives:
scarcity (the only listed pure-play), visibility (a multi-year order book), a TAM step-change (new product or geography), rate-of-change (growth acceleration), quality shift (structural margin / ROCE), or narrative fit with the market's current favourite theme.

**Q8 — What is actually working in markets right now?** Name a **precedent**: a listed peer or analog that re-rated on a similar chain. Say from what multiple to what, over how long, and cite it (web / Screener / scan history). No precedent caps confidence at SPECULATIVE.

**Q9 — What is the EPS bridge?** Say which line moves (revenue, margin, share count) and in which FY. Use only sourced numbers from Phase 2. Otherwise write "directional, unquantified". Never invent a target.

### D. Reading between the lines

**Q10 — Why now, and what isn't management saying?** Look at the timing versus results, the size of capex versus the current gross block, land / hiring / new subsidiaries, and warrant pricing (the promoter paying for equity at today's price is a signal). Also check the tone shift across the 4 transcripts.

**Q11 — What does the counterparty's identity tell you?** Consider a defence ministry, an export OEM, a PSU utility (slow payer) or a hyperscaler.

### E. Inversion (mandatory)

**Q12 — How does this thesis die?** Write the bear chain from the same anchor. What would a fake-J-curve skeptic (framework §5b) say? Also ask what could be wrong with this analysis: survivorship in the precedent, or recency bias in a hot theme.

## 3. Build the chains

For each thesis, write a 3-6 link causal chain. **Tag every link** with its basis:

| Basis       | Meaning                                                               | Citation required                                |
| ----------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| `FACT`      | Filed / disclosed fact from Phase 2 (filing, transcript, PPT, result) | Yes: same source style as `catalysts[].sources`  |
| `KB`        | An expert principle or precedent from our KB                          | Yes: dated citation + URL from the evidence pack |
| `WEB`       | External market or industry data                                      | Yes: URL                                         |
| `INFERENCE` | Your own reasoning connecting the links                               | No, but it must be checkable (see rules)         |

Aim for **diversity**: at most one thesis per archetype.

1. `direct`: the first-order consequence most careful readers will see (often an extension of the top 3b catalyst)
2. `theme`: the event plugs the company into a larger theme or sub-theme with live tailwinds (Q4-Q5)
3. `between-the-lines`: a non-obvious, second-order or contrarian chain (Q6, Q10, Q11). This is the out-of-the-box one.

## 4. Grounding rules (non-negotiable — this is what keeps it out of fiction)

1. **Anchor on a FACT.** Link 1 is always a filed fact already extracted in Phase 2. It never comes from a tweet, an interview takeaway alone, or the web.
2. **No more than 2 INFERENCE links in a row.** Break a long speculative run with a KB, WEB or FACT link, or shorten the chain.
3. **Each thesis needs ≥1 `KB` link and a market precedent (Q8).** Missing either → confidence is `SPECULATIVE`.
4. **No new numbers.** TAM, EPS, margins and order values come only from sourced links. Otherwise write "directional".
5. **Respect the audits.** A chain cannot rely on profit that `fakeJCurveAudit` / `fakeFlags` marked non-recurring. If `reratingPhase` is `SPENT`, the thesis must explain what is left (framework §5a Stage 4: the next leg comes only from orders, margins or cash flow).
6. **Don't contradict a FACT.** If a filed number undercuts the chain, drop the chain. Don't argue around it.
7. **Date expert views.** Follow ask-expert's recency rule (§4b): newest view wins within one expert, tweets are dated opinion, and undated Learnyst lessons get no invented date.
8. **Falsifiable or it doesn't ship.** Each thesis has 2-4 `whatMustBeTrue` items, one dated `confirmationMarker` (observable in a filing, result or price data) and one `killSignal`.
9. **Confidence labels**:
   - `GROUNDED`: every inference is supported or checkable within 2 quarters, and a KB link and a precedent are present
   - `PLAUSIBLE`: one inference is unverified but checkable
   - `SPECULATIVE`: no precedent, or the chain relies on an unconfirmed premise

   At most **one** `SPECULATIVE` thesis per report.

10. **Zero is allowed.** If the facts don't support any chain beyond what 3b already says, write `eventChainNote` with that in one sentence and stop. Padding with generic theme talk is a failure.

## 5. How it feeds the rest of the report

- It **does not change** the 3g `jCurveTag`. Hypotheses are not evidence.
- **3d** says which thesis (if any) the price already reflects, and which isn't priced yet.
- **3f** names the thesis worth tracking and its `confirmationMarker`. It also says whether that thesis warrants escalation to `investment-thesis-engine` (which persists a tracked thesis) or `value-chain-analysis` / `sector-research-deepdive` (for a theme chain).

## 6. Evidence pack script (deterministic, zero-LLM)

```bash
yarn rerating:thesis-evidence --dto /tmp/<safe_ticker>_rerating/draft_dto.json \
  [--query "<extra theme words>"]... [--top 2] > /tmp/<safe_ticker>_rerating/thesis_evidence.json
```

It builds lens queries from `sector` + the top-3 `catalysts[]` (name + `newCategory`) + any `--query` you add for the theme you suspect. It runs `ask-expert`'s `search_expert.py` once per query across every expert, then dedups and trims each hit to citation, URL, date, freshness and a 300-char excerpt. It also points to the matching sector sections in the two playbook files. The output is about 5-10 KB, versus about 25 KB of raw search JSON per query. It reasons about nothing; the agent does all of the judging.

## 7. DTO shape

```json
"eventChainTheses": [
  {
    "title": "Transmission capex → first-in-chain transformer proxy",
    "archetype": "theme",
    "confidence": "GROUNDED",
    "theme": "Power T&D capex", "subTheme": "EHV transformers",
    "chain": [
      { "basis": "FACT", "claim": "...", "source": "Transcript Q1FY27" },
      { "basis": "KB", "claim": "...", "source": "X · @SureshKBN · 2026-10-01", "url": "https://x.com/..." },
      { "basis": "INFERENCE", "claim": "..." },
      { "basis": "WEB", "claim": "...", "source": "CEA NEP 2026", "url": "https://..." }
    ],
    "expertLens": { "sureshKbn": "one line", "soic": "one line" },
    "whyMarketPays": "scarcity + multi-year visibility: ...",
    "precedent": { "name": "Peer X", "detail": "P/E 18x → 45x over FY24-25", "source": "https://..." },
    "epsBridge": "FY28 revenue line via ...; directional, unquantified",
    "whatMustBeTrue": ["...", "..."],
    "confirmationMarker": "Q3FY27 order inflow ≥ ... by Feb-2027",
    "killSignal": "...",
    "skepticRead": "one line: the strongest case against it"
  }
],
"eventChainNote": "only when eventChainTheses is empty: why no credible chain exists"
```
