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
- **Numbered sections, not free-flowing headings.** `01 Live snapshot`, `02 P&L diff`, etc. Makes
  multi-page institutional reports skimmable and gives a stable anchor for "see section 09."
- **One eyebrow line, one title, one subtitle, one thick rule — then straight into content.**
  No cover page, no logo block, no decorative first page for a 1-10 page report.

## Palette

| Token | Hex | Use |
|---|---|---|
| `primary` | `#111111` | Title text, thick top rule, table header rule |
| `text` | `#1a1a1a` | Body text |
| `muted` | `#666666` | Eyebrow, subtitle, table header labels, captions |
| `border` | `#dddddd` | Hairline rules, table row dividers |
| `tint` / `surface` / `alt_row` | `#f5f4f0` | KPI card bg, alternating table rows |
| `secondary` | `#0c447c` | Rarely used directly — prefer `chip-b` |

Signal tones (used consistently for chips and callouts, never swapped):

| Tone | Chip bg / fg | Callout bg / left-border / fg | Meaning |
|---|---|---|---|
| green (`g`) | `#eaf3de` / `#27500a` | `#eaf3de` / `#5bad3a` / `#1a3d0a` | confirmed, clean, resolved, positive |
| red (`r`) | `#fcebeb` / `#791f1f` | `#fcebeb` / `#e24b4a` / `#52100f` | red flag, core driver of risk, highest materiality |
| amber (`y`) | `#faeeda` / `#633806` | `#faeeda` / `#ef9f27` / `#412402` | watchlist, unresolved, caveat, unverified input |
| blue (`b`) | `#e6f1fb` / `#0c447c` | `#e6f1fb` / `#3a85c9` / `#0a2752` | neutral/informational note |

Never use raw black, red, or green outside this table — always pull from it so tone reads
consistently across every skill's output.

## Typography

- Body: `'Helvetica Neue', Helvetica, Arial, sans-serif`, `10.5px`, `line-height: 1.45`.
- Title (`h1`/`.title`): `20pt`, weight `600`, `primary` color.
- Eyebrow (above title): `9px`, `monospace`, uppercase, `letter-spacing: 0.1em`, `muted` color —
  format as `Report type · TICKER · date range`.
- Subtitle (below title): `9px`, `monospace`, `muted` — sources/methodology one-liner.
- Section header (`h2`/`.sec-hd`): `10.5px`, `monospace`, uppercase, `letter-spacing: 0.08em`,
  `muted` color, `1px solid border` bottom rule. Numbered: `01  Section title`.
- Table header cells: `8px`, `monospace`, uppercase, `letter-spacing: 0.04em`, `muted`.
- Table body cells / numeric cells: `9.5-11px`; numeric columns get `font-family: monospace`.

## Components

- **Chip** `.chip.chip-{g,r,y,b}` — inline status/verdict tag, `7.8-8.5px monospace`, `2px 6px`
  padding, `3px` radius. Use for per-row signals in tables and end-of-report verdict bands.
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
3. Numbered sections, each with a `.sec-hd`, ending in a verdict/chip band
4. Disclaimer footer (already baked into `wrapHtml` — don't duplicate it by hand)

## Copy-paste CSS block

For skills rendering HTML directly (not going through `pdfRenderer.wrapHtml`), copy this block
verbatim into your report's `<style>` tag. It is the same system as `wrapHtml` above, condensed
for a full-page report with `@page` margins for weasyprint/Chromium print rendering:

```css
@page { size: A4; margin: 16mm 14mm; @bottom-center { content: "<Report title> | " counter(page) " of " counter(pages); font-size: 8px; color: #888; } }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10.5px; color: #1a1a1a; line-height: 1.45; }
h1 { font-size: 20px; font-weight: 600; margin-bottom: 2px; }
.eyebrow { font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: #888; font-family: monospace; margin-bottom: 4px; }
.subline { font-size: 9px; font-family: monospace; color: #555; margin-top: 3px; margin-bottom: 10px; }
.hdr { border-bottom: 2.5px solid #111; padding-bottom: 8px; margin-bottom: 12px; }
.alert { background: #fcf3e0; border: 1px solid #ef9f27; border-radius: 4px; padding: 9px 12px; margin-bottom: 14px; font-size: 10.5px; color: #412402; }
.sec { margin-top: 16px; page-break-inside: avoid; }
.sec-hd { font-size: 10.5px; font-family: monospace; letter-spacing: 0.08em; text-transform: uppercase; color: #777; border-bottom: 1px solid #ddd; padding-bottom: 3px; margin-bottom: 7px; }
table { width: 100%; border-collapse: collapse; font-size: 9.8px; margin-bottom: 6px; }
th { font-family: monospace; font-size: 8px; text-transform: uppercase; letter-spacing: 0.04em; color: #888; padding: 4px 6px; text-align: left; border-bottom: 1.5px solid #ccc; }
th.r, td.r { text-align: right; }
td { padding: 4px 6px; border-bottom: 0.5px solid #e5e5e5; vertical-align: top; }
td.mono, td.r { font-family: monospace; font-size: 9.5px; }
.up { color: #0f6e56; font-weight: 600; }
.dn { color: #a32d2d; font-weight: 600; }
.chip { display: inline-block; font-size: 7.8px; font-family: monospace; padding: 2px 6px; border-radius: 3px; font-weight: 600; margin: 1px 2px 1px 0; }
.chip-g { background: #eaf3de; color: #27500a; }
.chip-r { background: #fcebeb; color: #791f1f; }
.chip-y { background: #faeeda; color: #633806; }
.chip-b { background: #e6f1fb; color: #0c447c; }
.hl { padding: 7px 10px; border-radius: 3px; margin: 6px 0; font-size: 10px; line-height: 1.5; }
.hl-g { background: #eaf3de; border-left: 3px solid #5bad3a; color: #1a3d0a; }
.hl-r { background: #fcebeb; border-left: 3px solid #e24b4a; color: #52100f; }
.hl-y { background: #faeeda; border-left: 3px solid #ef9f27; color: #412402; }
.hl-b { background: #e6f1fb; border-left: 3px solid #3a85c9; color: #0a2752; }
.quote { font-style: italic; font-size: 9.8px; color: #555; border-left: 2px solid #ccc; padding: 3px 10px; margin: 6px 0; }
.grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 8px 0; }
.grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 8px 0; }
.kpi { background: #f5f4f0; border-radius: 4px; padding: 8px 10px; }
.label { font-size: 7.5px; font-family: monospace; color: #888; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
.bignum { font-size: 17px; font-weight: 600; }
.subnum { font-size: 8.5px; font-family: monospace; color: #666; margin-top: 2px; }
.vmatrix { display: grid; grid-template-columns: 130px repeat(3, 1fr); border: 0.5px solid #ccc; border-radius: 4px; overflow: hidden; font-size: 8.8px; margin: 6px 0; }
.vmatrix > div { padding: 5px 7px; border-bottom: 0.5px solid #e5e5e5; }
.vmatrix > div:nth-child(4n-3) { background: #f5f4f0; font-family: monospace; font-size: 8px; text-transform: uppercase; color: #888; }
.vmatrix > div:nth-child(4n-2), .vmatrix > div:nth-child(4n-1), .vmatrix > div:nth-child(4n) { border-left: 0.5px solid #e5e5e5; }
.verdict-band { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
strong { font-weight: 600; }
```

Adjust `.vmatrix`'s `grid-template-columns` first value (label column width) to fit your longest
row label; everything else is copy-paste stable.

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
