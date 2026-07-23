#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
UI-layer renderer for drhp-ipo-analysis reports.

Contract (see skills/_shared/pdf-design-guide.md + skills/tooling/output-dto-standard):
  - This script is a PURE FUNCTION of the DTO (reports/<id>.json). It reads every
    field that exists in the DTO and renders it. It does not decide which facts are
    "important enough" to keep — that decision was already made when the DTO was
    written (data layer). If a field is empty/absent, it's skipped; nothing is ever
    truncated, summarized, or reworded here.
  - Only layout, typography, component choice (table vs kpi vs vmatrix vs chip) and
    color/tone mapping happen in this file. No new facts, no dropped facts.
  - The `additional` field (any JSON shape) is rendered via the shared shape-sniffing
    renderer in skills/_shared/render_additional.py — never hand-rolled here.
  - Run: python3 render_drhp.py <dto.json> <out.pdf>
"""
import sys
import os
import json
import weasyprint

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "_shared"))
try:
    from render_additional import render_additional_html
except ImportError:
    # fallback for standalone/sandbox execution where _shared isn't on this relative path
    sys.path.insert(0, os.path.dirname(__file__))
    from render_additional import render_additional_html

CSS = """
@page { size: A4; margin: 16mm 14mm; @bottom-center { content: "<TITLE> | " counter(page) " of " counter(pages); font-size: 8px; color: #888; } }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a1a1a; line-height: 1.45; }
h1 { font-size: 20px; font-weight: 600; margin-bottom: 2px; }
.eyebrow { font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase; color: #888; font-family: monospace; margin-bottom: 4px; }
.subline { font-size: 9.5px; font-family: monospace; color: #555; margin-top: 3px; margin-bottom: 10px; }
.hdr { border-bottom: 2.5px solid #111; padding-bottom: 8px; margin-bottom: 12px; display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.hdr-main { flex: 1; }
.alert { background: #fcf3e0; border: 1px solid #ef9f27; border-radius: 4px; padding: 9px 12px; margin-bottom: 14px; font-size: 11px; color: #412402; }
.sec { margin-top: 14px; page-break-inside: avoid; }
.sec-hd { font-size: 11px; font-family: monospace; letter-spacing: 0.08em; text-transform: uppercase; color: #777; border-bottom: 1px solid #ddd; padding-bottom: 3px; margin-bottom: 7px; }
table { width: 100%; border-collapse: collapse; font-size: 10.3px; margin-bottom: 6px; }
th { font-family: monospace; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.04em; color: #888; padding: 4px 6px; text-align: left; border-bottom: 1.5px solid #ccc; }
th.r, td.r { text-align: right; }
td { padding: 4.5px 6px; border-bottom: 0.5px solid #e5e5e5; vertical-align: top; }
td.mono, td.r { font-family: monospace; font-size: 10px; }
.up { color: #0f6e56; font-weight: 600; }
.dn { color: #a32d2d; font-weight: 600; }
.chip { display: inline-block; font-size: 8.6px; font-family: monospace; padding: 2.5px 6.5px; border-radius: 3px; font-weight: 600; margin: 1.5px 2px 1.5px 0; }
.chip-g { background: #eaf3de; color: #27500a; }
.chip-r { background: #fcebeb; color: #791f1f; }
.chip-y { background: #faeeda; color: #633806; }
.chip-b { background: #e6f1fb; color: #0c447c; }
.chip-lg { font-size: 11px; padding: 4px 10px; }
.ftag { display: inline-block; font-weight: 600; padding: 3px 8px; border-radius: 3px; border: 1px solid; font-size: 10px; }
.ftag-g { background: #eaf3de; color: #27500a; border-color: #a9cf8a; }
.ftag-y { background: #faeeda; color: #633806; border-color: #eec27e; }
.ftag-r { background: #fcebeb; color: #791f1f; border-color: #ecaaa9; }
.ftag-b { background: #e6f1fb; color: #0c447c; border-color: #a7cdec; }
.hl { padding: 7px 10px; border-radius: 3px; margin: 6px 0; font-size: 10.5px; line-height: 1.5; }
.hl-g { background: #eaf3de; border-left: 3px solid #5bad3a; color: #1a3d0a; }
.hl-r { background: #fcebeb; border-left: 3px solid #e24b4a; color: #52100f; }
.hl-y { background: #faeeda; border-left: 3px solid #ef9f27; color: #412402; }
.hl-b { background: #e6f1fb; border-left: 3px solid #3a85c9; color: #0a2752; }
.grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 8px 0; }
.grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 8px 0; }
.kpi { background: #f5f4f0; border-radius: 4px; padding: 8px 10px; }
.kpi-g { border-left: 3px solid #5bad3a; }
.kpi-y { border-left: 3px solid #ef9f27; }
.kpi-r { border-left: 3px solid #e24b4a; }
.kpi-b { border-left: 3px solid #3a85c9; }
.label { font-size: 8px; font-family: monospace; color: #888; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
.bignum { font-size: 18px; font-weight: 600; }
.subnum { font-size: 9.2px; font-family: monospace; color: #666; margin-top: 2px; }
.vmatrix { display: grid; grid-template-columns: 160px repeat(3, 1fr); border: 0.5px solid #ccc; border-radius: 4px; overflow: hidden; font-size: 9.4px; margin: 6px 0; }
.vmatrix > div { padding: 5.5px 7px; border-bottom: 0.5px solid #e5e5e5; }
.vmatrix > div:nth-child(4n-3) { background: #f5f4f0; font-family: monospace; font-size: 8.5px; text-transform: uppercase; color: #888; }
.vmatrix > div:nth-child(4n-2), .vmatrix > div:nth-child(4n-1), .vmatrix > div:nth-child(4n) { border-left: 0.5px solid #e5e5e5; }
.verdict-band { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
strong { font-weight: 600; }
.twocol { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
ul.tight { margin-left: 15px; margin-top: 3px; }
ul.tight li { margin-bottom: 3.5px; }
"""

CHIP_TONE = {"GREEN": "g", "YELLOW": "y", "RED": "r"}
VIEW_TONE = {
    "SUBSCRIBE": "g", "SUBSCRIBE-FOR-LISTING-GAINS-ONLY": "y",
    "WATCH-POST-LISTING": "y", "AVOID": "r",
}
# semantic direction: True = higher value is the good outcome for this metric
HIGHER_IS_GOOD = {
    "revenue": True, "ebitda_margin_pct": True, "pat": True, "pat_margin_pct": True,
    "ronw_pct": True, "roce_pct": True, "debt_equity": False, "cfo_inr_lakh": True,
    "debtor_days": False, "days_working_capital": False, "top10_customer_concentration_pct": False,
}


def esc(v):
    return "" if v is None else str(v)


def money(v, suffix=""):
    if v is None:
        return "—"
    return f"{v:,.2f}{suffix}"


def render(dto: dict) -> str:
    view = dto.get("subscription_view", "—")
    view_tone = VIEW_TONE.get(view, "b")
    pl = dto.get("post_listing_status", {})
    kpis = dto.get("kpi_headline", [])

    kpi_html = "".join(
        f'<div class="kpi kpi-{k.get("tone","")}"><div class="label">{esc(k.get("label"))}</div>'
        f'<div class="bignum">{esc(k.get("value"))}</div>'
        f'<div class="subnum">{esc(k.get("sub"))}</div></div>'
        for k in kpis
    )

    # ---- 01 Business, promoters, objects of issue ----
    bo = dto.get("business_overview", {})
    prod_mix = bo.get("product_mix_fy25_pct", {})
    cust_mix = bo.get("customer_mix_fy25_pct", {})
    prod_str = ", ".join(f"{k.replace('_', ' ')} {v}%" for k, v in prod_mix.items())
    cust_str = ", ".join(f"{k.replace('_', ' ')} {v}%" for k, v in cust_mix.items())
    promoters_str = "; ".join(
        f'{p["name"]} ({p.get("role")}, {p.get("pre_issue_pct")}%)' for p in dto.get("promoters", [])
    )
    objects_rows = "".join(
        f'<tr><td>{esc(o.get("object"))}</td>'
        f'<td class="r mono">{money(o.get("amount_inr_lakh")) if o.get("amount_inr_lakh") is not None else esc(o.get("note",""))}</td>'
        f'<td class="r mono">{money(o.get("fy27_lakh")) if o.get("fy27_lakh") is not None else "—"}/{money(o.get("fy28_lakh")) if o.get("fy28_lakh") is not None else "—"}</td></tr>'
        for o in dto.get("objects_of_issue", [])
    )

    sec_verdict = f"""
<div class="sec" style="margin-top:0;">
<div class="sec-hd">01&nbsp;&nbsp;Verdict</div>
<div class="hl hl-{view_tone}"><strong>{esc(view)}.</strong> {esc(dto.get('verdict_rationale'))}</div>
</div>"""

    sec01 = f"""
<div class="sec">
<div class="sec-hd">02&nbsp;&nbsp;Business, promoters &amp; issue proceeds</div>
<div class="twocol">
<div>
<p><strong>Business:</strong> {bo.get('text','')} <span class="subnum">[{esc(bo.get('citation'))}]</span></p>
<p><strong>Mix (FY25):</strong> Product — {prod_str}. Customer — {cust_str}. <span class="subnum">[{esc(bo.get('citation'))}]</span></p>
<p><strong>Promoters:</strong> {promoters_str}. <span class="subnum">[{esc(dto.get('citation_promoters'))}]</span></p>
</div>
<div>
<table>
<tr><th>Object of issue</th><th class="r">₹ Lakh</th><th class="r">FY27/28</th></tr>
{objects_rows}
</table>
<div class="subnum">{esc(dto.get('objects_commentary'))} <span>[{esc(dto.get('citation_objects'))}]</span></div>
</div>
</div>
</div>"""

    # ---- 02 Financials (trend-colored: direction that matters, not literal up/down) ----
    fin = dto.get("financials_restated_inr_lakh", {})
    periods = fin.get("periods", [])

    def trend_class(key, idx, vals):
        """Color the FY25 cell (idx==2, vs FY24 idx==1) by whether the metric moved in
        its semantically good direction — 'higher is good' varies per metric (see
        HIGHER_IS_GOOD), so a rising number is not always .up."""
        if idx != 2 or len(vals) < 3 or vals[1] is None or vals[2] is None or key not in HIGHER_IS_GOOD:
            return ""
        improved = (vals[2] > vals[1]) if HIGHER_IS_GOOD[key] else (vals[2] < vals[1])
        if vals[2] == vals[1]:
            return ""
        return "up" if improved else "dn"

    def row(label, key, fmt="{:.0f}", suffix=""):
        vals = fin.get(key, [])
        cells = ""
        for i, v in enumerate(vals):
            cls = trend_class(key, i, vals)
            if key == "cfo_inr_lakh" and v is not None:
                cls = "dn" if v < 0 else "up"
            cells += f'<td class="r mono {cls}">{fmt.format(v) if v is not None else "—"}{suffix}</td>'
        return f"<tr><td>{label}</td>{cells}</tr>"

    fin_header = "".join(f'<th class="r">{p}</th>' for p in periods)
    fin_rows = "".join([
        row("Revenue", "revenue"),
        row("EBITDA margin", "ebitda_margin_pct", "{:.1f}", "%"),
        row("PAT", "pat"),
        row("PAT margin", "pat_margin_pct", "{:.1f}", "%"),
        row("RoNW", "ronw_pct", "{:.1f}", "%"),
        row("ROCE", "roce_pct", "{:.1f}", "%"),
        row("Debt-Equity", "debt_equity", "{:.2f}"),
        row("CFO (₹L)", "cfo_inr_lakh", "{:,.0f}"),
        row("Debtor days", "debtor_days", "{:.0f}"),
        row("Days Working Capital", "days_working_capital", "{:.0f}"),
        row("Top-10 customer conc.", "top10_customer_concentration_pct", "{:.1f}", "%"),
    ])

    sec02 = f"""
<div class="sec">
<div class="sec-hd">03&nbsp;&nbsp;Financials, restated (₹ Lakh) <span class="subnum">— FY25 cell colored vs FY24, direction that matters per metric</span></div>
<table>
<tr><th>Metric</th>{fin_header}</tr>
{fin_rows}
</table>
<div class="hl hl-y">{esc(dto.get('cash_flow_commentary'))} <span class="subnum">[{esc(fin.get('citation'))}]</span></div>
</div>"""

    # ---- 03 RPT + litigation + contingent liabilities ----
    rpt_rows = "".join(
        f'<div>{esc(r.get("party"))}</div><div>{esc(r.get("relationship"))}</div>'
        f'<div>{esc(r.get("nature"))}</div>'
        f'<div>{money(r.get("fy25_amount_inr_lakh"),"L") if r.get("fy25_amount_inr_lakh") is not None else "—"}'
        f'{" (" + str(r.get("pct_of_revenue")) + "% of rev)" if r.get("pct_of_revenue") is not None else ""}'
        f'{" (" + str(r.get("pct_of_pat")) + "% of PAT)" if r.get("pct_of_pat") is not None else ""}'
        f'{" — " + r.get("note") if r.get("note") else ""}</div>'
        for r in dto.get("related_party_transactions", [])
    )
    lit = dto.get("litigation", {})
    def lit_rows(items, label):
        out = ""
        for it in items:
            cnt = it.get("count", 0)
            out += (
                f'<tr><td>{label} — {esc(it.get("type"))}</td>'
                f'<td class="r mono {"dn" if cnt else ""}">{esc(cnt)}</td>'
                f'<td class="r mono">{money(it.get("amount_inr_lakh"))}</td></tr>'
            )
        return out
    crim = lit.get("criminal_against_company_promoters_kmp", 0)
    lit_html = (
        lit_rows(lit.get("against_company", []), "Against company")
        + lit_rows(lit.get("against_promoters", []), "Against promoters")
        + lit_rows(lit.get("against_directors", []), "Against directors")
        + f'<tr><td>Criminal — against co./promoters/KMP</td><td class="r mono {"dn" if crim else "up"}">{crim}</td><td class="r mono">—</td></tr>'
    )
    cl_rows = "".join(
        f'<tr><td>{esc(c.get("item"))}</td><td class="r mono">{money(c.get("as_at_mar_2024"))}</td>'
        f'<td class="r mono">{money(c.get("as_at_mar_2025"))}</td><td class="r mono">{money(c.get("as_at_jun_2025"))}</td></tr>'
        for c in dto.get("contingent_liabilities_inr_lakh", [])
    )

    sec03 = f"""
<div class="sec">
<div class="sec-hd">04&nbsp;&nbsp;Related-party transactions, litigation &amp; contingent liabilities</div>
<div class="vmatrix">
<div>Related party</div><div>Relationship</div><div>Nature (FY25)</div><div>Amount / status</div>
{rpt_rows}
</div>
<div class="twocol">
<div>
<table>
<tr><th>Litigation</th><th class="r">Count</th><th class="r">₹ Lakh</th></tr>
{lit_html}
</table>
<div class="subnum">{esc(lit.get('notes'))} [{esc(lit.get('citation'))}]</div>
</div>
<div>
<table>
<tr><th>Contingent liability</th><th class="r">Mar'24</th><th class="r">Mar'25</th><th class="r">Jun'25</th></tr>
{cl_rows}
</table>
<div class="subnum">[{esc(dto.get('citation_contingent'))}]</div>
</div>
</div>
</div>"""

    # ---- 04 Auditor + Industry + Peer valuation ----
    aud = dto.get("auditor", {})
    ind = dto.get("industry", {})
    pv = dto.get("peer_valuation", {})
    aud_chip = '<span class="chip chip-g">Clean</span>' if "none" in str(aud.get("qualifications", "")).lower() else '<span class="chip chip-y">Check</span>'
    peer_chip = '<span class="chip chip-b">No listed anchor</span>'
    sec04 = f"""
<div class="sec">
<div class="sec-hd">05&nbsp;&nbsp;Auditor, industry data &amp; valuation anchor</div>
<div class="twocol">
<div>
<p>{aud_chip} <strong>Auditor:</strong> {esc(aud.get('current'))}, {esc(aud.get('appointed'))}. Predecessor: {esc(aud.get('predecessor'))}. Qualifications: {esc(aud.get('qualifications'))}. <span class="subnum">[{esc(aud.get('citation'))}]</span></p>
<p><strong>Industry:</strong> {esc(ind.get('commentary'))} Global CAGR cited {esc(ind.get('global_cagr_pct_2023_2030'))}%; India CAGR <span class="dn">{esc(ind.get('india_cagr_pct_2025_2031'))}%</span> (${ind.get('india_market_usd_million_2025')}M→${ind.get('india_market_usd_million_2031')}M). <span class="subnum">[{esc(ind.get('citation'))}]</span></p>
</div>
<div>
<p>{peer_chip} <strong>Peer/valuation:</strong> {esc(pv.get('listed_peers_in_india'))} Weighted EPS ₹{pv.get('weighted_avg_eps_inr')}, weighted RoNW {pv.get('weighted_avg_ronw_pct')}%, NAV/share ₹{pv.get('nav_per_share_inr_mar_2025')} (Mar'25). <span class="subnum">[{esc(pv.get('citation'))}]</span></p>
<p><strong>Post-listing:</strong> CMP ₹{pl.get('cmp_inr')}, mkt cap ₹{pl.get('market_cap_cr')}Cr, trailing P/E {pl.get('trailing_pe')}x. {esc(pl.get('note'))}</p>
</div>
</div>
</div>"""

    # ---- 05 Red flags — rating conveyed by coloring the flag topic itself, no GREEN/YELLOW/RED text ----
    flag_rows = "".join(
        f'<tr><td><span class="ftag ftag-{CHIP_TONE.get(f["rating"],"b")}">{esc(f.get("flag"))}</span></td>'
        f'<td>{esc(f.get("evidence"))}</td></tr>'
        for f in dto.get("red_flags", [])
    )
    sec05 = f"""
<div class="sec">
<div class="sec-hd">06&nbsp;&nbsp;Red-flag scan</div>
<table>
<tr><th style="width:34%;">Flag</th><th>Evidence</th></tr>
{flag_rows}
</table>
</div>"""

    # ---- 07 Additional insights (shape-sniffed from DTO's `additional` field) ----
    sec06 = render_additional_html(dto.get("additional"), section_number="07", title="Additional insights")

    # ---- 08 Limitations ----
    lim_items = "".join(f"<li>{esc(x)}</li>" for x in dto.get("limitations", []))
    next_n = "08" if sec06 else "07"
    sec_lim = f"""
<div class="sec">
<div class="sec-hd">{next_n}&nbsp;&nbsp;What could be wrong with this analysis</div>
<ul class="tight">{lim_items}</ul>
</div>"""

    order_book = dto.get("order_book_inr_cr")
    alert = pl.get("note", "")

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>{CSS.replace('<TITLE>', dto.get('company_name','') + ' — DRHP Analysis')}</style></head><body>
<div class="hdr">
  <div class="hdr-main">
    <div class="eyebrow">DRHP / IPO Analysis · {esc(dto.get('company_name','')).upper()} ({esc(dto.get('listing'))}) · DRHP {esc(dto.get('filing_date'))}</div>
    <h1>{esc(dto.get('company_name',''))}</h1>
    <div class="subline">{esc(dto.get('issue_type'))} · Order book ₹{order_book}Cr as of {esc(dto.get('order_book_as_of'))} · Sources: {', '.join(s.get('label','') for s in dto.get('source_documents',[]))}</div>
  </div>
  <span class="chip chip-{view_tone} chip-lg">{esc(view)}</span>
</div>
<div class="alert"><strong>Timing note:</strong> {alert}</div>
<div class="grid4">{kpi_html}</div>
{sec_verdict}
{sec01}
{sec02}
{sec03}
{sec04}
{sec05}
{sec06}
{sec_lim}
</body></html>"""
    return html


def main():
    dto_path, out_pdf = sys.argv[1], sys.argv[2]
    with open(dto_path) as f:
        dto = json.load(f)
    html = render(dto)
    with open(out_pdf.replace(".pdf", ".html"), "w") as f:
        f.write(html)
    weasyprint.HTML(string=html).write_pdf(out_pdf)
    print("rendered", out_pdf)


if __name__ == "__main__":
    main()
