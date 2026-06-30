import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Search, UserPlus, Trash2, Shield, Check, X, Eye, EyeOff, UserCog } from 'lucide-react';
import { AxiosError } from 'axios';
import api from '../../api/axios';
import type { User, Role, ApiResponse } from '../../types';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { Modal } from '../../components/ui/Modal';
import { Can } from '../../routes/RoleGuard';

// ── schemas ────────────────────────────────────────────────
const createUserSchema = z.object({
  firstName: z.string().min(1, 'Required').max(50).trim(),
  lastName: z.string().min(1, 'Required').max(50).trim(),
  email: z.string().email('Valid email required').toLowerCase().trim(),
  password: z
    .string()
    .min(8, 'Min 8 characters')
    .regex(/[A-Z]/, 'Needs uppercase')
    .regex(/[a-z]/, 'Needs lowercase')
    .regex(/\d/, 'Needs a number')
    .regex(/[@$!%*?&^#]/, 'Needs special char'),
  roleId: z.string().uuid('Select a role').optional(),
});
type CreateUserForm = z.infer<typeof createUserSchema>;

const errMsg = (e: unknown, fallback: string) => {
  const ae = e as AxiosError<{ message: string }>;
  return ae.response?.data?.message ?? fallback;
};

// ── component ──────────────────────────────────────────────
const Users: React.FC = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [assignRoleUser, setAssignRoleUser] = useState<User | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const qc = useQueryClient();

  // ── queries ──────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['users', page, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      const res = await api.get<ApiResponse<User[]>>(`/users?${params}`);
      return res.data;
    },
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Role[]>>('/roles');
      return res.data.data ?? [];
    },
  });

  // ── mutations ─────────────────────────────────────────────
  const createUser = useMutation({
    mutationFn: (data: CreateUserForm) => api.post('/users', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setCreateOpen(false);
      createForm.reset();
      showMsg('success', 'User created successfully');
    },
    onError: (e) => setError(errMsg(e, 'Failed to create user')),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put(`/users/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: () => setError('Failed to update user status'),
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      showMsg('success', 'User deleted');
    },
    onError: () => setError('Failed to delete user'),
  });

  const assignRole = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      api.post(`/users/${userId}/roles`, { roleId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setAssignRoleUser(null);
      showMsg('success', 'Role assigned');
    },
    onError: (e) => setError(errMsg(e, 'Failed to assign role')),
  });

  const removeRole = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      api.delete(`/users/${userId}/roles/${roleId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      showMsg('success', 'Role removed');
    },
    onError: () => setError('Failed to remove role'),
  });

  // ── helpers ───────────────────────────────────────────────
  const showMsg = (type: 'success' | 'error', msg: string) => {
    if (type === 'success') { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); }
    else setError(msg);
  };

  const users = data?.data ?? [];
  const meta = data?.meta;

  const createForm = useForm<CreateUserForm>({ resolver: zodResolver(createUserSchema) });

  // Roles already assigned to the "assign role" target user
  const assignedRoleIds = assignRoleUser?.userRoles?.map(ur => ur.role.id) ?? [];
  const availableRoles = roles.filter(r => !assignedRoleIds.includes(r.id));

  // ── render ────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-500 text-sm mt-1">{meta?.total ?? 0} registered accounts</p>
        </div>
        <Can permissions={['users:write']}>
          <Button leftIcon={<UserPlus className="w-4 h-4" />} onClick={() => { createForm.reset(); setCreateOpen(true); }}>
            New User
          </Button>
        </Can>
      </div>

      {/* Alerts */}
      {error && <Alert variant="error" message={error} onClose={() => setError(null)} />}
      {success && <Alert variant="success" message={success} onClose={() => setSuccess(null)} />}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Search */}
        <div className="p-4 border-b border-gray-200">
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            leftIcon={<Search className="w-4 h-4" />}
            className="max-w-sm"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <UserPlus className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500">{search ? 'No users match your search' : 'No users yet'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">User</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Roles</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Joined</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user: User) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">{user.firstName} {user.lastName}</p>
                        <p className="text-gray-400 text-xs">{user.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(user.userRoles ?? []).length === 0 ? (
                          <span className="text-xs text-gray-400 italic">No roles</span>
                        ) : (
                          user.userRoles!.map(ur => (
                            <span
                              key={ur.id}
                              className="group inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium"
                            >
                              <Shield className="w-3 h-3" />
                              {ur.role.name}
                              <Can permissions={['users:write']}>
                                <button
                                  onClick={() => removeRole.mutate({ userId: user.id, roleId: ur.role.id })}
                                  className="ml-0.5 text-indigo-400 hover:text-red-500 transition-colors hidden group-hover:inline"
                                  title={`Remove ${ur.role.name}`}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </Can>
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {user.isActive ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Can permissions={['users:write']}>
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<UserCog className="w-3.5 h-3.5" />}
                            onClick={() => setAssignRoleUser(user)}
                          >
                            Roles
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleActive.mutate({ id: user.id, isActive: !user.isActive })}
                          >
                            {user.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                        </Can>
                        <Can permissions={['users:delete']}>
                          <Button
                            variant="danger"
                            size="sm"
                            leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                            onClick={() => {
                              if (confirm(`Delete ${user.firstName} ${user.lastName}? This cannot be undone.`)) {
                                deleteUser.mutate(user.id);
                              }
                            }}
                          >
                            Delete
                          </Button>
                        </Can>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {meta && (meta.totalPages ?? 1) > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Showing page {meta.page} of {meta.totalPages} ({meta.total} total)
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={meta.page === 1} onClick={() => setPage(p => p - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={meta.page === meta.totalPages} onClick={() => setPage(p => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Create User Modal ── */}
      <Modal
        open={createOpen}
        onClose={() => { setCreateOpen(false); createForm.clearErrors(); setShowPassword(false); }}
        title="Create new user"
        subtitle="Fill in the details to create a user account"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              loading={createUser.isPending}
              onClick={createForm.handleSubmit(data => createUser.mutate(data))}
            >
              Create user
            </Button>
          </>
        }
      >
        <form
          onSubmit={createForm.handleSubmit(data => createUser.mutate(data))}
          className="space-y-4"
          noValidate
        >
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="First name"
              required
              placeholder="John"
              error={createForm.formState.errors.firstName?.message}
              {...createForm.register('firstName')}
            />
            <Input
              label="Last name"
              required
              placeholder="Doe"
              error={createForm.formState.errors.lastName?.message}
              {...createForm.register('lastName')}
            />
          </div>

          <Input
            label="Email address"
            type="email"
            required
            placeholder="john@example.com"
            error={createForm.formState.errors.email?.message}
            {...createForm.register('email')}
          />

          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            required
            placeholder="Min 8 chars, upper/lower/number/special"
            rightIcon={
              <button type="button" onClick={() => setShowPassword(v => !v)} tabIndex={-1}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
            error={createForm.formState.errors.password?.message}
            helper="8+ chars · uppercase · lowercase · number · special char (@$!%*?&^#)"
            {...createForm.register('password')}
          />

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Role <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
              {...createForm.register('roleId')}
            >
              <option value="">Default (USER)</option>
              {roles.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400">User will be assigned the USER role if none is selected</p>
          </div>
        </form>
      </Modal>

      {/* ── Assign Role Modal ── */}
      <Modal
        open={!!assignRoleUser}
        onClose={() => setAssignRoleUser(null)}
        title="Manage roles"
        subtitle={assignRoleUser ? `${assignRoleUser.firstName} ${assignRoleUser.lastName} · ${assignRoleUser.email}` : ''}
        size="sm"
        footer={
          <Button variant="outline" onClick={() => setAssignRoleUser(null)}>Done</Button>
        }
      >
        {assignRoleUser && (
          <div className="space-y-5">
            {/* Current roles */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Current Roles</p>
              {assignRoleUser.userRoles?.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No roles assigned</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {assignRoleUser.userRoles?.map(ur => (
                    <span key={ur.id} className="group flex items-center gap-1.5 px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium">
                      <Shield className="w-3.5 h-3.5" />
                      {ur.role.name}
                      <button
                        onClick={() => {
                          removeRole.mutate(
                            { userId: assignRoleUser.id, roleId: ur.role.id },
                            {
                              onSuccess: () => {
                                setAssignRoleUser(prev =>
                                  prev
                                    ? { ...prev, userRoles: prev.userRoles?.filter(r => r.id !== ur.id) }
                                    : null
                                );
                              },
                            }
                          );
                        }}
                        className="text-indigo-400 hover:text-red-500 transition-colors"
                        title={`Remove ${ur.role.name}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Add a role */}
            {availableRoles.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Add Role</p>
                <div className="flex flex-col gap-1.5">
                  {availableRoles.map(role => (
                    <button
                      key={role.id}
                      onClick={() => {
                        assignRole.mutate(
                          { userId: assignRoleUser.id, roleId: role.id },
                          {
                            onSuccess: () => {
                              setAssignRoleUser(prev =>
                                prev
                                  ? {
                                      ...prev,
                                      userRoles: [
                                        ...(prev.userRoles ?? []),
                                        { id: `temp-${role.id}`, role: { id: role.id, name: role.name } },
                                      ],
                                    }
                                  : null
                              );
                            },
                          }
                        );
                      }}
                      disabled={assignRole.isPending}
                      className="flex items-center justify-between px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 transition-all disabled:opacity-50 text-left"
                    >
                      <span className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-gray-400" />
                        <span className="font-medium">{role.name}</span>
                        {role.description && (
                          <span className="text-gray-400 text-xs">· {role.description}</span>
                        )}
                      </span>
                      <span className="text-xs text-indigo-500 font-medium">+ Assign</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {availableRoles.length === 0 && (assignRoleUser.userRoles?.length ?? 0) > 0 && (
              <p className="text-sm text-gray-400 text-center py-2">All available roles are assigned</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Users;
