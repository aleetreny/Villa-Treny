# Society audit — 7 September 2026

This audit concerns the deterministic lives behind the observer. It does not
claim that a simulated event has happened in the live habitat.

## Method and evidence

`tools/habitat/society-audit.mjs` advances the actual engine for seeds 1, 7 and 23,
sampling after 7, 30 and 90 days. A separate control offers exactly one valid
`observe` intention per watch to measure access to cognition. Those controls are
not predictions of what a language model would decide. The script also reads
public status, observer and archives without submitting any intentions.

Run `pnpm exec node tools/habitat/society-audit.mjs --offline` for the simulation,
or omit `--offline` to include the read-only cloud sample. `--prompts` writes the
1,080 control prompts to `/tmp/habitat-audit-prompts.json` for tokenizer checking.

The original measurement is `habitat-society-audit-before.json`; the current
measurement is `habitat-society-audit-data.json`. The original live sample covers
days 100–106: 159 archived entries (96 meetings, 47 work entries, 10 notes and 6
power reports), world revision 26, day 106, watch III. This history is preserved.

## Failures found

- A cabin was five room connections from Common, but a turn allowed only four
  movement actions. Residents repeatedly stopped before reaching bed. Two
  residents in seed 23 were also stranded by a disconnected decorative grid.
- Health lost more each day than routine sleep restored, without a reliable
  route to washing. Exhaustion and consoling displaced production.
- Ordinary work created money directly. Daily distribution divided the reactor
  surplus by residents with positive wallets, then paid **all 25**. A world with
  only one positive wallet jumped from 1 cell to 2,000.99 cells in one closing
  watch, despite a reactor upper bound below 118 new cells.
- Food and water were inexhaustible; growing and cooking produced no inventory.
  There were no transfers or enforceable loans.
- Pressure dominated cognition selection indefinitely. With 360 successful
  control thoughts, 12–15 residents received none, depending on seed.
- Teaching could name the other resident as actor, spending the wrong person's
  turn. Random draws inside the sort comparator made ordering non-transitive.
- Eight catalogue rooms were omitted from lighting allocation. Relationship
  selection counted resentment and debt as positive affinity.
- Cognition lacked stock, obligations, current relationship facts, personal
  memory and the actual available actions.

## Result of the bounded changes

| Elapsed days | Wallet total before, seeds 1 / 7 / 23 | Wallet total after, seeds 1 / 7 / 23 |
| --- | --- | --- |
| 7 | 858.76 / 875.08 / 815.60 | 329.31 / 348.10 / 304.37 |
| 30 | 2219.90 / 2237.77 / 2199.23 | 312.46 / 336.92 / 296.60 |
| 90 | 4359.49 / 4392.02 / 4344.67 | 300.97 / 298.69 / 282.77 |

The treasury is separate from these wallet totals. Its cells are included in
the conservation check, which passes after **every watch** with tolerance 1e-8.

At 90 days, mean health changes from 5.86–9.50 before to 67.05–67.22 after.
Minimum health is 43–45, minimum food condition 46, and minimum safety 43–45.
No resident falls below 18 in food, rest, health or safety at any checked watch
in the three new 90-day trials. Loneliness can still become low; it has a social
remedy rather than a compulsory happy minimum.

Routine residents reach their homes on every simulated night. The graph has
enough movement steps to reach a destination within a six-hour watch; optional
archived corridor playback cannot block their room decisions. The production
viewer continues to handle local sprite movement separately.

All 25 residents receive cognition in each control, with a largest measured gap
of 25 watches. Priority combines unbounded time since the last thought with
bounded pressure. There remains **one model intention per six real hours**;
all 25 residents receive deterministic routine turns at that watch. The browser's
walks do not submit decisions, spend tokens, or advance their lives.

## Material and monetary rules

The first stock inventory is explicitly dated at economy introduction, not
projected into the old archive. Current balances, conditions, relationships,
clock and reactor state are not replenished during migration.

| Action | Actual result |
| --- | --- |
| Grow | 2 water → 16 produce; 2 work credits |
| Cook | 4 produce + 1 water → 8 meals; 2 work credits |
| Eat | Consume 1 meal + 1 water; transfer 0.5 cell to treasury |
| Filter water (`clean` at Well) | Add 24 water; 1 work credit |
| Dig | 1 water → 4 materials; 2 work credits |
| Repair | Consume 1 material + 2 cells; restore safety and maintenance |
| Give | Transfer 2 cells if the recipient accepts and the giver keeps a reserve |
| Lend | Transfer 4 cells, with acceptance and trust checks; due in five days |
| Repay | Transfer up to 2 cells against a specific outstanding loan |
| Trade | Pay another resident 2 cells for an actual repair; the provider consumes 1 material and 1 cell |

Storage capacities prevent fictitious accumulation or discarded inputs. Work
earns credits rather than creating cells. At day close, one credit can receive
up to 0.35 cell from the treasury, reduced proportionally if funds are short.
Only surplus reactor output can mint cells, bounded by storage capacity and
the available power. Wallets and treasury leak 1.2% daily. Transfers conserve
money; consumed charge and leaks are separately recorded:

`wallets + treasury = initial cells + minted − consumed − leaked`

All acceptance, capacity and affordability checks happen before a transaction
changes money, materials, conditions, memory or obligations. Paid loans remain
in the immutable archive; the active world retains the most recent 50 closed
agreements and outstanding agreements. A persistent sequence prevents ID reuse.

## Causal examples — simulation only

In seed 1, Sten lends Ulla 4 cells on day 171, watch III, due on day 176. Ulla
returns 2 on day 173, watch I, and 2 on watch III. Each payment reduces her
wallet and increases Sten's by exactly that amount. Remaining principal falls
4 → 2 → 0; the debt becomes paid and the relationship records the repayment.

On day 173, Noor lends Ulla 4 cells. Later that day Vero lends Noor 4. Noor pays
Vero 2 immediately and the remaining 2 on day 177. Ulla repays Noor in two
payments by day 175. These agreements arise from low reserves and existing
trust; there is no written storyline directing this chain.

In seed 7, day 103, watch III, Reva pays Edda 2 cells for a repair. Reva loses 2,
Edda receives 2 and consumes 1, one material leaves the store, and Reva's safety
increases by 22. The record describes those actual deltas.

Across the three 90-day trials, there are 188–202 paid repairs, 39–58 personal
repairs and 64–65 material extractions. Seed 1 produces **four loans and eight
partial repayments**, completing four loans. Seeds 7 and 23 do not need loans.
This difference is retained rather than injecting debt to make them dramatic.

The new routine also produces 369–390 ordinary conversations, 299–308 periods
of company, 138–169 questions, 145–159 instances of listening, 67–91 jokes,
56–62 private conversations, and 6–9 teaching actions per 90-day trial.
There are no arguments in these three current trials. Arguments remain possible
from the existing resentment and from a genuinely overdue loan; an overdue date
reduces trust once, while repayment can repair it. No dispute is forced for a
target number of events. The number of completely unchanged directed pairs falls
from 366–400 before to 210–234 after, without artificial relationship noise.

## Cognition and narrative boundaries

The prompt includes the resident's own biography, fears, wishes and voice;
shared authored bonds; current directed axes; material reserves and debts;
eight bounded personal facts; up to eight relevant archived events; and currently
valid actions. `LATENT` information is supplied only to its recorded `knower`.
Boarding mysteries and scripted revelation routes are excluded. A test checks
all 25 contexts, including Ulla and Osvald's half-sibling relationship.

The actual Qwen tokenizer measured 1,080 control prompts: maximum **2,185 input
tokens**, mean 1,699, including the JSON schema and a 64-token framing margin.
None exceeds 2,500. Output remains capped at 384 tokens; provider quotas,
allowlisted models and the six-hour schedule are unchanged. This is an empirical
bound on the tested contexts, not a new paid inference allowance.

This work validates causal economy, reachable needs, knowledge separation and
access to agency. It does not guarantee fascinating stories, invent news, or
pretend that all 25 residents continuously run independent language models.

## Validation and migration

- Engine: 51 tests, including 90 days × three seeds checked after every watch,
  empty-inventory recovery, input/capacity rejection, transfer conservation,
  overdue/repayment consequences and repeated same-watch loans without ID reuse.
- Worker: 44 tests plus typecheck; migration 5 backs up the complete version-2
  state byte-for-byte, introduces codec 3, and leaves revision, runtime metadata,
  archive rows, balances and all 600 directed relationships intact.
- Production deployment and the single non-advancing provider check are recorded
  in `habitat-cloud-runtime.md`. No reset or automatic Git commit is involved.
