/**
 * Represents a market supported by the API, or a "listing"
 */
export interface MarketInfo {
  id: string;
  symbol: string;
  base_decimals: number;
  quote_decimals: number;
  base_lot_size: string;
  quote_lot_size: string;
  base_token_id: string;
  quote_token_id: string;
  created_at: Date;
}
