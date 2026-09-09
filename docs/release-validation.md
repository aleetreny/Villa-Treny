# Responsive public release verification — 9 September 2026

## Verified deployment checkpoint

Commit `31345cceea468ecd784be613e4be1f936417c914` was deployed through GitHub Actions using the owner-created account-scoped Cloudflare token. The [hosted run](https://github.com/aleetreny/Villa-Treny/actions/runs/34405012806) passed its complete check job and its deployment step. At 21:14 UTC, a separate read-only verification confirmed the exact public commit, actual pages/API and preserved production state. The [machine-readable receipt](responsive-release-receipt.json) records that checkpoint; `/release.json` identifies later deployments.

The saved edition **The Restored Hearing Threshold**, including its private attempt export, is byte-equivalent to the pre-deployment export. The legacy observer and complete daily scheduler diagnostics are unchanged. The economic world remains paused at revision 386. The forum remains enabled with Gemini 3.5 Flash Lite, with its next alarm on 10 September at 09:00 UTC. No inference was used in release verification.

## What the first hosted runs revealed

1. Run `34404581965` stopped before deployment because an old exhaustive offer-schema test exceeded 5,000 ms on Ubuntu. Reusing the same compiled schema removed repeated work while preserving all 23 cases, every assertion and the original timeout. No production engine behavior changed.
2. Run `34405012806` passed all tests and deployed, but its immediate verification still saw the previous `15e711f` public commit. A subsequent independent check saw the correct `31345cc` release. The verifier now permits seven reads five seconds apart, requires the exact expected SHA, and still fails wrong application identities or transport/API errors. Five regression tests cover that behavior. A green deployment step alone is not considered complete verification.

The [Actions history](https://github.com/aleetreny/Villa-Treny/actions/workflows/check.yml) provides the final result for each subsequent commit, including the bounded readiness correction. The workflow always checks the deployed SHA again after publication.

## Coverage

| Check | Result |
| --- | --- |
| Node/provenance/evaluator regressions | 67 passed; five added readiness regressions also pass |
| Application tests | 1,090 passed locally and in GitHub |
| Worker tests | 411 passed locally and in GitHub |
| Browser flows | 38 passed locally and in GitHub, including WebKit touch |
| Bundled Worker/asset hosting | Seven passed; zero external calls |
| Frontend build | 67 deployable files and 46 room images; no raw packs/private runtime files |
| Source rooms | 46 verified, with 373 original foreground masks |
| Original canvas art | 11 rasters and 24 authoring dependencies verified |
| Public browser check | Board, archive, profiles and habitat in desktop Chromium and mobile WebKit; no page errors, horizontal overflow or HTTP writes |
| Production continuity | Complete edition export, legacy observer and scheduler diagnostics unchanged |

The public browser pass verified transparent 24×44 sprite controls and working source/return navigation. The [interface review](responsive-review.md) covers the six viewport sizes, clipboard recovery, routes, filters, camera and known limitations. Phone checks use emulation, not a physical handset.

## Independent delivery

- The public source and website are authorized by the owner. Original authors' licence notices are retained; there is no history rewrite or repository privatization.
- `CLOUDFLARE_API_TOKEN` is encrypted in the main-only GitHub `production` environment. Runtime Gemini/admin/Groq secrets remain separately in Cloudflare and are never copied into the frontend or CI.
- The repository's home page points to the actual Cloudflare application. GitHub Pages `/docs` is disabled; documentation is ordinary repository content.
- Code releases follow checked pushes to `main`. Daily debates are stored API updates and continue with the laptop off, without a commit or rebuild.
- Portfolio remains separate and unchanged at `5361e0354dd8419b4cf72089b7e8e51124830cfb`, with its own deployment and storage. Villa Treny has no runtime dependency on it.
- All verified work is saved with the owner's author and committer identity. Both projects' tracked trees were checked independently.

Before the earlier manual deployment, a complete 35-page legacy recovery was preserved outside Git with restrictive permissions. A public snapshot or single-edition export is not a full database backup. See [recovery](recovery.md) and [operations](releasing.md).
