---
name: render-pdf
description: Utility to render HTML into a standardized PDF using Puppeteer. Operates in clone mode to manage the Chromium dependency.
---

# Render PDF

This skill wraps the Puppeteer rendering engine to convert an HTML file into a stylized PDF report. By isolating this dependency, all other analytical skills can generate pure HTML in lightweight bundles, invoking this skill only for the final formatting step.

## Setup & Invocation

```bash
bash ./skills/_shared/resolve.sh render-pdf --html <input.html> --pdf <output.pdf> [--title "<Title>"] [--footer "<Footer>"]
```

**Note:** This skill requires a full Node.js environment with `@puppeteer/puppeteer` installed, which is why it runs in `clone` mode when invoked remotely.

**Design system:** the input HTML must follow `skills/_shared/pdf-design-guide.md` (flat institutional-briefing palette, monospace section headers, `.chip`/`.hl`/`.kpi`/`.vmatrix` components). If you built the HTML via `pdfRenderer.wrapHtml()` this is automatic; if you wrote the HTML by hand, copy the CSS block from the guide into your `<style>` tag before calling this skill.

## Chromium-unavailable fallback (MANDATORY — do not silently skip the PDF)

Puppeteer's Chromium download is an x86-64 binary. On an ARM64 sandbox (`uname -m` reports `aarch64`), the downloaded `chrome` binary will fail to execute (`Syntax error: newline unexpected` from the shell trying to interpret the ELF binary) and there is no root access to `apt-get install chromium` as a system alternative. This is a confirmed, reproducible failure mode (hit 2026-08-11) — do not spend another session's tokens re-diagnosing it. Detect it early with `uname -m`, and if it returns `aarch64`/`arm64`, skip straight to the fallback below instead of attempting `render-pdf.js`/Puppeteer first.

**Fallback: WeasyPrint (pure-Python, no browser engine required).**

```bash
pip install weasyprint --break-system-packages
```

WeasyPrint takes HTML+CSS directly and does not understand `var(--css-custom-property)` tokens reliably — the input HTML must have its CSS variables substituted with literal hex values before rendering (this is also required by the "Design system" note above once you're off the `visualize` widget's live token system). A minimal substitution + render script:

```python
import re
from pathlib import Path
from weasyprint import HTML

VAR_MAP = {
    "--text-primary": "#1a1a1a", "--text-secondary": "#57534e", "--text-muted": "#8a8580",
    "--surface-1": "#f5f3ef", "--surface-2": "#ffffff", "--border": "#ddd8d0",
    "--font-sans": "Helvetica, Arial, sans-serif", "--font-mono": "'Courier New', monospace",
    "--font-voice": "Georgia, serif", "--radius": "6px",
    "--bg-warning": "#faeeda", "--text-warning": "#633806", "--border-warning": "#ef9f27",
    "--bg-danger": "#fcebeb", "--text-danger": "#791f1f", "--border-danger": "#e24b4a",
    "--bg-success": "#eaf3de", "--text-success": "#27500a", "--border-success": "#5bad3a",
    "--bg-accent": "#e6f1fb", "--text-accent": "#0c447c", "--border-accent": "#378ade",
}
VAR_RE = re.compile(r"var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,\s*[^)]+)?\)")
html = VAR_RE.sub(lambda m: VAR_MAP.get(m.group(1), "#333333"), Path("input.html").read_text())
wrapped = f'<html><head><meta charset="utf-8"><style>@page{{size:A4;margin:14mm 12mm;}}</style></head><body>{html}</body></html>'
HTML(string=wrapped).write_pdf("output.pdf")
```

This is the same palette as `skills/_shared/pdf-design-guide.md` — keep the two in sync if the guide's palette changes. Any skill invoking `render-pdf` should try the Puppeteer path first (it's the maintained, design-system-integrated path) and fall back to this WeasyPrint path automatically on ARM64 or on a Puppeteer/Chromium launch failure — never surface "PDF couldn't be generated" to the user and stop; always produce the file by one path or the other, per `skills/_shared/conventions.md` §18.
