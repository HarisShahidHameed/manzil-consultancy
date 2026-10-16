jest.mock('../config/database', () => ({
  prisma: {
    client: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    visaCase: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    clientGroup: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

import { prisma } from '../config/database';
import { bulkImportClients, createClient, findClientByPassport, listClients, updateClient } from './client.service';
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
  it('orders by latest intake, then received date, then descending numeric client id', async () => {
    await listClients(1, 20);

    expect((prisma.client.findMany as jest.Mock).mock.calls[0][0].orderBy).toEqual([
      // Latest intake first, so a returning client's new case brings them back up (Q11).
      { lastIntakeDate: { sort: 'desc', nulls: 'last' } },
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

// Group members share ONE number (16 Oct 2026, the client's own format): CL-942-G1-01,
// CL-942-G1-02, ... Only the member position differs. A number given up by an existing
// client joining a group is pooled and reused, so the sequence never looks like it skipped.
// See utils/clientRef.ts.
const rawQuery = prisma.$queryRaw as unknown as jest.Mock;
const rawExec = prisma.$executeRaw as unknown as jest.Mock;
// generateClientRef asks the pool first, then falls back to MAX+1.
const mockNumbering = (pooled: number[], next: number) =>
  rawQuery.mockImplementation((strings: TemplateStringsArray) => {
    if (strings.join('').includes('DELETE FROM "client_number_pool"')) {
      const n = pooled.shift();
      return Promise.resolve(n == null ? [] : [{ number: n }]);
    }
    return Promise.resolve([{ next }]);
  });
// The numbers releaseClientNumber offered back to the pool, in order.
const released = () => rawExec.mock.calls.map((c) => c[1]);

describe('client ids — numbering', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reuses a number freed by grouping before moving the counter on', async () => {
    mockNumbering([945], 960);
    expect(await generateClientRef()).toBe('CL-945');
    expect(await generateClientRef()).toBe('CL-960');
  });

  it('falls back to a numeric MAX+1', async () => {
    mockNumbering([], 947);
    await generateClientRef();
    const sql = (rawQuery.mock.calls[1][0] as string[]).join('');
    // The numeric CAST is what keeps CL-9000 from sorting below CL-101.
    expect(sql).toMatch(/MAX\(CAST\(SUBSTRING/);
  });
});

describe('group refs — one shared number per group', () => {
  const refsWritten = () =>
    (prisma.client.update as jest.Mock).mock.calls.map((c) => [c[0].where.id, c[0].data.clientRef]);

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.client.update as jest.Mock).mockResolvedValue({});
    mockNumbering([], 999);
  });

  it('puts grouped 942/945/946 all on 942 and frees 945 and 946 for reuse', async () => {
    (prisma.client.findMany as jest.Mock).mockResolvedValue([
      { id: 'a', clientRef: 'CL-942' },
      { id: 'b', clientRef: 'CL-945' },
      { id: 'c', clientRef: 'CL-946' },
    ]);

    expect(await backfillGroupMembers('group-1', 'GRP-001')).toBe(942);
    expect(refsWritten()).toEqual([
      ['a', 'CL-942-G1-01'],
      ['b', 'CL-942-G1-02'],
      ['c', 'CL-942-G1-03'],
    ]);
    expect(released()).toEqual([945, 946]);
  });

  it('converts a Sep-2026 group whose members each had a number onto the first member\'s', async () => {
    (prisma.client.findMany as jest.Mock).mockResolvedValue([
      { id: 'b', clientRef: 'CL-951-G2-02' },
      { id: 'a', clientRef: 'CL-950-G2-01' },
    ]);

    expect(await backfillGroupMembers('group-2', 'GRP-002')).toBe(950);
    expect(refsWritten()).toEqual([['b', 'CL-950-G2-02']]);
    expect(released()).toEqual([951]);
  });

  it('leaves an already-consistent group untouched on a rename', async () => {
    (prisma.client.findMany as jest.Mock).mockResolvedValue([
      { id: 'a', clientRef: 'CL-942-G1-01' },
      { id: 'b', clientRef: 'CL-942-G1-02' },
    ]);

    await backfillGroupMembers('group-1', 'GRP-001');
    expect(prisma.client.update).not.toHaveBeenCalled();
    expect(rawExec).not.toHaveBeenCalled();
  });

  it('upgrades legacy-format refs in place, keeping the number and positions', async () => {
    (prisma.client.findMany as jest.Mock).mockResolvedValue([
      { id: 'a', clientRef: 'CL-110-Khan-1' },
      { id: 'b', clientRef: 'CL-110-GRP-002-2' },
    ]);

    await backfillGroupMembers('group-1', 'GRP-002');
    expect(refsWritten()).toEqual([
      ['a', 'CL-110-G2-01'],
      ['b', 'CL-110-G2-02'],
    ]);
    expect(released()).toEqual([]);
  });

  it('a member moving in from another group takes this group\'s number; a contested position moves on', async () => {
    (prisma.client.findMany as jest.Mock).mockResolvedValue([
      { id: 'a', clientRef: 'CL-942-G1-01' },
      { id: 'b', clientRef: 'CL-950-G7-02' },
      { id: 'c', clientRef: 'CL-950-G7-02' },
    ]);

    await backfillGroupMembers('group-1', 'GRP-001');
    expect(refsWritten()).toEqual([
      ['b', 'CL-942-G1-02'],
      ['c', 'CL-942-G1-03'],
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
    mockNumbering([], 999);
  });

  it('an added client takes the group\'s number and the next position, freeing its own', async () => {
    (prisma.client.findMany as jest.Mock).mockImplementation(({ where }: any) =>
      Promise.resolve(where?.id?.in
        ? [{ id: 'b', clientRef: 'CL-945' }]                 // the incoming client
        : [{ id: 'a', clientRef: 'CL-942-G1-01' }])          // the group as it stands
    );

    await addMembers('g1', ['b']);

    expect((prisma.client.update as jest.Mock).mock.calls[0][0]).toMatchObject({
      where: { id: 'b' },
      data: { groupId: 'g1', clientRef: 'CL-942-G1-02' },
    });
    expect(released()).toEqual([945]);
  });

  it('a new client created into a group shares its number and consumes none', async () => {
    (prisma.client.findMany as jest.Mock).mockResolvedValue([
      { id: 'a', clientRef: 'CL-942-G1-01' },
      { id: 'b', clientRef: 'CL-942-G1-02' },
    ]);
    (prisma.client.create as jest.Mock).mockImplementation(({ data }: any) => Promise.resolve({ id: 'n', ...data }));

    await createClient({ ...baseRow(), groupId: 'g1' });

    expect((prisma.client.create as jest.Mock).mock.calls[0][0].data.clientRef).toBe('CL-942-G1-03');
    expect(rawQuery).not.toHaveBeenCalled(); // no number drawn
  });

  it('a leaver gets a number of its own while the group keeps the shared one', async () => {
    (prisma.client.findFirst as jest.Mock).mockImplementation(({ where }: any) =>
      Promise.resolve(where?.clientRefNum
        ? { id: 'a' }                                        // 942 is still the group's
        : { id: 'c', clientRef: 'CL-942-G1-03' })
    );
    mockNumbering([945], 999);

    await removeMember('g1', 'c');

    expect((prisma.client.update as jest.Mock).mock.calls[0][0]).toMatchObject({
      where: { id: 'c' },
      data: { groupId: null, clientRef: 'CL-945' }, // a reused number, not a skip
    });
  });

  it('the last member out keeps the number as a plain id', async () => {
    (prisma.client.findFirst as jest.Mock).mockImplementation(({ where }: any) =>
      Promise.resolve(where?.clientRefNum ? null : { id: 'a', clientRef: 'CL-942-G1-01' })
    );

    await removeMember('g1', 'a');

    expect((prisma.client.update as jest.Mock).mock.calls[0][0].data.clientRef).toBe('CL-942');
    expect(rawQuery).not.toHaveBeenCalled();
  });
});

// 1 Oct 2026 #10 — listings order by the case's own received date, so correcting the client's
// received date must still move the case that was received with them (and only that one).
describe('updateClient received date', () => {
  beforeEach(() => jest.clearAllMocks());

  it('moves the case dated with the client, leaving later cases on their own dates', async () => {
    (prisma.visaCase.findMany as jest.Mock).mockResolvedValue([{ stage: 'APPOINTMENT' }]);
    (prisma.client.findUnique as jest.Mock).mockResolvedValue({ receivedDate: new Date('2025-01-01') });
    (prisma.client.update as jest.Mock).mockResolvedValue({ id: 'c1' });

    await updateClient('c1', { receivedDate: '2025-01-05' });

    expect(prisma.visaCase.updateMany).toHaveBeenCalledWith({
      where: { clientId: 'c1', receivedDate: new Date('2025-01-01') },
      data: { receivedDate: new Date('2025-01-05') },
    });
  });
});
