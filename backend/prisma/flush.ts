import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Every app table (schema.prisma `@@map` names). A single combined TRUNCATE handles
// FK ordering itself — CASCADE also catches anything not listed here, so this doesn't
// need to be kept in strict dependency order, just kept in sync with schema.prisma.
const TABLES = [
  'audit_logs', 'refresh_tokens', 'user_roles', 'role_permissions',
  'invoices', 'visa_cases', 'clients', 'client_groups',
  'api_keys', 'permissions', 'roles', 'users',
];

// Defense in depth: this is only ever meant to run from the flush-db.yml workflow
// (after its own confirmation-phrase + backup steps), or a developer deliberately
// wiping their own local/dev database — never by a bare `ts-node prisma/flush.ts`.
const CONFIRM_TOKEN = 'YES_FLUSH_THIS_DATABASE';

async function main() {
  if (process.env.CONFIRM_FLUSH !== CONFIRM_TOKEN) {
    console.error(
      `Refusing to flush: set CONFIRM_FLUSH=${CONFIRM_TOKEN} to proceed. ` +
      'This truncates every table — there is no undo outside of a restored backup.'
    );
    process.exit(1);
  }

  const tableList = TABLES.map(t => `"${t}"`).join(', ');
  console.log(`Truncating: ${TABLES.join(', ')}`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE;`);
  console.log('Database flushed.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
