import axios, { type AxiosInstance } from 'axios';
import type { Logger } from 'pino';
import type { AppConfig, Market } from '../types.js';

// Gamma API client — market metadata, resolution data, trader statistics.
// Unauthenticated for all read operations.
// Docs: https://docs.polymarket.com/developers/gamma-markets-api

export type GammaClient = ReturnType<typeof createGammaClient>;

// Raw trade shape returned by Gamma API /trades endpoint.
export interface GammaTrade {
  id: string;
  market: string;
  asset_id: string;
  side: 'BUY' | 'SELL';
  size: string;
  price: string;
  fee_rate_bps: string;
  status: string;
  match_time: string;
  outcome: string;
  maker_address: string;
  transaction_hash: string;
  taker_order_id: string;
  trader_side?: string;
}

// Shape returned by GET /markets/{conditionId}/traders.
// Exact field names vary by market; address is always present as some 0x-hex string value.
export interface GammaMarketTrader {
  proxy_wallet?: string;
  proxyWallet?: string;
  profit?: number;
  pnl?: number;
  volume?: number;
  [key: string]: unknown;
}

export function createGammaClient(config: AppConfig, log: Logger) {
  const http: AxiosInstance = axios.create({
    baseURL: config.gammaApiUrl,
    timeout: 15_000,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  const childLog = log.child({ module: 'gamma' });

  return {
    async getMarkets(params?: {
      limit?: number;
      offset?: number;
      active?: boolean;
      closed?: boolean;
      slug?: string;
      tag?: string;
      order?: string;
      ascending?: boolean;
    }): Promise<Market[]> {
      childLog.debug({ params }, 'Fetching markets');
      const { data } = await http.get<Market[]>('/markets', { params });
      childLog.info({ count: data.length }, 'Markets fetched');
      return data;
    },

    async getMarket(slugOrConditionId: string): Promise<Market> {
      childLog.debug({ slugOrConditionId }, 'Fetching market');
      // Both conditionIds (0x-prefixed hex) and slugs use the query-param form.
      // The path-param form (/markets/{id}) expects Gamma's internal numeric ID, not conditionId.
      const param = slugOrConditionId.startsWith('0x')
        ? { conditionId: slugOrConditionId }
        : { slug: slugOrConditionId };
      const { data } = await http.get<Market[]>('/markets', { params: param });
      const market = data[0];
      if (!market) throw new Error(`No market found for: ${slugOrConditionId}`);
      return market;
    },

    /**
     * Public trade history — no auth required.
     * Supports filtering by market, maker address, and pagination cursor.
     */
    async getTrades(params: {
      market?: string;
      maker?: string;
      limit?: number;
      offset?: number;
    }): Promise<GammaTrade[]> {
      const { data } = await http.get<GammaTrade[]>('/trades', { params });
      return data;
    },

    /**
     * Top traders for a market by profit — primary source for whale identification.
     * Field names vary by market; always contains at least one address-shaped string value.
     */
    async getMarketTraders(conditionId: string, limit = 50): Promise<GammaMarketTrader[]> {
      childLog.debug({ conditionId, limit }, 'Fetching market traders');
      const { data } = await http.get<GammaMarketTrader[]>(`/markets/${conditionId}/traders`, {
        params: { limit },
      });
      childLog.info({ conditionId, count: data.length }, 'Traders fetched');
      return data;
    },

  };
}
