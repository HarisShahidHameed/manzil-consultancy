import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/)
    .regex(/[a-z]/)
    .regex(/\d/)
    .regex(/[@$!%*?&^#]/),
  firstName: z.string().min(1).max(50).trim(),
  lastName: z.string().min(1).max(50).trim(),
  roleId: z.string().uuid().optional(),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(50).trim().optional(),
  lastName: z.string().min(1).max(50).trim().optional(),
  isActive: z.boolean().optional(),
});

export const assignRoleSchema = z.object({
  roleId: z.string().uuid('Invalid role ID'),
});

export const paginationSchema = z.object({
  page: z.string().optional().transform(v => (v ? parseInt(v, 10) : 1)),
  limit: z.string().optional().transform(v => (v ? Math.min(parseInt(v, 10), 100) : 20)),
  search: z.string().optional(),
});

export const createRoleSchema = z.object({
  name: z.string().min(1).max(50).trim(),
  description: z.string().max(255).optional(),
});

export const updateRoleSchema = z.object({
  name: z.string().min(1).max(50).trim().optional(),
  description: z.string().max(255).optional(),
});

export const setPermissionsSchema = z.object({
  permissionIds: z.array(z.string().uuid()).min(0),
});

export const createPermissionSchema = z.object({
  resource: z.string().min(1, 'Resource is required').max(50).trim(),
  action: z.string().min(1, 'Action is required').max(50).trim(),
  description: z.string().max(255).optional(),
});

export const updatePermissionSchema = z.object({
  resource: z.string().min(1).max(50).trim().optional(),
  action: z.string().min(1).max(50).trim().optional(),
  description: z.string().max(255).optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
