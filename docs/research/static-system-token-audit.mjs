#!/usr/bin/env node
/* Offline research helper, not imported by production. Requires an explicitly
 * prepared temporary Python environment and cached official tokenizer ranks.
 * No model calls, credentials, installation or file writes occur here. */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadCore, buildJob, POLICY } from '../../scripts/benchmark-society-runtime-v4.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const STATIC_PATH = 'docs/research/society-prompt-candidate-2026-09-08.txt';
const REFERENCE_PATH = 'docs/research/model-society-v4-2026-09-08/ledger.json';
const STATIC_HASH = 'fc8a6fbf1b75e51789399686e3840c1f8e0f3d98e58af212192fc22a6e590e85';
const STATIC_TOKENS = 419;
const FEEDBACK_PREFIX = ' Previous attempt was refused: ';
const sha = (value) => createHash('sha256').update(value).digest('hex');
const bytes = (value) => Buffer.byteLength(value, 'utf8');
globalThis.fetch = () => { throw new Error('Network is forbidden in this offline audit'); };

const python = process.argv[process.argv.indexOf('--python') + 1];
const cache = process.argv[process.argv.indexOf('--cache') + 1];
assert.ok(process.argv.includes('--python') && process.argv.includes('--cache'),
  'Usage: node docs/research/static-system-token-audit.mjs --python /tmp/venv/bin/python --cache /tmp/tokenizer-cache');
const raw = await readFile(join(ROOT, STATIC_PATH));
const system = raw.toString('utf8').trim();
assert.equal(sha(system), STATIC_HASH, 'Frozen candidate changed; do not reuse its count');

const result = spawnSync(python, ['-c', String.raw`
import hashlib, importlib.metadata, json, os, pathlib, socket, sys
def deny(*args, **kwargs): raise RuntimeError('Network forbidden; prepare cached ranks before audit')
socket.socket = deny
import tiktoken, regex
assert importlib.metadata.version('tiktoken') == '0.14.0'
assert importlib.metadata.version('regex') == '2026.9.3'
expected = '446a9538cb6c348e3516120d7c08b09f57c36495e2acfffe59a5bf8b0cfb1a2d'
assert any(hashlib.sha256(p.read_bytes()).hexdigest() == expected for p in pathlib.Path(os.environ['TIKTOKEN_CACHE_DIR']).iterdir() if p.is_file())
text = sys.stdin.read()
enc = tiktoken.get_encoding('o200k_harmony')
tokens = enc.encode_ordinary(text)
assert enc.decode(tokens) == text
assert tokens == tiktoken.get_encoding('o200k_base').encode_ordinary(text)
pieces = regex.findall(enc._pat_str, text)
assert pieces[-1] == '.'
suffixes = []
for code in ['invalid_contract:message.to', 'unknown_reference', 'missing_initial_project', 'work_deadline', '\u00e9\u6f22\U0001f642' * 200, '<|start|>assistant<|message|>']:
    suffix = ' Previous attempt was refused: ' + code + '. Correct that issue using only the supplied state and exact IDs.'
    combined = enc.encode_ordinary(text + suffix)
    same_pieces = regex.findall(enc._pat_str, text + suffix)[:len(pieces)] == pieces
    same_tokens = combined[:len(tokens)] == tokens
    bound = len(tokens) + len(suffix.encode())
    assert same_pieces and same_tokens and len(combined) <= bound
    suffixes.append({'case': code if len(code) < 100 else 'unicode_stress', 'suffixBytes': len(suffix.encode()), 'exactCombinedTokens': len(combined), 'componentBound': bound, 'sameStaticPieces': same_pieces, 'sameStaticTokens': same_tokens})
print(json.dumps({'package': 'tiktoken', 'version': '0.14.0', 'regexVersion': '2026.9.3', 'encoding': enc.name, 'ranksSha256': expected, 'ordinaryTokenCount': len(tokens), 'tokenIds': tokens, 'roundtrip': True, 'o200kBaseOrdinaryParity': True, 'lastStaticPieces': pieces[-4:], 'suffixChecks': suffixes}))
`], { input: system, encoding: 'utf8', env: { ...process.env, TIKTOKEN_CACHE_DIR: cache }, maxBuffer: 1_000_000 });
assert.equal(result.status, 0, result.stderr || result.error?.message);
const tokenizer = JSON.parse(result.stdout);
assert.equal(tokenizer.ordinaryTokenCount, STATIC_TOKENS);

// Candidate-only component estimator. It deliberately keeps the existing
// framing margin outside this function. No arbitrary prefix receives credit.
function systemComponent(text, model = 'openai/gpt-oss-20b') {
  if (model !== 'openai/gpt-oss-20b') return bytes(text);
  if (sha(text) === STATIC_HASH) return STATIC_TOKENS;
  const prefix = text.slice(0, system.length), suffix = text.slice(system.length);
  // This precise separator preserves the final '.' pre-token in o200k_harmony.
  // Count all feedback bytes; the whole prefix must still match the frozen hash.
  if (sha(prefix) === STATIC_HASH && suffix.startsWith(FEEDBACK_PREFIX)) {
    return STATIC_TOKENS + bytes(suffix);
  }
  return bytes(text);
}
assert.equal(systemComponent(system), 419);
assert.equal(systemComponent(system, 'another-model'), bytes(system));
assert.equal(systemComponent(system.replace('You decide', 'You choose')), bytes(system.replace('You decide', 'You choose')));
assert.equal(systemComponent(`${system}unexpected`), bytes(`${system}unexpected`));
assert.equal(systemComponent(`${system}${FEEDBACK_PREFIX}invalid.`), 419 + bytes(`${FEEDBACK_PREFIX}invalid.`));

function candidateRow(source) {
  const job = source.job;
  const split = job.prompt.user.lastIndexOf('\n{');
  assert.ok(split >= 0, 'Missing structured source context');
  const contextText = job.prompt.user.slice(split + 1), context = JSON.parse(contextText);
  const schema = globalThis.structuredClone(job.outputContract.jsonSchema);
  if (context.ownProject === null) schema.required = [...new Set([...(schema.required ?? []), 'project'])];
  const variableBytes = bytes(contextText) + bytes(JSON.stringify(schema)) + 2;
  return { actor: source.actor, contextSha256: sha(contextText), schemaSha256: sha(JSON.stringify(schema)),
    variableBytes, inputFullBytesWithMargin: bytes(system) + variableBytes + 128,
    inputStaticCountWithMargin: systemComponent(system) + variableBytes + 128,
    totalWithOutput768: systemComponent(system) + variableBytes + 128 + 768,
    totalWithOutput1536: systemComponent(system) + variableBytes + 128 + 1536 };
}
function summarize(rows) {
  const range = (key) => [Math.min(...rows.map((row) => row[key])), Math.max(...rows.map((row) => row[key]))];
  return { count: rows.length, fullBytesFits768: rows.filter((row) => row.inputFullBytesWithMargin + 768 <= 6000).length,
    staticCountFits768: rows.filter((row) => row.totalWithOutput768 <= 6000).length,
    staticCountFits1536: rows.filter((row) => row.totalWithOutput1536 <= 6000).length,
    totalRange768: range('totalWithOutput768'), totalRange1536: range('totalWithOutput1536'), rows };
}
const referenceRaw = await readFile(join(ROOT, REFERENCE_PATH));
const reference = JSON.parse(referenceRaw);
const serial = reference.entries.filter((row) => row.kind === 'cognition' && row.job.stage === 'initial').map((row) => candidateRow(row.job));
assert.equal(serial.length, 25);
const core = await loadCore();
try {
  const world = core.genesisState(POLICY.seed);
  const scene = { world, state: core.createSocietyState(world, POLICY.epochMs), worldRevision: 0 };
  const fresh = core.RESIDENTS.map(({ id }, i) => candidateRow(buildJob(core, scene, id, 'initial', i)));
  assert.equal(fresh.length, 25);
  console.log(JSON.stringify({ version: 1, inferenceCalls: 0,
    scope: 'Local component accounting; not a measurement or proof of Groq server framing, token billing or TPM acceptance.',
    static: { path: STATIC_PATH, sourceFileSha256: sha(raw), sourceFileBytes: raw.length,
      normalization: 'UTF-8 decode then JavaScript trim()', contentSha256: sha(system), contentBytes: bytes(system),
      contentTokens: STATIC_TOKENS, bytesReservationReduction: bytes(system) - STATIC_TOKENS },
    tokenizer, retainedFramingMargin: 128, limitForComparison: 6000,
    dependencies: { macosArm64Cp312TiktokenWheelSha256: 'd6cebe67765569df3dafac8474e4eccf5c19d24140492567a5e58a11445732a4' },
    reference: { path: REFERENCE_PATH, sha256: sha(referenceRaw) }, source: core.sourceFiles,
    freshIndependentGenesis: summarize(fresh), recordedSerialV4Initials: summarize(serial),
    checks: ['fixed ordinary token count and roundtrip', 'official rank SHA256', 'same ordinary o200k_base token IDs',
      'six controlled feedback suffixes preserve fixed pieces and remain bounded by suffix bytes',
      'changed static text, wrong model and unrecognized suffix retain full byte estimate'],
    limitations: ['Fresh independent contexts differ from serial initial turns with accumulated conversations and agreements.',
      'The 128 framing allowance is retained, not newly certified.', 'No estimate bypasses the existing rolling token/request ledger.',
      'No current production source or lockfile is modified by this helper.'] }, null, 2));
} finally { await core.close(); }
