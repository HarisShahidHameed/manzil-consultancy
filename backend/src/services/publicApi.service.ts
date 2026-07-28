import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';
import { createClient } from './client.service';

// Deliberately narrower than the internal CLIENT_SELECT/CASE_SELECT in
// client.service.ts / visaCase.service.ts — third parties get identity, contact and
// travel-document data, not internal staff notes (hrComments, salamComments,
// appointmentNotes), financial figures (advance/charges/discount/doc costs), or
// internal booking references (fraNo, tlsAccount) or assigned-staff identities.
const PUBLIC_CLIENT_SELECT = {
  id: true, clientRef: true, receivedDate: true,
  firstName: true, lastName: true, gender: true, dob: true,
  phone: true, email: true, whatsapp: true,
  addressStreet: true, addressCity: true, addressShire: true, addressPostalCode: true, addressCountry: true,
  passportNumber: true, passportIssue: true, passportExpiry: true,
  birthCity: true, nationality: true, maritalStatus: true,
  status: true,
  createdAt: true, updatedAt: true,
  visaCases: {
    select: {
      id: true, destination: true, city: true, visaType: true, ukVisaExpiry: true,
      stage: true, appointmentDate: true, travelDate: true,
      createdAt: true, updatedAt: true,
    },
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.ClientSelect;

const PUBLIC_CASE_SELECT = {
  id: true, clientId: true, destination: true, city: true, visaType: true, ukVisaExpiry: true, eVisaType: true,
  stage: true, priority: true, appointmentStatus: true, appointmentDate: true,
  travelDate: true, hotelDate: true,
  docAppointment: true, docTicket: true, docInsurance: true, docHotel: true,
  docEVisa: true, docSop: true, docVisaForm: true, docSelfEmployment: true,
  createdAt: true, updatedAt: true,
  client: {
    select: { id: true, clientRef: true, firstName: true, lastName: true, phone: true, email: true },
  },
} satisfies Prisma.VisaCaseSelect;

export interface PublicClientFilters {
  search?: string;
  nationality?: string;
  passportNumber?: string;
  destination?: string;
  city?: string;
  stage?: string;
  status?: string;
  // Client's own address fields — distinct from `city` above (a case's appointment
  // city). Named to match what a third party is most likely to actually have on hand
  // when looking a client up (see the single-client lookup endpoint).
  addressCity?: string;
  addressCountry?: string;
  phone?: string;
  email?: string;
}

// Shared by both the list and single-client lookup endpoints — every filter is
// optional and ANDs together (Prisma's default for sibling where keys).
const buildPublicClientWhere = (filters: PublicClientFilters): Prisma.ClientWhereInput => {
  const { search, nationality, passportNumber, destination, city, stage, status, addressCity, addressCountry, phone, email } = filters;
  const where: Prisma.ClientWhereInput = {};
  if (search) {
    where.OR = [
      { firstName:      { contains: search, mode: 'insensitive' } },
      { lastName:       { contains: search, mode: 'insensitive' } },
      { clientRef:      { contains: search, mode: 'insensitive' } },
      { passportNumber: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (nationality)     where.nationality     = { contains: nationality, mode: 'insensitive' };
  if (passportNumber)  where.passportNumber  = { contains: passportNumber, mode: 'insensitive' };
  if (addressCity)     where.addressCity     = { contains: addressCity, mode: 'insensitive' };
  if (addressCountry)  where.addressCountry  = { contains: addressCountry, mode: 'insensitive' };
  if (phone)           where.phone           = { contains: phone, mode: 'insensitive' };
  if (email)           where.email           = { contains: email, mode: 'insensitive' };
  if (status)          where.status          = status as any;
  if (destination || city || stage) {
    where.visaCases = {
      some: {
        ...(destination ? { destination: { contains: destination, mode: 'insensitive' } } : {}),
        ...(city        ? { city:        { contains: city,        mode: 'insensitive' } } : {}),
        ...(stage        ? { stage: stage as any } : {}),
      },
    };
  }
  return where;
};

export const listPublicClients = async (page = 1, limit = 20, filters: PublicClientFilters = {}) => {
  const skip = (page - 1) * limit;
  const where = buildPublicClientWhere(filters);

  const [clients, total] = await Promise.all([
    prisma.client.findMany({ where, skip, take: limit, select: PUBLIC_CLIENT_SELECT, orderBy: { createdAt: 'desc' } }),
    prisma.client.count({ where }),
  ]);
  return { clients, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getPublicClientById = async (id: string) => {
  return prisma.client.findFirst({
    where: { OR: [{ id }, { clientRef: id }] },
    select: PUBLIC_CLIENT_SELECT,
  });
};

// Returns exactly one client (the most recently created match) for callers that only
// have identifying attributes on hand — e.g. city + country — rather than our id or
// clientRef. Requires at least one filter so a bare call can't return an arbitrary
// client; returns null (not an array) so the caller never has to disambiguate.
export const getSinglePublicClient = async (filters: PublicClientFilters) => {
  const where = buildPublicClientWhere(filters);
  return prisma.client.findFirst({ where, select: PUBLIC_CLIENT_SELECT, orderBy: { createdAt: 'desc' } });
};

// Creates through the same service the internal client form uses (including the
// DB-level unique passport number constraint), then re-reads through the sanitized
// public select so the response never leaks internal-only fields.
export const createPublicClient = async (data: Parameters<typeof createClient>[0]) => {
  const created = await createClient(data);
  return getPublicClientById(created.id);
};

// The one write a third party can do on an existing client through the public
// API — flip its processing status. Kept separate from a general "update client"
// endpoint so the write surface stays exactly as wide as what's actually needed.
export const updatePublicClientStatus = async (id: string, status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED') => {
  const existing = await prisma.client.findFirst({ where: { OR: [{ id }, { clientRef: id }] }, select: { id: true } });
  if (!existing) return null;
  await prisma.client.update({ where: { id: existing.id }, data: { status } });
  return getPublicClientById(existing.id);
};

export const listPublicAppointments = async (page = 1, limit = 20, stage?: string) => {
  const skip = (page - 1) * limit;
  const where: Prisma.VisaCaseWhereInput = stage ? { stage: stage as any } : {};

  const [cases, total] = await Promise.all([
    prisma.visaCase.findMany({ where, skip, take: limit, select: PUBLIC_CASE_SELECT, orderBy: { updatedAt: 'desc' } }),
    prisma.visaCase.count({ where }),
  ]);
  return { cases, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getPublicAppointmentById = async (id: string) => {
  return prisma.visaCase.findUnique({ where: { id }, select: PUBLIC_CASE_SELECT });
};
