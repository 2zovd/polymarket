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

  orders
    .command('cancel <orderId>')
    .description('Cancel an open order by ID')
    .action(async (orderId: string) => {
      const clob = createClobClient(config, logger);
      await clob.cancelOrder(orderId);
      process.stdout.write(`Order cancelled: ${orderId}\n`);
    });

  orders
    .command('test-buy')
    .description('Place a single GTC limit buy order to verify CLOB order placement (bypasses signal logic)')
    .requiredOption('--token-id <tokenId>', 'CLOB token ID (from Polymarket market page)')
    .requiredOption('--price <price>', 'Limit price (0.01–0.99)', parseFloat)
    .option('--size <usdc>', 'Order size in USDC (default: 5, CLOB minimum is 5)', parseFloat, 5)
    .action(async (opts: { tokenId: string; price: number; size: number }) => {
      if (opts.price <= 0 || opts.price >= 1) {
        process.stderr.write('Error: --price must be between 0.01 and 0.99\n');
        process.exit(1);
      }
      if (opts.size > config.maxOrderSizeUsdc) {
        process.stderr.write(`Error: --size ${opts.size} exceeds MAX_ORDER_SIZE_USDC=${config.maxOrderSizeUsdc}\n`);
        process.exit(1);
      }

      const clob = createClobClient(config, logger);

      process.stdout.write(`\nPlacing test BUY order:\n`);
      process.stdout.write(`  token_id : ${opts.tokenId}\n`);
      process.stdout.write(`  price    : ${opts.price}\n`);
      process.stdout.write(`  size     : ${opts.size} USDC\n`);
      process.stdout.write(`  dry_run  : ${config.dryRun}\n\n`);

      const { orderId, dryRun } = await clob.placeLimitOrder({
        conditionId: '',
        tokenId: opts.tokenId,
        side: 'BUY',
        price: opts.price,
        size: opts.size,
      });

      process.stdout.write(dryRun
        ? `DRY-RUN — order not submitted (DRY_RUN=true)\n`
        : `Order placed: ${orderId}\n`);
    });
}
