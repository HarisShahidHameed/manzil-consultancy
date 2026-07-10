jest.mock('../config/database', () => ({
  prisma: {
    client: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    visaCase: {
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  },
}));

import { prisma } from '../config/database';
import { bulkImportClients, updateClient } from './client.service';

const baseRow = (overrides: Partial<Parameters<typeof bulkImportClients>[0][number]> = {}) => ({
  receivedDate: '2025-01-01',
  firstName: 'Ali',
  lastName: 'Khan',
  phone: '03001234567',
  destination: 'UK',
  passportNumber: undefined as string | undefined,
  ...overrides,
});

describe('bulkImportClients', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$queryRaw as unknown as jest.Mock).mockResolvedValue([{ max: null }]); // generateClientRef
    (prisma.client.create as jest.Mock).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'new-id', clientRef: 'CL-100', ...data })
    );
  });

  it('skips a row whose passport number already exists in the database', async () => {
    (prisma.client.findMany as jest.Mock).mockImplementation(({ where }: any) => {
      if (where?.passportNumber) return Promise.resolve([{ passportNumber: 'P123' }]);
      return Promise.resolve([]);
    });

    const result = await bulkImportClients([baseRow({ passportNumber: 'P123' })]);

    expect(result.imported).toBe(0);
    expect(result.duplicates).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors[0].message).toMatch(/Duplicate/);
    expect(prisma.client.create).not.toHaveBeenCalled();
  });

  it('skips a row matching an existing client by name + phone when passport is missing', async () => {
    (prisma.client.findMany as jest.Mock).mockImplementation(({ where }: any) => {
      if (where?.OR) return Promise.resolve([{ firstName: 'Ali', lastName: 'Khan', phone: '03001234567' }]);
      return Promise.resolve([]);
    });

    const result = await bulkImportClients([baseRow()]);

    expect(result.imported).toBe(0);
    expect(result.duplicates).toBe(1);
    expect(prisma.client.create).not.toHaveBeenCalled();
  });

  it('imports a non-duplicate row and de-dupes against the rest of the same batch', async () => {
    (prisma.client.findMany as jest.Mock).mockResolvedValue([]);

    const result = await bulkImportClients([
      baseRow({ passportNumber: 'P999' }),
      baseRow({ passportNumber: 'P999' }), // duplicate within the same batch
    ]);

    expect(result.imported).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(prisma.client.create).toHaveBeenCalledTimes(1);
  });

  it('reports a DB-level unique conflict (race condition) as a duplicate', async () => {
    (prisma.client.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.client.create as jest.Mock).mockRejectedValue({ code: 'P2002', message: 'Unique constraint failed' });

    const result = await bulkImportClients([baseRow({ passportNumber: 'P1' })]);

    expect(result.imported).toBe(0);
    expect(result.duplicates).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors[0].message).toMatch(/Duplicate/);
  });
});

describe('updateClient — completed-case lock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.client.update as jest.Mock).mockResolvedValue({ id: 'client-1' });
  });

  it('rejects updates once every case for the client is COMPLETED', async () => {
    (prisma.visaCase.findMany as jest.Mock).mockResolvedValue([{ stage: 'COMPLETED' }]);

    await expect(updateClient('client-1', { firstName: 'New Name' })).rejects.toThrow('CLIENT_LOCKED');
    expect(prisma.client.update).not.toHaveBeenCalled();
  });

  it('allows updates when at least one case is still active', async () => {
    (prisma.visaCase.findMany as jest.Mock).mockResolvedValue([
      { stage: 'COMPLETED' },
      { stage: 'FILE_PROCESSING' },
    ]);

    await updateClient('client-1', { firstName: 'New Name' });
    expect(prisma.client.update).toHaveBeenCalled();
  });

  it('allows updates when the client has no cases at all', async () => {
    (prisma.visaCase.findMany as jest.Mock).mockResolvedValue([]);

    await updateClient('client-1', { firstName: 'New Name' });
    expect(prisma.client.update).toHaveBeenCalled();
  });
});
