// True once the date is within 6 months from today (including already past).
export const isExpiringSoon = (dateStr?: string | null): boolean => {
  if (!dateStr) return false;
  const sixMonthsOut = new Date();
  sixMonthsOut.setMonth(sixMonthsOut.getMonth() + 6);
  return new Date(dateStr) <= sixMonthsOut;
};
