import axios, { type AxiosInstance } from 'axios';
import type { Logger } from 'pino';
import type { AppConfig } from '../types.js';

// Polymarket Data API client — public trade stream and per-wallet activity.
// No authentication required. Base: https://data-api.polymarket.com

export type DataApiClient = ReturnType<typeof createDataApiClient>;

export interface DataApiTrade {
  proxyWallet: string;
  side: 'BUY' | 'SELL';
  asset: string;
  conditionId: string;
  size: number;
  price: number;
  timestamp: number;
  outcome: string;
  outcomeIndex: number;
  transactionHash: string;
  title: string;
  slug: string;
  eventSlug: string;
}

export interface DataApiActivity extends DataApiTrade {
  type: string;
  usdcSize: number;
}

export function createDataApiClient(config: AppConfig, log: Logger) {
  const http: AxiosInstance = axios.create({
    baseURL: config.dataApiUrl,
    timeout: 15_000,
    headers: { Accept: 'application/json' },
  });

  const childLog = log.child({ module: 'data-api' });

  return {
    /**
     * Global public trade stream — newest first, paginated by offset.
     * No server-side timestamp filter; stop iteration when trades are older than sinceTimestamp.
     */
    async getRecentTrades(sinceTimestamp: number, maxRecords = 10_000): Promise<DataApiTrade[]> {
      const PAGE = 500;
      const collected: DataApiTrade[] = [];
      let offset = 0;

      childLog.info(
        { since: new Date(sinceTimestamp * 1000).toISOString(), maxRecords },
        'Fetching recent trades',
      );

      // Data API hard-caps at offset=3000 — max 3000 records per call chain.
      const MAX_OFFSET = 3000;

      while (collected.length < maxRecords && offset <= MAX_OFFSET) {
        const { data } = await http.get<DataApiTrade[]>('/trades', {
          params: { limit: PAGE, offset },
        });

        if (data.length === 0) break;

        // Stop as soon as we reach records older than our cursor.
        const newRecords = data.filter((t) => t.timestamp > sinceTimestamp);
        collected.push(...newRecords);

        if (newRecords.length < data.length) break; // hit the cursor boundary
        if (data.length < PAGE) break;
        offset += PAGE;
      }

      childLog.info({ fetched: collected.length }, 'Recent trades fetch complete');
      return collected;
    },

    /**
     * Full trade + position activity for a specific wallet address, paginated.
     * Fetches all pages up to maxRecords.
     */
    async getWalletActivity(walletAddress: string, maxRecords = 3000): Promise<DataApiActivity[]> {
      const PAGE = 500;
      // Data API hard-caps at offset=3000 — same limit as the trades endpoint.
      const MAX_OFFSET = 3000;
      const collected: DataApiActivity[] = [];
      let offset = 0;

      while (collected.length < maxRecords && offset <= MAX_OFFSET) {
        const { data } = await http.get<DataApiActivity[]>('/activity', {
          params: { user: walletAddress, limit: PAGE, offset },
        });
        if (data.length === 0) break;
        collected.push(...data);
        if (data.length < PAGE) break;
        offset += PAGE;
      }

      return collected;
    },
  };
}
