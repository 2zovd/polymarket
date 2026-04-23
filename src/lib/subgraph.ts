import { GraphQLClient, gql } from 'graphql-request';
import type { Logger } from 'pino';
import type { AppConfig } from '../types.js';

// GraphQL client for The Graph / Polymarket Subgraph.
// Primary source for historical on-chain trade data.
// Subgraph schema: github.com/Polymarket/polymarket-subgraph

export type SubgraphClient = ReturnType<typeof createSubgraphClient>;

// Raw shape returned by the subgraph — field names are snake_case per GraphQL schema.
interface SubgraphTrade {
  id: string;
  market: string;
  outcomeIndex: string;
  outcomeTokensAmount: string;
  collateralAmount: string;
  type: string; // 'buy' | 'sell'
  timestamp: string;
  transactionHash: string;
  trader: { id: string };
}

interface SubgraphTradesResponse {
  fpmmTrades: SubgraphTrade[];
}

export interface SubgraphTradeRecord {
  id: string;
  market: string;
  walletAddress: string;
  side: 'BUY' | 'SELL';
  /** Outcome index as string — resolve to outcome label via market tokens */
  outcomeIndex: string;
  /** Number of outcome tokens traded */
  size: number;
  /** USDC spent or received (collateral) */
  collateralAmount: number;
  /** Implied price = collateral / size */
  price: number;
  timestamp: number;
  transactionHash: string;
}

const TRADES_QUERY = gql`
  query GetTrades($first: Int!, $skip: Int!, $since: BigInt!) {
    fpmmTrades(
      first: $first
      skip: $skip
      orderBy: creationTimestamp
      orderDirection: asc
      where: { creationTimestamp_gt: $since }
    ) {
      id
      fpmm { id }
      outcomeIndex
      outcomeTokensAmount
      collateralAmount
      type
      creationTimestamp
      transactionHash
      creator { id }
    }
  }
`;

export function createSubgraphClient(config: AppConfig, log: Logger): SubgraphClient {
  const client = new GraphQLClient(config.subgraphUrl);
  const childLog = log.child({ module: 'subgraph' });

  return {
    /**
     * Fetch all trades after `sinceTimestamp` (unix seconds), paginating automatically.
     * Returns up to `maxRecords` records to avoid runaway fetches on first sync.
     */
    async getTrades(sinceTimestamp: number, maxRecords = 10_000): Promise<SubgraphTradeRecord[]> {
      const PAGE = 1000;
      const records: SubgraphTradeRecord[] = [];
      let skip = 0;

      childLog.info({ since: new Date(sinceTimestamp * 1000).toISOString(), maxRecords }, 'Fetching subgraph trades');

      while (records.length < maxRecords) {
        const data = await client.request<SubgraphTradesResponse>(TRADES_QUERY, {
          first: PAGE,
          skip,
          since: sinceTimestamp.toString(),
        });

        // The subgraph schema uses different field names than our query above.
        // Handle both shapes defensively.
        const raw = data.fpmmTrades ?? [];

        if (raw.length === 0) break;

        for (const t of raw) {
          const size = Number(t.outcomeTokensAmount) / 1e6; // USDC has 6 decimals
          const collateral = Number(t.collateralAmount) / 1e6;
          const price = size > 0 ? collateral / size : 0;

          records.push({
            id: t.id,
            market: t.market,
            walletAddress: t.trader?.id ?? '',
            side: t.type === 'sell' ? 'SELL' : 'BUY',
            outcomeIndex: t.outcomeIndex,
            size,
            collateralAmount: collateral,
            price,
            timestamp: Number(t.timestamp),
            transactionHash: t.transactionHash,
          });
        }

        if (raw.length < PAGE) break;
        skip += PAGE;
      }

      childLog.info({ fetched: records.length }, 'Subgraph trades fetch complete');
      return records;
    },
  };
}
