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

  markets
    .command('tokens <slug>')
    .description('Show CLOB token IDs for each outcome — use the market slug from the Polymarket URL')
    .action(async (slug: string) => {
      const gamma = createGammaClient(config, logger);
      const market = await gamma.getMarket(slug);

      const outcomes: string[] = market.outcomes ? JSON.parse(market.outcomes) : [];
      const tokenIds: string[] = market.clobTokenIds ? JSON.parse(market.clobTokenIds) : [];
      const prices: string[] = market.outcomePrices ? JSON.parse(market.outcomePrices) : [];
      const tokens = market.tokens ?? [];

      process.stdout.write(`\n${market.question}\n${'─'.repeat(60)}\n`);

      if (tokenIds.length > 0) {
        tokenIds.forEach((id, i) => {
          const outcome = outcomes[i] ?? tokens[i]?.outcome ?? `Outcome ${i}`;
          const price = prices[i] ?? tokens[i]?.price ?? '?';
          process.stdout.write(`\n[${outcome}]\n  token_id : ${id}\n  price    : ${price}\n`);
        });
      } else if (tokens.length > 0) {
        tokens.forEach((t) => {
          process.stdout.write(`\n[${t.outcome}]\n  token_id : ${t.tokenId}\n  price    : ${t.price}\n`);
        });
      } else {
        process.stdout.write('No token IDs found — market may be categorical or use a different schema.\n');
        process.stdout.write(`Raw clobTokenIds: ${market.clobTokenIds ?? 'null'}\n`);
      }

      process.stdout.write(`\ncondition_id : ${market.conditionId}\n`);
      process.stdout.write(`status       : ${market.active ? 'active' : market.closed ? 'closed' : 'resolved'}\n\n`);
    });
}
