# Shared step — render a PDF artifact alongside the interactive widget

Any skill whose primary deliverable is a `visualize:show_widget` HTML briefing should ALSO
produce a PDF of the same content, saved somewhere Drive-mirrored so it has a shareable URL.
The interactive widget stays the fast, in-session read; the PDF is what the user forwards,
archives, or opens outside this session. Don't replace one with the other — do both.

Reference this file from a skill's SKILL.md with one line ("PDF artifact: see
`skills/_shared/pdf-artifact-step.md`, save to `data/assets/<skill-name>/`") instead of
copy-pasting the steps below — if this step's mechanics change, they should change in one
place, not in every skill that uses it (`skills/_shared/conventions.md` §17).

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
4. **Surface both outputs to the user** — render the interactive widget first (fast to read
   in-session), then mention the PDF's path/Drive link in the closing paragraphs ("also saved
   as `<Company>_<ReportLabel>.pdf`, shareable via Drive") — don't make the user ask for a
   PDF separately once this step exists.

## If the render pipeline is unavailable

If `render-pdf` (Puppeteer/Chrome) is genuinely unavailable in the current environment —
missing binary, launch failure, no `render-pdf` tooling on the path — that is a blocker to
state explicitly in the closing text ("PDF not rendered — render pipeline unavailable in
this session"), not a reason to quietly finish with only the widget. A widget that requires
re-opening this session to view again is not a substitute for a Drive-shareable file, and
presenting it as the final output without flagging the gap reads to the user as if the PDF
requirement was satisfied when it wasn't. Retry once with a direct call into the underlying
render function (see `stock-api/src/utils/pdfRenderer.js`'s `renderPdf()`) before concluding
it's unavailable — a missing `yarn`/CLI wrapper is not the same thing as a missing pipeline.

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
