import type { Command } from 'commander';
import { createGammaClient } from '../api/gamma.js';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';

export function registerWalletCommand(program: Command): void {
  const wallet = program.command('wallet').description('Wallet and position inspection tools');

  wallet
    .command('positions <address>')
    .description('Get all open positions for a wallet address')
    .action(async (address: string) => {
      const gamma = createGammaClient(config, logger);
      const positions = await gamma.getWalletPositions(address);
      process.stdout.write(`${JSON.stringify(positions, null, 2)}\n`);
    });
}
