import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { ArrowLeft, Edit, Plus, Eye, Download, Lock } from 'lucide-react';
import { getClient, addCase } from '../../api/clients';
import { downloadClientPdf } from '../../api/pdf';
import type { CaseStage, Priority, VisaCase } from '../../types';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { Modal } from '../../components/ui/Modal';
import { MultiCombobox } from '../../components/ui/MultiCombobox';
import { DESTINATION_OPTIONS, APPOINTMENT_CITY_OPTIONS } from '../../constants/options';
import { Can } from '../../routes/RoleGuard';

const STAGE_COLORS: Record<CaseStage, string> = {
  APPOINTMENT:     'bg-blue-100 text-blue-700',
  FILE_PROCESSING: 'bg-yellow-100 text-yellow-700',
  INVOICED:        'bg-purple-100 text-purple-700',
  COMPLETED:       'bg-green-100 text-green-700',
  CANCELLED:       'bg-red-100 text-red-700',
};

const PRI_COLORS: Record<Priority, string> = {
  LOW: 'bg-gray-100 text-gray-600', MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700', URGENT: 'bg-red-100 text-red-700',
};

const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-GB') : '—';

// A case's destination is either decided or, before File Processing finalizes it, a shortlist.
const destinationLabel = (vc: { destination: string | null; destinationOptions?: string[] }) =>
  vc.destination ?? (vc.destinationOptions?.length ? `${vc.destinationOptions.join(', ')} (undecided)` : '—');

const InfoRow: React.FC<{ label: string; value?: string | boolean | null }> = ({ label, value }) => (
  <div className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
    <span className="text-sm text-gray-500">{label}</span>
    <span className="text-sm font-medium text-gray-900 text-right max-w-xs">
      {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : (value || '—')}
    </span>
  </div>
);

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

const ClientDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [addCaseOpen, setAddCaseOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [caseForm, setCaseForm] = useState({ destinations: [] as string[], cities: [] as string[], visaType: '', ukVisaExpiry: '', priority: 'MEDIUM' as Priority });

  const { data, isLoading } = useQuery({
    queryKey: ['client', id],
    queryFn:  () => getClient(id!),
    enabled:  !!id,
  });

  const client = data?.data;

  const addCaseMut = useMutation({
    mutationFn: () => addCase(id!, {
      visaType: caseForm.visaType || undefined,
      ukVisaExpiry: caseForm.ukVisaExpiry || undefined,
      priority: caseForm.priority,
      // A single pick is the decided destination/city directly; more than one is a
      // shortlist File Processing finalizes down to one later.
      ...(caseForm.destinations.length > 1
        ? { destinationOptions: caseForm.destinations }
        : { destination: caseForm.destinations[0] }),
      ...(caseForm.cities.length > 1
        ? { cityOptions: caseForm.cities }
        : { city: caseForm.cities[0] }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', id] });
      setAddCaseOpen(false);
      setCaseForm({ destinations: [], cities: [], visaType: '', ukVisaExpiry: '', priority: 'MEDIUM' });
      showSuccess('Case added');
    },
    onError: (e: AxiosError<{ message: string }>) =>
      setError(e.response?.data?.message ?? 'Failed to add case'),
  });

  const showSuccess = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); };

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!client) return (
    <div className="text-center py-16">
      <p className="text-gray-500">Client not found.</p>
      <Button variant="outline" className="mt-4" onClick={() => navigate('/clients')}>Back to Clients</Button>
    </div>
  );

  const isLocked = client.visaCases.length > 0 && client.visaCases.every(vc => vc.stage === 'COMPLETED');

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/clients')} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
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

      {error   && <Alert variant="error"   message={error}   onClose={() => setError(null)} />}
      {success && <Alert variant="success" message={success} onClose={() => setSuccess(null)} />}
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
            <InfoRow label="Group" value={client.group ? `${client.group.name} (${client.group.groupRef})` : '—'} />
            <InfoRow label="Marital Status" value={client.maritalStatus ? client.maritalStatus.charAt(0) + client.maritalStatus.slice(1).toLowerCase() : '—'} />
            <InfoRow label="Birth City" value={client.birthCity} />
            <InfoRow label="Phone" value={client.phone} />
            <InfoRow label="WhatsApp" value={client.whatsapp} />
            <InfoRow label="Email" value={client.email} />
            <InfoRow label="Registered Email" value={client.registeredEmail} />
            <InfoRow label="Residential Address" value={client.residentialAddress} />
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
            {client.folderUrl && (
              <div className="flex justify-between py-1.5 border-b border-gray-50">
                <span className="text-sm text-gray-500">Folder</span>
                <a href={client.folderUrl} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:underline">Open folder</a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* HR Comments */}
      {client.hrComments && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">HR Comments</h3>
          <p className="text-sm text-gray-700">{client.hrComments}</p>
        </div>
      )}

      {/* Visa Cases */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Visa Cases ({client.visaCases.length})
          </h3>
          <Can permissions={['clients:write']}>
            <Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAddCaseOpen(true)}>
              Add Case
            </Button>
          </Can>
        </div>
        {client.visaCases.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No visa cases yet</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {client.visaCases.map((vc: VisaCase) => (
              <div key={vc.id} className="border border-gray-200 rounded-lg p-4 space-y-2 hover:border-indigo-300 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900">{destinationLabel(vc)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STAGE_COLORS[vc.stage]}`}>
                    {vc.stage.replace('_', ' ')}
                  </span>
                </div>
                {vc.visaType && <p className="text-xs text-gray-500">{vc.visaType}</p>}
                {vc.appointmentDate && (
                  <p className="text-xs text-gray-500">Appt: {fmtDate(vc.appointmentDate)}</p>
                )}
                <div className="flex items-center justify-between">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRI_COLORS[vc.priority]}`}>
                    {vc.priority}
                  </span>
                  <Button size="sm" variant="outline" leftIcon={<Eye className="w-3 h-3" />} onClick={() => navigate(`/cases/${vc.id}`)}>
                    Manage
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Case Modal */}
      <Modal
        open={addCaseOpen}
        onClose={() => setAddCaseOpen(false)}
        title="Add Visa Case"
        subtitle={`New case for ${client.firstName} ${client.lastName}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAddCaseOpen(false)}>Cancel</Button>
            <Button loading={addCaseMut.isPending} onClick={() => addCaseMut.mutate()}>Add Case</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Destination <span className="text-red-500">*</span></label>
            <div className="mt-1">
              <MultiCombobox
                values={caseForm.destinations}
                onChange={v => setCaseForm(f => ({ ...f, destinations: v }))}
                options={DESTINATION_OPTIONS}
                placeholder="Select destination(s)"
              />
            </div>
            {caseForm.destinations.length > 1 && (
              <p className="text-xs text-amber-600 mt-1">
                Multiple destinations shortlisted — a single one is finalized later in File Processing.
              </p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">City</label>
            <div className="mt-1">
              <MultiCombobox
                values={caseForm.cities}
                onChange={v => setCaseForm(f => ({ ...f, cities: v }))}
                options={APPOINTMENT_CITY_OPTIONS}
                placeholder="Select city(-ies)"
              />
            </div>
            {caseForm.cities.length > 1 && (
              <p className="text-xs text-amber-600 mt-1">
                Multiple cities shortlisted — a single one is finalized later in File Processing.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Visa Type</label>
              <input className={`${inputCls} mt-1`} value={caseForm.visaType} onChange={e => setCaseForm(f => ({ ...f, visaType: e.target.value }))} placeholder="Tourist" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Priority</label>
              <select className={`${inputCls} mt-1`} value={caseForm.priority} onChange={e => setCaseForm(f => ({ ...f, priority: e.target.value as Priority }))}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">UK Visa Expiry</label>
            <input type="date" className={`${inputCls} mt-1`} value={caseForm.ukVisaExpiry} onChange={e => setCaseForm(f => ({ ...f, ukVisaExpiry: e.target.value }))} />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ClientDetail;
