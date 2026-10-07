import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { AlertTriangle, ArrowLeft, FilePlus, Save } from 'lucide-react';
import { createClient, getClient, updateClient, appendHrComment, checkPassport } from '../../api/clients';
import { updateCase } from '../../api/cases';
import { getGroups } from '../../api/groups';
import { uploadClientDocuments } from '../../api/documents';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { Modal } from '../../components/ui/Modal';
import { MultiCombobox } from '../../components/ui/MultiCombobox';
import type { NewCasePrefill } from './ClientDetail';
import { PendingDocumentGallery, type PendingUploadProgress } from '../../components/clients/PendingDocumentGallery';
import { DESTINATION_OPTIONS, APPOINTMENT_CITY_OPTIONS, VISA_TYPE_OPTIONS, EVISA_TYPE_OPTIONS, STAGE_LABELS } from '../../constants/options';
import { isExpiringSoon } from '../../utils/dates';
import { useAddClientLock } from '../../hooks/useAddClientLock';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{title}</h3>
    {children}
  </div>
);

const Field: React.FC<{
  label: string; required?: boolean;
  children: React.ReactNode; error?: string;
}> = ({ label, required, children, error }) => (
  <div className="flex flex-col gap-1">
    <label className="text-sm font-medium text-gray-700">
      {label}{required && <span className="text-red-500 ml-1">*</span>}
    </label>
    {children}
    {error && <p className="text-xs text-red-500">{error}</p>}
  </div>
);

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors';
const warnInputCls = 'w-full rounded-lg border border-amber-400 bg-amber-50 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors';

const emptyForm = {
  receivedDate: new Date().toISOString().split('T')[0],
  firstName: '', lastName: '', gender: 'MALE' as 'MALE' | 'FEMALE' | 'OTHER',
  dob: '', phone: '', email: '', whatsapp: '', availability: '',
  addressStreet: '', addressCity: '', addressShire: '', addressPostalCode: '', addressCountry: '',
  passportNumber: '', passportIssue: '', passportExpiry: '',
  birthCity: '', nationality: '', maritalStatus: '' as '' | 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED',
  previousSchengenVisa: '', registeredEmail: '',
  eVisa: false,
  visaAndTravelHistory: '', source: '', referredBy: '', hrComments: '',
  destinations: [] as string[], cities: [] as string[], visaType: '', ukVisaExpiry: '', eVisaType: '',
  priority: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
  advance: '', charges: '', discount: '', groupId: '',
  serviceType: 'FULL_SERVICE' as 'APPOINTMENT_ONLY' | 'FULL_SERVICE',
};

const ClientForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  // Exclusive Add Client lock (1 Oct 2026 #8). Creating only — editing an existing client
  // is not restricted. Reuses the token the Add Client button already took the lock with, so
  // arriving here does not flicker through "someone else has it"; a direct visit to the URL
  // takes the lock itself.
  const { state: lock, retry: retryLock } = useAddClientLock(
    !isEdit,
    (location.state as { lockToken?: string } | null)?.lockToken,
  );
  const lockBlocked = !isEdit && lock.status === 'blocked';
  const lockPending = !isEdit && lock.status === 'acquiring';
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Staged, not-yet-uploaded documents picked before the client exists — there's no id
  // to namespace S3 keys under until createClient() resolves, so these are held as plain
  // File objects and only actually uploaded once the new client's id comes back.
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, PendingUploadProgress>>({});

  const { data: groupsData } = useQuery({ queryKey: ['groups'], queryFn: () => getGroups() });
  const groups = groupsData?.data ?? [];

  const { data: clientData, isLoading: clientLoading } = useQuery({
    queryKey: ['client', id],
    queryFn:  () => getClient(id!),
    enabled:  isEdit,
  });
  const client = clientData?.data;

  // The case whose destination/priority/financials this form edits alongside the
  // client — the client's most recent still-active case, if any.
  const targetCase = client?.visaCases.find(vc => vc.stage !== 'CANCELLED' && vc.stage !== 'COMPLETED') ?? null;

  useEffect(() => {
    if (!client) return;
    setForm({
      receivedDate: client.receivedDate?.split('T')[0] ?? emptyForm.receivedDate,
      firstName: client.firstName ?? '', lastName: client.lastName ?? '',
      gender: client.gender ?? 'MALE',
      dob: client.dob?.split('T')[0] ?? '', phone: client.phone ?? '',
      email: client.email ?? '', whatsapp: client.whatsapp ?? '',
      availability: client.availability ?? '',
      addressStreet: client.addressStreet ?? '',
      addressCity: client.addressCity ?? '',
      addressShire: client.addressShire ?? '',
      addressPostalCode: client.addressPostalCode ?? '',
      addressCountry: client.addressCountry ?? '',
      passportNumber: client.passportNumber ?? '',
      passportIssue: client.passportIssue?.split('T')[0] ?? '',
      passportExpiry: client.passportExpiry?.split('T')[0] ?? '',
      birthCity: client.birthCity ?? '', nationality: client.nationality ?? '',
      maritalStatus: client.maritalStatus ?? '',
      previousSchengenVisa: client.previousSchengenVisa ?? '',
      registeredEmail: client.registeredEmail ?? '',
      eVisa: client.eVisa ?? false,
      visaAndTravelHistory: client.visaAndTravelHistory ?? '',
      source: client.source ?? '', referredBy: client.referredBy ?? '',
      // hrComments deliberately NOT pre-filled from client.hrComments — that field is the
      // full accumulated history (shown read-only below), while this input is only ever
      // the new note being added right now, appended server-side rather than overwriting.
      hrComments: '',
      destinations: targetCase?.destinationOptions?.length
        ? targetCase.destinationOptions
        : (targetCase?.destination ? [targetCase.destination] : []),
      cities: targetCase?.cityOptions?.length
        ? targetCase.cityOptions
        : (targetCase?.city ? [targetCase.city] : []),
      visaType: targetCase?.visaType ?? '',
      ukVisaExpiry: targetCase?.ukVisaExpiry?.split('T')[0] ?? '',
      eVisaType: targetCase?.eVisaType ?? '',
      priority: targetCase?.priority ?? 'MEDIUM',
      advance:  targetCase?.advance  != null ? String(targetCase.advance)  : '',
      charges:  targetCase?.charges  != null ? String(targetCase.charges)  : '',
      discount: targetCase?.discount != null ? String(targetCase.discount) : '',
      groupId: client.groupId ?? '',
      serviceType: client.serviceType ?? 'FULL_SERVICE',
    });
  }, [client]);

  const isLocked = isEdit && !!client && client.visaCases.length > 0 &&
    client.visaCases.every(vc => vc.stage === 'COMPLETED');

  // ── Duplicate passport detection ──────────────────────────────────────────────
  // A warning, never a block: an existing client legitimately applies for more visas, so
  // staff can always carry on and create a separate profile. The point is that they see
  // the existing one first and get a one-click route to attaching a case to it instead.
  //
  // The raw field is debounced before it reaches the query key, so a typed-out passport
  // costs one request rather than one per keystroke. Because the debounced value *is* part
  // of the key, react-query caches per passport and a slow answer for an earlier value can
  // never land on top of a newer one — `passportCheck` always belongs to the current key.
  const [debouncedPassport, setDebouncedPassport] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedPassport(form.passportNumber.trim()), 400);
    return () => clearTimeout(t);
  }, [form.passportNumber]);

  const { data: passportCheck } = useQuery({
    queryKey: ['checkPassport', debouncedPassport, id ?? null],
    // In edit mode the client being edited is excluded, so it never flags itself.
    queryFn:  () => checkPassport(debouncedPassport, id),
    enabled:  debouncedPassport.length > 0,
    staleTime: 60_000,
  });
  const duplicate = passportCheck?.data?.exists ? passportCheck.data.client : null;

  // Passport numbers the user has already been warned about and chose to continue past.
  // Without this the modal would spring back open on the next keystroke or re-render.
  const [dismissedPassports, setDismissedPassports] = useState<string[]>([]);
  const duplicateOpen = !!duplicate && !dismissedPassports.includes(debouncedPassport);
  const dismissDuplicate = () => setDismissedPassports(p => [...p, debouncedPassport]);

  // Abandons this duplicate profile and takes the visa details entered so far over to the
  // existing client, where ClientDetail opens its New Case form pre-filled with them.
  const openNewCaseForExisting = () => {
    if (!duplicate) return;
    const prefill: NewCasePrefill = {
      destinations: form.destinations,
      cities: form.cities,
      visaType: form.visaType,
      ukVisaExpiry: form.ukVisaExpiry,
      eVisaType: form.eVisaType,
      priority: form.priority,
      advance: form.advance, charges: form.charges, discount: form.discount,
    };
    // replace, not push: this abandons the duplicate profile the user was filling in, so
    // that form must not stay on the history stack for Back to land on.
    navigate(`/clients/${duplicate.id}`, { replace: true, state: { openNewCase: true, newCasePrefill: prefill } });
  };

  const save = useMutation({
    mutationFn: async () => {
      const clientPayload: any = {
        ...form,
        maritalStatus: form.maritalStatus || undefined,
        email:          form.email          || undefined,
        whatsapp:       form.whatsapp       || undefined,
        registeredEmail:form.registeredEmail|| undefined,
        birthCity:      form.birthCity      || undefined,
        source:         form.source         || undefined,
        referredBy:     form.referredBy     || undefined,
        visaAndTravelHistory: form.visaAndTravelHistory || undefined,
        previousSchengenVisa: form.previousSchengenVisa || undefined,
        addressStreet:        form.addressStreet      || undefined,
        addressCity:          form.addressCity        || undefined,
        addressShire:         form.addressShire        || undefined,
        addressPostalCode:    form.addressPostalCode  || undefined,
        addressCountry:       form.addressCountry     || undefined,
        groupId:              form.groupId             || undefined,
      };
      delete clientPayload.destinations; delete clientPayload.cities; delete clientPayload.visaType;
      delete clientPayload.ukVisaExpiry; delete clientPayload.eVisaType; delete clientPayload.priority; delete clientPayload.advance;
      delete clientPayload.charges; delete clientPayload.discount;

      // A single pick sets the decided destination/city directly; more than one leaves it
      // as a shortlist for File Processing to finalize down to one later. destinationOptions
      // is sent as an explicit [] (not undefined) in the single-pick case — the backend uses
      // its presence to tell "replacing the whole shortlist+destination together" apart from
      // "finalizing from the existing shortlist" (see visaCase.service.ts updateCase), so an
      // omitted key here would wrongly re-trigger the old shortlist-membership check against
      // whatever destinationOptions the case already had stored.
      const destinationFields = form.destinations.length > 1
        ? { destination: undefined, destinationOptions: form.destinations }
        : { destination: form.destinations[0], destinationOptions: [] as string[] };
      const cityFields = form.cities.length > 1
        ? { city: undefined, cityOptions: form.cities }
        : { city: form.cities[0], cityOptions: [] as string[] };

      if (!isEdit) {
        // First entry in the client's HR Comments log — the backend tags it "Client
        // Intake" automatically. Later phases only ever append to this, never overwrite it.
        const resp = await createClient({
          ...clientPayload,
          hrComments: form.hrComments || undefined,
          ...destinationFields,
          ...cityFields,
          visaType:     form.visaType     || undefined,
          ukVisaExpiry: form.ukVisaExpiry || undefined,
          eVisaType:    form.eVisaType    || undefined,
          priority:     form.priority,
          advance:  form.advance  ? parseFloat(form.advance)  : undefined,
          charges:  form.charges  ? parseFloat(form.charges)  : undefined,
          discount: form.discount ? parseFloat(form.discount) : undefined,
        });

        // The client now has an id — any documents staged in the form above can finally
        // be uploaded against it. Failures here shouldn't undo the client that was just
        // created; surface them as a warning on the page we land on instead.
        let docWarning: string | undefined;
        if (stagedFiles.length > 0 && resp.data?.id) {
          const uploaded = await uploadClientDocuments(resp.data.id, stagedFiles, progress => {
            setUploadProgress(prev => ({
              ...prev,
              [progress.fileName]: {
                status: progress.status,
                pct: progress.total ? (progress.loaded / progress.total) * 100 : 0,
                error: progress.error,
              },
            }));
          });
          if (uploaded.length < stagedFiles.length) {
            const failed = stagedFiles.length - uploaded.length;
            docWarning = `Client created, but ${failed} of ${stagedFiles.length} document${stagedFiles.length > 1 ? 's' : ''} failed to upload. You can retry from the client's profile page.`;
          }
        }
        return { resp, docWarning };
      }

      const clientResp = await updateClient(id!, clientPayload);
      // The HR Comments box on this form is only ever a new note to add, appended as its
      // own "Client Update" entry — the accumulated history itself is never resubmitted.
      if (form.hrComments.trim()) {
        await appendHrComment(id!, 'Client Update', form.hrComments.trim());
      }
      if (targetCase) {
        await updateCase(targetCase.id, {
          ...destinationFields,
          ...cityFields,
          visaType:     form.visaType     || undefined,
          ukVisaExpiry: form.ukVisaExpiry || undefined,
          eVisaType:    form.eVisaType    || undefined,
          priority:     form.priority,
          advance:  form.advance  ? parseFloat(form.advance)  : 0,
          charges:  form.charges  ? parseFloat(form.charges)  : undefined,
          discount: form.discount ? parseFloat(form.discount) : undefined,
        });
      }
      return { resp: clientResp, docWarning: undefined as string | undefined };
    },
    onSuccess: ({ resp, docWarning }) => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      if (isEdit) {
        qc.invalidateQueries({ queryKey: ['client', id] });
        if (targetCase) qc.invalidateQueries({ queryKey: ['case', targetCase.id] });
        qc.invalidateQueries({ queryKey: ['cases'] });
      }
      // replace, not push: the form has been submitted, so leaving it on the history stack
      // makes Back from the client page reopen an already-saved edit form — which is what
      // made "Back" feel like it jumped several steps.
      navigate(`/clients/${resp.data!.id}`, { replace: true, state: docWarning ? { docWarning } : undefined });
    },
    onError: (e: AxiosError<{ message: string; errors?: Record<string, string[]> }>) => {
      const resp = e.response?.data;
      if (resp?.errors) {
        const errs: Record<string, string> = {};
        for (const [k, v] of Object.entries(resp.errors)) errs[k] = v[0];
        setFieldErrors(errs);
      }
      setError(resp?.message ?? `Failed to ${isEdit ? 'update' : 'create'} client`);
    },
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  if (isEdit && clientLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // Every exit from this form (back arrow, Cancel, post-save redirect) replaces rather
  // than pushes. A form is a detour, not a destination: pushing it left stale entries on
  // the stack so a later navigate(-1) — e.g. from CaseDetail — surfaced an already-saved
  // form instead of the page the user actually came from.
  const backTo = isEdit ? `/clients/${id}` : '/clients';

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(backTo, { replace: true })} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Client' : 'Add New Client'}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {isEdit ? 'Update client passport & visa application details' : 'Enter client passport & visa application details'}
          </p>
        </div>
      </div>

      {error && <Alert variant="error" message={error} onClose={() => setError(null)} />}
      {lockBlocked && lock.status === 'blocked' && (
        <div className="space-y-2">
          <Alert variant="warning" message={`${lock.message} This form opens for you automatically once they finish.`} />
          <Button size="sm" variant="outline" onClick={() => retryLock()}>Try again now</Button>
        </div>
      )}
      {isLocked && (
        <Alert variant="warning" message="This client is locked — all cases are completed and information can no longer be changed." />
      )}

      <fieldset disabled={isLocked || lockBlocked} className="space-y-6">
      <Section title="Personal Information">
        <div className="grid grid-cols-2 gap-4">
          <Field label="First Name" required error={fieldErrors.firstName}>
            <input className={inputCls} value={form.firstName} onChange={set('firstName')} placeholder="John" />
          </Field>
          <Field label="Last Name" required error={fieldErrors.lastName}>
            <input className={inputCls} value={form.lastName} onChange={set('lastName')} placeholder="Doe" />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Gender" required>
            <select className={inputCls} value={form.gender} onChange={set('gender')}>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>
          <Field label="Date of Birth" required error={fieldErrors.dob}>
            <input type="date" min="1900-01-01" max="2099-12-31" className={inputCls} value={form.dob} onChange={set('dob')} />
          </Field>
          <Field label="Nationality" required error={fieldErrors.nationality}>
            <input className={inputCls} value={form.nationality} onChange={set('nationality')} placeholder="Pakistani" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Marital Status">
            <select className={inputCls} value={form.maritalStatus} onChange={set('maritalStatus')}>
              <option value="">— Select —</option>
              <option value="SINGLE">Single</option>
              <option value="MARRIED">Married</option>
              <option value="DIVORCED">Divorced</option>
              <option value="WIDOWED">Widowed</option>
            </select>
          </Field>
          <Field label="Birth City">
            <input className={inputCls} value={form.birthCity} onChange={set('birthCity')} placeholder="Lahore" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Phone" required error={fieldErrors.phone}>
            <input className={inputCls} value={form.phone} onChange={set('phone')} placeholder="+92 300 0000000" />
          </Field>
          <Field label="WhatsApp">
            <input className={inputCls} value={form.whatsapp} onChange={set('whatsapp')} placeholder="+92 300 0000000" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Email">
            <input type="email" className={inputCls} value={form.email} onChange={set('email')} placeholder="client@email.com" />
          </Field>
          <Field label="Registered Email (for visa portal)">
            <input type="email" className={inputCls} value={form.registeredEmail} onChange={set('registeredEmail')} />
          </Field>
        </div>
        <Field label="Availability">
          <input className={inputCls} value={form.availability} onChange={set('availability')} placeholder="e.g. Weekdays after 5pm" />
        </Field>
        <Field label="Street Address">
          <input className={inputCls} value={form.addressStreet} onChange={set('addressStreet')} placeholder="123 Main Street" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="City">
            <input className={inputCls} value={form.addressCity} onChange={set('addressCity')} placeholder="Lahore" />
          </Field>
          <Field label="Shire">
            <input className={inputCls} value={form.addressShire} onChange={set('addressShire')} placeholder="Punjab" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Postal Code">
            <input className={inputCls} value={form.addressPostalCode} onChange={set('addressPostalCode')} placeholder="54000" />
          </Field>
          <Field label="Country">
            <input className={inputCls} value={form.addressCountry} onChange={set('addressCountry')} placeholder="Pakistan" />
          </Field>
        </div>
      </Section>

      <Section title="Passport Details">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Passport Number" required error={fieldErrors.passportNumber}>
            <input
              className={duplicate ? warnInputCls : inputCls}
              value={form.passportNumber}
              onChange={set('passportNumber')}
              placeholder="AB1234567"
            />
            {/* Stays visible after the modal is dismissed so the match isn't silently
                forgotten — clicking it brings the warning back with its actions. */}
            {duplicate && !duplicateOpen && (
              <button
                type="button"
                onClick={() => setDismissedPassports(p => p.filter(v => v !== debouncedPassport))}
                className="text-xs text-amber-600 hover:text-amber-700 underline text-left mt-1"
              >
                Already on file as {duplicate.clientRef} — review
              </button>
            )}
          </Field>
          <Field label="Issue Date" required error={fieldErrors.passportIssue}>
            <input type="date" min="1900-01-01" max="2099-12-31" className={inputCls} value={form.passportIssue} onChange={set('passportIssue')} />
          </Field>
          <Field label="Expiry Date" required error={fieldErrors.passportExpiry}>
            <input
              type="date" min="1900-01-01" max="2099-12-31"
              className={isExpiringSoon(form.passportExpiry) ? warnInputCls : inputCls}
              value={form.passportExpiry}
              onChange={set('passportExpiry')}
            />
            {isExpiringSoon(form.passportExpiry) && (
              <p className="text-xs text-amber-600 mt-1">Expires within 6 months</p>
            )}
          </Field>
        </div>
        <Field label="Previous Schengen Visa Details">
          <textarea className={inputCls} rows={2} value={form.previousSchengenVisa} onChange={set('previousSchengenVisa')} placeholder="Prior Schengen visas, dates, type…" />
        </Field>
        <Field label="Visa & Travel History">
          <textarea className={inputCls} rows={3} value={form.visaAndTravelHistory} onChange={set('visaAndTravelHistory')} placeholder="Previous visas, travel history..." />
        </Field>
      </Section>

      {!isEdit && (
        <Section title="Documents">
          <PendingDocumentGallery
            files={stagedFiles}
            onChange={setStagedFiles}
            progress={uploadProgress}
            disabled={save.isPending}
          />
        </Section>
      )}

      {(!isEdit || targetCase) && (
        <Section title="Visa Application">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Destination Country" required error={fieldErrors.destination}>
              <MultiCombobox
                values={form.destinations}
                onChange={v => setForm(f => ({ ...f, destinations: v }))}
                options={DESTINATION_OPTIONS}
                placeholder="Select destination(s)"
              />
              {form.destinations.length > 1 && (
                <p className="text-xs text-amber-600 mt-1">
                  Multiple destinations shortlisted — a single one is finalized later in File Processing.
                </p>
              )}
            </Field>
            <Field label="Appointment City">
              <MultiCombobox
                values={form.cities}
                onChange={v => setForm(f => ({ ...f, cities: v }))}
                options={APPOINTMENT_CITY_OPTIONS}
                placeholder="Select city(-ies)"
              />
              {form.cities.length > 1 && (
                <p className="text-xs text-amber-600 mt-1">
                  Multiple cities shortlisted — a single one is finalized later in File Processing.
                </p>
              )}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Visa Type">
              <select className={inputCls} value={form.visaType} onChange={set('visaType')}>
                <option value="">Select visa type</option>
                {VISA_TYPE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <select className={inputCls} value={form.priority} onChange={set('priority')}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </Field>
          </div>
        </Section>
      )}

      {(!isEdit || targetCase) && (
        <Section title="E-Visa">
          <div className="grid grid-cols-2 gap-4">
            <Field label="UK Visa Expiry">
              <input
                type="date" min="1900-01-01" max="2099-12-31"
                className={isExpiringSoon(form.ukVisaExpiry) ? warnInputCls : inputCls}
                value={form.ukVisaExpiry}
                onChange={set('ukVisaExpiry')}
              />
              {isExpiringSoon(form.ukVisaExpiry) && (
                <p className="text-xs text-amber-600 mt-1">Expires within 6 months</p>
              )}
            </Field>
            <Field label="Visa Type">
              <select className={inputCls} value={form.eVisaType} onChange={set('eVisaType')}>
                <option value="">Select visa type</option>
                {EVISA_TYPE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
          </div>
        </Section>
      )}

      {(!isEdit || targetCase) && (
        <Section title="Financial">
          <div className="grid grid-cols-3 gap-4">
            <Field label="Charges (£)">
              <input type="number" min="0" step="0.01" className={inputCls} value={form.charges} onChange={set('charges')} placeholder="0.00" />
            </Field>
            <Field label="Discount (£)">
              <input type="number" min="0" step="0.01" className={inputCls} value={form.discount} onChange={set('discount')} placeholder="0.00" />
            </Field>
            <Field label="Advance Amount (£)">
              <input type="number" min="0" step="0.01" className={inputCls} value={form.advance} onChange={set('advance')} placeholder="0.00" />
            </Field>
          </div>
          <p className="text-xs text-gray-400">
            A non-zero advance is automatically marked as paid. Leaving it at £0 shows a pending-advance warning on the case until it's filled in.
          </p>
        </Section>
      )}

      <Section title="Administrative">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Received Date" required>
            <input type="date" min="1900-01-01" max="2099-12-31" className={inputCls} value={form.receivedDate} onChange={set('receivedDate')} />
          </Field>
          <Field label="Source">
            <input className={inputCls} value={form.source} onChange={set('source')} placeholder="WhatsApp, Referral, Walk-in..." />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Referred By">
            <input className={inputCls} value={form.referredBy} onChange={set('referredBy')} />
          </Field>
          <Field label="Group (family / friends)">
            <select className={inputCls} value={form.groupId} onChange={set('groupId')}>
              <option value="">— None —</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.groupRef} — {g.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Service Type" required>
          <select className={inputCls} value={form.serviceType} onChange={set('serviceType')}>
            <option value="FULL_SERVICE">Full Service (Appointment + File Processing)</option>
            <option value="APPOINTMENT_ONLY">Appointment Only</option>
          </select>
        </Field>
        <Field label="HR Comments">
          {/* One running log spanning the client's whole lifecycle — shown read-only here,
              never overwritten. The box below only ever adds a new, phase-tagged note. */}
          {client?.hrComments && (
            <div className="max-h-32 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 mb-2 text-xs text-gray-600 whitespace-pre-line">
              {client.hrComments}
            </div>
          )}
          <textarea className={inputCls} rows={3} placeholder="Add a note…" value={form.hrComments} onChange={set('hrComments')} />
        </Field>
      </Section>
      </fieldset>

      <div className="flex justify-end gap-3 pb-6">
        <Button variant="outline" onClick={() => navigate(backTo, { replace: true })}>Cancel</Button>
        {!isLocked && (
          <Button
            leftIcon={<Save className="w-4 h-4" />}
            loading={save.isPending}
            disabled={lockBlocked || lockPending}
            onClick={() => save.mutate()}
          >
            {isEdit ? 'Save Changes' : 'Create Client'}
          </Button>
        )}
      </div>

      {/* Duplicate passport warning. Dismissing it is always allowed — a second profile for
          the same person is a supported (if discouraged) outcome, so nothing here blocks
          the save. The primary action is the non-duplicating route instead. */}
      <Modal
        open={duplicateOpen}
        onClose={dismissDuplicate}
        title="Client already exists"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={dismissDuplicate}>Continue as a new client</Button>
            <Button leftIcon={<FilePlus className="w-4 h-4" />} onClick={openNewCaseForExisting}>
              Open New Case for Existing Client
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Client already exists in the system under{' '}
              <span className="font-semibold">
                {duplicate?.firstName} {duplicate?.lastName} ({duplicate?.clientRef})
              </span>{' '}
              currently in{' '}
              <span className="font-semibold">
                {duplicate?.stage ? STAGE_LABELS[duplicate.stage] : 'no open case'}
              </span>.
            </p>
          </div>
          <p className="text-sm text-gray-600">
            Opening a new case links this application to that existing client record, so their
            passport, documents and history stay on one profile. Creating a separate client is
            still possible — use it only when this genuinely is a different person.
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default ClientForm;
