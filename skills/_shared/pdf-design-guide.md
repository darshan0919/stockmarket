# PDF / institutional report design guide

Single source of truth for how every skill's PDF/HTML report should look. Adopted 2026-07-23,
modeled on the `consecutive-filings-diff` Gandhar Oil report. Two implementation paths exist —
use whichever matches how your skill already renders:

1. **JS generator path** (`stock-api/src/generators/*.js`, puppeteer): you already get this
   design for free. `wrapHtml()` in `stock-api/src/utils/pdfRenderer.js` and the palette in
   `stock-api/src/utils/pdfUtils.js` (`INSTITUTIONAL_DARK` / `INSTITUTIONAL_LIGHT`, now unified
   to one flat palette) were updated to this system — no per-generator changes needed. Use
   `pdfUtils.chipHtml(text, tone)` and `pdfUtils.calloutHtml(html, tone)` instead of hand-rolling
   colored spans/divs, and prefer emitting `.kpi`/`.grid3`/`.grid4`/`.vmatrix` markup (classes
   are pre-registered in `wrapHtml`'s `<style>`) over inline styles.
2. **Direct HTML + weasyprint path** (skills without a JS generator, e.g. `consecutive-filings-diff`'s
   final PDF, or any skill piping `python3 -m weasyprint report.html out.pdf`): copy the CSS block
   in full from `### Copy-paste CSS block` below into your report's `<style>` tag.

Do not invent a new visual language per skill. If a skill needs a component this guide doesn't
cover, add it here first, then use it — don't one-off it in a single generator.

## Data layer vs UI layer — hard boundary (2026-07-24)

**This guide governs the UI layer only.** It controls layout, typography, component choice
(table vs `.vmatrix` vs `.kpi` grid vs chip), and color/tone mapping. It must never be the place
where a decision gets made about _which facts appear in the report_ — that decision belongs
entirely to the data layer (the skill's extraction/processing script), which persists a full DTO
per [`skills/tooling/output-dto-standard/SKILL.md`](../tooling/output-dto-standard/SKILL.md)
before any rendering happens.

Concretely:

- The render step (this guide's CSS/components) must be a **pure function of the DTO**: same
  DTO in → same PDF out, every time. It reads every field that exists and lays it out; it does
  not summarize, truncate, or selectively omit content to hit a page-count or word-count target.
- If a report is "too long" or "too verbose," the fix happens in the data layer (dedupe
  genuinely redundant facts, restructure prose into structured fields the renderer can lay out
  densely) or by adding a page — never by having the render step quietly drop DTO fields.
- Concrete failure mode this prevents: an analyst hand-writes both content and HTML in one pass,
  "compresses for readability," and silently loses facts because there was no persisted
  intermediate record to compress _from_ — only one document acting as both data and layout.
  See `skills/equity-research/drhp-ipo-analysis/SKILL.md`'s "Phase 4" for a worked example of the
  two-step split (`db.saveReport(dto)` → `render_drhp.py`) that this guide expects every skill
  to follow.
- Verification: before shipping a PDF, every top-level object/array in the DTO should be
  traceable to something visible in the rendered output. If it isn't, that's a rendering bug, not
  an acceptable compression.
- **The `additional` field** (any-shape escape hatch for nuance a skill's fixed schema didn't
  anticipate) must be rendered via the shared `render_additional_html()` in
  [`skills/_shared/render_additional.py`](render_additional.py) — never hand-rolled per skill.
  It shape-sniffs the JSON (scalar → callout, flat dict → kv table, dict-of-dicts → subsections,
  list-of-similar-dicts → table, list-of-dicts → card grid, list-of-scalars → bullets) and emits
  markup using only the classes below, so new one-off insights never require new render code.

## Color coding — beyond red/yellow/green flags (2026-07-24)

Chips and callouts aren't the only place tone belongs. Once a report has real numbers in it,
apply the same signal discipline to the numbers themselves:

- **Trend deltas** (a metric that moved period-over-period): color the _direction that matters_,
  not just literal up/down. Revenue/margin/RoNW increasing → `.up`; debtor days or leverage
  _increasing_ is bad, so color that occurrence `.dn` even though the number went up — `.up`/`.dn`
  are semantic (good/bad), not directional.
- **Headline verdict** (subscription view, buy/sell/hold, pass/fail) belongs in the header as a
  `.chip` in the matching tone, not just as plain text — the reader should get the verdict's
  color before reading a single word.
- **KPI cards can carry tone too**: give `.kpi` an optional tone via a colored left border
  (`border-left: 3px solid <tone color>`) when the metric itself is a judgment (e.g. "no
  valuation anchor" = blue/informational, "100% fresh issue" = green/positive) — don't tint
  every KPI, reserve it for the ones carrying a verdict, not just a fact.
- **Don't over-color**: a plain fact with no embedded judgment (a page count, a filing date)
  stays black/monospace. Color signals "this number means something," so if everything is
  colored, nothing reads as a signal anymore.

## Writing style (2026-07-24)

- **One-liner first, elaboration only if it changes the decision.** Every row, chip, and callout
  should be readable as a single scannable clause. Default to fragments over full sentences
  ("Top-10 = 98.6% of Q1 rev, up from 84.9%" not "The company's top ten customers accounted for
  98.59% of revenue..."). If a sentence can lose words without losing meaning, cut them.
- **Compress, don't omit.** Terse ≠ thin — every fact, number, and citation from the source
  document still belongs in the report. The compression target is word count per fact, not fact
  count. Prefer a table row or KPI card over a paragraph any time the content is a set of
  labeled numbers or a labeled verdict.
- **No prose paragraphs for structured data.** Financials, red-flag lists, KPI trends, litigation
  summaries, RPT summaries → tables, `.kpi` grids, or `.vmatrix`. Reserve actual prose sentences
  for the one or two places that need connective reasoning (executive summary framing, final
  verdict rationale) — even there, cap each point at one sentence.
- **Lead with the number/verdict, not the setup.** "RoNW 31% (FY25), down from 33% (FY24)" not
  "Return on net worth, which measures how efficiently the company generates profit from
  shareholder funds, was 31%...". The reader is an analyst — skip definitions unless the metric
  is genuinely unfamiliar.
- **Every section should be skimmable in under 10 seconds.** If a reader can't get the section's
  takeaway from its chips/bignums/table headers alone (without reading body text), restructure it.

## Layout density (2026-07-24)

- **No cover page.** Kill decorative title pages, metaboxes, and centered hero verdict boxes —
  they waste a full page for information that belongs in the eyebrow/title/subtitle + a KPI row.
  Go straight from header into content on page 1 (per "Report skeleton" below).
- **KPI grids over stacked prose stats.** Any cluster of 3+ related numbers (financial highlights,
  red-flag counts, issue economics) becomes a `.grid3`/`.grid4` of `.kpi` cards, not a bulleted or
  prose list. This is the single highest-leverage layout change for a "dashboard" feel.
- **Chips inline, not as their own table column when avoidable.** Prefer `Metric: value <chip>`
  density (e.g. inside a `.vmatrix` cell or table cell) over a full extra `<th>Rating</th>` column
  that repeats "GREEN/YELLOW/RED" as plain text — let the chip's color do the signaling.
- **Two-column layout for independent short sections.** Where two sections are each short and
  don't depend on each other (e.g. "Objects of issue" + "Auditor & promoters"), lay them side by
  side with a CSS grid (`display:grid; grid-template-columns:1fr 1fr; gap:12px`) instead of
  stacking — this is what makes a report feel like a dashboard instead of a scroll of text.
- **Target page count is a signal you're over-writing.** A DRHP/company analysis of this scope
  should land at 2-3 pages, not 5+. If it's running long, the fix is almost always: cut prose,
  convert a table to a denser vmatrix/grid, or merge near-duplicate sections — not smaller fonts.
- **Compression must not drop facts.** Before finalizing, diff the report's content against the
  source extraction notes/earlier draft: every distinct fact, number, named entity, and citation
  that was gathered during research should appear _somewhere_ in the final layout (a table row,
  a vmatrix cell, a chip label) — compression shortens how a fact is said, it never decides to
  leave it out. If two facts are genuinely redundant (e.g. same number stated twice), keep the
  more decision-relevant instance and drop the other — but that's a dedup call, not a targeted-len
  cut. When in doubt, add one more table row rather than summarizing three facts into one clause.
- **Minimum font sizes — do not go below these even under space pressure.** Body text `11px`,
  table body/numeric cells `10-10.5px`, table headers `8.5px`, chips `8.3-9px`, KPI `.label`
  `8px`, KPI `.subnum` `9-9.5px`, `.vmatrix` cell text `9.2-9.5px`, footer/page-counter `8px`
  (footer is the one exception — it's non-analytical). If content doesn't fit at these sizes,
  the fix is shorter copy or an extra page, never a smaller font. See the updated copy-paste CSS
  block below, which already reflects these floors.

## Principles

- **Flat, not corporate-navy.** No gradients, no heavy blue letterhead blocks, no drop shadows.
  Near-black (`#111111`) for structure, hairline gray borders (`#dddddd`), color reserved for
  meaning (green/red/amber/blue tone chips and callouts), not decoration.
- **Monospace for metadata, serif/sans for content.** Section headers, table headers, chips, and
  the eyebrow line use `monospace` at small size + uppercase + letter-spacing — this is what
  signals "institutional desk note" rather than "marketing deck." Body prose stays regular sans.
- **Every claim gets a materiality/status signal.** Numbers alone don't carry a verdict — pair
  deltas with a chip (`chip-g`/`chip-y`/`chip-r`/`chip-b`) or wrap analyst commentary in a
  callout (`hl-g`/`hl-y`/`hl-r`/`hl-b`) so the reader can scan tone without reading every word.
- **Don't say the tone word when the color already says it.** If a row/cell is colored to signal
  GREEN/YELLOW/RED (or good/bad), don't also spell out the word "GREEN"/"YELLOW"/"RED" next to
  it — that's the same signal twice, once as color and once as redundant text, and it's exactly
  the kind of duplication this guide exists to avoid. Color the _subject itself_ (the flag name,
  the metric label, the row topic) with `.ftag.ftag-{g,y,r,b}` (text-color-only, no chip pill —
  see Components) instead of pairing a neutral-colored label with a separate rating chip.
- **Numbered sections, not free-flowing headings.** `01 Live snapshot`, `02 P&L diff`, etc. Makes
  multi-page institutional reports skimmable and gives a stable anchor for "see section 09."
- **One eyebrow line, one title, one subtitle, one thick rule — then straight into content.**
  No cover page, no logo block, no decorative first page for a 1-10 page report.

## Palette

| Token                          | Hex       | Use                                              |
| ------------------------------ | --------- | ------------------------------------------------ |
| `primary`                      | `#111111` | Title text, thick top rule, table header rule    |
| `text`                         | `#1a1a1a` | Body text                                        |
| `muted`                        | `#666666` | Eyebrow, subtitle, table header labels, captions |
| `border`                       | `#dddddd` | Hairline rules, table row dividers               |
| `tint` / `surface` / `alt_row` | `#f5f4f0` | KPI card bg, alternating table rows              |
| `secondary`                    | `#0c447c` | Rarely used directly — prefer `chip-b`           |

Signal tones (used consistently for chips and callouts, never swapped):

| Tone        | Chip bg / fg          | Callout bg / left-border / fg     | Meaning                                            |
| ----------- | --------------------- | --------------------------------- | -------------------------------------------------- |
| green (`g`) | `#eaf3de` / `#27500a` | `#eaf3de` / `#5bad3a` / `#1a3d0a` | confirmed, clean, resolved, positive               |
| red (`r`)   | `#fcebeb` / `#791f1f` | `#fcebeb` / `#e24b4a` / `#52100f` | red flag, core driver of risk, highest materiality |
| amber (`y`) | `#faeeda` / `#633806` | `#faeeda` / `#ef9f27` / `#412402` | watchlist, unresolved, caveat, unverified input    |
| blue (`b`)  | `#e6f1fb` / `#0c447c` | `#e6f1fb` / `#3a85c9` / `#0a2752` | neutral/informational note                         |

Never use raw black, red, or green outside this table — always pull from it so tone reads
consistently across every skill's output.

## Typography (sizes revised 2026-07-24 — legibility floor raised)

- Body: `'Helvetica Neue', Helvetica, Arial, sans-serif`, `11px`, `line-height: 1.45`.
- Title (`h1`/`.title`): `20pt`, weight `600`, `primary` color.
- Eyebrow (above title): `9.5px`, `monospace`, uppercase, `letter-spacing: 0.1em`, `muted` color —
  format as `Report type · TICKER · date range`.
- Subtitle (below title): `9.5px`, `monospace`, `muted` — sources/methodology one-liner.
- Section header (`h2`/`.sec-hd`): `11px`, `monospace`, uppercase, `letter-spacing: 0.08em`,
  `muted` color, `1px solid border` bottom rule. Numbered: `01  Section title`.
- Table header cells: `8.5px`, `monospace`, uppercase, `letter-spacing: 0.04em`, `muted`.
- Table body cells / numeric cells: `10-10.5px`; numeric columns get `font-family: monospace`.
- Chips: `8.3-9px`. KPI `.label`: `8px`. KPI `.bignum`: `17-19px`. KPI `.subnum`: `9-9.5px`.
- `.vmatrix` cells: `9.2-9.5px`; `.vmatrix` label column header row: `8.5px`.
- Nothing in the analytical content (i.e. excluding the page-counter footer) should render below
  `8px` — that was the main legibility complaint against the first dense-layout pass.

## Components

- **Chip** `.chip.chip-{g,r,y,b}` — inline status/verdict tag, `7.8-8.5px monospace`, `2px 6px`
  padding, `3px` radius. Use for per-row signals in tables and end-of-report verdict bands, and
  for headline/summary badges (e.g. a subscription-view or buy/sell verdict next to the title)
  where the tag needs to stand alone as its own labeled element.
- **Flag tag** `.ftag.ftag-{g,r,y,b}` — a bordered, tinted-background pill (`padding: 3px 8px`,
  `border-radius: 3px`, `1px solid` border in a slightly darker tint of the same tone) wrapping
  the subject text itself, for when the row/cell subject _is_ the thing being rated — e.g. a
  red-flag scan's flag name, a checklist item. No decorative bullet/icon prefix — the tinted
  background + border carries the signal on its own. Do not also print "GREEN"/"YELLOW"/"RED"
  next to it — see the "Don't say the tone word" principle above. Use `.chip` when the tag needs
  to be its own separate labeled badge sitting next to other text (e.g. a verdict badge next to
  a headline); use `.ftag` when the tag color should wrap and _be_ the subject's own label.
- **Callout** `.hl.hl-{g,r,y,b}` — left-border-accented block for a ranked observation, flag, or
  analyst note. `padding: 7-9px 10-12px`, `3-4px` radius, `3px` left border in the tone color.
- **KPI card** `.kpi` inside `.grid3`/`.grid4` — `label` (mono, uppercase, muted) / `bignum`
  (17-24px, weight 500-600) / `subnum` (mono, muted) stack. Use for live snapshot metrics.
- **Matrix table** `.vmatrix` — CSS grid with a mono/muted label column and bordered cells, used
  for reconciliation tables (flag → position → outcome → status) where a plain `<table>` reads
  too dense.
- **Quote** `.quote` — italic, left border, for verbatim management commentary. Always cite
  speaker, role, and call date directly after the quote.
- **Verdict band** — a flex-wrapped row of 5-8 chips closing the report, one clause each,
  covering the most decision-relevant facts (what changed, what's confirmed vs assumed, what
  the market is/isn't pricing in).

## Report skeleton (adapt section count/order to the skill, keep the shell)

1. Eyebrow + title + subtitle + thick rule (header)
2. Optional top alert/callout for a breaking price move or the single most important caveat
3. KPI headline grid (if the report has one)
4. **Verdict section first, always** — the report's bottom-line call (subscription
   view/buy-sell-hold/pass-fail + one-paragraph rationale) is section `01`, immediately after the
   KPI grid, not the last thing the reader reaches after every supporting section. The reader
   should get the answer before the evidence; everything after section 01 is "here's why," not
   "here's the answer, finally." Renumber the rest of the report's sections accordingly (`02`
   onward) — don't leave a duplicate verdict at the bottom.
5. Remaining numbered sections, each with a `.sec-hd`, in supporting-evidence order
6. Disclaimer footer (already baked into `wrapHtml` — don't duplicate it by hand)

## Copy-paste CSS block

For skills rendering HTML directly (not going through `pdfRenderer.wrapHtml`), copy this block
verbatim into your report's `<style>` tag. It is the same system as `wrapHtml` above, condensed
for a full-page report with `@page` margins for weasyprint/Chromium print rendering:

```css
@page {
  size: A4;
  margin: 16mm 14mm;
  @bottom-center {
    content: '<Report title> | ' counter(page) ' of ' counter(pages);
    font-size: 8px;
    color: #888;
  }
}
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
body {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 11px;
  color: #1a1a1a;
  line-height: 1.45;
}
h1 {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 2px;
}
.eyebrow {
  font-size: 9.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #888;
  font-family: monospace;
  margin-bottom: 4px;
}
.subline {
  font-size: 9.5px;
  font-family: monospace;
  color: #555;
  margin-top: 3px;
  margin-bottom: 10px;
}
.hdr {
  border-bottom: 2.5px solid #111;
  padding-bottom: 8px;
  margin-bottom: 12px;
}
.alert {
  background: #fcf3e0;
  border: 1px solid #ef9f27;
  border-radius: 4px;
  padding: 9px 12px;
  margin-bottom: 14px;
  font-size: 11px;
  color: #412402;
}
.sec {
  margin-top: 16px;
  page-break-inside: avoid;
}
.sec-hd {
  font-size: 11px;
  font-family: monospace;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #777;
  border-bottom: 1px solid #ddd;
  padding-bottom: 3px;
  margin-bottom: 7px;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 10.3px;
  margin-bottom: 6px;
}
th {
  font-family: monospace;
  font-size: 8.5px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #888;
  padding: 4px 6px;
  text-align: left;
  border-bottom: 1.5px solid #ccc;
}
th.r,
td.r {
  text-align: right;
}
td {
  padding: 4.5px 6px;
  border-bottom: 0.5px solid #e5e5e5;
  vertical-align: top;
}
td.mono,
td.r {
  font-family: monospace;
  font-size: 10px;
}
.up {
  color: #0f6e56;
  font-weight: 600;
}
.dn {
  color: #a32d2d;
  font-weight: 600;
}
.chip {
  display: inline-block;
  font-size: 8.6px;
  font-family: monospace;
  padding: 2.5px 6.5px;
  border-radius: 3px;
  font-weight: 600;
  margin: 1.5px 2px 1.5px 0;
}
.chip-g {
  background: #eaf3de;
  color: #27500a;
}
.chip-r {
  background: #fcebeb;
  color: #791f1f;
}
.chip-y {
  background: #faeeda;
  color: #633806;
}
.chip-b {
  background: #e6f1fb;
  color: #0c447c;
}
.ftag {
  display: inline-block;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 3px;
  border: 1px solid;
  font-size: 10px;
}
.ftag-g {
  background: #eaf3de;
  color: #27500a;
  border-color: #a9cf8a;
}
.ftag-y {
  background: #faeeda;
  color: #633806;
  border-color: #eec27e;
}
.ftag-r {
  background: #fcebeb;
  color: #791f1f;
  border-color: #ecaaa9;
}
.ftag-b {
  background: #e6f1fb;
  color: #0c447c;
  border-color: #a7cdec;
}
.hl {
  padding: 7px 10px;
  border-radius: 3px;
  margin: 6px 0;
  font-size: 10.5px;
  line-height: 1.5;
}
.hl-g {
  background: #eaf3de;
  border-left: 3px solid #5bad3a;
  color: #1a3d0a;
}
.hl-r {
  background: #fcebeb;
  border-left: 3px solid #e24b4a;
  color: #52100f;
}
.hl-y {
  background: #faeeda;
  border-left: 3px solid #ef9f27;
  color: #412402;
}
.hl-b {
  background: #e6f1fb;
  border-left: 3px solid #3a85c9;
  color: #0a2752;
}
.quote {
  font-style: italic;
  font-size: 10.3px;
  color: #555;
  border-left: 2px solid #ccc;
  padding: 3px 10px;
  margin: 6px 0;
}
.grid4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin: 8px 0;
}
.grid3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 8px 0;
}
.kpi {
  background: #f5f4f0;
  border-radius: 4px;
  padding: 8px 10px;
}
.kpi-g {
  border-left: 3px solid #5bad3a;
}
.kpi-y {
  border-left: 3px solid #ef9f27;
}
.kpi-r {
  border-left: 3px solid #e24b4a;
}
.kpi-b {
  border-left: 3px solid #3a85c9;
}
.label {
  font-size: 8px;
  font-family: monospace;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 3px;
}
.bignum {
  font-size: 18px;
  font-weight: 600;
}
.subnum {
  font-size: 9.2px;
  font-family: monospace;
  color: #666;
  margin-top: 2px;
}
.vmatrix {
  display: grid;
  grid-template-columns: 130px repeat(3, 1fr);
  border: 0.5px solid #ccc;
  border-radius: 4px;
  overflow: hidden;
  font-size: 9.4px;
  margin: 6px 0;
}
.vmatrix > div {
  padding: 5.5px 7px;
  border-bottom: 0.5px solid #e5e5e5;
}
.vmatrix > div:nth-child(4n-3) {
  background: #f5f4f0;
  font-family: monospace;
  font-size: 8.5px;
  text-transform: uppercase;
  color: #888;
}
.vmatrix > div:nth-child(4n-2),
.vmatrix > div:nth-child(4n-1),
.vmatrix > div:nth-child(4n) {
  border-left: 0.5px solid #e5e5e5;
}
.verdict-band {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 6px;
}
strong {
  font-weight: 600;
}
```

Adjust `.vmatrix`'s `grid-template-columns` first value (label column width) to fit your longest
row label; everything else is copy-paste stable. These are the 2026-07-24 revised sizes (bumped
up from the original pass) — do not size back down without a new legibility complaint to justify it.

## Interactive widgets (visualize tool, not PDF)

The same palette/component vocabulary applies to `mcp__visualize__show_widget` HTML widgets —
see `skills/equity-research/consecutive-filings-diff/assets/briefing_template.html` for the CSS
variable-based version (`var(--text-primary)` etc. instead of hardcoded hex, since widgets must
support the host's dark mode). Don't copy the PDF hex-value CSS block into a widget; translate
each hex to its nearest CDS token per `mcp__visualize__read_me`.

## Rollout status (2026-07-23)

- `stock-api/src/utils/pdfUtils.js` — palette unified to this system (`FLAT_PALETTE`), new
  `chipHtml()`/`calloutHtml()` helpers added, `styledTableHtml()` restyled to hairline/mono
  headers. Done.
- `stock-api/src/utils/pdfRenderer.js` — `wrapHtml()` shell restyled (eyebrow, mono section
  headers, `.chip`/`.hl`/`.kpi`/`.vmatrix` classes registered globally). Done.
- All generators under `stock-api/src/generators/*.js` (concall, forensic, growth-triggers,
  DRHP, peer, sector, report) inherit this automatically via `pdfUtils`/`pdfRenderer` — no
  per-file changes were needed since they consume the shared palette/shell rather than hardcoding
  colors. Verify visually next time each generator runs; none were smoke-tested as part of this
  change.
- Skills without a JS generator (direct HTML + weasyprint, e.g. this file's own origin report)
  should copy the CSS block above. Not yet retrofitted: none identified at time of writing since
  `consecutive-filings-diff` was the first of this kind.
