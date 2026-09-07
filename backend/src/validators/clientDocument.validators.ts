import { z } from 'zod';
import { MAX_FILES_PER_REQUEST } from '../services/clientDocument.service';

export const presignFilesSchema = z.object({
  files: z.array(z.object({
    fileName: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(100),
    sizeBytes: z.number().int().positive(),
  })).min(1).max(MAX_FILES_PER_REQUEST),
});

export const completeUploadSchema = z.object({
  key: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive(),
  mode: z.enum(['single', 'multipart']),
  uploadId: z.string().optional(),
  parts: z.array(z.object({
    partNumber: z.number().int().positive(),
    eTag: z.string().min(1),
  })).optional(),
});

export const abortUploadSchema = z.object({
  key: z.string().min(1),
  uploadId: z.string().min(1),
});
