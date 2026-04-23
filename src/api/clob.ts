import { type ApiKeyCreds, Chain, ClobClient } from '@polymarket/clob-client';
import { Side as ClobSide } from '@polymarket/clob-client';
import type { Logger } from 'pino';
import { http, createWalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon, polygonAmoy } from 'viem/chains';
import type { AppConfig } from '../types.js';

// Wrapper around @polymarket/clob-client.
//
// Auth flow:
// 1. L1 auth: wallet signs a message to prove ownership → derives L2 API keys
// 2. L2 auth: API key/secret/passphrase used for order operations
//
// For read-only operations (orderbook, market data) no credentials needed.
// For order operations you must call initApiKeys() first OR inject creds via env.

export interface ClobApiKeys {
  key: string;
  secret: string;
  passphrase: string;
}

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

  // Read-only client — no credentials. Used for market data and orderbook.
  const readonlyClient = new ClobClient(config.clobApiUrl, clobChain);

  const childLog = log.child({ module: 'clob' });

  // Authenticated client — lazily created when order operations are needed.
  let authedClient: ClobClient | null = null;

  function getAuthedClient(creds?: ApiKeyCreds): ClobClient {
    if (authedClient) return authedClient;
    authedClient = new ClobClient(config.clobApiUrl, clobChain, walletClient, creds);
    return authedClient;
  }

  return {
    // ─── Read-only (no auth) ────────────────────────────────────────────

    async getOrderbook(tokenId: string) {
      childLog.debug({ tokenId }, 'Fetching orderbook');
      const book = await readonlyClient.getOrderBook(tokenId);
      childLog.debug(
        { tokenId, bids: book.bids.length, asks: book.asks.length },
        'Orderbook fetched',
      );
      return book;
    },

    // ─── Authenticated ──────────────────────────────────────────────────

    /** Derives L2 API keys from the wallet signature. Call once and store the result. */
    async deriveApiKeys(creds?: ApiKeyCreds): Promise<ApiKeyCreds> {
      childLog.info('Deriving L2 API keys from wallet');
      const client = getAuthedClient(creds);
      const derived = await client.createOrDeriveApiKey();
      childLog.info({ key: derived.key }, 'API keys derived');
      return derived;
    },

    async getOpenOrders(creds?: ApiKeyCreds) {
      const client = getAuthedClient(creds);
      childLog.debug('Fetching open orders');
      const orders = await client.getOpenOrders();
      childLog.info({ count: orders.length }, 'Open orders fetched');
      return orders;
    },

    async getTradeHistory(creds?: ApiKeyCreds) {
      const client = getAuthedClient(creds);
      childLog.debug('Fetching trade history');
      const trades = await client.getTrades();
      childLog.info({ count: trades.length }, 'Trade history fetched');
      return trades;
    },

    /**
     * Place a GTC limit order.
     *
     * Guards: DRY_RUN and MAX_ORDER_SIZE_USDC are checked independently.
     * In dry-run mode: logs the intent and returns without submitting.
     */
    async placeLimitOrder(
      params: { tokenId: string; side: 'BUY' | 'SELL'; price: number; size: number },
      creds?: ApiKeyCreds,
    ): Promise<{ orderId: string; dryRun: boolean }> {
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

      const client = getAuthedClient(creds);
      const result = await client.createAndPostOrder({
        tokenID: params.tokenId,
        side: params.side === 'BUY' ? ClobSide.BUY : ClobSide.SELL,
        price: params.price,
        size: params.size,
      });

      const orderId = (result as { orderID?: string }).orderID ?? 'unknown';
      childLog.info({ orderId }, 'Order placed');
      return { orderId, dryRun: false };
    },

    async cancelOrder(orderId: string, creds?: ApiKeyCreds): Promise<void> {
      if (config.dryRun) {
        childLog.warn({ orderId }, 'DRY_RUN=true — cancel NOT submitted');
        return;
      }
      const client = getAuthedClient(creds);
      await client.cancelOrder({ orderID: orderId });
      childLog.info({ orderId }, 'Order cancelled');
    },
  };
}
