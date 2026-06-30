import { prisma } from '../config/database';

export const listRoles = async () => {
  return prisma.role.findMany({
    include: {
      rolePermissions: { include: { permission: true } },
      _count: { select: { userRoles: true } },
    },
    orderBy: { name: 'asc' },
  });
};

export const getRoleById = async (id: string) => {
  return prisma.role.findUnique({
    where: { id },
    include: {
      rolePermissions: { include: { permission: true } },
      _count: { select: { userRoles: true } },
    },
  });
};

export const createRole = async (data: { name: string; description?: string }) => {
  return prisma.role.create({
    data: { name: data.name.toUpperCase(), description: data.description },
    include: { rolePermissions: { include: { permission: true } } },
  });
};

export const updateRole = async (id: string, data: { name?: string; description?: string }) => {
  const role = await prisma.role.findUnique({ where: { id } });
  if (role?.isSystem) throw new Error('SYSTEM_ROLE');

  return prisma.role.update({
    where: { id },
    data: { ...data, ...(data.name && { name: data.name.toUpperCase() }) },
    include: { rolePermissions: { include: { permission: true } } },
  });
};

export const deleteRole = async (id: string) => {
  const role = await prisma.role.findUnique({ where: { id } });
  if (role?.isSystem) throw new Error('SYSTEM_ROLE');
  return prisma.role.delete({ where: { id } });
};

export const setRolePermissions = async (roleId: string, permissionIds: string[]) => {
  await prisma.rolePermission.deleteMany({ where: { roleId } });

  if (permissionIds.length > 0) {
    await prisma.rolePermission.createMany({
      data: permissionIds.map(permissionId => ({ roleId, permissionId })),
      skipDuplicates: true,
    });
  }

  return getRoleById(roleId);
};

export const listPermissions = async () => {
  return prisma.permission.findMany({
    orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    include: { _count: { select: { rolePermissions: true } } },
  });
};

export const createPermission = async (data: { resource: string; action: string; description?: string }) => {
  const resource = data.resource.toLowerCase().trim();
  const action = data.action.toLowerCase().trim();
  const name = `${resource}:${action}`;
  return prisma.permission.create({
    data: { name, resource, action, description: data.description },
    include: { _count: { select: { rolePermissions: true } } },
  });
};

export const updatePermission = async (
  id: string,
  data: { resource?: string; action?: string; description?: string }
) => {
  const perm = await prisma.permission.findUnique({ where: { id } });
  if (!perm) throw new Error('NOT_FOUND');
  const resource = (data.resource ?? perm.resource).toLowerCase().trim();
  const action = (data.action ?? perm.action).toLowerCase().trim();
  const name = `${resource}:${action}`;
  return prisma.permission.update({
    where: { id },
    data: { name, resource, action, description: data.description !== undefined ? data.description : perm.description },
    include: { _count: { select: { rolePermissions: true } } },
  });
};

export const deletePermission = async (id: string) => {
  const perm = await prisma.permission.findUnique({ where: { id } });
  if (!perm) throw new Error('NOT_FOUND');
  return prisma.permission.delete({ where: { id } });
};

export const listAuditLogs = async (page = 1, limit = 50) => {
  const skip = (page - 1) * limit;
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true, firstName: true, lastName: true } } },
    }),
    prisma.auditLog.count(),
  ]);
  return { logs, total, page, limit, totalPages: Math.ceil(total / limit) };
};
