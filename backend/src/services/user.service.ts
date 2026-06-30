import { prisma } from '../config/database';

export const listUsers = async (page = 1, limit = 20, search?: string) => {
  const skip = (page - 1) * limit;
  const where = search
    ? {
        OR: [
          { email: { contains: search, mode: 'insensitive' as const } },
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        isEmailVerified: true,
        createdAt: true,
        updatedAt: true,
        userRoles: {
          include: { role: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Lightweight list of active users with their role names, used to populate
 * case-assignment dropdowns. Accessible to anyone who can edit a case.
 */
export const listAssignableUsers = async () => {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      userRoles: { select: { role: { select: { name: true } } } },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  return users.map(u => ({
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    roles: u.userRoles.map(ur => ur.role.name),
  }));
};

export const getUserById = async (id: string) => {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      isActive: true,
      isEmailVerified: true,
      createdAt: true,
      updatedAt: true,
      userRoles: {
        include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
      },
    },
  });
};

export const updateUser = async (
  id: string,
  data: { firstName?: string; lastName?: string; isActive?: boolean }
) => {
  return prisma.user.update({
    where: { id },
    data,
    select: {
      id: true, email: true, firstName: true, lastName: true,
      isActive: true, updatedAt: true,
    },
  });
};

export const deleteUser = async (id: string) => {
  return prisma.user.delete({ where: { id } });
};

export const assignRoleToUser = async (userId: string, roleId: string) => {
  return prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId } },
    update: {},
    create: { userId, roleId },
  });
};

export const removeRoleFromUser = async (userId: string, roleId: string) => {
  return prisma.userRole.delete({
    where: { userId_roleId: { userId, roleId } },
  });
};

export const getUserAuditLogs = async (userId: string, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: { userId },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.auditLog.count({ where: { userId } }),
  ]);
  return { logs, total, page, limit, totalPages: Math.ceil(total / limit) };
};
