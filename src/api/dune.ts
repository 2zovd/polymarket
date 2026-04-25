import axios, { type AxiosInstance } from 'axios';

// Dune Analytics API client — fetches saved query results.
// Docs: https://docs.dune.com/api-reference/executions/endpoint/get-query-results

export interface DuneQueryRow {
  [column: string]: unknown;
}

export interface DuneQueryResult {
  rows: DuneQueryRow[];
  metadata: {
    column_names: string[];
    row_count: number;
    result_set_bytes: number;
  };
}

export function createDuneClient(apiKey: string) {
  const http: AxiosInstance = axios.create({
    baseURL: 'https://api.dune.com/api/v1',
    timeout: 30_000,
    headers: {
      'x-dune-api-key': apiKey,
      Accept: 'application/json',
    },
  });

  return {
    /**
     * Fetch the latest cached results for a saved query.
     * Does not trigger a new execution — uses the last run's results.
     */
    async getQueryResults(queryId: number, limit = 500): Promise<DuneQueryResult> {
      const { data } = await http.get(`/query/${queryId}/results`, {
        params: { limit },
      });
      // Dune v3 wraps results under `result`
      return (data.result ?? data) as DuneQueryResult;
    },
  };
}

export type DuneClient = ReturnType<typeof createDuneClient>;

/**
 * Extract all Ethereum addresses from Dune query rows.
 * Scans every column for values matching 0x + 40 hex chars.
 */
export function extractAddresses(rows: DuneQueryRow[]): string[] {
  const seen = new Set<string>();
  const addressRe = /^0x[0-9a-fA-F]{40}$/;

  for (const row of rows) {
    for (const val of Object.values(row)) {
      if (typeof val === 'string' && addressRe.test(val)) {
        seen.add(val.toLowerCase());
      }
    }
  }

  return [...seen];
}
