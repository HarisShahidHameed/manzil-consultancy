import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/database';
import {
  presignPutObject, presignGetObject, deleteObject,
  createMultipartUpload, presignUploadPart, completeMultipartUpload, abortMultipartUpload,
} from '../utils/s3';

// Files at or under this size go through a single presigned PUT. Above it, we use S3
// multipart upload so the browser can push parts in parallel instead of one slow serial
// stream — the whole reason a "large scan" doesn't stall the rest of the batch.
export const MULTIPART_THRESHOLD_BYTES = 8 * 1024 * 1024; // 8MB
export const PART_SIZE_BYTES = 8 * 1024 * 1024; // 8MB (S3's multipart minimum is 5MB per part except the last)
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB — generous for a scanned passport/photo, not a video dump
export const MAX_FILES_PER_REQUEST = 20;

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const sanitizeFileName = (name: string): string =>
  name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-150); // keep it short and filesystem/URL-safe; S3 keys can be long but no reason to

export interface PresignFileInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export type PresignedFile =
  | { fileName: string; mimeType: string; sizeBytes: number; key: string; mode: 'single'; uploadUrl: string }
  | { fileName: string; mimeType: string; sizeBytes: number; key: string; mode: 'multipart'; uploadId: string; partSize: number; parts: { partNumber: number; url: string }[] };

export class DocumentValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'DocumentValidationError'; }
}

const validateFile = ({ fileName, mimeType, sizeBytes }: PresignFileInput): void => {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new DocumentValidationError(`"${fileName}" is a ${mimeType || 'unknown'} file — only PDF, JPEG, PNG, WEBP and HEIC are accepted.`);
  }
  if (sizeBytes <= 0 || sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new DocumentValidationError(`"${fileName}" is ${(sizeBytes / 1024 / 1024).toFixed(1)}MB — the limit is ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB.`);
  }
};

// Presigns every requested file in parallel (independent S3/network round-trips — no
// reason to make one file's presign wait on another's) so a 7-10 document batch comes
// back as one fast burst instead of a serial chain.
export const requestUploads = async (clientId: string, files: PresignFileInput[]): Promise<PresignedFile[]> => {
  files.forEach(validateFile);

  return Promise.all(files.map(async (file): Promise<PresignedFile> => {
    const key = `clients/${clientId}/${uuidv4()}-${sanitizeFileName(file.fileName)}`;

    if (file.sizeBytes <= MULTIPART_THRESHOLD_BYTES) {
      const uploadUrl = await presignPutObject(key, file.mimeType);
      return { fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, key, mode: 'single', uploadUrl };
    }

    const uploadId = await createMultipartUpload(key, file.mimeType);
    const partCount = Math.ceil(file.sizeBytes / PART_SIZE_BYTES);
    const parts = await Promise.all(
      Array.from({ length: partCount }, (_, i) => i + 1).map(async partNumber => ({
        partNumber,
        url: await presignUploadPart(key, uploadId, partNumber),
      }))
    );
    return { fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, key, mode: 'multipart', uploadId, partSize: PART_SIZE_BYTES, parts };
  }));
};

export interface CompleteUploadInput {
  key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  mode: 'single' | 'multipart';
  uploadId?: string;
  parts?: { partNumber: number; eTag: string }[];
}

export const completeUpload = async (clientId: string, uploadedById: string | undefined, input: CompleteUploadInput) => {
  if (!input.key.startsWith(`clients/${clientId}/`)) {
    // A completion request for a key that was never presigned for this client — reject rather
    // than trust the client-supplied key blindly.
    throw new DocumentValidationError('Upload key does not belong to this client');
  }

  if (input.mode === 'multipart') {
    if (!input.uploadId || !input.parts?.length) throw new DocumentValidationError('Missing uploadId/parts for multipart completion');
    await completeMultipartUpload(input.key, input.uploadId, input.parts.map(p => ({ PartNumber: p.partNumber, ETag: p.eTag })));
  }

  return prisma.clientDocument.create({
    data: {
      clientId,
      key: input.key,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      uploadedById,
    },
  });
};

// Called when the browser gives up on a multipart upload (network drop, tab closed) so the
// abandoned parts don't sit in the bucket forever running up storage cost. A bucket-level
// "AbortIncompleteMultipartUpload" lifecycle rule is the backstop for cases that never call this.
export const abortUpload = (key: string, uploadId: string) => abortMultipartUpload(key, uploadId);

export const listDocuments = async (clientId: string) => {
  const docs = await prisma.clientDocument.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    include: { uploadedBy: { select: { firstName: true, lastName: true } } },
  });

  // Presigned GET URLs are generated fresh on every list call (not stored) — they expire in
  // 5 minutes, so a doc list left open in a background tab never leaks a permanently-valid link.
  return Promise.all(docs.map(async doc => ({
    id: doc.id,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    createdAt: doc.createdAt,
    uploadedBy: doc.uploadedBy ? `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}` : null,
    viewUrl: await presignGetObject(doc.key, doc.fileName),
  })));
};

export const deleteDocument = async (clientId: string, documentId: string): Promise<void> => {
  const doc = await prisma.clientDocument.findFirst({ where: { id: documentId, clientId } });
  if (!doc) throw new Error('DOCUMENT_NOT_FOUND');
  await deleteObject(doc.key);
  await prisma.clientDocument.delete({ where: { id: doc.id } });
};
