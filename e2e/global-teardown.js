const { execSync } = require('child_process');
const path = require('path');

module.exports = () => {
  const composeFile = path.join(__dirname, 'docker-compose.yml');
  try {
    execSync(`docker compose -f "${composeFile}" down -v`, { stdio: 'inherit' });
  } catch {
    // best-effort cleanup — don't fail the test run over teardown issues
  }
};
