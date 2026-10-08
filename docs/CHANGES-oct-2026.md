# October 2026 change round — revert guide

Source document: `1st Oct CRM.docx` (10 points). The developer notes and open questions for
the client were added to a copy, `1st Oct CRM - Developer Notes.docx`. The original was left
untouched.

Work lives on branch `crm/oct-2026`. Each requirement point is **one commit with one tag**, so
a point the client changes their mind about can be taken out on its own. The September round
(`CHANGES-sep-2026.md`) keeps working. The one September decision overturned is the
client-ref colour (point 2), because the spec cancels it.

## Safe points

| Tag | Contents |
|---|---|
| `crm-oct-2026-baseline` | `main` exactly as it was before this round. Full rollback. |
| `oct2026/01-…` to `oct2026/10-…` | One tag per point, in order. |

```bash
git diff crm-oct-2026-baseline crm/oct-2026     # everything this round changed
git revert oct2026/06-fp-documents              # take one point out, keeping history
```

## The commits

| # | Tag | Point | Migration | Reverts alone? |
|---|---|---|---|---|
| 1 | `oct2026/01-sorting-desc` | Newest client number first within a date | none | Test file only¹ |
| 2 | `oct2026/02-ref-colour-whatsapp` | Ref colour back to WhatsApp status | none | **Yes** |
| 3 | `oct2026/03-clear-appointment-date` | Appointment date removable; allotment reverses | none | No² |
| 4 | `oct2026/04-revert-to-appointments` | Super Admin: File Processing → Appointments | none | No² |
| 5 | `oct2026/05-appointment-paid-by` | Payer captured at allotment; "Appointment" label | `20261001120000` | No² |
| 6 | `oct2026/06-fp-documents` | Docs in File Processing, any type, folders | none | **Yes** |
| 7 | `oct2026/07-monthly-report` | Monthly business report; MISSED status | `20261001130000` | No² |
| 8 | `oct2026/08-add-client-lock` | Exclusive Add Client lock | `20261001140000` | **Yes** |
| 9 | `oct2026/09-advance-waiver-type` | Waived / Family / Friend; Add Client controls | `20261001150000` | No² |
| 10 | `oct2026/10-case-entry-date` | Returning client's new case dated today | `20261001160000` | **Yes** |

Verified, not assumed: every tag was test-reverted on its own against the branch head in a
throwaway worktree. Reverting **all ten newest-first** (10 → 1) is conflict-free and leaves
the tree byte-identical to `crm-oct-2026-baseline`.

¹ Reverting #1 alone conflicts only in `visaCase.service.test.ts`, on the `routedAt` ordering
expectation that #10 also edited. Keep #10's `{ receivedDate: 'desc' }` line and restore the
`clientRefNum: 'asc'` / `clientRef: 'asc'` lines.

² Points 3, 4, 5, 7 and 9 all edit `updateCase` in `visaCase.service.ts` (one pre-update
read, `BEFORE_UPDATE_SELECT` and the `needsContext` list are shared by design), and most add
tests to the end of `visaCase.service.test.ts`. Git sees adjacent hunks, not real logic
clashes. To take one of these out alone, either revert newest-first down to it and re-apply
the later ones with `git cherry-pick`, or resolve by hand. The conflicts are always "keep the
other points' lines, drop this point's".

## Database migrations

All five are additive (new columns, a new table, new enum values), and each backfills
existing rows in the same file. A `git revert` does **not** undo a migration. The columns
stay on the database, which is harmless because they are nullable or defaulted. Notes:

- `…120000_add_appointment_paid_by`: backfills `AGENCY` only where an appointment cost
  exists. Everything else stays NULL, meaning "not recorded".
- `…130000_add_case_status_timestamps`: adds `MISSED` to `AppointmentStatus`. Postgres cannot
  drop an enum value, so a revert of #7 leaves `MISSED` in the type, unused. Past-month
  timestamps are **approximations** from `updatedAt`; completed cases use the invoice date,
  which is exact.
- `…160000_add_case_received_date`: first case per client = the client's received date,
  later cases = the day they were opened (`date_trunc('day', createdAt)`, UTC).

Deploy with `npx prisma migrate deploy` as usual.

## Things a revert would also undo

Fixed or added in passing rather than asked for, so worth knowing before pulling a point:

- **#5** also renamed the invoice line item "Appointment Docs" → "Appointment" for invoices
  created from now on (issued invoices keep their snapshot).
- **#6** also lets the File Team role upload and delete documents (routes accept
  `files:write` / `files:read`), and serves non-PDF/image files as downloads.
- **#7** also stamps `cancelledAt` on the duplicate auto-cancel and `completedAt` on
  invoice-and-complete.
- **#10** also switched the dashboard "Recent Clients" list to newest case per client, and
  made a client's received-date correction carry over to their first case.

## Verified at the last commit

Backend `tsc` clean, 153 tests passing. Frontend `tsc` clean, 21 tests passing, `vite build`
succeeds. A 23-step API smoke run against the real database (lock contention, waiver
creation, payer gate, date clearing, FP lock, Super Admin reversal + HR note, returning-client
case date, ordering, MISSED + monthly report, validation) passed. The test client it created
was deleted afterwards.
