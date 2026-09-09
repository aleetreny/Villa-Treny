// Offline proposal only. Reads fixed fictional evidence, uses the previously
// cached official tokenizer, and never changes core or requests inference.
/* global structuredClone, console, process */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { countParts } from '../../scripts/benchmark-society-oss-probe.mjs';
import { refineDealSchema } from '../../scripts/benchmark-society-v7-schema-probe.mjs';
import { hash } from '../../scripts/benchmark-society-runtime-v7-local.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DIRECTORY = 'docs/research/model-society-v7-grammar-local-2026-09-08';
const OUTPUT = join(ROOT, 'docs/research/opening-proposal-audit-2026-09-08.json');
const TOKENIZER = {
  python: '/var/folders/hj/8gb1hypn0qd3rpd94jql_8g80000gp/T/villa-static-token-audit-6y4773qu/venv/bin/python',
  cache: '/var/folders/hj/8gb1hypn0qd3rpd94jql_8g80000gp/T/villa-static-token-audit-6y4773qu/cache',
};
export const CANDIDATE_SENTENCE = 'Deal is optional. To propose a concrete transfer, loan or work commitment that serves your purpose, use deal, including first contact. Words alone do not schedule work or move cells. Ordinary discussion needs no deal.';
const ORIGINAL_SENTENCE = 'Deal is optional and available only on your turn in an existing conversation.';

export function openingProposalSchema(schema, proposal) {
  if (schema.properties.deal || !schema.properties.message) return structuredClone(schema);
  const next = structuredClone(schema);
  next.properties.deal = structuredClone(proposal);
  return refineDealSchema(next);
}

function range(values) { return [Math.min(...values), Math.max(...values)]; }
async function main() {
  const raw = await readFile(join(ROOT, DIRECTORY, 'ledger.json'));
  const ledger = JSON.parse(raw), rows = ledger.entries.filter(row => row.kind === 'cognition');
  assert.equal(rows.length, 37);
  const proposal = rows.find(row => row.job.turn.conversation).job.job.outputContract.jsonSchema.$defs.choice_deal;
  assert.ok(proposal.anyOf.every(branch => !branch.properties.offerId));
  const parts = [], candidates = [];
  let grammarChecks = 0;
  for (const [i, row] of rows.entries()) {
    const source = row.job.job, before = source.outputContract.jsonSchema;
    assert.ok(source.prompt.system.includes(ORIGINAL_SENTENCE));
    const schema = row.job.turn.conversation ? structuredClone(before) : openingProposalSchema(before, proposal);
    const system = source.prompt.system.replace(ORIGINAL_SENTENCE, CANDIDATE_SENTENCE);
    const compiled = z.fromJSONSchema(schema);
    assert.ok(compiled.safeParse(row.receipt.output).success); grammarChecks++;
    const opening = !row.job.turn.conversation && Boolean(before.properties.message);
    if (opening) {
      const project = { mode: 'replace', goal: 'Discuss a useful exchange.', why: 'Choose terms together.', visibility: 'private', steps: [] };
      const message = { to: before.properties.message.properties.to.enum[0], text: 'Would these terms suit you?', close: false };
      for (const deal of [
        { kind: 'transfer', direction: 'give', cells: 1 }, { kind: 'transfer', direction: 'ask', cells: 1 },
        { kind: 'loan', direction: 'lend', cells: 1, dueInDays: 2 }, { kind: 'loan', direction: 'borrow', cells: 1, dueInDays: 2 },
        { kind: 'work', role: 'hire', cells: 1, verb: 'filter_water', room: 'well', units: 1, slackWatches: 0 },
        { kind: 'work', role: 'work', cells: 0, verb: 'repair', room: 'workshops', units: 1, slackWatches: 0 },
      ]) {
        assert.ok(compiled.safeParse({ project, message, deal }).success); grammarChecks++;
        for (const invalid of [
          { project, message: { ...message, close: true }, deal },
          { project, message: { to: message.to, text: message.text }, deal },
          { project, deal }, { project, message, deal, extra: true },
          { project, message: { ...message, to: row.job.actor }, deal },
          { project, message, deal: { ...deal, cells: 1001 } },
          { project, message, deal: { ...deal, extra: true } },
          { project, message, deal: { kind: 'accept', offerId: 'invented' } },
          { project, message, deal: { kind: 'reject', offerId: 'invented' } },
        ]) { assert.equal(compiled.safeParse(invalid).success, false); grammarChecks++; }
      }
    }
    candidates.push({ actor: row.job.actor, stage: row.job.stage, index: row.job.index, opening,
      baselineSchemaHash: hash(JSON.stringify(before)), candidateSchemaHash: hash(JSON.stringify(schema)) });
    for (const [label, text] of [['system', source.prompt.system], ['candidateSystem', system], ['user', source.prompt.user],
      ['schema', JSON.stringify(before)], ['candidateSchema', JSON.stringify(schema)]]) parts.push({ label: `${i}:${label}`, text });
  }
  // Chunk only tokenizer input; no inference request or context is truncated.
  const counted = [];
  for (let i = 0; i < parts.length; i += 25) counted.push(...countParts(parts.slice(i, i + 25), TOKENIZER).parts);
  const byLabel = new Map(counted.map(part => [part.label, part]));
  for (const [i, item] of candidates.entries()) {
    const p = label => byLabel.get(`${i}:${label}`);
    item.counts = Object.fromEntries(['system','candidateSystem','user','schema','candidateSchema'].map(label => [label,
      { tokens: p(label).tokens, bytes: p(label).bytes, sha256: p(label).sha256 }]));
    item.baselineGroqReservation = p('system').tokens + p('user').tokens + p('schema').tokens + 128 + 1024;
    item.grammarOnlyGroqReservation = p('system').tokens + p('user').tokens + p('candidateSchema').tokens + 128 + 1024;
    item.withInstructionGroqReservation = p('candidateSystem').tokens + p('user').tokens + p('candidateSchema').tokens + 128 + 1024;
    item.candidateAuthoredBytes = p('candidateSystem').bytes + p('user').bytes + p('candidateSchema').bytes;
  }
  assert.equal(hash(await readFile(join(ROOT, DIRECTORY, 'ledger.json'))), hash(raw));
  const totals = key => candidates.reduce((n, row) => n + row[key], 0);
  const result = {
    scope: 'Offline schema proposal and accounting, not an implementation, replayed future or inference result.',
    httpRequests: 0, sourceLedger: DIRECTORY + '/ledger.json', sourceLedgerSha256: hash(raw), grammarChecks,
    tokenizer: { name: 'o200k_harmony', version: '0.14.0', framingMargin: 128, outputReservation: 1024,
      limitation: 'Ordinary authored-component counts plus provisional provider-framing allowance; not exact server prompt usage.' },
    systemProposal: CANDIDATE_SENTENCE, openingCases: candidates.filter(row => row.opening).length,
    affectedActors: candidates.filter(row => row.opening).map(row => row.actor),
    instructionTokenDelta: range(candidates.map(row => row.counts.candidateSystem.tokens - row.counts.system.tokens)),
    openingSchemaTokenDelta: range(candidates.filter(row => row.opening).map(row => row.counts.candidateSchema.tokens - row.counts.schema.tokens)),
    reservations: Object.fromEntries(['baselineGroqReservation','grammarOnlyGroqReservation','withInstructionGroqReservation']
      .map(key => [key, { range: range(candidates.map(row => row[key])), total: totals(key), above6000: candidates.filter(row => row[key] > 6000).length }])),
    candidateAuthoredBytes: range(candidates.map(row => row.candidateAuthoredBytes)), rows: candidates,
  };
  await writeFile(OUTPUT, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ ...result, rows: undefined }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
