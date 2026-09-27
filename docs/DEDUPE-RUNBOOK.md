# Merging duplicate client profiles — runbook

Some clients exist two or three times over, because nothing checked passport numbers until
the duplicate-passport warning shipped. That warning prevents *new* duplicates; it does
nothing about the ones already on file, where one person's applications are split across
several half-complete profiles.

`npm run clients:dedupe` merges them. **It is a dry run unless you pass `--apply`.**

## What a merge actually does

Per duplicate group, inside a single transaction:

1. every visa case moves to the survivor
2. every document moves to the survivor
3. blank fields on the survivor are filled from the duplicates — **never** overwriting
   anything already filled in, newest duplicate winning among the blanks
4. a dated note is appended to the survivor's HR comments naming the profiles merged in
5. the duplicate rows are deleted

Steps 1 and 2 happen **before** step 5 on purpose. Cases and documents cascade-delete with
their client, so deleting a duplicate first would destroy exactly the history being
preserved. The script counts cases and documents before and after and fails loudly if
either number moves.

**The survivor** is the profile with the lowest client number — the original record, i.e.
the "master Client ID". Its reference is the one that stays; the duplicates' numbers are
retired and, under forward-only numbering, never reissued.

## What it refuses to touch

A group is merged automatically **only** when every member agrees on name and date of
birth and none of them sit in different client groups. Anything else is reported and left
completely alone, because two real people can share a mistyped passport and merging them
would be far worse than leaving the duplicate. Those are listed under
`NEEDS A HUMAN, LEFT UNTOUCHED` and have to be resolved by someone who knows the clients.

## Running it

```bash
# 1. On the server, from the current release's backend directory.
cd /opt/manzil/current/backend

# 2. BACK UP FIRST. This deletes rows; there is no undo.
pg_dump "$DATABASE_URL" > ~/manzil-before-dedupe-$(date +%Y%m%d%H%M).sql

# 3. Dry run. Read the output properly — it names every profile it would remove.
npm run clients:dedupe

# 4. Only when the plan is right:
npm run clients:dedupe -- --apply
```

Each run also writes `dedupe-report-*.json` next to the working directory with the full
plan, including the groups it declined to touch. Keep it — it is the record of what
happened to which client reference.

## Afterwards

The merged client shows every case on their profile page, and each case still appears as
its own row in the stage listings — one row per application, which is what the workflow
expects. Nothing else needs doing.

If something looks wrong, restore the dump from step 2. That is the only rollback: the
script does not keep the deleted rows anywhere.

## Checking first, without changing anything

The dry run is safe to run as often as you like, including on production, and is the
quickest way to see the scale of the problem:

```
  duplicate passports found : 12
  auto-mergeable groups     : 9
  left for review           : 3
  profiles that would go    : 11
  cases that would move     : 14
```
