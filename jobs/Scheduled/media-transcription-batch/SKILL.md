---
name: media-transcription-batch
description: Incremental batch processor for videos without transcripts (YouTube uncaptioned videos and media) using Gemini 2.5 Flash audio transcription, running 5x daily.
model: flash_lite
---

## Context

Incremental batch processing task that gradually transcribes all uncaptioned YouTube videos (SOIC Finance, Dr. Anil Lamba) and uncaptioned learning resources.
Runs 5 times daily spread across every 5-hour time window (`15 3,6,11,16,22 * * *`), with higher concentration in cold overnight hours (03:15, 06:15) when server and API loads are low.

Executes sequentially:

1. **Batch Transcribe** (`yarn media-transcription-batch --limit 5`): Downloads lightweight audio tracks via `yt-dlp` (no video bloat), uploads to Gemini Files API, generates structured transcripts with Gemini 2.5 Flash, deletes remote temp files, and saves directly to the sharded database (`youtube-transcripts/shard_*.jsonl`).
2. **Data Push** (`yarn data:push --only youtube-transcripts,youtube-transcripts.json`): Syncs touched transcript shards and indexes to the remote data layer.

## Execution Plan

Call the exact scripts:

1. Execute script (bash):
   ```bash
   export STOCKMARKET_JOB_NAME=media-transcription-batch
   yarn media-transcription-batch --limit 5
   ```
2. Read the batch summary JSON (batch size, processed, succeeded, failed, remaining uncaptioned).
3. If new transcripts were generated, sync the data layer:
   ```bash
   yarn data:push --only youtube-transcripts,youtube-transcripts.json
   ```
4. Final step:
   ```bash
   python scripts/metrics/track_invocation.py --name media-transcription-batch --type task --model <exact model>
   ```
