import { readFileSync } from 'node:fs';
import type { Command } from 'commander';
import { desc, eq, or } from 'drizzle-orm';
import { createDataApiClient } from '../api/data.js';
import { createDuneClient, extractAddresses } from '../api/dune.js';
import { createGammaClient } from '../api/gamma.js';
import { collectResolvedMarkets } from '../collectors/markets.js';
import { collectWalletStats, seedWallets } from '../collectors/wallets.js';
import { createDb } from '../db/index.js';
import { walletStats } from '../db/schema.js';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';

function print(s = ''): void {
  process.stdout.write(`${s}\n`);
}

export function registerWhalesCommand(program: Command): void {
  const whales = program.command('whales').description('Whale detection and wallet scoring');

  whales
    .command('scan')
    .description('Score wallet activity and update whale stats (fetches resolved markets first)')
    .action(async () => {
      const gamma = createGammaClient(config, logger);
      const dataApi = createDataApiClient(config, logger);
      const db = createDb(config.databasePath);

      logger.info('Fetching resolved markets for outcome data...');
      await collectResolvedMarkets(gamma, db, logger);

      logger.info('Scoring wallet activity...');
      await collectWalletStats(dataApi, db, logger);
    });

  whales
    .command('discover')
    .description('Fetch top profitable wallets from Dune Analytics and seed into DB')
    .option(
      '--query <id>',
      'Dune query ID to fetch (default: 6979866 — top profitable wallets)',
      '6979866',
    )
    .option('--limit <n>', 'Max rows to fetch from Dune', '500')
    .action(async (opts: { query: string; limit: string }) => {
      if (!config.duneApiKey) {
        print('DUNE_API_KEY not set. Add it to ~/.polymarket-secrets and restart.');
        return;
      }

      const queryId = Number.parseInt(opts.query, 10);
      const limit = Number.parseInt(opts.limit, 10);

      print(`Fetching Dune query ${queryId} (limit: ${limit})...`);
      const dune = createDuneClient(config.duneApiKey);

      let result: Awaited<ReturnType<typeof dune.getQueryResults>>;
      try {
        result = await dune.getQueryResults(queryId, limit);
      } catch (err) {
        logger.error({ err }, 'Dune API request failed');
        print('Failed to fetch from Dune. Check your DUNE_API_KEY and query ID.');
        return;
      }

      const addresses = extractAddresses(result.rows);
      if (addresses.length === 0) {
        print(`No Ethereum addresses found in query ${queryId} results.`);
        print(`Columns available: ${result.metadata?.column_names?.join(', ') ?? 'unknown'}`);
        return;
      }

      print(`Found ${addresses.length} unique addresses from ${result.rows.length} rows`);
      print('Scoring against resolved markets...');

      const dataApi = createDataApiClient(config, logger);
      const db = createDb(config.databasePath);
      await seedWallets(addresses, dataApi, db, logger);

      print('Done. Run: pnpm dev whales top --profitable');
    });

  whales
    .command('top')
    .description('Show top wallets by ROI')
    .option('-n, --limit <n>', 'Number of wallets to show', '20')
    .option('--all', 'Show all scored wallets regardless of flags')
    .option('--profitable', 'Show isProfitable wallets (p<0.05 AND roi>0, ignores Brier)')
    .action(async (opts: { limit: string; all?: boolean; profitable?: boolean }) => {
      const db = createDb(config.databasePath);
      const limit = Number.parseInt(opts.limit, 10);

      const where = opts.all
        ? undefined
        : opts.profitable
          ? eq(walletStats.isProfitable, true)
          : or(eq(walletStats.isSharp, true), eq(walletStats.isProfitable, true));

      const rows = await db
        .select()
        .from(walletStats)
        .where(where)
        .orderBy(desc(walletStats.roi))
        .limit(limit)
        .all();

      if (rows.length === 0) {
        print(
          opts.all
            ? 'No wallets scored yet. Run: pnpm dev whales scan'
            : 'No flagged wallets yet. Run: pnpm dev whales scan',
        );
        return;
      }

      print(
        `\n${'Wallet'.padEnd(44)} ${'ROI'.padStart(7)} ${'WinRate'.padStart(8)} ${'Brier'.padStart(6)} ${'p-val'.padStart(7)} ${'Trades'.padStart(6)} ${'Sharp'.padStart(6)} ${'Prof'.padStart(5)}`,
      );
      print('─'.repeat(97));

      for (const r of rows) {
        const roi = r.roi !== null ? `${(r.roi * 100).toFixed(1)}%` : 'n/a';
        const wr = r.winRate !== null ? `${(r.winRate * 100).toFixed(1)}%` : 'n/a';
        const brier = r.brierScore !== null ? r.brierScore.toFixed(3) : 'n/a';
        const pval = r.pValue !== null ? r.pValue.toFixed(3) : 'n/a';
        const sharp = r.isSharp ? '  ✓' : '  -';
        const prof = r.isProfitable ? '  ✓' : '  -';
        print(
          `${r.walletAddress.padEnd(44)} ${roi.padStart(7)} ${wr.padStart(8)} ${brier.padStart(6)} ${pval.padStart(7)} ${String(r.resolvedTrades).padStart(6)} ${sharp.padStart(6)} ${prof.padStart(5)}`,
        );
      }

      const sharpCount = rows.filter((r) => r.isSharp).length;
      const profCount = rows.filter((r) => r.isProfitable).length;
      print(`\n${rows.length} wallets shown — sharp: ${sharpCount}, profitable: ${profCount}`);
    });

  whales
    .command('seed <file>')
    .description('Score wallets from a CSV/TXT file of addresses (e.g. Dune Analytics export)')
    .action(async (file: string) => {
      const content = readFileSync(file, 'utf8');
      // Extract all Ethereum addresses from file regardless of CSV structure
      const addresses = [...new Set(content.match(/0x[0-9a-fA-F]{40}/gi) ?? [])].map((a) =>
        a.toLowerCase(),
      );

      if (addresses.length === 0) {
        print('No Ethereum addresses found in file.');
        return;
      }

      print(`Found ${addresses.length} unique addresses — fetching activity and scoring...`);
      const dataApi = createDataApiClient(config, logger);
      const db = createDb(config.databasePath);

      await seedWallets(addresses, dataApi, db, logger);
      print('Done. Run: pnpm dev whales top --profitable');
    });

  whales
    .command('show <address>')
    .description('Show full stats for a specific wallet address')
    .action(async (address: string) => {
      const db = createDb(config.databasePath);
      const row = await db
        .select()
        .from(walletStats)
        .where(eq(walletStats.walletAddress, address.toLowerCase()))
        .get();

      if (!row) {
        print(`No data for ${address}. Run: pnpm dev whales scan`);
        return;
      }

      print(`\nWallet: ${row.walletAddress}`);
      print(`Total trades:    ${row.totalTrades}`);
      print(`Resolved trades: ${row.resolvedTrades}`);
      print(
        `Win rate:        ${row.winRate !== null ? `${(row.winRate * 100).toFixed(1)}%` : 'n/a'}`,
      );
      print(`ROI:             ${row.roi !== null ? `${(row.roi * 100).toFixed(1)}%` : 'n/a'}`);
      print(`Brier score:     ${row.brierScore !== null ? row.brierScore.toFixed(4) : 'n/a'}`);
      print(`p-value:         ${row.pValue !== null ? row.pValue.toFixed(4) : 'n/a'}`);
      print(`Sharp:           ${row.isSharp ? 'YES' : 'no'}`);
      print(`Profitable:      ${row.isProfitable ? 'YES' : 'no'}`);
      print(`Last scored:     ${row.updatedAt}`);
    });
}
