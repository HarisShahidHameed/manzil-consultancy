/**
 * Merges client profiles that were created twice (or more) for the same person, keyed on
 * passport number.
 *
 * These exist because nothing checked passports until the duplicate-passport warning
 * shipped (see docs/CHANGES-sep-2026.md). That warning stops NEW duplicates; it does
 * nothing about the ones already on file, where one person's applications are split across
 * several half-complete profiles.
 *
 * DRY RUN BY DEFAULT. It prints exactly what it would do and writes a JSON report; nothing
 * is written to the database unless you pass --apply.
 *
 *   npm run clients:dedupe            # report only
 *   npm run clients:dedupe -- --apply # actually merge
 *
 * What a merge does, per group, inside ONE transaction:
 *   1. every visa case moves to the survivor   <- MUST happen before the delete, because
 *   2. every document moves to the survivor       VisaCase/ClientDocument cascade-delete
 *   3. blank fields on the survivor are filled     with their client
 *      from the duplicates (never overwritten)
 *   4. a note is appended to the survivor's HR comments recording the merge
 *   5. the duplicate rows are deleted
 *
 * Deliberately conservative: a group is only merged automatically when every member agrees
 * on name and date of birth and they are not spread across different client groups.
 * Anything else is reported for a human to look at and left completely alone — two real
 * people can share a mistyped passport, and merging them would be far worse than leaving
 * the duplicate.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { appendHrComment } from '../src/utils/hrComments';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

// Same normalisation the passport lookup uses, so the script and the live warning agree on
// what counts as "the same passport".
const normPassport = (v?: string | null) => (v ?? '').trim().toUpperCase();
const normName = (f?: string | null, l?: string | null) =>
  `${(f ?? '').trim()} ${(l ?? '').trim()}`.replace(/\s+/g, ' ').toLowerCase();
const dayOf = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

const CANDIDATE_SELECT = {
  id: true, clientRef: true, clientRefNum: true, groupId: true,
  firstName: true, lastName: true, dob: true, passportNumber: true,
  receivedDate: true, createdAt: true, hrComments: true,
  _count: { select: { visaCases: true, documents: true } },
} satisfies Prisma.ClientSelect;

type Candidate = Prisma.ClientGetPayload<{ select: typeof CANDIDATE_SELECT }>;

/** Fields worth carrying over from a duplicate when the survivor's copy is blank. */
const FILLABLE = [
  'lastName', 'gender', 'dob', 'email', 'whatsapp', 'availability',
  'addressStreet', 'addressCity', 'addressShire', 'addressPostalCode', 'addressCountry',
  'passportIssue', 'passportExpiry', 'birthCity', 'nationality', 'maritalStatus',
  'previousSchengenVisa', 'registeredEmail', 'visaAndTravelHistory',
  'source', 'referredBy', 'folderUrl',
] as const;

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

async function main() {
  console.log(APPLY ? '=== MERGE (APPLYING CHANGES) ===' : '=== MERGE DRY RUN (no changes will be written) ===');

  const casesBefore = await prisma.visaCase.count();
  const docsBefore = await prisma.clientDocument.count();
  const clientsBefore = await prisma.client.count();

  const all = await prisma.client.findMany({
    where: { passportNumber: { not: null } },
    select: CANDIDATE_SELECT,
  });

  // Group by normalised passport. Done in JS rather than SQL so the normalisation is
  // provably identical to the one the application uses.
  const byPassport = new Map<string, Candidate[]>();
  for (const c of all) {
    const key = normPassport(c.passportNumber);
    if (!key) continue;
    (byPassport.get(key) ?? byPassport.set(key, []).get(key)!).push(c);
  }

  const groups = [...byPassport.entries()].filter(([, members]) => members.length > 1);

  const mergeable: { passport: string; survivor: Candidate; duplicates: Candidate[] }[] = [];
  const needsReview: { passport: string; reason: string; members: Candidate[] }[] = [];

  for (const [passport, members] of groups) {
    const names = new Set(members.map(m => normName(m.firstName, m.lastName)));
    const dobs = new Set(members.map(m => dayOf(m.dob)).filter(Boolean) as string[]);
    const groupIds = new Set(members.map(m => m.groupId).filter(Boolean) as string[]);

    if (names.size > 1) {
      needsReview.push({ passport, reason: `different names: ${[...names].join(' | ')}`, members });
      continue;
    }
    if (dobs.size > 1) {
      needsReview.push({ passport, reason: `conflicting dates of birth: ${[...dobs].join(' | ')}`, members });
      continue;
    }
    if (groupIds.size > 1) {
      needsReview.push({ passport, reason: 'members belong to different client groups', members });
      continue;
    }

    // The survivor is the lowest client number — the original profile, i.e. the "master
    // Client ID" the requirement doc refers to. createdAt breaks a tie for refs with no
    // number at all.
    const ordered = [...members].sort((a, b) => {
      const an = a.clientRefNum ?? Number.MAX_SAFE_INTEGER;
      const bn = b.clientRefNum ?? Number.MAX_SAFE_INTEGER;
      return an !== bn ? an - bn : a.createdAt.getTime() - b.createdAt.getTime();
    });
    mergeable.push({ passport, survivor: ordered[0], duplicates: ordered.slice(1) });
  }

  const label = (c: Candidate) =>
    `${c.clientRef} (${c.firstName} ${c.lastName ?? ''}`.trim() +
    `, ${c._count.visaCases} case${c._count.visaCases === 1 ? '' : 's'}` +
    `, ${c._count.documents} doc${c._count.documents === 1 ? '' : 's'})`;

  console.log(`\nScanned ${clientsBefore} clients — ${groups.length} passport(s) held by more than one profile.\n`);

  console.log(`--- WILL MERGE: ${mergeable.length} group(s) ---`);
  for (const g of mergeable) {
    const movingCases = g.duplicates.reduce((n, d) => n + d._count.visaCases, 0);
    const movingDocs = g.duplicates.reduce((n, d) => n + d._count.documents, 0);
    console.log(`\n  passport ${g.passport}`);
    console.log(`    keep    ${label(g.survivor)}`);
    for (const d of g.duplicates) console.log(`    merge   ${label(d)}`);
    console.log(`    -> moves ${movingCases} case(s) and ${movingDocs} document(s) onto ${g.survivor.clientRef}`);
  }

  console.log(`\n--- NEEDS A HUMAN, LEFT UNTOUCHED: ${needsReview.length} group(s) ---`);
  for (const g of needsReview) {
    console.log(`\n  passport ${g.passport} — ${g.reason}`);
    for (const m of g.members) console.log(`    ${label(m)}`);
  }

  const totals = {
    scannedClients: clientsBefore,
    duplicateGroups: groups.length,
    autoMergeable: mergeable.length,
    needsReview: needsReview.length,
    profilesRemoved: mergeable.reduce((n, g) => n + g.duplicates.length, 0),
    casesMoved: mergeable.reduce((n, g) => n + g.duplicates.reduce((m, d) => m + d._count.visaCases, 0), 0),
    documentsMoved: mergeable.reduce((n, g) => n + g.duplicates.reduce((m, d) => m + d._count.documents, 0), 0),
  };

  const report = {
    generatedAt: new Date().toISOString(),
    applied: APPLY,
    totals,
    merges: mergeable.map(g => ({
      passport: g.passport,
      survivor: g.survivor.clientRef,
      merged: g.duplicates.map(d => d.clientRef),
      casesMoved: g.duplicates.reduce((n, d) => n + d._count.visaCases, 0),
      documentsMoved: g.duplicates.reduce((n, d) => n + d._count.documents, 0),
    })),
    needsReview: needsReview.map(g => ({
      passport: g.passport,
      reason: g.reason,
      members: g.members.map(m => ({ clientRef: m.clientRef, name: `${m.firstName} ${m.lastName ?? ''}`.trim(), cases: m._count.visaCases })),
    })),
  };

  const reportPath = path.join(process.cwd(), `dedupe-report-${APPLY ? 'applied' : 'dryrun'}-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log(`  duplicate passports found : ${totals.duplicateGroups}`);
  console.log(`  auto-mergeable groups     : ${totals.autoMergeable}`);
  console.log(`  left for review           : ${totals.needsReview}`);
  console.log(`  profiles that would go    : ${totals.profilesRemoved}`);
  console.log(`  cases that would move     : ${totals.casesMoved}`);
  console.log(`  documents that would move : ${totals.documentsMoved}`);
  console.log('='.repeat(60));
  console.log(`\nReport written to ${reportPath}`);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing was changed. Re-run with --apply once the plan above looks right.');
    return;
  }

  for (const g of mergeable) {
    await prisma.$transaction(async (tx) => {
      const dupIds = g.duplicates.map(d => d.id);

      // Cases and documents move FIRST. Both cascade-delete with their client, so deleting
      // a duplicate before reassigning would destroy exactly the history we are trying to
      // preserve.
      await tx.visaCase.updateMany({ where: { clientId: { in: dupIds } }, data: { clientId: g.survivor.id } });
      await tx.clientDocument.updateMany({ where: { clientId: { in: dupIds } }, data: { clientId: g.survivor.id } });

      // Fill gaps on the survivor from the duplicates, newest duplicate first so the most
      // recent information wins among the blanks. Never overwrites anything already set.
      const full = await tx.client.findMany({
        where: { id: { in: [g.survivor.id, ...dupIds] } },
      });
      const survivorRow = full.find(f => f.id === g.survivor.id)!;
      const dupRows = full
        .filter(f => f.id !== g.survivor.id)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      const patch: Record<string, unknown> = {};
      for (const field of FILLABLE) {
        if (!isBlank((survivorRow as any)[field])) continue;
        const donor = dupRows.find(d => !isBlank((d as any)[field]));
        if (donor) patch[field] = (donor as any)[field];
      }
      if (!survivorRow.groupId) {
        const donor = dupRows.find(d => d.groupId);
        if (donor) patch.groupId = donor.groupId;
      }

      const mergedRefs = g.duplicates.map(d => d.clientRef).join(', ');
      patch.hrComments = appendHrComment(
        survivorRow.hrComments,
        'Merge',
        `Merged duplicate profile(s) ${mergedRefs} into this record (same passport ${g.passport}). ` +
        `Their cases and documents now live here.`,
      );

      await tx.client.update({ where: { id: g.survivor.id }, data: patch as Prisma.ClientUpdateInput });
      await tx.client.deleteMany({ where: { id: { in: dupIds } } });
    });

    console.log(`  merged ${g.duplicates.map(d => d.clientRef).join(', ')} -> ${g.survivor.clientRef}`);
  }

  // The whole point of the exercise: no case or document may be lost.
  const casesAfter = await prisma.visaCase.count();
  const docsAfter = await prisma.clientDocument.count();
  const clientsAfter = await prisma.client.count();

  console.log('\n--- verification ---');
  console.log(`  visa cases      ${casesBefore} -> ${casesAfter}   ${casesAfter === casesBefore ? 'OK' : 'MISMATCH'}`);
  console.log(`  documents       ${docsBefore} -> ${docsAfter}   ${docsAfter === docsBefore ? 'OK' : 'MISMATCH'}`);
  console.log(`  clients         ${clientsBefore} -> ${clientsAfter}  (-${clientsBefore - clientsAfter} duplicates)`);

  if (casesAfter !== casesBefore || docsAfter !== docsBefore) {
    console.error('\nCASE OR DOCUMENT COUNT CHANGED — investigate before trusting this run.');
    process.exitCode = 1;
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
