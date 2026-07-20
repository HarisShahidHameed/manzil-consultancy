import { Prisma } from '@prisma/client';

// Docs the agency fronts the cost for (see CaseDetail.tsx AGENCY_PAID_DOCS on the
// frontend) — each becomes its own invoice line item when the agency actually paid
// something, and whatever the client has already paid back toward it counts as an
// advance on the invoice, same as a deposit would.
const AGENCY_DOC_FIELDS = [
  { label: 'Appointment Docs',        cost: 'docAppointmentCost',    clientPaid: 'docAppointmentClientPaid' },
  { label: 'Ticket',                  cost: 'docTicketCost',         clientPaid: 'docTicketClientPaid' },
  { label: 'Insurance',               cost: 'docInsuranceCost',      clientPaid: 'docInsuranceClientPaid' },
  { label: 'Hotel',                   cost: 'docHotelCost',          clientPaid: 'docHotelClientPaid' },
  { label: 'Self Employment Letter',  cost: 'docSelfEmploymentCost', clientPaid: 'docSelfEmploymentClientPaid' },
] as const;

export interface CaseDocCostFields {
  docAppointmentCost: Prisma.Decimal | null;
  docAppointmentClientPaid: Prisma.Decimal | null;
  docTicketCost: Prisma.Decimal | null;
  docTicketClientPaid: Prisma.Decimal | null;
  docInsuranceCost: Prisma.Decimal | null;
  docInsuranceClientPaid: Prisma.Decimal | null;
  docHotelCost: Prisma.Decimal | null;
  docHotelClientPaid: Prisma.Decimal | null;
  docSelfEmploymentCost: Prisma.Decimal | null;
  docSelfEmploymentClientPaid: Prisma.Decimal | null;
}

export interface InvoiceLineItem {
  label: string;
  amount: number;
}

export const computeAgencyDocLineItems = (
  caseRecord: CaseDocCostFields
): { items: InvoiceLineItem[]; clientContribution: Prisma.Decimal; costTotal: Prisma.Decimal } => {
  const items: InvoiceLineItem[] = [];
  let clientContribution = new Prisma.Decimal(0);
  let costTotal = new Prisma.Decimal(0);

  for (const { label, cost, clientPaid } of AGENCY_DOC_FIELDS) {
    const costVal = caseRecord[cost];
    if (costVal && costVal.gt(0)) {
      items.push({ label, amount: costVal.toNumber() });
      costTotal = costTotal.plus(costVal);
      const paidVal = caseRecord[clientPaid];
      if (paidVal) clientContribution = clientContribution.plus(paidVal);
    }
  }

  return { items, clientContribution, costTotal };
};
