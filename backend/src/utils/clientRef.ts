import { prisma } from '../config/database';

// Forward-only numbering: MAX+1, never a gap scan. A number handed to a client is that
// client's for good — it is never re-issued to a different person, even after the client
// is deleted, grouped or ungrouped. Gaps are therefore acceptable and expected (a deleted
// CL-943 leaves 943 empty forever); what is NOT acceptable is the sequence appearing to
// skip while every number is still in use, which was the reported "942 jumps to 945" bug.
// That is fixed at the other end: backfillGroupMembers no longer rewrites a member's
// number when it joins a group (see below), so grouping strands nothing and MAX+1 lands on
// the number right after the highest one actually issued.
// The numeric CAST (rather than a lexicographic ORDER BY) is load-bearing: imported
// clientRefs (e.g. CL-9000, carried over as-is, see bulkImportClients) sort before CL-101
// as strings, so a string MAX would under-report the high-water mark and hand out a number
// that collides with a ref already in the table. The pattern matches both a plain "CL-105"
// and a group-formatted "CL-105-G1-01" (see below) so a number already claimed by a group
// member is counted too.
export const generateClientRef = async (): Promise<string> => {
  // COALESCE(..., 99) + 1 so an empty table yields exactly 100, the base of the sequence.
  const [{ next }] = await prisma.$queryRaw<{ next: number }[]>`
    SELECT COALESCE(MAX(CAST(SUBSTRING("clientRef" FROM '^CL-(\\d+)') AS INTEGER)), 99) + 1 AS next
    FROM "clients"
    WHERE "clientRef" ~ '^CL-\\d+'
  `;
  return `CL-${next}`;
};

// Group members are id'd like CL-942-G1-01, CL-945-G1-02 — each member keeps its OWN
// number (the one it was issued as a standalone client), a short form of the group's own
// immutable groupRef ("GRP-001" -> "G1", so renaming the group never touches member refs),
// and a 1-based position (zero-padded to 2 digits) that's assigned once and never
// renumbered (append-only). The group identity lives entirely in the G<n> segment, so
// numbers stay per-person and nothing is stranded by grouping.
export const GROUPED_REF_RE = /^CL-(\d+)-G\d+-(\d+)$/;
// Refs written by earlier ref-format cuts: the original sanitized-group-name format
// (e.g. CL-105-Khan-1) and the first numbered-group format that spelled out the full
// "GRP-<digits>" segment (e.g. CL-105-GRP-001-1). Both are still recognized on read so a
// group touched again after a format switch keeps its number/positions instead of minting
// fresh ones; buildGroupRef only ever writes the current format, so these upgrade in place
// the next time backfillGroupMembers runs on their group.
const LEGACY_GRP_REF_RE = /^CL-(\d+)-GRP-\d+-(\d+)$/;
const LEGACY_NAME_GROUPED_REF_RE = /^CL-(\d+)-[A-Za-z0-9]+-(\d+)$/;
export const PLAIN_REF_RE = /^CL-(\d+)$/;

// `number` is the MEMBER's own number, not one shared by the group — every member carries
// a different one. Only the G<n> segment is common to the whole group.
export const buildGroupRef = (number: number, groupRef: string, memberIndex: number) => {
  const groupSeq = parseInt(groupRef.replace(/^GRP-/, ''), 10);
  return `CL-${number}-G${groupSeq}-${String(memberIndex).padStart(2, '0')}`;
};

// Current format first, then the two legacy ones. Order matters: the name-based legacy
// pattern would also match a current ref, since "G1" is alphanumeric.
export const matchGroupedRef = (ref: string): { number: number; position: number } | null => {
  const current = ref.match(GROUPED_REF_RE);
  if (current) return { number: parseInt(current[1], 10), position: parseInt(current[2], 10) };
  const legacyGrp = ref.match(LEGACY_GRP_REF_RE);
  if (legacyGrp) return { number: parseInt(legacyGrp[1], 10), position: parseInt(legacyGrp[2], 10) };
  const legacy = ref.match(LEGACY_NAME_GROUPED_REF_RE);
  if (legacy) return { number: parseInt(legacy[1], 10), position: parseInt(legacy[2], 10) };
  return null;
};

// The number a client already owns, grouped or standalone. null only for a ref in no
// recognized format at all — or no ref yet, i.e. a brand-new client.
export const refNumber = (ref?: string | null): number | null => {
  if (!ref) return null;
  const grouped = matchGroupedRef(ref);
  if (grouped) return grouped.number;
  const plain = ref.match(PLAIN_REF_RE);
  return plain ? parseInt(plain[1], 10) : null;
};

const mintNumber = async (): Promise<number> =>
  parseInt((await generateClientRef()).replace('CL-', ''), 10);

// The ref a client should carry as position `memberIndex` of `groupRef`. It keeps the
// number it already owns (standalone, or carried over from a previous group) — grouping
// never reassigns a number — and only a brand-new client with no ref yet mints one.
export const groupRefForMember = async (
  currentRef: string | null | undefined,
  groupRef: string,
  memberIndex: number,
): Promise<string> => {
  const number = refNumber(currentRef) ?? (await mintNumber());
  return buildGroupRef(number, groupRef, memberIndex);
};

// The ref a member reverts to when it leaves a group: its own number, unadorned. No new
// number is consumed and none is churned, because that number was always this client's.
// The collision lookup covers exactly one case — groups formed under the old shared-number
// scheme, where several members legitimately carry the SAME number (CL-942-G1-01 and
// CL-942-G1-02 side by side). Only the first of those can take CL-942 back; the rest fall
// through to a fresh number. For anything written under the current scheme the lookup
// always misses, since a number appears in at most one ref.
export const ungroupedRef = async (currentRef: string | null | undefined): Promise<string> => {
  const number = refNumber(currentRef);
  if (number == null) return generateClientRef();
  const plain = `CL-${number}`;
  const taken = await prisma.client.findFirst({ where: { clientRef: plain }, select: { id: true } });
  return taken ? generateClientRef() : plain;
};

// Brings every member of a group onto the current ref format without ever changing a
// member's number. Reconciles the shapes that show up in practice: members still carrying
// a plain CL-### (never touched since the group was formed), members on one of the legacy
// grouped formats, and members that arrived from another group. Called whenever a group is
// touched (adding members, renaming) so legacy refs upgrade in place instead of new members
// being stamped in a format the existing ones don't share — see the CL-110-Anewgroup-4 vs
// CL-111/112/113 split this was originally fixing.
// Positions are per-group and append-only; numbers are per-member and never rewritten, so
// this strands nothing and generateClientRef's MAX+1 can't skip a live number.
// Returns the number a brand-new, numberless member would take next (MAX+1 as of after
// this reconciliation) — the only thing callers still need from here, now that there is no
// such thing as a settled group number.
export const backfillGroupMembers = async (groupId: string, groupRef: string): Promise<number> => {
  const members = await prisma.client.findMany({
    where: { groupId }, select: { id: true, clientRef: true }, orderBy: { createdAt: 'asc' },
  });

  // Pass 1 — reserve positions. A member already in a grouped format keeps its position
  // (append-only), including one carried in from another group. First member in join order
  // wins a contested position; the loser is reassigned in pass 2.
  const taken = new Set<number>();
  const kept = new Map<string, number>();
  for (const m of members) {
    const grouped = matchGroupedRef(m.clientRef);
    if (grouped && !taken.has(grouped.position)) {
      taken.add(grouped.position);
      kept.set(m.id, grouped.position);
    }
  }
  let cursor = 1;
  const nextFreePosition = () => {
    while (taken.has(cursor)) cursor++;
    taken.add(cursor);
    return cursor;
  };

  // Pass 2 — rewrite. Sequential on purpose: a member whose ref is in no recognized format
  // mints a number, and that write has to land before the next mint reads MAX again.
  for (const m of members) {
    const position = kept.get(m.id) ?? nextFreePosition();
    const number = refNumber(m.clientRef) ?? (await mintNumber());
    const newRef = buildGroupRef(number, groupRef, position);
    // Unchanged refs are skipped, so a rename is a no-op and only genuinely stale members
    // (plain, legacy-format, or moved group) are written.
    if (newRef !== m.clientRef) {
      await prisma.client.update({ where: { id: m.id }, data: { clientRef: newRef } });
    }
  }

  return mintNumber();
};

// Next append-only member position for a group: one past the highest position in use, not
// count+1 — a group that has lost a member (removeMember) has fewer members than its
// highest position, and count+1 would hand out a position that is already taken.
export const nextMemberIndex = async (groupId: string): Promise<number> => {
  const members = await prisma.client.findMany({ where: { groupId }, select: { clientRef: true } });
  const positions = members.map((m) => matchGroupedRef(m.clientRef)?.position ?? 0);
  return Math.max(0, ...positions) + 1;
};
