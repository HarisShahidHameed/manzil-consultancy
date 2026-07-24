export const DESTINATION_OPTIONS = [
  'Austria', 'Belgium', 'Croatia', 'Czech Republic', 'Cyprus', 'Denmark', 'Estonia',
  'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Iceland', 'Italy', 'Latvia',
  'Liechtenstein', 'Lithuania', 'Luxembourg', 'Malta', 'Netherlands', 'Norway',
  'Poland', 'Portugal', 'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland',
];

export const APPOINTMENT_CITY_OPTIONS = [
  'London', 'Manchester', 'Birmingham', 'Edinburgh',
];

export const VISA_TYPE_OPTIONS = ['Tourist', 'Work', 'Study'];

export const EVISA_TYPE_OPTIONS = [
  'Student', 'PSW', 'Dependent', 'Partner', 'Skilled Worker', 'EU settlement', 'ILR', 'Dependent- Child',
];

// Shortlists are stored as the full options list when "Any" is picked (see
// MultiCombobox's toggleAny) — joining that in full wherever it's displayed gets
// bulky fast (28 countries), so collapse it back down to "Any" for display, same as
// the picker itself does. Functionality (the stored shortlist) is unaffected.
export const formatShortlist = (selected: string[], allOptions: string[]): string =>
  selected.length > 0 && allOptions.length > 0 && allOptions.every(o => selected.includes(o))
    ? 'Any'
    : selected.join(', ');
