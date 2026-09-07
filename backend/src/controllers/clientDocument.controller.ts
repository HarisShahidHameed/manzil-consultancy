import { Request, Response } from 'express';
import * as documentService from '../services/clientDocument.service';
import { sendSuccess, sendError } from '../utils/response';
import { createAuditLog } from '../utils/audit';
import { logger } from '../config/logger';
import { presignFilesSchema, completeUploadSchema, abortUploadSchema } from '../validators/clientDocument.validators';

export const requestUploads = async (req: Request, res: Response): Promise<void> => {
  try {
    const { files } = presignFilesSchema.parse(req.body);
    const presigned = await documentService.requestUploads(req.params.id, files);
    sendSuccess(res, 'Upload URLs issued', presigned);
  } catch (error: any) {
    if (error?.name === 'ZodError') { sendError(res, 'Validation failed', 422, error.flatten().fieldErrors); return; }
    if (error?.name === 'DocumentValidationError') { sendError(res, error.message, 422); return; }
    // Every other failure here is unexpected (bad S3 credentials, missing bucket, a
    // schema drift like a missing table) — log it, since the generic 500 sent to the
    // client on its own gives no way to tell those apart later.
    logger.error('Failed to prepare document upload', { message: error?.message, stack: error?.stack, clientId: req.params.id });
    sendError(res, 'Failed to prepare upload', 500);
  }
};

export const completeUpload = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = completeUploadSchema.parse(req.body);
    const doc = await documentService.completeUpload(req.params.id, req.user?.sub, data);
    await createAuditLog({
      userId: req.user?.sub,
      action: 'CLIENT_DOCUMENT_UPLOADED',
      resource: 'clients',
      resourceId: req.params.id,
      details: { fileName: data.fileName, sizeBytes: data.sizeBytes },
      req,
    });
    sendSuccess(res, 'Document saved', doc, 201);
  } catch (error: any) {
    if (error?.name === 'ZodError') { sendError(res, 'Validation failed', 422, error.flatten().fieldErrors); return; }
    if (error?.name === 'DocumentValidationError') { sendError(res, error.message, 422); return; }
    logger.error('Failed to complete document upload', { message: error?.message, stack: error?.stack, clientId: req.params.id, body: req.body });
    sendError(res, 'Failed to complete upload', 500);
  }
};

export const abortUpload = async (req: Request, res: Response): Promise<void> => {
  try {
    const { key, uploadId } = abortUploadSchema.parse(req.body);
    if (!key.startsWith(`clients/${req.params.id}/`)) { sendError(res, 'Key does not belong to this client', 422); return; }
    await documentService.abortUpload(key, uploadId);
    sendSuccess(res, 'Upload aborted');
  } catch (error: any) {
    if (error?.name === 'ZodError') { sendError(res, 'Validation failed', 422, error.flatten().fieldErrors); return; }
    logger.error('Failed to abort document upload', { message: error?.message, stack: error?.stack, clientId: req.params.id });
    sendError(res, 'Failed to abort upload', 500);
  }
};

export const listDocuments = async (req: Request, res: Response): Promise<void> => {
  const docs = await documentService.listDocuments(req.params.id);
  sendSuccess(res, 'Documents retrieved', docs);
};

export const deleteDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    await documentService.deleteDocument(req.params.id, req.params.documentId);
    await createAuditLog({
      userId: req.user?.sub,
      action: 'CLIENT_DOCUMENT_DELETED',
      resource: 'clients',
      resourceId: req.params.id,
      details: { documentId: req.params.documentId },
      req,
    });
    sendSuccess(res, 'Document deleted');
  } catch (error: any) {
    if (error?.message === 'DOCUMENT_NOT_FOUND') { sendError(res, 'Document not found', 404); return; }
    logger.error('Failed to delete document', { message: error?.message, stack: error?.stack, clientId: req.params.id, documentId: req.params.documentId });
    sendError(res, 'Failed to delete document', 500);
  }
};
