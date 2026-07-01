import { z } from 'zod';

export const analyticsQuerySchema = z.object({
  dateFrom:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format').optional(),
  dateTo:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format').optional(),
  destination:  z.string().max(100).optional(),
  assignedToId: z.string().uuid().optional(),
});

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
