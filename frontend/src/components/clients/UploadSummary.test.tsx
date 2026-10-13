import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UploadSummary } from './UploadSummary';

// Client feedback, 13 Oct 2026: a folder upload that came up short gave no message at all.
describe('UploadSummary', () => {
  it('names every file that was skipped or failed, and why', () => {
    render(
      <UploadSummary
        summary={{
          total: 5, uploaded: 3,
          skipped: ['bank-statement.pdf (31.2 MB)'],
          failed: [{ name: 'letter.docx', reason: 'Network Error' }],
        }}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText(/3 of 5 files uploaded · 2 not uploaded/)).toBeTruthy();
    expect(screen.getByText(/over the 25 MB per-file limit/)).toBeTruthy();
    expect(screen.getByText('bank-statement.pdf (31.2 MB)')).toBeTruthy();
    expect(screen.getByText('letter.docx: Network Error')).toBeTruthy();
  });

  it('confirms a clean upload', () => {
    render(<UploadSummary summary={{ total: 2, uploaded: 2, skipped: [], failed: [] }} onDismiss={() => {}} />);
    expect(screen.getByText(/2 of 2 files uploaded/)).toBeTruthy();
    expect(screen.queryByText(/not uploaded/)).toBeNull();
  });
});
