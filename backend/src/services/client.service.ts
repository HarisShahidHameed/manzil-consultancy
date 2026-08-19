import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';
import { getMissingRequiredFields, CaseRequiredField } from '../utils/caseRequiredInfo';
import { generateClientRef, backfillGroupMembers, nextMemberIndex, buildGroupRef } from '../utils/clientRef';
import { appendHrComment, formatHrCommentEntry } from '../utils/hrComments';

export { generateClientRef };

const CLIENT_SELECT = {
  id: true, clientRef: true, receivedDate: true,
  firstName: true, lastName: true, gender: true, dob: true,
  phone: true, email: true, whatsapp: true, availability: true,
  addressStreet: true, addressCity: true, addressShire: true, addressPostalCode: true, addressCountry: true,
  passportNumber: true, passportIssue: true, passportExpiry: true,
  birthCity: true, nationality: true, maritalStatus: true, previousSchengenVisa: true, registeredEmail: true,
  eVisa: true, visaAndTravelHistory: true,
  source: true, referredBy: true, hrComments: true, folderUrl: true, status: true, serviceType: true,
  assignedToId: true, createdById: true, groupId: true, createdAt: true, updatedAt: true,
  assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
  group: { select: { id: true, groupRef: true, name: true, relation: true, _count: { select: { clients: true } } } },
  visaCases: {
    select: {
      id: true, destination: true, destinationOptions: true, city: true, cityOptions: true, visaType: true, stage: true, priority: true,
      appointmentStatus: true, appointmentDate: true, advance: true, charges: true, discount: true, advancePaid: true,
      createdAt: true, updatedAt: true,
    },
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.ClientSelect;

const CLIENT_DETAIL_SELECT = {
  id: true, clientRef: true, receivedDate: true,
  firstName: true, lastName: true, gender: true, dob: true,
  phone: true, email: true, whatsapp: true, availability: true,
  addressStreet: true, addressCity: true, addressShire: true, addressPostalCode: true, addressCountry: true,
  passportNumber: true, passportIssue: true, passportExpiry: true,
  birthCity: true, nationality: true, maritalStatus: true, previousSchengenVisa: true, registeredEmail: true,
  eVisa: true, visaAndTravelHistory: true,
  source: true, referredBy: true, hrComments: true, folderUrl: true, status: true, serviceType: true,
  assignedToId: true, createdById: true, groupId: true, createdAt: true, updatedAt: true,
  assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
  group: { select: { id: true, groupRef: true, name: true, relation: true, _count: { select: { clients: true } } } },
  visaCases: {
    select: {
      id: true, destination: true, destinationOptions: true, city: true, cityOptions: true, visaType: true, ukVisaExpiry: true, eVisaType: true,
      stage: true, priority: true, appointmentStatus: true, appointmentDate: true, bookedById: true,
      appointmentAssignedToId: true, fraNo: true, tlsAccount: true, appointmentNotes: true,
      travelDate: true, hotelDate: true, salamComments: true,
      docAppointment: true, docTicket: true, docInsurance: true, docHotel: true,
      docEVisa: true, docSop: true, docVisaForm: true, docSelfEmployment: true,
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

// Flags any Appointment-stage case on this client with what's left to fill in
// before it can move to file processing.
const decorateClient = <
  T extends {
    passportNumber: string | null; nationality: string | null; dob: Date | null;
    passportIssue: Date | null; passportExpiry: Date | null;
    visaCases: Array<{ stage: string; destination: string | null; destinationOptions?: string[] } & Record<string, unknown>>;
  }
>(client: T) => ({
  ...client,
  visaCases: client.visaCases.map(vc =>
    vc.stage === 'APPOINTMENT'
      ? { ...vc, missingRequiredFields: getMissingRequiredFields(client, { destination: vc.destination, destinationOptions: vc.destinationOptions }) as CaseRequiredField[] }
      : vc
  ),
});


// Mirrors visaCase.service's resolveDestination — a single-entry shortlist collapses
// straight to `destination`; only a genuine multi-country shortlist stays as options.
const resolveDestination = (data: { destination?: string; destinationOptions?: string[] }) => {
  const options = data.destinationOptions?.map(d => d.trim()).filter(Boolean) ?? [];
  if (options.length <= 1) {
    return { destination: data.destination ?? options[0], destinationOptions: [] as string[] };
  }
  return { destination: data.destination, destinationOptions: options };
};

// Same shortlist-then-finalize collapse as resolveDestination, for the appointment city.
const resolveCity = (data: { city?: string; cityOptions?: string[] }) => {
  const options = data.cityOptions?.map(c => c.trim()).filter(Boolean) ?? [];
  if (options.length <= 1) {
    return { city: data.city ?? options[0], cityOptions: [] as string[] };
  }
  return { city: data.city, cityOptions: options };
};

export const createClient = async (data: {
  clientRef?: string;
  receivedDate: string; firstName: string; lastName?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER'; dob?: string; phone: string;
  email?: string; whatsapp?: string; availability?: string;
  addressStreet?: string; addressCity?: string; addressShire?: string; addressPostalCode?: string; addressCountry?: string;
  passportNumber?: string; passportIssue?: string; passportExpiry?: string;
  birthCity?: string; nationality?: string;
  maritalStatus?: 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED'; previousSchengenVisa?: string;
  registeredEmail?: string;
  eVisa?: boolean; visaAndTravelHistory?: string;
  source?: string; referredBy?: string; hrComments?: string; folderUrl?: string;
  assignedToId?: string; createdById?: string; groupId?: string;
  serviceType?: 'APPOINTMENT_ONLY' | 'FULL_SERVICE';
  destination?: string; destinationOptions?: string[];
  city?: string; cityOptions?: string[]; visaType?: string; ukVisaExpiry?: string; eVisaType?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  advance?: number; charges?: number; discount?: number;
}) => {
  // An explicit groupId at creation time (picked from the client form's group select)
  // gets the client its group-formatted ref straight away, same as adding an existing
  // client to a group later via group.service.addMembers.
  let clientRef = data.clientRef?.trim();
  if (!clientRef && data.groupId) {
    const group = await prisma.clientGroup.findUnique({ where: { id: data.groupId }, select: { groupRef: true } });
    if (group) {
      const groupNumber = await backfillGroupMembers(data.groupId, group.groupRef);
      const memberIndex = await nextMemberIndex(data.groupId);
      clientRef = buildGroupRef(groupNumber, group.groupRef, memberIndex);
    }
  }
  if (!clientRef) clientRef = await generateClientRef();
  const { destination, destinationOptions } = resolveDestination(data);
  const { city, cityOptions } = resolveCity(data);
  const {
    visaType, ukVisaExpiry, eVisaType, priority,
    advance, charges, discount, createdById, clientRef: _clientRef,
    destination: _destination, destinationOptions: _destinationOptions,
    city: _city, cityOptions: _cityOptions, ...rest
  } = data;

  return prisma.client.create({
    data: {
      ...rest,
      clientRef,
      // The first entry in the client's HR Comments log, tagged with the phase it
      // was written from — every later note (Client Update, Appointment, File
      // Processing, ...) appends to this rather than overwriting it.
      hrComments: rest.hrComments ? formatHrCommentEntry('Client Intake', rest.hrComments) : undefined,
      receivedDate:  new Date(rest.receivedDate),
      dob:           rest.dob           ? new Date(rest.dob)           : undefined,
      passportIssue: rest.passportIssue ? new Date(rest.passportIssue) : undefined,
      passportExpiry:rest.passportExpiry? new Date(rest.passportExpiry): undefined,
      createdById,
      // No Intake stage: the case enters the appointment queue as Waiting
      // as soon as the client's information is filled in.
      visaCases: {
        create: {
          appointmentStatus: 'WAITING',
          destination, destinationOptions,
          city, cityOptions,
          visaType,
          ukVisaExpiry: ukVisaExpiry ? new Date(ukVisaExpiry) : undefined,
          eVisaType,
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
      const target = e?.meta?.target;
      const message = e?.code === 'P2002'
        ? target?.includes?.('clientRef')
          ? `Duplicate: client ID ${row.clientRef} already exists`
          : 'Duplicate: passport number already exists'
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
    prisma.client.findMany({ where, skip, take: limit, select: CLIENT_SELECT, orderBy: { receivedDate: 'desc' } }),
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
    email: string; whatsapp: string; availability: string;
    addressStreet: string; addressCity: string; addressShire: string; addressPostalCode: string; addressCountry: string;
    passportNumber: string; passportIssue: string; passportExpiry: string;
    birthCity: string; nationality: string;
    maritalStatus: 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED'; previousSchengenVisa: string;
    registeredEmail: string;
    eVisa: boolean; visaAndTravelHistory: string;
    source: string; referredBy: string; hrComments: string;
    folderUrl: string; assignedToId: string; groupId: string | null;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
    serviceType: 'APPOINTMENT_ONLY' | 'FULL_SERVICE';
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

  // groupId changing re-derives the clientRef, same rules as group.service's
  // addMembers/removeMember — joining (or switching to) a group formats it as
  // CL-number-GroupName-position; clearing it reverts to a fresh plain CL-###.
  // Re-saving the same groupId is a no-op here so repeat saves don't inflate positions.
  if (Object.prototype.hasOwnProperty.call(data, 'groupId')) {
    const current = await prisma.client.findUnique({ where: { id }, select: { groupId: true } });
    if (data.groupId && data.groupId !== current?.groupId) {
      const group = await prisma.clientGroup.findUnique({ where: { id: data.groupId }, select: { groupRef: true } });
      if (group) {
        const groupNumber = await backfillGroupMembers(data.groupId, group.groupRef);
        const memberIndex = await nextMemberIndex(data.groupId);
        d.clientRef = buildGroupRef(groupNumber, group.groupRef, memberIndex);
      }
    } else if (data.groupId === null && current?.groupId) {
      d.clientRef = await generateClientRef();
    }
  }

  return prisma.client.update({ where: { id }, data: d, select: CLIENT_SELECT });
};

// Appends a new phase-tagged HR Comment note to the client's running log — used by
// every later-phase surface (Client Update, Appointment, File Processing, ...) instead
// of letting each stage overwrite its own separate field.
export const appendClientHrComment = async (id: string, phase: string, text: string) => {
  const existing = await prisma.client.findUnique({ where: { id }, select: { hrComments: true } });
  if (!existing) {
    const e: any = new Error('NOT_FOUND'); e.code = 'P2025'; throw e;
  }
  return prisma.client.update({
    where: { id },
    data: { hrComments: appendHrComment(existing.hrComments, phase, text) },
    select: CLIENT_SELECT,
  });
};

export const deleteClient = async (id: string) => {
  return prisma.client.delete({ where: { id } });
};
