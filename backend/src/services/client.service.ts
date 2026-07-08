import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';
import { getMissingIntakeFields, IntakeRequiredField } from '../utils/intakeCompleteness';

const CLIENT_SELECT = {
  id: true, clientRef: true, receivedDate: true,
  firstName: true, lastName: true, gender: true, dob: true,
  phone: true, email: true, whatsapp: true, residentialAddress: true,
  passportNumber: true, passportIssue: true, passportExpiry: true,
  birthCity: true, nationality: true, maritalStatus: true, previousSchengenVisa: true, registeredEmail: true,
  eVisa: true, contract: true, visaAndTravelHistory: true,
  source: true, referredBy: true, hrComments: true, folderUrl: true,
  assignedToId: true, createdById: true, groupId: true, createdAt: true, updatedAt: true,
  assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
  group: { select: { id: true, groupRef: true, name: true, relation: true } },
  visaCases: {
    select: {
      id: true, destination: true, city: true, visaType: true, stage: true, priority: true,
      appointmentDate: true, advance: true, charges: true, discount: true,
      createdAt: true, updatedAt: true,
    },
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.ClientSelect;

const CLIENT_DETAIL_SELECT = {
  id: true, clientRef: true, receivedDate: true,
  firstName: true, lastName: true, gender: true, dob: true,
  phone: true, email: true, whatsapp: true, residentialAddress: true,
  passportNumber: true, passportIssue: true, passportExpiry: true,
  birthCity: true, nationality: true, maritalStatus: true, previousSchengenVisa: true, registeredEmail: true,
  eVisa: true, contract: true, visaAndTravelHistory: true,
  source: true, referredBy: true, hrComments: true, folderUrl: true,
  assignedToId: true, createdById: true, groupId: true, createdAt: true, updatedAt: true,
  assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
  group: { select: { id: true, groupRef: true, name: true, relation: true } },
  visaCases: {
    select: {
      id: true, destination: true, city: true, visaType: true, ukVisaExpiry: true,
      stage: true, priority: true, appointmentDate: true, bookedById: true,
      appointmentAssignedToId: true, fraNo: true, tlsAccount: true, appointmentNotes: true,
      travelDate: true, hotelDate: true, salamComments: true, hrComments: true,
      docAppointment: true, docTicket: true, docInsurance: true, docHotel: true,
      docEVisa: true, docSop: true, docVisaForm: true,
      advance: true, charges: true, discount: true, paymentReceived: true,
      advancePaid: true, advancePaidDate: true,
      createdAt: true, updatedAt: true,
      bookedBy:           { select: { id: true, firstName: true, lastName: true } },
      appointmentAssigned:{ select: { id: true, firstName: true, lastName: true } },
      invoices: {
        select: { id: true, invoiceRef: true, totalAmount: true, outstanding: true, status: true, issueDate: true },
      },
    },
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.ClientSelect;

// Flags any Intake-stage case on this client with what's left to fill in before it can proceed.
const decorateClient = <
  T extends {
    passportNumber: string | null; nationality: string | null; dob: Date | null;
    passportIssue: Date | null; passportExpiry: Date | null;
    visaCases: Array<{ stage: string; destination: string | null } & Record<string, unknown>>;
  }
>(client: T) => ({
  ...client,
  visaCases: client.visaCases.map(vc =>
    vc.stage === 'INTAKE'
      ? { ...vc, missingIntakeFields: getMissingIntakeFields(client, { destination: vc.destination }) as IntakeRequiredField[] }
      : vc
  ),
});

export const generateClientRef = async (): Promise<string> => {
  const last = await prisma.client.findFirst({
    orderBy: { clientRef: 'desc' },
    select: { clientRef: true },
  });
  const num = last ? parseInt(last.clientRef.replace('CL-', ''), 10) + 1 : 100;
  return `CL-${num}`;
};

export const createClient = async (data: {
  receivedDate: string; firstName: string; lastName?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER'; dob?: string; phone: string;
  email?: string; whatsapp?: string; residentialAddress?: string;
  passportNumber?: string; passportIssue?: string; passportExpiry?: string;
  birthCity?: string; nationality?: string;
  maritalStatus?: 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED'; previousSchengenVisa?: string;
  registeredEmail?: string;
  eVisa?: boolean; contract?: boolean; visaAndTravelHistory?: string;
  source?: string; referredBy?: string; hrComments?: string; folderUrl?: string;
  assignedToId?: string; createdById?: string; groupId?: string;
  destination?: string; city?: string; visaType?: string; ukVisaExpiry?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  advance?: number; charges?: number; discount?: number;
}) => {
  const clientRef = await generateClientRef();
  const {
    destination, city, visaType, ukVisaExpiry, priority,
    advance, charges, discount, createdById, ...rest
  } = data;

  return prisma.client.create({
    data: {
      ...rest,
      clientRef,
      receivedDate:  new Date(rest.receivedDate),
      dob:           rest.dob           ? new Date(rest.dob)           : undefined,
      passportIssue: rest.passportIssue ? new Date(rest.passportIssue) : undefined,
      passportExpiry:rest.passportExpiry? new Date(rest.passportExpiry): undefined,
      createdById,
      visaCases: {
        create: {
          destination,
          city,
          visaType,
          ukVisaExpiry: ukVisaExpiry ? new Date(ukVisaExpiry) : undefined,
          priority: priority ?? 'MEDIUM',
          advance:  advance  !== undefined ? new Prisma.Decimal(advance)  : undefined,
          charges:  charges  !== undefined ? new Prisma.Decimal(charges)  : undefined,
          discount: discount !== undefined ? new Prisma.Decimal(discount) : undefined,
          advancePaid: (advance ?? 0) > 0,
          advancePaidDate: (advance ?? 0) > 0 ? new Date() : undefined,
        },
      },
    },
    select: CLIENT_SELECT,
  });
};

// A client "matches" an existing one if their passport number is the same, or — for
// rows without a passport number yet — if first name, last name and phone all match.
// Postgres already enforces the passport uniqueness at the DB level (nulls excluded);
// this pre-check catches both that case and the name+phone fallback in one pass, and
// lets us report duplicates distinctly instead of surfacing them as row errors.
const nameKey = (firstName: string, lastName: string | undefined, phone: string) =>
  `${firstName.trim().toLowerCase()}|${(lastName ?? '').trim().toLowerCase()}|${phone.trim().toLowerCase()}`;

export const bulkImportClients = async (
  rows: Parameters<typeof createClient>[0][],
  createdById?: string,
) => {
  const results = {
    imported: 0,
    failed: 0,
    duplicates: 0,
    errors: [] as { row: number; message: string }[],
  };

  const passportNumbers = [...new Set(
    rows.map(r => r.passportNumber?.trim()).filter((p): p is string => !!p)
  )];
  const existingByPassport = passportNumbers.length
    ? await prisma.client.findMany({
        where: { passportNumber: { in: passportNumbers } },
        select: { passportNumber: true },
      })
    : [];
  const seenPassports = new Set(existingByPassport.map(c => c.passportNumber as string));

  const nameKeyCandidates = rows
    .filter(r => !r.passportNumber?.trim() && r.phone && r.phone !== 'N/A')
    .map(r => ({ firstName: r.firstName, lastName: r.lastName, phone: r.phone }));
  const existingByName = nameKeyCandidates.length
    ? await prisma.client.findMany({
        where: {
          OR: nameKeyCandidates.map(c => ({
            firstName: { equals: c.firstName, mode: 'insensitive' as const },
            lastName:  c.lastName ? { equals: c.lastName, mode: 'insensitive' as const } : null,
            phone: c.phone,
          })),
        },
        select: { firstName: true, lastName: true, phone: true },
      })
    : [];
  const seenNameKeys = new Set(
    existingByName.map(c => nameKey(c.firstName, c.lastName ?? undefined, c.phone))
  );

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const passport = row.passportNumber?.trim();
    const key = passport || nameKey(row.firstName, row.lastName, row.phone);
    const isDuplicate = passport ? seenPassports.has(passport) : seenNameKeys.has(key);

    if (isDuplicate) {
      results.duplicates++;
      results.failed++;
      const fullName = `${row.firstName} ${row.lastName ?? ''}`.trim();
      results.errors.push({
        row: i + 1,
        message: passport
          ? `Duplicate: a client with passport ${passport} already exists`
          : `Duplicate: a client named "${fullName}" with phone ${row.phone} already exists`,
      });
      continue;
    }

    try {
      await createClient({ ...row, createdById });
      results.imported++;
      if (passport) seenPassports.add(passport);
      else seenNameKeys.add(key);
    } catch (e: any) {
      results.failed++;
      const message = e?.code === 'P2002'
        ? 'Duplicate: passport number already exists'
        : e?.message ?? 'Unknown error';
      if (e?.code === 'P2002') results.duplicates++;
      results.errors.push({ row: i + 1, message });
    }
  }
  return results;
};

export const listClients = async (page = 1, limit = 20, search?: string, stage?: string, destination?: string) => {
  const skip = (page - 1) * limit;
  const where: Prisma.ClientWhereInput = {};

  if (search) {
    where.OR = [
      { firstName:      { contains: search, mode: 'insensitive' } },
      { lastName:       { contains: search, mode: 'insensitive' } },
      { clientRef:      { contains: search, mode: 'insensitive' } },
      { passportNumber: { contains: search, mode: 'insensitive' } },
      { phone:          { contains: search, mode: 'insensitive' } },
      { email:          { contains: search, mode: 'insensitive' } },
    ];
  }

  if (stage || destination) {
    where.visaCases = {
      some: {
        ...(stage       ? { stage: stage as any } : {}),
        ...(destination ? { destination: { contains: destination, mode: 'insensitive' } } : {}),
      },
    };
  }

  const [clients, total] = await Promise.all([
    prisma.client.findMany({ where, skip, take: limit, select: CLIENT_SELECT, orderBy: { createdAt: 'desc' } }),
    prisma.client.count({ where }),
  ]);

  return { clients: clients.map(decorateClient), total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getClientById = async (id: string) => {
  const client = await prisma.client.findFirst({
    where: { OR: [{ id }, { clientRef: id }] },
    select: CLIENT_DETAIL_SELECT,
  });
  return client ? decorateClient(client) : null;
};

export const updateClient = async (
  id: string,
  data: Partial<{
    receivedDate: string; firstName: string; lastName: string;
    gender: 'MALE' | 'FEMALE' | 'OTHER'; dob: string; phone: string;
    email: string; whatsapp: string; residentialAddress: string;
    passportNumber: string; passportIssue: string; passportExpiry: string;
    birthCity: string; nationality: string;
    maritalStatus: 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED'; previousSchengenVisa: string;
    registeredEmail: string;
    eVisa: boolean; contract: boolean; visaAndTravelHistory: string;
    source: string; referredBy: string; hrComments: string;
    folderUrl: string; assignedToId: string; groupId: string | null;
  }>
) => {
  const existingCases = await prisma.visaCase.findMany({ where: { clientId: id }, select: { stage: true } });
  if (existingCases.length > 0 && existingCases.every(c => c.stage === 'COMPLETED')) {
    throw new Error('CLIENT_LOCKED');
  }

  const d: any = { ...data };
  if (data.receivedDate)  d.receivedDate  = new Date(data.receivedDate);
  if (data.dob)           d.dob           = new Date(data.dob);
  if (data.passportIssue)  d.passportIssue  = new Date(data.passportIssue);
  if (data.passportExpiry) d.passportExpiry = new Date(data.passportExpiry);

  return prisma.client.update({ where: { id }, data: d, select: CLIENT_SELECT });
};

export const deleteClient = async (id: string) => {
  return prisma.client.delete({ where: { id } });
};
