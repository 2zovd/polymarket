import {
  type ApiKeyCreds,
  ApiError,
  Chain,
  ClobClient,
  OrderType,
  Side,
  SignatureTypeV2,
} from '@polymarket/clob-client-v2';
import type { Logger } from 'pino';
import { http, createWalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon, polygonAmoy } from 'viem/chains';
import type { AppConfig } from '../types.js';

// Wrapper around @polymarket/clob-client-v2.
//
// Auth flow:
// 1. L1 auth: wallet signs → derives L2 API keys (run once via `orders derive-keys`)
// 2. L2 auth: CLOB_API_KEY / SECRET / PASSPHRASE for all order operations
//
// Read-only ops (orderbook, market data) require no credentials.
// Order ops require clobCreds in config — fail fast if missing.

export type ClobClientWrapper = ReturnType<typeof createClobClient>;

export function createClobClient(config: AppConfig, log: Logger) {
  const account = privateKeyToAccount(config.privateKey);
  const chain = config.chainId === 137 ? polygon : polygonAmoy;
  const clobChain = config.chainId === 137 ? Chain.POLYGON : Chain.AMOY;

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(config.polygonRpcUrl),
  });

  const apiCreds: ApiKeyCreds | undefined = config.clobCreds
    ? {
        key: config.clobCreds.key,
        secret: config.clobCreds.secret,
        passphrase: config.clobCreds.passphrase,
      }
    : undefined;

  // V2: proxy wallet via SignatureTypeV2.POLY_PROXY + funderAddress
  const sigType = config.polymarketProxyAddress
    ? SignatureTypeV2.POLY_PROXY
    : SignatureTypeV2.EOA;

  // Read-only client — no credentials needed for orderbook / market data.
  const readonlyClient = new ClobClient({
    host: config.clobApiUrl,
    chain: clobChain,
    signer: walletClient,
    throwOnError: true,
  });

  // Authed client. throwOnError: true so API errors throw ApiError instead of
  // returning { success: false } — makes error handling explicit.
  // exactOptionalPropertyTypes: creds/funderAddress only included when defined.
  const authedClient = new ClobClient({
    host: config.clobApiUrl,
    chain: clobChain,
    signer: walletClient,
    ...(apiCreds ? { creds: apiCreds } : {}),
    signatureType: sigType,
    ...(config.polymarketProxyAddress ? { funderAddress: config.polymarketProxyAddress } : {}),
    throwOnError: true,
  });

  const childLog = log.child({ module: 'clob' });

  function requireCreds(): void {
    if (!config.clobCreds) {
      throw new Error(
        'CLOB L2 credentials not set. Run `pnpm dev orders derive-keys` once and add the output to ~/.polymarket-secrets.',
      );
    }
  }

  return {
    // ─── Read-only ──────────────────────────────────────────────────────

    /**
     * All trades for a market — L2 auth required (CLOB enforces this even for public data).
     * Paginates automatically; returns up to maxRecords trades.
     */
    async getMarketTrades(conditionId: string, afterCursor?: string, maxRecords = 5_000) {
      requireCreds();
      childLog.debug({ conditionId }, 'Fetching market trades');
      const all: Awaited<ReturnType<typeof authedClient.getTrades>> = [];
      let cursor = afterCursor;

      while (all.length < maxRecords) {
        const { trades: page, next_cursor } = await authedClient.getTradesPaginated(
          { market: conditionId },
          cursor,
        );
        all.push(...page);
        if (!next_cursor || next_cursor === 'LTE=') break;
        cursor = next_cursor;
      }

      childLog.debug({ conditionId, fetched: all.length }, 'Market trades fetched');
      return all;
    },

    async getOrderbook(tokenId: string) {
      childLog.debug({ tokenId }, 'Fetching orderbook');
      const book = await readonlyClient.getOrderBook(tokenId);
      childLog.debug(
        { tokenId, bids: book.bids.length, asks: book.asks.length },
        'Orderbook fetched',
      );
      return book;
    },

    // ─── L1 key derivation (no L2 creds needed, uses wallet signature) ─

    async deriveApiKeys(): Promise<ApiKeyCreds> {
      childLog.info('Deriving L2 API keys from wallet signature');
      // V2: createOrDeriveApiKey() removed — use deriveApiKey() directly
      const derived = await authedClient.deriveApiKey();
      childLog.info(
        { key: derived.key },
        'L2 API keys derived — save these to ~/.polymarket-secrets',
      );
      return derived;
    },

    // ─── Authenticated (require L2 creds) ──────────────────────────────

    async getOpenOrders() {
      requireCreds();
      childLog.debug('Fetching open orders');
      const response = await authedClient.getOpenOrders();
      // V2 returns OpenOrdersResponse object; extract array from .data if present
      const orders = Array.isArray(response) ? response : ((response as { data?: unknown[] }).data ?? response);
      childLog.info({ count: Array.isArray(orders) ? orders.length : '?' }, 'Open orders fetched');
      return orders;
    },

    async getTradeHistory() {
      requireCreds();
      childLog.debug('Fetching trade history');
      const trades = await authedClient.getTrades();
      childLog.info({ count: trades.length }, 'Trade history fetched');
      return trades;
    },

    async getBalanceAllowance() {
      requireCreds();
      return authedClient.getBalanceAllowance();
    },

    /**
     * Place a GTC limit order.
     * DRY_RUN and MAX_ORDER_SIZE_USDC are checked independently — both guards active.
     *
     * V2 requires tick size at order creation time (passed to createAndPostOrder).
     * Fetched live from CLOB via getTickSize(tokenId) — lightweight GET, no auth needed.
     */
    async placeLimitOrder(params: {
      conditionId: string;
      tokenId: string;
      side: 'BUY' | 'SELL';
      price: number;
      size: number;
    }): Promise<{ orderId: string; dryRun: boolean }> {
      requireCreds();
      childLog.info({ ...params, dryRun: config.dryRun }, 'Placing limit order');

      if (config.dryRun) {
        childLog.warn({ params }, 'DRY_RUN=true — order NOT submitted');
        return { orderId: 'dry-run-noop', dryRun: true };
      }

      if (params.size > config.maxOrderSizeUsdc) {
        throw new Error(
          `Order size ${params.size} USDC exceeds MAX_ORDER_SIZE_USDC=${config.maxOrderSizeUsdc}`,
        );
      }

      // getTickSize returns TickSize ("0.1" | "0.01" | "0.001" | "0.0001") — pass directly
      const tickSize = await readonlyClient.getTickSize(params.tokenId);

      try {
        const result = (await authedClient.createAndPostOrder(
          {
            tokenID: params.tokenId,
            side: params.side === 'BUY' ? Side.BUY : Side.SELL,
            price: params.price,
            size: params.size,
          },
          { tickSize },
          OrderType.GTC,
        )) as { orderID?: string; status?: string };

        if (!result.orderID) {
          throw new Error(`CLOB returned no orderID (status=${result.status ?? 'unknown'})`);
        }

        childLog.info({ orderId: result.orderID, status: result.status }, 'Order placed');
        return { orderId: result.orderID, dryRun: false };
      } catch (err) {
        if (err instanceof ApiError) {
          throw new Error(`CLOB rejected order [${err.status}]: ${err.message}`);
        }
        throw err;
      }
    },

    async cancelOrder(orderId: string): Promise<void> {
      requireCreds();
      if (config.dryRun) {
        childLog.warn({ orderId }, 'DRY_RUN=true — cancel NOT submitted');
        return;
      }
      await authedClient.cancelOrder({ orderID: orderId });
      childLog.info({ orderId }, 'Order cancelled');
    },
  };
}
