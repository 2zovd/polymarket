#!/usr/bin/env node

import { createRequire } from 'node:module';
import { Command } from 'commander';
import { registerMarketsCommand } from './commands/markets.js';
import { registerOrderbookCommand } from './commands/orderbook.js';
import { registerOrdersCommand } from './commands/orders.js';
import { registerWalletCommand } from './commands/wallet.js';
import { logger } from './lib/logger.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const program = new Command();

program
  .name('polymarket')
  .description('Polymarket research and automation toolkit')
  .version(pkg.version);

registerMarketsCommand(program);
registerOrderbookCommand(program);
registerOrdersCommand(program);
registerWalletCommand(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  logger.fatal({ err }, 'Unhandled CLI error');
  process.exit(1);
});
