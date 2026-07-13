import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { Search, Receipt, Trash2, Edit, Download } from 'lucide-react';
import { getInvoices, deleteInvoice, updateInvoice, createInvoice } from '../../api/invoices';
import { downloadInvoicePdf } from '../../api/pdf';
import { getCases } from '../../api/cases';
import type { Invoice, InvoiceStatus, VisaCase } from '../../types';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { Modal } from '../../components/ui/Modal';
import { Pagination } from '../../components/ui/Pagination';
import { Can } from '../../routes/RoleGuard';

const INV_COLORS: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600', SENT: 'bg-blue-100 text-blue-700',
  PARTIAL: 'bg-yellow-100 text-yellow-700', PAID: 'bg-green-100 text-green-700',
};
const STATUSES: InvoiceStatus[] = ['DRAFT', 'SENT', 'PARTIAL', 'PAID'];

type TabStatus = 'ALL' | InvoiceStatus;
const TABS: { key: TabStatus; label: string }[] = [
  { key: 'ALL', label: 'All' }, { key: 'DRAFT', label: 'Draft' },
  { key: 'SENT', label: 'Sent' }, { key: 'PARTIAL', label: 'Partial' },
  { key: 'PAID', label: 'Paid' },
];

const fmtDate  = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-GB') : '—';
const fmtMoney = (v?: number | string | null) => v != null ? `£${parseFloat(String(v)).toFixed(2)}` : '—';
const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

const InvoiceList: React.FC = () => {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabStatus>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [newForm, setNewForm] = useState({ caseId: '', charges: '', discount: '', advance: '', dueDate: '', notes: '' });
  const [editForm, setEditForm] = useState({ charges: '', discount: '', advance: '', dueDate: '', notes: '', status: 'DRAFT' as InvoiceStatus });

  const params: Record<string, string> = { page: String(page), limit: String(limit) };
  if (tab !== 'ALL') params.status = tab;
  if (search) params.search = search;

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', tab, search, page, limit],
    queryFn:  () => getInvoices(params),
  });

  const changeLimit = (l: number) => { setLimit(l); setPage(1); };

  const { data: casesData } = useQuery({
    queryKey: ['cases-all'],
    queryFn:  () => getCases({ limit: '100' }),
  });
  const allCases: VisaCase[] = casesData?.data ?? [];

  const showSuccess = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); };
  const onErr = (e: AxiosError<{ message: string }>, fallback: string) => setError(e.response?.data?.message ?? fallback);

  const createMut = useMutation({
    mutationFn: () => createInvoice({
      caseId:   newForm.caseId,
      charges:  parseFloat(newForm.charges),
      discount: newForm.discount ? parseFloat(newForm.discount) : 0,
      advance:  newForm.advance  ? parseFloat(newForm.advance)  : 0,
      dueDate:  newForm.dueDate  || undefined,
      notes:    newForm.notes    || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      setCreateOpen(false);
      setNewForm({ caseId: '', charges: '', discount: '', advance: '', dueDate: '', notes: '' });
      showSuccess('Invoice created');
    },
    onError: (e: AxiosError<{ message: string }>) => onErr(e, 'Failed to create invoice'),
  });

  const editMut = useMutation({
    mutationFn: () => updateInvoice(editInvoice!.id, {
      charges:  editForm.charges  ? parseFloat(editForm.charges)  : undefined,
      discount: editForm.discount ? parseFloat(editForm.discount) : undefined,
      advance:  editForm.advance  ? parseFloat(editForm.advance)  : undefined,
      dueDate:  editForm.dueDate  || undefined,
      notes:    editForm.notes    || undefined,
      status:   editForm.status   || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      setEditInvoice(null);
      showSuccess('Invoice updated');
    },
    onError: (e: AxiosError<{ message: string }>) => onErr(e, 'Failed to update invoice'),
  });

  // Inline status change (payment is handled manually — we only track status)
  const statusMut = useMutation({
    mutationFn: (vars: { id: string; status: InvoiceStatus }) => updateInvoice(vars.id, { status: vars.status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      showSuccess('Status updated');
    },
    onError: (e: AxiosError<{ message: string }>) => onErr(e, 'Failed to update status'),
  });

  const delMut = useMutation({
    mutationFn: deleteInvoice,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      showSuccess('Invoice deleted');
    },
    onError: (e: AxiosError<{ message: string }>) => onErr(e, 'Failed to delete invoice'),
  });

  const handleDownload = async (inv: Invoice) => {
    try { setDownloadingId(inv.id); await downloadInvoicePdf(inv.id, inv.invoiceRef); }
    catch { setError('Failed to download receipt'); }
    finally { setDownloadingId(null); }
  };

  const openEdit = (inv: Invoice) => {
    setEditInvoice(inv);
    setEditForm({
      charges:  String(parseFloat(String(inv.charges)).toFixed(2)),
      discount: String(parseFloat(String(inv.discount)).toFixed(2)),
      advance:  String(parseFloat(String(inv.advance)).toFixed(2)),
      dueDate:  inv.dueDate?.split('T')[0] ?? '',
      notes:    inv.notes ?? '',
      status:   inv.status,
    });
  };

  const invoices: Invoice[] = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-500 text-sm mt-1">{meta?.total ?? 0} invoices · payment recorded manually, set status here</p>
        </div>
        <Can permissions={['invoices:write']}>
          <Button leftIcon={<Receipt className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>
            Create Invoice
          </Button>
        </Can>
      </div>

      {error   && <Alert variant="error"   message={error}   onClose={() => setError(null)} />}
      {success && <Alert variant="success" message={success} onClose={() => setSuccess(null)} />}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setPage(1); }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Input
            placeholder="Search by ref, client name..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            leftIcon={<Search className="w-4 h-4" />}
            className="max-w-xs"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48">
            <Receipt className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500">No invoices found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Invoice</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Charges</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Total</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Issued</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((inv: Invoice) => (
                  <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-indigo-600">{inv.invoiceRef}</p>
                      <p className="text-xs text-gray-400">{inv.case?.destination}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">
                        {inv.case?.client?.firstName} {inv.case?.client?.lastName}
                      </p>
                      <p className="text-xs text-gray-400">{inv.case?.client?.clientRef}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{fmtMoney(inv.charges)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{fmtMoney(inv.totalAmount)}</td>
                    <td className="px-4 py-3">
                      <Can
                        permissions={['invoices:write']}
                        fallback={
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${INV_COLORS[inv.status]}`}>
                            {inv.status}
                          </span>
                        }
                      >
                        <select
                          value={inv.status}
                          disabled={statusMut.isPending}
                          onChange={e => statusMut.mutate({ id: inv.id, status: e.target.value as InvoiceStatus })}
                          className={`text-xs font-medium rounded-full border-0 px-2 py-1 cursor-pointer focus:ring-2 focus:ring-indigo-500 ${INV_COLORS[inv.status]}`}
                        >
                          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </Can>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(inv.issueDate)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline" size="sm" leftIcon={<Download className="w-3.5 h-3.5" />}
                          loading={downloadingId === inv.id}
                          onClick={() => handleDownload(inv)}
                        >
                          Receipt
                        </Button>
                        <Can permissions={['invoices:write']}>
                          <Button variant="ghost" size="sm" leftIcon={<Edit className="w-3.5 h-3.5" />} onClick={() => openEdit(inv)}>
                            Edit
                          </Button>
                        </Can>
                        <Can permissions={['invoices:delete']}>
                          <Button variant="danger" size="sm" leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                            onClick={() => { if (confirm('Delete this invoice?')) delMut.mutate(inv.id); }}
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

        <Pagination meta={meta} onPageChange={setPage} limit={limit} onLimitChange={changeLimit} />
      </div>

      {/* Create Invoice Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Invoice"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button loading={createMut.isPending} disabled={!newForm.caseId || !newForm.charges} onClick={() => createMut.mutate()}>Create</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Case <span className="text-red-500">*</span></label>
            <select className={`${inputCls} mt-1`} value={newForm.caseId} onChange={e => setNewForm(f => ({ ...f, caseId: e.target.value }))}>
              <option value="">Select a case...</option>
              {allCases.map(c => (
                <option key={c.id} value={c.id}>
                  {c.client?.clientRef} — {c.client?.firstName} {c.client?.lastName} — {c.destination}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Charges (£) <span className="text-red-500">*</span></label>
            <input type="number" min="0" step="0.01" className={`${inputCls} mt-1`} value={newForm.charges} onChange={e => setNewForm(f => ({ ...f, charges: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Discount (£)</label>
              <input type="number" min="0" step="0.01" className={`${inputCls} mt-1`} value={newForm.discount} onChange={e => setNewForm(f => ({ ...f, discount: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Advance (£)</label>
              <input type="number" min="0" step="0.01" className={`${inputCls} mt-1`} value={newForm.advance} onChange={e => setNewForm(f => ({ ...f, advance: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Due Date</label>
            <input type="date" min="1900-01-01" max="2099-12-31" className={`${inputCls} mt-1`} value={newForm.dueDate} onChange={e => setNewForm(f => ({ ...f, dueDate: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Notes</label>
            <textarea className={`${inputCls} mt-1`} rows={2} value={newForm.notes} onChange={e => setNewForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
      </Modal>

      {/* Edit Invoice Modal */}
      <Modal
        open={!!editInvoice}
        onClose={() => setEditInvoice(null)}
        title="Edit Invoice"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditInvoice(null)}>Cancel</Button>
            <Button loading={editMut.isPending} onClick={() => editMut.mutate()}>Save</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Charges (£)</label>
              <input type="number" min="0" step="0.01" className={`${inputCls} mt-1`} value={editForm.charges} onChange={e => setEditForm(f => ({ ...f, charges: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Discount (£)</label>
              <input type="number" min="0" step="0.01" className={`${inputCls} mt-1`} value={editForm.discount} onChange={e => setEditForm(f => ({ ...f, discount: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Advance (£)</label>
              <input type="number" min="0" step="0.01" className={`${inputCls} mt-1`} value={editForm.advance} onChange={e => setEditForm(f => ({ ...f, advance: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Status</label>
              <select className={`${inputCls} mt-1`} value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value as InvoiceStatus }))}>
                <option value="DRAFT">Draft</option><option value="SENT">Sent</option>
                <option value="PARTIAL">Partial</option><option value="PAID">Paid</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Due Date</label>
            <input type="date" min="1900-01-01" max="2099-12-31" className={`${inputCls} mt-1`} value={editForm.dueDate} onChange={e => setEditForm(f => ({ ...f, dueDate: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Notes</label>
            <textarea className={`${inputCls} mt-1`} rows={2} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default InvoiceList;
