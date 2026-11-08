import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';

export type MailStatus = { enabled: true } | { enabled: false; reason: string };

// Sending has to be switched on deliberately. Outside production it also needs a redirect
// address, because a development database can hold real client records.
export const mailStatus = (): MailStatus => {
  if (!env.EMAIL_ENABLED) return { enabled: false, reason: 'Email sending is switched off (EMAIL_ENABLED)' };
  if (!env.SMTP_USER || !env.SMTP_PASS) return { enabled: false, reason: 'SMTP_USER or SMTP_PASS is not set' };
  if (!Number.isInteger(env.SMTP_PORT) || env.SMTP_PORT < 1 || env.SMTP_PORT > 65535) {
    return { enabled: false, reason: 'SMTP_PORT is not a valid port number' };
  }
  if (env.NODE_ENV !== 'production' && !env.EMAIL_REDIRECT_TO) {
    return { enabled: false, reason: 'EMAIL_REDIRECT_TO is required outside production' };
  }
  return { enabled: true };
};

let transporter: Transporter | null = null;
const getTransporter = (): Transporter => {
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 15_000,
    socketTimeout: 60_000,
  });
  return transporter;
};

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}

export const sendMail = async (mail: OutgoingMail): Promise<void> => {
  const redirect = env.EMAIL_REDIRECT_TO;
  await getTransporter().sendMail({
    from: env.EMAIL_FROM,
    replyTo: env.EMAIL_REPLY_TO,
    ...mail,
    to: redirect || mail.to,
    subject: redirect ? `[TEST for ${mail.to}] ${mail.subject}` : mail.subject,
  });
};
