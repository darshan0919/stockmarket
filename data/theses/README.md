# data/theses — local mirror of the thesis DB

Source of truth: Google Drive folder `stockmarket-theses`
(ID `1MKK_WjVcvKCodIUaosTCZ8d_HXz6JPpL`, https://drive.google.com/drive/folders/1MKK_WjVcvKCodIUaosTCZ8d_HXz6JPpL).

Managed by `skills/investment-thesis-engine`. Per company:
`{TICKER}/thesis.json`, `{TICKER}/thesis.md`, `{TICKER}/history.jsonl` (append-only).

Local-first during a session; sync to Drive at the end of every run. If a file here has
`"sync_pending": true`, the last Drive push failed — re-sync on next run.
