# Shared step — render a PDF artifact (PDF-only default)

Any skill whose primary deliverable is an analytical report, briefing, or note MUST produce a PDF of the content, saved under `data/assets/<skill-name>/` so it is Drive-mirrored and has a durable shareable URL.

**Core Output Rules (`AGENTS.md` §12, `skills/_shared/conventions.md` §18):**

1. **PDF-Only Default**: Only produce the PDF artifact by default. Do NOT save both HTML and PDF files. Only create an HTML file when explicitly requested by the user (`format: 'html'`, `--html`, or conversational prompt).
2. **Chat Conciseness (Zero PDF Echo)**: Never reprint or reproduce the content or sections of the PDF report in the chat reply unless explicitly asked. Output only a concise executive takeaway, key metric highlights / rate-of-change summary, and the markdown file link to the PDF.
3. **Contextual Rate of Change ($\Delta$)**: Always present metrics with their contextual baseline comparison point (prior historical period value or forward guided target with % change) so the rate of change is clear.

Reference this file from a skill's SKILL.md with one line ("PDF artifact: see `skills/_shared/pdf-artifact-step.md`, save to `data/assets/<skill-name>/`") instead of copy-pasting the steps below — if this step's mechanics change, they should change in one place, not in every skill that uses it (`skills/_shared/conventions.md` §18).

## Why a separate HTML build, not a screenshot of the widget

The widget's CSS uses `visualize`'s CSS custom properties (`var(--color-text-primary)` etc.)
so it can adapt to the host's light/dark theme — those variables don't exist outside the
`show_widget` host, so that HTML can't be hex/Puppeteer-rendered as-is. Build a second,
standalone copy of the same markup using literal hex values from
[`skills/_shared/pdf-design-guide.md`](pdf-design-guide.md)'s copy-paste CSS block instead —
same component vocabulary (`.chip`, `.hl`, `.kpi`/`.grid3`/`.grid4`, `.vmatrix`), same content,
just resolved colors. If the skill already persists a JSON DTO (per
[`output-dto-standard/SKILL.md`](../tooling/output-dto-standard/SKILL.md)) before rendering the
widget — as it should — build the PDF HTML from that SAME DTO, not by hand-transcribing the
widget a second time. Two renders of one DTO can't drift from each other; two independently
hand-written HTML documents will, eventually.

## Steps

1. **Build the standalone HTML.** Either call `stock-api/src/utils/pdfRenderer.js`'s
   `wrapHtml(title, subtitle, bodyHtml)` (it already emits the `pdf-design-guide.md` shell and
   registers `.chip`/`.hl`/`.kpi`/`.vmatrix` globally — just pass body markup using those
   classes), or, for skills without a JS generator, copy the guide's CSS block into a
   `<style>` tag by hand. Either way, the body content comes from the same DTO the widget used.
2. **Render to PDF:**
   ```bash
   bash ./skills/_shared/resolve.sh render-pdf --html <standalone.html> \
     --pdf "data/assets/<skill-name>/<Company>_<ReportLabel>.pdf" \
     --title "<Company> — <Report Title>" \
     --footer "<skill-name> · generated <date>"
   ```
   `data/assets/` is the DATA_RULES §1.3 destination for rendered artifacts — it is
   Drive-mirrored automatically, no separate upload step.
3. **Push.** End the run with `node packages/jobs-runtime/scripts/data.js push` (same
   convention every DB-writing skill already follows) so the PDF actually reaches Drive and
   gets a shareable URL, not just a local file.
4. **Surface the PDF to the user** — provide a concise analytical summary with rate-of-change highlights and the direct markdown link to the saved PDF artifact ("Saved as `<Company>_<ReportLabel>.pdf`"). Never dump or reprint the PDF content into the chat response unless explicitly asked.

## If the render pipeline is unavailable

`render-pdf` (`skills/tooling/render-pdf/SKILL.md`) documents a Puppeteer→WeasyPrint fallback
chain specifically because "Puppeteer/Chrome unavailable" is no longer a dead end — a
Puppeteer/Chromium launch failure (confirmed reproducible on ARM64 sandboxes: the downloaded
Chrome binary is x86-64 and won't execute, and there's no root access to install a system
Chromium as an alternative) is a signal to fall through to WeasyPrint (`pip install weasyprint
--break-system-packages`, substitute the HTML's `var(--token)` CSS custom properties for the
literal hex values in `pdf-design-guide.md`'s palette, then `HTML(string=...).write_pdf(...)`),
not a reason to stop. Retry once with a direct call into the underlying render function (see
`stock-api/src/utils/pdfRenderer.js`'s `renderPdf()`) before falling back — a missing
`yarn`/CLI wrapper is not the same thing as a missing pipeline — then fall back to WeasyPrint
before concluding the PDF genuinely can't be produced.

Only if BOTH the Puppeteer path and the WeasyPrint fallback fail is that a genuine blocker to
state explicitly in the closing text ("PDF not rendered — render pipeline unavailable in this
session, both Puppeteer and the WeasyPrint fallback failed: <reason>"). A widget that requires
re-opening this session to view again is not a substitute for a Drive-shareable file, and
presenting it as the final output without flagging the gap reads to the user as if the PDF
requirement was satisfied when it wasn't.

## What NOT to do

- Don't build a THIRD bespoke HTML document for the PDF that isn't derived from the same DTO
  the widget renders from — see the "data layer vs UI layer" boundary in
  `pdf-design-guide.md`; the render step must be a pure function of persisted facts.
- Don't skip this for "the widget is good enough" — the whole reason this step exists is that
  an interactive widget requires re-opening the session/tool to view again, while a PDF has a
  durable, shareable link. If a skill's widget is genuinely ephemeral/dashboard-only (e.g. a
  16-tab exploratory dashboard meant to be browsed, not archived), it's fine to skip this step
  — but that's the exception, not the default, for a skill whose output is a single-report
  briefing.
