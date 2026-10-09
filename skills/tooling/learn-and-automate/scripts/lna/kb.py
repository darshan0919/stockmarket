"""Render the human-readable knowledge base (a template render of the DB records) + status."""
from collections import defaultdict
from pathlib import Path

from .common import data_root, load_collection, load_state, read_json, read_jsonl, run_dir, slug
from .pipeline import RULE_KINDS, TAXONOMY

KIND_ORDER = ["checklist_item", "rule", "entry_signal", "exit_signal", "sizing", "do", "dont", "anti_pattern", "framework", "heuristic", "process", "sector_view", "macro_view", "mindset", "pick"]
STANCE = {"adopt": "✅ adopt", "adapt": "✏️ adapt", "reject": "❌ reject", "unsure": "❔ unsure", None: "not reviewed"}


def _cite(c):
    return f"[{c.get('date') or 'undated'}]({c.get('url')})"


def render(source_key, out_path=None):
    recs = [r for r in load_collection().values() if r.get("sourceKey") == source_key]
    units = [r for r in recs if r.get("type") == "kb-unit"]
    qs = [r for r in recs if r.get("type") == "kb-question"]
    fws = [r for r in recs if r.get("type") == "kb-framework"]
    autos = [r for r in recs if r.get("type") == "kb-automation"]
    tax = read_json(TAXONOMY)["topics"]
    st = load_state(source_key)
    L = []
    L.append(f"# Knowledge base — {source_key}\n")
    p = st.get("profile") or {}
    L.append(f"_Rendered from `knowledge-units` (source of truth). Corpus {p.get('from')} → {p.get('to')}, {p.get('docs')} docs; prefilter kept {st.get('phases', {}).get('prefilter', {}).get('kept')}._\n")
    L.append("> Tweets/lessons are dated opinions of the source, not recommendations. Newest view wins when views conflict (conventions §28); superseded views are kept under *Evolution*.\n")
    by = defaultdict(list)
    for u in units:
        by[u["topic"]].append(u)
    order = sorted(by, key=lambda t: -sum(1 for u in by[t] if u["kind"] in RULE_KINDS))
    for t in order:
        base = t.split(":")[0]
        title = tax.get(base, {}).get("title", t) + (f" — {t.split(':', 1)[1]}" if ":" in t else "")
        mstat = st.get("modules", {}).get(t, {}).get("status", "not-started")
        L.append(f"\n## {title}  `{t}` · session: {mstat}\n")
        active = [u for u in by[t] if u.get("status") == "active"]
        for k in KIND_ORDER:
            ks = sorted([u for u in active if u["kind"] == k], key=lambda u: (-len(u["citations"]), u.get("lastSeen") or ""), reverse=False)
            if not ks:
                continue
            L.append(f"\n**{k.replace('_', ' ')}**\n")
            for u in ks:
                cites = ", ".join(_cite(c) for c in u["citations"][-3:])
                note = f" — _{u['userNote']}_" if u.get("userNote") else ""
                cond = f" _(when: {u['conditions']})_" if u.get("conditions") else ""
                inf = {"inferred": " _(inferred)_", "curated": " _(curated repost — his amplification, not his own words)_"}.get(u.get("explicitness"), "")
                L.append(f"- {u['statement']}{cond}{inf} · {STANCE.get(u.get('userStance'), u.get('userStance'))}{note}  \n  > \"{u['verbatim']}\" — {cites} ({len(u['citations'])}×)")
        tq = [q for q in qs if q.get("module") == t and q.get("status") in ("auto-answered", "user-decided")]
        if tq:
            L.append("\n**Questions answered**\n")
            for q in sorted(tq, key=lambda q: q.get("lens") or ""):
                src = q.get("decidedBy") or q.get("route") or ""
                L.append(f"- **[{q.get('lens')}]** {q['text']}  \n  → {q.get('answer')} _({src}; conf {q.get('confidence')})_")
        old = [u for u in by[t] if u.get("status") == "superseded"]
        if old:
            L.append("\n**Evolution (superseded views)**\n")
            for u in sorted(old, key=lambda u: u.get("lastSeen") or ""):
                L.append(f"- earlier view ({u.get('lastSeen')}): {u['statement']} → superseded by `{u.get('supersededBy')}`")
    if fws:
        L.append("\n## Frameworks (adopted rules → checklists)\n")
        for f in fws:
            L.append(f"\n### {f.get('name')}  `{f['id']}`\n- Trigger: {f.get('trigger')}\n- Cadence: {f.get('cadence')}\n- Action: {f.get('action')}\n- Derived from: {', '.join(f.get('derivedFrom', [])[:8])}")
            for c in f.get("checks", []):
                L.append(f"  - [{c.get('type')}] {c.get('question') or c.get('check')} — source: {c.get('dataSource')} · pass: {c.get('passRule')}")
    if autos:
        L.append("\n## Automation map\n\n| Framework | Bucket | Target | Status |\n|---|---|---|---|")
        for a in autos:
            L.append(f"| {a.get('frameworkId')} | {a.get('bucket')} | {a.get('target')} | {a.get('approval')} |")
    parked = [q for q in qs if q.get("status") == "parked"]
    if parked:
        L.append("\n## Open / parked questions\n")
        for q in parked:
            L.append(f"- [{q.get('module')} · {q.get('lens')}] {q['text']} — tried: {', '.join(q.get('routeTried', []))}; {q.get('parkReason')}")
    prof = [r for r in load_collection().values() if r.get("type") == "kb-learner-profile"]
    if prof:
        L.append("\n## How I ask questions (lens profile)\n")
        for r in prof:
            L.append(f"- covered often: {', '.join(r.get('strongLenses', []))} · blind spots: {', '.join(r.get('blindSpots', []))} · sessions: {r.get('sessions')}")
    out = Path(out_path) if out_path else data_root() / "assets" / f"knowledge-{slug(source_key)}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(L) + "\n")
    return {"file": str(out), "units": len(units), "questions": len(qs), "frameworks": len(fws)}


def status(source_key):
    st = load_state(source_key)
    rd = run_dir(source_key)
    recs = [r for r in load_collection().values() if r.get("sourceKey") == source_key]
    c = defaultdict(int)
    for r in recs:
        c[r.get("type")] += 1
    stances = defaultdict(int)
    for r in recs:
        if r.get("type") == "kb-unit":
            stances[r.get("userStance") or "not-reviewed"] += 1
    chunks = read_json(rd / "chunks.json", default=[])
    return {
        "sourceKey": source_key,
        "phases": st.get("phases"),
        "chunks": {"total": len(chunks), "done": len(st.get("chunksDone", []))},
        "persisted": dict(c),
        "stances": dict(stances),
        "modules": read_json(rd / "modules.json", default=[]),
        "cursor": st.get("cursor"),
        "pendingCursor": st.get("pendingCursor"),
    }
