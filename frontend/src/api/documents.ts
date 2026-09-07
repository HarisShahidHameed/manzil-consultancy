import axios from 'axios';
import api from './axios';
import type { ApiResponse, ClientDocument } from '../types';

// A bare axios instance — deliberately NOT the app's `api` client. Presigned S3 URLs are
// already fully authorized; sending our own Authorization header or cookies to S3 would do
// nothing useful and can trip CORS preflight on the bucket for no reason.
const s3 = axios.create();

export interface PresignRequestFile {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

type PresignedFile =
  | { fileName: string; mimeType: string; sizeBytes: number; key: string; mode: 'single'; uploadUrl: string }
  | { fileName: string; mimeType: string; sizeBytes: number; key: string; mode: 'multipart'; uploadId: string; partSize: number; parts: { partNumber: number; url: string }[] };

export const getDocuments = (clientId: string) =>
  api.get<ApiResponse<ClientDocument[]>>(`/clients/${clientId}/documents`).then(r => r.data.data ?? []);

export const deleteDocument = (clientId: string, documentId: string) =>
  api.delete<ApiResponse<void>>(`/clients/${clientId}/documents/${documentId}`).then(r => r.data);

const presignUploads = (clientId: string, files: PresignRequestFile[]) =>
  api.post<ApiResponse<PresignedFile[]>>(`/clients/${clientId}/documents/presign`, { files }).then(r => r.data.data ?? []);

const completeUpload = (clientId: string, payload: {
  key: string; fileName: string; mimeType: string; sizeBytes: number;
  mode: 'single' | 'multipart'; uploadId?: string; parts?: { partNumber: number; eTag: string }[];
}) => api.post<ApiResponse<ClientDocument>>(`/clients/${clientId}/documents/complete`, payload).then(r => r.data.data!);

const abortUpload = (clientId: string, key: string, uploadId: string) =>
  api.post(`/clients/${clientId}/documents/abort`, { key, uploadId }).catch(() => undefined);

// Runs `worker` over `items` with at most `limit` in flight at once — used both across files
// in a batch and across parts within one large file, so a 10-document intake never opens more
// than a handful of simultaneous connections (parallel, not a stampede).
async function withConcurrency<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

const FILE_CONCURRENCY = 3;   // simultaneous files uploading
const PART_CONCURRENCY = 4;   // simultaneous parts, per large file

export interface UploadProgress {
  fileName: string;
  loaded: number;
  total: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

/**
 * Uploads every file directly to S3 (never through our own server) and, once each lands,
 * records it against the client. Small files go as a single PUT; anything over the
 * multipart threshold is sliced into parts that upload in parallel. Progress is reported
 * per file via `onProgress` so the UI can show a bar per document, not one opaque spinner.
 */
export const uploadClientDocuments = async (
  clientId: string,
  files: File[],
  onProgress: (progress: UploadProgress) => void
): Promise<ClientDocument[]> => {
  let presigned: PresignedFile[];
  try {
    presigned = await presignUploads(clientId, files.map(f => ({ fileName: f.name, mimeType: f.type || 'application/octet-stream', sizeBytes: f.size })));
  } catch (err: any) {
    // The whole batch failed before any file-specific upload started (bad config, network
    // drop, validation) — surface it per file rather than leaving progress bars stuck.
    const message = err?.response?.data?.message ?? err?.message ?? 'Could not start upload';
    files.forEach(f => onProgress({ fileName: f.name, loaded: 0, total: f.size, status: 'error', error: message }));
    return [];
  }
  const results: (ClientDocument | null)[] = new Array(files.length).fill(null);

  await withConcurrency(files, FILE_CONCURRENCY, async (file, i) => {
    const target = presigned[i];
    onProgress({ fileName: file.name, loaded: 0, total: file.size, status: 'uploading' });

    try {
      if (target.mode === 'single') {
        await s3.put(target.uploadUrl, file, {
          headers: { 'Content-Type': target.mimeType },
          onUploadProgress: evt => onProgress({ fileName: file.name, loaded: evt.loaded, total: evt.total ?? file.size, status: 'uploading' }),
        });
        const doc = await completeUpload(clientId, { key: target.key, fileName: target.fileName, mimeType: target.mimeType, sizeBytes: target.sizeBytes, mode: 'single' });
        results[i] = doc;
      } else {
        const partsLoaded = new Array(target.parts.length).fill(0);
        const reportCombined = () => onProgress({ fileName: file.name, loaded: partsLoaded.reduce((a, b) => a + b, 0), total: file.size, status: 'uploading' });

        const completedParts: { partNumber: number; eTag: string }[] = [];
        await withConcurrency(target.parts, PART_CONCURRENCY, async part => {
          const start = (part.partNumber - 1) * target.partSize;
          const end = Math.min(start + target.partSize, file.size);
          const blob = file.slice(start, end);

          const res = await s3.put(part.url, blob, {
            onUploadProgress: evt => { partsLoaded[part.partNumber - 1] = evt.loaded; reportCombined(); },
          });
          const eTag = (res.headers.etag ?? res.headers.ETag ?? '').toString().replace(/"/g, '');
          completedParts.push({ partNumber: part.partNumber, eTag });
        });

        const doc = await completeUpload(clientId, {
          key: target.key, fileName: target.fileName, mimeType: target.mimeType, sizeBytes: target.sizeBytes,
          mode: 'multipart', uploadId: target.uploadId, parts: completedParts,
        });
        results[i] = doc;
      }
      onProgress({ fileName: file.name, loaded: file.size, total: file.size, status: 'done' });
    } catch (err: any) {
      if (target.mode === 'multipart') await abortUpload(clientId, target.key, target.uploadId);
      onProgress({ fileName: file.name, loaded: 0, total: file.size, status: 'error', error: err?.response?.data?.message ?? err?.message ?? 'Upload failed' });
    }
  });

  return results.filter((d): d is ClientDocument => d !== null);
};
