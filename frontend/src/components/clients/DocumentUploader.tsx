import React, { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { UploadCloud, FolderUp } from 'lucide-react';
import { UploadSummary, type UploadSummaryData } from './UploadSummary';
import { uploadClientDocuments, type UploadProgress } from '../../api/documents';
import { MAX_FILE_SIZE_BYTES, formatBytes, isImageMime } from '../../constants/documents';
import { collectDroppedFiles, isJunkFile, FOLDER_INPUT_PROPS } from '../../utils/fileDrop';
import { DocumentThumb } from './DocumentThumb';
import type { ClientDocument } from '../../types';

interface InFlightItem extends UploadProgress {
  mimeType: string;
  previewUrl?: string;
}

interface Props {
  clientId: string;
  onUploaded: (docs: ClientDocument[]) => void;
}

export const DocumentUploader: React.FC<Props> = ({ clientId, onUploaded }) => {
  const [dragOver, setDragOver] = useState(false);
  const [inFlight, setInFlight] = useState<Record<string, InFlightItem>>({});
  const [summary, setSummary] = useState<UploadSummaryData | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const startUpload = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(f => !isJunkFile(f));
    const tooBig = files.filter(f => f.size > MAX_FILE_SIZE_BYTES).map(f => `${f.name} (${formatBytes(f.size)})`);
    const ok = files.filter(f => f.size <= MAX_FILE_SIZE_BYTES);
    setSummary(null);
    if (ok.length === 0) {
      if (tooBig.length) setSummary({ total: files.length, uploaded: 0, skipped: tooBig, failed: [] });
      return;
    }

    // Keyed by batch + position, never by name: a folder routinely holds two "passport.jpg"s in
    // different sub-folders, and name keys made one overwrite the other on screen.
    const batch = Date.now().toString(36);
    const keyOf = (i: number) => `${batch}-${i}`;
    setInFlight(prev => {
      const next = { ...prev };
      ok.forEach((f, i) => {
        next[keyOf(i)] = {
          index: i, fileName: f.name, loaded: 0, total: f.size, status: 'uploading',
          mimeType: f.type || 'application/octet-stream',
          previewUrl: isImageMime(f.type) ? URL.createObjectURL(f) : undefined,
        };
      });
      return next;
    });

    const failed: { name: string; reason: string }[] = [];
    const docs = await uploadClientDocuments(clientId, ok, progress => {
      if (progress.status === 'error') failed.push({ name: progress.fileName, reason: progress.error ?? 'Upload failed' });
      setInFlight(prev => ({ ...prev, [keyOf(progress.index)]: { ...prev[keyOf(progress.index)], ...progress } }));
    });

    if (docs.length) onUploaded(docs);
    // Stays on screen until dismissed, so nothing that did not make it can go unnoticed.
    setSummary({ total: files.length, uploaded: docs.length, skipped: tooBig, failed });

    // Finished cards clear after a short beat; failed ones stay, and are listed in the summary.
    setTimeout(() => {
      setInFlight(prev => {
        const next = { ...prev };
        ok.forEach((_, i) => {
          const k = keyOf(i);
          if (next[k]?.status !== 'error') {
            if (next[k]?.previewUrl) URL.revokeObjectURL(next[k].previewUrl!);
            delete next[k];
          }
        });
        return next;
      });
    }, 1200);
  }, [clientId, onUploaded]);

  // Dropped folders are expanded to every file inside them, sub-folders included.
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = await collectDroppedFiles(e.dataTransfer);
    if (files.length) startUpload(files);
  };

  const inFlightKeys = Object.entries(inFlight);
  const entries = inFlightKeys.map(([, item]) => item);
  const uploadingCount = entries.filter(e => e.status === 'uploading').length;
  const doneCount = entries.filter(e => e.status === 'done').length;

  return (
    <div>
      <motion.div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        animate={{ scale: dragOver ? 1.01 : 1 }}
        transition={{ type: 'spring', bounce: 0.2, duration: 0.3 }}
        className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg py-8 px-4 cursor-pointer transition-colors duration-150 ease-out ${
          dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'
        }`}
      >
        <UploadCloud className={`w-7 h-7 text-gray-400 transition-transform duration-200 ease-out ${dragOver ? 'scale-110 text-indigo-400' : ''}`} />
        <p className="text-sm text-gray-600">
          <span className="font-medium text-indigo-600">Click to upload</span> or drag and drop
        </p>
        <p className="text-xs text-gray-400">Any file type, or a whole folder · up to 25 MB each</p>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); folderInputRef.current?.click(); }}
          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
        >
          <FolderUp className="w-3.5 h-3.5" /> Upload a folder
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => { if (e.target.files?.length) startUpload(e.target.files); e.target.value = ''; }}
        />
        <input
          ref={folderInputRef}
          type="file"
          {...FOLDER_INPUT_PROPS}
          className="hidden"
          onChange={e => { if (e.target.files?.length) startUpload(e.target.files); e.target.value = ''; }}
        />
      </motion.div>

      {/* Live count while a batch is going, so a long folder upload visibly progresses. */}
      {uploadingCount > 0 && (
        <p className="mt-3 text-xs text-gray-600" aria-live="polite">
          Uploading… {doneCount} of {entries.length} done
        </p>
      )}

      {summary && !uploadingCount && <UploadSummary summary={summary} onDismiss={() => setSummary(null)} />}

      {entries.length > 0 && (
        <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5">
          <AnimatePresence>
            {inFlightKeys.map(([key, item]) => (
              <DocumentThumb
                key={key}
                fileName={item.fileName}
                mimeType={item.mimeType}
                previewUrl={item.previewUrl}
                status={item.status}
                progressPct={item.total ? (item.loaded / item.total) * 100 : 0}
                errorMessage={item.error}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
