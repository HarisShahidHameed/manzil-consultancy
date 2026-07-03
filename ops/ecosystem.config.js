// PM2 process definition for the backend API.
// Deployed to <deploy-path>/current/ops/ecosystem.config.js and started with:
//   pm2 start ops/ecosystem.config.js
// from inside the release's `backend` working directory (see scripts/remote-deploy.sh).
module.exports = {
  apps: [
    {
      name: 'manzil-backend',
      script: './dist/app.js',
      cwd: __dirname + '/../backend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '400M',
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 10,
      out_file: '/opt/manzil/shared/logs/backend-out.log',
      error_file: '/opt/manzil/shared/logs/backend-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
