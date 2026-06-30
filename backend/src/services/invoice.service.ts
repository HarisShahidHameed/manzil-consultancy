import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';

const INVOICE_SELECT = {
  id: true, invoiceRef: true, caseId: true, issueDate: true, dueDate: true,
  charges: true, discount: true, advance: true, totalAmount: true,
  paidAmount: true, outstanding: true, status: true, notes: true,
  createdById: true, createdAt: true, updatedAt: true,
  case: {
    select: {
      id: true, destination: true, visaType: true,
      client: { select: { id: true, clientRef: true, firstName: true, lastName: true, phone: true } },
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
  const invoiceRef = await generateInvoiceRef();
  const charges    = new Prisma.Decimal(data.charges);
  const discount   = new Prisma.Decimal(data.discount ?? 0);
  const advance    = new Prisma.Decimal(data.advance  ?? 0);
  const total      = charges.minus(discount);
  const outstanding = total.minus(advance);

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
