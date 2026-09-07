import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UploadCloud, AlertCircle } from 'lucide-react';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import { ACCEPTED_FILE_INPUT, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES, formatBytes, isImageMime } from '../../constants/documents';
import { DocumentThumb } from './DocumentThumb';

export interface PendingUploadProgress {
  status: 'uploading' | 'done' | 'error';
  pct: number;
  error?: string;
}

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
  // Keyed by File.name — set by the parent once it starts uploading these files
  // against the newly-created client, so cards can flip from "staged" to "uploading".
  progress?: Record<string, PendingUploadProgress>;
  disabled?: boolean;
}

// A client that doesn't exist yet has no id to namespace S3 keys under, so files picked
// here are held as plain File objects (previewed via local object URLs) and only
// actually uploaded by the parent once the client record is created.
export const PendingDocumentGallery: React.FC<Props> = ({ files, onChange, progress, disabled }) => {
  const [dragOver, setDragOver] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrls = useRef<Map<File, string>>(new Map());

  useEffect(() => () => {
    previewUrls.current.forEach(url => URL.revokeObjectURL(url));
  }, []);

  const getPreviewUrl = (file: File): string => {
    let url = previewUrls.current.get(file);
    if (!url) {
      url = URL.createObjectURL(file);
      previewUrls.current.set(file, url);
    }
    return url;
  };

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    const bad: string[] = [];
    const ok: File[] = [];
    incoming.forEach(f => {
      if (!ALLOWED_MIME_TYPES.has(f.type)) { bad.push(`${f.name} is a ${f.type || 'unknown'} file — only PDF, JPEG, PNG, WEBP and HEIC are accepted.`); return; }
      if (f.size > MAX_FILE_SIZE_BYTES) { bad.push(`${f.name} (${formatBytes(f.size)} — limit is 25 MB)`); return; }
      ok.push(f);
    });
    setRejected(bad);
    if (ok.length) onChange([...files, ...ok]);
  }, [files, onChange]);

  const removeFile = (file: File) => {
    const url = previewUrls.current.get(file);
    if (url) { URL.revokeObjectURL(url); previewUrls.current.delete(file); }
    onChange(files.filter(f => f !== file));
  };

  const imageFiles = useMemo(() => files.filter(f => isImageMime(f.type)), [files]);

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); if (!disabled && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg py-8 px-4 transition-colors duration-150 ease-out ${
          disabled
            ? 'opacity-60 cursor-not-allowed border-gray-200 bg-gray-50'
            : dragOver
              ? 'border-indigo-400 bg-indigo-50 cursor-pointer'
              : 'border-gray-300 hover:border-gray-400 bg-gray-50 cursor-pointer'
        }`}
      >
        <UploadCloud className={`w-7 h-7 text-gray-400 transition-transform duration-200 ease-out ${dragOver ? 'scale-110 text-indigo-400' : ''}`} />
        <p className="text-sm text-gray-600">
          <span className="font-medium text-indigo-600">Click to upload</span> or drag and drop
        </p>
        <p className="text-xs text-gray-400">PDF, JPEG, PNG, WEBP, HEIC · up to 25 MB each · uploaded once the client is saved</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          disabled={disabled}
          accept={ACCEPTED_FILE_INPUT}
          className="hidden"
          onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      {rejected.length > 0 && (
        <div className="mt-3 text-xs text-red-600 flex items-start gap-1.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{rejected.join(' · ')}</span>
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {files.map((file, i) => {
            const p = progress?.[file.name];
            return (
              <DocumentThumb
                key={`${file.name}-${file.lastModified}-${i}`}
                index={i}
                fileName={file.name}
                mimeType={file.type}
                previewUrl={getPreviewUrl(file)}
                status={p?.status ?? 'idle'}
                progressPct={p?.pct}
                errorMessage={p?.error}
                onView={isImageMime(file.type)
                  ? () => setLightboxIndex(imageFiles.indexOf(file))
                  : () => window.open(getPreviewUrl(file), '_blank', 'noopener,noreferrer')}
                onRemove={disabled ? undefined : () => removeFile(file)}
              />
            );
          })}
        </div>
      )}

      <Lightbox
        open={lightboxIndex !== null}
        index={lightboxIndex ?? 0}
        close={() => setLightboxIndex(null)}
        slides={imageFiles.map(f => ({ src: getPreviewUrl(f), alt: f.name }))}
        plugins={[Zoom]}
        zoom={{ maxZoomPixelRatio: 3, scrollToZoom: true }}
        animation={{ swipe: 200, fade: 200 }}
      />
    </div>
  );
};
