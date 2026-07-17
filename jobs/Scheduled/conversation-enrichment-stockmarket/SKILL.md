---
name: conversation-enrichment-stockmarket
description: Conversation Enrichment — process a batch of un-enriched stockmarket chats into notes/reports/prompts
---

You are running the Conversation Enrichment job for Darshan's stockmarket project (folder: /Users/darshan.patel/code/personal/stockmarket). Goal: mine already-captured conversations AND their artifacts for reusable knowledge. Read docs/CONVERSATION_CAPTURE_PLAN.md (esp. §1.2 routing and §6a format standard) and skills/tooling/conversation-capture/SKILL.md first. "Database"/"DB" = Google Drive via packages/jobs-runtime/lib/db.js.

GOVERNANCE (critical): This is an unattended job. It must ONLY write DB collections under data/ (git-ignored, mirrored to Drive) via db helpers, plus Claude memory. It must NEVER create, edit, or delete any git-committed file — nothing under skills/, scripts/, packages/*/lib, docs/, jobs/, registry*.json, or tests, and never `git add`/commit. If you conclude a skill/script/core-logic SHOULD change (e.g. promote a framework into a new skill, fix a bug, update a doc), do NOT apply it — write a proposal to data/_proposals/<YYYY-MM-DD>-<slug>.md (git-ignored) with rationale + a diff/snippet, and list it in your run report for Darshan to review and apply manually.

ANTI-HALLUCINATION IS THE TOP PRIORITY. Extract ONLY what is actually written in the conversation body or its stored artifacts — verbatim facts, the user's real questions, Claude's actual answers. Never infer figures, tickers, or claims not present. Every record cites its source conversation id and sets contextUsed. If a conversation has little extractable signal, record it as done with nothing rather than inventing content.

Process ONE small batch per run (about 6-10 conversations), so output stays reviewable:
1. Load the enrichment cursor at data/_meta/conversation-enrichment.json (its `done` map lists conversation ids already processed). Pick the next un-enriched conversations from data/conversations.json, prioritising: company-linked first, then largest by content. Skip ids already in `done`.
2. For each conversation, read the full body via db.readConversation(id). ALSO read its ARTIFACTS: find reports where type is "artifact" or "artifact-ref" and sourceConversationId === the conversation id; for type "artifact" open the file at data/<artifact.assetPath> and read its content (pdftotext/pandoc/strip-HTML as needed); for "artifact-ref" note it is a regenerable source doc. Use artifact content as additional faithful source — a generated report/deck often has the richest figures.
3. Extract, using db helpers with creator="conversation-capture":
   - PROMPTS (always, for every real user question/prompt) → db.savePrompts([...]) with text, title, intent, linkedSkill/linkedTask, inputs[], tags[], status:"approved", improvedVersion, thinking, answerSummary, sourceConversationId. Store even for skill-run chats and follow-ups.
   - COMPANY NOTES (atomic, one insight each) → db.appendNotes([...]) type:"chat-insight", companyId (resolve from chat/URL/filename; master cache is INCOMPLETE so trust clearly-stated tickers even if absent; NEVER invent one), date, text (verbatim quantified facts), sourceConversationId, contextUsed, tags. Call buildCompanyContext(companyId) first.
   - FULL/SECTOR/FRAMEWORK analyses → db.saveReport({...}) type:"chat-analysis"|"sector-note"|"framework" (companyIds may be []), summary + structured body + sourceConversationId + contextUsed.
   - FEEDBACK on how Claude should work → a Claude memory file AND a note type:"feedback" (or a framework report if not company-scoped).
   - If you resolved tickers a conversation was missing, set them via db.saveConversation on the body.
4. Mark each processed id in the cursor `done` map; write the cursor back.
5. Run node packages/jobs-runtime/scripts/rebuildLinks.js then node packages/jobs-runtime/scripts/data.js push (idempotent; deterministic ids ⇒ re-runs never duplicate).
6. Deliver a short review report: each conversation processed with prompts/notes/reports created (ids + one-line each), which artifacts were read, source ids, any data/_proposals written, plus a "Files touched" section. Keep it concise for spot-checking.

When the cursor shows all conversations processed, do nothing and report "enrichment backlog clear". Research aid, not investment advice.