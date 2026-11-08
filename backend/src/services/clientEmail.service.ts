import { EmailType, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { refNumber } from '../utils/clientRef';
import { buildWelcomeAttachments } from '../utils/clientDocuments';
import { flightCheckInEmail, hotelCancellationEmail, welcomeEmail } from '../utils/emailTemplates';
import { mailStatus, OutgoingMail, sendMail } from '../utils/mailer';

const TICK_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = 15 * 60_000;
const STALE_PENDING_MS = 15 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const HOTEL_SEND_HOUR = 9;
const UK_TIME_ZONE = 'Europe/London';

const CASE_SELECT = {
  id: true, stage: true, onHold: true, destination: true, visaType: true, receivedDate: true,
  charges: true, discount: true, advance: true, welcomeEmailEligible: true,
  hotelCancellationDate: true, flightDateTime: true,
  client: {
    select: {
      clientRef: true, firstName: true, lastName: true, email: true,
      addressStreet: true, addressCity: true, addressShire: true, addressPostalCode: true, addressCountry: true,
    },
  },
} satisfies Prisma.VisaCaseSelect;

export type EmailCase = Prisma.VisaCaseGetPayload<{ select: typeof CASE_SELECT }>;

// The reference shown to clients is built from the CRM number, so CL-953 received in 2026 is
// MNZ-2026-0953. It needs no second counter, and group members share it like their CL number.
export const clientReference = (clientRef: string, receivedDate: Date): string => {
  const number = refNumber(clientRef);
  return number == null
    ? clientRef
    : `MNZ-${receivedDate.getUTCFullYear()}-${String(number).padStart(4, '0')}`;
};

const ukParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: UK_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return { year: get('year'), month: get('month'), day: get('day'), hour: Number(get('hour')) % 24, minute: get('minute') };
};

const ukDay = (date: Date) => {
  const p = ukParts(date);
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
};

const formatDate = (date: Date) => {
  const p = ukParts(date);
  return `${p.day}-${p.month}-${p.year}`;
};

const formatDateTime = (date: Date) => {
  const p = ukParts(date);
  return `${p.day}/${p.month}/${p.year} ${String(p.hour).padStart(2, '0')}:${p.minute}`;
};

// Goes out from 09:00 UK time on the entered date. The day after is still allowed, so a server
// outage doesn't lose the email, but a date entered further in the past is not emailed at all.
export const isHotelEmailDue = (date: Date, now: Date): boolean => {
  const target = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const today = ukDay(now);
  return (today === target && ukParts(now).hour >= HOTEL_SEND_HOUR) || today === target + DAY_MS;
};

// Check-in opens 24 hours before the flight. Once the flight has left there is nothing to say.
export const isCheckInEmailDue = (flight: Date, now: Date): boolean =>
  now.getTime() >= flight.getTime() - DAY_MS && now.getTime() < flight.getTime();

export interface DueEmail { dedupeKey: string; scheduledFor: Date | null; recipient: string }

// The single answer to "should this email go out now?", for the triggers, the scheduler and
// the Retry button alike.
export const evaluate = (type: EmailType, c: EmailCase, now: Date): DueEmail | null => {
  const recipient = c.client.email;
  if (!recipient || c.stage === 'CANCELLED') return null;

  if (type === 'WELCOME') {
    // A shortlist of countries leaves `destination` empty, and the subject line needs one
    // country, so a shortlisted case waits until File Processing finalises it.
    if (!c.welcomeEmailEligible || !c.destination || !(Number(c.charges ?? 0) > 0)) return null;
    return { dedupeKey: `${c.id}:WELCOME`, scheduledFor: null, recipient };
  }

  if (c.onHold) return null;
  const date = type === 'HOTEL_CANCELLATION' ? c.hotelCancellationDate : c.flightDateTime;
  if (!date) return null;
  const due = type === 'HOTEL_CANCELLATION' ? isHotelEmailDue(date, now) : isCheckInEmailDue(date, now);
  return due ? { dedupeKey: `${c.id}:${type}:${date.toISOString()}`, scheduledFor: date, recipient } : null;
};

const clientName = (c: EmailCase) => `${c.client.firstName} ${c.client.lastName ?? ''}`.trim();
const formatMoney = (n: number) => `£${n.toFixed(2)}`;

export const buildMail = async (type: EmailType, c: EmailCase, recipient: string, now: Date): Promise<OutgoingMail> => {
  const reference = clientReference(c.client.clientRef, c.receivedDate);
  const name = clientName(c);
  const country = c.destination ?? 'your destination';

  if (type === 'WELCOME') {
    const fee = Math.max(Number(c.charges ?? 0) - Number(c.discount ?? 0), 0);
    const { addressStreet, addressCity, addressShire, addressPostalCode, addressCountry } = c.client;
    const attachments = await buildWelcomeAttachments({
      clientName: name,
      reference,
      address: [addressStreet, addressCity, addressShire, addressPostalCode, addressCountry].filter(Boolean).join(', '),
      date: formatDate(now),
      visaType: c.visaType?.trim() || 'Visa',
      country,
      fee: formatMoney(fee),
      paymentOnAccount: formatMoney(Number(c.advance ?? 0)),
    });
    return { to: recipient, ...welcomeEmail({ clientName: name, country, reference }), attachments };
  }
  if (type === 'HOTEL_CANCELLATION') {
    const date = c.hotelCancellationDate as Date;
    const shown = `${String(date.getUTCDate()).padStart(2, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${date.getUTCFullYear()}`;
    return { to: recipient, ...hotelCancellationEmail({ clientName: name, country, reference, date: shown }) };
  }
  return { to: recipient, ...flightCheckInEmail({ clientName: name, reference, flightTime: formatDateTime(c.flightDateTime as Date) }) };
};

// Takes the right to send this email. Only one caller can win: the row's unique key settles a
// first send, and the status check inside updateMany settles a retry. This is what stops the
// scheduler and a save, or two saves, from sending the same email twice.
const claim = async (caseId: string, type: EmailType, due: DueEmail, now: Date): Promise<string | null> => {
  const existing = await prisma.emailLog.findUnique({ where: { dedupeKey: due.dedupeKey } });
  if (!existing) {
    try {
      const created = await prisma.emailLog.create({
        data: {
          caseId, type, dedupeKey: due.dedupeKey, recipient: due.recipient,
          scheduledFor: due.scheduledFor, status: 'PENDING', attempts: 1, lastAttemptAt: now,
        },
      });
      return created.id;
    } catch (e: any) {
      if (e?.code === 'P2002') return null;
      throw e;
    }
  }
  const retryable = existing.status === 'FAILED' && existing.attempts < MAX_ATTEMPTS
    && (!existing.lastAttemptAt || now.getTime() - existing.lastAttemptAt.getTime() >= existing.attempts * RETRY_BACKOFF_MS);
  if (!retryable) return null;
  const won = await prisma.emailLog.updateMany({
    where: { id: existing.id, status: 'FAILED', attempts: existing.attempts },
    data: { status: 'PENDING', recipient: due.recipient, attempts: { increment: 1 }, lastAttemptAt: now },
  });
  return won.count === 1 ? existing.id : null;
};

export const attemptSend = async (caseId: string, type: EmailType, now = new Date()): Promise<void> => {
  if (type !== 'WELCOME' && !env.EMAIL_REMINDERS_ENABLED) return;
  const c = await prisma.visaCase.findUnique({ where: { id: caseId }, select: CASE_SELECT });
  if (!c) return;
  const due = evaluate(type, c, now);
  if (!due) return;

  // Recorded rather than dropped, so staff can see it and send it with Retry later. It is never
  // sent automatically once sending is switched on, which could be weeks later.
  const mail = mailStatus();
  if (!mail.enabled) {
    await prisma.emailLog.createMany({
      data: [{
        caseId, type, dedupeKey: due.dedupeKey, recipient: due.recipient,
        scheduledFor: due.scheduledFor, status: 'SKIPPED', error: mail.reason,
      }],
      skipDuplicates: true,
    });
    return;
  }

  const logId = await claim(caseId, type, due, now);
  if (!logId) return;
  try {
    await sendMail(await buildMail(type, c, due.recipient, now));
    await prisma.emailLog.update({ where: { id: logId }, data: { status: 'SENT', sentAt: new Date(), error: null } });
    logger.info('Client email sent', { caseId, type });
  } catch (e: any) {
    const error = String(e?.message ?? e).slice(0, 500);
    await prisma.emailLog.update({ where: { id: logId }, data: { status: 'FAILED', error } });
    logger.error('Client email failed', { caseId, type, error });
  }
};

// Fire-and-forget: a mail problem must never fail or slow down saving a client or case. Failures
// are recorded on the email log and retried by the scheduler.
export const triggerWelcome = (caseId: string): void => {
  attemptSend(caseId, 'WELCOME').catch(e => logger.error('Welcome email trigger failed', { caseId, error: e?.message }));
};

export const triggerWelcomeForClient = (clientId: string): void => {
  prisma.visaCase.findMany({ where: { clientId, welcomeEmailEligible: true }, select: { id: true } })
    .then(cases => cases.forEach(c => triggerWelcome(c.id)))
    .catch(e => logger.error('Welcome email trigger failed', { clientId, error: e?.message }));
};

export const listCaseEmails = (caseId: string) =>
  prisma.emailLog.findMany({
    where: { caseId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, type: true, recipient: true, status: true, error: true, scheduledFor: true, sentAt: true, createdAt: true },
  });

export class EmailRetryError extends Error {}

export const retryEmail = async (caseId: string, logId: string) => {
  const log = await prisma.emailLog.findFirst({ where: { id: logId, caseId } });
  if (!log) throw new EmailRetryError('Email not found on this case.');
  if (log.status !== 'FAILED' && log.status !== 'SKIPPED') throw new EmailRetryError('Only a failed or skipped email can be retried.');
  const mail = mailStatus();
  if (!mail.enabled) throw new EmailRetryError(`Email can't be sent yet: ${mail.reason}.`);
  const c = await prisma.visaCase.findUnique({ where: { id: caseId }, select: CASE_SELECT });
  const due = c && evaluate(log.type, c, new Date());
  if (!due || due.dedupeKey !== log.dedupeKey) throw new EmailRetryError('This email is no longer due for this case.');

  await prisma.emailLog.update({ where: { id: logId }, data: { status: 'FAILED', attempts: 0, lastAttemptAt: null } });
  await attemptSend(caseId, log.type);
  return prisma.emailLog.findUnique({ where: { id: logId } });
};

export const runEmailTick = async (now = new Date()): Promise<void> => {
  // A process that died mid-send leaves PENDING behind. The email may have gone, so this is
  // surfaced for staff to check instead of risking a duplicate.
  await prisma.emailLog.updateMany({
    where: { status: 'PENDING', lastAttemptAt: { lt: new Date(now.getTime() - STALE_PENDING_MS) } },
    data: { status: 'FAILED', attempts: MAX_ATTEMPTS, error: 'Interrupted during sending, so it may already have been delivered. Check before retrying.' },
  });
  if (!mailStatus().enabled) return;

  const retries = await prisma.emailLog.findMany({
    where: { type: 'WELCOME', status: 'FAILED', attempts: { lt: MAX_ATTEMPTS } },
    select: { caseId: true },
  });
  const jobs: { caseId: string; type: EmailType }[] = retries.map(r => ({ caseId: r.caseId, type: 'WELCOME' }));

  if (env.EMAIL_REMINDERS_ENABLED) {
    const active = { stage: { not: 'CANCELLED' as const }, onHold: false, client: { email: { not: null } } };
    const today = ukDay(now);
    const [hotels, flights] = await Promise.all([
      prisma.visaCase.findMany({
        where: { ...active, hotelCancellationDate: { gte: new Date(today - DAY_MS), lte: new Date(today) } },
        select: { id: true },
      }),
      prisma.visaCase.findMany({
        where: { ...active, flightDateTime: { gt: now, lte: new Date(now.getTime() + DAY_MS) } },
        select: { id: true },
      }),
    ]);
    hotels.forEach(c => jobs.push({ caseId: c.id, type: 'HOTEL_CANCELLATION' }));
    flights.forEach(c => jobs.push({ caseId: c.id, type: 'FLIGHT_CHECKIN' }));
  }

  // One at a time: the mailbox has a daily sending limit and SMTP has no use for a burst.
  for (const job of jobs) await attemptSend(job.caseId, job.type, now);
};

let timer: NodeJS.Timeout | null = null;

export const startEmailScheduler = (): void => {
  if (timer) return;
  const status = mailStatus();
  logger.info(status.enabled ? 'Client emails enabled' : `Client emails disabled: ${status.reason}`);
  const tick = () => runEmailTick().catch(e => logger.error('Email scheduler tick failed', { error: e?.message }));
  timer = setInterval(tick, TICK_MS);
  timer.unref();
  tick();
};
