export interface TradeRanking {
  overall_rank: number;
  account_id: string;
  market_id: MarketId;
  market_volume: string;
  /**
   * Total volume before multiplier
   */
  total_volume: string;
  /**
   * Volume after multiplier due to NFT
   */
  after_multiplier: number;
  /**
   * Number of eligible NFTs held
   */
  n_held: number;
  /**
   * Multiplier due to holding NFTs (1 if none held)
   */
  multiplier: number;
}

/**
 * It's easiest to just do this...
 */
export const MARKETS = {
  J5mggeEGCyXVUibvYTe9ydVBrELECRUu23VRk2TwC2is: 'USN/USDC',
  '2UmzUXYpaZg4vXfFVmD7r8mYUYkKEF19xpjLw7ygDUwp': 'NEAR/USDC',
  '7Ub1tFH9hUTcS3F4PbU7PPVmXx4u11nQnBPCF3tqJgkV': 'AURORA/USDC',
} as const;
export type MarketId = keyof typeof MARKETS;
export type MarketName = typeof MARKETS[MarketId];

export interface MarketStats {
  market_id: MarketId;
  volume: number;
}

export interface TraderStats {
  overall_rank: number;
  account_id: string;
  total_volume: number;
  after_multiplier: number;
  n_held: number;
  multiplier: number;
  stats: Record<MarketName, MarketStats>;
}

/**
 * Assumes they're received ordered by total volume
 */
export function toMarketStats(ranking: TradeRanking): MarketStats {
  return {
    market_id: ranking.market_id,
    volume: parseFloat(ranking.market_volume),
  };
}

/**
 * The SQL query for rankings returns multiple rows per user (one row per market
 * they participate in). This groups them into a single object for ease of use
 * on the frontend.
 */
export function groupRankings(rankings: TradeRanking[]): TraderStats[] {
  return rankings.reduce((acc, curr) => {
    const marketStats = toMarketStats(curr);
    if (!acc.length || acc[acc.length - 1].account_id != curr.account_id) {
      acc.push({
        overall_rank: parseInt(curr.overall_rank as unknown as string),
        account_id: curr.account_id,
        total_volume: parseFloat(curr.total_volume),
        after_multiplier: curr.after_multiplier,
        multiplier: curr.multiplier,
        n_held: curr.n_held,
        stats: {},
      } as TraderStats);
    }
    acc[acc.length - 1].stats[MARKETS[curr.market_id]] = marketStats;
    return acc;
  }, [] as TraderStats[]);
}
