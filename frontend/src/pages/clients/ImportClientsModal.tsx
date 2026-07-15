import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { importClients, type ImportResult } from '../../api/clients';

// ---------- Excel date serial → YYYY-MM-DD ----------
const excelDateToISO = (v: unknown): string => {
  if (v == null || v === '') return '';
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().split('T')[0];
  }
  if (typeof v === 'string' && /\d/.test(v)) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  return String(v);
};

const normalizeGender = (v: unknown): string => {
  const s = String(v ?? '').trim().toUpperCase();
  if (s === 'MALE'   || s === 'M') return 'MALE';
  if (s === 'FEMALE' || s === 'F') return 'FEMALE';
  return 'OTHER';
};

const normalizePriority = (v: unknown): string => {
  const s = String(v ?? '').trim().toUpperCase();
  return ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(s) ? s : 'MEDIUM';
};

const str = (v: unknown) => (v != null && v !== '' ? String(v).trim() : undefined);
const num = (v: unknown) => (v != null && v !== '' && !isNaN(Number(v)) ? Number(v) : undefined);
const bool = (v: unknown) => Boolean(v);

// ---------- Map a raw array row (positional) to our schema ----------
// Column indices from the "Client DB" sheet header:
// 0:#  1:Received Date  2:First Name  3:Last Name  4:Folder URL
// 5:Gender  6:DOB  7:Phone  8:Email  9:Residential Address
// 10:Passport Number  11:Passport Issue  12:Passport Expiry  13:WhatsApp
// 14:Contract   15:Birth City  16:Nationality  17:Destination  18:City
// 19:Visa Status(skip)  20:UK Visa Expiry  21:Visa Type(skip)  22:Status(skip)
// 23:Appt Date(skip)  24:#REF!(skip)  25:Assigned(skip)  26:E-Visa
// 27:(priority)  28:Visa & Travel History  29:Advance  30:Charges  31:Discount
// 32:Source  33:Refered By  34:HR Comments
type RawRow = unknown[];
interface MappedRow {
  clientRef?: string;
  receivedDate: string;
  firstName: string;
  lastName: string;
  gender: string;
  dob: string;
  phone: string;
  passportNumber: string;
  passportIssue: string;
  passportExpiry: string;
  nationality: string;
  destination: string;
  folderUrl?: string;
  email?: string;
  addressStreet?: string;
  whatsapp?: string;
  birthCity?: string;
  city?: string;
  ukVisaExpiry?: string;
  eVisa?: boolean;
  priority?: string;
  visaAndTravelHistory?: string;
  advance?: number;
  charges?: number;
  discount?: number;
  source?: string;
  referredBy?: string;
  hrComments?: string;
  _rowIndex: number;
  _errors: string[];
  _warnings: string[];
}

// Fields required for file processing (see backend utils/caseRequiredInfo.ts) — missing
// them doesn't block import, but the case stays flagged incomplete in the
// Appointment queue until they're filled in.
const mapRow = (row: RawRow, rowIndex: number): MappedRow => {
  const errors: string[] = [];
  const warnings: string[] = [];

  const firstName     = str(row[2]) ?? '';
  const lastName      = str(row[3]) ?? '';
  const passportNumber = str(row[10]) ?? '';
  const nationality   = str(row[16]) ?? '';
  const destination   = str(row[17]) ?? '';
  // The database requires a received date — default to today when the sheet leaves it blank,
  // same as a manually-added client would get.
  const receivedDateRaw = excelDateToISO(row[1]);
  const receivedDate = receivedDateRaw || new Date().toISOString().split('T')[0];
  const dob           = excelDateToISO(row[6]);
  const passportIssue = excelDateToISO(row[11]);
  const passportExpiry = excelDateToISO(row[12]);
  const phone         = str(row[7]) ?? '';
  const ukVisaExpiryRaw = row[20];
  const ukVisaExpiry  = ukVisaExpiryRaw ? excelDateToISO(ukVisaExpiryRaw) : undefined;

  // Hard requirements — a row can't be imported at all without these.
  if (!firstName && !lastName) errors.push('First Name or Last Name missing');

  // Required for file processing, but fine to import as-is — stays flagged "incomplete" until filled in.
  if (!receivedDateRaw) warnings.push('Received Date (defaulted to today)');
  if (!firstName)       warnings.push('First Name');
  if (!lastName)        warnings.push('Last Name');
  if (!passportNumber)  warnings.push('Passport Number');
  if (!nationality)    warnings.push('Nationality');
  if (!destination)    warnings.push('Destination');
  if (!dob)            warnings.push('DOB');
  if (!passportIssue)  warnings.push('Passport Issue');
  if (!passportExpiry) warnings.push('Passport Expiry');

  return {
    clientRef:       str(row[0]),
    receivedDate,
    firstName,
    lastName,
    gender:          normalizeGender(row[5]),
    dob,
    phone,
    passportNumber,
    passportIssue,
    passportExpiry,
    nationality,
    destination,
    folderUrl:            str(row[4]),
    email:                str(row[8]),
    addressStreet:        str(row[9]),
    whatsapp:             str(row[13]),
    birthCity:            str(row[15]),
    city:                 str(row[18]),
    ukVisaExpiry:         ukVisaExpiry || undefined,
    eVisa:                bool(row[26]),
    priority:             normalizePriority(row[27]),
    visaAndTravelHistory: str(row[28]),
    advance:              num(row[29]),
    charges:              num(row[30]),
    discount:             num(row[31]),
    source:               str(row[32]),
    referredBy:           str(row[33]),
    hrComments:           str(row[34]),
    _rowIndex: rowIndex,
    _errors: errors,
    _warnings: warnings,
  };
};

// ---------- Component ----------
interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

type Step = 'pick' | 'preview' | 'result';

const ImportClientsModal: React.FC<Props> = ({ open, onClose, onDone }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('pick');
  const [rows, setRows] = useState<MappedRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const reset = () => { setStep('pick'); setRows([]); setResult(null); setParseError(null); };

  const handleClose = () => { reset(); onClose(); };

  const handleFile = (file: File) => {
    setParseError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        // prefer "Client DB" sheet, else first sheet
        const sheetName = wb.SheetNames.includes('Client DB') ? 'Client DB' : wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const raw: RawRow[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

        // skip header row (index 0)
        const mapped = raw
          .slice(1)
          .filter(r => r.some(c => c != null && c !== ''))  // skip blank rows
          .map((r, i) => mapRow(r, i + 2));                  // +2: 1-based + skipped header

        if (mapped.length === 0) { setParseError('No data rows found in the file.'); return; }
        setRows(mapped);
        setStep('preview');
      } catch {
        setParseError('Failed to parse the file. Make sure it is a valid .xlsx file.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const validRows      = rows.filter(r => r._errors.length === 0);
  const invalidRows    = rows.filter(r => r._errors.length > 0);
  const incompleteRows = validRows.filter(r => r._warnings.length > 0);

  const handleImport = async () => {
    setLoading(true);
    try {
      // strip internal fields before sending
      const payload = validRows.map(({ _rowIndex: _r, _errors: _e, _warnings: _w, ...rest }) => rest);
      const res = await importClients(payload);
      setResult(res.data!);
      setStep('result');
      onDone();
    } catch {
      setParseError('Import request failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const title =
    step === 'pick'    ? 'Import Clients from Excel' :
    step === 'preview' ? `Preview — ${rows.length} rows detected` :
                         'Import Complete';

  return (
    <Modal open={open} onClose={handleClose} title={title} size="lg"
      footer={
        step === 'pick' ? (
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
        ) : step === 'preview' ? (
          <>
            <Button variant="outline" onClick={reset}>Back</Button>
            <Button
              loading={loading}
              disabled={validRows.length === 0}
              onClick={handleImport}
            >
              Import {validRows.length} client{validRows.length !== 1 ? 's' : ''}
            </Button>
          </>
        ) : (
          <Button onClick={handleClose}>Close</Button>
        )
      }
    >
      {/* ── Step 1: File Pick ── */}
      {step === 'pick' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Upload the <strong>Client Database.xlsx</strong> file. The importer reads the
            &ldquo;Client DB&rdquo; sheet and maps columns automatically.
          </p>
          <div
            className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
          >
            <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">Drop your .xlsx file here or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">Supports .xlsx only</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          {parseError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              <XCircle className="w-4 h-4 flex-shrink-0" />{parseError}
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Preview ── */}
      {step === 'preview' && (
        <div className="space-y-4">
          {/* Summary badges */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1.5 text-sm font-medium text-green-700 bg-green-50 px-3 py-1 rounded-full">
              <CheckCircle className="w-4 h-4" /> {validRows.length} will be imported
            </span>
            {incompleteRows.length > 0 && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-amber-700 bg-amber-50 px-3 py-1 rounded-full">
                <AlertCircle className="w-4 h-4" /> {incompleteRows.length} incomplete
              </span>
            )}
            {invalidRows.length > 0 && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-red-700 bg-red-50 px-3 py-1 rounded-full">
                <XCircle className="w-4 h-4" /> {invalidRows.length} will be skipped
              </span>
            )}
          </div>

          {incompleteRows.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-800">
                Rows missing Last Name, Passport Number, Nationality, Destination, DOB, Passport Issue,
                or Passport Expiry will still be imported — they land in the <strong>Appointment</strong> queue
                flagged as incomplete, and can't move to File Processing until that information is filled in.
              </p>
            </div>
          )}

          {invalidRows.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-red-800 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" /> Rows with errors (will be skipped):
              </p>
              <ul className="text-xs text-red-700 space-y-0.5 max-h-28 overflow-y-auto">
                {invalidRows.map(r => (
                  <li key={r._rowIndex}>Row {r._rowIndex}: {r._errors.join(' · ')}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Preview table */}
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 text-gray-500 font-medium">Row</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-medium">Name</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-medium">Passport</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-medium">Phone</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-medium">Destination</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.slice(0, 15).map(r => (
                  <tr key={r._rowIndex} className={r._errors.length ? 'bg-red-50' : r._warnings.length ? 'bg-amber-50/60' : ''}>
                    <td className="px-3 py-2 text-gray-400">{r._rowIndex}</td>
                    <td className="px-3 py-2 font-medium text-gray-800">
                      {r.firstName} {r.lastName || <span className="text-gray-400 italic">—</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{r.passportNumber || <span className="text-gray-400 italic">—</span>}</td>
                    <td className="px-3 py-2 text-gray-600">{r.phone || <span className="text-gray-400 italic">N/A</span>}</td>
                    <td className="px-3 py-2 text-gray-600">{r.destination || <span className="text-gray-400 italic">—</span>}</td>
                    <td className="px-3 py-2">
                      {r._errors.length > 0 ? (
                        <span className="text-red-500 flex items-center gap-1"><XCircle className="w-3 h-3" /> Error</span>
                      ) : r._warnings.length > 0 ? (
                        <span className="text-amber-600 flex items-center gap-1" title={`Missing: ${r._warnings.join(', ')}`}>
                          <AlertCircle className="w-3 h-3" /> Incomplete
                        </span>
                      ) : (
                        <span className="text-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 15 && (
              <p className="text-xs text-gray-400 text-center py-2 border-t border-gray-100">
                Showing first 15 of {rows.length} rows
              </p>
            )}
          </div>

          {parseError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              <XCircle className="w-4 h-4 flex-shrink-0" />{parseError}
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: Result ── */}
      {step === 'result' && result && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-green-50 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-green-700">{result.imported}</p>
              <p className="text-sm text-green-600 mt-1">Clients imported</p>
            </div>
            {result.duplicates > 0 && (
              <div className="flex-1 bg-amber-50 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-amber-600">{result.duplicates}</p>
                <p className="text-sm text-amber-600 mt-1">Duplicates skipped</p>
              </div>
            )}
            {result.failed - result.duplicates > 0 && (
              <div className="flex-1 bg-red-50 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-red-600">{result.failed - result.duplicates}</p>
                <p className="text-sm text-red-500 mt-1">Failed</p>
              </div>
            )}
          </div>
          {result.errors.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-700 mb-1">Errors:</p>
              <ul className="text-xs text-gray-600 space-y-0.5 max-h-40 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <li key={i}>Row {e.row}: {e.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default ImportClientsModal;
