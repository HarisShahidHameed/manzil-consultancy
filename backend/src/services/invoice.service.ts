import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';
import { computeAgencyDocLineItems, InvoiceLineItem } from '../utils/invoiceItems';

const INVOICE_SELECT = {
  id: true, invoiceRef: true, caseId: true, issueDate: true, dueDate: true,
  charges: true, discount: true, advance: true, totalAmount: true,
  paidAmount: true, outstanding: true, status: true, notes: true, lineItems: true,
  createdById: true, createdAt: true, updatedAt: true,
  case: {
    select: {
      id: true, destination: true, visaType: true,
      client: {
        select: {
          id: true, clientRef: true, firstName: true, lastName: true, phone: true,
          addressStreet: true, addressCity: true, addressShire: true, addressPostalCode: true, addressCountry: true,
        },
      },
    },
  },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.InvoiceSelect;

export const generateInvoiceRef = async (): Promise<string> => {
  const last = await prisma.invoice.findFirst({
    orderBy: { invoiceRef: 'desc' },
    select:  { invoiceRef: true },
  });
  const num = last ? parseInt(last.invoiceRef.replace('INV-', ''), 10) + 1 : 1000;
  return `INV-${num}`;
};

export const createInvoice = async (data: {
  caseId: string; dueDate?: string; charges: number;
  discount?: number; advance?: number; notes?: string; createdById?: string;
}) => {
  const caseRecord = await prisma.visaCase.findUnique({
    where: { id: data.caseId },
    select: {
      docAppointmentCost: true, docAppointmentClientPaid: true,
      docTicketCost: true, docTicketClientPaid: true,
      docInsuranceCost: true, docInsuranceClientPaid: true,
      docHotelCost: true, docHotelClientPaid: true,
      docSelfEmploymentCost: true, docSelfEmploymentClientPaid: true,
    },
  });
  if (!caseRecord) throw new Error('CASE_NOT_FOUND');

  const invoiceRef = await generateInvoiceRef();
  const charges    = new Prisma.Decimal(data.charges);
  const discount   = new Prisma.Decimal(data.discount ?? 0);
  // Each agency-fronted doc cost becomes its own invoice line item, and whatever the
  // client has already paid back toward it counts as an advance on the invoice —
  // on top of whatever base advance was entered.
  const { items: docItems, clientContribution, costTotal } = computeAgencyDocLineItems(caseRecord);
  const advance    = new Prisma.Decimal(data.advance ?? 0).plus(clientContribution);
  const total      = charges.plus(costTotal).minus(discount);
  const outstanding = total.minus(advance);
  const lineItems: InvoiceLineItem[] = [{ label: 'Service Charges', amount: charges.toNumber() }, ...docItems];

  return prisma.invoice.create({
    data: {
      invoiceRef,
      caseId:      data.caseId,
      dueDate:     data.dueDate ? new Date(data.dueDate) : undefined,
      charges,
      discount,
      advance,
      totalAmount: total,
      paidAmount:  new Prisma.Decimal(0),
      outstanding,
      lineItems: lineItems as unknown as Prisma.InputJsonValue,
      notes:       data.notes,
      createdById: data.createdById,
    },
    select: INVOICE_SELECT,
  });
};

export const listInvoices = async (page = 1, limit = 20, status?: string, search?: string) => {
  const skip = (page - 1) * limit;
  const where: Prisma.InvoiceWhereInput = {};
  if (status) where.status = status as any;
  if (search) {
    where.OR = [
      { invoiceRef: { contains: search, mode: 'insensitive' } },
      { case: { client: { firstName: { contains: search, mode: 'insensitive' } } } },
      { case: { client: { lastName:  { contains: search, mode: 'insensitive' } } } },
      { case: { client: { clientRef: { contains: search, mode: 'insensitive' } } } },
    ];
  }
  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({ where, skip, take: limit, select: INVOICE_SELECT, orderBy: { createdAt: 'desc' } }),
    prisma.invoice.count({ where }),
  ]);
  return { invoices, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getInvoiceById = async (id: string) => {
  return prisma.invoice.findUnique({ where: { id }, select: INVOICE_SELECT });
};

export const updateInvoice = async (
  id: string,
  data: {
    dueDate?: string; charges?: number; discount?: number; advance?: number;
    paidAmount?: number; status?: 'DRAFT' | 'SENT' | 'PARTIAL' | 'PAID'; notes?: string;
  }
) => {
  const current = await prisma.invoice.findUnique({
    where: { id },
    select: { charges: true, discount: true, advance: true, paidAmount: true },
  });
  if (!current) throw new Error('NOT_FOUND');

  const charges  = new Prisma.Decimal(data.charges  ?? current.charges.toNumber());
  const discount = new Prisma.Decimal(data.discount ?? current.discount.toNumber());
  const advance  = new Prisma.Decimal(data.advance  ?? current.advance.toNumber());
  const total    = charges.minus(discount);

  // Payment is handled manually outside the system — the status drives the figures.
  let paidAmount = new Prisma.Decimal(data.paidAmount ?? current.paidAmount.toNumber());
  if (data.status === 'PAID')               paidAmount = total.minus(advance);
  else if (data.status === 'DRAFT' || data.status === 'SENT') paidAmount = new Prisma.Decimal(0);
  if (paidAmount.lt(0)) paidAmount = new Prisma.Decimal(0);

  const outstanding = total.minus(advance).minus(paidAmount);

  const updateData: any = {
    charges, discount, advance, paidAmount,
    totalAmount: total,
    outstanding,
  };
  if (data.dueDate)             updateData.dueDate = new Date(data.dueDate);
  if (data.notes !== undefined) updateData.notes   = data.notes;
  if (data.status)              updateData.status  = data.status;

  return prisma.invoice.update({ where: { id }, data: updateData, select: INVOICE_SELECT });
};

export const deleteInvoice = async (id: string) => {
  return prisma.invoice.delete({ where: { id } });
};
