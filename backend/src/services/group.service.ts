import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';

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

export const getGroupById = async (id: string) =>
  prisma.clientGroup.findUnique({ where: { id }, select: GROUP_SELECT });

export const createGroup = async (data: { name: string; relation?: string; notes?: string }) => {
  const groupRef = await generateGroupRef();
  return prisma.clientGroup.create({ data: { ...data, groupRef }, select: GROUP_SELECT });
};

export const updateGroup = async (id: string, data: { name?: string; relation?: string; notes?: string }) =>
  prisma.clientGroup.update({ where: { id }, data, select: GROUP_SELECT });

export const deleteGroup = async (id: string) =>
  prisma.clientGroup.delete({ where: { id } });

export const addMembers = async (groupId: string, clientIds: string[]) => {
  await prisma.client.updateMany({ where: { id: { in: clientIds } }, data: { groupId } });
  return getGroupById(groupId);
};

export const removeMember = async (groupId: string, clientId: string) => {
  await prisma.client.updateMany({ where: { id: clientId, groupId }, data: { groupId: null } });
  return getGroupById(groupId);
};
