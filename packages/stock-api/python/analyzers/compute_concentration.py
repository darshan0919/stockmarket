"""Concentration metrics for market share analysis.

Compute CR3, CR5, CR10, HHI and classification from a list of player shares.

Key API distinction:
- ``named_shares`` is a list of shares for named players only.
- ``others_share`` is the residual share for the unnamed/unidentified tail
  (optional; default 0).
- CR_n metrics use ONLY ``named_shares`` — Others is a residual, not a player.
- HHI uses BOTH — Others contributes to total concentration measurement
  (though we approximate it as a single bucket; see ``hhi`` docstring).

Usage:
    from compute_concentration import compute_metrics, hhi_classification

    # Top 10 named players + 11% Others residual:
    named = [22.5, 18.3, 14.1, 9.8, 7.2, 5.5, 4.1, 3.0, 2.5, 2.0]
    metrics = compute_metrics(named, others_share=11.0)

The classification follows US DoJ HHI thresholds (widely used in India too):
- HHI < 1,500             -> Competitive/Fragmented
- HHI 1,500 - 2,500       -> Moderately Concentrated
- HHI 2,500 - 5,000       -> Highly Concentrated
- HHI >= 5,000            -> Near-Monopoly
"""
from __future__ import annotations
from typing import Iterable, Dict


def hhi_classification(hhi_value: float) -> str:
    """Return DoJ-style classification for an HHI value."""
    if hhi_value < 1500:
        return "Competitive/Fragmented"
    if hhi_value < 2500:
        return "Moderately Concentrated"
    if hhi_value < 5000:
        return "Highly Concentrated"
    return "Near-Monopoly"


def _sorted(shares: Iterable[float]) -> list:
    return sorted([float(x) for x in shares if x is not None], reverse=True)


def cr_n(named_shares: Iterable[float], n: int) -> float:
    """Concentration ratio: sum of top-n shares among NAMED players.

    Caller must pass only named-player shares — exclude any 'Others' residual.
    """
    s = _sorted(named_shares)
    return round(sum(s[:n]), 2)


def hhi(named_shares: Iterable[float], others_share: float = 0.0,
        others_distribution: str = "single_bucket") -> float:
    """Herfindahl-Hirschman Index from percentage shares.

    Args:
        named_shares: shares (as percentages, e.g. 25 for 25%) of named players.
        others_share: residual share for unidentified tail (default 0).
        others_distribution: how to treat the Others bucket:
          - "single_bucket": treat Others as one player at ``others_share``%.
            Overstates concentration if Others is many small players.
          - "atomic" (or "ignore"): Others split into infinitely many tiny
            players, contributes 0 to HHI. Understates if Others contains
            unnamed-but-meaningful players.

    The right treatment depends on the industry. For fragmented Indian sectors,
    "atomic" is closer to truth. When in doubt, report both via compute_metrics.
    """
    s = [float(x) for x in named_shares if x is not None]
    if not s and others_share == 0:
        return 0.0
    total = sum(s) + others_share
    if abs(total - 1.0) < 0.01 and max(s + [others_share]) <= 1.0:
        raise ValueError(
            "HHI input looks like fractions summing to 1.0; "
            "pass percentages instead (e.g. 25.0 for 25%)."
        )
    raw = sum(x * x for x in s)
    if others_distribution == "single_bucket" and others_share > 0:
        raw += others_share * others_share
    return round(raw, 2)


def compute_metrics(
    named_shares: Iterable[float],
    others_share: float = 0.0,
    others_distribution: str = "single_bucket",
) -> Dict[str, object]:
    """Compute CR3 / CR5 / CR10 / HHI / classification in one call.

    Returns keys: CR3, CR5, CR10, HHI, HHI_single_bucket_others,
    HHI_atomic_others, classification, sum_check, n_named, others_share.
    """
    s = [float(x) for x in named_shares if x is not None]
    h_single = hhi(s, others_share=others_share, others_distribution="single_bucket")
    h_atomic = hhi(s, others_share=others_share, others_distribution="atomic")
    classify_value = h_single if others_distribution == "single_bucket" else h_atomic
    return {
        "CR3": cr_n(s, 3),
        "CR5": cr_n(s, 5),
        "CR10": cr_n(s, 10),
        "HHI": classify_value,
        "HHI_single_bucket_others": h_single,
        "HHI_atomic_others": h_atomic,
        "classification": hhi_classification(classify_value),
        "sum_check": round(sum(s) + others_share, 2),
        "n_named": len(s),
        "others_share": others_share,
    }


def delta_bps(share_latest: float, share_t5):
    """Return basis-point change from T-5 share to latest share.

    If share_t5 is None (player didn't exist 5 years ago), returns None.
    """
    if share_t5 is None:
        return None
    return round((share_latest - share_t5) * 100, 1)


def asymmetric_flag(bear_share: float, bull_share: float, threshold_bps: float = 500) -> bool:
    """True if Bear-to-Bull spread exceeds threshold_bps. Default 500 bps."""
    spread_bps = abs(bull_share - bear_share) * 100
    return spread_bps >= threshold_bps


if __name__ == "__main__":
    # Smoke test — Indian SS tubes hypothetical
    named = [22.5, 18.3, 14.1, 9.8, 7.2, 5.5, 4.1, 3.0, 2.5, 2.0]
    others = 11.0
    print("Named shares:", named)
    print("Others share:", others)
    print("Sum:", sum(named) + others)
    print()
    metrics = compute_metrics(named, others_share=others)
    for k, v in metrics.items():
        print(f"  {k:30s}: {v}")
    print()
    print("Delta bps (22.5 vs 18.0):", delta_bps(22.5, 18.0))
    print("Asymmetric flag (21.0 vs 31.0):", asymmetric_flag(21.0, 31.0))

    # Edge case: 4 equal players, no Others
    print()
    print("Edge case - 4 equal-share players (25% each):")
    metrics2 = compute_metrics([25, 25, 25, 25])
    for k, v in metrics2.items():
        print(f"  {k:30s}: {v}")

    # Edge case: 1 dominant + long tail
    print()
    print("Edge case - 1 at 60% + 4 at 5% + Others 20%:")
    metrics3 = compute_metrics([60, 5, 5, 5, 5], others_share=20.0)
    for k, v in metrics3.items():
        print(f"  {k:30s}: {v}")
