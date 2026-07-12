import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { ArrowLeft, Save, Plus, Lock, UserCircle, Download, PauseCircle, PlayCircle, Receipt, UserCog } from 'lucide-react';
import { getCase, updateCase } from '../../api/cases';
import { getAssignableUsers } from '../../api/users';
import { createInvoice } from '../../api/invoices';
import { downloadAdvanceReceipt, downloadInvoicePdf } from '../../api/pdf';
import type { AssignableUser, CaseStage, DocumentStatus, InvoiceStatus, VisaCase } from '../../types';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { Modal } from '../../components/ui/Modal';
import { Can } from '../../routes/RoleGuard';
import { Breadcrumbs, type BreadcrumbStep } from '../../components/ui/Breadcrumbs';

const STAGE_ORDER: CaseStage[] = ['APPOINTMENT', 'FILE_PROCESSING', 'INVOICED', 'COMPLETED'];
const STAGE_LABELS: Record<CaseStage, string> = {
  APPOINTMENT: 'Appointment', FILE_PROCESSING: 'File Processing',
  INVOICED: 'Invoiced', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
};
const STAGE_COLORS: Record<CaseStage, string> = {
  APPOINTMENT: 'bg-blue-100 text-blue-700',
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

const REQUIRED_FIELD_LABELS: Record<string, string> = {
  passportNumber: 'Passport Number',
  nationality: 'Nationality',
  dob: 'Date of Birth',
  passportIssue: 'Passport Issue Date',
  passportExpiry: 'Passport Expiry Date',
  destination: 'Destination',
};
// These live on the Client record, not the case — completed via the client's own edit form.
const CLIENT_LEVEL_REQUIRED_FIELDS = ['passportNumber', 'nationality', 'dob', 'passportIssue', 'passportExpiry'];

const APPT_ROLES = ['APPOINTMENT_TEAM', 'HR_MANAGER', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'];
const FILE_ROLES = ['FILE_TEAM', 'HR_MANAGER', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'];

const fmtMoney = (v?: number | string | null) => v != null ? `£${parseFloat(String(v)).toFixed(2)}` : '—';
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-GB') : '—');
const formatAddress = (c?: { addressStreet?: string | null; addressCity?: string | null; addressShire?: string | null; addressPostalCode?: string | null; addressCountry?: string | null }) =>
  [c?.addressStreet, c?.addressCity, c?.addressShire, c?.addressPostalCode, c?.addressCountry].filter(Boolean).join(', ') || '—';
const num = (v?: number | string | null) => (v != null && v !== '' ? parseFloat(String(v)) : 0);
const toNum = (v?: number | string | null) => (v !== '' && v != null ? parseFloat(String(v)) : undefined);

// A case's destination is either decided (`destination`) or still a shortlist
// (`destinationOptions`) awaiting finalization in File Processing.
const destinationLabel = (vc: { destination: string | null; destinationOptions?: string[] }) =>
  vc.destination ?? (vc.destinationOptions?.length ? `${vc.destinationOptions.join(', ')} (undecided)` : '—');

// Same shortlist-then-finalize pattern as destinationLabel, for the appointment city.
const cityLabel = (vc: { city?: string | null; cityOptions?: string[] }) =>
  vc.city ?? (vc.cityOptions?.length ? `${vc.cityOptions.join(', ')} (undecided)` : undefined);

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
const AGENCY_PAID_DOCS = new Set<DocKey>(['docAppointment', 'docTicket', 'docInsurance', 'docHotel']);
// Only the 4 agency-paid docs above track a client-contribution amount.
const DOC_CLIENT_PAID_KEY: Partial<Record<DocKey, keyof VisaCase>> = {
  docAppointment: 'docAppointmentClientPaid', docTicket: 'docTicketClientPaid',
  docInsurance: 'docInsuranceClientPaid', docHotel: 'docHotelClientPaid',
};
const APPT_STATUS_OPTS: { value: string; label: string }[] = [
  { value: 'WAITING', label: 'Waiting' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'REGISTERED', label: 'Registered' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'HOLD', label: 'Hold' },
  { value: 'DROPPED', label: 'Dropped' },
  { value: 'BACK_UP', label: 'Back-Up' },
];

const CaseDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Partial<VisaCase>>({});
  const [activeSection, setActiveSection] = useState<CaseStage>('APPOINTMENT');
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ charges: '', discount: '', advance: '', dueDate: '', notes: '' });
  const [downloading, setDownloading] = useState(false);
  const [docPaidBy, setDocPaidBy] = useState<Record<DocKey, 'client' | 'agency'>>({
    docAppointment: 'client', docTicket: 'client', docInsurance: 'client', docHotel: 'client',
    docEVisa: 'agency', docSop: 'agency', docVisaForm: 'agency',
  });

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
        destination: vc.destination ?? '',
        city: vc.city ?? '',
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
        docAppointmentClientPaid: vc.docAppointmentClientPaid,
        docTicketClientPaid: vc.docTicketClientPaid,
        docInsuranceClientPaid: vc.docInsuranceClientPaid,
        docHotelClientPaid: vc.docHotelClientPaid,
        charges: vc.charges,
        discount: vc.discount,
        advance: vc.advance,
        paymentReceived: vc.paymentReceived,
      });
      setActiveSection(vc.stage === 'CANCELLED' ? 'APPOINTMENT' : vc.stage);
      setDocPaidBy(prev => ({
        ...prev,
        docAppointment: (vc.docAppointmentCost != null && Number(vc.docAppointmentCost) > 0) ? 'agency' : 'client',
        docTicket:      (vc.docTicketCost      != null && Number(vc.docTicketCost)      > 0) ? 'agency' : 'client',
        docInsurance:   (vc.docInsuranceCost   != null && Number(vc.docInsuranceCost)   > 0) ? 'agency' : 'client',
        docHotel:       (vc.docHotelCost       != null && Number(vc.docHotelCost)       > 0) ? 'agency' : 'client',
      }));
    }
  }, [vc?.id]);

  const showSuccess = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); };
  const onErr = (e: AxiosError<{ message: string }>, fallback: string) =>
    setError(e.response?.data?.message ?? fallback);

  const saveAppointmentMut = useMutation({
    mutationFn: () => updateCase(id!, {
      destination:      (editFields.destination as string) || undefined,
      city:             (editFields.city as string) || undefined,
      charges:  toNum(editFields.charges),
      discount: toNum(editFields.discount),
      advance:  toNum(editFields.advance),
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
      docAppointmentClientPaid: toNum(editFields.docAppointmentClientPaid),
      docTicketClientPaid:      toNum(editFields.docTicketClientPaid),
      docInsuranceClientPaid:   toNum(editFields.docInsuranceClientPaid),
      docHotelClientPaid:       toNum(editFields.docHotelClientPaid),
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
  const locked = vc.stage === 'COMPLETED';
  const canAdvance = stageIdx >= 0 && stageIdx < STAGE_ORDER.length - 1;
  const nextStage = canAdvance ? STAGE_ORDER[stageIdx + 1] : null;

  // For each agency-paid document, the client still owes whatever the agency
  // covered minus what the client has already contributed toward that cost.
  const agencyDocOutstanding = [...AGENCY_PAID_DOCS].reduce((sum, key) => {
    const costKey = DOC_COST_KEY[key];
    const clientPaidKey = DOC_CLIENT_PAID_KEY[key]!;
    const cost = num(vc[costKey] as number | string | null);
    const clientPaid = num(vc[clientPaidKey] as number | string | null);
    return sum + Math.max(0, cost - clientPaid);
  }, 0);
  const caseDue = num(vc.charges) - num(vc.discount) - num(vc.advance) - num(vc.paymentReceived) + agencyDocOutstanding;
  const unpaidInvoices = (vc.invoices ?? []).filter(i => i.status !== 'PAID');

  const missingRequiredFields = vc.missingRequiredFields ?? [];

  // Gate reason blocking the next transition (mirrors backend enforcement)
  let gateReason: string | null = null;
  if (vc.onHold) {
    gateReason = 'This case is paused. Resume it to continue the workflow.';
  } else if (vc.stage === 'APPOINTMENT' && missingRequiredFields.length > 0) {
    gateReason = `Missing required client info: ${missingRequiredFields.map(f => REQUIRED_FIELD_LABELS[f] ?? f).join(', ')}.`;
  } else if (vc.stage === 'APPOINTMENT' && !vc.appointmentDate) {
    gateReason = 'Set the appointment date before this case can move to File Processing.';
  } else if (vc.stage === 'INVOICED' && unpaidInvoices.length > 0) {
    gateReason = `All invoices must be marked Paid before completing (${unpaidInvoices.length} outstanding).`;
  }

  // Advance payment is not a hard gate — it's a non-blocking warning that follows
  // the case through every stage until it's paid (auto-marked paid once a non-zero
  // advance amount is on file).
  const advancePending = !vc.advancePaid && vc.stage !== 'CANCELLED';

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
          <p className="text-gray-500 text-sm mt-0.5">{destinationLabel(vc)} · {vc.client?.phone}</p>
        </div>
        {!isTerminal && (
          <div className="flex items-center gap-2">
            <Can permissions={['clients:write']}>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<UserCog className="w-4 h-4" />}
                onClick={() => navigate(`/clients/${vc.client!.id}/edit`)}
              >
                Edit Client Info
              </Button>
            </Can>
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

      {advancePending && (
        <Alert variant="warning" message={`Advance payment is pending${vc.advance != null ? ` (${fmtMoney(vc.advance)} due)` : ''}.`} />
      )}

      {vc.stage === 'COMPLETED' && (
        <Alert variant="info" message="This case is completed. All information — including client details — is now locked and read-only." />
      )}

      {/* Breadcrumb stage navigation */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <Breadcrumbs
          activeKey={activeSection}
          steps={STAGE_ORDER.map((s, i): BreadcrumbStep => ({
            key: s,
            label: STAGE_LABELS[s],
            state: i < stageIdx ? 'done' : i === stageIdx ? 'current' : 'upcoming',
            onClick: i <= stageIdx ? () => setActiveSection(s) : undefined,
          }))}
          currentClass={STAGE_COLORS[vc.stage]}
        />

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

      {/* Appointment Section — the case lands here as soon as client info is filled */}
      {activeSection === 'APPOINTMENT' && (
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Appointment Details</h3>
          {!locked && (
            <Can permissions={['appointments:write', 'clients:write']} requireAll={false}>
              <Button size="sm" leftIcon={<Save className="w-3.5 h-3.5" />} loading={saveAppointmentMut.isPending} onClick={() => saveAppointmentMut.mutate()}>
                Save
              </Button>
            </Can>
          )}
        </div>
        <fieldset disabled={locked} className="space-y-4">

        {missingRequiredFields.length > 0 && (
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
            <Lock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <div>
              <p>
                Missing client info — fill in{' '}
                <strong>{missingRequiredFields.map(f => REQUIRED_FIELD_LABELS[f] ?? f).join(', ')}</strong>{' '}
                before this case can move to File Processing.
              </p>
              {missingRequiredFields.some(f => CLIENT_LEVEL_REQUIRED_FIELDS.includes(f)) && (
                <button
                  type="button"
                  className="text-amber-800 underline font-medium mt-1"
                  onClick={() => navigate(`/clients/${vc.client!.id}/edit`)}
                >
                  Complete client info →
                </button>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-gray-500">Appointment Team Assignee</label>
            <select
              className={`${inputCls} mt-1`}
              value={vc.appointmentAssignedToId ?? ''}
              disabled={patchMut.isPending}
              onChange={e => patchMut.mutate({ patch: { appointmentAssignedToId: e.target.value || null }, msg: 'Assignment updated' })}
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
            <label className="text-xs text-gray-500">Booked By</label>
            <select
              className={`${inputCls} mt-1`}
              value={vc.bookedById ?? ''}
              disabled={patchMut.isPending}
              onChange={e => patchMut.mutate({ patch: { bookedById: e.target.value || null }, msg: 'Booked-by updated' })}
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
            <label className="text-xs text-gray-500">Destination</label>
            {vc.destinationOptions?.length ? (
              <>
                <select
                  className={`${inputCls} mt-1`}
                  value={editFields.destination as string ?? vc.destination ?? ''}
                  onChange={setEF('destination')}
                >
                  <option value="" disabled>Not yet decided</option>
                  {vc.destinationOptions.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Shortlisted: {vc.destinationOptions.join(', ')} — edit the shortlist via Edit Client Info.
                </p>
              </>
            ) : (
              <input className={`${inputCls} mt-1`} value={editFields.destination as string ?? ''} onChange={setEF('destination')} placeholder="e.g. Netherlands" />
            )}
          </div>
          <div>
            <label className="text-xs text-gray-500">City</label>
            {vc.cityOptions?.length ? (
              <>
                <select
                  className={`${inputCls} mt-1`}
                  value={editFields.city as string ?? vc.city ?? ''}
                  onChange={setEF('city')}
                >
                  <option value="" disabled>Not yet decided</option>
                  {vc.cityOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Shortlisted: {vc.cityOptions.join(', ')} — edit the shortlist via Edit Client Info.
                </p>
              </>
            ) : (
              <input className={`${inputCls} mt-1`} value={editFields.city as string ?? ''} onChange={setEF('city')} placeholder="e.g. London" />
            )}
          </div>
          <div>
            <label className="text-xs text-gray-500">Appointment Date</label>
            <input type="date" min="1900-01-01" max="2099-12-31" className={`${inputCls} mt-1`} value={editFields.appointmentDate as string ?? ''} onChange={setEF('appointmentDate')} />
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

        {/* Charges & advance — agreed when the client is onboarded, confirmed here */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 mb-2">Charges & Advance</h4>
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
        <p className="text-xs text-gray-400">
          Automatically marked paid once a non-zero advance amount is saved. Use the toggle only to correct it manually.
        </p>
        </fieldset>
      </div>
      )}

      {/* File Processing Section */}
      {activeSection === 'FILE_PROCESSING' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">File Processing</h3>
            {!locked && (
              <Can permissions={['files:write', 'clients:write']} requireAll={false}>
                <Button size="sm" leftIcon={<Save className="w-3.5 h-3.5" />} loading={saveFileMut.isPending} onClick={() => saveFileMut.mutate()}>
                  Save
                </Button>
              </Can>
            )}
          </div>

          {/* Everything captured earlier in the workflow, read-only for the file processor */}
          <div className="border border-gray-100 rounded-lg p-4 bg-gray-50/50">
            <h4 className="text-xs font-semibold text-gray-500 mb-3">Client & Appointment Summary</h4>
            <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3 text-sm">
              {([
                ['Client', `${vc.client?.firstName ?? ''} ${vc.client?.lastName ?? ''}`.trim() || '—'],
                ['Passport No.', vc.client?.passportNumber ?? '—'],
                ['Date of Birth', fmtDate(vc.client?.dob)],
                ['Nationality', vc.client?.nationality ?? '—'],
                ['Passport Issue', fmtDate(vc.client?.passportIssue)],
                ['Passport Expiry', fmtDate(vc.client?.passportExpiry)],
                ['Phone', vc.client?.phone ?? '—'],
                ['WhatsApp', vc.client?.whatsapp ?? '—'],
                ['Email', vc.client?.email ?? '—'],
                ['Registered Email', vc.client?.registeredEmail ?? '—'],
                ['Gender', vc.client?.gender ?? '—'],
                ['Birth City', vc.client?.birthCity ?? '—'],
                ['Marital Status', vc.client?.maritalStatus ?? '—'],
                ['Address', formatAddress(vc.client)],
                ['Destination', `${destinationLabel(vc)}${cityLabel(vc) ? ` (${cityLabel(vc)})` : ''}`],
                ['Visa Type', vc.visaType ?? '—'],
                ['Appointment Date', fmtDate(vc.appointmentDate)],
                ['Booked By', vc.bookedBy ? `${vc.bookedBy.firstName} ${vc.bookedBy.lastName}` : '—'],
                ['Appointment Team Assignee', vc.appointmentAssigned ? `${vc.appointmentAssigned.firstName} ${vc.appointmentAssigned.lastName}` : '—'],
                ['TLS Account', vc.tlsAccount ?? '—'],
                ['FRA No.', vc.fraNo ?? '—'],
                ['Charges', fmtMoney(vc.charges)],
                ['Advance', `${fmtMoney(vc.advance)}${vc.advancePaid ? ' (paid)' : ''}`],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-gray-400">{label}</dt>
                  <dd className="text-gray-800 font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            {vc.client?.previousSchengenVisa && (
              <p className="mt-3 text-xs text-gray-500"><span className="text-gray-400">Previous Schengen visa:</span> {vc.client.previousSchengenVisa}</p>
            )}
            {vc.client?.visaAndTravelHistory && (
              <p className="mt-1 text-xs text-gray-500"><span className="text-gray-400">Visa & travel history:</span> {vc.client.visaAndTravelHistory}</p>
            )}
            {vc.client?.folderUrl && (
              <p className="mt-1 text-xs text-gray-500">
                <span className="text-gray-400">Folder:</span>{' '}
                <a href={vc.client.folderUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                  {vc.client.folderUrl}
                </a>
              </p>
            )}
            {vc.appointmentNotes && (
              <p className="mt-1 text-xs text-gray-500"><span className="text-gray-400">Appointment notes:</span> {vc.appointmentNotes}</p>
            )}
          </div>

          <fieldset disabled={locked} className="space-y-4">

          {vc.destinationOptions && vc.destinationOptions.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-medium text-amber-800">
                  {vc.destination ? `Finalized destination: ${vc.destination}` : 'Destination not yet finalized'}
                </p>
                <p className="text-xs text-amber-700 mt-0.5">Shortlisted: {vc.destinationOptions.join(', ')}</p>
              </div>
              {!vc.destination && (
                <select
                  className={`${inputCls} max-w-[220px]`}
                  disabled={patchMut.isPending}
                  value=""
                  onChange={e => e.target.value && patchMut.mutate({ patch: { destination: e.target.value }, msg: 'Destination finalized' })}
                >
                  <option value="" disabled>Finalize destination…</option>
                  {vc.destinationOptions.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              )}
            </div>
          )}

          {vc.cityOptions && vc.cityOptions.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-medium text-amber-800">
                  {vc.city ? `Finalized city: ${vc.city}` : 'City not yet finalized'}
                </p>
                <p className="text-xs text-amber-700 mt-0.5">Shortlisted: {vc.cityOptions.join(', ')}</p>
              </div>
              {!vc.city && (
                <select
                  className={`${inputCls} max-w-[220px]`}
                  disabled={patchMut.isPending}
                  value=""
                  onChange={e => e.target.value && patchMut.mutate({ patch: { city: e.target.value }, msg: 'City finalized' })}
                >
                  <option value="" disabled>Finalize city…</option>
                  {vc.cityOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-500">File Team Assignee</label>
              <select
                className={`${inputCls} mt-1`}
                value={vc.fileAssignedToId ?? ''}
                disabled={patchMut.isPending}
                onChange={e => patchMut.mutate({ patch: { fileAssignedToId: e.target.value || null }, msg: 'Assignment updated' })}
              >
                <option value="">— Unassigned —</option>
                {fileUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Travel Date</label>
              <input type="date" min="1900-01-01" max="2099-12-31" className={`${inputCls} mt-1`} value={editFields.travelDate as string ?? ''} onChange={setEF('travelDate')} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Hotel Date</label>
              <input type="date" min="1900-01-01" max="2099-12-31" className={`${inputCls} mt-1`} value={editFields.hotelDate as string ?? ''} onChange={setEF('hotelDate')} />
            </div>
          </div>

          {/* Client-level fields (marital status, address, travel history, etc.) are shown read-only
              in the summary above — editing them still goes through the unified client form. */}
          <div className="flex items-center justify-between border border-gray-100 rounded-lg p-4 bg-gray-50/50">
            <p className="text-xs text-gray-500">
              Need to correct any client detail shown above?
            </p>
            <Can permissions={['clients:write']}>
              <Button size="sm" variant="outline" leftIcon={<UserCircle className="w-3.5 h-3.5" />} onClick={() => navigate(`/clients/${vc.client!.id}/edit`)}>
                Edit Client Info
              </Button>
            </Can>
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
                    <th className="text-left px-3 py-2 text-xs text-gray-500">Paid By</th>
                    <th className="text-left px-3 py-2 text-xs text-gray-500">Cost (£)</th>
                    <th className="text-left px-3 py-2 text-xs text-gray-500">Client Already Given (£)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(Object.keys(DOC_LABELS) as DocKey[]).map(key => {
                    const costKey = DOC_COST_KEY[key];
                    const clientPaidKey = DOC_CLIENT_PAID_KEY[key];
                    const hasPaidBy = AGENCY_PAID_DOCS.has(key);
                    const paidBy = docPaidBy[key];
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
                        {hasPaidBy ? (
                          <div className="flex items-center gap-3">
                            {(['client', 'agency'] as const).map(opt => (
                              <label key={opt} className="flex items-center gap-1 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`paidBy-${key}`}
                                  value={opt}
                                  checked={paidBy === opt}
                                  onChange={() => {
                                    setDocPaidBy(p => ({ ...p, [key]: opt }));
                                    if (opt === 'client') setEditFields(f => ({ ...f, [costKey]: 0 }));
                                  }}
                                  className="accent-indigo-600"
                                />
                                <span className="text-xs text-gray-600 capitalize">{opt}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">Agency</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {(!hasPaidBy || paidBy === 'agency') ? (
                          <input
                            type="number" min="0" step="0.01"
                            className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="0.00"
                            value={String((editFields[costKey] as string | number | undefined) ?? vc[costKey] ?? '')}
                            onChange={e => setEditFields(f => ({ ...f, [costKey]: e.target.value }))}
                          />
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {(hasPaidBy && paidBy === 'agency' && clientPaidKey) ? (
                          <input
                            type="number" min="0" step="0.01"
                            className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="0.00"
                            value={String((editFields[clientPaidKey] as string | number | undefined) ?? vc[clientPaidKey] ?? '')}
                            onChange={e => setEditFields(f => ({ ...f, [clientPaidKey]: e.target.value }))}
                          />
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
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
              <span className="text-sm text-gray-600">Balance (charges − discount − advance − received + agency costs owed)</span>
              <span className={`text-sm font-bold ${caseDue <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {fmtMoney(caseDue)}
              </span>
            </div>
          </div>
          </fieldset>
        </div>
      )}

      {/* Invoices */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Invoices ({vc.invoices?.length ?? 0})
          </h3>
          {!locked && (
            <Can permissions={['invoices:write']}>
              <Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setInvoiceOpen(true)}>
                Create Invoice
              </Button>
            </Can>
          )}
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
            <input type="date" min="1900-01-01" max="2099-12-31" className={`${inputCls} mt-1`} value={invoiceForm.dueDate} onChange={e => setInvoiceForm(f => ({ ...f, dueDate: e.target.value }))} />
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
