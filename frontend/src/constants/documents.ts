// Mirrors backend/src/services/clientDocument.service.ts — kept in sync manually since
// client-side checks are just a fast-fail UX nicety; the server re-validates everything.
// Any file type is accepted since 1 Oct 2026 (#6) — PDFs, images, Word files and anything
// else a client sends — so there is no `accept` filter on the pickers any more. Only the
// per-file size cap remains.
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

export const isImageMime = (mimeType: string): boolean => mimeType.startsWith('image/');

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
