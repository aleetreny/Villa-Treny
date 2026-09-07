"""Measure Qwen prompts using its official tokenizer, without model inference.

Usage: python measure-prompt-tokens.py samples.json tokenizer.json output.json
Requires the optional `tokenizers` Python package. No Python is needed by the app.
"""
import hashlib
import json
import sys
from pathlib import Path
from tokenizers import Tokenizer

samples_file, tokenizer_file, output_file = map(Path, sys.argv[1:4])
tokenizer = Tokenizer.from_file(str(tokenizer_file))
samples = json.loads(samples_file.read_text())
counts = [{"scenario": s["scenario"], "actor": s["actor"],
           "inputTokensWithFramingMargin": len(tokenizer.encode(s["text"]).ids) + 64,
           "utf8Bytes": len(s["text"].encode())} for s in samples]
report = {"model": "Qwen3-30B-A3B-FP8", "method": "Official tokenizer; 64 additional framing tokens; output cap excluded",
          "tokenizerSha256": hashlib.sha256(tokenizer_file.read_bytes()).hexdigest(),
          "samples": len(counts), "maxInputTokens": max(s["inputTokensWithFramingMargin"] for s in counts),
          "results": counts}
output_file.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({k: v for k, v in report.items() if k != "results"}))
