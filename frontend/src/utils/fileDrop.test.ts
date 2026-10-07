import { describe, it, expect } from 'vitest';
import { collectDroppedFiles } from './fileDrop';

const file = (name: string) => new File(['x'], name);
const fileEntry = (f: File) => ({ isFile: true, isDirectory: false, name: f.name, file: (ok: (f: File) => void) => ok(f) });
// Hands its children back in pages of `pageSize`, the way Chrome caps readEntries at 100.
const dirEntry = (name: string, children: unknown[], pageSize = 2) => ({
  isFile: false, isDirectory: true, name,
  createReader: () => {
    let i = 0;
    return { readEntries: (ok: (e: unknown[]) => void) => { ok(children.slice(i, i + pageSize)); i += pageSize; } };
  },
});
const drop = (entries: unknown[], files: File[] = []) => ({
  items: entries.map(e => ({ kind: 'file', webkitGetAsEntry: () => e })),
  files,
}) as unknown as DataTransfer;

describe('collectDroppedFiles', () => {
  it('expands a dropped folder recursively, across every readEntries page', async () => {
    const tree = dirEntry('Client 1020', [
      fileEntry(file('passport.jpg')), fileEntry(file('share-code.png')), fileEntry(file('letter.docx')),
      dirEntry('bookings', [fileEntry(file('flight.pdf')), fileEntry(file('hotel.pdf'))]),
    ]);
    const names = (await collectDroppedFiles(drop([tree]))).map(f => f.name).sort();
    expect(names).toEqual(['flight.pdf', 'hotel.pdf', 'letter.docx', 'passport.jpg', 'share-code.png']);
  });

  it('skips OS clutter that is never a client document', async () => {
    const tree = dirEntry('x', [fileEntry(file('.DS_Store')), fileEntry(file('Thumbs.db')), fileEntry(file('evisa.pdf'))]);
    expect((await collectDroppedFiles(drop([tree]))).map(f => f.name)).toEqual(['evisa.pdf']);
  });

  it('falls back to the plain file list without the entry API', async () => {
    const dt = { items: [{ kind: 'file' }], files: [file('a.pdf')] } as unknown as DataTransfer;
    expect((await collectDroppedFiles(dt)).map(f => f.name)).toEqual(['a.pdf']);
  });
});
