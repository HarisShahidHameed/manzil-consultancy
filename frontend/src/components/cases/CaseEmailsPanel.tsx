import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { useState } from 'react';
import { getCaseEmails, retryCaseEmail, type CaseEmail } from '../../api/cases';
import { Button } from '../ui/Button';

const TYPE_LABELS: Record<CaseEmail['type'], string> = {
  WELCOME: 'Welcome email',
  HOTEL_CANCELLATION: 'Hotel cancellation',
  FLIGHT_CHECKIN: 'Flight check-in',
};

const STATUS_LABELS: Record<CaseEmail['status'], { label: string; className: string }> = {
  SENT:    { label: 'Sent',    className: 'bg-green-100 text-green-700' },
  PENDING: { label: 'Sending', className: 'bg-blue-100 text-blue-700' },
  FAILED:  { label: 'Failed',  className: 'bg-red-100 text-red-700' },
  SKIPPED: { label: 'Not sent', className: 'bg-gray-100 text-gray-600' },
};

// What has gone to the client from this case, so staff can see a failure and retry it. The poll
// is there because the welcome email is sent just after a save returns, not during it.
export const CaseEmailsPanel = ({ caseId }: { caseId: string }) => {
  const qc = useQueryClient();
  const [retryError, setRetryError] = useState('');
  const { data } = useQuery({ queryKey: ['case-emails', caseId], queryFn: () => getCaseEmails(caseId), refetchInterval: 30_000 });
  const retry = useMutation({
    mutationFn: (logId: string) => retryCaseEmail(caseId, logId),
    onMutate: () => setRetryError(''),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['case-emails', caseId] }),
    onError: (e: AxiosError<{ message: string }>) => setRetryError(e.response?.data?.message ?? 'Failed to retry email'),
  });

  const emails = data?.data ?? [];
  if (emails.length === 0) return null;

  return (
    <div className="border border-gray-100 rounded-lg p-4 bg-gray-50/50">
      <h3 className="text-sm font-medium text-gray-700 mb-2">Client emails</h3>
      <ul className="space-y-2">
        {emails.map(email => {
          const status = STATUS_LABELS[email.status];
          return (
            <li key={email.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-gray-800">{TYPE_LABELS[email.type]}</span>
              <span className={`rounded px-2 py-0.5 text-xs ${status.className}`}>{status.label}</span>
              <span className="text-xs text-gray-500">
                {email.recipient}{email.sentAt ? ` · ${new Date(email.sentAt).toLocaleString('en-GB')}` : ''}
              </span>
              {(email.status === 'FAILED' || email.status === 'SKIPPED') && (
                <>
                  <Button type="button" variant="secondary" size="sm" disabled={retry.isPending} onClick={() => retry.mutate(email.id)}>
                    Retry
                  </Button>
                  {email.error && <span className="w-full text-xs text-gray-500">{email.error}</span>}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {retryError && <p className="mt-2 text-xs text-red-600">{retryError}</p>}
    </div>
  );
};
