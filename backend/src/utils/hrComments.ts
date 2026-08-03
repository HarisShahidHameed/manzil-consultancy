// HR Comments are one running log per client spanning their whole lifecycle — not a
// separate field per stage. Each note is appended (never overwrites) tagged with the
// phase it was added from, so the full history stays visible everywhere it's shown.
export const formatHrCommentEntry = (phase: string, text: string): string =>
  `[${phase} — ${new Date().toLocaleDateString('en-GB')}] ${text.trim()}`;

export const appendHrComment = (existing: string | null | undefined, phase: string, text: string): string => {
  const entry = formatHrCommentEntry(phase, text);
  return existing ? `${existing}\n${entry}` : entry;
};
