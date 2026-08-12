import { z } from 'zod';

export const financialReportsQuerySchema = z.object({
  dateFrom:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format').optional(),
  dateTo:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format').optional(),
  destination:   z.string().max(100).optional(),
  city:          z.string().max(100).optional(),
  serviceType:   z.enum(['APPOINTMENT_ONLY', 'FULL_SERVICE']).optional(),
  stage:         z.enum(['APPOINTMENT', 'FILE_PROCESSING', 'INVOICED', 'COMPLETED', 'CANCELLED']).optional(),
  priority:      z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  status:        z.enum(['DRAFT', 'SENT', 'PARTIAL', 'PAID']).optional(),
  // Matches a case where this user is the booker, the appointment handler, or the file
  // handler — i.e. "cases this user was appointed to or closed", not just who issued the invoice.
  assignedToId:  z.string().uuid().optional(),
  // Who actually created/issued the invoice — distinct from assignedToId above.
  createdById:   z.string().uuid().optional(),
  outstandingOnly: z.enum(['true']).optional(),
  minAmount:     z.string().regex(/^\d+(\.\d+)?$/).transform(Number).optional(),
  maxAmount:     z.string().regex(/^\d+(\.\d+)?$/).transform(Number).optional(),
  search:        z.string().max(150).optional(),
});

export type FinancialReportsQuery = z.infer<typeof financialReportsQuerySchema>;
