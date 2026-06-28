#!/usr/bin/env python3
"""
Stockscans API Client — CANONICAL Python reference port of @stock/api.

This file is the single source vendored into cloud skills by ``sync-skills.js``.
Do NOT edit the copies under a skill's ``scripts/_vendor/`` — edit THIS file and
re-run the sync. It implements the same endpoint contract as the JS
``StockscansClient`` (fundamentals only; price-action lives in the JS NSE/BSE
clients and is not needed by skills).

Auth resolution order (first hit wins):
    1. explicit token argument
    2. STOCKSCANS_AUTH_TOKEN         (canonical env var)
    3. STOCKSCANS_AUTHTOKEN          (legacy env var — deprecated, 1 cycle)
    4. known token files (skill sandboxes): /mnt/project/Stockscans_authtoken, etc.
    5. a .env file beside the consuming script
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import requests

BASE_URL = "https://www.stockscans.in"
S3_BASE_URL = "https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/"

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
)

# Token file fallbacks used inside cloud skill sandboxes (priority order).
_TOKEN_FILES = [
    Path("/mnt/project/Stockscans_authtoken"),
    Path("/mnt/project/stockscans_authtoken"),
    Path("/mnt/user-data/uploads/Stockscans_authtoken"),
    Path.home() / ".stockscans_authtoken",
]


class StockscansClient:
    """Singleton Stockscans client (fundamentals). Token read lazily per request."""

    _instance: "StockscansClient | None" = None

    def __new__(cls, token: str | None = None, env_path: str | None = None):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._explicit = token
            cls._instance._env_path = Path(env_path) if env_path else None
            cls._instance._warned_legacy = False
        return cls._instance

    # ── Auth ────────────────────────────────────────────────────────────────

    def _read_env_file(self, key: str) -> str | None:
        path = self._env_path or (Path(__file__).parent / ".env")
        if not path.exists():
            return None
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            k, _, v = line.partition("=")
            if k.strip() == key and v.strip():
                return v.strip()
        return None

    def _warn_legacy(self, source: str) -> None:
        if self._warned_legacy:
            return
        self._warned_legacy = True
        print(
            f"[stock-api] Using legacy STOCKSCANS_AUTHTOKEN from {source}. "
            "Rename to STOCKSCANS_AUTH_TOKEN — legacy supported for one release only.",
            file=sys.stderr,
        )

    def _load_token(self) -> str:
        if self._explicit:
            return self._explicit
        if os.environ.get("STOCKSCANS_AUTH_TOKEN"):
            return os.environ["STOCKSCANS_AUTH_TOKEN"].strip()
        if os.environ.get("STOCKSCANS_AUTHTOKEN"):
            self._warn_legacy("environment")
            return os.environ["STOCKSCANS_AUTHTOKEN"].strip()
        for f in _TOKEN_FILES:
            try:
                if f.exists():
                    tok = f.read_text().strip()
                    if tok:
                        return tok
            except OSError:
                continue
        canonical = self._read_env_file("STOCKSCANS_AUTH_TOKEN")
        if canonical:
            return canonical
        legacy = self._read_env_file("STOCKSCANS_AUTHTOKEN")
        if legacy:
            self._warn_legacy("env file")
            return legacy
        raise ValueError(
            "STOCKSCANS_AUTH_TOKEN not found. Set it (env or .env), pass token=..., "
            "or place the authtoken at ~/.stockscans_authtoken."
        )

    def _headers(self, referer: str = "") -> dict:
        h = {
            "accept": "application/json",
            "content-type": "application/json",
            "cookie": f"authtoken={self._load_token()}",
            "origin": BASE_URL,
            "user-agent": _USER_AGENT,
        }
        if referer:
            h["referer"] = referer
        return h

    # ── Scans ─────────────────────────────────────────────────────────────────

    def run_scan(self, payload: dict, scan_id: str = "") -> dict:
        referer = f"{BASE_URL}/scans/saved/{scan_id}" if scan_id else f"{BASE_URL}/scans"
        resp = requests.post(
            f"{BASE_URL}/api/company/scans/run",
            headers=self._headers(referer), json=payload, timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    # ── Announcements ───────────────────────────────────────────────────────────

    def scan_announcements(self, payload: dict) -> dict:
        resp = requests.post(
            f"{BASE_URL}/api/company/announcements/scan",
            headers=self._headers(f"{BASE_URL}/watchlists"), json=payload, timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    # Back-compat alias for skills/scripts that called fetch_announcements().
    fetch_announcements = scan_announcements

    def company_announcements(self, payload: dict) -> dict:
        resp = requests.post(
            f"{BASE_URL}/api/company/announcements/company",
            headers=self._headers(f"{BASE_URL}/"), json=payload, timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    # ── Company / documents ────────────────────────────────────────────────────

    def documents(self, company_id: str) -> dict:
        resp = requests.get(
            f"{BASE_URL}/api/company/documents/{company_id}",
            headers=self._headers(f"{BASE_URL}/company/{company_id}"), timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    # ── Watchlists ──────────────────────────────────────────────────────────────

    def fetch_watchlist_table(self, watchlist_id: str, **kwargs) -> dict:
        payload = {
            "watchlistId": watchlist_id,
            "ratiosType": kwargs.pop("ratiosType", "Performance"),
            "order": kwargs.pop("order", "desc"),
            "orderBy": kwargs.pop("orderBy", "Market Capitalization"),
            **kwargs,
        }
        resp = requests.post(
            f"{BASE_URL}/api/user/watchlists/table",
            headers=self._headers(f"{BASE_URL}/watchlists"), json=payload, timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    def replace_watchlist(self, watchlist_id: str, company_ids: list) -> dict:
        resp = requests.post(
            f"{BASE_URL}/api/user/watchlists/company-ids/replace",
            headers=self._headers(f"{BASE_URL}/watchlists"),
            json={"watchlistId": watchlist_id, "companyIds": company_ids}, timeout=30,
        )
        resp.raise_for_status()
        result = resp.json()
        returned = len(result.get("companyIds", []))
        if returned != len(company_ids):
            raise ValueError(
                f"Watchlist replace mismatch: sent {len(company_ids)}, got back {returned}"
            )
        return result

    def update_watchlist(self, watchlist_id: str, action: str, company_ids: list) -> dict:
        if action not in ("add", "delete"):
            raise ValueError(f"action must be 'add' or 'delete', got {action!r}")
        if not company_ids:
            return {}
        resp = requests.put(
            f"{BASE_URL}/api/user/watchlists/company-ids",
            headers=self._headers(f"{BASE_URL}/watchlists"),
            json={"watchlistId": watchlist_id, "action": action, "companyIds": company_ids},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    # ── Documents / PDFs ────────────────────────────────────────────────────────

    def fetch_pdf(self, url: str, timeout: int = 60) -> bytes:
        resp = requests.get(url, timeout=timeout)
        resp.raise_for_status()
        return resp.content

    def s3_pdf_url(self, ss_url: str) -> str:
        return f"{S3_BASE_URL}{ss_url}" if ss_url else ""


# Singleton export — mirrors the JS default singleton.
client = StockscansClient()
