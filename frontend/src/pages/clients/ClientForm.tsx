import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { ArrowLeft, Save } from 'lucide-react';
import { createClient, getClient, updateClient } from '../../api/clients';
import { updateCase } from '../../api/cases';
import { getGroups } from '../../api/groups';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { MultiCombobox } from '../../components/ui/MultiCombobox';
import { DESTINATION_OPTIONS, APPOINTMENT_CITY_OPTIONS, VISA_TYPE_OPTIONS } from '../../constants/options';

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

const emptyForm = {
  receivedDate: new Date().toISOString().split('T')[0],
  firstName: '', lastName: '', gender: 'MALE' as 'MALE' | 'FEMALE' | 'OTHER',
  dob: '', phone: '', email: '', whatsapp: '',
  addressStreet: '', addressCity: '', addressShire: '', addressPostalCode: '', addressCountry: '',
  passportNumber: '', passportIssue: '', passportExpiry: '',
  birthCity: '', nationality: '', maritalStatus: '' as '' | 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED',
  previousSchengenVisa: '', registeredEmail: '',
  eVisa: false,
  visaAndTravelHistory: '', source: '', referredBy: '', hrComments: '', folderUrl: '',
  destinations: [] as string[], cities: [] as string[], visaType: '', ukVisaExpiry: '', eVisaType: '',
  priority: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
  advance: '', charges: '', discount: '', groupId: '',
};

const ClientForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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
      hrComments: client.hrComments ?? '', folderUrl: client.folderUrl ?? '',
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
    });
  }, [client]);

  const isLocked = isEdit && !!client && client.visaCases.length > 0 &&
    client.visaCases.every(vc => vc.stage === 'COMPLETED');

  const save = useMutation({
    mutationFn: async () => {
      const clientPayload: any = {
        ...form,
        maritalStatus: form.maritalStatus || undefined,
        email:          form.email          || undefined,
        whatsapp:       form.whatsapp       || undefined,
        registeredEmail:form.registeredEmail|| undefined,
        folderUrl:      form.folderUrl      || undefined,
        birthCity:      form.birthCity      || undefined,
        source:         form.source         || undefined,
        referredBy:     form.referredBy     || undefined,
        hrComments:     form.hrComments     || undefined,
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
      // as a shortlist for File Processing to finalize down to one later.
      const destinationFields = form.destinations.length > 1
        ? { destination: undefined, destinationOptions: form.destinations }
        : { destination: form.destinations[0], destinationOptions: undefined };
      const cityFields = form.cities.length > 1
        ? { city: undefined, cityOptions: form.cities }
        : { city: form.cities[0], cityOptions: undefined };

      if (!isEdit) {
        return createClient({
          ...clientPayload,
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
      }

      const clientResp = await updateClient(id!, clientPayload);
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
      return clientResp;
    },
    onSuccess: (resp) => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      if (isEdit) {
        qc.invalidateQueries({ queryKey: ['client', id] });
        if (targetCase) qc.invalidateQueries({ queryKey: ['case', targetCase.id] });
        qc.invalidateQueries({ queryKey: ['cases'] });
      }
      navigate(`/clients/${resp.data!.id}`);
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

  const backTo = isEdit ? `/clients/${id}` : '/clients';

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(backTo)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
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
      {isLocked && (
        <Alert variant="warning" message="This client is locked — all cases are completed and information can no longer be changed." />
      )}

      <fieldset disabled={isLocked} className="space-y-6">
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
            <input className={inputCls} value={form.passportNumber} onChange={set('passportNumber')} placeholder="AB1234567" />
          </Field>
          <Field label="Issue Date" required error={fieldErrors.passportIssue}>
            <input type="date" min="1900-01-01" max="2099-12-31" className={inputCls} value={form.passportIssue} onChange={set('passportIssue')} />
          </Field>
          <Field label="Expiry Date" required error={fieldErrors.passportExpiry}>
            <input type="date" min="1900-01-01" max="2099-12-31" className={inputCls} value={form.passportExpiry} onChange={set('passportExpiry')} />
          </Field>
        </div>
        <Field label="Previous Schengen Visa Details">
          <textarea className={inputCls} rows={2} value={form.previousSchengenVisa} onChange={set('previousSchengenVisa')} placeholder="Prior Schengen visas, dates, type…" />
        </Field>
        <Field label="Visa & Travel History">
          <textarea className={inputCls} rows={3} value={form.visaAndTravelHistory} onChange={set('visaAndTravelHistory')} placeholder="Previous visas, travel history..." />
        </Field>
      </Section>

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
                <option value="MEDIUM">Medium</option>
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
              <input type="date" min="1900-01-01" max="2099-12-31" className={inputCls} value={form.ukVisaExpiry} onChange={set('ukVisaExpiry')} />
            </Field>
            <Field label="Visa Type">
              <select className={inputCls} value={form.eVisaType} onChange={set('eVisaType')}>
                <option value="">Select visa type</option>
                {VISA_TYPE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
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
        <Field label="Folder URL">
          <input type="url" className={inputCls} value={form.folderUrl} onChange={set('folderUrl')} placeholder="https://drive.google.com/..." />
        </Field>
        <Field label="HR Comments">
          <textarea className={inputCls} rows={3} value={form.hrComments} onChange={set('hrComments')} />
        </Field>
      </Section>
      </fieldset>

      <div className="flex justify-end gap-3 pb-6">
        <Button variant="outline" onClick={() => navigate(backTo)}>Cancel</Button>
        {!isLocked && (
          <Button
            leftIcon={<Save className="w-4 h-4" />}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            {isEdit ? 'Save Changes' : 'Create Client'}
          </Button>
        )}
      </div>
    </div>
  );
};

export default ClientForm;
