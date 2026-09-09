#!/usr/bin/env node
import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { createServer } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PILOT_POLICY = Object.freeze({
  model: 'gemini-3.5-flash-lite', projectId: 'gen-lang-client-0517588582',
  maxCallsPerRun: 32, maxCallsPerPacificDay: 64, maxCallsPerMinute: 10,
  accountQuotaObserved: { rpm: 15, inputTpm: 250_000, rpd: 500, date: '2026-09-09' },
  maxRequestBytes: 20 * 1024, maxOutputTokens: 4096, automaticRetries: 0,
});
const LOCAL = resolve(ROOT, '.local/gemini-debate');
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export function pacificDay(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
}
export function nextAdmission(attempts, now) {
  if (!Array.isArray(attempts) || attempts.some(row => !Number.isSafeInteger(row.atMs) || row.atMs < 0 || row.atMs > now)) throw new Error('invalid_budget_or_clock_rollback');
  if (attempts.filter(row => pacificDay(row.atMs) === pacificDay(now)).length >= PILOT_POLICY.maxCallsPerPacificDay) throw new Error('pilot_daily_budget_exhausted');
  const recent = attempts.filter(row => row.atMs > now - 60_000).sort((a, b) => a.atMs - b.atMs);
  return recent.length >= PILOT_POLICY.maxCallsPerMinute ? recent[recent.length - PILOT_POLICY.maxCallsPerMinute].atMs + 60_001 : now;
}
export function parseOptions(args) {
  if (args.some(arg => !['--live', '--help'].includes(arg))) throw new Error('unknown_argument');
  return { live: args.includes('--live'), help: args.includes('--help') };
}
async function atomicJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}
const markdown = text => String(text).replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export function renderReport(report, receipt) {
  const lines = ['# Gemini debate pilot', '', `Model: ${receipt.policy.model}. Protocol: ${report.protocol}. Status: ${report.status}.`,
    '', `Actual provider attempts: ${receipt.attempts.length}. No automatic retries. No production changes.`,
    '', 'This is an exploratory model sample. Mechanical validity is not a quality score.', '', '## Generated questions', ''];
  for (const row of report.questions) {
    lines.push(`### ${row.domain}`, '');
    if (!row.value) { lines.push(`Not admitted: ${row.issues.join(', ')}. The original result remains in report.json.`, ''); continue; }
    lines.push(`**${markdown(row.value.title)}**`, '', markdown(row.value.context), '', `**${markdown(row.value.question)}**`, '');
    const review = report.entries.find(entry => entry.id === `${row.value.id}-review`);
    if (review?.result.ok && !review.validationIssues.length) lines.push(`Model's own editorial assessment (not independent): ${markdown(JSON.stringify(review.result.payload))}`, '');
  }
  lines.push('## Debates', '');
  for (const debate of report.debates) {
    lines.push(`### ${markdown(report.questions.find(row => row.value?.id === debate.caseId)?.value?.title ?? debate.caseId)}`, '',
      `Complete: ${debate.complete}.`, '');
    for (const post of debate.posts) lines.push(`#### ${post.personaId} · round ${post.round}${post.replyTo ? ` · replying to ${post.replyTo}` : ''}`, '', markdown(post.body), '');
  }
  lines.push('## Failures and mechanical exclusions', '');
  const failed = report.entries.filter(entry => entry.validationIssues.length);
  if (!failed.length) lines.push('None in this sample.');
  for (const entry of failed) lines.push(`- ${entry.id}: ${entry.validationIssues.join(', ')} (HTTP ${entry.result.status ?? 'not available'}).`);
  lines.push('', '## Usage', '', '| Call | Input | Visible output | Thinking | Total | Complete counters |', '|---|---:|---:|---:|---:|---|');
  for (const entry of report.entries) {
    const u = entry.result.usage;
    lines.push(`| ${entry.id} | ${u.inputTokens ?? 'unknown'} | ${u.outputTokens ?? 'unknown'} | ${u.thinkingTokens ?? 'unknown'} | ${u.totalTokens ?? 'unknown'} | ${u.complete} |`);
  }
  lines.push('', '## Limits', '', ...report.limitations.map(text => `- ${text}`),
    '- The local budget covers this pilot only. Other uses of the same Google project share its provider quotas.',
    '- Request bytes are capped as a conservative admission guard; they are not measured Gemini tokens.', '');
  return lines.join('\n');
}

export async function main(args) {
  const options = parseOptions(args);
  if (!options.live || options.help) {
    console.log(JSON.stringify({ mode: 'offline_plan', policy: PILOT_POLICY,
      plan: 'Six generated questions in different domains; six independent openings and six balanced replies on each of the first two eligible cases.',
      run: 'pnpm debate:pilot --live', requestsMade: 0 }, null, 2));
    return;
  }
  // The ignored file is loaded by the package command. No browser/client env var.
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('missing_GEMINI_API_KEY');
  await mkdir(LOCAL, { recursive: true, mode: 0o700 });
  const lockPath = resolve(LOCAL, 'pilot.lock');
  const lock = await open(lockPath, 'wx', 0o600).catch(() => { throw new Error('pilot_locked_check_running_process'); });
  let server;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    const budgetPath = resolve(LOCAL, 'budget.json');
    let budget = { version: 1, projectId: PILOT_POLICY.projectId, attempts: [] };
    try { budget = JSON.parse(await readFile(budgetPath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (budget.version !== 1 || budget.projectId !== PILOT_POLICY.projectId) throw new Error('unexpected_project_budget');
    nextAdmission(budget.attempts, Date.now());
    const output = resolve(LOCAL, new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID().slice(0, 8));
    await mkdir(output, { mode: 0o700 });
    const sourcePaths = ['workers/habitat-runtime/src/providers/gemini.ts', 'workers/habitat-runtime/src/debate/pilot.ts',
      'src/lib/habitat/debate/contracts.ts', 'src/lib/habitat/debate/personas.ts', 'src/lib/habitat/debate/prompts.ts',
      'src/lib/habitat/residents.ts', 'scripts/run-debate-pilot.mjs', 'package.json', 'pnpm-lock.yaml'];
    const sources = await Promise.all(sourcePaths.map(async path => {
      const contents = await readFile(resolve(ROOT, path), 'utf8');
      const snapshot = resolve(output, 'source', path);
      await mkdir(dirname(snapshot), { recursive: true, mode: 0o700 });
      await writeFile(snapshot, contents, { mode: 0o600 });
      return { path, sha256: hash(contents) };
    }));
    const receipt = { policy: PILOT_POLICY, startedAt: new Date().toISOString(), sources, attempts: [] };
    await atomicJson(resolve(output, 'receipt.json'), receipt);
    server = await createServer({ root: ROOT, configFile: false, appType: 'custom', logLevel: 'silent',
      server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
    const [{ runGemini, geminiRequestBody }, { runDebatePilot }] = await Promise.all([
      server.ssrLoadModule('/workers/habitat-runtime/src/providers/gemini.ts'),
      server.ssrLoadModule('/workers/habitat-runtime/src/debate/pilot.ts'),
    ]);
    console.log(`Output: ${output}`);
    const checkpoint = async report => {
      await atomicJson(resolve(output, 'report.json'), report);
      await writeFile(resolve(output, 'report.md'), renderReport(report, receipt), { mode: 0o600 });
    };
    const report = await runDebatePilot({ checkpoint, generate: async call => {
      if (receipt.attempts.length >= PILOT_POLICY.maxCallsPerRun) throw new Error('pilot_run_budget_exhausted');
      const body = geminiRequestBody(call.prompt);
      if (Buffer.byteLength(body) > PILOT_POLICY.maxRequestBytes) throw new Error('request_byte_budget');
      for (;;) {
        const now = Date.now(), wait = nextAdmission(budget.attempts, now) - now;
        if (wait <= 0) break;
        await sleep(Math.min(wait, 60_000));
      }
      const attempt = { id: randomUUID(), callId: call.id, atMs: Date.now(), requestBytes: Buffer.byteLength(body),
        requestSha256: hash(body), state: 'reserved', code: null };
      budget.attempts.push({ id: attempt.id, atMs: attempt.atMs });
      // Charge before dispatch. A crash or unknown remote outcome keeps the slot.
      await atomicJson(budgetPath, budget);
      receipt.attempts.push(attempt);
      await atomicJson(resolve(output, 'receipt.json'), receipt);
      const result = await runGemini({ apiKey, prompt: call.prompt });
      attempt.state = 'returned'; attempt.code = result.code;
      await atomicJson(resolve(output, 'receipt.json'), receipt);
      console.log(`${call.id}: ${result.code}; total tokens ${result.usage.totalTokens ?? 'unknown'}`);
      return result;
    } });
    receipt.finishedAt = new Date().toISOString(); receipt.status = report.status;
    await atomicJson(resolve(output, 'receipt.json'), receipt);
    await checkpoint(report);
    console.log(JSON.stringify({ status: report.status, actualCalls: receipt.attempts.length,
      admittedQuestions: report.questions.filter(row => row.value).length,
      completeDebates: report.debates.filter(row => row.complete).length, report: resolve(output, 'report.md') }));
    if (report.status !== 'complete') process.exitCode = 1;
  } finally { await server?.close(); await lock.close(); await unlink(lockPath); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    // Error messages from network libraries may contain credentials. Print only
    // our small allowlist; all unclassified failures remain generic.
    const allowed = ['unknown_argument', 'missing_GEMINI_API_KEY', 'pilot_locked_check_running_process',
      'unexpected_project_budget', 'invalid_budget_or_clock_rollback', 'pilot_daily_budget_exhausted', 'pilot_run_budget_exhausted', 'request_byte_budget'];
    console.error(allowed.includes(error.message) ? error.message : 'pilot_failed_see_local_report');
    process.exitCode = 1;
  });
}
