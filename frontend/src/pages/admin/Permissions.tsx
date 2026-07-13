import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, Key, Search, Shield } from 'lucide-react';
import { AxiosError } from 'axios';
import api from '../../api/axios';
import type { Permission, ApiResponse } from '../../types';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { Modal } from '../../components/ui/Modal';
import { Pagination } from '../../components/ui/Pagination';
import { Can } from '../../routes/RoleGuard';

// ── extended type that includes role count ────────────────────
interface PermissionWithCount extends Permission {
  _count?: { rolePermissions: number };
}

// ── schemas ───────────────────────────────────────────────────
const permSchema = z.object({
  resource: z.string().min(1, 'Resource is required').max(50).trim(),
  action: z.string().min(1, 'Action is required').max(50).trim(),
  description: z.string().max(255).trim().optional(),
});
type PermForm = z.infer<typeof permSchema>;

const errMsg = (e: unknown, fallback: string) => {
  const ae = e as AxiosError<{ message: string }>;
  return ae.response?.data?.message ?? fallback;
};

// ── action badge colours ──────────────────────────────────────
const ACTION_COLOURS: Record<string, string> = {
  read:   'bg-blue-50 text-blue-700 border-blue-200',
  write:  'bg-green-50 text-green-700 border-green-200',
  delete: 'bg-red-50 text-red-700 border-red-200',
};
const actionClass = (action: string) =>
  ACTION_COLOURS[action.toLowerCase()] ?? 'bg-gray-50 text-gray-700 border-gray-200';

// ── component ─────────────────────────────────────────────────
const Permissions: React.FC = () => {
  const [search, setSearch] = useState('');
  const [resourceFilter, setResourceFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PermissionWithCount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PermissionWithCount | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null);

  const qc = useQueryClient();
  const changeLimit = (l: number) => { setLimit(l); setPage(1); };

  // ── queries ──────────────────────────────────────────────────
  // Full unpaginated list — used only to compute per-resource stat cards / resource options
  const { data: allPermissions = [] } = useQuery<PermissionWithCount[]>({
    queryKey: ['permissions', 'all'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<PermissionWithCount[]>>('/roles/permissions');
      return res.data.data ?? [];
    },
  });

  const resources = useMemo(() => {
    const set = new Set(allPermissions.map(p => p.resource));
    return Array.from(set).sort();
  }, [allPermissions]);

  // Paginated, server-filtered table data
  const { data: permsRes, isLoading } = useQuery({
    queryKey: ['permissions', page, limit, search, resourceFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set('search', search);
      if (resourceFilter !== 'all') params.set('resource', resourceFilter);
      const res = await api.get<ApiResponse<PermissionWithCount[]>>(`/roles/permissions?${params}`);
      return res.data;
    },
  });
  const filtered = permsRes?.data ?? [];
  const meta = permsRes?.meta;

  // ── mutations ─────────────────────────────────────────────────
  const notify = (msg: string) => {
    setGlobalSuccess(msg);
    setTimeout(() => setGlobalSuccess(null), 3000);
  };

  const createPerm = useMutation({
    mutationFn: (data: PermForm) => api.post('/roles/permissions', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permissions'] });
      setCreateOpen(false);
      notify('Permission created');
    },
    onError: (e) => setGlobalError(errMsg(e, 'Failed to create permission')),
  });

  const updatePerm = useMutation({
    mutationFn: ({ id, data }: { id: string; data: PermForm }) =>
      api.put(`/roles/permissions/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permissions'] });
      setEditTarget(null);
      notify('Permission updated');
    },
    onError: (e) => setGlobalError(errMsg(e, 'Failed to update permission')),
  });

  const deletePerm = useMutation({
    mutationFn: (id: string) => api.delete(`/roles/permissions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permissions'] });
      qc.invalidateQueries({ queryKey: ['roles'] });
      setDeleteTarget(null);
      notify('Permission deleted');
    },
    onError: (e) => setGlobalError(errMsg(e, 'Failed to delete permission')),
  });

  // ── forms ──────────────────────────────────────────────────────
  const createForm = useForm<PermForm>({ resolver: zodResolver(permSchema) });
  const editForm   = useForm<PermForm>({ resolver: zodResolver(permSchema) });

  const openEdit = (p: PermissionWithCount) => {
    editForm.reset({ resource: p.resource, action: p.action, description: p.description ?? '' });
    setEditTarget(p);
  };

  // ── render ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Permissions</h1>
          <p className="text-gray-500 text-sm mt-1">
            {meta?.total ?? allPermissions.length} permissions across {resources.length} resources
          </p>
        </div>
        <Can permissions={['permissions:write']}>
          <Button
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => { createForm.reset(); setCreateOpen(true); }}
          >
            New Permission
          </Button>
        </Can>
      </div>

      {/* Alerts */}
      {globalError   && <Alert variant="error"   message={globalError}   onClose={() => setGlobalError(null)} />}
      {globalSuccess && <Alert variant="success" message={globalSuccess} onClose={() => setGlobalSuccess(null)} />}

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {resources.map(r => {
          const count = allPermissions.filter(p => p.resource === r).length;
          return (
            <button
              key={r}
              onClick={() => { setResourceFilter(prev => prev === r ? 'all' : r); setPage(1); }}
              className={`rounded-xl border p-4 text-left transition-all ${
                resourceFilter === r
                  ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <p className="text-lg font-bold text-gray-900">{count}</p>
              <p className="text-xs text-gray-500 capitalize">{r}</p>
            </button>
          );
        })}
      </div>

      {/* Search + filter bar */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search permissions…"
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <select
          value={resourceFilter}
          onChange={e => { setResourceFilter(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="all">All resources</option>
          {resources.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
              <Key className="w-7 h-7 text-gray-400" />
            </div>
            <p className="text-gray-600 font-medium">No permissions found</p>
            <p className="text-gray-400 text-sm mt-1">
              {search || resourceFilter !== 'all' ? 'Try adjusting your filters' : 'Create your first permission'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Permission</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Resource</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Description</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Used by</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(perm => (
                <tr key={perm.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-xs font-semibold text-gray-800 bg-gray-100 px-2 py-1 rounded">
                      {perm.name}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="capitalize text-gray-700">{perm.resource}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize ${actionClass(perm.action)}`}>
                      {perm.action}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell text-gray-500 max-w-xs truncate">
                    {perm.description || <span className="text-gray-300 italic">—</span>}
                  </td>
                  <td className="px-5 py-3.5 hidden sm:table-cell">
                    <span className="flex items-center gap-1 text-gray-500">
                      <Shield className="w-3.5 h-3.5" />
                      {perm._count?.rolePermissions ?? 0} role{(perm._count?.rolePermissions ?? 0) !== 1 ? 's' : ''}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <Can permissions={['permissions:write']}>
                        <button
                          onClick={() => openEdit(perm)}
                          className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </Can>
                      <Can permissions={['permissions:delete']}>
                        <button
                          onClick={() => setDeleteTarget(perm)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </Can>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination meta={meta} onPageChange={setPage} limit={limit} onLimitChange={changeLimit} />
      </div>

      {/* ── Create Modal ── */}
      <Modal
        open={createOpen}
        onClose={() => { setCreateOpen(false); createForm.clearErrors(); }}
        title="Create permission"
        subtitle="Permission name is auto-generated as resource:action"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              loading={createPerm.isPending}
              onClick={createForm.handleSubmit(data => createPerm.mutate(data))}
            >
              Create
            </Button>
          </>
        }
      >
        <PermissionFormFields form={createForm} existingResources={resources} />
      </Modal>

      {/* ── Edit Modal ── */}
      <Modal
        open={!!editTarget}
        onClose={() => { setEditTarget(null); editForm.clearErrors(); }}
        title="Edit permission"
        subtitle={editTarget ? `Editing: ${editTarget.name}` : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button
              loading={updatePerm.isPending}
              onClick={editForm.handleSubmit(data =>
                editTarget && updatePerm.mutate({ id: editTarget.id, data })
              )}
            >
              Save changes
            </Button>
          </>
        }
      >
        <PermissionFormFields form={editForm} existingResources={resources} />
      </Modal>

      {/* ── Delete Confirm Modal ── */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete permission"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={deletePerm.isPending}
              onClick={() => deleteTarget && deletePerm.mutate(deleteTarget.id)}
            >
              Yes, delete
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-gray-700 text-sm">
            Delete permission{' '}
            <span className="font-mono font-semibold text-gray-900">{deleteTarget?.name}</span>?
          </p>
          {(deleteTarget?._count?.rolePermissions ?? 0) > 0 && (
            <Alert
              variant="warning"
              message={`This permission is currently assigned to ${deleteTarget!._count!.rolePermissions} role(s). Deleting it will remove it from all of them.`}
            />
          )}
          <p className="text-xs text-gray-400">This action cannot be undone.</p>
        </div>
      </Modal>
    </div>
  );
};

// ── Shared form fields sub-component ─────────────────────────
type FormFieldProps = {
  form: ReturnType<typeof useForm<PermForm>>;
  existingResources: string[];
};

const PermissionFormFields: React.FC<FormFieldProps> = ({ form, existingResources }) => {
  const { register, watch, formState: { errors } } = form;
  const resource = watch('resource') ?? '';
  const action   = watch('action') ?? '';
  const preview  = resource && action ? `${resource.toLowerCase()}:${action.toLowerCase()}` : '';

  return (
    <div className="space-y-4">
      {/* Resource with datalist suggestions */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">
          Resource <span className="text-red-500">*</span>
        </label>
        <input
          list="resource-suggestions"
          placeholder="e.g. invoices"
          className={`block w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors ${
            errors.resource ? 'border-red-400' : 'border-gray-300'
          }`}
          {...register('resource')}
        />
        <datalist id="resource-suggestions">
          {existingResources.map(r => <option key={r} value={r} />)}
        </datalist>
        {errors.resource && <p className="text-xs text-red-600">{errors.resource.message}</p>}
      </div>

      <Input
        label="Action"
        required
        placeholder="e.g. read, write, delete, export"
        error={errors.action?.message}
        {...register('action')}
      />

      {preview && (
        <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          <Key className="w-3.5 h-3.5" />
          Permission name will be:{' '}
          <span className="font-mono font-semibold text-gray-800">{preview}</span>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Description</label>
        <textarea
          rows={2}
          placeholder="What does this permission allow?"
          className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors resize-none"
          {...register('description')}
        />
      </div>
    </div>
  );
};

export default Permissions;
