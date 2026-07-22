import PDFDocument from 'pdfkit';
import { Response } from 'express';

const NAVY = '#1B2E70';
const ORANGE = '#F7941D';
const GREY = '#6B7280';
const LIGHT = '#9CA3AF';

const money = (v: unknown) => {
  const n = v != null ? parseFloat(String(v)) : 0;
  return n < 0 ? `-£${Math.abs(n).toFixed(2)}` : `£${n.toFixed(2)}`;
};
const fdate = (d: unknown) => (d ? new Date(d as string).toLocaleDateString('en-GB') : '—');
const cap = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : '—');
const formatAddress = (c: { addressStreet?: string | null; addressCity?: string | null; addressShire?: string | null; addressPostalCode?: string | null; addressCountry?: string | null }) =>
  [c.addressStreet, c.addressCity, c.addressShire, c.addressPostalCode, c.addressCountry].filter(Boolean).join(', ');

type Doc = PDFKit.PDFDocument;

const LEFT = 50;
const RIGHT = 545;

function brandHeader(doc: Doc, title: string, subtitle?: string): void {
  doc.fontSize(22).font('Helvetica-Bold').fillColor(ORANGE).text('Manzil', LEFT, 48, { continued: true });
  doc.fillColor(NAVY).text(' Consultancy');
  doc.fontSize(8.5).font('Helvetica').fillColor(GREY).text('Visa & Immigration Services', LEFT, 74);

  doc.fontSize(17).font('Helvetica-Bold').fillColor(NAVY).text(title, 300, 50, { width: RIGHT - 300, align: 'right' });
  if (subtitle) {
    doc.fontSize(9).font('Helvetica').fillColor(GREY).text(subtitle, 300, 73, { width: RIGHT - 300, align: 'right' });
  }

  doc.moveTo(LEFT, 96).lineTo(RIGHT, 96).lineWidth(2).strokeColor(ORANGE).stroke();
  doc.y = 110;
}

function sectionTitle(doc: Doc, label: string): void {
  doc.moveDown(0.6);
  doc.fontSize(10).font('Helvetica-Bold').fillColor(NAVY).text(label.toUpperCase(), LEFT);
  doc.moveTo(LEFT, doc.y + 2).lineTo(RIGHT, doc.y + 2).lineWidth(0.5).strokeColor('#E5E7EB').stroke();
  doc.moveDown(0.5);
}

// Two-column key/value grid
function kvRows(doc: Doc, rows: [string, string][]): void {
  const colW = (RIGHT - LEFT) / 2;
  for (let i = 0; i < rows.length; i += 2) {
    const y = doc.y;
    const pair = [rows[i], rows[i + 1]].filter(Boolean) as [string, string][];
    pair.forEach(([k, v], idx) => {
      const x = LEFT + idx * colW;
      doc.fontSize(8).font('Helvetica').fillColor(LIGHT).text(k, x, y, { width: colW - 10 });
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#111827').text(v || '—', x, y + 11, { width: colW - 10 });
    });
    doc.y = y + 30;
  }
}

function footer(doc: Doc): void {
  const y = 770;
  doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.5).strokeColor('#E5E7EB').stroke();
  doc.fontSize(7.5).font('Helvetica').fillColor(LIGHT)
    .text('Manzil Consultancy · This is a system-generated document.', LEFT, y + 6, { width: RIGHT - LEFT, align: 'center' });
  doc.text(`Generated ${new Date().toLocaleString('en-GB')}`, LEFT, y + 16, { width: RIGHT - LEFT, align: 'center' });
}

function start(res: Response, filename: string): Doc {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  return doc;
}

// ── Client profile ────────────────────────────────────────────
export const streamClientPdf = (res: Response, c: any): void => {
  const doc = start(res, `${c.clientRef}-profile.pdf`);
  brandHeader(doc, 'Client Profile', c.clientRef);

  sectionTitle(doc, 'Personal Information');
  kvRows(doc, [
    ['Full Name', `${c.firstName} ${c.lastName}`],
    ['Gender', cap(c.gender)],
    ['Date of Birth', fdate(c.dob)],
    ['Nationality', c.nationality],
    ['Group', c.group ? `${c.group.name} (${c.group.groupRef})` : '—'],
    ['Marital Status', cap(c.maritalStatus)],
    ['Birth City', c.birthCity],
    ['Phone', c.phone],
    ['WhatsApp', c.whatsapp],
    ['Availability', c.availability],
    ['Email', c.email],
    ['Registered Email', c.registeredEmail],
    ['Residential Address', formatAddress(c)],
    ['Received Date', fdate(c.receivedDate)],
  ]);

  sectionTitle(doc, 'Passport & Documents');
  kvRows(doc, [
    ['Passport Number', c.passportNumber],
    ['Issue Date', fdate(c.passportIssue)],
    ['Expiry Date', fdate(c.passportExpiry)],
    ['E-Visa', c.eVisa ? 'Yes' : 'No'],
    ['Source', c.source],
  ]);

  if (c.previousSchengenVisa || c.visaAndTravelHistory) {
    sectionTitle(doc, 'Travel & Visa History');
    if (c.previousSchengenVisa) {
      doc.fontSize(8).font('Helvetica').fillColor(LIGHT).text('Previous Schengen Visa', LEFT);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#111827').text(c.previousSchengenVisa, LEFT, doc.y + 1, { width: RIGHT - LEFT });
      doc.moveDown(0.4);
    }
    if (c.visaAndTravelHistory) {
      doc.fontSize(8).font('Helvetica').fillColor(LIGHT).text('Travel History', LEFT);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#111827').text(c.visaAndTravelHistory, LEFT, doc.y + 1, { width: RIGHT - LEFT });
    }
  }

  if (c.visaCases?.length) {
    sectionTitle(doc, `Visa Cases (${c.visaCases.length})`);
    c.visaCases.forEach((vc: any) => {
      const y = doc.y;
      doc.fontSize(10).font('Helvetica-Bold').fillColor(NAVY).text(vc.destination, LEFT, y, { width: 200 });
      doc.fontSize(9).font('Helvetica').fillColor(GREY)
        .text(`${(vc.stage as string).replace('_', ' ')}  ·  ${vc.priority}`, 250, y, { width: 295, align: 'right' });
      doc.y = y + 16;
    });
  }

  footer(doc);
  doc.end();
};

// ── Advance payment receipt ───────────────────────────────────
export const streamAdvanceReceiptPdf = (res: Response, vc: any): void => {
  const c = vc.client ?? {};
  const doc = start(res, `ADV-${c.clientRef}-receipt.pdf`);
  brandHeader(doc, 'Advance Receipt', `ADV-${c.clientRef}`);

  sectionTitle(doc, 'Client');
  kvRows(doc, [
    ['Client', `${c.firstName} ${c.lastName}`],
    ['Client Ref', c.clientRef],
    ['Phone', c.phone],
    ['Destination', vc.destination],
  ]);

  sectionTitle(doc, 'Advance Payment');
  const charges = parseFloat(String(vc.charges ?? 0));
  const discount = parseFloat(String(vc.discount ?? 0));
  const advance = parseFloat(String(vc.advance ?? 0));

  // Amount box
  const boxY = doc.y + 4;
  doc.roundedRect(LEFT, boxY, RIGHT - LEFT, 70, 6).fillAndStroke('#F8FAFC', '#E5E7EB');
  doc.fontSize(9).font('Helvetica').fillColor(GREY).text('ADVANCE PAID', LEFT + 18, boxY + 14);
  doc.fontSize(26).font('Helvetica-Bold').fillColor(NAVY).text(money(advance), LEFT + 18, boxY + 28);

  const status = vc.advancePaid ? 'PAID' : 'UNPAID';
  const statusColor = vc.advancePaid ? '#16A34A' : '#DC2626';
  doc.fontSize(13).font('Helvetica-Bold').fillColor(statusColor).text(status, 350, boxY + 22, { width: RIGHT - 350 - 18, align: 'right' });
  doc.fontSize(8.5).font('Helvetica').fillColor(GREY).text(`Date: ${fdate(vc.advancePaidDate)}`, 350, boxY + 42, { width: RIGHT - 350 - 18, align: 'right' });
  doc.y = boxY + 86;

  sectionTitle(doc, 'Summary');
  kvRows(doc, [
    ['Total Service Charges', money(charges)],
    ['Discount', money(discount)],
    ['Advance Paid', money(advance)],
    ['Balance Remaining', money(charges - discount - advance)],
  ]);

  footer(doc);
  doc.end();
};

// ── Company details printed on invoices ────────────────────────
// TODO: replace the placeholder registration numbers below with the real ones once available.
const COMPANY = {
  name: 'Manzil Visa Consultancy',
  addressLines: ['London, United Kingdom'],
  phone: '+44 79 4747 8899',
  email: 'visa@manzilconsultancy.com',
  website: 'www.manzilconsultancy.com',
  companyNo: '00000000',
  vatReg: 'GB000000000',
  oiscRef: 'F000000000',
};

// ── Invoice / receipt ─────────────────────────────────────────
export const streamInvoicePdf = (res: Response, inv: any): void => {
  const client = inv.case?.client ?? {};
  const charges = parseFloat(String(inv.charges ?? 0));
  const discount = parseFloat(String(inv.discount ?? 0));
  const advance = parseFloat(String(inv.advance ?? 0));
  const total = parseFloat(String(inv.totalAmount ?? charges - discount));
  const outstanding = parseFloat(String(inv.outstanding ?? 0));
  const isPaid = outstanding <= 0;
  const doc = start(res, `${inv.invoiceRef}.pdf`);

  // Header: company block (left) + INVOICE title & meta (right)
  doc.fontSize(20).font('Helvetica-Bold').fillColor(NAVY).text(COMPANY.name, LEFT, 48, { width: 260 });
  doc.fontSize(8.5).font('Helvetica').fillColor(GREY)
    .text(COMPANY.addressLines.join(', '), LEFT, doc.y + 2, { width: 260 });
  doc.text(`${COMPANY.email} | ${COMPANY.phone} | ${COMPANY.website}`, LEFT, doc.y + 2, { width: 280 });

  doc.fontSize(26).font('Helvetica-Bold').fillColor(ORANGE)
    .text(isPaid ? 'RECEIPT' : 'INVOICE', 300, 48, { width: RIGHT - 300, align: 'right' });

  // Right-anchored "label: value" lines — measured manually since PDFKit's
  // `continued` + `align: right` don't compose (each call right-aligns on
  // its own, so label and value overlap instead of sitting side by side).
  const rightMetaLine = (label: string, value: string, y: number) => {
    doc.fontSize(9);
    const labelW = doc.font('Helvetica-Bold').widthOfString(label);
    const valueW = doc.font('Helvetica').widthOfString(value);
    const x = RIGHT - labelW - valueW;
    doc.font('Helvetica-Bold').fillColor('#111827').text(label, x, y, { lineBreak: false });
    doc.font('Helvetica').text(value, x + labelW, y, { lineBreak: false });
  };
  rightMetaLine('Invoice No: ', inv.invoiceRef, 78);
  rightMetaLine('Date: ', fdate(inv.issueDate), 91);
  rightMetaLine('Due Date: ', fdate(inv.dueDate), 104);

  doc.moveTo(LEFT, 126).lineTo(RIGHT, 126).lineWidth(1.5).strokeColor(ORANGE).stroke();
  doc.y = 142;

  // Bill To / Service Reference
  const colY = doc.y;
  doc.fontSize(9).font('Helvetica-Bold').fillColor(NAVY).text('BILL TO', LEFT, colY);
  const billLines = [
    `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim(),
    formatAddress(client) || client.phone || '',
  ].filter(Boolean);
  doc.fontSize(10).font('Helvetica').fillColor('#111827').text(billLines.join('\n'), LEFT, colY + 14, { width: 260 });

  doc.fontSize(9).font('Helvetica-Bold').fillColor(NAVY).text('SERVICE REFERENCE', 320, colY, { width: RIGHT - 320 });
  doc.fontSize(10).font('Helvetica').fillColor('#111827')
    .text(inv.case?.visaType || inv.case?.destination || '—', 320, colY + 14, { width: RIGHT - 320 });

  doc.y = Math.max(doc.y, colY + 60);

  // Line-items table
  const colDesc = LEFT, colQty = 360, colUnit = 410, colAmt = 480;
  let ty = doc.y + 6;
  doc.rect(LEFT, ty, RIGHT - LEFT, 24).fill(NAVY);
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF')
    .text('Description', colDesc + 10, ty + 8)
    .text('Qty', colQty, ty + 8, { width: colUnit - colQty - 10, align: 'right' })
    .text('Unit Price', colUnit, ty + 8, { width: colAmt - colUnit - 10, align: 'right' })
    .text('Amount', colAmt, ty + 8, { width: RIGHT - colAmt - 10, align: 'right' });
  ty += 24;

  // Prefer the snapshotted line items (service charges + any agency-fronted doc costs
  // captured when the invoice was created) — fall back to a single lump line for
  // invoices created before line items existed.
  const storedItems: { label: string; amount: number }[] | null =
    Array.isArray(inv.lineItems) ? inv.lineItems : null;
  const lineItems: [string, number][] = storedItems
    ? storedItems.map(i => [i.label, i.amount] as [string, number])
    : [['Service Charges', charges]];
  if (discount > 0) lineItems.push(['Discount', -discount]);

  lineItems.forEach(([label, amt], idx) => {
    const rowH = 26;
    if (idx % 2 === 1) doc.rect(LEFT, ty, RIGHT - LEFT, rowH).fill('#F3F4F6');
    doc.fontSize(9.5).font('Helvetica').fillColor('#111827')
      .text(label, colDesc + 10, ty + 8, { width: colQty - colDesc - 10 })
      .text('1', colQty, ty + 8, { width: colUnit - colQty - 10, align: 'right' })
      .text(money(amt), colUnit, ty + 8, { width: colAmt - colUnit - 10, align: 'right' })
      .text(money(amt), colAmt, ty + 8, { width: RIGHT - colAmt - 10, align: 'right' });
    ty += rowH;
  });
  doc.y = ty + 10;

  // Totals summary — right-aligned box. Each row's y is captured once and reused for
  // both the label and value text() calls, since text() advances doc.y as it renders —
  // reading doc.y again after the first call would read the already-advanced position.
  const sumW = 245, sumX = RIGHT - sumW;
  const sumRow = (label: string, val: string) => {
    const rowY = doc.y;
    doc.fontSize(9.5).font('Helvetica').fillColor('#374151').text(label, sumX, rowY, { width: sumW - 100, lineBreak: false });
    doc.text(val, sumX + sumW - 100, rowY, { width: 100, align: 'right', lineBreak: false });
    doc.y = rowY + 18;
  };
  sumRow('Subtotal', money(total));
  if (advance > 0) sumRow('Advance Paid', money(-advance));

  const barY = doc.y;
  doc.rect(sumX, barY, sumW, 28).fill(NAVY);
  doc.fontSize(10.5).font('Helvetica-Bold').fillColor('#FFFFFF')
    .text(isPaid ? 'Amount Paid' : 'Total Due', sumX + 10, barY + 9, { width: sumW - 120, lineBreak: false });
  doc.text(money(isPaid ? parseFloat(String(inv.paidAmount ?? 0)) : outstanding), sumX + sumW - 110, barY + 9, { width: 100, align: 'right', lineBreak: false });
  doc.y = barY + 40;

  // Notes & payment terms
  sectionTitle(doc, 'Notes & Payment Terms');
  doc.fontSize(9).font('Helvetica').fillColor(GREY)
    .text(inv.notes || 'Payment due by the date shown above. Please contact us for any billing enquiries.', LEFT, doc.y, { width: RIGHT - LEFT });

  doc.fontSize(7.5).font('Helvetica').fillColor(LIGHT)
    .text(`Company No. ${COMPANY.companyNo} | VAT Reg. ${COMPANY.vatReg} | OISC Ref. ${COMPANY.oiscRef}`, LEFT, 770, { width: RIGHT - LEFT });
  doc.end();
};
