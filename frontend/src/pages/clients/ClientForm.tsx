import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { ArrowLeft, Save } from 'lucide-react';
import { createClient } from '../../api/clients';
import { getGroups } from '../../api/groups';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';

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

const ClientForm: React.FC = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    receivedDate: new Date().toISOString().split('T')[0],
    firstName: '', lastName: '', gender: 'MALE' as 'MALE' | 'FEMALE' | 'OTHER',
    dob: '', phone: '', email: '', whatsapp: '', residentialAddress: '',
    passportNumber: '', passportIssue: '', passportExpiry: '',
    birthCity: '', nationality: '', registeredEmail: '',
    eVisa: false, contract: false,
    visaAndTravelHistory: '', source: '', referredBy: '', hrComments: '', folderUrl: '',
    destination: '', city: '', visaType: '', ukVisaExpiry: '',
    priority: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
    advance: '', charges: '', discount: '', groupId: '',
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const { data: groupsData } = useQuery({ queryKey: ['groups'], queryFn: () => getGroups() });
  const groups = groupsData?.data ?? [];

  const save = useMutation({
    mutationFn: () => {
      const payload: any = {
        ...form,
        advance:  form.advance  ? parseFloat(form.advance)  : undefined,
        charges:  form.charges  ? parseFloat(form.charges)  : undefined,
        discount: form.discount ? parseFloat(form.discount) : undefined,
        email:          form.email          || undefined,
        whatsapp:       form.whatsapp       || undefined,
        registeredEmail:form.registeredEmail|| undefined,
        folderUrl:      form.folderUrl      || undefined,
        ukVisaExpiry:   form.ukVisaExpiry   || undefined,
        birthCity:      form.birthCity      || undefined,
        city:           form.city           || undefined,
        visaType:       form.visaType       || undefined,
        source:         form.source         || undefined,
        referredBy:     form.referredBy     || undefined,
        hrComments:     form.hrComments     || undefined,
        visaAndTravelHistory: form.visaAndTravelHistory || undefined,
        residentialAddress:   form.residentialAddress  || undefined,
        groupId:              form.groupId             || undefined,
      };
      return createClient(payload);
    },
    onSuccess: (resp) => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      navigate(`/clients/${resp.data!.id}`);
    },
    onError: (e: AxiosError<{ message: string; errors?: Record<string, string[]> }>) => {
      const resp = e.response?.data;
      if (resp?.errors) {
        const errs: Record<string, string> = {};
        for (const [k, v] of Object.entries(resp.errors)) errs[k] = v[0];
        setFieldErrors(errs);
      }
      setError(resp?.message ?? 'Failed to create client');
    },
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const setCheck = (k: 'eVisa' | 'contract') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.checked }));

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/clients')} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Add New Client</h1>
          <p className="text-gray-500 text-sm mt-1">Enter client passport & visa application details</p>
        </div>
      </div>

      {error && <Alert variant="error" message={error} onClose={() => setError(null)} />}

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
            <input type="date" className={inputCls} value={form.dob} onChange={set('dob')} />
          </Field>
          <Field label="Nationality" required error={fieldErrors.nationality}>
            <input className={inputCls} value={form.nationality} onChange={set('nationality')} placeholder="Pakistani" />
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
        <Field label="Birth City">
          <input className={inputCls} value={form.birthCity} onChange={set('birthCity')} placeholder="Lahore" />
        </Field>
        <Field label="Residential Address">
          <textarea className={inputCls} rows={2} value={form.residentialAddress} onChange={set('residentialAddress')} />
        </Field>
      </Section>

      <Section title="Passport Details">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Passport Number" required error={fieldErrors.passportNumber}>
            <input className={inputCls} value={form.passportNumber} onChange={set('passportNumber')} placeholder="AB1234567" />
          </Field>
          <Field label="Issue Date" required error={fieldErrors.passportIssue}>
            <input type="date" className={inputCls} value={form.passportIssue} onChange={set('passportIssue')} />
          </Field>
          <Field label="Expiry Date" required error={fieldErrors.passportExpiry}>
            <input type="date" className={inputCls} value={form.passportExpiry} onChange={set('passportExpiry')} />
          </Field>
        </div>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.eVisa} onChange={setCheck('eVisa')} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
            <span className="text-sm font-medium text-gray-700">E-Visa</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.contract} onChange={setCheck('contract')} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
            <span className="text-sm font-medium text-gray-700">Contract Signed</span>
          </label>
        </div>
        <Field label="Visa & Travel History">
          <textarea className={inputCls} rows={3} value={form.visaAndTravelHistory} onChange={set('visaAndTravelHistory')} placeholder="Previous visas, travel history..." />
        </Field>
      </Section>

      <Section title="Visa Application">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Destination Country" required error={fieldErrors.destination}>
            <input className={inputCls} value={form.destination} onChange={set('destination')} placeholder="Netherlands" />
          </Field>
          <Field label="Appointment City">
            <input className={inputCls} value={form.city} onChange={set('city')} placeholder="Islamabad" />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Visa Type">
            <input className={inputCls} value={form.visaType} onChange={set('visaType')} placeholder="Tourist / Work / Study" />
          </Field>
          <Field label="UK Visa Expiry">
            <input type="date" className={inputCls} value={form.ukVisaExpiry} onChange={set('ukVisaExpiry')} />
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

      <Section title="Financial">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Charges (£)">
            <input type="number" min="0" step="0.01" className={inputCls} value={form.charges} onChange={set('charges')} placeholder="0.00" />
          </Field>
          <Field label="Discount (£)">
            <input type="number" min="0" step="0.01" className={inputCls} value={form.discount} onChange={set('discount')} placeholder="0.00" />
          </Field>
          <Field label="Advance Paid (£)">
            <input type="number" min="0" step="0.01" className={inputCls} value={form.advance} onChange={set('advance')} placeholder="0.00" />
          </Field>
        </div>
      </Section>

      <Section title="Administrative">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Received Date" required>
            <input type="date" className={inputCls} value={form.receivedDate} onChange={set('receivedDate')} />
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

      <div className="flex justify-end gap-3 pb-6">
        <Button variant="outline" onClick={() => navigate('/clients')}>Cancel</Button>
        <Button
          leftIcon={<Save className="w-4 h-4" />}
          loading={save.isPending}
          onClick={() => save.mutate()}
        >
          Create Client
        </Button>
      </div>
    </div>
  );
};

export default ClientForm;
