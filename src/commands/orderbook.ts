import type { Command } from 'commander';
import { createClobClient } from '../api/clob.js';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';

export function registerOrderbookCommand(program: Command): void {
  program
    .command('orderbook <tokenId>')
    .description('Fetch live CLOB orderbook for a token ID')
    .action(async (tokenId: string) => {
      const clob = createClobClient(config, logger);
      const book = await clob.getOrderbook(tokenId);
      process.stdout.write(`${JSON.stringify(book, null, 2)}\n`);
    });
}
