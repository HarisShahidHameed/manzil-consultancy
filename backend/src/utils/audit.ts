import { Request } from 'express';
import { prisma } from '../config/database';
import { logger } from '../config/logger';

interface AuditParams {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  success?: boolean;
  req?: Request;
}

export const createAuditLog = async (params: AuditParams): Promise<void> => {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        details: params.details as object | undefined,
        success: params.success ?? true,
        ipAddress: params.req ? getClientIp(params.req) : undefined,
        userAgent: params.req?.headers['user-agent'],
      },
    });
  } catch (error) {
    logger.error('Failed to create audit log', { error, params });
  }
};

export const getClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
};
