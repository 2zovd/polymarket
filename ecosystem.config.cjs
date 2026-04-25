// PM2 process manager config for the copy trading monitor + data collectors.
// Run:  pm2 start ecosystem.config.cjs
//       pm2 save && pm2 startup   (auto-restart on reboot)
//       pm2 logs polymarket-monitor
//       pm2 logs polymarket-cron
//       pm2 stop all
module.exports = {
  apps: [
    {
      name: 'polymarket-monitor',
      // tsx's actual JS entry point — PM2 can't run the bash shim in node_modules/.bin/
      script: './node_modules/tsx/dist/cli.mjs',
      args: 'src/index.ts copy start',
      cwd: __dirname,
      watch: false,
      // Restart if the process crashes; back off after 10 consecutive failures
      restart_delay: 5_000,
      max_restarts: 10,
      min_uptime: '10s',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'polymarket-cron',
      script: './node_modules/tsx/dist/cli.mjs',
      args: 'src/index.ts cron',
      cwd: __dirname,
      watch: false,
      restart_delay: 10_000,
      max_restarts: 10,
      min_uptime: '10s',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
