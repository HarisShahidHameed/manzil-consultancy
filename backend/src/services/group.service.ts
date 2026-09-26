import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';
import { backfillGroupMembers, nextMemberIndex, groupRefForMember, ungroupedRef, matchGroupedRef } from '../utils/clientRef';

const GROUP_SELECT = {
  id: true, groupRef: true, name: true, relation: true, notes: true,
  createdAt: true, updatedAt: true,
  clients: {
    select: {
      id: true, clientRef: true, firstName: true, lastName: true, nationality: true,
      visaCases: {
        select: { id: true, destination: true, stage: true },
        orderBy: { createdAt: 'desc' as const },
      },
    },
    // Just a deterministic base order — members now keep their own numbers, so the string
    // order of clientRef no longer tracks in-group position (CL-1000-G1-03 sorts before
    // CL-942-G1-01). orderMembers below re-sorts by the parsed position; Prisma can't
    // order by a substring, so it has to happen in JS.
    orderBy: { clientRef: 'asc' as const },
  },
  _count: { select: { clients: true } },
} satisfies Prisma.ClientGroupSelect;

// Members in in-group position order (CL-942-G1-01, CL-945-G1-02, CL-1000-G1-03). Anything
// whose position doesn't parse — a plain ref on a group not backfilled yet — sinks to the
// end, tie-broken on clientRef so the order is still stable.
const orderMembers = <T extends { clients: { clientRef: string }[] }>(group: T): T => {
  group.clients.sort((a, b) => {
    const pa = matchGroupedRef(a.clientRef)?.position ?? Number.MAX_SAFE_INTEGER;
    const pb = matchGroupedRef(b.clientRef)?.position ?? Number.MAX_SAFE_INTEGER;
    return pa - pb || a.clientRef.localeCompare(b.clientRef);
  });
  return group;
};

// Forward-only MAX+1, same as generateClientRef (see utils/clientRef.ts for the full
// reasoning): a group number is never re-issued, so a deleted GRP-004 leaves a permanent
// hole rather than being handed to an unrelated family later. The numeric CAST is what
// must not be dropped — a lexicographic `orderBy: groupRef desc` on the zero-padded
// 3-digit ref breaks the moment the sequence passes 999 ("GRP-1000" sorts before
// "GRP-999", so the high-water mark would be missed and GRP-1000 minted a second time).
export const generateGroupRef = async (): Promise<string> => {
  const [{ next }] = await prisma.$queryRaw<{ next: number }[]>`
    SELECT COALESCE(MAX(CAST(SUBSTRING("groupRef" FROM '^GRP-(\\d+)') AS INTEGER)), 0) + 1 AS next
    FROM "client_groups"
    WHERE "groupRef" ~ '^GRP-\\d+'
  `;
  // Still zero-padded to 3 for the GRP-001 house style; 1000+ simply renders unpadded.
  return `GRP-${String(next).padStart(3, '0')}`;
};

export const listGroups = async (search?: string) => {
  const where: Prisma.ClientGroupWhereInput = search
    ? { OR: [
        { name:     { contains: search, mode: 'insensitive' } },
        { groupRef: { contains: search, mode: 'insensitive' } },
      ] }
    : {};
  const groups = await prisma.clientGroup.findMany({ where, select: GROUP_SELECT, orderBy: { createdAt: 'desc' } });
  return groups.map(orderMembers);
};

export const listGroupsPaginated = async (page: number, limit: number, search?: string) => {
  const skip = (page - 1) * limit;
  const where: Prisma.ClientGroupWhereInput = search
    ? { OR: [
        { name:     { contains: search, mode: 'insensitive' } },
        { groupRef: { contains: search, mode: 'insensitive' } },
      ] }
    : {};
  const [groups, total] = await Promise.all([
    prisma.clientGroup.findMany({ where, select: GROUP_SELECT, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.clientGroup.count({ where }),
  ]);
  return { groups: groups.map(orderMembers), total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getGroupById = async (id: string) => {
  const group = await prisma.clientGroup.findUnique({ where: { id }, select: GROUP_SELECT });
  return group ? orderMembers(group) : null;
};

export const createGroup = async (data: { name: string; relation?: string; notes?: string }) => {
  const groupRef = await generateGroupRef();
  return prisma.clientGroup.create({ data: { ...data, groupRef }, select: GROUP_SELECT });
};

export const updateGroup = async (id: string, data: { name?: string; relation?: string; notes?: string }) => {
  const updated = await prisma.clientGroup.update({ where: { id }, data, select: { id: true, groupRef: true } });

  // clientRefs key off the group's immutable groupRef, not its (editable) name, so a
  // rename never needs to touch members — but editing the group is still a convenient
  // moment to opportunistically catch up any legacy plain-ref members. The returned
  // next-free number is of no use here: nothing new is being stamped.
  await backfillGroupMembers(id, updated.groupRef);

  return getGroupById(id);
};

export const deleteGroup = async (id: string) => {
  // Every member reverts to a plain clientRef before the group itself is removed —
  // the FK is ON DELETE SET NULL, but that only clears groupId, not the ref format.
  const members = await prisma.client.findMany({ where: { groupId: id }, select: { id: true, clientRef: true } });
  // Each member drops the -G<n>-<pos> suffix and keeps its own number, so disbanding a
  // group consumes no numbers at all. Sequential on purpose: ungroupedRef falls back to a
  // minted number for legacy shared-number members, and that write has to land before the
  // next member reads the table.
  for (const m of members) {
    await prisma.client.update({ where: { id: m.id }, data: { clientRef: await ungroupedRef(m.clientRef) } });
  }
  return prisma.clientGroup.delete({ where: { id } });
};

export const addMembers = async (groupId: string, clientIds: string[]) => {
  const group = await prisma.clientGroup.findUnique({ where: { id: groupId }, select: { id: true, groupRef: true } });
  if (!group) { const e: any = new Error('NOT_FOUND'); e.code = 'P2025'; throw e; }

  // Backfill first — any plain or legacy-format members get upgraded to the current
  // format (keeping their own numbers) before the new members are appended after them, so
  // the whole group reads consistently and positions are allocated off a settled set.
  await backfillGroupMembers(groupId, group.groupRef);
  const startIndex = await nextMemberIndex(groupId);

  // Each incoming member keeps the number it already owns and only gains the group's
  // G<n> segment and its position — nothing is reassigned, so no number is stranded.
  const incoming = await prisma.client.findMany({
    where: { id: { in: clientIds } }, select: { id: true, clientRef: true },
  });
  const currentRefs = new Map(incoming.map((c) => [c.id, c.clientRef]));

  for (let i = 0; i < clientIds.length; i++) {
    const memberIndex = startIndex + i;
    const clientRef = await groupRefForMember(currentRefs.get(clientIds[i]), group.groupRef, memberIndex);
    await prisma.client.update({ where: { id: clientIds[i] }, data: { groupId, clientRef } });
  }
  return getGroupById(groupId);
};

export const removeMember = async (groupId: string, clientId: string) => {
  const member = await prisma.client.findFirst({ where: { id: clientId, groupId }, select: { id: true, clientRef: true } });
  if (!member) return getGroupById(groupId);
  // Reverts to the plain CL-### it already owned — the number was never shared with the
  // members left behind, so handing it straight back can't collide (ungroupedRef still
  // checks, for groups formed under the old shared-number scheme). No number is consumed
  // and the member's id is stable across leaving the group.
  // The vacated position is NOT reused: nextMemberIndex counts off the highest position
  // in use, so the members left keep their refs untouched.
  await prisma.client.update({
    where: { id: clientId },
    data: { groupId: null, clientRef: await ungroupedRef(member.clientRef) },
  });
  return getGroupById(groupId);
};
