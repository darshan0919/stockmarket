#!/usr/bin/env python3
"""
Companion script for the authtoken refresh task.
Usage:
  python update_authtoken.py <authtoken>        # success path
  python update_authtoken.py --error <message>  # error path (sends error email, skips .env update)

Updates STOCKSCANS_AUTH_TOKEN in .env without touching other variables.
Sends a confirmation or error email to the user.
"""

import sys
import os
import re
import datetime

from email_service import send_html_email

ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
KEY = "STOCKSCANS_AUTH_TOKEN"


def load_env() -> dict:
    env = {}
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH, "r") as f:
            for line in f:
                line = line.strip()
                if line and "=" in line and not line.startswith("#"):
                    k, _, v = line.partition("=")
                    env[k.strip()] = v.strip()
    return env


def update_env(token: str) -> None:
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH, "r") as f:
            lines = f.readlines()
    else:
        lines = []

    pattern = re.compile(rf"^{re.escape(KEY)}=.*$")
    new_line = f"{KEY}={token}\n"
    found = False
    new_lines = []
    for line in lines:
        if pattern.match(line.strip()):
            new_lines.append(new_line)
            found = True
        else:
            new_lines.append(line)

    if not found:
        new_lines.append(new_line)

    with open(ENV_PATH, "w") as f:
        f.writelines(new_lines)

    print(f"OK: {KEY} updated in {ENV_PATH}")


if __name__ == "__main__":
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

    # Error path: python update_authtoken.py --error "some message"
    if len(sys.argv) >= 3 and sys.argv[1] == "--error":
        error_message = " ".join(sys.argv[2:])
        print(f"ERROR: {error_message}", file=sys.stderr)
        result = send_html_email(
            subject="❌ Stockscans authtoken refresh FAILED",
            html_body=f"""
            <html><body style="font-family:sans-serif;color:#222;">
              <h2 style="color:#dc2626;">❌ Stockscans Auth Token Refresh Failed</h2>
              <p><b>Time:</b> {now}</p>
              <p><b>Error:</b></p>
              <pre style="background:#fef2f2;padding:12px;border-radius:6px;color:#b91c1c;">{error_message}</pre>
              <p>The <code>.env</code> file was <b>not modified</b>. Please check the Cowork task or refresh manually.</p>
            </body></html>
            """,
        )
        print(f"Email: {result}")
        sys.exit(1)

    # Success path: python update_authtoken.py <token>
    if len(sys.argv) < 2:
        print("Usage: python update_authtoken.py <token>", file=sys.stderr)
        print("       python update_authtoken.py --error <message>", file=sys.stderr)
        sys.exit(1)

    token = sys.argv[1]
    if not token:
        print("ERROR: token is empty", file=sys.stderr)
        sys.exit(1)

    update_env(token)

    token_preview = token[:20] + "..." + token[-10:] if len(token) > 32 else token
    result = send_html_email(
        subject="✅ Stockscans authtoken refreshed",
        html_body=f"""
        <html><body style="font-family:sans-serif;color:#222;">
          <h2 style="color:#16a34a;">✅ Stockscans Auth Token Refreshed</h2>
          <p><b>Time:</b> {now}</p>
          <p><b>Token preview:</b> <code>{token_preview}</code></p>
          <p>The <code>STOCKSCANS_AUTH_TOKEN</code> in your <code>.env</code> has been updated successfully.</p>
        </body></html>
        """,
    )
    print(f"Email: {result}")
