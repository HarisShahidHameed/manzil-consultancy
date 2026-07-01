const { execSync } = require('child_process');
const path = require('path');

const BACKEND = path.join(__dirname, '..', 'backend');
const COMPOSE_FILE = path.join(__dirname, 'docker-compose.yml');

const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });

const sleep = (ms) => execSync(`node -e "setTimeout(()=>{},${ms})"`);

const waitForPostgres = (retries = 30) => {
  for (let i = 0; i < retries; i++) {
    try {
      execSync('docker exec manzil-e2e-pg pg_isready -U postgres', { stdio: 'ignore' });
      return;
    } catch {
      sleep(1000);
    }
  }
  throw new Error('[e2e] Postgres did not become ready in time');
};

console.log('[e2e] Starting Postgres test database...');
run(`docker compose -f "${COMPOSE_FILE}" up -d`);
waitForPostgres();

console.log('[e2e] Pushing Prisma schema to the test database...');
run('npx prisma db push --force-reset --accept-data-loss --skip-generate', { cwd: BACKEND });

console.log('[e2e] Seeding roles, permissions, and test users...');
run('npx ts-node prisma/seed.ts', { cwd: BACKEND });

console.log('[e2e] Test database ready.');
