import { prisma } from '../config/database';

// Numbering (16 Oct 2026). A number freed by grouping is handed out again before the
// counter moves on; otherwise it is MAX+1.
//
// Every member of a group shares ONE number (CL-942-G1-01, CL-942-G1-02, ...), so an existing
// client who joins a group gives up its own number. Without reuse that number would sit
// empty forever and the sequence would look like it skipped (942 -> 947), which is what the
// client reported on 8 Sep. So such numbers go into client_number_pool (releaseClientNumber)
// and the next brand-new client takes the lowest of them. Only grouping feeds the pool:
// numbers left by deleted clients, or gaps in imported history, are never refilled, so
// nobody is handed a number from deep in the past.
//
// The MAX+1 fallback keeps the numeric CAST (rather than a lexicographic ORDER BY), which is
// load-bearing: imported clientRefs (e.g. CL-9000, carried over as-is, see
// bulkImportClients) sort before CL-101 as strings, so a string MAX would under-report the
// high-water mark and hand out a number that collides with a ref already in the table. The
// pattern matches both a plain "CL-105" and a group-formatted "CL-105-G1-01".
export const generateClientRef = async (): Promise<string> => {
  // The lowest pooled number nobody carries any more. DELETE ... RETURNING with SKIP LOCKED,
  // so two clients created at the same moment never draw the same number.
  const reused = await prisma.$queryRaw<{ number: number }[]>`
    DELETE FROM "client_number_pool" WHERE "number" = (
      SELECT p."number" FROM "client_number_pool" p
      WHERE NOT EXISTS (SELECT 1 FROM "clients" c WHERE c."clientRefNum" = p."number")
      ORDER BY p."number" LIMIT 1 FOR UPDATE SKIP LOCKED
    ) RETURNING "number"
  `;
  if (reused.length > 0) return `CL-${reused[0].number}`;

  // COALESCE(..., 99) + 1 so an empty table yields exactly 100, the base of the sequence.
  const [{ next }] = await prisma.$queryRaw<{ next: number }[]>`
    SELECT COALESCE(MAX(CAST(SUBSTRING("clientRef" FROM '^CL-(\\d+)') AS INTEGER)), 99) + 1 AS next
    FROM "clients"
    WHERE "clientRef" ~ '^CL-\\d+'
  `;
  return `CL-${next}`;
};

/**
 * Offer a number back for reuse once no client carries it any more. Call AFTER the write that
 * stopped using it (clientRefNum is derived from the stored ref). A number another client
 * still holds — e.g. a group number the remaining members keep — is simply not added.
 */
export const releaseClientNumber = async (number: number | null | undefined): Promise<void> => {
  if (number == null) return;
  await prisma.$executeRaw`
    INSERT INTO "client_number_pool" ("number")
    SELECT ${number}
    WHERE NOT EXISTS (SELECT 1 FROM "clients" WHERE "clientRefNum" = ${number})
    ON CONFLICT ("number") DO NOTHING
  `;
};

// Group members are id'd like CL-942-G1-01, CL-942-G1-02 — ONE number shared by the whole
// group (its first member's), a short form of the group's own immutable groupRef ("GRP-001"
// -> "G1", so renaming the group never touches member refs), and a 1-based member position
// (zero-padded to 2 digits) that's assigned once and never renumbered (append-only). Only
// the position differs between members. This is the original format: Sep 2026 briefly gave
// each member a number of its own, and 16 Oct 2026 restored the shared one at the client's
// request — see generateClientRef for how the skipped-number problem is avoided.
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

// `number` is the group's shared number; `memberIndex` is the member's position.
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

// The number a ref carries, grouped or standalone. null only for a ref in no recognized
// format at all — or no ref yet, i.e. a brand-new client.
export const refNumber = (ref?: string | null): number | null => {
  if (!ref) return null;
  const grouped = matchGroupedRef(ref);
  if (grouped) return grouped.number;
  const plain = ref.match(PLAIN_REF_RE);
  return plain ? parseInt(plain[1], 10) : null;
};

const mintNumber = async (): Promise<number> =>
  parseInt((await generateClientRef()).replace('CL-', ''), 10);

// The ref a client should carry as position `memberIndex` of `groupRef`. It takes the group's
// shared number (`groupNumber`, from backfillGroupMembers). Only the first member of an empty
// group brings a number of its own: the one it already holds, or a fresh one for a brand-new
// client. A joining client whose own number is given up should have it released
// (releaseClientNumber) once the new ref is saved.
export const groupRefForMember = async (
  currentRef: string | null | undefined,
  groupRef: string,
  memberIndex: number,
  groupNumber: number | null,
): Promise<string> => {
  const number = groupNumber ?? refNumber(currentRef) ?? (await mintNumber());
  return buildGroupRef(number, groupRef, memberIndex);
};

// The ref a member reverts to when it leaves a group. The group's number is shared, so the
// leaver keeps it only if nobody else still carries it (the last member out, or the first
// member when a group is disbanded — see deleteGroup). Everyone else gets a number of their
// own: a pooled one if any, otherwise the next in sequence.
export const ungroupedRef = async (currentRef: string | null | undefined, clientId: string): Promise<string> => {
  const number = refNumber(currentRef);
  if (number == null) return generateClientRef();
  const sharedWith = await prisma.client.findFirst({
    where: { clientRefNum: number, id: { not: clientId } }, select: { id: true },
  });
  return sharedWith ? generateClientRef() : `CL-${number}`;
};

// The group's shared number: that of its first member by position (or, for a group whose
// members still carry plain refs, the lowest of those). null when no member has a number.
export const settleGroupNumber = (refs: string[]): number | null => {
  const grouped = refs
    .map(matchGroupedRef)
    .filter((g): g is { number: number; position: number } => !!g)
    .sort((a, b) => a.position - b.position || a.number - b.number);
  if (grouped.length) return grouped[0].number;
  const plain = refs
    .map((r) => r.match(PLAIN_REF_RE))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => parseInt(m[1], 10));
  return plain.length ? Math.min(...plain) : null;
};

// Puts every member of a group on the one shared number and the current format, keeping each
// member's position. Reconciles what shows up in practice: members still on a plain CL-###,
// members on a legacy grouped format, members that came from another group, and groups from
// Sep–Oct 2026 whose members each kept a number of their own. Any number a member gives up is
// released for reuse, so grouping never leaves a visible gap in the sequence.
// Called whenever a group is touched (adding members, renaming). Returns the group number
// (null for an empty group) for the caller to stamp new members with.
export const backfillGroupMembers = async (groupId: string, groupRef: string): Promise<number | null> => {
  const members = await prisma.client.findMany({
    where: { groupId }, select: { id: true, clientRef: true }, orderBy: { createdAt: 'asc' },
  });
  if (members.length === 0) return null;
  const groupNumber = settleGroupNumber(members.map((m) => m.clientRef)) ?? (await mintNumber());

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

  // Pass 2 — rewrite, then release whatever numbers were given up. Unchanged refs are
  // skipped, so a rename of an already-consistent group writes nothing.
  const released = new Set<number>();
  for (const m of members) {
    const position = kept.get(m.id) ?? nextFreePosition();
    const newRef = buildGroupRef(groupNumber, groupRef, position);
    if (newRef !== m.clientRef) {
      await prisma.client.update({ where: { id: m.id }, data: { clientRef: newRef } });
      const own = refNumber(m.clientRef);
      if (own != null && own !== groupNumber) released.add(own);
    }
  }
  for (const n of released) await releaseClientNumber(n);

  return groupNumber;
};

// Next append-only member position for a group: one past the highest position in use, not
// count+1 — a group that has lost a member (removeMember) has fewer members than its
// highest position, and count+1 would hand out a position that is already taken.
export const nextMemberIndex = async (groupId: string): Promise<number> => {
  const members = await prisma.client.findMany({ where: { groupId }, select: { clientRef: true } });
  const positions = members.map((m) => matchGroupedRef(m.clientRef)?.position ?? 0);
  return Math.max(0, ...positions) + 1;
};
