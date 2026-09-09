#!/usr/bin/env node
/** Offline recovery analysis. No HTTP, credentials, control or inference.
 * stdout is an explicit public allowlist. Detailed state/forecast is written
 * only on request, outside the repository, exclusively with mode0600.
 * Usage: node scripts/analyze-society-recovery.mjs /private/recovery.json
 *        [--forecast-watch] [--private-out /private/analysis.json]
 */
import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { createServer } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 86_400_000;
const fail = code => { throw new Error(code); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value)
  ? value : JSON.stringify(value, (_key, item) => item instanceof Map ? [...item] : item)).digest('hex');
const json = value => { try { return JSON.parse(value); } catch { fail('invalid_archived_json'); } };
const counts = (values, allowed) => Object.fromEntries([...new Set(allowed)].map(key => [key, values.filter(value => value === key).length]));
const MODELS = ['@cf/openai/gpt-oss-120b', '@cf/google/gemma-4-26b-a4b-it', '@cf/qwen/qwen3-30b-a3b-fp8', 'openai/gpt-oss-20b'];
const safeModel = value => MODELS.includes(value) ? value : 'unknown';
const safeProvider = value => ['workers-ai', 'groq'].includes(value) ? value : 'unknown';

async function sourceFingerprint() {
  const paths = ['scripts/analyze-society-recovery.mjs', 'pnpm-lock.yaml', 'workers/habitat-runtime/src/checkpoint.ts',
    'workers/habitat-runtime/src/recovery.ts', 'workers/habitat-runtime/src/domain.ts'];
  async function walk(directory) {
    for (const item of await readdir(join(ROOT, directory), { withFileTypes: true })) {
      const path = `${directory}/${item.name}`;
      if (item.isDirectory()) await walk(path);
      else if (/\.tsx?$/.test(item.name)) paths.push(path);
    }
  }
  await walk('src/lib/habitat');
  const files = await Promise.all(paths.sort().map(async path => ({ path, sha256: hash(await readFile(join(ROOT, path))) })));
  return { sha256: hash(files), files };
}

export async function loadAnalyzerCore() {
  const source = await sourceFingerprint();
  const server = await createServer({ root: ROOT, configFile: false, appType: 'custom', logLevel: 'silent',
    server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const modules = await Promise.all(['/workers/habitat-runtime/src/checkpoint.ts', '/workers/habitat-runtime/src/recovery.ts',
      '/workers/habitat-runtime/src/domain.ts', '/src/lib/habitat/society/index.ts', '/src/lib/habitat/residents.ts',
      '/src/lib/habitat/engine/economy.ts'].map(path => server.ssrLoadModule(path)));
    if ((await sourceFingerprint()).sha256 !== source.sha256) fail('analysis_sources_changed');
    return { ...Object.assign({}, ...modules), source,
      verifySources: async () => { if ((await sourceFingerprint()).sha256 !== source.sha256) fail('analysis_sources_changed'); },
      close: () => server.close() };
  } catch (error) { await server.close(); throw error; }
}

function money(world, core) {
  const ledger = world.economy.ledger;
  const expected = ledger.initialCells + ledger.minted - ledger.burned - ledger.leaked;
  const actual = core.totalCells(world), difference = actual - expected;
  return { initial: ledger.initialCells, minted: ledger.minted, burned: ledger.burned, leaked: ledger.leaked,
    wallets: actual - world.economy.treasury, treasury: world.economy.treasury, total: actual,
    expected, difference, conserved: Math.abs(difference) < 1e-7,
    nonnegative: world.economy.treasury >= 0 && Object.values(world.bodies).every(body => body.cells >= 0) };
}

function actionSummary(observations, core) {
  const ids = new Set(core.RESIDENTS.map(resident => resident.id)), seen = new Set();
  for (const observation of observations) {
    if (!plain(observation) || !ids.has(observation.actor) || observation.intent?.actor !== observation.actor
      || !integer(observation.day) || ![1, 2, 3, 4].includes(observation.watch)
      || typeof observation.outcome?.ok !== 'boolean') fail('invalid_physical_observation');
    const key = `${observation.day}:${observation.watch}:${observation.actor}`;
    if (seen.has(key)) fail('duplicate_physical_observation');
    seen.add(key);
  }
  const executedPlans = observations.filter(row => row.stepId && !row.interrupted);
  return { actions: observations.length, distinctActors: new Set(observations.map(row => row.actor)).size,
    successful: observations.filter(row => row.outcome.ok).length,
    refused: observations.filter(row => !row.outcome.ok).length,
    plannedExecutions: executedPlans.length, plannedSuccessful: executedPlans.filter(row => row.outcome.ok).length,
    plannedInterrupted: observations.filter(row => row.stepId && row.interrupted).length,
    routineExecutions: observations.filter(row => !row.stepId).length,
    verbs: counts(observations.map(row => row.intent.verb), core.PLANNABLE_VERBS),
    otherVerbCount: observations.filter(row => !core.PLANNABLE_VERBS.includes(row.intent.verb)).length };
}

function economicHistory(tables, world) {
  const bySequence = new Map();
  for (const event of [...(tables.economic_events ?? []).map(row => json(row.event_json)), ...world.economy.events]) {
    if (!plain(event) || !integer(event.sequence) || !Array.isArray(event.entries)
      || event.entries.some(entry => typeof entry.account !== 'string' || !Number.isFinite(entry.delta))) fail('invalid_economic_history');
    const previous = bySequence.get(event.sequence);
    // The validated world codec may reorder object keys (for example moving
    // companions ahead of action). Compare actual structure, retaining array
    // order and every value; byte hashes remain authoritative for the backup.
    if (previous && !isDeepStrictEqual(previous, event)) fail('conflicting_economic_history');
    bySequence.set(event.sequence, event);
  }
  const events = [...bySequence.values()].sort((a, b) => a.sequence - b.sequence);
  const balanceError = event => {
    const change = name => event.entries.filter(entry => entry.account === name).reduce((sum, entry) => sum + entry.delta, 0);
    const cash = event.entries.filter(entry => entry.account === 'treasury' || /^cells:[A-Y]$/.test(entry.account))
      .reduce((sum, entry) => sum + entry.delta, 0);
    return cash - change('ledger:initialCells') - change('ledger:minted') + change('ledger:burned') + change('ledger:leaked');
  };
  const payments = events.filter(event => /^work:agreement:/.test(event.action));
  return { events, public: { retainedEvents: events.length,
    completeSequenceFromEconomyStart: events.length === world.economy.nextEventSequence && events.every((event, index) => event.sequence === index),
    nonconservingEvents: events.filter(event => Math.abs(balanceError(event)) >= 1e-7).length,
    negotiatedWorkPaymentEvents: payments.length,
    negotiatedWorkCellsTransferred: payments.reduce((total, event) => total + event.entries.filter(entry => /^cells:[A-Y]$/.test(entry.account) && entry.delta > 0)
      .reduce((sum, entry) => sum + entry.delta, 0), 0),
    agreementTransferOrLoanEvents: events.filter(event => /^agreement:agreement:/.test(event.action)).length } };
}

function providerSummary(tables, contexts, capturedAtMs) {
  const attempts = new Map((tables.provider_attempts ?? []).map(row => [row.attempt_id, row]));
  const jobs = new Map((tables.cognition_jobs ?? []).map(row => [row.job_id, row]));
  const reservations = tables.quota_reservations ?? [];
  const grouped = new Map();
  const group = (provider, model) => {
    const key = `${safeProvider(provider)}|${safeModel(model)}`;
    if (!grouped.has(key)) grouped.set(key, { provider: safeProvider(provider), model: safeModel(model),
      recordedOutcomes: 0, successfulProviderResponses: 0, recordedDispatches: 0, appliedSocietyJobs: 0,
      confirmed: { requests: 0, inputTokens: 0, outputTokens: 0, neurons: 0 },
      unresolved: { reservations: 0, inputTokens: 0, outputTokens: 0, neurons: 0 },
      chargedInCurrentWindow: { requests: 0, inputTokens: 0, outputTokens: 0, neurons: 0 } });
    return grouped.get(key);
  };
  for (const row of attempts.values()) {
    const item = group(row.provider, row.model); item.recordedOutcomes += 1;
    if (row.ok === 1) item.successfulProviderResponses += 1;
  }
  for (const row of jobs.values()) if (row.status === 'applied' && contexts.has(row.job_id)) group(row.provider, row.model).appliedSocietyJobs += 1;
  const utcStart = Date.parse(`${new Date(capturedAtMs).toISOString().slice(0, 10)}T00:00:00Z`);
  for (const row of reservations) {
    const attempt = attempts.get(row.reservation_id);
    const item = group(row.provider, attempt?.model); // Never infer a missing model from today's configuration.
    const confirmed = row.usage_confirmed === 1;
    if (row.state === 'dispatched' || row.state === 'settled') item.recordedDispatches += 1;
    const time = Math.max(row.created_at_ms, row.dispatched_at_ms ?? 0, row.settled_at_ms ?? 0);
    const active = row.provider === 'workers-ai'
      ? confirmed ? Math.max(row.created_at_ms, row.settled_at_ms ?? 0) >= utcStart : time > capturedAtMs - DAY
      : time > capturedAtMs - DAY;
    const charge = { requests: confirmed ? row.actual_requests : row.max_requests,
      inputTokens: confirmed ? row.actual_input_tokens : row.max_input_tokens,
      outputTokens: confirmed ? row.actual_output_tokens : row.max_output_tokens,
      neurons: confirmed ? row.actual_neurons : row.max_neurons };
    if (confirmed) for (const key of Object.keys(charge)) item.confirmed[key] += charge[key];
    else {
      item.unresolved.reservations += 1;
      for (const key of ['inputTokens', 'outputTokens', 'neurons']) item.unresolved[key] += charge[key];
    }
    if (active) for (const key of Object.keys(charge)) item.chargedInCurrentWindow[key] += charge[key];
  }
  return [...grouped.values()];
}

export function analyzeRecoveryBundle(core, bundle, { forecastWatch = false } = {}) {
  const inputHash = hash(bundle);
  const verified = core.verifyRecoveryBundle(bundle.core, bundle.pages ?? []);
  const { world, tables } = verified, capturedAtMs = bundle.core.exportedAtMs;
  if (!integer(capturedAtMs)) fail('invalid_capture_time');
  const ids = new Set(core.RESIDENTS.map(resident => resident.id));
  const societyRow = tables.society_state?.[0];
  const society = societyRow ? core.parseSocietyState(json(societyRow.state_json)).state : null;
  const view = society ? core.societyPublicView(society) : null;
  const contexts = new Map((tables.cognition_contexts ?? []).filter(row => ids.has(row.actor)).map(row => [row.job_id, row]));
  const jobs = tables.cognition_jobs ?? [], individualJobs = jobs.filter(row => contexts.has(row.job_id));
  const applied = individualJobs.filter(row => row.status === 'applied');
  const publicEvents = (tables.society_events ?? []).map(row => ({ jobId: row.job_id, event: json(row.event_json) }));
  const eventsByJob = new Map(publicEvents.map(row => [row.jobId, row.event]));
  const historicStatuses = (name, current, allowed) => {
    const latest = new Map();
    // society_events is append-only. Current bounded state, when still present,
    // is newer than the last cognition event (physical settlement may follow).
    for (const value of [...publicEvents.flatMap(row => row.event[name] ?? []), ...current]) {
      if (typeof value?.id === 'string' && allowed.includes(value.status)) latest.set(value.id, value.status);
    }
    return { archivedAndCurrent: latest.size, latestKnownStatuses: counts([...latest.values()], allowed),
      historyCaveat: 'Evicted entries retain their last archived status; it is not a current active obligation.' };
  };
  const messages = new Map();
  const addMessage = (turn, conversationId, participants) => {
    if (!plain(turn) || typeof turn.id !== 'string' || !ids.has(turn.speaker) || typeof turn.text !== 'string'
      || !integer(turn.atMs) || typeof conversationId !== 'string' || !Array.isArray(participants)
      || participants.length !== 2 || !participants.every(id => ids.has(id)) || !participants.includes(turn.speaker)) fail('invalid_public_message');
    const allowed = { id: turn.id, conversationId, participants: [...participants], speaker: turn.speaker, text: turn.text, atMs: turn.atMs };
    if (messages.has(turn.id) && hash(messages.get(turn.id)) !== hash(allowed)) fail('conflicting_public_message');
    messages.set(turn.id, allowed);
  };
  for (const { event } of publicEvents) for (const turn of event.turns ?? []) addMessage(turn, turn.conversationId, turn.participants);
  for (const conversation of view?.conversations ?? []) for (const turn of conversation.turns) addMessage(turn, conversation.id, conversation.participants);
  const conversationSpeakers = new Map();
  for (const message of messages.values()) {
    if (!conversationSpeakers.has(message.conversationId)) conversationSpeakers.set(message.conversationId, new Set());
    conversationSpeakers.get(message.conversationId).add(message.speaker);
  }
  const runs = tables.physical_runs ?? [];
  const observations = runs.flatMap(row => {
    const actions = json(row.actions_json);
    if (!Array.isArray(actions) || actions.some(action => action.day !== row.sim_day || action.watch !== row.sim_watch)) fail('invalid_physical_run');
    return actions;
  });
  const history = economicHistory(tables, world);
  const projects = society ? Object.values(society.minds).flatMap(mind => mind.project ? [mind.project] : []) : [];
  const plans = society ? core.plannedSocietyActions(society, world) : {};
  const publicReport = {
    format: 'villa-society-recovery-analysis-v1', scope: 'Observed persisted recovery cut; no model calls or runtime mutation.',
    bundleSha256: inputHash, sourceSha256: core.source.sha256, completeRecovery: verified.complete,
    capturedAtMs, worldRevision: verified.worldRevision, day: world.day, watch: world.watch,
    societyInitialized: society !== null,
    coverage: { total: ids.size, everSucceeded: view?.residents.filter(row => row.lastSuccessAtMs !== null).length ?? 0,
      neverSucceeded: view?.residents.filter(row => row.lastSuccessAtMs === null).length ?? ids.size,
      residents: core.RESIDENTS.map(({ id }) => ({ id,
        appliedJobs: applied.filter(row => contexts.get(row.job_id).actor === id).length,
        lastSuccessAtMs: society?.minds[id].lastSuccessAtMs ?? null,
        lastAttemptAtMs: society?.minds[id].lastAttemptAtMs ?? null })) },
    cognition: { allHistoricJobs: jobs.length, individualSocietyJobs: individualJobs.length,
      statuses: counts(individualJobs.map(row => row.status), ['pending', 'running', 'deferred', 'resolved', 'applied', 'dead']),
      appliedWithPublicCommit: applied.filter(row => eventsByJob.has(row.job_id)).length,
      appliedWithMessages: applied.filter(row => eventsByJob.get(row.job_id)?.turns?.length).length,
      appliedWithOfferChanges: applied.filter(row => eventsByJob.get(row.job_id)?.offers?.length).length,
      appliedWithAgreementChanges: applied.filter(row => eventsByJob.get(row.job_id)?.agreements?.length).length,
      interpretation: 'Applied means a validated decision was persisted, not that its purpose was useful or fulfilled.' },
    providers: providerSummary(tables, contexts, capturedAtMs),
    conversations: { retainedCurrent: view?.conversations.length ?? 0, archivedAndCurrent: conversationSpeakers.size,
      bilateral: [...conversationSpeakers.values()].filter(speakers => speakers.size === 2).length,
      uniquePublicMessages: messages.size, currentStatuses: counts((view?.conversations ?? []).map(row => row.status), ['open', 'closed', 'expired']) },
    offers: { scope: 'Current bounded society state', total: view?.offers.length ?? 0,
      statuses: counts((view?.offers ?? []).map(row => row.status), ['open', 'accepted', 'rejected', 'replaced', 'expired']),
      history: historicStatuses('offers', view?.offers ?? [], ['open', 'accepted', 'rejected', 'replaced', 'expired']) },
    agreements: { scope: 'Current bounded society state', total: view?.agreements.length ?? 0,
      statuses: counts((view?.agreements ?? []).map(row => row.status), ['active', 'payment_due', 'fulfilled', 'breached']),
      history: historicStatuses('agreements', view?.agreements ?? [], ['active', 'payment_due', 'fulfilled', 'breached']) },
    plans: { currentProjects: projects.length, active: projects.filter(project => project.status === 'active').length,
      activePurposesWithoutPhysicalSteps: projects.filter(project => project.status === 'active' && !project.steps.length).length,
      stepsFinishedNotGoalsProven: projects.filter(project => project.status === 'completed').length,
      steps: counts(projects.flatMap(project => project.steps.map(step => step.status)), ['pending', 'done', 'failed']),
      eligibleNextActions: Object.keys(plans).length },
    physical: { scope: 'Retained physical_runs only; older watch_runs are not reconstructed as individual outcomes.',
      committedWatches: runs.length, ...actionSummary(observations, core) },
    economy: { stock: { ...world.economy.stock }, maintenance: world.economy.maintenance,
      money: money(world, core), history: history.public,
      debts: { retained: world.economy.debts.length,
        statuses: counts(world.economy.debts.map(debt => debt.status), ['open', 'paid', 'overdue']),
        remainingCells: world.economy.debts.reduce((sum, debt) => sum + debt.remaining, 0) } },
    publicMessages: [...messages.values()].sort((a, b) => a.atMs - b.atMs || a.id.localeCompare(b.id)).slice(-20),
    limitations: ['Public messages are communicated claims, not verified facts.',
      'Current mind/project/offer arrays are bounded; archived counts are labelled separately.',
      'No private project goals, reasons, reflections, model inputs or raw outputs are printed.',
      'A recorded dispatch can have an unknown transport outcome; only confirmed usage authorizes a quota refund.',
      'No autonomous quality score can be inferred from acceptance or balances alone.'],
  };
  let forecast = null;
  if (forecastWatch && society) {
    const clone = structuredClone(world), actions = [];
    const forecastAtMs = Math.max(capturedAtMs, Number(verified.runtime.next_watch_at_ms ?? capturedAtMs));
    core.advanceWorldWatch(clone, undefined, undefined, undefined, { plans: structuredClone(plans), onAction: action => actions.push(action) });
    const observed = core.observeSocietyActions(structuredClone(society), clone, actions, { nowMs: forecastAtMs });
    core.deserializeWorldState(core.serializeWorldState(observed.world));
    if (!core.parseSocietyState(observed.state).ok) fail('invalid_forecast_society');
    const afterAccounts = core.economicAccounts(observed.world), beforeAccounts = core.economicAccounts(world);
    forecast = { source: 'Forecast on a clone, NOT observed production. No future cognition is assumed.',
      atMs: forecastAtMs, actions, worldJson: core.serializeWorldState(observed.world), society: observed.state };
    publicReport.forecast = { source: forecast.source, startingDay: world.day, startingWatch: world.watch,
      endingDay: observed.world.day, endingWatch: observed.world.watch,
      ...actionSummary(actions, core), money: money(observed.world, core),
      stockDelta: Object.fromEntries(Object.keys(world.economy.stock).map(resource =>
        [resource, afterAccounts[`stock:${resource}`] - beforeAccounts[`stock:${resource}`]])),
      maintenanceDelta: observed.world.economy.maintenance - world.economy.maintenance,
      agreementStatuses: counts(observed.state.agreements.map(row => row.status), ['active', 'payment_due', 'fulfilled', 'breached']) };
  } else if (forecastWatch) publicReport.forecast = { available: false, reason: 'This legacy recovery has no independent society state.' };
  if (hash(bundle) !== inputHash) fail('input_bundle_mutated');
  return { publicReport, privateReport: { ...publicReport, sourceFiles: core.source.files,
    observedPhysicalActions: observations, economicEvents: history.events, forecast } };
}

export function parseArgs(args) {
  const options = { bundle: null, forecastWatch: false, privateOut: null };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--forecast-watch' && !options.forecastWatch) options.forecastWatch = true;
    else if (args[i] === '--private-out' && !options.privateOut && args[i + 1] && !args[i + 1].startsWith('--')) options.privateOut = args[++i];
    else if (!options.bundle && !args[i].startsWith('--')) options.bundle = args[i];
    else fail('invalid_arguments');
  }
  if (!options.bundle) fail('private_recovery_path_required');
  return options;
}

export async function writePrivateReport(path, value) {
  if (!isAbsolute(path)) fail('absolute_private_output_required');
  const parent = await realpath(dirname(path)), repository = await realpath(ROOT);
  if (parent === repository || parent.startsWith(`${repository}${sep}`)) fail('private_output_inside_repository');
  // Exclusive open refuses an existing file or symlink. Parent must already
  // exist, so no accidental public directory tree is created.
  await writeFile(join(parent, path.split(sep).at(-1)), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  let core;
  try {
    const bundle = json(await readFile(resolve(options.bundle), 'utf8'));
    core = await loadAnalyzerCore();
    const result = analyzeRecoveryBundle(core, bundle, options);
    await core.verifySources();
    if (options.privateOut) await writePrivateReport(options.privateOut, result.privateReport);
    process.stdout.write(`${JSON.stringify(result.publicReport, null, 2)}\n`);
    return result.publicReport;
  } finally { await core?.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    // Parser, codec and filesystem errors may contain private source text or
    // paths. Keep CLI errors generic; programmatic tests can inspect exceptions.
    process.stderr.write('Recovery analysis failed: verify the complete private bundle, current codec and output path. No runtime action was taken.\n');
    process.exitCode = 1;
  });
}
