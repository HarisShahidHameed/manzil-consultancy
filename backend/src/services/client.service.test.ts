jest.mock('../config/database', () => ({
  prisma: {
    client: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    visaCase: {
      findMany: jest.fn(),
    },
    clientGroup: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $queryRaw: jest.fn(),
  },
}));

import { prisma } from '../config/database';
import { bulkImportClients, findClientByPassport, listClients, updateClient } from './client.service';
import { backfillGroupMembers, generateClientRef } from '../utils/clientRef';
import { addMembers, removeMember } from './group.service';

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
    (prisma.$queryRaw as unknown as jest.Mock).mockResolvedValue([{ next: 100 }]); // generateClientRef
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

describe('listClients — numeric client id ordering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.client.count as jest.Mock).mockResolvedValue(3);
    (prisma.client.findMany as jest.Mock).mockResolvedValue([]);
  });

  // The ordering contract, not the mechanism: clients sharing a received date must come
  // back by DESCENDING client NUMBER, so the client added last tops its day (1 Oct 2026). It keys off clientRefNum (generated by the database
  // from clientRef) rather than clientRef itself, because a text sort files CL-1000 above
  // CL-953 — the reported "CL-953 listed above CL-951 and CL-950" bug.
  it('orders by received date, then descending numeric client id', async () => {
    await listClients(1, 20);

    expect((prisma.client.findMany as jest.Mock).mock.calls[0][0].orderBy).toEqual([
      { receivedDate: 'desc' },
      { clientRefNum: { sort: 'desc', nulls: 'last' } },
      { clientRef: 'desc' },
    ]);
  });

  it('never sorts on clientRef ahead of the numeric column', async () => {
    await listClients(1, 20);

    const orderBy = (prisma.client.findMany as jest.Mock).mock.calls[0][0].orderBy;
    const numIdx = orderBy.findIndex((o: any) => 'clientRefNum' in o);
    const refIdx = orderBy.findIndex((o: any) => 'clientRef' in o);
    expect(numIdx).toBeGreaterThanOrEqual(0);
    expect(numIdx).toBeLessThan(refIdx);
  });

  it('applies the same where clause to the page and the count', async () => {
    await listClients(2, 20, 'khan');

    const listWhere  = (prisma.client.findMany as jest.Mock).mock.calls[0][0].where;
    const countWhere = (prisma.client.count as jest.Mock).mock.calls[0][0].where;
    expect(listWhere).toEqual(countWhere);
  });
});

describe('findClientByPassport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('treats a blank passport number as "no match" without querying', async () => {
    const result = await findClientByPassport('   ');

    expect(result).toEqual({ exists: false, client: null });
    expect(prisma.client.findFirst).not.toHaveBeenCalled();
  });

  it('matches trimmed and case-insensitively, reporting the newest case stage', async () => {
    (prisma.client.findFirst as jest.Mock).mockResolvedValue({
      id: 'client-1', clientRef: 'CL-942', firstName: 'Ali', lastName: 'Khan',
      visaCases: [{ stage: 'FILE_PROCESSING' }],
    });

    const result = await findClientByPassport('  ab123456 ');

    expect((prisma.client.findFirst as jest.Mock).mock.calls[0][0].where).toEqual({
      passportNumber: { equals: 'ab123456', mode: 'insensitive' },
    });
    expect(result).toEqual({
      exists: true,
      client: { id: 'client-1', clientRef: 'CL-942', firstName: 'Ali', lastName: 'Khan', stage: 'FILE_PROCESSING' },
    });
  });

  it('reports a null stage for a client with no cases yet', async () => {
    (prisma.client.findFirst as jest.Mock).mockResolvedValue({
      id: 'client-2', clientRef: 'CL-943', firstName: 'Sara', lastName: null, visaCases: [],
    });

    const result = await findClientByPassport('P999');

    expect(result.client).toMatchObject({ stage: null });
  });

  it('excludes the client being edited so it never flags itself', async () => {
    (prisma.client.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await findClientByPassport('P999', 'client-1');

    expect((prisma.client.findFirst as jest.Mock).mock.calls[0][0].where).toMatchObject({
      id: { not: 'client-1' },
    });
    expect(result).toEqual({ exists: false, client: null });
  });
});

// Numbers are forward-only and per-person: grouping must never move a client onto a
// different number, which is what used to strand 945/946 and make the sequence look like
// it skipped. See utils/clientRef.ts.
describe('client ids — forward-only numbering', () => {
  const refsWritten = () =>
    (prisma.client.update as jest.Mock).mock.calls.map((c) => [c[0].where.id, c[0].data.clientRef]);

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.client.update as jest.Mock).mockResolvedValue({});
  });

  it('mints the next id with MAX+1, not a gap scan', async () => {
    (prisma.$queryRaw as unknown as jest.Mock).mockResolvedValue([{ next: 947 }]);

    expect(await generateClientRef()).toBe('CL-947');

    const sql = ((prisma.$queryRaw as unknown as jest.Mock).mock.calls[0][0] as string[]).join('');
    expect(sql).toMatch(/MAX\(/);
    expect(sql).not.toMatch(/generate_series/); // a freed number is never re-issued
    // The numeric CAST is what keeps CL-9000 from sorting below CL-101 (and GRP-1000
    // below GRP-999) — a lexicographic high-water mark would mint a duplicate.
    expect(sql).toMatch(/CAST\(SUBSTRING/);
  });

  it('groups 942/945/946 without renumbering anyone, and the next new client is 947', async () => {
    (prisma.client.findMany as jest.Mock).mockResolvedValue([
      { id: 'a', clientRef: 'CL-942' },
      { id: 'b', clientRef: 'CL-945' },
      { id: 'c', clientRef: 'CL-946' },
    ]);
    (prisma.$queryRaw as unknown as jest.Mock).mockResolvedValue([{ next: 947 }]);

    const nextNumber = await backfillGroupMembers('group-1', 'GRP-001');

    expect(refsWritten()).toEqual([
      ['a', 'CL-942-G1-01'],
      ['b', 'CL-945-G1-02'],
      ['c', 'CL-946-G1-03'],
    ]);
    // Nothing was orphaned by the grouping, so MAX+1 lands on 947 — no visible skip.
    expect(nextNumber).toBe(947);
  });

  it('leaves an already-current group untouched on a rename and keeps positions', async () => {
    (prisma.client.findMany as jest.Mock).mockResolvedValue([
      { id: 'a', clientRef: 'CL-942-G1-01' },
      { id: 'b', clientRef: 'CL-945-G1-02' },
    ]);
    (prisma.$queryRaw as unknown as jest.Mock).mockResolvedValue([{ next: 947 }]);

    await backfillGroupMembers('group-1', 'GRP-001');

    expect(prisma.client.update).not.toHaveBeenCalled();
  });

  it('keeps number and position when a member moves in from another group', async () => {
    (prisma.client.findMany as jest.Mock).mockResolvedValue([
      { id: 'a', clientRef: 'CL-942-G1-01' },
      { id: 'b', clientRef: 'CL-950-G7-02' }, // came from GRP-007, position 02 is free here
      { id: 'c', clientRef: 'CL-951-G7-02' }, // same position, loses the tie -> next free
    ]);
    (prisma.$queryRaw as unknown as jest.Mock).mockResolvedValue([{ next: 952 }]);

    await backfillGroupMembers('group-1', 'GRP-001');

    expect(refsWritten()).toEqual([
      ['b', 'CL-950-G1-02'],
      ['c', 'CL-951-G1-03'],
    ]);
  });

  it('upgrades a legacy shared-number group in place without touching the numbers', async () => {
    (prisma.client.findMany as jest.Mock).mockResolvedValue([
      { id: 'a', clientRef: 'CL-110-Khan-1' },
      { id: 'b', clientRef: 'CL-110-GRP-002-2' },
    ]);
    (prisma.$queryRaw as unknown as jest.Mock).mockResolvedValue([{ next: 200 }]);

    await backfillGroupMembers('group-1', 'GRP-002');

    expect(refsWritten()).toEqual([
      ['a', 'CL-110-G2-01'],
      ['b', 'CL-110-G2-02'],
    ]);
  });
});

describe('group membership — joining and leaving', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.client.update as jest.Mock).mockResolvedValue({});
    (prisma.clientGroup.findUnique as jest.Mock).mockResolvedValue({
      id: 'g1', groupRef: 'GRP-001', clients: [],
    });
    (prisma.$queryRaw as unknown as jest.Mock).mockResolvedValue([{ next: 999 }]);
  });

  it('stamps an added member with its OWN number and the next free position', async () => {
    (prisma.client.findMany as jest.Mock).mockImplementation(({ where }: any) =>
      Promise.resolve(where?.id?.in
        ? [{ id: 'b', clientRef: 'CL-945' }]                 // the incoming client
        : [{ id: 'a', clientRef: 'CL-942-G1-01' }])          // the group as it stands
    );

    await addMembers('g1', ['b']);

    expect((prisma.client.update as jest.Mock).mock.calls[0][0]).toMatchObject({
      where: { id: 'b' },
      data: { groupId: 'g1', clientRef: 'CL-945-G1-02' },
    });
  });

  it('gives a leaving member its own plain id back rather than a new number', async () => {
    (prisma.client.findFirst as jest.Mock).mockImplementation(({ where }: any) =>
      Promise.resolve(where?.clientRef
        ? null                                               // CL-946 is free, as it must be
        : { id: 'c', clientRef: 'CL-946-G1-03' })
    );

    await removeMember('g1', 'c');

    expect((prisma.client.update as jest.Mock).mock.calls[0][0]).toMatchObject({
      where: { id: 'c' },
      data: { groupId: null, clientRef: 'CL-946' },
    });
    // No number was consumed on the way out.
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
