# Forward Guidance -- Metric Taxonomy & Edge-Case Rulings

## Categories and metrics

| Category      | Metric                     | Typical unit                           | Notes                                                                                                       |
| ------------- | -------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Top Line      | Revenue / Sales / Turnover | Cr (absolute) or % (growth)            | Volume guidance (units, tonnes) counted here too                                                            |
| Top Line      | Volume                     | units/tonnes or %                      | Keep native unit management used; don't convert                                                             |
| Margins       | EBITDA Margin              | %                                      | Absolute value IS a percent; growth expressed in bps in the quote                                           |
| Margins       | Gross Profit Margin        | %                                      | Same rule as EBITDA margin                                                                                  |
| Margins       | Operating Profit Margin    | %                                      | Same rule as EBITDA margin                                                                                  |
| Margins       | Net Profit Margin          | %                                      | Same rule as EBITDA margin                                                                                  |
| Bottom Line   | PAT                        | Cr (absolute) or % (growth)            |                                                                                                             |
| Bottom Line   | EPS                        | Rs/share                               | Rarely guided directly -- usually derived from PAT + share count, only fill if management states EPS itself |
| Balance Sheet | Debt                       | Cr (absolute) or % (reduction)         | Net debt vs gross debt -- record which one the quote specifies                                              |
| Balance Sheet | Depreciation               | Cr                                     |                                                                                                             |
| Balance Sheet | Tax                        | Cr or effective tax rate %             |                                                                                                             |
| Balance Sheet | Cash Flow                  | Cr (Operating/Free CF -- record which) |                                                                                                             |
| Key Metrics   | Capacity                   | units (MW, tonnes, lines, etc.)        | Native unit                                                                                                 |
| Key Metrics   | Utilisation                | %                                      |                                                                                                             |
| Key Metrics   | Order Book                 | Cr or x (book-to-bill)                 |                                                                                                             |
| Key Metrics   | ROCE / ROE / ROA           | %                                      |                                                                                                             |

## Explicit vs directional -- the line that matters most

Explicit (extract):

- "We expect 18-20% revenue growth in FY27"
- "EBITDA margin should settle at 22-23% by Q4"
- "We are targeting a net debt-free balance sheet by FY28"
- "Order book stands at 1,200 Cr, book-to-bill of 1.8x, we see this reaching
  2,000 Cr by year end"

Directional (do NOT extract as a row -- no number/no period, or both):

- "We remain confident about the growth trajectory"
- "Margins should improve going forward"
- "We have a healthy pipeline of orders"
- "We continue to focus on deleveraging"

## Range handling

"18-20% growth" -> `relative_pct: 19` (midpoint), full range preserved verbatim
in `quote`. Never silently pick just the low or high end without preserving
the range in the sheet's Management Quote column.

## Reaffirmed vs stale references

- Management restates a number they gave before, in THIS transcript, with the
  same conviction ("as guided, we still see 20% growth in FY27") -> extract
  normally, this transcript is now itself the confirmation.
- Management references an older target only in passing, without restating
  confidence, and the original transcript where it was first guided is not in
  our `available` set -> still record it, but mark `stale_reference: true` and
  surface it via `--stale-note` at Phase 4 so it's flagged in the sheet rather
  than presented as freshly confirmed.
