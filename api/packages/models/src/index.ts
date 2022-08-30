// currently manually managed based on migrations
export * from './events';

export interface Market {
  id: string;
  symbol: string;
  base_decimals: number;
  base_lot_size: number;
  base_token_id: string;

  quote_decimals: number;
  quote_lot_size: number;
  quote_token_id: string;

  created_at: string;

  visible?: boolean;
}
