import type { DocumentStatus } from '../types';

export const DESTINATION_OPTIONS = [
  'Austria', 'Belgium', 'Croatia', 'Czech Republic', 'Cyprus', 'Denmark', 'Estonia',
  'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Iceland', 'Italy', 'Latvia',
  'Liechtenstein', 'Lithuania', 'Luxembourg', 'Malta', 'Netherlands', 'Norway',
  'Poland', 'Portugal', 'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland',
];

export const APPOINTMENT_CITY_OPTIONS = [
  'London', 'Manchester', 'Birmingham', 'Edinburgh',
];

// Short forms used only in listing-table cells (single city or shortlist chips) so long
// city names don't blow up column width — filter tabs and dropdowns keep the full name.
export const CITY_SHORT: Record<string, string> = {
  London: 'Lon', Manchester: 'Man', Birmingham: 'Bir', Edinburgh: 'Edi',
};
export const shortCity = (city: string): string => CITY_SHORT[city] ?? city;

export const VISA_TYPE_OPTIONS = ['Tourist', 'Work', 'Study'];

export const EVISA_TYPE_OPTIONS = [
  'Student', 'PSW', 'Dependent', 'Partner', 'Skilled Worker', 'EU settlement', 'ILR', 'Dependent- Child',
];

// The File Processing document checklist — shared between the case detail page's
// per-doc status editor (Manage tab) and the File Processing list's read-only status
// columns, so the set of tracked documents, labels and status colors can't drift apart.
export type DocKey = 'docAppointment' | 'docTicket' | 'docInsurance' | 'docHotel' | 'docEVisa' | 'docSop' | 'docVisaForm' | 'docSelfEmployment';
export const DOC_KEYS: DocKey[] = ['docAppointment', 'docTicket', 'docInsurance', 'docHotel', 'docEVisa', 'docSop', 'docVisaForm', 'docSelfEmployment'];
export const DOC_LABELS: Record<DocKey, string> = {
  docAppointment: 'Appointment Docs', docTicket: 'Ticket',
  docInsurance: 'Insurance', docHotel: 'Hotel', docEVisa: 'E-Visa',
  docSop: 'SOP', docVisaForm: 'Visa Form', docSelfEmployment: 'Self Employment Letter',
};
export const DOC_STATUS_COLORS: Record<DocumentStatus, string> = {
  PENDING: 'bg-gray-100 text-gray-600', IN_PROGRESS: 'bg-blue-100 text-blue-700',
  DONE: 'bg-green-100 text-green-700', NOT_REQUIRED: 'bg-slate-100 text-slate-500',
};

// Shortlists are stored as the full options list when "Any" is picked (see
// MultiCombobox's toggleAny) — joining that in full wherever it's displayed gets
// bulky fast (28 countries), so collapse it back down to "Any" for display, same as
// the picker itself does. Functionality (the stored shortlist) is unaffected.
export const formatShortlist = (selected: string[], allOptions: string[]): string =>
  selected.length > 0 && allOptions.length > 0 && allOptions.every(o => selected.includes(o))
    ? 'Any'
    : selected.join(', ');

// Same collapse-to-"Any" behavior as formatShortlist, but abbreviates each city (see
// CITY_SHORT) — for table/shortlist cells specifically, not filter tabs or dropdowns.
export const formatCityShortlist = (selected: string[], allOptions: string[]): string =>
  selected.length > 0 && allOptions.length > 0 && allOptions.every(o => selected.includes(o))
    ? 'Any'
    : selected.map(shortCity).join(', ');
