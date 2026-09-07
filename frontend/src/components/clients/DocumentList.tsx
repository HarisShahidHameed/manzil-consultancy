import React, { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { FolderOpen } from 'lucide-react';
import type { ClientDocument } from '../../types';
import { deleteDocument, getDocuments } from '../../api/documents';
import { isImageMime, formatBytes } from '../../constants/documents';
import { DocumentThumb } from './DocumentThumb';
import { MobileDocumentViewer, type ViewerItem } from './MobileDocumentViewer';

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

interface Props {
  clientId: string;
  documents: ClientDocument[];
  onChange: (documents: ClientDocument[]) => void;
}

export const DocumentList: React.FC<Props> = ({ clientId, documents, onChange }) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const imageDocs = useMemo(() => documents.filter(d => isImageMime(d.mimeType)), [documents]);
  // Motion's layoutId matching is global to the page, not scoped to this component
  // instance — and React Router doesn't remount ClientDetail on a route-param change
  // alone, so a `useId()`-based prefix can collide with a previous client's gallery still
  // registered from before navigation. doc.id is already a globally-unique server UUID,
  // so it's used directly as the layoutId with no prefix needed.
  const layoutIdFor = (doc: { id: string }) => `doc-${doc.id}`;

  const viewerItems: ViewerItem[] = imageDocs.map(d => ({
    id: d.id, src: d.viewUrl, fileName: d.fileName,
    subtitle: `${formatBytes(d.sizeBytes)} · ${fmtDate(d.createdAt)}${d.uploadedBy ? ` · ${d.uploadedBy}` : ''}`,
  }));

  const handleDelete = async (doc: ClientDocument) => {
    if (!confirm(`Delete "${doc.fileName}"? This can't be undone.`)) return;
    setDeletingId(doc.id);
    try {
      await deleteDocument(clientId, doc.id);
      onChange(documents.filter(d => d.id !== doc.id));
      setLightboxIndex(null);
    } finally {
      setDeletingId(null);
    }
  };

  // Presigned view URLs expire in 5 minutes — refetch right before opening so a document
  // list left open in a background tab still opens on the first click.
  const handleView = async (doc: ClientDocument) => {
    setOpeningId(doc.id);
    try {
      const fresh = await getDocuments(clientId);
      onChange(fresh);
      const match = fresh.find(d => d.id === doc.id) ?? doc;
      if (isImageMime(match.mimeType)) {
        const idx = fresh.filter(d => isImageMime(d.mimeType)).findIndex(d => d.id === match.id);
        setLightboxIndex(idx >= 0 ? idx : 0);
      } else {
        window.open(match.viewUrl, '_blank', 'noopener,noreferrer');
      }
    } finally {
      setOpeningId(null);
    }
  };

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-gray-400">
        <FolderOpen className="w-8 h-8" />
        <p className="text-sm">No documents uploaded yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5">
        <AnimatePresence>
          {documents.map((doc, i) => (
            <DocumentThumb
              key={doc.id}
              index={i}
              layoutId={isImageMime(doc.mimeType) ? layoutIdFor(doc) : undefined}
              fileName={doc.fileName}
              mimeType={doc.mimeType}
              previewUrl={isImageMime(doc.mimeType) ? doc.viewUrl : undefined}
              subtitle={`${formatBytes(doc.sizeBytes)} · ${fmtDate(doc.createdAt)}${doc.uploadedBy ? ` · ${doc.uploadedBy}` : ''}`}
              busy={deletingId === doc.id || openingId === doc.id}
              onView={() => handleView(doc)}
              onDelete={() => handleDelete(doc)}
            />
          ))}
        </AnimatePresence>
      </div>

      <MobileDocumentViewer
        items={viewerItems}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
        layoutIdFor={item => `doc-${item.id}`}
        deleteBusy={!!deletingId}
        onDelete={item => {
          const doc = documents.find(d => d.id === item.id);
          if (doc) handleDelete(doc);
        }}
      />
    </>
  );
};
