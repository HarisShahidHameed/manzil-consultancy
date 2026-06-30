import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { Plus, Users, Trash2, X, Pencil, UserPlus, Search, ChevronRight, Layers } from 'lucide-react';
import {
  getGroups, createGroup, updateGroup, deleteGroup, addGroupMembers, removeGroupMember,
} from '../../api/groups';
import { getClients } from '../../api/clients';
import type { ClientGroup, Client, ApiResponse } from '../../types';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { Modal } from '../../components/ui/Modal';
import { Can } from '../../routes/RoleGuard';

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

const Groups: React.FC = () => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [form, setForm] = useState({ name: '', relation: '', notes: '' });
  const [memberSearch, setMemberSearch] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn:  () => getGroups(),
  });
  const groups: ClientGroup[] = data?.data ?? [];

  const selected = useMemo(() => groups.find(g => g.id === selectedId) ?? null, [groups, selectedId]);
  useEffect(() => { if (!selectedId && groups.length) setSelectedId(groups[0].id); }, [groups, selectedId]);

  // Clients for the add-member picker
  const { data: clientsData } = useQuery({
    queryKey: ['clients', 'pick', memberSearch],
    queryFn:  () => getClients(memberSearch ? { search: memberSearch, limit: '50' } : { limit: '50' }),
    enabled:  addOpen,
  });
  const pickClients: Client[] = clientsData?.data ?? [];

  const showSuccess = (m: string) => { setSuccess(m); setTimeout(() => setSuccess(null), 3000); };
  const onErr = (e: AxiosError<{ message: string }>, f: string) => setError(e.response?.data?.message ?? f);

  const createMut = useMutation({
    mutationFn: () => createGroup({ name: form.name, relation: form.relation || undefined, notes: form.notes || undefined }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      const g = (res as ApiResponse<ClientGroup>).data;
      if (g) setSelectedId(g.id);
      setCreateOpen(false); setForm({ name: '', relation: '', notes: '' });
      showSuccess('Group created');
    },
    onError: (e: AxiosError<{ message: string }>) => onErr(e, 'Failed to create group'),
  });

  const editMut = useMutation({
    mutationFn: () => updateGroup(selected!.id, { name: form.name, relation: form.relation || undefined, notes: form.notes || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); setEditOpen(false); showSuccess('Group updated'); },
    onError: (e: AxiosError<{ message: string }>) => onErr(e, 'Failed to update group'),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteGroup(selected!.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); setDeleteOpen(false); setSelectedId(null); showSuccess('Group deleted'); },
    onError: (e: AxiosError<{ message: string }>) => onErr(e, 'Failed to delete group'),
  });

  const addMut = useMutation({
    mutationFn: () => addGroupMembers(selected!.id, picked),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      setAddOpen(false); setPicked([]); setMemberSearch('');
      showSuccess('Members added');
    },
    onError: (e: AxiosError<{ message: string }>) => onErr(e, 'Failed to add members'),
  });

  const removeMut = useMutation({
    mutationFn: (clientId: string) => removeGroupMember(selected!.id, clientId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); qc.invalidateQueries({ queryKey: ['clients'] }); showSuccess('Member removed'); },
    onError: (e: AxiosError<{ message: string }>) => onErr(e, 'Failed to remove member'),
  });

  const openEdit = () => { if (!selected) return; setForm({ name: selected.name, relation: selected.relation ?? '', notes: selected.notes ?? '' }); setEditOpen(true); };
  const togglePick = (id: string) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Client Groups</h1>
          <p className="text-gray-500 text-sm mt-1">{groups.length} groups · link families & friends applying together</p>
        </div>
        <Can permissions={['clients:write']}>
          <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => { setForm({ name: '', relation: '', notes: '' }); setCreateOpen(true); }}>
            New Group
          </Button>
        </Can>
      </div>

      {error   && <Alert variant="error"   message={error}   onClose={() => setError(null)} />}
      {success && <Alert variant="success" message={success} onClose={() => setSuccess(null)} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Group list */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Groups</h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{groups.length}</span>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : groups.length === 0 ? (
            <div className="text-center py-10 px-4">
              <Layers className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No groups yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 overflow-y-auto flex-1">
              {groups.map(g => (
                <button
                  key={g.id}
                  onClick={() => setSelectedId(g.id)}
                  className={`w-full text-left flex items-center justify-between px-4 py-3 transition-colors ${
                    selectedId === g.id ? 'bg-indigo-50 border-l-2 border-indigo-500' : 'hover:bg-gray-50 border-l-2 border-transparent'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{g.groupRef}</span>
                      <p className="text-sm font-medium text-gray-900 truncate">{g.name}</p>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {g.relation ? `${g.relation} · ` : ''}{g._count?.clients ?? g.clients?.length ?? 0} members
                    </p>
                  </div>
                  <ChevronRight className={`w-4 h-4 flex-shrink-0 ${selectedId === g.id ? 'text-indigo-500' : 'text-gray-300'}`} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Group detail */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 flex flex-col">
          {selected ? (
            <>
              <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-gray-900 text-lg">{selected.name}</h2>
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{selected.groupRef}</span>
                  </div>
                  {selected.relation && <p className="text-sm text-gray-500 mt-0.5">{selected.relation}</p>}
                  {selected.notes && <p className="text-xs text-gray-400 mt-1">{selected.notes}</p>}
                </div>
                <Can permissions={['clients:write']}>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" leftIcon={<Pencil className="w-3.5 h-3.5" />} onClick={openEdit}>Edit</Button>
                    <Can permissions={['clients:delete']}>
                      <Button variant="danger" size="sm" leftIcon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setDeleteOpen(true)}>Delete</Button>
                    </Can>
                  </div>
                </Can>
              </div>

              <div className="p-6 flex-1">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    Members ({selected.clients?.length ?? 0})
                  </h3>
                  <Can permissions={['clients:write']}>
                    <Button size="sm" leftIcon={<UserPlus className="w-3.5 h-3.5" />} onClick={() => { setPicked([]); setMemberSearch(''); setAddOpen(true); }}>
                      Add Members
                    </Button>
                  </Can>
                </div>

                {(selected.clients?.length ?? 0) === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No members yet — add clients to this group.</p>
                ) : (
                  <div className="space-y-2">
                    {selected.clients!.map(c => (
                      <div key={c.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-2.5 hover:border-indigo-200 transition-colors">
                        <button className="flex items-center gap-3 min-w-0 text-left" onClick={() => navigate(`/clients/${c.id}`)}>
                          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{c.clientRef}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{c.firstName} {c.lastName}</p>
                            <p className="text-xs text-gray-400">{c.nationality}{c.visaCases?.[0] ? ` · ${c.visaCases[0].destination}` : ''}</p>
                          </div>
                        </button>
                        <Can permissions={['clients:write']}>
                          <button
                            onClick={() => removeMut.mutate(c.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                            title="Remove from group"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </Can>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center p-10">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4"><Users className="w-8 h-8 text-gray-400" /></div>
              <p className="text-gray-600 font-medium">Select a group</p>
              <p className="text-gray-400 text-sm mt-1">Choose a group to view and manage its members</p>
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit modal */}
      <Modal
        open={createOpen || editOpen}
        onClose={() => { setCreateOpen(false); setEditOpen(false); }}
        title={editOpen ? 'Edit group' : 'Create group'}
        subtitle={editOpen ? selected?.groupRef : 'Group reference is generated automatically (GRP-001)'}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => { setCreateOpen(false); setEditOpen(false); }}>Cancel</Button>
            <Button loading={createMut.isPending || editMut.isPending} disabled={!form.name} onClick={() => (editOpen ? editMut.mutate() : createMut.mutate())}>
              {editOpen ? 'Save' : 'Create'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Group name <span className="text-red-500">*</span></label>
            <input className={`${inputCls} mt-1`} placeholder="e.g. Malik Family / 5 Friends Group" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Relation</label>
            <input className={`${inputCls} mt-1`} placeholder="Family / Friends / Couple / Brothers" value={form.relation} onChange={e => setForm(f => ({ ...f, relation: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Notes</label>
            <textarea className={`${inputCls} mt-1`} rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
      </Modal>

      {/* Add members modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add members"
        subtitle={selected ? `to ${selected.name}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button loading={addMut.isPending} disabled={picked.length === 0} onClick={() => addMut.mutate()}>
              Add {picked.length > 0 ? `(${picked.length})` : ''}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className={`${inputCls} pl-9`} placeholder="Search clients by name or ref…" value={memberSearch} onChange={e => setMemberSearch(e.target.value)} />
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {pickClients.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No clients found</p>
            ) : pickClients.map(c => {
              const inThis = c.groupId === selected?.id;
              const inOther = c.groupId && c.groupId !== selected?.id;
              return (
                <label key={c.id} className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 ${inThis ? 'opacity-50' : ''}`}>
                  <input type="checkbox" disabled={inThis} checked={picked.includes(c.id)} onChange={() => togglePick(c.id)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{c.clientRef}</span>
                  <span className="text-sm text-gray-800 flex-1">{c.firstName} {c.lastName}</span>
                  {inThis && <span className="text-xs text-green-600">already in group</span>}
                  {inOther && <span className="text-xs text-amber-600">will move from {c.group?.groupRef ?? 'another group'}</span>}
                </label>
              );
            })}
          </div>
          <p className="text-xs text-gray-400">A client belongs to one group; adding moves them from any previous group.</p>
        </div>
      </Modal>

      {/* Delete modal */}
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete group"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="danger" loading={deleteMut.isPending} onClick={() => deleteMut.mutate()}>Yes, delete</Button>
          </>
        }
      >
        <p className="text-sm text-gray-700">
          Delete <span className="font-semibold">{selected?.name}</span>? Members will be un-grouped but not deleted.
        </p>
      </Modal>
    </div>
  );
};

export default Groups;
