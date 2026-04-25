import type { Command } from 'commander';
import { createDataApiClient } from '../api/data.js';
import { createGammaClient } from '../api/gamma.js';
import { startCron } from '../cron.js';
import { createDb } from '../db/index.js';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';

export function registerCronCommand(program: Command): void {
  program
    .command('cron')
    .description(
      'Start all data collectors on a schedule (markets/30min, trades/15min, positions/1h)',
    )
    .action(() => {
      const gamma = createGammaClient(config, logger);
      const dataApi = createDataApiClient(config, logger);
      const db = createDb(config.databasePath);

      startCron(gamma, dataApi, db, logger, config.duneApiKey);

      process.on('SIGINT', () => {
        logger.info('Shutting down cron scheduler');
        process.exit(0);
      });
      process.on('SIGTERM', () => {
        logger.info('Shutting down cron scheduler');
        process.exit(0);
      });
    });
}
