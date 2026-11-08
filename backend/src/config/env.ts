import { z } from 'zod';

// Email settings can never stop the server: none is required, and `SMTP_HOST=` left blank in a
// .env file counts as not set, the same as the line being absent.
const emailSetting = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(v => (typeof v === 'string' && v.trim() === '' ? undefined : v), schema);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('5000').transform(Number),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  COOKIE_SECRET: z.string().min(32),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  MAX_FAILED_ATTEMPTS: z.string().default('5').transform(Number),
  LOCKOUT_DURATION_MINUTES: z.string().default('30').transform(Number),
  // Client emails. Off unless explicitly switched on: see utils/mailer.ts.
  EMAIL_ENABLED: emailSetting(z.string().default('false').transform(v => v === 'true')),
  EMAIL_REMINDERS_ENABLED: emailSetting(z.string().default('false').transform(v => v === 'true')),
  SMTP_HOST: emailSetting(z.string().default('smtp.hostinger.com')),
  SMTP_PORT: emailSetting(z.string().default('465').transform(Number)),
  SMTP_USER: emailSetting(z.string().optional()),
  SMTP_PASS: emailSetting(z.string().optional()),
  EMAIL_FROM: emailSetting(z.string().default('Manzil Consultancy <info@manzilconsultancy.com>')),
  EMAIL_REPLY_TO: emailSetting(z.string().default('visa@manzilconsultancy.com')),
  EMAIL_REDIRECT_TO: emailSetting(z.string().optional()),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  parsed.error.issues.forEach(issue => {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

export const env = parsed.data;
