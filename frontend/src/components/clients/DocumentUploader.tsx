import React, { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { UploadCloud, AlertCircle } from 'lucide-react';
import { uploadClientDocuments, type UploadProgress } from '../../api/documents';
import { ACCEPTED_FILE_INPUT, MAX_FILE_SIZE_BYTES, formatBytes, isImageMime } from '../../constants/documents';
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
  const [rejected, setRejected] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const startUpload = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const tooBig = files.filter(f => f.size > MAX_FILE_SIZE_BYTES).map(f => `${f.name} (${formatBytes(f.size)} — limit is 25 MB)`);
    const ok = files.filter(f => f.size <= MAX_FILE_SIZE_BYTES);
    setRejected(tooBig);
    if (ok.length === 0) return;

    setInFlight(prev => {
      const next = { ...prev };
      ok.forEach(f => {
        next[f.name] = {
          fileName: f.name, loaded: 0, total: f.size, status: 'uploading',
          mimeType: f.type || 'application/octet-stream',
          previewUrl: isImageMime(f.type) ? URL.createObjectURL(f) : undefined,
        };
      });
      return next;
    });

    const docs = await uploadClientDocuments(clientId, ok, progress => {
      setInFlight(prev => ({ ...prev, [progress.fileName]: { ...prev[progress.fileName], ...progress } }));
    });

    if (docs.length) onUploaded(docs);

    // Clear finished/errored entries after a short beat so success is visible before it disappears.
    setTimeout(() => {
      setInFlight(prev => {
        const next = { ...prev };
        ok.forEach(f => {
          if (next[f.name]?.status !== 'error') {
            if (next[f.name]?.previewUrl) URL.revokeObjectURL(next[f.name].previewUrl!);
            delete next[f.name];
          }
        });
        return next;
      });
    }, 1200);
  }, [clientId, onUploaded]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) startUpload(e.dataTransfer.files);
  };

  const entries = Object.values(inFlight);

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
        <p className="text-xs text-gray-400">PDF, JPEG, PNG, WEBP, HEIC · up to 25 MB each</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_FILE_INPUT}
          className="hidden"
          onChange={e => { if (e.target.files?.length) startUpload(e.target.files); e.target.value = ''; }}
        />
      </motion.div>

      {rejected.length > 0 && (
        <div className="mt-3 text-xs text-red-600 flex items-start gap-1.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>Skipped: {rejected.join(', ')}</span>
        </div>
      )}

      {entries.length > 0 && (
        <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5">
          <AnimatePresence>
            {entries.map(item => (
              <DocumentThumb
                key={item.fileName}
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
