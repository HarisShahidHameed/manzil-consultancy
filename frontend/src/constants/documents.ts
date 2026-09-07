// Mirrors backend/src/services/clientDocument.service.ts — kept in sync manually since
// client-side checks are just a fast-fail UX nicety; the server re-validates everything.
export const ACCEPTED_FILE_INPUT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/*';
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export const isImageMime = (mimeType: string): boolean => mimeType.startsWith('image/');

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
