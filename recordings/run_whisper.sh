#!/bin/bash
# Whisper transcription script for NSE concall recordings
# Run from: /Users/darshanpatel/code/stockmarket/
# Usage: bash recordings/run_whisper.sh [small|medium|large-v3]

MODEL=${1:-small}
RECORDINGS_DIR="$(dirname "$0")"
MP3="$RECORDINGS_DIR/NSE_STYL_Q1FY27.mp3"

echo "=== Checking dependencies ==="
if ! command -v ffmpeg &>/dev/null; then
  echo "❌ ffmpeg not found. Installing via Homebrew..."
  brew install ffmpeg
fi
pip3 install openai-whisper --quiet 2>/dev/null || pip install openai-whisper --quiet

echo "=== Transcribing with model: $MODEL ==="
echo "Audio: $MP3"
echo ""

python3 - <<PYEOF
import whisper, json, os

model_name = "$MODEL"
mp3_path = "$MP3"
out_path = mp3_path.replace(".mp3", f"_whisper_{model_name.replace('-','_')}.txt")

print(f"Loading model '{model_name}'...")
model = whisper.load_model(model_name)

print("Transcribing (this takes 2-5 min for a 44-min call on small)...")
result = model.transcribe(
    mp3_path,
    language="en",
    verbose=False,
    word_timestamps=False,
    fp16=False   # Mac CPU-friendly
)

# Save full text
with open(out_path, "w") as f:
    f.write(result["text"])

# Also save with timestamps (useful for speaker segmentation later)
ts_path = out_path.replace(".txt", "_timestamped.json")
with open(ts_path, "w") as f:
    json.dump(result["segments"], f, indent=2)

word_count = len(result["text"].split())
print(f"\n✅ Done!")
print(f"   Output: {out_path}")
print(f"   Timestamped: {ts_path}")
print(f"   Words: {word_count}")
print(f"\n--- First 500 chars ---")
print(result["text"][:500])
PYEOF
