#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Shared "smart renderer" for the DTO's `additional` field.

## What `additional` is for

Every skill's DTO (per skills/tooling/output-dto-standard/SKILL.md) has a fixed schema for
its known sections (financials, red flags, etc). But real analysis regularly turns up a
stock/sector/scenario-specific nuance that doesn't fit any fixed field — a bear/base/bull
scenario table, a one-off sector-dependency note, a geography split that only this company
has. Forcing every skill to keep extending its rigid schema for one-off insights is brittle;
forcing the analyst to drop the insight (because "there's no field for it") is worse — that's
exactly the kind of information loss this DTO/render split exists to prevent.

`additional` is the escape hatch: a single top-level DTO field whose value can be *any* JSON
shape — an object, a nested object of objects, an array of dicts, an array of strings, or a
plain string. The data layer just puts the fact there, structured however it naturally comes
out (do not contort it to fit a table). The render layer (this module) inspects the shape at
render time and picks a reasonable layout automatically — no per-skill, per-insight rendering
code needed.

## Shape → layout rules (in priority order)

1. `str` / `int` / `float` / `bool`                → a `.hl-b` callout paragraph.
2. `dict` with a `text`/`note`/`body` key           → `.hl` callout; optional `tone` key
   ("g"/"y"/"r"/"b", default "b") selects `.hl-{tone}`; optional `citation` key appended as
   a `.subnum` after the text.
3. `dict` where every value is scalar (str/int/float/bool/None) → a compact 2-column
   key/value table (label | value), monospace values.
4. `dict` where every value is itself a dict/list           → treated as a set of named
   subsections: each key becomes a small sub-heading, each value is rendered recursively.
5. `list` of dicts sharing a common key-set (>=60% key overlap) → a `<table>` with those
   keys as headers (union of keys across items, missing cells render "—").
6. `list` of scalars                                → a `<ul class="tight">` bullet list.
6. `list` of dicts NOT sharing a key-set             → each item rendered recursively in its
   own `.kpi`-style card inside a responsive grid.

Any dict/list can be arbitrarily nested; recursion handles it. There is deliberately no
"type" tag required in the data — shape is the contract — but if a dict has an explicit
"type" key with value "kpi_row"/"scenario"/"table"/"callout"/"bullets", that hint is honored
first (useful when the natural shape is ambiguous, e.g. a bear/base/bull dict of 3 scalar
strings could read as either a callout set or a comparison table — set `"type": "scenario"`
to force the 3-column comparison layout).

## Usage

```python
from render_additional import render_additional_html
html_fragment = render_additional_html(dto.get("additional"), section_number="08")
```

Returns an empty string if `additional` is absent/empty/None — sections should only appear
when there's something to show. This module has no dependencies beyond the stdlib; it emits
HTML using ONLY the classes already defined in skills/_shared/pdf-design-guide.md's
copy-paste CSS block (`.hl`, `.kpi`, `.grid3`/`.grid4`, table, `.vmatrix`, `.chip`), so it
drops into any skill's report without new CSS.
"""
from __future__ import annotations

TONE_MAP = {"g": "g", "y": "y", "r": "r", "b": "b", "green": "g", "yellow": "y", "amber": "y", "red": "r", "blue": "b"}


def _esc(v) -> str:
    if v is None:
        return "—"
    return str(v)


def _is_scalar(v) -> bool:
    return v is None or isinstance(v, (str, int, float, bool))


def _tone(d: dict) -> str:
    return TONE_MAP.get(str(d.get("tone", "b")).lower(), "b")


def _render_callout(d: dict) -> str:
    text = d.get("text") or d.get("note") or d.get("body") or ""
    tone = _tone(d)
    cite = f' <span class="subnum">[{_esc(d.get("citation"))}]</span>' if d.get("citation") else ""
    return f'<div class="hl hl-{tone}">{_esc(text)}{cite}</div>'


def _render_kv_table(d: dict) -> str:
    rows = "".join(
        f'<tr><td>{_esc(k).replace("_", " ").title()}</td><td class="r mono">{_esc(v)}</td></tr>'
        for k, v in d.items() if k not in ("type",)
    )
    return f'<table><tr><th>Field</th><th class="r">Value</th></tr>{rows}</table>'

_SUB_X_LABELS = [
    ("qib_x", "QIB"),
    ("nii_x", "Non-Institutional Buyers"),
    ("b_hni_x", "&nbsp;&nbsp;- bNII (bids above &#8377;10L)"),
    ("s_hni_x", "&nbsp;&nbsp;- sNII (bids below &#8377;10L)"),
    ("rii_x", "Retail Individual Investors (RIIs)"),
    ("total_x", "Total"),
]


def _fmt_x(v) -> str:
    if v is None:
        return "—"
    try:
        return f"{float(v):.2f}x"
    except (TypeError, ValueError):
        return _esc(v)


def _render_subscription(d: dict) -> str:
    """Dedicated layout for the ipo-subscription `additional.subscription` shape
    (see drhp-ipo-analysis/SKILL.md's DTO schema). Two-column split: left half is
    the category-wise subscription table (readable labels, `x` suffixed onto the
    value — never onto the field name), right half is the judgment fields
    (Insight / Listing Score / Cagr Score / Source). `citation_url` is deliberately
    dropped — `source` already says where the figures came from."""
    rows = ""
    if d.get("anchor_participated") is not None:
        anchor_val = "Participated" if d.get("anchor_participated") else "Did not participate"
        rows += f'<tr><td>Anchor Investors</td><td class="r mono">{_esc(anchor_val)}</td></tr>'
    for key, label in _SUB_X_LABELS:
        if key not in d:
            continue
        total_row = key == "total_x"
        cell = f'<td class="r mono"><strong>{_fmt_x(d[key])}</strong></td>' if total_row else f'<td class="r mono">{_fmt_x(d[key])}</td>'
        label_cell = f'<td><strong>{label}</strong></td>' if total_row else f'<td>{label}</td>'
        rows += f'<tr>{label_cell}{cell}</tr>'
    left = f'<table><tr><th>Category</th><th class="r">Subscription</th></tr>{rows}</table>'

    # Each block carries its own margin-bottom rather than relying on flex `gap`
    # (weasyprint's flexbox gap support is unreliable and was overlapping blocks).
    right_parts = []
    if d.get("insight"):
        right_parts.append(f'<div class="hl hl-b" style="margin:0 0 6px 0;">{_esc(d["insight"])}</div>')
    if d.get("listing_score") is not None:
        tier = f' &middot; {_esc(d.get("listing_tier"))}' if d.get("listing_tier") else ""
        right_parts.append(
            f'<div class="kpi" style="margin-bottom:6px;"><div class="label">Listing Score</div>'
            f'<div class="subnum" style="font-size:11px; color:#1a1a1a;">{_esc(d["listing_score"])}{tier}</div></div>'
        )
    if d.get("cagr_score") is not None:
        tier = f' &middot; {_esc(d.get("cagr_tier"))}' if d.get("cagr_tier") else ""
        conf = f' ({_esc(d.get("cagr_confidence"))} confidence)' if d.get("cagr_confidence") else ""
        right_parts.append(
            f'<div class="kpi" style="margin-bottom:6px;"><div class="label">Cagr Score</div>'
            f'<div class="subnum" style="font-size:11px; color:#1a1a1a;">{_esc(d["cagr_score"])}{tier}{conf}</div></div>'
        )
    if d.get("source"):
        as_of = f', as of {_esc(d.get("as_of"))}' if d.get("as_of") else ""
        right_parts.append(
            f'<div class="kpi" style="margin-bottom:0;"><div class="label">Source</div>'
            f'<div class="subnum" style="font-size:10px; color:#1a1a1a;">{_esc(d["source"])}{as_of}</div></div>'
        )
    right = "".join(right_parts)

    return (
        '<table style="border:none; margin:0;"><tr>'
        f'<td style="width:50%; vertical-align:top; padding:0 8px 0 0; border:none;">{left}</td>'
        f'<td style="width:50%; vertical-align:top; padding:0 0 0 8px; border:none;">{right}</td>'
        '</tr></table>'
    )


def _render_scenario(d: dict) -> str:
    # e.g. {"bear": "...", "base": "...", "bull": "..."} or any small dict of scalar prose —
    # rendered as an equal-width comparison grid rather than a 2-col kv table.
    keys = [k for k in d.keys() if k != "type"]
    cols = "".join(
        f'<div class="kpi"><div class="label">{_esc(k).replace("_"," ").title()}</div>'
        f'<div class="subnum" style="font-size:9.6px; font-family:inherit; color:#1a1a1a; margin-top:4px;">{_esc(d[k])}</div></div>'
        for k in keys
    )
    grid_cls = "grid3" if len(keys) == 3 else ("grid4" if len(keys) == 4 else "grid3")
    return f'<div class="{grid_cls}">{cols}</div>'


def _key_overlap_ratio(dicts: list) -> float:
    if not dicts:
        return 0.0
    key_sets = [set(d.keys()) for d in dicts if isinstance(d, dict)]
    if not key_sets:
        return 0.0
    union = set().union(*key_sets)
    if not union:
        return 0.0
    inter_scores = [len(ks) / len(union) for ks in key_sets]
    return sum(inter_scores) / len(inter_scores)


def _render_list_table(items: list) -> str:
    cols = []
    for it in items:
        for k in it.keys():
            if k not in cols:
                cols.append(k)
    header = "".join(f'<th>{_esc(c).replace("_"," ").title()}</th>' for c in cols)
    rows = ""
    for it in items:
        cells = "".join(f'<td>{_esc(it.get(c))}</td>' for c in cols)
        rows += f'<tr>{cells}</tr>'
    return f'<table><tr>{header}</tr>{rows}</table>'


def _render_bullets(items: list) -> str:
    lis = "".join(f'<li>{_esc(it)}</li>' for it in items)
    return f'<ul class="tight">{lis}</ul>'


def _render_card_grid(items: list) -> str:
    cards = "".join(f'<div class="kpi">{render_value(it)}</div>' for it in items)
    return f'<div class="grid3">{cards}</div>'


def render_value(value, key_label: str | None = None) -> str:
    """Recursively render any JSON-shaped value. Returns an HTML fragment."""
    if value is None or value == "" or value == [] or value == {}:
        return ""

    if _is_scalar(value):
        return f'<div class="hl hl-b">{_esc(value)}</div>'

    if isinstance(value, dict):
        forced = str(value.get("type", "")).lower()
        if forced == "ipo_subscription" or (
            not forced and "qib_x" in value and "total_x" in value and "rii_x" in value
        ):
            return _render_subscription(value)
        if forced == "scenario":
            return _render_scenario(value)
        if forced == "callout":
            return _render_callout(value)
        if forced == "table":
            return _render_kv_table(value)
        if forced == "bullets" and isinstance(value.get("items"), list):
            return _render_bullets(value["items"])

        if any(k in value for k in ("text", "note", "body")):
            return _render_callout(value)

        vals = [v for k, v in value.items() if k != "type"]
        if vals and all(_is_scalar(v) for v in vals):
            # 3-4 short scalar values reads better as a scenario/comparison grid;
            # longer or more numerous fields read better as a label/value table.
            if 2 <= len(vals) <= 4 and all(isinstance(v, str) and len(v) > 25 for v in vals):
                return _render_scenario(value)
            return _render_kv_table(value)

        # dict of dicts/lists → named subsections, recursed
        parts = []
        for k, v in value.items():
            if k == "type":
                continue
            sub = render_value(v, key_label=k)
            if not sub:
                continue
            parts.append(
                f'<div style="margin-top:8px;"><div class="label" style="margin-bottom:4px;">'
                f'{_esc(k).replace("_"," ").title()}</div>{sub}</div>'
            )
        return "".join(parts)

    if isinstance(value, list):
        if all(_is_scalar(v) for v in value):
            return _render_bullets(value)
        if all(isinstance(v, dict) for v in value):
            if _key_overlap_ratio(value) >= 0.6:
                return _render_list_table(value)
            return _render_card_grid(value)
        # mixed list — fall back to bullets of stringified items
        return _render_bullets(value)

    return f'<div class="hl hl-b">{_esc(value)}</div>'


def render_additional_html(additional, section_number: str = "08", title: str = "Additional insights") -> str:
    """Top-level entry point. Returns a `.sec` block, or "" if nothing to render."""
    if not additional:
        return ""
    body = render_value(additional)
    if not body.strip():
        return ""
    return (
        f'<div class="sec">'
        f'<div class="sec-hd">{section_number}&nbsp;&nbsp;{title}</div>'
        f'{body}'
        f'</div>'
    )
