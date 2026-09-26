# September 2026 change round — revert guide

Source documents: `CRM 8 SeP.docx` (6 points) and `CRM Update 17 Sep.pdf` (4 points).
Implementation reports for the client were delivered as
`CRM 8 Sep - Implementation Report.docx` and `CRM Update 17 Sep - Implementation Report.pdf`.

Each requirement point is **one commit**, so a point the client changes their mind about can
be taken out on its own. Where that was not fully possible the coupling is stated explicitly
below — read the relevant row before reverting anything.

## Safe points

| Tag | Contents |
|---|---|
| `crm-sep-2026-baseline` | The tree exactly as it was before this round. Full rollback. |
| `sep2026/01-numbering` … `sep2026/11-stage-labels` | One tag per commit, in order. |
| `backup/crm-sep-2026-full` | Branch holding the whole change set as a single commit, kept as a safety net. Delete once you are happy. |

```bash
git checkout crm-sep-2026-baseline -- .   # roll the working tree all the way back
git revert <tag>                          # take one change out, keeping history
git diff crm-sep-2026-baseline HEAD       # everything this round changed
```

## The commits

| # | Tag | Point | Reverts cleanly on its own? |
|---|---|---|---|
| 1 | `sep2026/01-numbering` | 8 Sep #2 — client/group ID numbering | Yes |
| 2 | `sep2026/02-sorting` | 8 Sep #1 — numeric sort by client ID | Yes |
| 3 | `sep2026/03-duplicate-passport` | 8 Sep #3 — duplicate passport + new case | Yes¹ |
| 4 | `sep2026/04-priority-badge` | 8 Sep #4 — Priority column → Urgent badge | Yes¹ |
| 5 | `sep2026/05-payment-save-fix` | 17 Sep #3 — payment figures wiped on save | Yes¹ |
| 6 | `sep2026/06-save-button-bottom` | 17 Sep #4 — Save button placement | Yes |
| 7 | `sep2026/07-back-navigation` | 8 Sep #6 — Back jumps multiple steps | Yes¹ |
| 8 | `sep2026/08-advance-waiver` | 17 Sep #2 — refusal / free-service waiver | **No — see below** |
| 9 | `sep2026/09-family-advance` | 17 Sep #1 — family advance + WhatsApp group | **No — see below** |
| 10 | `sep2026/10-funnel-metrics` | 8 Sep #5 — metric cards + File Processing | Revert **last** |
| 11 | `sep2026/11-stage-labels` | cleanup — one shared `STAGE_LABELS` | Yes |

¹ Four commits share an import line with a sibling, because a single `import` statement
can only live in one commit. Reverting one of a pair leaves the other's import behind, and
`noUnusedLocals` then fails the typecheck. It is always a one-line deletion and the compiler
names it exactly — no detective work:

| Revert this | Delete by hand |
|---|---|
| 3 or 4 | the unused name in `ClientDetail.tsx`'s lucide-react import (`AlertTriangle` after reverting 4, `Plus` after reverting 3) |
| 5 or 7 | the unused `useRef` (after reverting 5) or `useLocation` (after reverting 7) in `CaseDetail.tsx` |

Verified, not assumed: reverting commit 4 was tested and applies with **zero conflicts**,
leaving exactly one `TS6133: 'AlertTriangle' is declared but its value is never read.`

## Where a revert needs a hand

Three points share `visaCase.service.ts`, and not by accident: `listCases` was refactored
from a 14-argument positional signature to one options object, and `updateCase` reads a
single pre-update snapshot that serves the workflow gates, the family propagation and the
conversion timestamps at once. Splitting that apart would have meant three worse versions of
the same function.

- **Reverting #8 (waiver) alone.** The schema fields, migration, validators, PDF and all UI
  come out cleanly. What stays behind is the `advanceState` filter and the `advanceWaived`
  reads inside `listCases`/`updateCase`, which live in commit 10. Remove `advanceState` from
  `caseQuerySchema` and `ADVANCE_STATE_WHERE` from the service, and drop the Waived option
  from the listing dropdown. **Also note the migration is not undone by a git revert** — the
  columns stay on the database until you write a down-migration. They are nullable /
  defaulted, so leaving them costs nothing.
- **Reverting #9 (family) alone.** `propagateGroupFlags` and `readGroupSettlement` come out
  cleanly, but their call sites inside `updateCase`/`createCase` are in commit 10. Expect a
  conflict there and delete the two calls.
- **Reverting #10 (metrics).** Revert this before 8 or 9, not after, or the shared hunks
  conflict. On its own it is clean.

## Things a revert would also undo

Worth knowing before pulling one of these, because they were fixed in passing rather than
asked for:

- **#1** also fixed `generateGroupRef` comparing refs as text, which would have minted
  `GRP-1000` twice after `GRP-999`.
- **#5** also fixed the doc "Paid By" radio snapping back mid-edit, and the same wipe on the
  assignee, pause, WhatsApp and appointment-status controls.
- **#10** also started writing `appointmentDateSetAt` and `fileProcessingStartedAt`, which
  no code had ever written. Revert it and the funnel cards go back to having no data source
  at all.
- **#11** also stopped `ClientForm` pulling `xlsx` into its bundle via `ClientList`.

## Verified at the last commit

Backend `tsc` clean, 114 tests passing. Frontend `tsc` clean, 18 tests passing. The rebuilt
history was diffed against `backup/crm-sep-2026-full` and is byte-identical across every
source file. Note there is no eslint config in this repo, so `npm run lint` cannot run —
typecheck is the only static gate.

## Known limitation carried into production

The two funnel timestamps are stamped from this change onward only. Existing rows are `NULL`,
so **Appointment Date Allotted** and **Moved to File Processing** read zero until staff work
through cases, and will never show historical figures. Backfilling would mean inventing dates
that were never captured. **Appointment Only** counts on case `createdAt` and is unaffected.
