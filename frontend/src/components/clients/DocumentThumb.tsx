import React from 'react';
import { motion } from 'framer-motion';
import { FileText, Eye, Trash2, X, Loader2, Check, AlertTriangle } from 'lucide-react';
import { isImageMime } from '../../constants/documents';

// Shared visual tile for a single document — used for already-uploaded docs (with
// view/delete), files mid-upload (with progress), and staged pre-upload files during
// client creation (with remove). One look everywhere a document shows up, styled after a
// native photo grid (square, edge-to-edge, springy on press) rather than a desktop file list.
interface Props {
  fileName: string;
  mimeType: string;
  subtitle?: string;
  previewUrl?: string;
  status?: 'idle' | 'uploading' | 'done' | 'error';
  progressPct?: number;
  errorMessage?: string;
  busy?: boolean;
  onView?: () => void;
  onDelete?: () => void;
  onRemove?: () => void;
  index?: number;
  layoutId?: string;
}

const ActionButton: React.FC<{
  icon: React.ElementType;
  onClick: (e: React.MouseEvent) => void;
  busy?: boolean;
  variant?: 'default' | 'danger';
  title: string;
}> = ({ icon: Icon, onClick, busy, variant = 'default', title }) => (
  <motion.button
    onClick={onClick}
    disabled={busy}
    title={title}
    whileTap={{ scale: 0.85 }}
    transition={{ duration: 0.1 }}
    className={`flex items-center justify-center w-7 h-7 rounded-full backdrop-blur-sm shadow-sm transition-colors duration-150 ease-out disabled:opacity-60 ${
      variant === 'danger'
        ? 'bg-white/90 text-red-600 hover:bg-red-600 hover:text-white'
        : 'bg-white/90 text-gray-700 hover:bg-indigo-600 hover:text-white'
    }`}
  >
    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
  </motion.button>
);

// Critically damped by default (Apple's fluid-interface guidance: no overshoot for
// non-gesture UI); the staggered grid entrance gets a hair of bounce since it's the one
// moment here that's decorative rather than functional.
const ENTRANCE = { type: 'spring', bounce: 0.15, duration: 0.4 } as const;

export const DocumentThumb: React.FC<Props> = ({
  fileName, mimeType, subtitle, previewUrl, status = 'idle', progressPct = 0,
  errorMessage, busy, onView, onDelete, onRemove, index = 0, layoutId,
}) => {
  const isImage = isImageMime(mimeType) && !!previewUrl;
  const clickable = !!onView && status !== 'error';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ ...ENTRANCE, delay: Math.min(index, 14) * 0.03 }}
      whileTap={clickable ? { scale: 0.94 } : undefined}
      className={`group relative aspect-square overflow-hidden bg-gray-100 ${isImage ? 'rounded-md' : 'rounded-xl border border-gray-200 bg-gray-50 shadow-sm'}`}
    >
      {isImage ? (
        <motion.img
          layoutId={layoutId}
          src={previewUrl}
          alt={fileName}
          onClick={onView}
          className={`w-full h-full object-cover ${clickable ? 'cursor-pointer' : ''}`}
        />
      ) : (
        <div
          onClick={onView}
          className={`w-full h-full flex flex-col items-center justify-center gap-2 p-3 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${clickable ? 'cursor-pointer group-hover:scale-105' : ''}`}
        >
          <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
            <FileText className="w-5 h-5 text-red-400" />
          </div>
          <span className="text-[11px] font-medium text-gray-600 text-center line-clamp-2 break-all px-1 leading-tight">
            {fileName}
          </span>
        </div>
      )}

      {/* Bottom gradient caption — image cards only; PDF cards already show the name. */}
      {isImage && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent px-2 pt-6 pb-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-out pointer-events-none">
          <p className="text-[11px] text-white truncate">{fileName}</p>
          {subtitle && <p className="text-[10px] text-white/70 truncate">{subtitle}</p>}
        </div>
      )}

      {/* Hover actions */}
      {(onView || onDelete || onRemove) && status !== 'uploading' && (
        <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 -translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-[opacity,transform] duration-150 ease-out">
          {onView && <ActionButton icon={Eye} title="View" onClick={e => { e.stopPropagation(); onView(); }} />}
          {onDelete && <ActionButton icon={Trash2} title="Delete" variant="danger" busy={busy} onClick={e => { e.stopPropagation(); onDelete(); }} />}
          {onRemove && <ActionButton icon={X} title="Remove" onClick={e => { e.stopPropagation(); onRemove(); }} />}
        </div>
      )}

      {/* Non-image cards show the subtitle inline below the icon rather than as an overlay */}
      {!isImage && subtitle && status === 'idle' && (
        <div className="absolute inset-x-0 bottom-0 px-2 pb-1.5 text-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-out">
          <p className="text-[10px] text-gray-400 truncate">{subtitle}</p>
        </div>
      )}

      {status === 'uploading' && (
        <div className="absolute inset-0 bg-black/45 flex flex-col items-center justify-center gap-1.5">
          <Loader2 className="w-6 h-6 text-white animate-spin" />
          <span className="text-[11px] font-medium text-white tabular-nums">{Math.round(progressPct)}%</span>
          <div className="w-3/5 h-1 bg-white/25 rounded-full overflow-hidden mt-0.5">
            <div className="h-full bg-white rounded-full transition-[width] duration-150 ease-out" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      {status === 'done' && (
        <div className="absolute inset-0 bg-emerald-600/80 flex items-center justify-center doc-flash">
          <Check className="w-8 h-8 text-white" strokeWidth={3} />
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 bg-red-50/95 border-2 border-red-200 rounded-xl flex flex-col items-center justify-center gap-1 p-2 text-center">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <span className="text-[10px] text-red-600 line-clamp-3">{errorMessage ?? 'Upload failed'}</span>
        </div>
      )}
    </motion.div>
  );
};
