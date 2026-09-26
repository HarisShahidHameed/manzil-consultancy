import React, { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { AlertTriangle, ArrowLeft, Edit, Eye, Download, Lock, Plus } from 'lucide-react';
import { addClientCase, getClient } from '../../api/clients';
import { downloadClientPdf } from '../../api/pdf';
import { getDocuments } from '../../api/documents';
import type { CaseStage, ClientDocument, Priority, VisaCase } from '../../types';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { Modal } from '../../components/ui/Modal';
import { MultiCombobox } from '../../components/ui/MultiCombobox';
import { Can } from '../../routes/RoleGuard';
import {
  DESTINATION_OPTIONS, APPOINTMENT_CITY_OPTIONS, VISA_TYPE_OPTIONS, EVISA_TYPE_OPTIONS, formatShortlist,
} from '../../constants/options';
import { DocumentUploader } from '../../components/clients/DocumentUploader';
import { DocumentList } from '../../components/clients/DocumentList';

const STAGE_COLORS: Record<CaseStage, string> = {
  APPOINTMENT:     'bg-blue-100 text-blue-700',
  FILE_PROCESSING: 'bg-yellow-100 text-yellow-700',
  INVOICED:        'bg-purple-100 text-purple-700',
  COMPLETED:       'bg-green-100 text-green-700',
  CANCELLED:       'bg-red-100 text-red-700',
};

// Priority is no longer a labelled field of its own: nearly every case is Normal, so only
// the exception earns a pill, in the same treatment as the Expiring / Missing info tags.
const UrgentBadge: React.FC = () => (
  <span
    title="Urgent case"
    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700"
  >
    <AlertTriangle className="w-2.5 h-2.5" /> Urgent
  </span>
);

const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-GB') : '—';

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors';

// A returning client applying for another country gets an extra case on their existing
// profile rather than a duplicate one — this is the form behind that. ClientForm routes
// here (via navigation state) when its duplicate-passport check finds a match, carrying
// over whatever visa details had already been typed into the abandoned new-client form.
const emptyNewCase = {
  destinations: [] as string[],
  cities: [] as string[],
  visaType: '',
  ukVisaExpiry: '',
  eVisaType: '',
  priority: 'MEDIUM' as Priority,
  advance: '', charges: '', discount: '',
};
export type NewCasePrefill = Partial<typeof emptyNewCase>;

// Navigation state this page understands. docWarning comes from a just-created client whose
// staged documents didn't all upload; openNewCase/newCasePrefill from the duplicate-passport
// warning on ClientForm.
interface ClientDetailNavState {
  docWarning?: string;
  openNewCase?: boolean;
  newCasePrefill?: NewCasePrefill;
}

// A case's destination is either decided or, before File Processing finalizes it, a shortlist.
const destinationLabel = (vc: { destination: string | null; destinationOptions?: string[] }) =>
  vc.destination ?? (vc.destinationOptions?.length ? formatShortlist(vc.destinationOptions, DESTINATION_OPTIONS) : '—');

const InfoRow: React.FC<{ label: string; value?: string | boolean | null }> = ({ label, value }) => (
  <div className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
    <span className="text-sm text-gray-500">{label}</span>
    <span className="text-sm font-medium text-gray-900 text-right max-w-xs">
      {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : (value || '—')}
    </span>
  </div>
);

const ClientDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const navState = location.state as ClientDetailNavState | null;
  // Set by ClientForm when a just-created client had staged documents that didn't all
  // upload successfully — surfaced once here, on the page the user lands on next.
  const [docWarning, setDocWarning] = useState<string | null>(navState?.docWarning ?? null);

  // Seeded once from navigation state so arriving via "Open New Case for Existing Client"
  // lands straight on the filled-in form; re-renders never re-open it after a dismissal.
  const [newCaseOpen, setNewCaseOpen] = useState(!!navState?.openNewCase);
  const [newCase, setNewCase] = useState({ ...emptyNewCase, ...(navState?.newCasePrefill ?? {}) });
  const setNc = (k: keyof typeof emptyNewCase) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setNewCase(f => ({ ...f, [k]: e.target.value }));

  const { data, isLoading } = useQuery({
    queryKey: ['client', id],
    queryFn:  () => getClient(id!),
    enabled:  !!id,
  });

  const client = data?.data;

  const { data: documents = [] } = useQuery({
    queryKey: ['clientDocuments', id],
    queryFn:  () => getDocuments(id!),
    enabled:  !!id,
  });
  const setDocuments = (docs: ClientDocument[]) => queryClient.setQueryData(['clientDocuments', id], docs);

  const createCase = useMutation({
    mutationFn: () => {
      // Same single-pick-vs-shortlist contract ClientForm uses: one pick is a decided
      // destination/city, several stay a shortlist for File Processing to narrow down later.
      const destinationFields = newCase.destinations.length > 1
        ? { destinationOptions: newCase.destinations }
        : { destination: newCase.destinations[0] };
      const cityFields = newCase.cities.length > 1
        ? { cityOptions: newCase.cities }
        : { city: newCase.cities[0] };

      return addClientCase(id!, {
        ...destinationFields,
        ...cityFields,
        visaType:     newCase.visaType     || undefined,
        ukVisaExpiry: newCase.ukVisaExpiry || undefined,
        eVisaType:    newCase.eVisaType    || undefined,
        priority:     newCase.priority,
        advance:  newCase.advance  ? parseFloat(newCase.advance)  : undefined,
        charges:  newCase.charges  ? parseFloat(newCase.charges)  : undefined,
        discount: newCase.discount ? parseFloat(newCase.discount) : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', id] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      setNewCaseOpen(false);
      setNewCase(emptyNewCase);
      setSuccess('New case opened — it has entered the appointment queue as Waiting.');
      setTimeout(() => setSuccess(null), 5000);
    },
    onError: (e: AxiosError<{ message: string }>) =>
      setError(e.response?.data?.message ?? 'Failed to open the new case'),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!client) return (
    <div className="text-center py-16">
      <p className="text-gray-500">Client not found.</p>
      <Button variant="outline" className="mt-4" onClick={() => navigate('/clients', { replace: true })}>Back to Clients</Button>
    </div>
  );

  const isLocked = client.visaCases.length > 0 && client.visaCases.every(vc => vc.stage === 'COMPLETED');

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* replace, not push — a Back affordance that pushes deepens the history stack, so
              a later navigate(-1) elsewhere in the app skips past where the user expects. */}
          <button onClick={() => navigate('/clients', { replace: true })} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{client.clientRef}</span>
              <h1 className="text-2xl font-bold text-gray-900">{client.firstName} {client.lastName}</h1>
            </div>
            <p className="text-gray-500 text-sm mt-0.5">{client.nationality} · {client.phone}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            leftIcon={<Download className="w-4 h-4" />}
            loading={downloading}
            onClick={async () => {
              try { setDownloading(true); await downloadClientPdf(client.id, client.clientRef); }
              catch { setError('Failed to download PDF'); }
              finally { setDownloading(false); }
            }}
          >
            Download PDF
          </Button>
          <Can permissions={['clients:write']}>
            {isLocked ? (
              <Button variant="outline" leftIcon={<Lock className="w-4 h-4" />} disabled title="All cases are completed — client information is locked">
                Locked
              </Button>
            ) : (
              <Button variant="outline" leftIcon={<Edit className="w-4 h-4" />} onClick={() => navigate(`/clients/${id}/edit`)}>
                Edit
              </Button>
            )}
          </Can>
        </div>
      </div>

      {error      && <Alert variant="error"   message={error}      onClose={() => setError(null)} />}
      {success    && <Alert variant="success" message={success}    onClose={() => setSuccess(null)} />}
      {docWarning && <Alert variant="warning" message={docWarning} onClose={() => setDocWarning(null)} />}
      {isLocked && (
        <Alert variant="warning" message="This client is locked — all cases are completed and information can no longer be changed." />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Personal Information</h3>
          <div>
            <InfoRow label="Gender" value={client.gender} />
            <InfoRow label="Date of Birth" value={fmtDate(client.dob)} />
            <InfoRow label="Nationality" value={client.nationality} />
            <InfoRow
              label="Processing Status"
              value={client.status ? client.status.replace('_', ' ') : 'Pending'}
            />
            <InfoRow
              label="Group"
              value={client.group
                ? `${client.group.name} (${client.group.groupRef})${client.group._count ? ` — ${client.group._count.clients} members` : ''}`
                : '—'}
            />
            <InfoRow label="Marital Status" value={client.maritalStatus ? client.maritalStatus.charAt(0) + client.maritalStatus.slice(1).toLowerCase() : '—'} />
            <InfoRow label="Birth City" value={client.birthCity} />
            <InfoRow label="Phone" value={client.phone} />
            <InfoRow label="WhatsApp" value={client.whatsapp} />
            <InfoRow label="Availability" value={client.availability} />
            <InfoRow label="Email" value={client.email} />
            <InfoRow label="Registered Email" value={client.registeredEmail} />
            <InfoRow label="Street Address" value={client.addressStreet} />
            <InfoRow label="City" value={client.addressCity} />
            <InfoRow label="Shire" value={client.addressShire} />
            <InfoRow label="Postal Code" value={client.addressPostalCode} />
            <InfoRow label="Country" value={client.addressCountry} />
            <InfoRow label="Received Date" value={fmtDate(client.receivedDate)} />
          </div>
        </div>

        {/* Passport */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Passport & Documents</h3>
          <div>
            <InfoRow label="Passport No." value={client.passportNumber} />
            <InfoRow label="Issue Date"   value={fmtDate(client.passportIssue)} />
            <InfoRow label="Expiry Date"  value={fmtDate(client.passportExpiry)} />
            <InfoRow label="E-Visa"    value={client.eVisa} />
            <InfoRow label="Previous Schengen Visa" value={client.previousSchengenVisa} />
            <InfoRow label="Source"    value={client.source} />
            <InfoRow label="Referred By" value={client.referredBy} />
          </div>
        </div>
      </div>

      {/* Documents — passport scans, photos, supporting files. Stored in S3 behind
          presigned URLs (never a public bucket), uploaded straight from the browser. */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Documents ({documents.length})
        </h3>
        <Can permissions={['clients:write']}>
          {!isLocked && (
            <div className="mb-5">
              <DocumentUploader clientId={client.id} onUploaded={uploaded => setDocuments([...uploaded, ...documents])} />
            </div>
          )}
        </Can>
        <DocumentList clientId={client.id} documents={documents} onChange={setDocuments} />
      </div>

      {/* HR Comments — one running log spanning the client's whole lifecycle, each line
          tagged with the phase it was added from (Client Intake, Appointment, File
          Processing, ...). New notes are added from the client edit form or the case's
          File Processing tab, never overwritten here. */}
      {client.hrComments && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">HR Comments</h3>
          <p className="text-sm text-gray-700 whitespace-pre-line">{client.hrComments}</p>
        </div>
      )}

      {/* Visa Cases */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Visa Cases ({client.visaCases.length})
          </h3>
          {/* A client can hold several cases at once — one per country/application. This is
              the entry point for adding another to an existing profile instead of re-entering
              the person as a duplicate. */}
          <Can permissions={['clients:write']}>
            <Button size="sm" variant="outline" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setNewCaseOpen(true)}>
              New Case
            </Button>
          </Can>
        </div>
        {client.visaCases.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No visa cases yet</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {client.visaCases.map((vc: VisaCase) => (
              <div key={vc.id} className="border border-gray-200 rounded-lg p-4 space-y-2 hover:border-indigo-300 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="font-semibold text-gray-900 truncate">{destinationLabel(vc)}</span>
                    {vc.priority === 'URGENT' && <UrgentBadge />}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STAGE_COLORS[vc.stage]}`}>
                    {vc.stage.replace('_', ' ')}
                  </span>
                </div>
                {vc.visaType && <p className="text-xs text-gray-500">{vc.visaType}</p>}
                {vc.appointmentDate && (
                  <p className="text-xs text-gray-500">Appt: {fmtDate(vc.appointmentDate)}</p>
                )}
                <div className="flex items-center justify-end">
                  <Button size="sm" variant="outline" leftIcon={<Eye className="w-3 h-3" />} onClick={() => navigate(`/cases/${vc.id}`)}>
                    Manage
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New case for this existing client — the multi-case alternative to duplicating a
          profile. Actions sit in the modal footer, at the bottom, like every other form. */}
      <Modal
        open={newCaseOpen}
        onClose={() => setNewCaseOpen(false)}
        title="Open New Case"
        subtitle={`${client.firstName} ${client.lastName} · ${client.clientRef}`}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setNewCaseOpen(false)}>Cancel</Button>
            <Button
              leftIcon={<Plus className="w-4 h-4" />}
              loading={createCase.isPending}
              disabled={newCase.destinations.length === 0}
              onClick={() => createCase.mutate()}
            >
              Open Case
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            This adds another visa application to the existing client profile — their personal,
            passport and document records are shared, and the new case enters the Appointment
            queue as Waiting.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Destination Country<span className="text-red-500 ml-1">*</span></label>
              <MultiCombobox
                values={newCase.destinations}
                onChange={v => setNewCase(f => ({ ...f, destinations: v }))}
                options={DESTINATION_OPTIONS}
                placeholder="Select destination(s)"
              />
              {newCase.destinations.length > 1 && (
                <p className="text-xs text-amber-600">
                  Multiple destinations shortlisted — a single one is finalized later in File Processing.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Appointment City</label>
              <MultiCombobox
                values={newCase.cities}
                onChange={v => setNewCase(f => ({ ...f, cities: v }))}
                options={APPOINTMENT_CITY_OPTIONS}
                placeholder="Select city(-ies)"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Visa Type</label>
              <select className={inputCls} value={newCase.visaType} onChange={setNc('visaType')}>
                <option value="">Select visa type</option>
                {VISA_TYPE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Priority</label>
              <select className={inputCls} value={newCase.priority} onChange={setNc('priority')}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">UK Visa Expiry</label>
              <input type="date" min="1900-01-01" max="2099-12-31" className={inputCls} value={newCase.ukVisaExpiry} onChange={setNc('ukVisaExpiry')} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">E-Visa Type</label>
              <select className={inputCls} value={newCase.eVisaType} onChange={setNc('eVisaType')}>
                <option value="">Select visa type</option>
                {EVISA_TYPE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Charges (£)</label>
              <input type="number" min="0" step="0.01" className={inputCls} value={newCase.charges} onChange={setNc('charges')} placeholder="0.00" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Discount (£)</label>
              <input type="number" min="0" step="0.01" className={inputCls} value={newCase.discount} onChange={setNc('discount')} placeholder="0.00" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Advance (£)</label>
              <input type="number" min="0" step="0.01" className={inputCls} value={newCase.advance} onChange={setNc('advance')} placeholder="0.00" />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ClientDetail;
