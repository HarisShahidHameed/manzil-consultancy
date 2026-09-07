import React, { useMemo, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import Counter from 'yet-another-react-lightbox/plugins/counter';
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails';
import type { ClientDocument } from '../../types';
import { deleteDocument, getDocuments } from '../../api/documents';
import { isImageMime, formatBytes } from '../../constants/documents';
import { DocumentThumb } from './DocumentThumb';

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

  const handleDelete = async (doc: ClientDocument) => {
    if (!confirm(`Delete "${doc.fileName}"? This can't be undone.`)) return;
    setDeletingId(doc.id);
    try {
      await deleteDocument(clientId, doc.id);
      onChange(documents.filter(d => d.id !== doc.id));
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
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
        {documents.map((doc, i) => (
          <DocumentThumb
            key={doc.id}
            index={i}
            fileName={doc.fileName}
            mimeType={doc.mimeType}
            previewUrl={isImageMime(doc.mimeType) ? doc.viewUrl : undefined}
            subtitle={`${formatBytes(doc.sizeBytes)} · ${fmtDate(doc.createdAt)}${doc.uploadedBy ? ` · ${doc.uploadedBy}` : ''}`}
            busy={deletingId === doc.id || openingId === doc.id}
            onView={() => handleView(doc)}
            onDelete={() => handleDelete(doc)}
          />
        ))}
      </div>

      <Lightbox
        open={lightboxIndex !== null}
        index={lightboxIndex ?? 0}
        close={() => setLightboxIndex(null)}
        slides={imageDocs.map(d => ({ src: d.viewUrl, alt: d.fileName }))}
        plugins={[Zoom, Counter, Thumbnails]}
        zoom={{ maxZoomPixelRatio: 3, scrollToZoom: true }}
        thumbnails={{ border: 0, padding: 4, gap: 8, showToggle: false }}
        animation={{ swipe: 200, fade: 200 }}
      />
    </>
  );
};
