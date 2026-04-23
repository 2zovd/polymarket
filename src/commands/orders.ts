import type { Command } from 'commander';
import { createClobClient } from '../api/clob.js';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';

export function registerOrdersCommand(program: Command): void {
  const orders = program
    .command('orders')
    .description('Order management (requires wallet + API key config)');

  orders
    .command('list')
    .description('List open orders for the configured wallet')
    .action(async () => {
      const clob = createClobClient(config, logger);
      const openOrders = await clob.getOpenOrders();
      process.stdout.write(`${JSON.stringify(openOrders, null, 2)}\n`);
    });

  orders
    .command('history')
    .description('Fetch trade history for the configured wallet')
    .action(async () => {
      const clob = createClobClient(config, logger);
      const trades = await clob.getTradeHistory();
      process.stdout.write(`${JSON.stringify(trades, null, 2)}\n`);
    });

  orders
    .command('derive-keys')
    .description('Derive L2 API keys from wallet signature (run once, save output)')
    .action(async () => {
      const clob = createClobClient(config, logger);
      const keys = await clob.deriveApiKeys();
      process.stdout.write(`${JSON.stringify(keys, null, 2)}\n`);
    });
}
