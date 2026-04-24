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
      const { data } = await http.get<Market>(`/markets/${slugOrConditionId}`);
      return data;
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
     * Returns raw Gamma API response; types are unverified and may vary by market.
     */
    async getMarketTraders(conditionId: string, limit = 50): Promise<unknown[]> {
      childLog.debug({ conditionId, limit }, 'Fetching market traders');
      const { data } = await http.get<unknown[]>(`/markets/${conditionId}/traders`, {
        params: { limit },
      });
      childLog.info({ conditionId, count: data.length }, 'Traders fetched');
      return data;
    },

    /** All open positions for a wallet address across all markets. */
    async getWalletPositions(walletAddress: string): Promise<unknown[]> {
      childLog.debug({ walletAddress }, 'Fetching wallet positions');
      const { data } = await http.get<unknown[]>('/positions', {
        params: { user: walletAddress },
      });
      childLog.info({ walletAddress, count: data.length }, 'Positions fetched');
      return data;
    },
  };
}
