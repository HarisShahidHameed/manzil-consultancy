import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PERMISSIONS = [
  // Users
  { name: 'users:read',   resource: 'users',   action: 'read',   description: 'View users' },
  { name: 'users:write',  resource: 'users',   action: 'write',  description: 'Create/update users' },
  { name: 'users:delete', resource: 'users',   action: 'delete', description: 'Delete users' },
  // Roles
  { name: 'roles:read',   resource: 'roles',   action: 'read',   description: 'View roles' },
  { name: 'roles:write',  resource: 'roles',   action: 'write',  description: 'Create/update roles' },
  { name: 'roles:delete', resource: 'roles',   action: 'delete', description: 'Delete roles' },
  // Permissions
  { name: 'permissions:read',   resource: 'permissions', action: 'read',   description: 'View permissions' },
  { name: 'permissions:write',  resource: 'permissions', action: 'write',  description: 'Create/update permissions' },
  { name: 'permissions:delete', resource: 'permissions', action: 'delete', description: 'Delete permissions' },
  // Audit logs
  { name: 'audit:read', resource: 'audit', action: 'read', description: 'View audit logs' },
  // Dashboard
  { name: 'dashboard:read', resource: 'dashboard', action: 'read', description: 'Access dashboard' },
  // Reports
  { name: 'reports:read',  resource: 'reports', action: 'read',  description: 'View reports' },
  { name: 'reports:write', resource: 'reports', action: 'write', description: 'Create reports' },
  // Clients
  { name: 'clients:read',   resource: 'clients', action: 'read',   description: 'View clients' },
  { name: 'clients:write',  resource: 'clients', action: 'write',  description: 'Create/update clients' },
  { name: 'clients:delete', resource: 'clients', action: 'delete', description: 'Delete clients' },
  // Appointments
  { name: 'appointments:read',   resource: 'appointments', action: 'read',   description: 'View appointments' },
  { name: 'appointments:write',  resource: 'appointments', action: 'write',  description: 'Create/update appointments' },
  { name: 'appointments:delete', resource: 'appointments', action: 'delete', description: 'Delete appointments' },
  // File processing
  { name: 'files:read',  resource: 'files', action: 'read',  description: 'View file processing cases' },
  { name: 'files:write', resource: 'files', action: 'write', description: 'Update file processing' },
  // Invoices
  { name: 'invoices:read',   resource: 'invoices', action: 'read',   description: 'View invoices' },
  { name: 'invoices:write',  resource: 'invoices', action: 'write',  description: 'Create/update invoices' },
  { name: 'invoices:delete', resource: 'invoices', action: 'delete', description: 'Delete invoices' },
];

const ALL_PERM_NAMES = PERMISSIONS.map(p => p.name);

const ROLES = [
  {
    name: 'SUPER_ADMIN',
    description: 'Full system access',
    isSystem: true,
    permissions: ALL_PERM_NAMES,
  },
  {
    name: 'ADMIN',
    description: 'Administrative access',
    isSystem: true,
    permissions: [
      'users:read', 'users:write', 'users:delete',
      'roles:read',
      'permissions:read',
      'audit:read',
      'dashboard:read',
      'reports:read', 'reports:write',
      'clients:read', 'clients:write', 'clients:delete',
      'appointments:read', 'appointments:write', 'appointments:delete',
      'files:read', 'files:write',
      'invoices:read', 'invoices:write', 'invoices:delete',
    ],
  },
  {
    name: 'HR_MANAGER',
    description: 'Full client and case management',
    isSystem: true,
    permissions: [
      'dashboard:read',
      'clients:read', 'clients:write', 'clients:delete',
      'appointments:read', 'appointments:write', 'appointments:delete',
      'files:read', 'files:write',
      'invoices:read', 'invoices:write', 'invoices:delete',
    ],
  },
  {
    name: 'APPOINTMENT_TEAM',
    description: 'Manages appointment bookings',
    isSystem: true,
    permissions: ['dashboard:read', 'clients:read', 'appointments:read', 'appointments:write'],
  },
  {
    name: 'FILE_TEAM',
    description: 'Manages file processing',
    isSystem: true,
    permissions: ['dashboard:read', 'clients:read', 'files:read', 'files:write'],
  },
  {
    name: 'ACCOUNTANT',
    description: 'Manages invoices and payments',
    isSystem: true,
    permissions: ['dashboard:read', 'clients:read', 'invoices:read', 'invoices:write', 'invoices:delete'],
  },
  {
    name: 'MANAGER',
    description: 'Manager-level access',
    isSystem: true,
    permissions: [
      'users:read',
      'dashboard:read',
      'reports:read', 'reports:write',
      'clients:read',
      'appointments:read',
      'files:read',
      'invoices:read',
    ],
  },
  {
    name: 'USER',
    description: 'Standard user access',
    isSystem: true,
    permissions: ['dashboard:read'],
  },
];

async function main() {
  console.log('Seeding database...');

  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      update: { description: perm.description },
      create: perm,
    });
  }
  console.log(`Seeded ${PERMISSIONS.length} permissions`);

  for (const roleDef of ROLES) {
    const { permissions, ...roleData } = roleDef;
    const role = await prisma.role.upsert({
      where: { name: roleData.name },
      update: { description: roleData.description },
      create: roleData,
    });

    const perms = await prisma.permission.findMany({
      where: { name: { in: permissions } },
    });

    for (const perm of perms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
  }
  console.log(`Seeded ${ROLES.length} roles`);

  const superAdminRole = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } });
  if (!superAdminRole) throw new Error('SUPER_ADMIN role not found');

  // Override via env in production so the seeded admin isn't a published default
  // credential — set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in the server's .env
  // (see docs/DEPLOYMENT.md) before the first deploy.
  const adminEmail    = process.env.SEED_ADMIN_EMAIL    || 'admin@manzil.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@123456';
  if (process.env.NODE_ENV === 'production' && !process.env.SEED_ADMIN_PASSWORD) {
    console.warn('WARNING: SEED_ADMIN_PASSWORD not set — seeding with the default password. Change it immediately after first login.');
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 12);

  const superAdmin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      password: hashedPassword,
      firstName: 'Super',
      lastName: 'Admin',
      isActive: true,
      isEmailVerified: true,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: superAdmin.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: superAdmin.id, roleId: superAdminRole.id },
  });

  console.log(`Seeded super admin: ${adminEmail}`);

  // Team test users are for local/dev convenience only — never seeded in production,
  // so a fresh prod database only ever has the one admin account plus whatever real
  // users are created through the app afterwards.
  if (process.env.NODE_ENV !== 'production') {
    const TEAM_USERS = [
      { email: 'manager@manzil.com',     firstName: 'Maya',  lastName: 'Manager',     role: 'HR_MANAGER' },
      { email: 'appointment@manzil.com', firstName: 'Adam',  lastName: 'Appointments', role: 'APPOINTMENT_TEAM' },
      { email: 'files@manzil.com',       firstName: 'Farah', lastName: 'Files',        role: 'FILE_TEAM' },
      { email: 'accounts@manzil.com',    firstName: 'Aron',  lastName: 'Accounts',     role: 'ACCOUNTANT' },
    ];
    const teamPassword = await bcrypt.hash('Team@123456', 12);
    for (const tu of TEAM_USERS) {
      const role = await prisma.role.findUnique({ where: { name: tu.role } });
      if (!role) { console.warn(`Role ${tu.role} not found, skipping ${tu.email}`); continue; }
      const user = await prisma.user.upsert({
        where: { email: tu.email },
        update: {},
        create: {
          email: tu.email,
          password: teamPassword,
          firstName: tu.firstName,
          lastName: tu.lastName,
          isActive: true,
          isEmailVerified: true,
        },
      });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
      console.log(`Seeded ${tu.role}: ${tu.email} / Team@123456`);
    }
  } else {
    console.log('NODE_ENV=production — skipping dev team users, admin only.');
  }

  console.log('Seeding complete.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
