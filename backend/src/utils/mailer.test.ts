const mockEnv: Record<string, unknown> = {};
jest.mock('../config/env', () => ({ env: mockEnv }));

import { mailStatus } from './mailer';

const READY = { NODE_ENV: 'production', EMAIL_ENABLED: true, SMTP_PORT: 465, SMTP_USER: 'u', SMTP_PASS: 'p' };

describe('mailStatus', () => {
  beforeEach(() => {
    Object.keys(mockEnv).forEach(k => delete mockEnv[k]);
    Object.assign(mockEnv, READY);
  });

  it('allows sending when everything is set', () => {
    expect(mailStatus()).toEqual({ enabled: true });
  });

  it.each([
    ['EMAIL_ENABLED is off', { EMAIL_ENABLED: false }],
    ['SMTP_USER is missing', { SMTP_USER: undefined }],
    ['SMTP_PASS is missing', { SMTP_PASS: undefined }],
    ['SMTP_PORT is not a number', { SMTP_PORT: NaN }],
    ['SMTP_PORT is out of range', { SMTP_PORT: 70000 }],
    ['there is no redirect outside production', { NODE_ENV: 'development' }],
  ])('refuses to send when %s', (_label, change) => {
    Object.assign(mockEnv, change);
    expect(mailStatus().enabled).toBe(false);
  });
});

describe('env', () => {
  const REQUIRED = {
    DATABASE_URL: 'postgresql://x', JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32), COOKIE_SECRET: 'c'.repeat(32),
  };
  const original = process.env;

  afterEach(() => { process.env = original; });

  const loadEnv = (vars: Record<string, string>) => {
    process.env = { ...REQUIRED, ...vars } as NodeJS.ProcessEnv;
    let env: any;
    jest.isolateModules(() => {
      jest.unmock('../config/env');
      env = jest.requireActual('../config/env').env;
    });
    return env;
  };

  it('starts with no email settings at all, with sending off', () => {
    const env = loadEnv({});
    expect(env.EMAIL_ENABLED).toBe(false);
    expect(env.SMTP_USER).toBeUndefined();
  });

  it('treats blank email settings as not set', () => {
    const env = loadEnv({ EMAIL_ENABLED: '', SMTP_HOST: ' ', SMTP_PORT: '', SMTP_USER: '', SMTP_PASS: '', EMAIL_FROM: '' });
    expect(env.EMAIL_ENABLED).toBe(false);
    expect(env.SMTP_HOST).toBe('smtp.hostinger.com');
    expect(env.SMTP_PORT).toBe(465);
    expect(env.SMTP_PASS).toBeUndefined();
    expect(env.EMAIL_FROM).toContain('info@manzilconsultancy.com');
  });

  it('does not stop the server over a bad port', () => {
    expect(loadEnv({ SMTP_PORT: 'abc' }).SMTP_PORT).toBeNaN();
  });
});
