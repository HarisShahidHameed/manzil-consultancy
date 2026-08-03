import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';
import { generateClientRef, resolveGroupNumber, nextMemberIndex, buildGroupRef, GROUPED_REF_RE } from '../utils/clientRef';

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
    orderBy: { clientRef: 'asc' as const },
  },
  _count: { select: { clients: true } },
} satisfies Prisma.ClientGroupSelect;

export const generateGroupRef = async (): Promise<string> => {
  const last = await prisma.clientGroup.findFirst({
    orderBy: { groupRef: 'desc' },
    select: { groupRef: true },
  });
  const n = last ? parseInt(last.groupRef.replace('GRP-', ''), 10) + 1 : 1;
  return `GRP-${String(n).padStart(3, '0')}`;
};

export const listGroups = async (search?: string) => {
  const where: Prisma.ClientGroupWhereInput = search
    ? { OR: [
        { name:     { contains: search, mode: 'insensitive' } },
        { groupRef: { contains: search, mode: 'insensitive' } },
      ] }
    : {};
  return prisma.clientGroup.findMany({ where, select: GROUP_SELECT, orderBy: { createdAt: 'desc' } });
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
  return { groups, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getGroupById = async (id: string) =>
  prisma.clientGroup.findUnique({ where: { id }, select: GROUP_SELECT });

export const createGroup = async (data: { name: string; relation?: string; notes?: string }) => {
  const groupRef = await generateGroupRef();
  return prisma.clientGroup.create({ data: { ...data, groupRef }, select: GROUP_SELECT });
};

export const updateGroup = async (id: string, data: { name?: string; relation?: string; notes?: string }) => {
  const updated = await prisma.clientGroup.update({ where: { id }, data, select: { id: true, name: true } });

  // Renaming the group re-stamps every member's clientRef with the new name, keeping
  // their existing shared number and position.
  if (data.name !== undefined) {
    const members = await prisma.client.findMany({ where: { groupId: id }, select: { id: true, clientRef: true } });
    for (const m of members) {
      const match = m.clientRef.match(GROUPED_REF_RE);
      if (!match) continue;
      const newRef = buildGroupRef(parseInt(match[1], 10), updated.name, parseInt(match[2], 10));
      if (newRef !== m.clientRef) {
        await prisma.client.update({ where: { id: m.id }, data: { clientRef: newRef } });
      }
    }
  }

  return getGroupById(id);
};

export const deleteGroup = async (id: string) => {
  // Every member reverts to a plain clientRef before the group itself is removed —
  // the FK is ON DELETE SET NULL, but that only clears groupId, not the ref format.
  const members = await prisma.client.findMany({ where: { groupId: id }, select: { id: true } });
  for (const m of members) {
    const freshRef = await generateClientRef();
    await prisma.client.update({ where: { id: m.id }, data: { clientRef: freshRef } });
  }
  return prisma.clientGroup.delete({ where: { id } });
};

export const addMembers = async (groupId: string, clientIds: string[]) => {
  const group = await prisma.clientGroup.findUnique({ where: { id: groupId }, select: { id: true, name: true } });
  if (!group) { const e: any = new Error('NOT_FOUND'); e.code = 'P2025'; throw e; }

  const startIndex = await nextMemberIndex(groupId);
  const groupNumber = await resolveGroupNumber(groupId, clientIds[0]);

  for (let i = 0; i < clientIds.length; i++) {
    const memberIndex = startIndex + i;
    await prisma.client.update({
      where: { id: clientIds[i] },
      data: { groupId, clientRef: buildGroupRef(groupNumber, group.name, memberIndex) },
    });
  }
  return getGroupById(groupId);
};

export const removeMember = async (groupId: string, clientId: string) => {
  const member = await prisma.client.findFirst({ where: { id: clientId, groupId }, select: { id: true } });
  if (!member) return getGroupById(groupId);
  // Reverts to a fresh plain CL-### id — the number they used to carry may still be
  // shared by other members left in the group, so it can't simply be handed back.
  const freshRef = await generateClientRef();
  await prisma.client.update({ where: { id: clientId }, data: { groupId: null, clientRef: freshRef } });
  return getGroupById(groupId);
};
