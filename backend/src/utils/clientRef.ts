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

// The whole group shares one number. If the group already has members, reuse the
// number embedded in one of their refs; otherwise the given anchor client (the one
// triggering this group assignment) lends the group its existing plain CL-### number.
// If that client doesn't have a clean plain ref (already grouped elsewhere, or an odd
// imported format), a fresh number is minted instead of guessing.
export const resolveGroupNumber = async (groupId: string, anchorClientId: string): Promise<number> => {
  const existingMembers = await prisma.client.findMany({
    where: { groupId }, select: { clientRef: true },
  });
  for (const m of existingMembers) {
    const match = m.clientRef.match(GROUPED_REF_RE);
    if (match) return parseInt(match[1], 10);
  }
  const anchor = await prisma.client.findUnique({ where: { id: anchorClientId }, select: { clientRef: true } });
  const plain = anchor?.clientRef.match(PLAIN_REF_RE);
  if (plain) return parseInt(plain[1], 10);
  const fresh = await generateClientRef();
  return parseInt(fresh.replace('CL-', ''), 10);
};

// Next append-only member position for a group.
export const nextMemberIndex = async (groupId: string): Promise<number> =>
  (await prisma.client.count({ where: { groupId } })) + 1;
