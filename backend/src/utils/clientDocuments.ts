import fs from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';

// Works from both src/utils and dist/utils. deploy.yml copies backend/assets into each release.
const ASSET_DIR = path.resolve(__dirname, '../../assets/email');
const CARE_LETTER = 'Manzil_Client_Care_Letter_v2.docx';
const DECLARATION = 'Manzil_Client_Declaration_v2.docx';
const TERMS = 'Manzil_Standard_Terms_of_Business.pdf';

export interface DocumentFields {
  clientName: string;
  reference: string;
  address: string;
  date: string;
  visaType: string;
  country: string;
  fee: string;
  paymentOnAccount: string;
}

const escapeXml = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Replaces the blank line or stub that follows a label. Labels and blanks are separate runs in
// these templates, so this matches across run tags but never past the end of the paragraph.
const fillAfterLabel = (xml: string, label: string, blank: RegExp, value: string) =>
  xml.replace(
    new RegExp(`(${label}\\s*</w:t>(?:(?!</w:p>).)*?<w:t[^>]*>)${blank.source}`, 'gs'),
    (_m, head: string) => head + value,
  );

// A placeholder left in a client's legal document must stop the send, not reach the client.
const UNFILLED = /\[(?:Amount|visa type|Visa Type|Destination Country|destination country|MNZ-YYYY-####|DD-MM-YYYY|Mr \/ Mrs)/;

export const fillTemplateXml = (source: string, fields: DocumentFields): string => {
  const f = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, escapeXml(v)])) as unknown as DocumentFields;
  const BLANK = /_{5,}/;
  // The CRM's visa types are Tourist, Work and Study, so the sentence "apply for a [visa type]"
  // needs the word visa after them.
  const visaPhrase = fields.visaType === 'Visa' ? 'visa' : `${f.visaType} visa`;
  let xml = fillAfterLabel(source, 'Client Name:', BLANK, f.clientName);
  if (f.address) xml = fillAfterLabel(xml, 'Address:', BLANK, f.address);
  xml = fillAfterLabel(xml, 'Client Reference:', /CL-/, f.reference);
  xml = xml
    .split('[MNZ-YYYY-####]').join(f.reference)
    .split('[DD-MM-YYYY]').join(f.date)
    .split('[Mr / Mrs / Ms Surname]').join(f.clientName)
    .split('[Visa Type]').join(f.visaType)
    .split('[visa type]').join(visaPhrase)
    .split('[Destination Country]').join(f.country)
    .split('[destination country]').join(f.country);
  // The care letter has three amounts, in this order: fee, total, payment on account.
  const amounts = [f.fee, f.fee, f.paymentOnAccount];
  let index = 0;
  xml = xml.replace(/£\[Amount\]/g, () => amounts[index++] ?? '[Amount]');
  if (UNFILLED.test(xml)) throw new Error('A document template still has an unfilled placeholder');
  return xml;
};

const fillDocx = async (fileName: string, fields: DocumentFields): Promise<Buffer> => {
  const zip = await JSZip.loadAsync(await fs.readFile(path.join(ASSET_DIR, fileName)));
  const entry = zip.file('word/document.xml');
  if (!entry) throw new Error(`${fileName} is not a valid Word document`);
  zip.file('word/document.xml', fillTemplateXml(await entry.async('string'), fields));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
};

// The email tells the client all three documents are enclosed, so a missing file must stop the send.
export const buildWelcomeAttachments = async (fields: DocumentFields) => [
  { filename: `Manzil_Client_Care_Letter_${fields.reference}.docx`, content: await fillDocx(CARE_LETTER, fields) },
  { filename: `Manzil_Client_Declaration_${fields.reference}.docx`, content: await fillDocx(DECLARATION, fields) },
  { filename: TERMS, content: await fs.readFile(path.join(ASSET_DIR, TERMS)) },
];
