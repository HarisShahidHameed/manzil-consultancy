import React from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

export interface UploadSummaryData {
  /** Files the user picked or dropped (OS clutter such as Thumbs.db already excluded). */
  total: number;
  uploaded: number;
  /** Not attempted: over the per-file size limit. Name plus size. */
  skipped: string[];
  /** Attempted but failed. Name plus the reason the server or network gave. */
  failed: { name: string; reason: string }[];
}

/**
 * The outcome of an upload, kept on screen until dismissed. Before this, a folder upload that
 * hit the size limit or a network error just came up short, and staff could not tell which
 * files had gone missing or why (client feedback, 13 Oct 2026).
 */
export const UploadSummary: React.FC<{ summary: UploadSummaryData; onDismiss: () => void }> = ({ summary, onDismiss }) => {
  const problems = summary.skipped.length + summary.failed.length;
  return (
    <div
      role="status"
      className={`mt-3 rounded-lg border px-3 py-2.5 text-xs ${problems ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-green-200 bg-green-50 text-green-800'}`}
    >
      <div className="flex items-start gap-2">
        {problems
          ? <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          : <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />}
        <div className="flex-1 space-y-1.5">
          <p className="font-medium">
            {summary.uploaded} of {summary.total} file{summary.total === 1 ? '' : 's'} uploaded
            {problems ? ` · ${problems} not uploaded` : ''}
          </p>
          {summary.skipped.length > 0 && (
            <div>
              <p>Skipped, over the 25 MB per-file limit (compress or split these and upload again):</p>
              <ul className="list-disc ml-4">{summary.skipped.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
          {summary.failed.length > 0 && (
            <div>
              <p>Failed to upload (try these again):</p>
              <ul className="list-disc ml-4">{summary.failed.map((f, i) => <li key={i}>{f.name}: {f.reason}</li>)}</ul>
            </div>
          )}
        </div>
        <button type="button" onClick={onDismiss} className="p-0.5 rounded hover:bg-black/5" aria-label="Dismiss upload summary">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
