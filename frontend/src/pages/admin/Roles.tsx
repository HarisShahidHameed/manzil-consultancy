import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Shield, Lock, Pencil, Check, Users, ChevronRight } from 'lucide-react';
import { AxiosError } from 'axios';
import api from '../../api/axios';
import type { Role, Permission, ApiResponse } from '../../types';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { Modal } from '../../components/ui/Modal';
import { Pagination } from '../../components/ui/Pagination';
import { Can } from '../../routes/RoleGuard';

// ── schemas ────────────────────────────────────────────────
const roleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50).trim(),
  description: z.string().max(255).trim().optional(),
});
type RoleForm = z.infer<typeof roleSchema>;

// ── helpers ────────────────────────────────────────────────
const errMsg = (e: unknown, fallback: string) => {
  const ae = e as AxiosError<{ message: string }>;
  return ae.response?.data?.message ?? fallback;
};

// ── component ──────────────────────────────────────────────
const Roles: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null);

  const qc = useQueryClient();
  const changeLimit = (l: number) => { setLimit(l); setPage(1); };

  // ── queries ──────────────────────────────────────────────
  const { data: rolesRes, isLoading: rolesLoading } = useQuery({
    queryKey: ['roles', page, limit],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Role[]>>(`/roles?page=${page}&limit=${limit}`);
      return res.data;
    },
  });
  const roles = rolesRes?.data ?? [];
  const rolesMeta = rolesRes?.meta;

  const { data: allPermissions = [] } = useQuery<Permission[]>({
    queryKey: ['permissions'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Permission[]>>('/roles/permissions');
      return res.data.data ?? [];
    },
  });

  // Derive selected role from live query data (never stale)
  const selectedRole = useMemo(
    () => roles.find(r => r.id === selectedId) ?? null,
    [roles, selectedId]
  );

  // Auto-select first role on load
  useEffect(() => {
    if (!selectedId && roles.length > 0) setSelectedId(roles[0].id);
  }, [roles, selectedId]);

  // Group permissions by resource
  const groupedPermissions = useMemo(
    () =>
      allPermissions.reduce<Record<string, Permission[]>>((acc, p) => {
        if (!acc[p.resource]) acc[p.resource] = [];
        acc[p.resource].push(p);
        return acc;
      }, {}),
    [allPermissions]
  );

  const currentPermIds = useMemo(
    () => selectedRole?.rolePermissions?.map(rp => rp.permission.id) ?? [],
    [selectedRole]
  );

  // ── mutations ─────────────────────────────────────────────
  const createRole = useMutation({
    mutationFn: (data: RoleForm) => api.post('/roles', data),
    onSuccess: async (res) => {
      const newRole = (res.data as ApiResponse<Role>).data;
      await qc.invalidateQueries({ queryKey: ['roles'] });
      if (newRole) setSelectedId(newRole.id);
      setCreateOpen(false);
      setGlobalSuccess('Role created successfully');
      setTimeout(() => setGlobalSuccess(null), 3000);
    },
    onError: (e) => setGlobalError(errMsg(e, 'Failed to create role')),
  });

  const updateRole = useMutation({
    mutationFn: ({ id, data }: { id: string; data: RoleForm }) =>
      api.put(`/roles/${id}`, data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['roles'] });
      setEditOpen(false);
      setGlobalSuccess('Role updated successfully');
      setTimeout(() => setGlobalSuccess(null), 3000);
    },
    onError: (e) => setGlobalError(errMsg(e, 'Failed to update role')),
  });

  const deleteRole = useMutation({
    mutationFn: (id: string) => api.delete(`/roles/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['roles'] });
      setDeleteOpen(false);
      setSelectedId(null);
      setGlobalSuccess('Role deleted');
      setTimeout(() => setGlobalSuccess(null), 3000);
    },
    onError: (e) => setGlobalError(errMsg(e, 'Failed to delete role')),
  });

  const setPermissions = useMutation({
    mutationFn: ({ roleId, permissionIds }: { roleId: string; permissionIds: string[] }) =>
      api.put(`/roles/${roleId}/permissions`, { permissionIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
    onError: (e) => setGlobalError(errMsg(e, 'Failed to update permissions')),
  });

  const togglePermission = (permId: string) => {
    if (!selectedRole || selectedRole.isSystem) return;
    const next = currentPermIds.includes(permId)
      ? currentPermIds.filter(id => id !== permId)
      : [...currentPermIds, permId];
    setPermissions.mutate({ roleId: selectedRole.id, permissionIds: next });
  };

  const selectAll = (resource: string) => {
    if (!selectedRole || selectedRole.isSystem) return;
    const resourcePermIds = (groupedPermissions[resource] ?? []).map(p => p.id);
    const allSelected = resourcePermIds.every(id => currentPermIds.includes(id));
    const next = allSelected
      ? currentPermIds.filter(id => !resourcePermIds.includes(id))
      : [...new Set([...currentPermIds, ...resourcePermIds])];
    setPermissions.mutate({ roleId: selectedRole.id, permissionIds: next });
  };

  // ── forms ─────────────────────────────────────────────────
  const createForm = useForm<RoleForm>({ resolver: zodResolver(roleSchema) });
  const editForm = useForm<RoleForm>({ resolver: zodResolver(roleSchema) });

  const openEdit = () => {
    if (!selectedRole) return;
    editForm.reset({ name: selectedRole.name, description: selectedRole.description ?? '' });
    setEditOpen(true);
  };

  // ── render ────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Roles & Permissions</h1>
          <p className="text-gray-500 text-sm mt-1">
            {rolesMeta?.total ?? roles.length} roles · {allPermissions.length} permissions
          </p>
        </div>
        <Can permissions={['roles:write']}>
          <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => { createForm.reset(); setCreateOpen(true); }}>
            New Role
          </Button>
        </Can>
      </div>

      {/* Alerts */}
      {globalError && (
        <Alert variant="error" message={globalError} onClose={() => setGlobalError(null)} />
      )}
      {globalSuccess && (
        <Alert variant="success" message={globalSuccess} onClose={() => setGlobalSuccess(null)} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: Roles list ── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Roles</h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{rolesMeta?.total ?? roles.length}</span>
          </div>

          {rolesLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="divide-y divide-gray-100 overflow-y-auto flex-1">
              {roles.map(role => (
                <div
                  key={role.id}
                  onClick={() => setSelectedId(role.id)}
                  className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
                    selectedId === role.id
                      ? 'bg-indigo-50 border-l-2 border-indigo-500'
                      : 'hover:bg-gray-50 border-l-2 border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      role.isSystem ? 'bg-purple-100' : 'bg-indigo-100'
                    }`}>
                      {role.isSystem
                        ? <Lock className="w-4 h-4 text-purple-600" />
                        : <Shield className="w-4 h-4 text-indigo-600" />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{role.name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {role._count?.userRoles ?? 0}
                        </span>
                        <span className="text-xs text-gray-400">·</span>
                        <span className="text-xs text-gray-400">
                          {role.rolePermissions?.length ?? 0} perms
                        </span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 flex-shrink-0 transition-colors ${
                    selectedId === role.id ? 'text-indigo-500' : 'text-gray-300'
                  }`} />
                </div>
              ))}
            </div>
          )}
          <Pagination meta={rolesMeta} onPageChange={setPage} limit={limit} onLimitChange={changeLimit} />
        </div>

        {/* ── Right: Permission matrix ── */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden">
          {selectedRole ? (
            <>
              {/* Role header */}
              <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between flex-shrink-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-gray-900 text-lg">{selectedRole.name}</h2>
                    {selectedRole.isSystem && (
                      <span className="flex items-center gap-1 text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                        <Lock className="w-3 h-3" /> System
                      </span>
                    )}
                  </div>
                  {selectedRole.description && (
                    <p className="text-sm text-gray-500 mt-0.5">{selectedRole.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {currentPermIds.length} of {allPermissions.length} permissions granted
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                  <Can permissions={['roles:write']}>
                    {!selectedRole.isSystem && (
                      <Button variant="outline" size="sm" leftIcon={<Pencil className="w-3.5 h-3.5" />} onClick={openEdit}>
                        Edit
                      </Button>
                    )}
                  </Can>
                  <Can permissions={['roles:delete']}>
                    {!selectedRole.isSystem && (
                      <Button
                        variant="danger"
                        size="sm"
                        leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                        onClick={() => setDeleteOpen(true)}
                      >
                        Delete
                      </Button>
                    )}
                  </Can>
                </div>
              </div>

              {/* Permission groups */}
              <div className="overflow-y-auto flex-1 p-6 space-y-6">
                {selectedRole.isSystem && (
                  <Alert
                    variant="info"
                    message="System roles cannot be modified. They are managed by the application."
                  />
                )}

                {Object.entries(groupedPermissions).map(([resource, perms]) => {
                  const resourcePermIds = perms.map(p => p.id);
                  const selectedCount = resourcePermIds.filter(id => currentPermIds.includes(id)).length;
                  const allSelected = selectedCount === resourcePermIds.length;
                  const someSelected = selectedCount > 0 && !allSelected;

                  return (
                    <div key={resource}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-gray-700 capitalize">{resource}</h3>
                          <span className="text-xs text-gray-400">
                            {selectedCount}/{resourcePermIds.length}
                          </span>
                        </div>
                        {!selectedRole.isSystem && (
                          <button
                            onClick={() => selectAll(resource)}
                            disabled={setPermissions.isPending}
                            className={`text-xs font-medium transition-colors ${
                              allSelected
                                ? 'text-indigo-600 hover:text-indigo-800'
                                : someSelected
                                ? 'text-orange-500 hover:text-orange-700'
                                : 'text-gray-400 hover:text-gray-600'
                            } disabled:opacity-50`}
                          >
                            {allSelected ? '− Remove all' : '+ Select all'}
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {perms.map(perm => {
                          const active = currentPermIds.includes(perm.id);
                          const isPending = setPermissions.isPending;
                          return (
                            <button
                              key={perm.id}
                              disabled={selectedRole.isSystem || isPending}
                              onClick={() => togglePermission(perm.id)}
                              title={perm.description ?? perm.name}
                              className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                                active
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                  : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400 hover:text-indigo-600'
                              } disabled:opacity-40 disabled:cursor-not-allowed`}
                            >
                              {active && <Check className="w-3 h-3" />}
                              {perm.action}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center p-8">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                <Shield className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-600 font-medium">Select a role</p>
              <p className="text-gray-400 text-sm mt-1">Choose a role from the left to view and manage its permissions</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Create Role Modal ── */}
      <Modal
        open={createOpen}
        onClose={() => { setCreateOpen(false); createForm.clearErrors(); }}
        title="Create new role"
        subtitle="Add a custom role and assign permissions after creation"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              loading={createRole.isPending}
              onClick={createForm.handleSubmit(data => createRole.mutate(data))}
            >
              Create role
            </Button>
          </>
        }
      >
        <form
          onSubmit={createForm.handleSubmit(data => createRole.mutate(data))}
          className="space-y-4"
          noValidate
        >
          <Input
            label="Role name"
            required
            placeholder="e.g. EDITOR"
            error={createForm.formState.errors.name?.message}
            helper="Will be stored in uppercase (e.g. EDITOR)"
            {...createForm.register('name')}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <textarea
              rows={3}
              placeholder="What does this role allow users to do?"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors resize-none"
              {...createForm.register('description')}
            />
            {createForm.formState.errors.description && (
              <p className="text-xs text-red-600">{createForm.formState.errors.description.message}</p>
            )}
          </div>
        </form>
      </Modal>

      {/* ── Edit Role Modal ── */}
      <Modal
        open={editOpen}
        onClose={() => { setEditOpen(false); editForm.clearErrors(); }}
        title="Edit role"
        subtitle={`Updating: ${selectedRole?.name}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              loading={updateRole.isPending}
              onClick={editForm.handleSubmit(data =>
                selectedRole && updateRole.mutate({ id: selectedRole.id, data })
              )}
            >
              Save changes
            </Button>
          </>
        }
      >
        <form
          onSubmit={editForm.handleSubmit(data =>
            selectedRole && updateRole.mutate({ id: selectedRole.id, data })
          )}
          className="space-y-4"
          noValidate
        >
          <Input
            label="Role name"
            required
            error={editForm.formState.errors.name?.message}
            {...editForm.register('name')}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <textarea
              rows={3}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors resize-none"
              {...editForm.register('description')}
            />
          </div>
        </form>
      </Modal>

      {/* ── Delete Confirm Modal ── */}
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete role"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={deleteRole.isPending}
              onClick={() => selectedRole && deleteRole.mutate(selectedRole.id)}
            >
              Yes, delete
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-gray-700 text-sm">
            Are you sure you want to delete{' '}
            <span className="font-semibold text-gray-900">{selectedRole?.name}</span>?
          </p>
          {(selectedRole?._count?.userRoles ?? 0) > 0 && (
            <Alert
              variant="warning"
              message={`This role is assigned to ${selectedRole!._count!.userRoles} user(s). Deleting it will remove the role from those users.`}
            />
          )}
          <p className="text-xs text-gray-400">This action cannot be undone.</p>
        </div>
      </Modal>
    </div>
  );
};

export default Roles;
