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
}

export const listPublicClients = async (page = 1, limit = 20, filters: PublicClientFilters = {}) => {
  const skip = (page - 1) * limit;
  const { search, nationality, passportNumber, destination, city, stage } = filters;

  // Each filter ANDs together (Prisma's default for sibling where keys), same pattern
  // as the internal listClients/listCases — search, nationality, passport, and the
  // case-level destination/city/stage filters can all narrow the result set at once.
  const where: Prisma.ClientWhereInput = {};
  if (search) {
    where.OR = [
      { firstName:      { contains: search, mode: 'insensitive' } },
      { lastName:       { contains: search, mode: 'insensitive' } },
      { clientRef:      { contains: search, mode: 'insensitive' } },
      { passportNumber: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (nationality)    where.nationality    = { contains: nationality, mode: 'insensitive' };
  if (passportNumber) where.passportNumber = { contains: passportNumber, mode: 'insensitive' };
  if (destination || city || stage) {
    where.visaCases = {
      some: {
        ...(destination ? { destination: { contains: destination, mode: 'insensitive' } } : {}),
        ...(city        ? { city:        { contains: city,        mode: 'insensitive' } } : {}),
        ...(stage        ? { stage: stage as any } : {}),
      },
    };
  }

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

// Creates through the same service the internal client form uses (including the
// DB-level unique passport number constraint), then re-reads through the sanitized
// public select so the response never leaks internal-only fields.
export const createPublicClient = async (data: Parameters<typeof createClient>[0]) => {
  const created = await createClient(data);
  return getPublicClientById(created.id);
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
