---
name: weekly-conversation-capture-stockmarket
description: Conversation Capture — weekly: store new stockmarket chats into the conversations DB collection
---

You are running the weekly Conversation Capture job for Darshan's stockmarket project (folder: /Users/darshan.patel/code/personal/stockmarket). Goal: never lose research context — store every NEW interactive stockmarket chat into the `conversations` DB collection. Design + rules: docs/CONVERSATION_CAPTURE_PLAN.md and skills/tooling/conversation-capture/SKILL.md. "Database"/"DB" = Google Drive via packages/jobs-runtime/lib/db.js (never Mongo).

GOVERNANCE (critical): This is an unattended job. It must ONLY write DB collections under data/ (git-ignored, mirrored to Drive) via db helpers, plus temp files it cleans up. It must NEVER create, edit, or delete any git-committed file — nothing under skills/, scripts/, packages/*/lib, docs/, jobs/, registry*.json, or tests, and never `git add`/commit. If you conclude some code/skill/doc SHOULD change, do NOT apply it — write a proposal to data/_proposals/<YYYY-MM-DD>-<slug>.md (git-ignored) and mention it in the run report for Darshan to review.

This run does DETERMINISTIC RAW CAPTURE ONLY — store the conversation transcripts. Do NOT do interpretive fan-out (insight notes / report extraction / memory) here; that is the separate enrichment job. No fabrication: store only the user's and assistant's actual words.

Steps:
1. Read skills/tooling/conversation-capture/SKILL.md and follow it.
2. Find candidate sessions: call session_info list_sessions. Load the capture cursor at data/_meta/conversation-capture.json (its done + skipped + sensitive maps hold session ids already processed). Consider only sessions NOT already in those maps and NOT already in data/conversations.json (dedup by session id — deterministic ids mean re-runs never duplicate).
3. For each new session, read its transcript via session_info read_transcript. Apply the SAME gates the writer enforces (do not override): stockmarket-related? genuine interactive chat (SKIP automated scheduled-job runs with zero real human turns)? NOT personal/sensitive (SKIP tax/ITR/PAN)?
4. For each qualifying session, write a temp JSON in the cloud-export shape: [{ "uuid":"<sessionId>", "name":"<title>", "created_at":"<ISO date>", "chat_messages":[{"sender":"human","text":"..."},{"sender":"assistant","text":"..."}] }] preserving user+assistant turns verbatim (skip tool noise). Then run: node packages/jobs-runtime/scripts/captureConversation.js --cloud-file <temp.json> (it classifies, guards, saves raw-first, dedups via cursor, pushes). Use --dry-run first if many sessions.
5. After all captures: node packages/jobs-runtime/scripts/rebuildLinks.js then ensure data:push completed (node packages/jobs-runtime/scripts/data.js push — idempotent).
6. Deliver a short summary: counts captured / skipped-nonstock / skipped-automated / skipped-sensitive, new conversation ids with companyIds, any data/_proposals written, and a "Files touched" section. Note interpretive enrichment is deferred to the enrichment job.

Rules: deterministic ids ⇒ safe to re-run; never delete files in a write path; creator="conversation-capture". Research aid, not investment advice.