import fs from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';

jest.mock('../config/database', () => ({
  prisma: {
    visaCase: { findUnique: jest.fn(), findMany: jest.fn() },
    emailLog: {
      findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(),
      create: jest.fn(), createMany: jest.fn(), update: jest.fn(), updateMany: jest.fn(),
    },
  },
}));
jest.mock('../config/env', () => ({
  env: { NODE_ENV: 'production', EMAIL_ENABLED: true, EMAIL_REMINDERS_ENABLED: true, SMTP_USER: 'u', SMTP_PASS: 'p' },
}));
jest.mock('../config/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));
jest.mock('../utils/mailer', () => ({ mailStatus: jest.fn(), sendMail: jest.fn() }));

import { prisma } from '../config/database';
import { env } from '../config/env';
import { mailStatus, sendMail } from '../utils/mailer';
import { fillTemplateXml } from '../utils/clientDocuments';
import {
  attemptSend, buildMail, clientReference, evaluate, EmailCase, isCheckInEmailDue, isHotelEmailDue, retryEmail, runEmailTick,
} from './clientEmail.service';

const db = prisma as unknown as {
  visaCase: Record<string, jest.Mock>;
  emailLog: Record<string, jest.Mock>;
};

const NOW = new Date('2026-11-10T12:00:00.000Z');

const makeCase = (over: Partial<EmailCase> = {}): EmailCase => ({
  id: 'case-1', stage: 'APPOINTMENT', onHold: false, destination: 'France', visaType: 'Tourist',
  receivedDate: new Date('2026-11-01'), charges: 500 as any, discount: 50 as any, advance: 100 as any,
  welcomeEmailEligible: true, hotelCancellationDate: null, flightDateTime: null,
  client: {
    clientRef: 'CL-953', firstName: 'Sara', lastName: 'Khan', email: 'sara@example.com',
    addressStreet: '1 High St & Co', addressCity: 'Leeds', addressShire: null, addressPostalCode: 'LS1', addressCountry: null,
  },
  ...over,
} as EmailCase);

beforeEach(() => {
  jest.resetAllMocks();
  (mailStatus as jest.Mock).mockReturnValue({ enabled: true });
  db.emailLog.findUnique.mockResolvedValue(null);
  db.emailLog.create.mockResolvedValue({ id: 'log-1' });
  db.emailLog.update.mockResolvedValue({});
  db.emailLog.updateMany.mockResolvedValue({ count: 0 });
  db.emailLog.findMany.mockResolvedValue([]);
  db.visaCase.findMany.mockResolvedValue([]);
  (env as any).EMAIL_REMINDERS_ENABLED = true;
});

describe('clientReference', () => {
  it('builds the MNZ reference from the CRM number and received year', () => {
    expect(clientReference('CL-953', new Date('2026-03-01'))).toBe('MNZ-2026-0953');
    expect(clientReference('CL-1204', new Date('2027-01-01'))).toBe('MNZ-2027-1204');
  });
  it('gives group members the group number', () => {
    expect(clientReference('CL-942-G1-02', new Date('2026-03-01'))).toBe('MNZ-2026-0942');
  });
  it('falls back to the CRM ref when it carries no number', () => {
    expect(clientReference('LEGACY', new Date('2026-03-01'))).toBe('LEGACY');
  });
});

describe('welcome email eligibility', () => {
  it('is due once a new client has an email, charges and one destination', () => {
    expect(evaluate('WELCOME', makeCase(), NOW)?.dedupeKey).toBe('case-1:WELCOME');
  });
  it.each([
    ['an imported, existing or later case', { welcomeEmailEligible: false }],
    ['no charges', { charges: null }],
    ['zero charges', { charges: 0 as any }],
    ['an undecided destination', { destination: null }],
    ['a cancelled case', { stage: 'CANCELLED' as const }],
  ])('is not due with %s', (_label, over) => {
    expect(evaluate('WELCOME', makeCase(over as Partial<EmailCase>), NOW)).toBeNull();
  });
  it('is not due without a client email', () => {
    const c = makeCase();
    c.client.email = null;
    expect(evaluate('WELCOME', c, NOW)).toBeNull();
  });
});

describe('reminder timing', () => {
  const day = new Date('2026-11-10T00:00:00.000Z');

  it('sends the hotel email from 09:00 UK time on the date', () => {
    expect(isHotelEmailDue(day, new Date('2026-11-10T08:59:00.000Z'))).toBe(false);
    expect(isHotelEmailDue(day, new Date('2026-11-10T09:00:00.000Z'))).toBe(true);
  });
  it('uses UK summer time', () => {
    const summer = new Date('2026-07-10T00:00:00.000Z');
    expect(isHotelEmailDue(summer, new Date('2026-07-10T07:59:00.000Z'))).toBe(false);
    expect(isHotelEmailDue(summer, new Date('2026-07-10T08:00:00.000Z'))).toBe(true);
  });
  it('catches up the next day but not after that', () => {
    expect(isHotelEmailDue(day, new Date('2026-11-11T02:00:00.000Z'))).toBe(true);
    expect(isHotelEmailDue(day, new Date('2026-11-12T10:00:00.000Z'))).toBe(false);
  });
  it('sends the check-in email in the 24 hours before the flight only', () => {
    const flight = new Date('2026-11-11T12:00:00.000Z');
    expect(isCheckInEmailDue(flight, new Date('2026-11-10T11:59:00.000Z'))).toBe(false);
    expect(isCheckInEmailDue(flight, new Date('2026-11-10T12:00:00.000Z'))).toBe(true);
    expect(isCheckInEmailDue(flight, new Date('2026-11-11T12:00:00.000Z'))).toBe(false);
  });
  it('holds reminders on a paused case and keys them to the date', () => {
    const flightDateTime = new Date('2026-11-11T06:00:00.000Z');
    expect(evaluate('FLIGHT_CHECKIN', makeCase({ flightDateTime, onHold: true }), NOW)).toBeNull();
    expect(evaluate('FLIGHT_CHECKIN', makeCase({ flightDateTime }), NOW)?.dedupeKey)
      .toBe(`case-1:FLIGHT_CHECKIN:${flightDateTime.toISOString()}`);
  });
  it('still reminds a client whose case has completed, since travel comes after', () => {
    const flightDateTime = new Date('2026-11-11T06:00:00.000Z');
    expect(evaluate('FLIGHT_CHECKIN', makeCase({ flightDateTime, stage: 'COMPLETED' }), NOW)).not.toBeNull();
  });
});

describe('attemptSend', () => {
  beforeEach(() => {
    db.visaCase.findUnique.mockResolvedValue(makeCase());
    (sendMail as jest.Mock).mockResolvedValue(undefined);
  });

  it('sends with the filled documents and the Terms attached and records it', async () => {
    await attemptSend('case-1', 'WELCOME', NOW);
    const mail = (sendMail as jest.Mock).mock.calls[0][0];
    expect(mail.to).toBe('sara@example.com');
    expect(mail.subject).toBe('Welcome to Manzil Consultancy® — Your France Visa Application | Ref: MNZ-2026-0953');
    expect(mail.attachments.map((a: { filename: string }) => a.filename)).toEqual([
      'Manzil_Client_Care_Letter_MNZ-2026-0953.docx',
      'Manzil_Client_Declaration_MNZ-2026-0953.docx',
      'Manzil_Standard_Terms_of_Business.pdf',
    ]);
    expect(mail.attachments[2].content.subarray(0, 5).toString()).toBe('%PDF-');
    expect(db.emailLog.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SENT' }),
    }));
  });

  it('does not send an email that has already been sent', async () => {
    db.emailLog.findUnique.mockResolvedValue({ id: 'log-1', status: 'SENT', attempts: 1 });
    await attemptSend('case-1', 'WELCOME', NOW);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('does not send when another caller wins the race to create the row', async () => {
    db.emailLog.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    await attemptSend('case-1', 'WELCOME', NOW);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('records a failure without throwing', async () => {
    (sendMail as jest.Mock).mockRejectedValue(new Error('SMTP down'));
    await expect(attemptSend('case-1', 'WELCOME', NOW)).resolves.toBeUndefined();
    expect(db.emailLog.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'FAILED', error: 'SMTP down' },
    }));
  });

  it('waits out the backoff before retrying a failure', async () => {
    db.emailLog.findUnique.mockResolvedValue({
      id: 'log-1', status: 'FAILED', attempts: 1, lastAttemptAt: new Date(NOW.getTime() - 60_000),
    });
    await attemptSend('case-1', 'WELCOME', NOW);
    expect(db.emailLog.updateMany).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('retries a failure after the backoff', async () => {
    db.emailLog.findUnique.mockResolvedValue({
      id: 'log-1', status: 'FAILED', attempts: 1, lastAttemptAt: new Date(NOW.getTime() - 16 * 60_000),
    });
    db.emailLog.updateMany.mockResolvedValue({ count: 1 });
    await attemptSend('case-1', 'WELCOME', NOW);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('records a skip instead of sending while mail is off', async () => {
    (mailStatus as jest.Mock).mockReturnValue({ enabled: false, reason: 'off' });
    await attemptSend('case-1', 'WELCOME', NOW);
    expect(sendMail).not.toHaveBeenCalled();
    expect(db.emailLog.createMany.mock.calls[0][0].data[0]).toMatchObject({ status: 'SKIPPED', error: 'off' });
  });

  it('sends no reminder until reminders are approved and switched on', async () => {
    (env as any).EMAIL_REMINDERS_ENABLED = false;
    db.visaCase.findUnique.mockResolvedValue(makeCase({ flightDateTime: new Date('2026-11-11T06:00:00.000Z') }));
    await attemptSend('case-1', 'FLIGHT_CHECKIN', NOW);
    expect(sendMail).not.toHaveBeenCalled();
    expect(db.emailLog.create).not.toHaveBeenCalled();
  });
});

describe('retryEmail', () => {
  it('refuses an email that was already sent', async () => {
    db.emailLog.findFirst.mockResolvedValue({ id: 'log-1', status: 'SENT', type: 'WELCOME' });
    await expect(retryEmail('case-1', 'log-1')).rejects.toThrow('Only a failed or skipped');
  });

  it('refuses a reminder whose date has since changed', async () => {
    db.emailLog.findFirst.mockResolvedValue({
      id: 'log-1', status: 'FAILED', type: 'FLIGHT_CHECKIN', dedupeKey: 'case-1:FLIGHT_CHECKIN:old',
    });
    db.visaCase.findUnique.mockResolvedValue(makeCase({ flightDateTime: new Date(Date.now() + 3_600_000) }));
    await expect(retryEmail('case-1', 'log-1')).rejects.toThrow('no longer due');
  });
});

describe('runEmailTick', () => {
  it('marks an interrupted send as failed and does not retry it', async () => {
    (mailStatus as jest.Mock).mockReturnValue({ enabled: false, reason: 'off' });
    await runEmailTick(NOW);
    expect(db.emailLog.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'FAILED', attempts: 5 });
  });

  it('asks only for reminders inside their windows', async () => {
    await runEmailTick(NOW);
    const [hotelQuery, flightQuery] = db.visaCase.findMany.mock.calls.map(call => call[0].where);
    expect(hotelQuery.hotelCancellationDate).toEqual({
      gte: new Date('2026-11-09T00:00:00.000Z'), lte: new Date('2026-11-10T00:00:00.000Z'),
    });
    expect(flightQuery.flightDateTime).toEqual({ gt: NOW, lte: new Date('2026-11-11T12:00:00.000Z') });
  });
});

describe('document templates', () => {
  const documentXml = async (name: string) => {
    const zip = await JSZip.loadAsync(await fs.readFile(path.resolve(__dirname, '../../assets/email', name)));
    return zip.file('word/document.xml')!.async('string');
  };
  const fields = {
    clientName: 'Sara Khan', reference: 'MNZ-2026-0953', address: '1 High St &amp; Co'.replace('&amp;', '&'),
    date: '10-11-2026', visaType: 'Tourist', country: 'France', fee: '£450.00', paymentOnAccount: '£100.00',
  };

  it('fills every placeholder in the care letter, with amounts in the right places', async () => {
    const text = fillTemplateXml(await documentXml('Manzil_Client_Care_Letter_v2.docx'), fields).replace(/<[^>]+>/g, '');
    expect(text).not.toMatch(/\[[A-Za-z]/);
    expect(text).toContain('Client Name: Sara Khan');
    expect(text).toContain('Client Reference: MNZ-2026-0953');
    expect(text).toContain('Address: 1 High St &amp; Co');
    expect(text).toContain('Dear Sara Khan,');
    expect(text).toContain('Professional Fee: £450.00');
    expect(text).toContain('Total: £450.00');
    expect(text).toContain('Your case relates to: Tourist');
    expect(text).toContain('you wish to apply for a Tourist visa and require');
    expect(text.indexOf('£100.00')).toBeGreaterThan(text.indexOf('Payment on Account'));
  });

  it('fills the declaration, leaving the signature lines blank', async () => {
    const text = fillTemplateXml(await documentXml('Manzil_Client_Declaration_v2.docx'), fields).replace(/<[^>]+>/g, '');
    expect(text).not.toMatch(/\[[A-Za-z]/);
    expect(text).toContain('Client Reference: MNZ-2026-0953');
    expect(text).toContain('my Tourist visa application for France');
    expect(text).toContain('Signature:  ______');
  });

  it('reads naturally when no visa type was recorded', async () => {
    const text = fillTemplateXml(await documentXml('Manzil_Client_Care_Letter_v2.docx'), { ...fields, visaType: 'Visa' }).replace(/<[^>]+>/g, '');
    expect(text).toContain('you wish to apply for a visa and require');
  });

  it('refuses to produce a document with a placeholder left in it', () => {
    expect(() => fillTemplateXml('<w:t>[Destination Country) and [Amount]</w:t>', fields)).toThrow('unfilled placeholder');
  });
});

describe('buildMail reminders', () => {
  it('shows the flight time in UK time', async () => {
    const mail = await buildMail('FLIGHT_CHECKIN', makeCase({ flightDateTime: new Date('2026-07-11T06:30:00.000Z') }), 'a@b.c', NOW);
    expect(mail.text).toContain('11/07/2026 07:30 (UK time)');
  });
  it('shows the hotel date as entered', async () => {
    const mail = await buildMail('HOTEL_CANCELLATION', makeCase({ hotelCancellationDate: new Date('2026-11-10T00:00:00.000Z') }), 'a@b.c', NOW);
    expect(mail.text).toContain('10-11-2026');
    expect(mail.attachments).toBeUndefined();
  });
});
