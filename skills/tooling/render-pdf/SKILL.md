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
