"""Management Credibility Tracker — HTML widget generator.

Produces a single self-contained HTML widget showing:
  - Banner: company + score badge (color-coded)
  - KPI strip: tracking window, promises closed, beat rate, missed metric
  - Color-coded scoreboard table: every promise + status
  - Confidence-language trajectory mini-chart (Chart.js 4.4.1, optional)
  - Interpretation paragraph + case-study match callout

Schema (Python dict):

    data = {
        "company_name": str,
        "ticker": str,
        "tracking_window": str,         # e.g. "Q1 FY24 - Q3 FY26"
        "score": int,                   # e.g., +3 or -1
        "rating": str,                  # HIGH | MEDIUM | MIXED | WATCH | RED
        "promises_closed": int,
        "beat_rate": float,             # 0.0-1.0 (e.g., 0.75 = 75%)
        "most_missed_metric": str,
        "most_credible_metric": str,
        "promises": [
            {
                "quarter": "Q4 FY24",
                "promise": "FY26 revenue growth 20% YoY",
                "outcome": "FY26 actual: 14% (Q3 TTM)",
                "status": "MISSED",
                "score": -1,
                "metric_type": "revenue",
            },
            ...
        ],
        "confidence_trajectory": [      # optional — for Chart.js mini-chart
            {"quarter": "Q1 FY26", "high": 8, "medium": 12, "low": 2},
            ...
        ],
        "case_study_match": "Mayur" | "Navin" | "Hikal" | "Gravita" | None,
        "interpretation": str,
        "output_path": str,
    }
"""
import json
import os
from html import escape


RATING_COLORS = {
    'HIGH': '#27AE60',
    'MEDIUM': '#2b6cb0',
    'MIXED': '#F39C12',
    'WATCH': '#E67E22',
    'RED': '#E74C3C',
}

STATUS_COLORS = {
    'DELIVERED': '#27AE60',
    'ON TRACK': '#2ECC71',
    'MIXED': '#F39C12',
    'MISSING': '#95A5A6',
    'TOO EARLY': '#95A5A6',
    'MISSED': '#E74C3C',
    'WITHDRAWN': '#9B2C2C',
}


HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{company_name} — Management Credibility Tracker</title>
<style>
:root {{
  --bg: #f7fafc;
  --surface: #ffffff;
  --border: #e2e8f0;
  --text: #1a202c;
  --muted: #4a5568;
  --primary: #1a365d;
  --secondary: #2b6cb0;
  --tint: #ebf8ff;
  --good: #27AE60;
  --warn: #F39C12;
  --bad: #E74C3C;
  --neutral: #95A5A6;
}}
[data-theme="dark"] {{
  --bg: #1a1f2e;
  --surface: #232938;
  --border: #2d3748;
  --text: #e2e8f0;
  --muted: #a0aec0;
  --primary: #1B2A4A;
  --secondary: #2C4A7C;
  --tint: #2C4A7C;
  --good: #27AE60;
  --warn: #F39C12;
  --bad: #E74C3C;
  --neutral: #95A5A6;
}}
* {{ box-sizing: border-box; }}
body {{
  margin: 0; padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
}}
.container {{ max-width: 1080px; margin: 0 auto; }}
.header {{
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 20px 24px;
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 16px;
}}
.header-text h1 {{ margin: 0 0 4px 0; font-size: 22px; color: var(--primary); }}
.header-text .meta {{ color: var(--muted); font-size: 13px; }}
.score-badge {{
  font-size: 32px; font-weight: bold; color: white;
  padding: 12px 24px; border-radius: 8px; text-align: center;
  min-width: 140px;
}}
.score-badge .small {{ font-size: 12px; font-weight: normal; display: block; }}
.kpi-strip {{
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px; margin-bottom: 16px;
}}
.kpi {{
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 14px;
}}
.kpi-label {{ color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }}
.kpi-value {{ font-size: 18px; font-weight: bold; color: var(--text); margin-top: 4px; }}
.section {{
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 18px 22px;
  margin-bottom: 16px;
}}
.section h2 {{ margin: 0 0 12px 0; color: var(--primary); font-size: 16px; }}
table.scoreboard {{
  width: 100%; border-collapse: collapse; font-size: 12px;
}}
table.scoreboard th, table.scoreboard td {{
  padding: 8px 10px; border-bottom: 1px solid var(--border);
  text-align: left; vertical-align: top;
}}
table.scoreboard th {{ background: var(--tint); color: var(--primary); font-weight: bold; }}
.status-pill {{
  display: inline-block; padding: 3px 8px; border-radius: 4px;
  color: white; font-weight: bold; font-size: 11px; text-align: center;
  min-width: 80px;
}}
.case-study-callout {{
  background: var(--tint); border-left: 4px solid var(--primary);
  padding: 12px 18px; border-radius: 4px; font-size: 13px;
  margin-top: 12px;
}}
.case-study-callout strong {{ color: var(--primary); }}
.theme-toggle {{
  position: fixed; top: 16px; right: 16px;
  padding: 8px 14px; border-radius: 6px; cursor: pointer;
  background: var(--surface); border: 1px solid var(--border);
  color: var(--text); font-size: 12px;
}}
.disclaimer {{
  font-size: 10px; color: var(--muted);
  margin-top: 24px; padding: 12px 16px;
  background: var(--surface); border-radius: 4px;
  font-style: italic;
}}
</style>
</head>
<body>
<button class="theme-toggle" onclick="toggleTheme()">Toggle theme</button>
<div class="container">

  <div class="header">
    <div class="header-text">
      <h1>{company_name}</h1>
      <div class="meta">{ticker} &nbsp;•&nbsp; Tracking: {tracking_window}</div>
    </div>
    <div class="score-badge" style="background: {rating_color};">
      {score_sign}{score_abs}
      <span class="small">{rating}</span>
    </div>
  </div>

  <div class="kpi-strip">
    <div class="kpi">
      <div class="kpi-label">Promises closed</div>
      <div class="kpi-value">{promises_closed}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Beat rate</div>
      <div class="kpi-value">{beat_rate_pct}%</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Most credible metric</div>
      <div class="kpi-value">{most_credible_metric}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Most missed metric</div>
      <div class="kpi-value">{most_missed_metric}</div>
    </div>
  </div>

  <div class="section">
    <h2>Walk-the-Talk Scoreboard</h2>
    <table class="scoreboard">
      <thead>
        <tr>
          <th style="width: 80px;">Quarter</th>
          <th>Promise</th>
          <th>Outcome</th>
          <th style="width: 100px;">Metric</th>
          <th style="width: 110px;">Status</th>
        </tr>
      </thead>
      <tbody>
        {promises_rows}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>Interpretation</h2>
    <p>{interpretation}</p>
    {case_study_block}
  </div>

  <div class="disclaimer">
    This analysis tracks management's quantitative guidance vs actual outcomes across {promises_closed} closed promises.
    +1 = beat or on-track; -1 = missed (>10% below guidance). Promises in flight (TOO EARLY / MISSING) are excluded
    from the score. Not investment advice; primary documents and live verification recommended before acting.
  </div>
</div>
<script>
function toggleTheme() {{
  const root = document.documentElement;
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
}}
</script>
</body>
</html>
"""


def _row_html(promise: dict) -> str:
    status = (promise.get('status') or '').upper().strip()
    color = STATUS_COLORS.get(status, STATUS_COLORS.get('MIXED'))
    return (
        f'<tr>'
        f'<td>{escape(promise.get("quarter", ""))}</td>'
        f'<td>{escape(promise.get("promise", ""))}</td>'
        f'<td>{escape(promise.get("outcome", ""))}</td>'
        f'<td>{escape(promise.get("metric_type", "—"))}</td>'
        f'<td><span class="status-pill" style="background: {color};">{escape(status or "—")}</span></td>'
        f'</tr>'
    )


def _case_study_block(case_study_match):
    if not case_study_match:
        return ''
    descriptions = {
        'Mayur': 'Under-promise / over-deliver. Premium credibility — accumulate on dips.',
        'Navin': 'Multi-driver outperformance. Premium-quality compounder.',
        'Hikal': 'Over-optimistic guidance with deteriorating language. Watch / reduce.',
        'Gravita': 'Mixed delivery — some metrics beat, some miss. Reset to base case.',
    }
    desc = descriptions.get(case_study_match, '')
    return (
        f'<div class="case-study-callout">'
        f'<strong>Case-study match: {escape(case_study_match)}</strong> &mdash; {escape(desc)}'
        f'</div>'
    )


def create_credibility_widget(data: dict) -> str:
    output_path = data['output_path']
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    score = data.get('score', 0)
    rating = data.get('rating', 'MEDIUM')
    rating_color = RATING_COLORS.get(rating.upper(), RATING_COLORS['MEDIUM'])

    promises_rows = '\n        '.join(
        _row_html(p) for p in data.get('promises', [])
    ) or '<tr><td colspan="5">No promises tracked yet.</td></tr>'

    beat_rate_pct = round(data.get('beat_rate', 0.0) * 100)

    rendered = HTML_TEMPLATE.format(
        company_name=escape(data.get('company_name', '')),
        ticker=escape(data.get('ticker', '')),
        tracking_window=escape(data.get('tracking_window', '')),
        score_sign='+' if score > 0 else ('' if score == 0 else '-'),
        score_abs=abs(score),
        rating=escape(rating),
        rating_color=rating_color,
        promises_closed=data.get('promises_closed', 0),
        beat_rate_pct=beat_rate_pct,
        most_credible_metric=escape(data.get('most_credible_metric', '—')),
        most_missed_metric=escape(data.get('most_missed_metric', '—')),
        promises_rows=promises_rows,
        interpretation=escape(data.get('interpretation', '')),
        case_study_block=_case_study_block(data.get('case_study_match')),
    )

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(rendered)
    return output_path


def get_credibility_schema(data: dict) -> dict:
    """Return a flat schema for cross-skill consumption (no widget rendered)."""
    return {
        'company_name': data.get('company_name'),
        'ticker': data.get('ticker'),
        'score': data.get('score'),
        'rating': data.get('rating'),
        'beat_rate': data.get('beat_rate'),
        'promises_closed': data.get('promises_closed'),
        'most_credible_metric': data.get('most_credible_metric'),
        'most_missed_metric': data.get('most_missed_metric'),
        'case_study_match': data.get('case_study_match'),
        'interpretation': data.get('interpretation'),
    }


if __name__ == '__main__':
    sample = {
        'company_name': 'Sample Industries Ltd',
        'ticker': 'NSE:SAMPLE',
        'tracking_window': 'Q1 FY24 - Q3 FY26',
        'score': 2,
        'rating': 'MEDIUM',
        'promises_closed': 6,
        'beat_rate': 0.67,
        'most_credible_metric': 'EBITDA margin',
        'most_missed_metric': 'capacity commissioning',
        'promises': [
            {'quarter': 'Q4 FY24', 'promise': 'FY26 revenue growth 20%',
             'outcome': 'FY26 14%', 'status': 'MISSED', 'score': -1, 'metric_type': 'revenue'},
            {'quarter': 'Q4 FY24', 'promise': 'EBITDA margin 18%',
             'outcome': 'FY26 18.4%', 'status': 'DELIVERED', 'score': 1, 'metric_type': 'margin'},
            {'quarter': 'Q1 FY25', 'promise': 'New plant Q2 FY26',
             'outcome': 'Commissioned Q4 FY26', 'status': 'MISSED', 'score': -1, 'metric_type': 'capacity'},
            {'quarter': 'Q2 FY25', 'promise': 'Order book growth 30%',
             'outcome': 'Up 32% YoY', 'status': 'DELIVERED', 'score': 1, 'metric_type': 'order_book'},
            {'quarter': 'Q3 FY25', 'promise': 'CDMO revenue 50% growth',
             'outcome': 'Up 65% YoY', 'status': 'DELIVERED', 'score': 1, 'metric_type': 'revenue'},
            {'quarter': 'Q4 FY25', 'promise': 'Margin 20% by Q4 FY26',
             'outcome': 'Q3 FY26 19.8%', 'status': 'ON TRACK', 'score': 1, 'metric_type': 'margin'},
        ],
        'case_study_match': 'Gravita',
        'interpretation': 'Sample scored +2 over 6 closed promises. EBITDA margin has been the strongest area (3 of 3 delivered), while capacity commissioning has been the persistent miss (1 of 1 missed). The closest documented case-study pattern is Gravita, which implies MONITOR.',
        'output_path': '/tmp/sample_credibility.html',
    }
    out = create_credibility_widget(sample)
    print(f"Generated: {out}")
