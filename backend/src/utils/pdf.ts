import PDFDocument from 'pdfkit';
import { Response } from 'express';

const NAVY = '#1B2E70';
const ORANGE = '#F7941D';
const GREY = '#6B7280';
const LIGHT = '#9CA3AF';

const money = (v: unknown) => `£${(v != null ? parseFloat(String(v)) : 0).toFixed(2)}`;
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

// ── Invoice / receipt ─────────────────────────────────────────
export const streamInvoicePdf = (res: Response, inv: any): void => {
  const client = inv.case?.client ?? {};
  const isPaid = inv.status === 'PAID';
  const doc = start(res, `${inv.invoiceRef}.pdf`);
  brandHeader(doc, isPaid ? 'Receipt' : 'Invoice', inv.invoiceRef);

  sectionTitle(doc, 'Bill To');
  kvRows(doc, [
    ['Client', `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim()],
    ['Client Ref', client.clientRef],
    ['Phone', client.phone],
    ['Destination', inv.case?.destination],
    ['Issue Date', fdate(inv.issueDate)],
    ['Due Date', fdate(inv.dueDate)],
  ]);

  // Line items table
  sectionTitle(doc, 'Details');
  const charges = parseFloat(String(inv.charges ?? 0));
  const discount = parseFloat(String(inv.discount ?? 0));
  const advance = parseFloat(String(inv.advance ?? 0));
  const total = parseFloat(String(inv.totalAmount ?? charges - discount));
  const outstanding = parseFloat(String(inv.outstanding ?? 0));

  let ty = doc.y + 2;
  doc.rect(LEFT, ty, RIGHT - LEFT, 22).fill('#F3F4F6');
  doc.fontSize(9).font('Helvetica-Bold').fillColor(GREY).text('Description', LEFT + 10, ty + 7);
  doc.text('Amount', 400, ty + 7, { width: RIGHT - 400 - 10, align: 'right' });
  ty += 22;

  const row = (label: string, val: string, bold = false) => {
    doc.fontSize(10).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor('#111827')
      .text(label, LEFT + 10, ty + 7, { width: 300 });
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .text(val, 400, ty + 7, { width: RIGHT - 400 - 10, align: 'right' });
    doc.moveTo(LEFT, ty + 26).lineTo(RIGHT, ty + 26).lineWidth(0.5).strokeColor('#E5E7EB').stroke();
    ty += 27;
  };
  row('Service Charges', money(charges));
  if (discount > 0) row('Discount', `- ${money(discount)}`);
  row('Total', money(total), true);
  if (advance > 0) row('Advance Paid', `- ${money(advance)}`);
  row(isPaid ? 'Amount Paid' : 'Outstanding', money(isPaid ? total - advance : outstanding), true);

  // Status badge
  doc.y = ty + 12;
  const badgeColor = isPaid ? '#16A34A' : inv.status === 'SENT' ? '#2563EB' : '#6B7280';
  doc.roundedRect(RIGHT - 120, doc.y, 120, 26, 4).fill(badgeColor);
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#FFFFFF').text(String(inv.status), RIGHT - 120, doc.y + 8, { width: 120, align: 'center' });

  if (inv.notes) {
    doc.y += 44;
    sectionTitle(doc, 'Notes');
    doc.fontSize(9).font('Helvetica').fillColor(GREY).text(inv.notes, LEFT, doc.y, { width: RIGHT - LEFT });
  }

  footer(doc);
  doc.end();
};
