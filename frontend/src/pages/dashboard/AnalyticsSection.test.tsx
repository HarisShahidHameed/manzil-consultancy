import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnalyticsSection } from './AnalyticsSection';
import { getAnalytics } from '../../api/dashboard';
import { getAssignableUsers } from '../../api/users';
import { useAuth } from '../../hooks/useAuth';
import type { AnalyticsData } from '../../types';

vi.mock('../../api/dashboard');
vi.mock('../../api/users');
vi.mock('../../hooks/useAuth');

const fullAnalytics: AnalyticsData = {
  pipeline: {
    casesByStage: [{ stage: 'APPOINTMENT', count: 3 }],
    casesByPriority: [{ priority: 'MEDIUM', count: 3 }],
    casesByDestination: [{ destination: 'UK', count: 2 }, { destination: 'Canada', count: 1 }],
    appointmentFunnel: [{ status: 'NONE', count: 3 }],
    workload: [{ userId: 'u1', name: 'Jane Doe', count: 2 }],
    documentCompletion: [{ field: 'docAppointment', statuses: [{ status: 'PENDING', count: 3 }] }],
    caseTrend: [{ month: '2025-06', count: 3 }],
  },
  financials: {
    invoicesByStatus: [{ status: 'DRAFT', count: 1, totalAmount: 1000, paidAmount: 0, outstanding: 1000 }],
    revenueTrend: [{ month: '2025-06', charges: 1000, paid: 0, outstanding: 1000 }],
  },
  demographics: {
    clientsByNationality: [{ nationality: 'Pakistani', count: 2 }],
    clientsByGender: [{ gender: 'MALE', count: 2 }],
    clientsBySource: [{ source: 'Referral', count: 2 }],
    newClientsTrend: [{ month: '2025-06', count: 2 }],
  },
};

const emptyAnalytics: AnalyticsData = {
  pipeline: {
    casesByStage: [], casesByPriority: [], casesByDestination: [], appointmentFunnel: [],
    workload: [], documentCompletion: [], caseTrend: [],
  },
  financials: { invoicesByStatus: [], revenueTrend: [] },
  demographics: { clientsByNationality: [], clientsByGender: [], clientsBySource: [], newClientsTrend: [] },
};

const renderWithClient = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

const mockAuth = (permissions: string[]) => {
  (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    permissions,
    user: null, roles: [], hasPermission: (...p: string[]) => p.every(x => permissions.includes(x)),
    hasAnyPermission: (...p: string[]) => p.some(x => permissions.includes(x)),
    hasRole: () => false,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  (getAssignableUsers as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
  mockAuth(['reports:read', 'invoices:read']);
});

describe('AnalyticsSection', () => {
  it('shows a loading state before analytics resolve', async () => {
    let resolvePromise: (v: unknown) => void = () => {};
    (getAnalytics as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(resolve => { resolvePromise = resolve; })
    );

    renderWithClient(<AnalyticsSection />);

    expect(screen.getByText('Reports & Analytics')).toBeInTheDocument();
    expect(screen.queryByText('Cases by Stage')).not.toBeInTheDocument();

    resolvePromise({ data: fullAnalytics });
    await waitFor(() => expect(screen.getByText('Cases by Stage')).toBeInTheDocument());
  });

  it('renders pipeline, financials, and demographics chart cards once loaded', async () => {
    (getAnalytics as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: fullAnalytics });

    renderWithClient(<AnalyticsSection />);

    await waitFor(() => expect(screen.getByText('Cases by Stage')).toBeInTheDocument());
    expect(screen.getByText('Top Destinations')).toBeInTheDocument();
    expect(screen.getByText('Invoices by Status')).toBeInTheDocument();
    expect(screen.getByText('Top Nationalities')).toBeInTheDocument();
  });

  it('shows an empty state per chart when a series has no data', async () => {
    (getAnalytics as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: emptyAnalytics });

    renderWithClient(<AnalyticsSection />);

    await waitFor(() => expect(screen.getByText('Cases by Stage')).toBeInTheDocument());
    expect(screen.getAllByText('No data for the selected filters').length).toBeGreaterThan(0);
  });

  it('hides the Financials section for a user without invoices:read', async () => {
    mockAuth(['reports:read']);
    (getAnalytics as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: fullAnalytics });

    renderWithClient(<AnalyticsSection />);

    await waitFor(() => expect(screen.getByText('Cases by Stage')).toBeInTheDocument());
    expect(screen.queryByText('Financials')).not.toBeInTheDocument();
    expect(screen.queryByText('Invoices by Status')).not.toBeInTheDocument();
  });

  it('shows the Financials section for a user with invoices:read', async () => {
    (getAnalytics as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: fullAnalytics });

    renderWithClient(<AnalyticsSection />);

    await waitFor(() => expect(screen.getByText('Financials')).toBeInTheDocument());
  });

  it('populates the destination filter options from the loaded analytics', async () => {
    (getAnalytics as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: fullAnalytics });

    renderWithClient(<AnalyticsSection />);

    await waitFor(() => expect(screen.getByText('Cases by Stage')).toBeInTheDocument());
    expect(screen.getByRole('option', { name: 'UK' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Canada' })).toBeInTheDocument();
  });

  it('refetches analytics with the selected destination when Apply is clicked', async () => {
    (getAnalytics as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: fullAnalytics });
    const user = userEvent.setup();

    renderWithClient(<AnalyticsSection />);

    await waitFor(() => expect(screen.getByRole('option', { name: 'UK' })).toBeInTheDocument());

    const destinationSelect = screen.getByLabelText('Destination');
    await user.selectOptions(destinationSelect, 'UK');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(getAnalytics).toHaveBeenCalledWith({ destination: 'UK' }));
  });

  it('resets the destination filter back to empty when Reset is clicked', async () => {
    (getAnalytics as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: fullAnalytics });
    const user = userEvent.setup();

    renderWithClient(<AnalyticsSection />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'UK' })).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText('Destination'), 'UK');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(getAnalytics).toHaveBeenCalledWith({ destination: 'UK' }));
    expect((screen.getByLabelText('Destination') as HTMLSelectElement).value).toBe('UK');

    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect((screen.getByLabelText('Destination') as HTMLSelectElement).value).toBe(''));
  });
});
