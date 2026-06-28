#!/usr/bin/env python3
"""
email_service.py — shared Gmail email utility for Company Research scripts.

Usage:
    from email_service import send_html_email

    result = send_html_email(
        subject="My subject",
        html_body="<h1>Hello</h1>",
    )
    # result: {"status": "sent", "to": "..."} | {"status": "skipped", ...} | {"status": "error", ...}
"""

import os
import re
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

GMAIL_USER = "djplearner@gmail.com"
_ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")


def _load_app_password() -> str:
    """Read GOOGLE_APP_PASSWORD from .env in the same directory."""
    if not os.path.exists(_ENV_PATH):
        return ""
    with open(_ENV_PATH, "r") as f:
        for line in f:
            line = line.strip()
            if line.startswith("GOOGLE_APP_PASSWORD="):
                return line.partition("=")[2].strip()
    return ""


def send_html_email(
    subject: str,
    html_body: str,
    *,
    to: str = GMAIL_USER,
    sender: str = GMAIL_USER,
    app_password: str | None = None,
) -> dict:
    """
    Send an HTML email via Gmail SMTP.

    Args:
        subject:      Email subject line.
        html_body:    HTML string for the email body.
        to:           Recipient address (defaults to GMAIL_USER).
        sender:       Sender address (defaults to GMAIL_USER).
        app_password: Gmail app password. If omitted, read from .env.

    Returns:
        {"status": "sent",    "to": to}          on success
        {"status": "skipped", "reason": "..."}   if no password available
        {"status": "error",   "error":  "..."}   on SMTP failure
    """
    pwd = app_password or _load_app_password()
    if not pwd:
        return {"status": "skipped", "reason": "GOOGLE_APP_PASSWORD not set"}

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(sender, pwd)
            server.sendmail(sender, to, msg.as_string())
        return {"status": "sent", "to": to}
    except Exception as exc:
        return {"status": "error", "error": str(exc)}
