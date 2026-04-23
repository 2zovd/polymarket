import type { Command } from 'commander';
import { createGammaClient } from '../api/gamma.js';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';

export function registerMarketsCommand(program: Command): void {
  const markets = program.command('markets').description('Market inspection tools');

  markets
    .command('list')
    .description('List markets from Gamma API')
    .option('-l, --limit <number>', 'Number of markets to return', '20')
    .option('--closed', 'Include closed markets', false)
    .option('--tag <tag>', 'Filter by category tag')
    .action(async (opts: { limit: string; closed: boolean; tag?: string }) => {
      const gamma = createGammaClient(config, logger);
      const results = await gamma.getMarkets({
        limit: Number.parseInt(opts.limit, 10),
        active: !opts.closed,
        closed: opts.closed,
        ...(opts.tag !== undefined && { tag: opts.tag }),
      });
      process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    });

  markets
    .command('get <slugOrConditionId>')
    .description('Get a single market by slug or condition ID')
    .action(async (slugOrConditionId: string) => {
      const gamma = createGammaClient(config, logger);
      const market = await gamma.getMarket(slugOrConditionId);
      process.stdout.write(`${JSON.stringify(market, null, 2)}\n`);
    });

  markets
    .command('traders <conditionId>')
    .description('Get top traders for a market (whale tracking)')
    .option('-l, --limit <number>', 'Number of traders', '50')
    .action(async (conditionId: string, opts: { limit: string }) => {
      const gamma = createGammaClient(config, logger);
      const traders = await gamma.getMarketTraders(conditionId, Number.parseInt(opts.limit, 10));
      process.stdout.write(`${JSON.stringify(traders, null, 2)}\n`);
    });
}
