import type { InputHTMLAttributes } from 'react';

// Folder-aware file picking for the document upload boxes (1 Oct 2026 #6). Staff save a
// client's WhatsApp documents into a PC folder and want to drop or pick that whole folder in
// one go, so both paths — drag-and-drop and the folder picker — flatten a folder tree into a
// plain File[] the existing upload code already understands.

// OS / sync-tool clutter that lands in every folder copied off a phone or a shared drive.
// Never a client document, so it is skipped silently rather than uploaded or reported.
const JUNK_FILE = /^(\.DS_Store|Thumbs\.db|desktop\.ini|\._.*|~\$.*)$/i;
export const isJunkFile = (file: File): boolean => JUNK_FILE.test(file.name);

// The non-standard (but universally supported) directory-entry API, typed locally because
// lib.dom only partly covers it.
interface FsEntry { isFile: boolean; isDirectory: boolean; name: string }
interface FsFileEntry extends FsEntry { file: (ok: (f: File) => void, fail: (e: unknown) => void) => void }
interface FsDirEntry extends FsEntry { createReader: () => { readEntries: (ok: (e: FsEntry[]) => void, fail: (e: unknown) => void) => void } }

const readFile = (entry: FsFileEntry) => new Promise<File>((ok, fail) => entry.file(ok, fail));

// readEntries hands a directory back in pages (Chrome caps each page at 100), so keep reading
// until it returns an empty page or a large folder silently loses everything past the first 100.
const readAllEntries = async (dir: FsDirEntry): Promise<FsEntry[]> => {
  const reader = dir.createReader();
  const all: FsEntry[] = [];
  for (;;) {
    const page = await new Promise<FsEntry[]>((ok, fail) => reader.readEntries(ok, fail));
    if (page.length === 0) return all;
    all.push(...page);
  }
};

const walk = async (entry: FsEntry): Promise<File[]> => {
  if (entry.isFile) return [await readFile(entry as FsFileEntry)];
  if (!entry.isDirectory) return [];
  const children = await readAllEntries(entry as FsDirEntry);
  return (await Promise.all(children.map(walk))).flat();
};

/**
 * Every file in a drop, with dropped folders expanded recursively. Falls back to the plain
 * file list when the browser offers no entry API (or the drop held only loose files).
 */
export const collectDroppedFiles = async (dt: DataTransfer): Promise<File[]> => {
  // Entries must be taken synchronously, before the first await — the DataTransfer is
  // emptied once the drop event handler yields.
  const entries = Array.from(dt.items ?? [])
    .filter(i => i.kind === 'file')
    .map(i => (i as DataTransferItem & { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.() ?? null);
  const fallback = Array.from(dt.files);
  if (entries.length === 0 || entries.some(e => e === null)) return fallback.filter(f => !isJunkFile(f));
  const files = (await Promise.all((entries as FsEntry[]).map(walk))).flat();
  return files.filter(f => !isJunkFile(f));
};

/** Props for a hidden <input type="file"> that picks a whole folder instead of files. */
export const FOLDER_INPUT_PROPS = { webkitdirectory: '', directory: '', multiple: true } as unknown as InputHTMLAttributes<HTMLInputElement>;
