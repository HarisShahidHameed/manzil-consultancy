import type { CaseStage, DocumentStatus } from '../types';

// The one human-readable stage vocabulary for the whole app — the Clients stage filter, the
// duplicate-passport warning on ClientForm and the case detail breadcrumb/advance button all
// read off it, so a stage is never spelled two different ways in the UI. Lives here rather
// than in any one page so consumers don't have to value-import from a route component.
export const STAGE_LABELS: Record<CaseStage, string> = {
  APPOINTMENT:     'Appointment',
  FILE_PROCESSING: 'File Processing',
  INVOICED:        'Invoiced',
  COMPLETED:       'Completed',
  CANCELLED:       'Cancelled',
};

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

// Known misspellings seen in imported client sheets, mapped to the canonical option name
// so they still shorten correctly instead of showing the raw typo in listings.
const CITY_ALIASES: Record<string, string> = {
  manxhester: 'Manchester',
};

// Case/whitespace-insensitive lookup so "manchester", "Manchester ", etc. all shorten,
// not just an exact match of the canonical spelling.
const CITY_SHORT_NORMALIZED: Record<string, string> = Object.fromEntries(
  Object.entries(CITY_SHORT).map(([name, short]) => [name.trim().toLowerCase(), short])
);

const shortenSingleCity = (city: string): string => {
  const key = city.trim().toLowerCase();
  const canonical = CITY_ALIASES[key];
  if (canonical) return CITY_SHORT[canonical];
  return CITY_SHORT_NORMALIZED[key] ?? city.trim();
};

// Imported rows sometimes pack multiple cities into one string, e.g. "Birmingham/London/Manchester"
// (or comma-separated) instead of the cityOptions array — shorten each part so the cell stays compact.
export const shortCity = (city: string): string =>
  /[/,]/.test(city) ? city.split(/[/,]/).map(shortenSingleCity).join('/') : shortenSingleCity(city);

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
  docAppointment: 'Appointment', docTicket: 'Ticket',
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

// Why an advance was waived (1 Oct 2026 #9) — exactly these three, shown in the listings in
// place of a bare "Waived". Order is the dropdown order.
export type AdvanceWaiverType = 'WAIVED' | 'FAMILY' | 'FRIEND';
export const ADVANCE_WAIVER_LABELS: Record<AdvanceWaiverType, string> = {
  WAIVED: 'Waived', FAMILY: 'Family', FRIEND: 'Friend',
};
export const ADVANCE_WAIVER_TYPES = Object.keys(ADVANCE_WAIVER_LABELS) as AdvanceWaiverType[];
/** The label a waived case shows; older waivers with no type recorded read as plain "Waived". */
export const waiverLabel = (type?: AdvanceWaiverType | null): string => ADVANCE_WAIVER_LABELS[type ?? 'WAIVED'];
