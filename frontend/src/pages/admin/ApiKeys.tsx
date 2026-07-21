import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { Plus, Copy, Check, KeyRound, Ban, Trash2, AlertTriangle } from 'lucide-react';
import { getApiKeys, createApiKey, revokeApiKey, deleteApiKey } from '../../api/apiKeys';
import type { ApiKey } from '../../types';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { Modal } from '../../components/ui/Modal';
import { Can } from '../../routes/RoleGuard';

const SCOPE_OPTIONS = [
  { value: 'clients:read',      label: 'Clients — read' },
  { value: 'appointments:read', label: 'Appointments — read' },
];

const errMsg = (e: unknown, fallback: string) => {
  const ae = e as AxiosError<{ message: string }>;
  return ae.response?.data?.message ?? fallback;
};

const fmtDate = (d?: string) => (d ? new Date(d).toLocaleString('en-GB') : '—');

const ApiKeys: React.FC = () => {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null);
  const [createdKey, setCreatedKey] = useState<ApiKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ name: '', scopes: [] as string[], expiresAt: '' });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const showSuccess = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); };

  const { data, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn:  () => getApiKeys(),
  });
  const keys: ApiKey[] = data?.data ?? [];

  const create = useMutation({
    mutationFn: () => createApiKey({
      name: form.name,
      scopes: form.scopes,
      expiresAt: form.expiresAt || undefined,
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      setCreateOpen(false);
      setCreatedKey(res.data ?? null);
      setForm({ name: '', scopes: [], expiresAt: '' });
    },
    onError: (e) => setError(errMsg(e, 'Failed to create API key')),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      setRevokeTarget(null);
      showSuccess('API key revoked');
    },
    onError: (e) => setError(errMsg(e, 'Failed to revoke API key')),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteApiKey(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      setDeleteTarget(null);
      showSuccess('API key deleted');
    },
    onError: (e) => setError(errMsg(e, 'Failed to delete API key')),
  });

  const toggleScope = (scope: string) => {
    setForm(f => ({
      ...f,
      scopes: f.scopes.includes(scope) ? f.scopes.filter(s => s !== scope) : [...f.scopes, scope],
    }));
  };

  const copyKey = async () => {
    if (!createdKey?.rawKey) return;
    await navigator.clipboard.writeText(createdKey.rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isExpired = (k: ApiKey) => !!k.expiresAt && new Date(k.expiresAt) < new Date();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
          <p className="text-gray-500 text-sm mt-1">
            Credentials for third-party integrations to read client &amp; appointment data without a user login.
          </p>
        </div>
        <Can permissions={['apikeys:write']}>
          <Button
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => { setForm({ name: '', scopes: [], expiresAt: '' }); setCreateOpen(true); }}
          >
            New API Key
          </Button>
        </Can>
      </div>

      {error   && <Alert variant="error"   message={error}   onClose={() => setError(null)} />}
      {success && <Alert variant="success" message={success} onClose={() => setSuccess(null)} />}

      <Alert
        variant="info"
        message='Third parties authenticate by sending the key in an "X-API-Key" header — see docs/PUBLIC_API.md for the full request format and endpoints.'
      />

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : keys.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <KeyRound className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500">No API keys yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Key</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Scopes</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Last Used</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {keys.map(k => (
                  <tr key={k.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{k.name}</p>
                      <p className="text-xs text-gray-400">Created {fmtDate(k.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">{k.keyPrefix}…</code>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {k.scopes.map(s => (
                          <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {!k.isActive ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Revoked</span>
                      ) : isExpired(k) ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Expired</span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(k.lastUsedAt)}</td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <Can permissions={['apikeys:write']}>
                          {k.isActive && (
                            <Button variant="outline" size="sm" leftIcon={<Ban className="w-3.5 h-3.5" />} onClick={() => setRevokeTarget(k)}>
                              Revoke
                            </Button>
                          )}
                        </Can>
                        <Can permissions={['apikeys:delete']}>
                          <Button variant="danger" size="sm" leftIcon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setDeleteTarget(k)}>
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
      </div>

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New API Key"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              loading={create.isPending}
              disabled={!form.name || form.scopes.length === 0}
              onClick={() => create.mutate()}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Name"
            required
            placeholder="e.g. Partner CRM Integration"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
          <div>
            <label className="text-sm font-medium text-gray-700">Scopes</label>
            <div className="mt-2 space-y-2">
              {SCOPE_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.scopes.includes(opt.value)}
                    onChange={() => toggleScope(opt.value)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Expires (optional)</label>
            <input
              type="date"
              min="1900-01-01"
              max="2099-12-31"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.expiresAt}
              onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
            />
          </div>
        </div>
      </Modal>

      {/* Reveal-once modal */}
      <Modal
        open={!!createdKey}
        onClose={() => setCreatedKey(null)}
        title="API key created"
        size="sm"
        footer={<Button onClick={() => setCreatedKey(null)}>Done — I've copied it</Button>}
      >
        <div className="space-y-3">
          <Alert variant="warning" message="Copy this key now — for security it will never be shown again. If it's lost, revoke it and create a new one." />
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
            <code className="text-xs text-gray-800 break-all flex-1">{createdKey?.rawKey}</code>
            <button
              onClick={copyKey}
              className="flex-shrink-0 p-1.5 rounded-md hover:bg-gray-200 text-gray-500"
              title="Copy to clipboard"
            >
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Give the third party this value in the <code className="bg-gray-100 px-1 rounded">X-API-Key</code> header on every request.
          </p>
        </div>
      </Modal>

      {/* Revoke confirm */}
      <Modal
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        title="Revoke API key"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>Cancel</Button>
            <Button variant="danger" loading={revoke.isPending} onClick={() => revokeTarget && revoke.mutate(revokeTarget.id)}>
              Revoke
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-gray-700">
            Revoking <span className="font-semibold">{revokeTarget?.name}</span> immediately stops it from authenticating. This can't be undone — create a new key if the integration needs to keep working.
          </p>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete API key"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" loading={del.isPending} onClick={() => deleteTarget && del.mutate(deleteTarget.id)}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-700">
          Permanently delete <span className="font-semibold">{deleteTarget?.name}</span>? This removes it from the list entirely — prefer Revoke if you just want to disable it while keeping the record.
        </p>
      </Modal>
    </div>
  );
};

export default ApiKeys;
