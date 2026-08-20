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

// Group members are id'd like CL-105-G1-01, CL-105-G1-02 — same shared number for every
// member of the group, a short form of the group's own immutable groupRef ("GRP-001" ->
// "G1", so renaming the group never touches member refs), and a 1-based position
// (zero-padded to 2 digits) that's assigned once and never renumbered (append-only),
// mirroring the legacy system.
export const GROUPED_REF_RE = /^CL-(\d+)-G\d+-(\d+)$/;
// Refs written by earlier ref-format cuts: the original sanitized-group-name format
// (e.g. CL-105-Khan-1) and the first numbered-group format that spelled out the full
// "GRP-<digits>" segment (e.g. CL-105-GRP-001-1). Both are still recognized on read so a
// group touched again after a format switch keeps its original number/positions instead
// of minting fresh ones; buildGroupRef only ever writes the current format, so these
// upgrade in place the next time backfillGroupMembers runs on their group.
const LEGACY_GRP_REF_RE = /^CL-(\d+)-GRP-\d+-(\d+)$/;
const LEGACY_NAME_GROUPED_REF_RE = /^CL-(\d+)-[A-Za-z0-9]+-(\d+)$/;
export const PLAIN_REF_RE = /^CL-(\d+)$/;

export const buildGroupRef = (number: number, groupRef: string, memberIndex: number) => {
  const groupSeq = parseInt(groupRef.replace(/^GRP-/, ''), 10);
  return `CL-${number}-G${groupSeq}-${String(memberIndex).padStart(2, '0')}`;
};

const matchGroupedRef = (ref: string): { number: number; position: number } | null => {
  const current = ref.match(GROUPED_REF_RE);
  if (current) return { number: parseInt(current[1], 10), position: parseInt(current[2], 10) };
  const legacyGrp = ref.match(LEGACY_GRP_REF_RE);
  if (legacyGrp) return { number: parseInt(legacyGrp[1], 10), position: parseInt(legacyGrp[2], 10) };
  const legacy = ref.match(LEGACY_NAME_GROUPED_REF_RE);
  if (legacy) return { number: parseInt(legacy[1], 10), position: parseInt(legacy[2], 10) };
  return null;
};

// The whole group shares one number. Reconciles two situations that both show up on
// groups formed before this ref format existed: members still carrying a plain CL-###
// (never touched since), and members already grouped under a number. Called whenever a
// group is touched (adding members, renaming) so legacy plain refs get backfilled to the
// group format instead of new members picking up a mismatched number of their own — see
// the CL-110-Anewgroup-4 vs CL-111/112/113 split this was fixing.
// Returns the settled group number; existing members are updated in place as needed.
export const backfillGroupMembers = async (groupId: string, groupRef: string): Promise<number> => {
  const members = await prisma.client.findMany({
    where: { groupId }, select: { id: true, clientRef: true }, orderBy: { createdAt: 'asc' },
  });

  // Prefer a number already embedded in a grouped ref (current or legacy format);
  // otherwise the lowest plain number among current members (stable regardless of join
  // order); otherwise mint one.
  let groupNumber: number | null = null;
  for (const m of members) {
    const grouped = matchGroupedRef(m.clientRef);
    if (grouped) { groupNumber = grouped.number; break; }
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
    const grouped = matchGroupedRef(m.clientRef);
    if (grouped && grouped.number === groupNumber) takenPositions.add(grouped.position);
  }
  let cursor = 1;
  const nextFreePosition = () => {
    while (takenPositions.has(cursor)) cursor++;
    takenPositions.add(cursor);
    return cursor;
  };

  for (const m of members) {
    const grouped = matchGroupedRef(m.clientRef);
    // Position is append-only: reuse it when this member is already on the settled
    // number, otherwise claim the next free slot. The ref is always rebuilt (even for
    // members already on the right number/position, or still on the legacy name-based
    // format) so a rename picks up every member and legacy refs upgrade in place.
    const position = grouped && grouped.number === groupNumber ? grouped.position : nextFreePosition();
    const newRef = buildGroupRef(groupNumber, groupRef, position);
    if (newRef !== m.clientRef) {
      await prisma.client.update({ where: { id: m.id }, data: { clientRef: newRef } });
    }
  }

  return groupNumber;
};

// Next append-only member position for a group.
export const nextMemberIndex = async (groupId: string): Promise<number> =>
  (await prisma.client.count({ where: { groupId } })) + 1;
