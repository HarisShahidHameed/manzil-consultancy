import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { ArrowLeft, Save, ChevronRight, Plus, Lock, UserCircle, Download, PauseCircle, PlayCircle, Receipt } from 'lucide-react';
import { getCase, updateCase } from '../../api/cases';
import { updateClient } from '../../api/clients';
import { getAssignableUsers } from '../../api/users';
import { createInvoice } from '../../api/invoices';
import { downloadAdvanceReceipt, downloadInvoicePdf } from '../../api/pdf';
import type { AssignableUser, CaseStage, DocumentStatus, InvoiceStatus, MaritalStatus, VisaCase } from '../../types';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { Modal } from '../../components/ui/Modal';
import { Can } from '../../routes/RoleGuard';

const STAGE_ORDER: CaseStage[] = ['INTAKE', 'APPOINTMENT', 'FILE_PROCESSING', 'INVOICED', 'COMPLETED'];
const STAGE_LABELS: Record<CaseStage, string> = {
  INTAKE: 'Intake', APPOINTMENT: 'Appointment', FILE_PROCESSING: 'File Processing',
  INVOICED: 'Invoiced', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
};
const STAGE_COLORS: Record<CaseStage, string> = {
  INTAKE: 'bg-gray-100 text-gray-700', APPOINTMENT: 'bg-blue-100 text-blue-700',
  FILE_PROCESSING: 'bg-yellow-100 text-yellow-700', INVOICED: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-green-100 text-green-700', CANCELLED: 'bg-red-100 text-red-700',
};
const DOC_COLORS: Record<DocumentStatus, string> = {
  PENDING: 'bg-gray-100 text-gray-600', IN_PROGRESS: 'bg-blue-100 text-blue-700',
  DONE: 'bg-green-100 text-green-700', NOT_REQUIRED: 'bg-slate-100 text-slate-500',
};
const INV_COLORS: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600', SENT: 'bg-blue-100 text-blue-700',
  PARTIAL: 'bg-yellow-100 text-yellow-700', PAID: 'bg-green-100 text-green-700',
};

const APPT_ROLES = ['APPOINTMENT_TEAM', 'HR_MANAGER', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'];
const FILE_ROLES = ['FILE_TEAM', 'HR_MANAGER', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'];

const fmtMoney = (v?: number | string | null) => v != null ? `£${parseFloat(String(v)).toFixed(2)}` : '—';
const num = (v?: number | string | null) => (v != null && v !== '' ? parseFloat(String(v)) : 0);
const toNum = (v?: number | string | null) => (v !== '' && v != null ? parseFloat(String(v)) : undefined);

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

type DocKey = 'docAppointment' | 'docTicket' | 'docInsurance' | 'docHotel' | 'docEVisa' | 'docSop' | 'docVisaForm';
const DOC_LABELS: Record<DocKey, string> = {
  docAppointment: 'Appointment Docs', docTicket: 'Ticket',
  docInsurance: 'Insurance', docHotel: 'Hotel', docEVisa: 'E-Visa',
  docSop: 'SOP', docVisaForm: 'Visa Form',
};
const DOC_COST_KEY: Record<DocKey, keyof VisaCase> = {
  docAppointment: 'docAppointmentCost', docTicket: 'docTicketCost', docInsurance: 'docInsuranceCost',
  docHotel: 'docHotelCost', docEVisa: 'docEVisaCost', docSop: 'docSopCost', docVisaForm: 'docVisaFormCost',
};
const APPT_STATUS_OPTS: { value: string; label: string }[] = [
  { value: '', label: '— None —' },
  { value: 'WAITING', label: 'Waiting' },
  { value: 'REGISTERED', label: 'Registered' },
  { value: 'ASSIGNED', label: 'Assigned' },
];

interface ClientFields {
  residentialAddress: string;
  email: string;
  maritalStatus: MaritalStatus | '';
  previousSchengenVisa: string;
  visaAndTravelHistory: string;
}

const CaseDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Partial<VisaCase>>({});
  const [clientFields, setClientFields] = useState<ClientFields>({
    residentialAddress: '', email: '', maritalStatus: '', previousSchengenVisa: '', visaAndTravelHistory: '',
  });
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ charges: '', discount: '', advance: '', dueDate: '', notes: '' });
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['case', id],
    queryFn:  () => getCase(id!),
    enabled:  !!id,
  });

  const { data: usersData } = useQuery({
    queryKey: ['assignable-users'],
    queryFn:  () => getAssignableUsers(),
  });
  const assignableUsers: AssignableUser[] = usersData?.data ?? [];
  const apptUsers = assignableUsers.filter(u => u.roles.some(r => APPT_ROLES.includes(r)));
  const fileUsers = assignableUsers.filter(u => u.roles.some(r => FILE_ROLES.includes(r)));

  const vc = data?.data;

  useEffect(() => {
    if (vc) {
      setEditFields({
        priority: vc.priority,
        appointmentDate: vc.appointmentDate?.split('T')[0] ?? '',
        fraNo: vc.fraNo ?? '',
        tlsAccount: vc.tlsAccount ?? '',
        appointmentNotes: vc.appointmentNotes ?? '',
        travelDate: vc.travelDate?.split('T')[0] ?? '',
        hotelDate: vc.hotelDate?.split('T')[0] ?? '',
        salamComments: vc.salamComments ?? '',
        hrComments: vc.hrComments ?? '',
        docAppointment: vc.docAppointment,
        docTicket: vc.docTicket,
        docInsurance: vc.docInsurance,
        docHotel: vc.docHotel,
        docEVisa: vc.docEVisa,
        docSop: vc.docSop,
        docVisaForm: vc.docVisaForm,
        charges: vc.charges,
        discount: vc.discount,
        advance: vc.advance,
        paymentReceived: vc.paymentReceived,
      });
      setClientFields({
        residentialAddress: vc.client?.residentialAddress ?? '',
        email: vc.client?.email ?? '',
        maritalStatus: vc.client?.maritalStatus ?? '',
        previousSchengenVisa: vc.client?.previousSchengenVisa ?? '',
        visaAndTravelHistory: vc.client?.visaAndTravelHistory ?? '',
      });
    }
  }, [vc?.id]);

  const showSuccess = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); };
  const onErr = (e: AxiosError<{ message: string }>, fallback: string) =>
    setError(e.response?.data?.message ?? fallback);

  const saveOnboardingMut = useMutation({
    mutationFn: () => updateCase(id!, {
      charges:  toNum(editFields.charges),
      discount: toNum(editFields.discount),
      advance:  toNum(editFields.advance),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case', id] });
      qc.invalidateQueries({ queryKey: ['cases'] });
      showSuccess('Onboarding saved');
    },
    onError: (e: AxiosError<{ message: string }>) => onErr(e, 'Failed to save'),
  });

  const saveAppointmentMut = useMutation({
    mutationFn: () => updateCase(id!, {
      priority:         editFields.priority,
      appointmentDate:  (editFields.appointmentDate as string) || undefined,
      fraNo:            (editFields.fraNo as string) || undefined,
      tlsAccount:       (editFields.tlsAccount as string) || undefined,
      appointmentNotes: (editFields.appointmentNotes as string) || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case', id] });
      qc.invalidateQueries({ queryKey: ['cases'] });
      showSuccess('Appointment details saved');
    },
    onError: (e: AxiosError<{ message: string }>) => onErr(e, 'Failed to save'),
  });

  const saveFileMut = useMutation({
    mutationFn: () => updateCase(id!, {
      travelDate:    (editFields.travelDate as string) || undefined,
      hotelDate:     (editFields.hotelDate as string) || undefined,
      salamComments: (editFields.salamComments as string) || undefined,
      hrComments:    (editFields.hrComments as string) || undefined,
      docAppointment: editFields.docAppointment,
      docTicket:      editFields.docTicket,
      docInsurance:   editFields.docInsurance,
      docHotel:       editFields.docHotel,
      docEVisa:       editFields.docEVisa,
      docSop:         editFields.docSop,
      docVisaForm:    editFields.docVisaForm,
      docAppointmentCost: toNum(editFields.docAppointmentCost),
      docTicketCost:      toNum(editFields.docTicketCost),
      docInsuranceCost:   toNum(editFields.docInsuranceCost),
      docHotelCost:       toNum(editFields.docHotelCost),
      docEVisaCost:       toNum(editFields.docEVisaCost),
      docSopCost:         toNum(editFields.docSopCost),
      docVisaFormCost:    toNum(editFields.docVisaFormCost),
      charges:         toNum(editFields.charges),
      discount:        toNum(editFields.discount),
      advance:         toNum(editFields.advance),
      paymentReceived: toNum(editFields.paymentReceived),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case', id] });
      qc.invalidateQueries({ queryKey: ['cases'] });
      showSuccess('File processing saved');
    },
    onError: (e: AxiosError<{ message: string }>) => onErr(e, 'Failed to save'),
  });

  const saveClientMut = useMutation({
    mutationFn: () => updateClient(vc!.client!.id, {
      residentialAddress: clientFields.residentialAddress || undefined,
      email: clientFields.email || undefined,
      maritalStatus: clientFields.maritalStatus || undefined,
      previousSchengenVisa: clientFields.previousSchengenVisa || undefined,
      visaAndTravelHistory: clientFields.visaAndTravelHistory || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case', id] });
      showSuccess('Client information saved');
    },
    onError: (e: AxiosError<{ message: string }>) => onErr(e, 'Failed to save client info'),
  });

  // Generic immediate patch (assignment, advance-paid toggle, pause/resume)
  const patchMut = useMutation({
    mutationFn: (vars: { patch: Record<string, unknown>; msg: string }) => updateCase(id!, vars.patch),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['case', id] });
      qc.invalidateQueries({ queryKey: ['cases'] });
      showSuccess(vars.msg);
    },
    onError: (e: AxiosError<{ message: string }>) => onErr(e, 'Update failed'),
  });

  const advanceStageMut = useMutation({
    mutationFn: () => {
      const idx = STAGE_ORDER.indexOf(vc!.stage);
      const next = STAGE_ORDER[idx + 1];
      return updateCase(id!, { stage: next });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case', id] });
      qc.invalidateQueries({ queryKey: ['cases'] });
      showSuccess('Stage advanced');
    },
    onError: (e: AxiosError<{ message: string }>) => onErr(e, 'Failed to advance stage'),
  });

  const cancelMut = useMutation({
    mutationFn: () => updateCase(id!, { stage: 'CANCELLED' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case', id] });
      qc.invalidateQueries({ queryKey: ['cases'] });
      showSuccess('Case cancelled');
    },
    onError: (e: AxiosError<{ message: string }>) => onErr(e, 'Failed to cancel'),
  });

  const createInvMut = useMutation({
    mutationFn: () => createInvoice({
      caseId: id!,
      charges:  parseFloat(invoiceForm.charges),
      discount: invoiceForm.discount  ? parseFloat(invoiceForm.discount) : 0,
      advance:  invoiceForm.advance   ? parseFloat(invoiceForm.advance)  : 0,
      dueDate:  invoiceForm.dueDate   || undefined,
      notes:    invoiceForm.notes     || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case', id] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      setInvoiceOpen(false);
      setInvoiceForm({ charges: '', discount: '', advance: '', dueDate: '', notes: '' });
      showSuccess('Invoice created');
    },
    onError: (e: AxiosError<{ message: string }>) => onErr(e, 'Failed to create invoice'),
  });

  const handleDownload = async (fn: () => Promise<void>) => {
    try { setDownloading(true); await fn(); } catch { setError('Failed to download PDF'); }
    finally { setDownloading(false); }
  };

  const setEF = (k: keyof VisaCase) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setEditFields(f => ({ ...f, [k]: e.target.value }));
  const setCF = (k: keyof ClientFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setClientFields(f => ({ ...f, [k]: e.target.value }));

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!vc) return (
    <div className="text-center py-16">
      <p className="text-gray-500">Case not found.</p>
      <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>Back</Button>
    </div>
  );

  const stageIdx = STAGE_ORDER.indexOf(vc.stage);
  const isTerminal = vc.stage === 'COMPLETED' || vc.stage === 'CANCELLED';
  const canAdvance = stageIdx >= 0 && stageIdx < STAGE_ORDER.length - 1;
  const nextStage = canAdvance ? STAGE_ORDER[stageIdx + 1] : null;

  const caseDue = num(vc.charges) - num(vc.discount) - num(vc.advance) - num(vc.paymentReceived);
  const unpaidInvoices = (vc.invoices ?? []).filter(i => i.status !== 'PAID');

  // Gate reason blocking the next transition (mirrors backend enforcement)
  let gateReason: string | null = null;
  if (vc.onHold) {
    gateReason = 'This case is paused. Resume it to continue the workflow.';
  } else if (vc.stage === 'INTAKE' && !vc.advancePaid) {
    gateReason = 'Mark the advance payment as paid (below) before moving out of Intake.';
  } else if (vc.stage === 'INVOICED' && unpaidInvoices.length > 0) {
    gateReason = `All invoices must be marked Paid before completing (${unpaidInvoices.length} outstanding).`;
  }

  const togglePause = () => {
    if (vc.onHold) {
      patchMut.mutate({ patch: { onHold: false, onHoldReason: '' }, msg: 'Case resumed' });
    } else {
      const reason = window.prompt('Reason for pausing this case (optional):') ?? '';
      patchMut.mutate({ patch: { onHold: true, onHoldReason: reason }, msg: 'Case paused' });
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
              {vc.client?.clientRef}
            </span>
            <h1 className="text-xl font-bold text-gray-900">
              {vc.client?.firstName} {vc.client?.lastName}
            </h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STAGE_COLORS[vc.stage]}`}>
              {STAGE_LABELS[vc.stage]}
            </span>
            {vc.onHold && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 flex items-center gap-1">
                <PauseCircle className="w-3 h-3" /> Paused
              </span>
            )}
          </div>
          <p className="text-gray-500 text-sm mt-0.5">{vc.destination} · {vc.client?.phone}</p>
        </div>
        {!isTerminal && (
          <div className="flex items-center gap-2">
            <Can permissions={['appointments:write', 'files:write', 'clients:write']} requireAll={false}>
              <Button
                variant="outline"
                size="sm"
                leftIcon={vc.onHold ? <PlayCircle className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />}
                loading={patchMut.isPending}
                onClick={togglePause}
              >
                {vc.onHold ? 'Resume' : 'Pause'}
              </Button>
            </Can>
            <Can permissions={['clients:write']}>
              <Button
                variant="outline"
                size="sm"
                loading={cancelMut.isPending}
                onClick={() => { if (confirm('Cancel this case? This stops the workflow.')) cancelMut.mutate(); }}
              >
                Cancel Case
              </Button>
            </Can>
          </div>
        )}
      </div>

      {error   && <Alert variant="error"   message={error}   onClose={() => setError(null)} />}
      {success && <Alert variant="success" message={success} onClose={() => setSuccess(null)} />}

      {vc.onHold && (
        <Alert variant="warning" message={`This case is paused${vc.onHoldReason ? ` — ${vc.onHoldReason}` : ''}. Resume it to continue.`} />
      )}

      {/* Stage Stepper */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {STAGE_ORDER.map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
                vc.stage === s ? STAGE_COLORS[s] : i < stageIdx ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-400'
              }`}>
                {i < stageIdx && '✓ '}{STAGE_LABELS[s]}
              </div>
              {i < STAGE_ORDER.length - 1 && (
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
              )}
            </React.Fragment>
          ))}
        </div>

        {vc.stage === 'CANCELLED' && (
          <div className="mt-4"><Alert variant="error" message="This case has been cancelled." /></div>
        )}

        {canAdvance && !isTerminal && (
          <div className="mt-4 space-y-2">
            {gateReason && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <Lock className="w-3.5 h-3.5 flex-shrink-0" />
                {gateReason}
              </div>
            )}
            <Can permissions={['appointments:write', 'files:write', 'invoices:write', 'clients:write']} requireAll={false}>
              <Button
                size="sm"
                loading={advanceStageMut.isPending}
                disabled={!!gateReason}
                onClick={() => {
                  if (nextStage && confirm(`Move to ${STAGE_LABELS[nextStage]}?`)) advanceStageMut.mutate();
                }}
              >
                Advance to {nextStage && STAGE_LABELS[nextStage]}
              </Button>
            </Can>
          </div>
        )}
      </div>

      {/* Onboarding — charges, advance & advance receipt (Intake) */}
      {vc.stage === 'INTAKE' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Onboarding — Charges & Advance</h3>
            <Can permissions={['appointments:write', 'clients:write']} requireAll={false}>
              <Button size="sm" leftIcon={<Save className="w-3.5 h-3.5" />} loading={saveOnboardingMut.isPending} onClick={() => saveOnboardingMut.mutate()}>
                Save
              </Button>
            </Can>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-500">Service Charges (£)</label>
              <input type="number" min="0" step="0.01" className={`${inputCls} mt-1`} value={editFields.charges as string ?? ''} onChange={setEF('charges')} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Discount (£)</label>
              <input type="number" min="0" step="0.01" className={`${inputCls} mt-1`} value={editFields.discount as string ?? ''} onChange={setEF('discount')} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Advance Amount (£)</label>
              <input type="number" min="0" step="0.01" className={`${inputCls} mt-1`} value={editFields.advance as string ?? ''} onChange={setEF('advance')} />
            </div>
          </div>

          {/* Advance paid status + receipt */}
          <div className="flex flex-wrap items-center justify-between gap-3 border border-gray-100 bg-gray-50/60 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <Can permissions={['appointments:write', 'clients:write']} requireAll={false}>
                <button
                  type="button"
                  disabled={patchMut.isPending}
                  onClick={() => patchMut.mutate({ patch: { advancePaid: !vc.advancePaid }, msg: vc.advancePaid ? 'Advance marked unpaid' : 'Advance marked paid' })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${vc.advancePaid ? 'bg-green-500' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${vc.advancePaid ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </Can>
              <div>
                <p className="text-sm font-medium text-gray-800">
                  Advance Payment: <span className={vc.advancePaid ? 'text-green-600' : 'text-red-600'}>{vc.advancePaid ? 'Paid' : 'Unpaid'}</span>
                </p>
                <p className="text-xs text-gray-400">
                  {fmtMoney(vc.advance)}{vc.advancePaid && vc.advancePaidDate ? ` · paid ${new Date(vc.advancePaidDate).toLocaleDateString('en-GB')}` : ''}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download className="w-3.5 h-3.5" />}
              loading={downloading}
              disabled={!vc.advancePaid}
              onClick={() => handleDownload(() => downloadAdvanceReceipt(vc.id, vc.client!.clientRef))}
            >
              Advance Receipt
            </Button>
          </div>
          <p className="text-xs text-gray-400">Mark the advance as paid to unlock progression to the Appointment stage and enable the receipt.</p>
        </div>
      )}

      {/* Appointment Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Appointment Details</h3>
          <Can permissions={['appointments:write', 'clients:write']} requireAll={false}>
            <Button size="sm" leftIcon={<Save className="w-3.5 h-3.5" />} loading={saveAppointmentMut.isPending} onClick={() => saveAppointmentMut.mutate()}>
              Save
            </Button>
          </Can>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-gray-500 flex items-center gap-1"><UserCircle className="w-3.5 h-3.5" /> Appointment Team Assignee</label>
            <select
              className={`${inputCls} mt-1`}
              value={vc.appointmentAssignedToId ?? ''}
              disabled={patchMut.isPending}
              onChange={e => e.target.value && patchMut.mutate({ patch: { appointmentAssignedToId: e.target.value }, msg: 'Assignment updated' })}
            >
              <option value="">— Unassigned —</option>
              {apptUsers.map(u => (
                <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Appointment Status</label>
            <select
              className={`${inputCls} mt-1`}
              value={vc.appointmentStatus ?? ''}
              disabled={patchMut.isPending}
              onChange={e => patchMut.mutate({ patch: { appointmentStatus: e.target.value || null }, msg: 'Appointment status updated' })}
            >
              {APPT_STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 flex items-center gap-1"><UserCircle className="w-3.5 h-3.5" /> Booked By</label>
            <select
              className={`${inputCls} mt-1`}
              value={vc.bookedById ?? ''}
              disabled={patchMut.isPending}
              onChange={e => e.target.value && patchMut.mutate({ patch: { bookedById: e.target.value }, msg: 'Booked-by updated' })}
            >
              <option value="">— Not set —</option>
              {apptUsers.map(u => (
                <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Priority</label>
            <select className={`${inputCls} mt-1`} value={editFields.priority ?? vc.priority} onChange={setEF('priority')}>
              <option value="LOW">Low</option><option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option><option value="URGENT">Urgent</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Appointment Date</label>
            <input type="date" className={`${inputCls} mt-1`} value={editFields.appointmentDate as string ?? ''} onChange={setEF('appointmentDate')} />
          </div>
          <div>
            <label className="text-xs text-gray-500">FRA No.</label>
            <input className={`${inputCls} mt-1`} value={editFields.fraNo as string ?? ''} onChange={setEF('fraNo')} />
          </div>
          <div>
            <label className="text-xs text-gray-500">TLS Account</label>
            <input className={`${inputCls} mt-1`} value={editFields.tlsAccount as string ?? ''} onChange={setEF('tlsAccount')} />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500">Appointment Notes</label>
          <textarea className={`${inputCls} mt-1`} rows={3} value={editFields.appointmentNotes as string ?? ''} onChange={setEF('appointmentNotes')} />
        </div>
      </div>

      {/* File Processing Section */}
      {(stageIdx >= 2 || vc.stage === 'FILE_PROCESSING') && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">File Processing</h3>
            <Can permissions={['files:write', 'clients:write']} requireAll={false}>
              <Button size="sm" leftIcon={<Save className="w-3.5 h-3.5" />} loading={saveFileMut.isPending} onClick={() => saveFileMut.mutate()}>
                Save
              </Button>
            </Can>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-500 flex items-center gap-1"><UserCircle className="w-3.5 h-3.5" /> File Team Assignee</label>
              <select
                className={`${inputCls} mt-1`}
                value={vc.fileAssignedToId ?? ''}
                disabled={patchMut.isPending}
                onChange={e => e.target.value && patchMut.mutate({ patch: { fileAssignedToId: e.target.value }, msg: 'Assignment updated' })}
              >
                <option value="">— Unassigned —</option>
                {fileUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Travel Date</label>
              <input type="date" className={`${inputCls} mt-1`} value={editFields.travelDate as string ?? ''} onChange={setEF('travelDate')} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Hotel Date</label>
              <input type="date" className={`${inputCls} mt-1`} value={editFields.hotelDate as string ?? ''} onChange={setEF('hotelDate')} />
            </div>
          </div>

          {/* Remaining client info collected at file stage */}
          <div className="border border-gray-100 rounded-lg p-4 bg-gray-50/50 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-gray-600">Client Information (collected at this stage)</h4>
              <Can permissions={['files:write', 'clients:write']} requireAll={false}>
                <Button size="sm" variant="outline" leftIcon={<Save className="w-3.5 h-3.5" />} loading={saveClientMut.isPending} onClick={() => saveClientMut.mutate()}>
                  Save Info
                </Button>
              </Can>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-gray-500">Marital Status</label>
                <select className={`${inputCls} mt-1`} value={clientFields.maritalStatus} onChange={setCF('maritalStatus')}>
                  <option value="">— Select —</option>
                  <option value="SINGLE">Single</option>
                  <option value="MARRIED">Married</option>
                  <option value="DIVORCED">Divorced</option>
                  <option value="WIDOWED">Widowed</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Email</label>
                <input type="email" className={`${inputCls} mt-1`} value={clientFields.email} onChange={setCF('email')} />
              </div>
              <div>
                <label className="text-xs text-gray-500">Current Address</label>
                <input className={`${inputCls} mt-1`} value={clientFields.residentialAddress} onChange={setCF('residentialAddress')} />
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500">Previous Schengen Visa Details</label>
                <textarea className={`${inputCls} mt-1`} rows={2} value={clientFields.previousSchengenVisa} onChange={setCF('previousSchengenVisa')} placeholder="Prior Schengen visas, dates, type…" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Travel History</label>
                <textarea className={`${inputCls} mt-1`} rows={2} value={clientFields.visaAndTravelHistory} onChange={setCF('visaAndTravelHistory')} placeholder="Countries visited…" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500">Salam Comments</label>
              <textarea className={`${inputCls} mt-1`} rows={2} value={editFields.salamComments as string ?? ''} onChange={setEF('salamComments')} />
            </div>
            <div>
              <label className="text-xs text-gray-500">HR Comments</label>
              <textarea className={`${inputCls} mt-1`} rows={2} value={editFields.hrComments as string ?? ''} onChange={setEF('hrComments')} />
            </div>
          </div>

          {/* Document Checklist */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 mb-2">Document Checklist</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs text-gray-500">Document</th>
                    <th className="text-left px-3 py-2 text-xs text-gray-500">Status</th>
                    <th className="text-left px-3 py-2 text-xs text-gray-500">Cost (£)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(Object.keys(DOC_LABELS) as DocKey[]).map(key => {
                    const costKey = DOC_COST_KEY[key];
                    return (
                    <tr key={key}>
                      <td className="px-3 py-2 font-medium text-gray-700">{DOC_LABELS[key]}</td>
                      <td className="px-3 py-2">
                        <select
                          className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          value={editFields[key] as DocumentStatus ?? vc[key]}
                          onChange={e => setEditFields(f => ({ ...f, [key]: e.target.value as DocumentStatus }))}
                        >
                          <option value="PENDING">Pending</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="DONE">Done</option>
                          <option value="NOT_REQUIRED">Not Required</option>
                        </select>
                        {' '}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DOC_COLORS[editFields[key] as DocumentStatus ?? vc[key]]}`}>
                          {(editFields[key] as string ?? vc[key]).replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number" min="0" step="0.01"
                          className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="0.00"
                          value={String((editFields[costKey] as string | number | undefined) ?? vc[costKey] ?? '')}
                          onChange={e => setEditFields(f => ({ ...f, [costKey]: e.target.value }))}
                        />
                      </td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 mb-2">Payment</h4>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-gray-500">Charges (£)</label>
                <input type="number" min="0" step="0.01" className={`${inputCls} mt-1`} value={editFields.charges as string ?? ''} onChange={setEF('charges')} />
              </div>
              <div>
                <label className="text-xs text-gray-500">Discount (£)</label>
                <input type="number" min="0" step="0.01" className={`${inputCls} mt-1`} value={editFields.discount as string ?? ''} onChange={setEF('discount')} />
              </div>
              <div>
                <label className="text-xs text-gray-500">Advance (£)</label>
                <input type="number" min="0" step="0.01" className={`${inputCls} mt-1`} value={editFields.advance as string ?? ''} onChange={setEF('advance')} />
              </div>
              <div>
                <label className="text-xs text-gray-500">Payment Received (£)</label>
                <input type="number" min="0" step="0.01" className={`${inputCls} mt-1`} value={editFields.paymentReceived as string ?? ''} onChange={setEF('paymentReceived')} />
              </div>
            </div>
            <div className="mt-3 p-3 bg-gray-50 rounded-lg flex items-center justify-between">
              <span className="text-sm text-gray-600">Balance (charges − discount − advance − received)</span>
              <span className={`text-sm font-bold ${caseDue <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {fmtMoney(caseDue)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Invoices */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Invoices ({vc.invoices?.length ?? 0})
          </h3>
          <Can permissions={['invoices:write']}>
            <Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setInvoiceOpen(true)}>
              Create Invoice
            </Button>
          </Can>
        </div>
        {(vc.invoices?.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No invoices yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 text-xs text-gray-500">Ref</th>
                  <th className="text-left px-3 py-2 text-xs text-gray-500">Total</th>
                  <th className="text-left px-3 py-2 text-xs text-gray-500">Status</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {vc.invoices?.map(inv => (
                  <tr key={inv.id}>
                    <td className="px-3 py-2 font-medium text-indigo-600">{inv.invoiceRef}</td>
                    <td className="px-3 py-2">{fmtMoney(inv.totalAmount)}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${INV_COLORS[inv.status as InvoiceStatus]}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                        disabled={downloading}
                        onClick={() => handleDownload(() => downloadInvoicePdf(inv.id, inv.invoiceRef))}
                      >
                        <Receipt className="w-3.5 h-3.5" /> Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Invoice Modal */}
      <Modal
        open={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        title="Create Invoice"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setInvoiceOpen(false)}>Cancel</Button>
            <Button
              loading={createInvMut.isPending}
              disabled={!invoiceForm.charges}
              onClick={() => createInvMut.mutate()}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Charges (£) <span className="text-red-500">*</span></label>
            <input type="number" min="0" step="0.01" className={`${inputCls} mt-1`} value={invoiceForm.charges} onChange={e => setInvoiceForm(f => ({ ...f, charges: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Discount (£)</label>
              <input type="number" min="0" step="0.01" className={`${inputCls} mt-1`} value={invoiceForm.discount} onChange={e => setInvoiceForm(f => ({ ...f, discount: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Advance (£)</label>
              <input type="number" min="0" step="0.01" className={`${inputCls} mt-1`} value={invoiceForm.advance} onChange={e => setInvoiceForm(f => ({ ...f, advance: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Due Date</label>
            <input type="date" className={`${inputCls} mt-1`} value={invoiceForm.dueDate} onChange={e => setInvoiceForm(f => ({ ...f, dueDate: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Notes</label>
            <textarea className={`${inputCls} mt-1`} rows={2} value={invoiceForm.notes} onChange={e => setInvoiceForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CaseDetail;
