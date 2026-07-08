import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChartCard, ChartEmpty, CHART_COLORS, STAGE_CHART_COLORS, DOC_STATUS_COLORS } from './ChartCard';

describe('ChartCard', () => {
  it('renders the title, optional subtitle, and children', () => {
    render(
      <ChartCard title="Cases by Stage" subtitle="Current pipeline snapshot">
        <div data-testid="chart-body">chart</div>
      </ChartCard>
    );

    expect(screen.getByText('Cases by Stage')).toBeInTheDocument();
    expect(screen.getByText('Current pipeline snapshot')).toBeInTheDocument();
    expect(screen.getByTestId('chart-body')).toBeInTheDocument();
  });

  it('omits the subtitle element when none is given', () => {
    render(
      <ChartCard title="Top Destinations">
        <div>chart</div>
      </ChartCard>
    );

    expect(screen.getByText('Top Destinations')).toBeInTheDocument();
    expect(screen.queryByText('Current pipeline snapshot')).not.toBeInTheDocument();
  });
});

describe('ChartEmpty', () => {
  it('renders the default empty-state message', () => {
    render(<ChartEmpty />);
    expect(screen.getByText('No data for the selected filters')).toBeInTheDocument();
  });

  it('renders a custom label when provided', () => {
    render(<ChartEmpty label="Unable to load analytics" />);
    expect(screen.getByText('Unable to load analytics')).toBeInTheDocument();
  });
});

describe('chart color palettes', () => {
  it('exposes a non-empty shared color palette', () => {
    expect(CHART_COLORS.length).toBeGreaterThan(0);
    CHART_COLORS.forEach(c => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
  });

  it('maps every case stage to a color', () => {
    const stages = ['APPOINTMENT', 'FILE_PROCESSING', 'INVOICED', 'COMPLETED', 'CANCELLED'];
    stages.forEach(stage => expect(STAGE_CHART_COLORS[stage]).toMatch(/^#[0-9a-f]{6}$/i));
  });

  it('maps every document status to a color', () => {
    const statuses = ['PENDING', 'IN_PROGRESS', 'DONE', 'NOT_REQUIRED'];
    statuses.forEach(status => expect(DOC_STATUS_COLORS[status]).toMatch(/^#[0-9a-f]{6}$/i));
  });
});
