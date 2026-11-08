import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CaseDetail from './CaseDetail';
import { getCase, updateCase, getCaseEmails } from '../../api/cases';
import { getAssignableUsers } from '../../api/users';
import { getDocuments } from '../../api/documents';
import { useAuth } from '../../hooks/useAuth';
import type { VisaCase } from '../../types';

vi.mock('../../api/cases');
vi.mock('../../api/users');
vi.mock('../../api/documents');
vi.mock('../../api/invoices');
vi.mock('../../api/clients');
vi.mock('../../api/pdf');
vi.mock('../../hooks/useAuth');

const baseCase = {
  id: 'case-1',
  clientId: 'client-1',
  updatedAt: '2026-10-28T10:00:00.000Z',
  priority: 'MEDIUM',
  destination: 'France',
  city: 'London',
  fraNo: 'FRA-1',
  tlsAccount: 'TLS-1',
  appointmentNotes: 'Bring the original passport',
  travelDate: '2026-11-20T00:00:00.000Z',
  hotelDate: '2026-11-21T00:00:00.000Z',
  hotelCancellationDate: '2026-11-22T00:00:00.000Z',
  salamComments: 'File Ready - Payment, Dead Line 28/10/2026',
  docAppointment: 'PENDING', docTicket: 'PENDING', docInsurance: 'PENDING', docHotel: 'PENDING',
  docEVisa: 'PENDING', docSop: 'PENDING', docVisaForm: 'PENDING', docSelfEmployment: 'PENDING',
  client: { id: 'client-1', fullName: 'Test Client', serviceType: 'FULL_SERVICE' },
} as unknown as VisaCase;

const renderCase = async (stage: VisaCase['stage']) => {
  vi.mocked(getCase).mockResolvedValue({ success: true, data: { ...baseCase, stage } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/cases/case-1']}>
        <Routes><Route path="/cases/:id" element={<CaseDetail />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('CaseDetail: emptying a field', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      hasRole: () => true,
      hasPermission: () => true,
      hasAnyPermission: () => true,
      user: { id: 'u1', roles: ['SUPER_ADMIN'], permissions: [] },
    } as never);
    vi.mocked(getAssignableUsers).mockResolvedValue({ success: true, data: [] } as never);
    vi.mocked(getDocuments).mockResolvedValue([] as never);
    vi.mocked(getCaseEmails).mockResolvedValue({ success: true, data: [] } as never);
    vi.mocked(updateCase).mockResolvedValue({ success: true, data: baseCase } as never);
  });

  it.each([
    ['User Comments', 'salamComments', 'File Ready - Payment, Dead Line 28/10/2026'],
    ['Travel Date', 'travelDate', '2026-11-20'],
    ['Hotel Date', 'hotelDate', '2026-11-21'],
    ['Hotel Cancellation Date', 'hotelCancellationDate', '2026-11-22'],
  ])('File Processing save sends an emptied %s', async (_label, field, shown) => {
    const user = userEvent.setup();
    await renderCase('FILE_PROCESSING');

    await user.clear(await screen.findByDisplayValue(shown));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateCase).toHaveBeenCalled());
    expect(vi.mocked(updateCase).mock.calls[0][1]).toMatchObject({ [field]: '' });
  });

  it('File Processing save sends the flight time as an exact instant', async () => {
    const user = userEvent.setup();
    await renderCase('FILE_PROCESSING');

    const input = (await screen.findByText('Flight Date & Time')).parentElement!.querySelector('input')!;
    await user.type(input, '2026-11-25T14:30');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateCase).toHaveBeenCalled());
    expect(vi.mocked(updateCase).mock.calls[0][1]).toMatchObject({
      flightDateTime: new Date('2026-11-25T14:30').toISOString(),
    });
  });

  it('lists the client emails with a Retry on a failure', async () => {
    vi.mocked(getCaseEmails).mockResolvedValue({
      success: true,
      data: [{ id: 'log-1', type: 'WELCOME', recipient: 'sara@example.com', status: 'FAILED', error: 'SMTP down', createdAt: '2026-11-01T10:00:00.000Z' }],
    } as never);
    await renderCase('FILE_PROCESSING');

    expect(await screen.findByText('Welcome email')).toBeInTheDocument();
    expect(screen.getByText('SMTP down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it.each([
    ['Appointment Notes', 'appointmentNotes', 'Bring the original passport'],
    ['City', 'city', 'London'],
    ['FRA No', 'fraNo', 'FRA-1'],
    ['TLS Account', 'tlsAccount', 'TLS-1'],
  ])('Appointment save sends an emptied %s', async (_label, field, shown) => {
    const user = userEvent.setup();
    await renderCase('APPOINTMENT');

    await user.clear(await screen.findByDisplayValue(shown));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateCase).toHaveBeenCalled());
    expect(vi.mocked(updateCase).mock.calls[0][1]).toMatchObject({ [field]: '' });
  });
});
