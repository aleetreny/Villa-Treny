# Publishing and operating Villa Treny

## Two independent kinds of update

**Application releases:** commit a checked change and push `main`. The `Verify and publish Villa Treny` GitHub Actions workflow runs lint, types, unit/integration tests, browser interactions, the original-room verification and a local test of the bundled Worker. Only a successful check job can deploy. Pull requests and other branches do not receive deployment credentials.

The release checker allows seven reads five seconds apart for the expected commit to become visible after upload. It never accepts an older commit as success; API, identity and transport errors still fail. This handles the observed brief publication delay without hiding failures.

The deploy job downloads that run's verified frontend artifact, deploys it together with the Worker, and checks the public pages, saved archive, release commit and protected administration. Main runs are serialized so a newer deployment cannot be overwritten by an older concurrent run. Failed checks leave the current public version in place. A failed post-deploy check requires inspection; it does not imply an automatic rollback.

**Daily discussions:** the deployed Cloudflare Durable Object starts a new date at 09:00 UTC and advances one saved step at a time. An hourly cron reconciles missed scheduling. Accepted posts and the final summary are stored in SQLite, with the archive and recommendation counts. The browser reads the API; it never starts inference. No GitHub Actions schedule, generated Markdown commit, rebuild or laptop process is involved.

A new date may take several minutes to complete. Provider outages, rejected output and exhausted quotas can delay or hold an edition. The next date proceeds independently, within the configured limits. The product currently uses Gemini 3.5 Flash Lite; Gemini 3.8 Flash remains pending acceptance.

## Production identity

| Resource | Value |
| --- | --- |
| Public origin | `https://aleetreny-habitat-runtime.alejandrotreny100.workers.dev` |
| Source | `aleetreny/Villa-Treny`, branch `main` |
| Deployment workflow | `.github/workflows/check.yml` |
| GitHub environment | `production` |
| Worker | `aleetreny-habitat-runtime` |
| Forum binding / class | `DEBATE_FORUM` / `DebateForum` |
| Forum instance | `villa-treny-daily-v1` |
| Preserved legacy binding / class | `HABITAT_WORLD` / `HabitatWorld` |
| Preserved legacy instance | `habitat-canonical` |
| Public build identity | `/release.json` |

These stable resource names preserve existing data. Rebranding the website does not require renaming them. Do not create a new Worker, change a class/binding or rename an instance as part of a routine release. Production's old economic clock is paused; deploying code must not resume it or switch the debate model.

GitHub Pages from `/docs` is not used. The canonical application is served by Cloudflare, with the API and recommendation cookie on the same origin. The portfolio has no role in this deployment.

## Credentials and setup

The `production` environment is restricted to `main`. It holds `CLOUDFLARE_API_TOKEN`, used only by the deployment step. `CLOUDFLARE_ACCOUNT_ID` is a public repository variable. The token is dedicated to this repository and uses account-scoped Workers Scripts Write; it has no billing or Neon permissions. Consult the [Cloudflare GitHub Actions guide](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) when rotating it.

The runtime separately holds `GEMINI_API_KEY`, `ADMIN_TOKEN` and the retained `GROQ_API_KEY` in Cloudflare secret storage. The deployment workflow does not copy these into the frontend or replace them. The developer's interactive Wrangler OAuth session is not a CI credential. Do not change the administrative signing secret casually: recommendation identities use it.

Routine operations:

```sh
pnpm check
pnpm build
pnpm test:browser
pnpm rooms:export --verify
# Commit the logical change using the owner identity documented in AGENTS.md.
git switch main
git merge --ff-only <checked-development-branch>
git push origin main
gh run list --workflow check.yml --branch main --limit 5
pnpm release:verify
```

Use the `Run workflow` action on `main` to retry delivery after correcting a deployment credential. This does not regenerate any debate. Local emergency deployment uses `pnpm build && pnpm runtime:deploy` with an authenticated Wrangler session; always record the resulting commit and verify the public site afterwards.

## Data, recovery and inspection

Readers use `GET /v1/debates` and `GET /v1/debates/YYYY-MM-DD`. Votes are idempotent, reversible writes tied to the site's signed browser cookie. Source deployments update code and static assets; they do not replace the SQLite database.

Authenticated `GET /v1/admin/debates` reports the enabled model, next alarm, retained attempt receipts and edition states. `GET /v1/admin/debates/export?date=YYYY-MM-DD` exports a private edition and its attempt evidence. Keep these exports outside the repository with restrictive file permissions. An edition export is not a complete backup of recommendation identities and every database table.

Before a stateful migration, preserve and verify the full relevant storage, including the separately retained legacy world. See [recovery.md](recovery.md) for its paginated recovery protocol. Do not reset quotas, reconstruct production from a public snapshot, re-adopt a different edition at an existing date or run evaluation scripts against production as a release check.

To recover from a code regression, prefer a tested forward fix. Reverting a commit changes source, not stored debates; first check schema compatibility. Never roll database contents back to fix a CSS or frontend error.

## Diagnose a missing update

| Symptom | Check |
| --- | --- |
| Old interface after a code push | Actions check/deploy result and the commit in `/release.json` |
| New date has not started | UTC time, scheduler enabled flag and next durable alarm in protected diagnostics |
| Some posts are missing | Edition status and attempt errors; retries are deliberately bounded |
| Gemini errors or quota exhaustion | Correct model/project allowance and saved reservations; changing API keys does not create fresh quota |
| Recommendation does not persist | Same public origin, cookie permission and rate-limit response |
| The documentation appears as a website | Use the canonical Cloudflare URL; `/docs` is repository documentation |

Daily generation is independent of the GitHub deployment token and of the Mac. An expired deployment credential can block a new code release while the already-deployed schedule continues running.
