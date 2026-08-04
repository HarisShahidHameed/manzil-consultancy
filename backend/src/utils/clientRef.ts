import { prisma } from '../config/database';

// Numeric max rather than a lexicographic ORDER BY — imported clientRefs (e.g. CL-9000,
// carried over as-is, see bulkImportClients) sort before CL-101 as strings, which would
// make findFirst({ orderBy: clientRef desc }) miss the true high-water mark and hand out
// a ref that collides with one already imported. The pattern matches both a plain
// "CL-105" and a group-formatted "CL-105-Khan-1" (see below) so a number already
// claimed by a group isn't handed out again to a new standalone client.
export const generateClientRef = async (): Promise<string> => {
  const [{ max }] = await prisma.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING("clientRef" FROM '^CL-(\\d+)') AS INTEGER)) AS max
    FROM "clients"
    WHERE "clientRef" ~ '^CL-\\d+'
  `;
  const num = max != null ? max + 1 : 100;
  return `CL-${num}`;
};

// Group members are id'd like CL-105-Khan-1, CL-105-Khan-2 — same shared number for
// every member of the group, the (sanitized) group name, and a 1-based position that's
// assigned once and never renumbered (append-only), mirroring the legacy system.
export const GROUPED_REF_RE = /^CL-(\d+)-[A-Za-z0-9]+-(\d+)$/;
export const PLAIN_REF_RE = /^CL-(\d+)$/;

export const sanitizeGroupName = (name: string) => name.trim().replace(/[^a-zA-Z0-9]+/g, '') || 'GROUP';

export const buildGroupRef = (number: number, groupName: string, memberIndex: number) =>
  `CL-${number}-${sanitizeGroupName(groupName)}-${memberIndex}`;

// The whole group shares one number. Reconciles two situations that both show up on
// groups formed before this ref format existed: members still carrying a plain CL-###
// (never touched since), and members already grouped under a number. Called whenever a
// group is touched (adding members, renaming) so legacy plain refs get backfilled to the
// group format instead of new members picking up a mismatched number of their own — see
// the CL-110-Anewgroup-4 vs CL-111/112/113 split this was fixing.
// Returns the settled group number; existing members are updated in place as needed.
export const backfillGroupMembers = async (groupId: string, groupName: string): Promise<number> => {
  const members = await prisma.client.findMany({
    where: { groupId }, select: { id: true, clientRef: true }, orderBy: { createdAt: 'asc' },
  });

  // Prefer a number already embedded in a grouped ref; otherwise the lowest plain
  // number among current members (stable regardless of join order); otherwise mint one.
  let groupNumber: number | null = null;
  for (const m of members) {
    const grouped = m.clientRef.match(GROUPED_REF_RE);
    if (grouped) { groupNumber = parseInt(grouped[1], 10); break; }
  }
  if (groupNumber == null) {
    const plainNumbers = members
      .map((m) => m.clientRef.match(PLAIN_REF_RE))
      .filter((match): match is RegExpMatchArray => !!match)
      .map((match) => parseInt(match[1], 10));
    if (plainNumbers.length) groupNumber = Math.min(...plainNumbers);
  }
  if (groupNumber == null) {
    const fresh = await generateClientRef();
    groupNumber = parseInt(fresh.replace('CL-', ''), 10);
  }

  // Members already on the settled number keep their existing (append-only) position;
  // everyone else — plain refs, or a stale number from a prior group — claims the next
  // free position in join order.
  const takenPositions = new Set<number>();
  for (const m of members) {
    const grouped = m.clientRef.match(GROUPED_REF_RE);
    if (grouped && parseInt(grouped[1], 10) === groupNumber) takenPositions.add(parseInt(grouped[2], 10));
  }
  let cursor = 1;
  const nextFreePosition = () => {
    while (takenPositions.has(cursor)) cursor++;
    takenPositions.add(cursor);
    return cursor;
  };

  for (const m of members) {
    const grouped = m.clientRef.match(GROUPED_REF_RE);
    // Position is append-only: reuse it when this member is already on the settled
    // number, otherwise claim the next free slot. The ref is always rebuilt (even for
    // members already on the right number/position) so a rename picks up every member.
    const position = grouped && parseInt(grouped[1], 10) === groupNumber
      ? parseInt(grouped[2], 10)
      : nextFreePosition();
    const newRef = buildGroupRef(groupNumber, groupName, position);
    if (newRef !== m.clientRef) {
      await prisma.client.update({ where: { id: m.id }, data: { clientRef: newRef } });
    }
  }

  return groupNumber;
};

// Next append-only member position for a group.
export const nextMemberIndex = async (groupId: string): Promise<number> =>
  (await prisma.client.count({ where: { groupId } })) + 1;
